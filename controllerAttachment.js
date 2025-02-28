const csv = require('csv-parser');
const fs = require('fs');
const xlsx = require('xlsx');
const { getEmailHtml, getEmailText } = require('./emailTemplate');

// Health check
exports.healthCheck = (req, res) => {
    res.json({ status: 'Server is running' });
};

// Delete single record
exports.deleteRecord = (pool) => async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM csv_data WHERE id = $1', [id]);
        res.json({ message: 'Record deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Delete all records
exports.deleteAllRecords = (pool) => async (req, res) => {
    try {
        // Set a query timeout
        const result = await pool.query('DELETE FROM csv_data');
        console.log(`Deleted ${result.rowCount || 'all'} records`);
        res.json({ 
            message: 'All records deleted successfully',
            count: result.rowCount || 0
        });
    } catch (error) {
        console.error('Error deleting all records:', error);
        res.status(500).json({ error: error.message });
    }
};

// Add single email
exports.addEmail = (pool) => async (req, res) => {
    try {
        const email = req.body.singleEmail || req.body.email;
        await pool.query('INSERT INTO csv_data (email) VALUES ($1)', [email]);
        res.json({ message: 'Email added successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Create email log table if it doesn't exist
const createEmailLogTable = async (pool) => {
    try {
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS email_logs (
                id SERIAL PRIMARY KEY,
                email TEXT NOT NULL,
                status TEXT NOT NULL,
                message TEXT,
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await pool.query(createTableQuery);
    } catch (error) {
        console.error('Error creating email log table:', error);
    }
};

// Create sent email tracking table
const createSentEmailTrackingTable = async (pool) => {
    try {
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS sent_email_tracking (
                email TEXT PRIMARY KEY,
                last_sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await pool.query(createTableQuery);
        console.log('Sent email tracking table created or verified');
    } catch (error) {
        console.error('Error creating sent email tracking table:', error);
    }
};

// Check if email was recently sent (within 24 hours)
const wasEmailRecentlySent = async (pool, email) => {
    try {
        // Look up the last time this email was sent
        const result = await pool.query(
            'SELECT last_sent_at FROM sent_email_tracking WHERE email = $1',
            [email]
        );
        
        if (result.rows.length === 0) {
            return false; // Email has never been sent before
        }
        
        const lastSentAt = new Date(result.rows[0].last_sent_at);
        const now = new Date();
        const hoursSinceLastSent = (now - lastSentAt) / (1000 * 60 * 60);
        
        // Return true if email was sent in the last 24 hours
        return hoursSinceLastSent < 24;
    } catch (error) {
        console.error('Error checking if email was recently sent:', error);
        return false; // If there's an error, allow sending to be safe
    }
};

// Update the last sent time for an email
const updateEmailSentTracking = async (pool, email) => {
    try {
        await pool.query(
            `INSERT INTO sent_email_tracking (email, last_sent_at) 
             VALUES ($1, CURRENT_TIMESTAMP) 
             ON CONFLICT (email) DO UPDATE SET last_sent_at = CURRENT_TIMESTAMP`,
            [email]
        );
    } catch (error) {
        console.error('Error updating email sent tracking:', error);
    }
};

// Log email sending status
const logEmailStatus = async (pool, email, status, message = null) => {
    try {
        await pool.query(
            'INSERT INTO email_logs (email, status, message) VALUES ($1, $2, $3)',
            [email, status, message]
        );
    } catch (error) {
        console.error('Error logging email status:', error);
    }
};

// Format date for frontend display
const formatDate = (date) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    
    let hours = date.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    
    return `${month} ${day} ${hours}:${minutes}:${seconds} ${ampm}`;
};

// Upload file
exports.uploadFile = (pool) => async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Create table if it doesn't exist (instead of dropping)
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS csv_data (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await pool.query(createTableQuery);
        
        // Ensure email log table exists
        await createEmailLogTable(pool);
        // Ensure sent email tracking table exists
        await createSentEmailTrackingTable(pool);

        const results = [];
        let headers = [];

        if (req.file.originalname.endsWith('.ods')) {
            const workbook = xlsx.readFile(req.file.path);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            const range = xlsx.utils.decode_range(worksheet['!ref']);
            headers = ['email'];
            
            for (let R = range.s.r + 1; R <= range.e.r; R++) {
                const cell = worksheet[xlsx.utils.encode_cell({r: R, c: 0})];
                if (cell && cell.v) {
                    results.push({ email: cell.v.toString() });
                }
            }
        } else {
            await new Promise((resolve, reject) => {
                fs.createReadStream(req.file.path)
                    .pipe(csv())
                    .on('headers', (headerList) => {
                        headers = ['email'];
                    })
                    .on('data', (data) => {
                        results.push({ email: Object.values(data)[0] });
                    })
                    .on('end', resolve)
                    .on('error', reject);
            });
        }

        // Use INSERT with ON CONFLICT DO NOTHING to handle duplicates
        let insertedCount = 0;
        for (const row of results) {
            if (row.email && row.email.trim()) {
                try {
                    const result = await pool.query(
                        'INSERT INTO csv_data (email) VALUES ($1) ON CONFLICT (email) DO NOTHING',
                        [row.email.trim()]
                    );
                    if (result.rowCount > 0) {
                        insertedCount++;
                    }
                } catch (insertError) {
                    console.error('Error inserting email:', row.email, insertError);
                }
            }
        }

        fs.unlinkSync(req.file.path);
        res.json({ 
            message: 'Data imported successfully',
            newRecordsAdded: insertedCount,
            totalRecordsProcessed: results.length
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Send single email
exports.sendSingleEmail = (pool, transporter) => async (req, res) => {
    try {
        console.log('Sending single email...');
        console.log('Environment variables:');
        console.log('EMAIL_USER:', process.env.EMAIL_USER);
        console.log('EMAIL_PASS:', 'HIDDEN FOR SECURITY'); // Don't log the actual password
        console.log('PORTFOLIO:', process.env.PORTFOLIO);
        
        // Ensure email log table exists
        await createEmailLogTable(pool);
        // Ensure sent email tracking table exists
        await createSentEmailTrackingTable(pool);

        if (!req.file) {
            console.log('Error: No resume file uploaded');
            return res.status(400).json({ error: 'No resume file uploaded' });
        }

        const { email } = req.body;
        
        if (!email) {
            console.log('Error: No recipient email provided');
            return res.status(400).json({ error: 'No recipient email provided' });
        }
        
        // Check if this email was recently sent to
        const recentlySent = await wasEmailRecentlySent(pool, email);
        if (recentlySent) {
            console.log(`Email to ${email} was recently sent (within 24 hours). Skipping.`);
            return res.status(400).json({ 
                error: 'Email was recently sent',
                message: 'This email was already sent within the last 24 hours.'
            });
        }
        
        console.log(`Attempting to send email to: ${email}`);
        
        const resumePath = req.file.path;
        const resumeFilename = req.file.originalname;
        const senderName = "NAVEEN K";
        
        console.log(`Resume: ${resumeFilename}, Sender: ${senderName}`);
        
        const messageId = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}@naveenak.com`;
        
        const info = await transporter.sendMail({
            from: {
                name: senderName,
                address: process.env.EMAIL_USER
            },
            to: email,
            subject: `React.js Frontend Developer with Project Portfolio - NAVEEN K`,
            messageId: `<${messageId}>`,
            headers: {
                'List-Unsubscribe': `<mailto:${process.env.EMAIL_USER}?subject=unsubscribe>`,
                'Precedence': 'Bulk',
                'X-Auto-Response-Suppress': 'OOF, AutoReply',
                'X-Report-Abuse': `Please report abuse to: ${process.env.EMAIL_USER}`,
                'Feedback-ID': messageId
            },
            html: getEmailHtml(senderName, process.env.EMAIL_USER, process.env.PORTFOLIO),
            text: getEmailText(process.env.EMAIL_USER, process.env.PORTFOLIO),
            attachments: [{
                filename: resumeFilename,
                path: resumePath,
                contentType: 'application/pdf'
            }],
            dsn: {
                id: messageId,
                return: 'headers',
                notify: ['failure', 'delay'],
                recipient: process.env.EMAIL_USER
            }
        });
        
        // Get current time for display
        const timestamp = formatDate(new Date());
        
        console.log(`✅ Email sent successfully to: ${email}`);
        console.log(`Timestamp: ${timestamp}`);
        console.log(`Message ID: ${info.messageId}`);
        console.log(`Response: ${JSON.stringify(info.response)}`);
        
        // Log successful email
        await logEmailStatus(pool, email, 'success', `Sent at ${timestamp}`);
        
        // Update the last sent time for this email
        await updateEmailSentTracking(pool, email);
        
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        console.log(`Deleted temporary resume file: ${req.file.path}`);
        
        res.json({ 
            message: `Email sent successfully to ${email}`,
            messageId: info.messageId,
            timestamp: timestamp
        });
        
    } catch (error) {
        console.error('Send single email error:', error);
        
        // Log failed email if email was provided
        if (req.body && req.body.email) {
            await logEmailStatus(pool, req.body.email, 'failed', error.message);
        }
        
        // Clean up uploaded file if it exists
        if (req.file && req.file.path) {
            try {
                fs.unlinkSync(req.file.path);
                console.log(`Deleted temporary resume file after error: ${req.file.path}`);
            } catch (unlinkError) {
                console.error('Error deleting file:', unlinkError);
            }
        }
        
        res.status(500).json({ error: error.message });
    }
};

// Send emails to all recipients
exports.sendEmails = (pool, transporter) => async (req, res) => {
    try {
        console.log('Environment variables:');
        console.log('EMAIL_USER:', process.env.EMAIL_USER);
        console.log('EMAIL_PASS:', 'HIDDEN FOR SECURITY'); // Don't log the actual password
        console.log('PORTFOLIO:', process.env.PORTFOLIO);
        
        // Ensure email log table exists
        await createEmailLogTable(pool);
        // Ensure sent email tracking table exists
        await createSentEmailTrackingTable(pool);
        
        if (!req.file) {
            console.log('Error: No resume file uploaded');
            return res.status(400).json({ error: 'No resume file uploaded' });
        }

        const result = await pool.query('SELECT email FROM csv_data');
        const emails = result.rows.map(row => row.email);
        
        console.log(`Found ${emails.length} email recipients`);
        
        if (emails.length === 0) {
            console.log('Error: No email recipients found');
            return res.status(400).json({ error: 'No email recipients found' });
        }

        const resumePath = req.file.path;
        const resumeFilename = req.file.originalname;
        const senderName = "NAVEEN K";
        
        console.log(`Resume: ${resumeFilename}, Sender: ${senderName}`);
        
        // Function to delay execution
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        
        let sentCount = 0;
        let failedCount = 0;
        let skippedCount = 0;
        let failedEmails = [];
        let successfulEmails = [];
        let skippedEmails = [];

        console.log('Starting email sending process...');
        
        for (const recipientEmail of emails) {
            try {
                // Check if this email was recently sent to
                const recentlySent = await wasEmailRecentlySent(pool, recipientEmail);
                if (recentlySent) {
                    console.log(`Email to ${recipientEmail} was recently sent (within 24 hours). Skipping.`);
                    skippedCount++;
                    skippedEmails.push({
                        email: recipientEmail,
                        reason: 'Recently sent (within 24 hours)',
                        timestamp: formatDate(new Date())
                    });
                    continue; // Skip to the next email
                }
                
                console.log(`Attempting to send email to: ${recipientEmail}`);
                
                const messageId = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}@naveenak.com`;
                
                const info = await transporter.sendMail({
                    from: {
                        name: senderName,
                        address: process.env.EMAIL_USER
                    },
                    to: recipientEmail,
                    subject: `React.js Frontend Developer with Project Portfolio - NAVEEN K`,
                    messageId: `<${messageId}>`,
                    headers: {
                        'List-Unsubscribe': `<mailto:${process.env.EMAIL_USER}?subject=unsubscribe>`,
                        'Precedence': 'Bulk',
                        'X-Auto-Response-Suppress': 'OOF, AutoReply',
                        'X-Report-Abuse': `Please report abuse to: ${process.env.EMAIL_USER}`,
                        'Feedback-ID': messageId
                    },
                    html: getEmailHtml(senderName, process.env.EMAIL_USER, process.env.PORTFOLIO),
                    text: getEmailText(process.env.EMAIL_USER, process.env.PORTFOLIO),
                    attachments: [{
                        filename: resumeFilename,
                        path: resumePath,
                        contentType: 'application/pdf'
                    }],
                    dsn: {
                        id: messageId,
                        return: 'headers',
                        notify: ['failure', 'delay'],
                        recipient: process.env.EMAIL_USER
                    }
                });
                
                // Get current time for display
                const timestamp = formatDate(new Date());
                
                console.log(`✅ Email sent successfully to: ${recipientEmail}`);
                console.log(`Timestamp: ${timestamp}`);
                console.log(`Message ID: ${info.messageId}`);
                console.log(`Response: ${JSON.stringify(info.response)}`);
                
                // Log successful email
                await logEmailStatus(pool, recipientEmail, 'success', `Sent at ${timestamp}`);
                
                // Update the last sent time for this email
                await updateEmailSentTracking(pool, recipientEmail);
                
                sentCount++;
                successfulEmails.push({
                    email: recipientEmail,
                    timestamp: timestamp
                });
                
                // Add 90-second delay between emails
                if (sentCount + skippedCount + failedCount < emails.length) {
                    console.log(`Waiting 90 seconds before sending next email... (${sentCount + skippedCount + failedCount}/${emails.length} processed)`);
                    await delay(90000); // 90 seconds in milliseconds
                }
                
            } catch (emailError) {
                console.error(`❌ Failed to send email to ${recipientEmail}:`, emailError);
                
                // Log failed email
                await logEmailStatus(pool, recipientEmail, 'failed', emailError.message);
                
                failedCount++;
                failedEmails.push({
                    email: recipientEmail,
                    error: emailError.message,
                    timestamp: formatDate(new Date())
                });
            }
        }

        console.log('\n--- Email Sending Summary ---');
        console.log(`Total emails: ${emails.length}`);
        console.log(`Successfully sent: ${sentCount}`);
        console.log(`Failed: ${failedCount}`);
        console.log(`Skipped (recently sent): ${skippedCount}`);
        
        if (failedCount > 0) {
            console.log('\nFailed email addresses:');
            failedEmails.forEach((item, index) => {
                console.log(`${index + 1}. ${item.email} - Error: ${item.error} - Time: ${item.timestamp}`);
            });
        }
        
        if (skippedCount > 0) {
            console.log('\nSkipped email addresses:');
            skippedEmails.forEach((item, index) => {
                console.log(`${index + 1}. ${item.email} - Reason: ${item.reason} - Time: ${item.timestamp}`);
            });
        }

        fs.unlinkSync(req.file.path);
        console.log(`Deleted temporary resume file: ${req.file.path}`);
        
        res.json({ 
            message: 'Email process completed successfully',
            sentCount: sentCount,
            failedCount: failedCount,
            skippedCount: skippedCount,
            successfulEmails: successfulEmails,
            failedEmails: failedEmails,
            skippedEmails: skippedEmails,
            totalProcessingTime: `${(sentCount - 1) * 90} seconds`
        });
    } catch (error) {
        console.error('Send emails error:', error);
        
        // Clean up uploaded file if it exists
        if (req.file && req.file.path) {
            try {
                fs.unlinkSync(req.file.path);
                console.log(`Deleted temporary resume file after error: ${req.file.path}`);
            } catch (unlinkError) {
                console.error('Error deleting file:', unlinkError);
            }
        }
        
        res.status(500).json({ error: error.message });
    }
};

// Get data
exports.getData = (pool) => async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM csv_data');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get email logs
exports.getEmailLogs = (pool) => async (req, res) => {
    try {
        // Ensure email log table exists
        await createEmailLogTable(pool);
        
        const result = await pool.query('SELECT * FROM email_logs ORDER BY sent_at DESC');
        
        // Format timestamps for frontend display
        const formattedLogs = result.rows.map(log => ({
            ...log,
            formattedTime: formatDate(new Date(log.sent_at))
        }));
        
        res.json(formattedLogs);
    } catch (error) {
        console.error('Error fetching email logs:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get email tracking data
exports.getEmailTrackingData = (pool) => async (req, res) => {
    try {
        // Ensure sent email tracking table exists
        await createSentEmailTrackingTable(pool);
        
        const result = await pool.query('SELECT * FROM sent_email_tracking ORDER BY last_sent_at DESC');
        
        // Format timestamps for frontend display
        const formattedData = result.rows.map(entry => ({
            ...entry,
            formattedTime: formatDate(new Date(entry.last_sent_at))
        }));
        
        res.json(formattedData);
    } catch (error) {
        console.error('Error fetching email tracking data:', error);
        res.status(500).json({ error: error.message });
    }
};

// Clear email logs
exports.clearEmailLogs = (pool) => async (req, res) => {
    try {
        await pool.query('DELETE FROM email_logs');
        res.json({ message: 'Email logs cleared successfully' });
    } catch (error) {
        console.error('Error clearing email logs:', error);
        res.status(500).json({ error: error.message });
    }
};

// Reset email tracking (for testing)
exports.resetEmailTracking = (pool) => async (req, res) => {
    try {
        await pool.query('DELETE FROM sent_email_tracking');
        res.json({ message: 'Email tracking data reset successfully' });
    } catch (error) {
        console.error('Error resetting email tracking:', error);
        res.status(500).json({ error: error.message });
    }
};

// Send email with custom content
exports.sendCustomEmail = (pool, transporter) => async (req, res) => {
    try {
        console.log('Sending email with custom content...');
        console.log('Environment variables:');
        console.log('EMAIL_USER:', process.env.EMAIL_USER);
        console.log('EMAIL_PASS:', 'HIDDEN FOR SECURITY');
        
        // Ensure email log table exists
        await createEmailLogTable(pool);
        // Ensure sent email tracking table exists
        await createSentEmailTrackingTable(pool);

        if (!req.file) {
            console.log('Error: No resume file uploaded');
            return res.status(400).json({ error: 'No resume file uploaded' });
        }

        const { email, customContent, useDefaultTemplate } = req.body;
        
        if (!email) {
            console.log('Error: No recipient email provided');
            return res.status(400).json({ error: 'No recipient email provided' });
        }
        
        // Check if this email was recently sent to
        const recentlySent = await wasEmailRecentlySent(pool, email);
        if (recentlySent) {
            console.log(`Email to ${email} was recently sent (within 24 hours). Skipping.`);
            return res.status(400).json({ 
                error: 'Email was recently sent',
                message: 'This email was already sent within the last 24 hours.'
            });
        }
        
        console.log(`Attempting to send email to: ${email}`);
        console.log(`Using default template: ${useDefaultTemplate ? 'Yes' : 'No'}`);
        
        const resumePath = req.file.path;
        const resumeFilename = req.file.originalname;
        const senderName = "NAVEEN K";
        
        console.log(`Resume: ${resumeFilename}, Sender: ${senderName}`);
        
        const messageId = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}@naveenak.com`;
        
        // Determine email content based on template choice
        let emailHtml, emailText;
        
        if (useDefaultTemplate === 'true') {
            // Use default template
            emailHtml = getEmailHtml(senderName, process.env.EMAIL_USER, process.env.PORTFOLIO);
            emailText = getEmailText(process.env.EMAIL_USER, process.env.PORTFOLIO);
        } else {
            // Use custom text content only
            // Replace placeholders with actual values
            emailText = customContent
                .replace('${emailUser}', process.env.EMAIL_USER)
                .replace('${portfolio}', process.env.PORTFOLIO);
                
            // Create a very simple HTML version just for clients that require HTML
            // but keep it essentially the same as the plain text
            emailHtml = `<pre style="font-family: sans-serif; white-space: pre-wrap;">${emailText}</pre>`;
        }
        
        const info = await transporter.sendMail({
            from: {
                name: senderName,
                address: process.env.EMAIL_USER
            },
            to: email,
            subject: `React.js Frontend Developer - NAVEEN K`,
            messageId: `<${messageId}>`,
            headers: {
                'List-Unsubscribe': `<mailto:${process.env.EMAIL_USER}?subject=unsubscribe>`,
                'Precedence': 'Bulk',
                'X-Auto-Response-Suppress': 'OOF, AutoReply',
                'X-Report-Abuse': `Please report abuse to: ${process.env.EMAIL_USER}`,
                'Feedback-ID': messageId
            },
            html: emailHtml,
            text: emailText,
            attachments: [{
                filename: resumeFilename,
                path: resumePath,
                contentType: 'application/pdf'
            }],
            dsn: {
                id: messageId,
                return: 'headers',
                notify: ['failure', 'delay'],
                recipient: process.env.EMAIL_USER
            }
        });
        
        // Get current time for display
        const timestamp = formatDate(new Date());
        
        console.log(`✅ Email sent successfully to: ${email}`);
        console.log(`Timestamp: ${timestamp}`);
        console.log(`Message ID: ${info.messageId}`);
        console.log(`Response: ${JSON.stringify(info.response)}`);
        
        // Log successful email
        await logEmailStatus(pool, email, 'success', `Sent at ${timestamp} - Custom content: ${useDefaultTemplate === 'true' ? 'No' : 'Yes'}`);
        
        // Update the last sent time for this email
        await updateEmailSentTracking(pool, email);
        
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        console.log(`Deleted temporary resume file: ${req.file.path}`);
        
        res.json({ 
            message: `Email sent successfully to ${email}`,
            messageId: info.messageId,
            timestamp: timestamp,
            useDefaultTemplate: useDefaultTemplate === 'true'
        });
        
    } catch (error) {
        console.error('Send custom email error:', error);
        
        // Log failed email if email was provided
        if (req.body && req.body.email) {
            await logEmailStatus(pool, req.body.email, 'failed', error.message);
        }
        
        // Clean up uploaded file if it exists
        if (req.file && req.file.path) {
            try {
                fs.unlinkSync(req.file.path);
                console.log(`Deleted temporary resume file after error: ${req.file.path}`);
            } catch (unlinkError) {
                console.error('Error deleting file:', unlinkError);
            }
        }
        
        res.status(500).json({ error: error.message });
    }
};