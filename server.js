




const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const controller = require('./controllerAttachment');

const app = express();
app.use(cors());
app.use(express.json());

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

// Routes
app.delete('/api/delete/:id', controller.deleteRecord(pool));
app.delete('/api/delete-all', controller.deleteAllRecords(pool));
app.get('/api/health', controller.healthCheck);
app.post('/api/add-email', controller.addEmail(pool));
app.post('/api/upload', upload.single('csvFile'), controller.uploadFile(pool));
app.post('/api/send-emails', upload.single('resume'), controller.sendEmails(pool, transporter));
app.get('/api/data', controller.getData(pool));
app.post('/api/send-single-email', upload.single('resume'), controller.sendSingleEmail(pool, transporter));

const PORT = 3002;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});