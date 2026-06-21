require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/db');
const agenda = require('./config/agenda');
const errorHandler = require('./middleware/errorHandler');

// Connect to Database
connectDB();

const app = express();
app.set('trust proxy', 1);

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Static folder for attachments
app.use('/uploads', express.static('uploads'));

// Define Routes
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/campaigns/:campaignId/recipients', require('./routes/recipients'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/sheets', require('./routes/sheets'));
app.use('/t', require('./routes/tracking'));

// Basic route
app.get('/', (req, res) => {
  res.send('Mailium API is running...');
});

app.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

// Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  app.listen(PORT, async () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    await agenda.start();
  });
};

startServer();
