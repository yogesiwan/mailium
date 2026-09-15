const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { sendTestEmail } = require('../services/emailService');
const configService = require('../services/configService');
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per `window` (here, per 15 minutes)
  message: { success: false, error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
// Helper to generate JWT
const generateToken = (id) => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @route   POST /api/auth/signup
// @desc    Register a new user
// @access  Public
router.post('/signup', authLimiter, async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Please provide all fields' });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, error: 'Email already exists' });
    }

    const maxUsersLimit = await configService.getConfig('MAX_USERS_LIMIT', 5);
    const userCount = await User.countDocuments();
    
    if (userCount >= maxUsersLimit) {
      return res.status(403).json({ success: false, error: 'App has max users limit reached try someday else.' });
    }

    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
    const isAdmin = adminEmails.includes(email.toLowerCase());
    const status = isAdmin ? 'active' : 'pending_admin_approval';

    const user = await User.create({ name, email, password, status, isAdmin });
    
    if (!isAdmin) {
      try {
        const adminUsers = await User.find({ isAdmin: true });
        for (const adminUser of adminUsers) {
          const approveToken = jwt.sign({ approveUserId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
          const approveLink = `${process.env.TRACKING_BASE_URL || 'http://localhost:5000'}/api/auth/admin/approve?token=${approveToken}`;
          await sendTestEmail(
            adminUser.email,
            'New User Registration Request',
            `<p>A new user has registered and is awaiting your approval.</p>
             <ul>
               <li><strong>Name:</strong> ${user.name}</li>
               <li><strong>Email:</strong> ${user.email}</li>
             </ul>
             <p><a href="${approveLink}" style="display:inline-block;padding:10px 20px;background-color:#4F46E5;color:white;text-decoration:none;border-radius:5px;">Allow User</a></p>`,
            'Mailium System',
            'system@mailium.app',
            adminUser._id
          );
        }
      } catch (e) {
        console.error('Failed to send admin approval email:', e);
      }
      
      return res.status(201).json({
        success: true,
        pending: true,
        message: 'Your request is in consideration, please wait until admin confirms.'
      });
    }

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin
      }
    });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Please provide an email and password' });
    }

    // Include password field for comparison
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    if (user.status === 'pending_admin_approval') {
      return res.status(403).json({ success: false, error: 'Your request is in consideration, please wait until admin confirms.' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin
      }
    });
  } catch (err) {
    next(err);
  }
});

// @route   GET /api/auth/me
// @desc    Get current logged in user
// @access  Private
router.get('/me', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

// @route   GET /api/auth/admin/approve
// @desc    Approve a pending user
// @access  Public (Secured by JWT token)
router.get('/admin/approve', async (req, res, next) => {
  try {
    const token = req.query.token;
    if (!token) {
      return res.status(401).send('Missing approval token.');
    }

    let decoded;
    try {
      if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).send('Invalid or expired approval token.');
    }

    const user = await User.findById(decoded.approveUserId);
    if (!user) {
      return res.status(404).send('User not found.');
    }
    
    if (user.status === 'active') {
      return res.send('User is already active.');
    }

    const activeUsersCount = await User.countDocuments({ status: 'active' });
    const maxUsers = await configService.getConfig('MAX_USERS_LIMIT', 5);
    
    if (activeUsersCount >= maxUsers) {
      return res.status(403).send(`Cannot approve. Maximum active user limit (${maxUsers}) reached.`);
    }
    
    user.status = 'active';
    await user.save();
    
    res.send(`
      <html>
        <head><title>User Approved</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: #10B981;">User Approved Successfully!</h2>
          <p>The user <strong>${user.email}</strong> has been granted access to Mailium.</p>
        </body>
      </html>
    `);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
