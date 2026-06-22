const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { sendTestEmail } = require('../services/emailService');

// Helper to generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'fallback_secret_for_development', {
    expiresIn: '30d',
  });
};

// @route   POST /api/auth/signup
// @desc    Register a new user
// @access  Public
router.post('/signup', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Please provide all fields' });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, error: 'Email already exists' });
    }

    const maxUsersLimit = parseInt(process.env.MAX_USERS_LIMIT, 10) || 5;
    const userCount = await User.countDocuments();
    
    if (userCount >= maxUsersLimit) {
      return res.status(403).json({ success: false, error: 'App has max users limit reached try someday else.' });
    }

    const isAdmin = email.toLowerCase() === 'yogesiwan@gmail.com';
    const status = isAdmin ? 'active' : 'pending_admin_approval';

    const user = await User.create({ name, email, password, status });
    
    if (!isAdmin) {
      try {
        const adminUser = await User.findOne({ email: 'yogesiwan@gmail.com' });
        if (adminUser) {
          const approveLink = `${process.env.TRACKING_BASE_URL || 'http://localhost:5000'}/api/auth/admin/approve/${user._id}`;
          await sendTestEmail(
            'yogesiwan@gmail.com',
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
        email: user.email
      }
    });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res, next) => {
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
        email: user.email
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

// @route   GET /api/auth/admin/approve/:id
// @desc    Approve a pending user
// @access  Public (Obscured by ID)
router.get('/admin/approve/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).send('User not found.');
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
