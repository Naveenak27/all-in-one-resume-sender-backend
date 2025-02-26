require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const controller = require('./controllerAttachment');

const app = express();
app.use(cors());
app.use(express.json());

// Debug log to verify environment variables are loaded
console.log('Environment variables loaded:', {
  EMAIL_USER: process.env.EMAIL_USER ? 'Set' : 'Undefined',
  EMAIL_PASS: process.env.EMAIL_PASS ? 'Set' : 'Undefined',
  PORTFOLIO: process.env.PORTFOLIO ? 'Set' : 'Undefined'
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname)
    }
});

const upload = multer({ storage: storage });

// Database configuration
const pool = new Pool({
    connectionString: 'postgresql://emails_jg7h_user:4IN1hgHRca0p9o6hgM1wjCZzaXV5i4lU@dpg-cuu5fcd2ng1s73dgp62g-a.oregon-postgres.render.com/emails_jg7h',
    ssl: {
        rejectUnauthorized: false
    }
});

// Email configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.log('Database connection error:', err);
    } else {
        console.log('Database connected successfully');
    }
});

// Create uploads directory if it doesn't exist
const fs = require('fs');
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
    console.log('Created uploads directory');
}

// Routes
app.delete('/api/delete/:id', controller.deleteRecord(pool));
// Email tracking endpoint
app.get('/api/track/:trackingId', controller.trackEmailOpen(pool));

// Get email tracking data
app.get('/api/tracking', controller.getEmailTrackingData(pool));

// Clear email tracking data
app.delete('/api/tracking', controller.clearEmailTrackingData(pool));
app.delete('/api/delete-all', controller.deleteAllRecords(pool));
app.get('/api/health', controller.healthCheck);
app.post('/api/add-email', controller.addEmail(pool));
app.post('/api/upload', upload.single('csvFile'), controller.uploadFile(pool));
app.post('/api/send-emails', upload.single('resume'), controller.sendEmails(pool, transporter));
app.get('/api/data', controller.getData(pool));
app.post('/api/send-single-email', upload.single('resume'), controller.sendSingleEmail(pool, transporter));

// New routes for email logs
app.get('/api/email-logs', controller.getEmailLogs(pool));
app.delete('/api/clear-email-logs', controller.clearEmailLogs(pool));

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});