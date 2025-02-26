const csv = require('csv-parser');
const fs = require('fs');
const xlsx = require('xlsx');
const { v4: uuidv4 } = require('uuid'); // Add this dependency for generating unique IDs
const { getEmailHtml, getEmailText } = require('./emailTemplate');

// Create tracking table if it doesn't exist
const createTrackingTable = async (pool) => {
    try {
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS email_tracking (
                id SERIAL PRIMARY KEY,
                tracking_id TEXT UNIQUE NOT NULL,
                email TEXT NOT NULL,
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                opened_at TIMESTAMP,
                open_count INT DEFAULT 0
            )
        `;
        await pool.query(createTableQuery);
    } catch (error) {
        console.error('Error creating tracking table:', error);
    }
};

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

// Create a modified email HTML with tracking pixel
const createEmailWithTracker = (senderName, senderEmail, portfolioUrl, trackingId, serverUrl) => {
    // Get the original email HTML
    const originalHtml = getEmailHtml(senderName, senderEmail, portfolioUrl);
    
    // Add tracking pixel at the end of the email body
    const trackingPixel = `<img src="${serverUrl}/api/track/${trackingId}" width="1" height="1" alt="" style="display:none;">`;
    
    // Insert tracking pixel just before the closing body tag
    return originalHtml.replace('</body>', `${trackingPixel}</body>`);
};




// Email tracking endpoint
exports.trackEmailOpen = (pool) => async (req, res) => {
    const { trackingId } = req.params;
    
    try {
        // First update the tracking record
        const updateResult = await pool.query(`
            UPDATE email_tracking 
            SET 
                opened_at = COALESCE(opened_at, CURRENT_TIMESTAMP),
                open_count = open_count + 1,
                is_opened = true
            WHERE tracking_id = $1
            RETURNING *
        `, [trackingId]);

        // Log successful tracking
        if (updateResult.rows[0]) {
            console.log(`Email tracked: ${updateResult.rows[0].email}`);
        }

        // Send tracking pixel
        const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
        res.writeHead(200, {
            'Content-Type': 'image/gif',
            'Content-Length': pixel.length,
            'Cache-Control': 'private, no-cache, no-store, must-revalidate',
            'Expires': '0',
            'Pragma': 'no-cache'
        });
        res.end(pixel);

    } catch (error) {
        console.error('Tracking error:', error);
        // Still send pixel even if tracking fails
        const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
        res.writeHead(200, {'Content-Type': 'image/gif'});
        res.end(pixel);
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
        
        // Ensure tracking table exists
        await createTrackingTable(pool);

        if (!req.file) {
            console.log('Error: No resume file uploaded');
            return res.status(400).json({ error: 'No resume file uploaded' });
        }

        const { email } = req.body;
        
        if (!email) {
            console.log('Error: No recipient email provided');
            return res.status(400).json({ error: 'No recipient email provided' });
        }
        
        console.log(`Attempting to send email to: ${email}`);
        
        const resumePath = req.file.path;
        const resumeFilename = req.file.originalname;
        const senderName = "NAVEEN K";
        
        console.log(`Resume: ${resumeFilename}, Sender: ${senderName}`);
        
        const messageId = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}@naveenak.com`;
        const trackingId = uuidv4(); // Generate unique tracking ID
        
        // Get server URL from environment or use a default
        const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
        
        // Store tracking information
        await pool.query(
            'INSERT INTO email_tracking (tracking_id, email, sent_at) VALUES ($1, $2, CURRENT_TIMESTAMP)',
            [trackingId, email]
        );
        
        // Create email HTML with tracking pixel
        const emailHtml = createEmailWithTracker(
            senderName, 
            process.env.EMAIL_USER, 
            process.env.PORTFOLIO,
            trackingId,
            serverUrl
        );
        
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
            html: emailHtml, // Use HTML with tracking pixel
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
        console.log(`Tracking ID: ${trackingId}`);
        console.log(`Response: ${JSON.stringify(info.response)}`);
        
        // Log successful email
        await logEmailStatus(pool, email, 'success', `Sent at ${timestamp}`);
        
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        console.log(`Deleted temporary resume file: ${req.file.path}`);
        
        res.json({ 
            message: `Email sent successfully to ${email}`,
            messageId: info.messageId,
            trackingId: trackingId,
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
        
        // Ensure tracking table exists
        await createTrackingTable(pool);
        
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
        let failedEmails = [];
        let successfulEmails = [];
        
        // Get server URL from environment or use a default
        const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';

        console.log('Starting email sending process...');
        
        for (const recipientEmail of emails) {
            try {
                console.log(`Attempting to send email to: ${recipientEmail}`);
                
                const messageId = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}@naveenak.com`;
                const trackingId = uuidv4(); // Generate unique tracking ID
                
                // Store tracking information
                await pool.query(
                    'INSERT INTO email_tracking (tracking_id, email, sent_at) VALUES ($1, $2, CURRENT_TIMESTAMP)',
                    [trackingId, recipientEmail]
                );
                
                // Create email HTML with tracking pixel
                const emailHtml = createEmailWithTracker(
                    senderName, 
                    process.env.EMAIL_USER, 
                    process.env.PORTFOLIO,
                    trackingId,
                    serverUrl
                );
                
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
                    html: emailHtml, // Use HTML with tracking pixel
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
                console.log(`Tracking ID: ${trackingId}`);
                console.log(`Response: ${JSON.stringify(info.response)}`);
                
                // Log successful email
                await logEmailStatus(pool, recipientEmail, 'success', `Sent at ${timestamp}`);
                
                sentCount++;
                successfulEmails.push({
                    email: recipientEmail,
                    timestamp: timestamp,
                    trackingId: trackingId
                });
                
                // Add 90-second delay between emails
                if (sentCount < emails.length) {
                    console.log(`Waiting 90 seconds before sending next email... (${sentCount}/${emails.length} completed)`);
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
        
        if (failedCount > 0) {
            console.log('\nFailed email addresses:');
            failedEmails.forEach((item, index) => {
                console.log(`${index + 1}. ${item.email} - Error: ${item.error} - Time: ${item.timestamp}`);
            });
        }

        fs.unlinkSync(req.file.path);
        console.log(`Deleted temporary resume file: ${req.file.path}`);
        
        res.json({ 
            message: 'Emails sent successfully with 90-second intervals',
            sentCount: sentCount,
            failedCount: failedCount,
            successfulEmails: successfulEmails,
            failedEmails: failedEmails,
            totalTime: `${(emails.length - 1) * 90} seconds`
        });
    } catch (error) {
        console.error('Send emails error:', error);
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

// Get email tracking data
exports.getEmailTrackingData = (pool) => async (req, res) => {
    try {
        // Ensure tracking table exists
        await createTrackingTable(pool);
        
        const result = await pool.query(`
            SELECT 
                id, 
                tracking_id, 
                email, 
                sent_at, 
                opened_at, 
                open_count,
                CASE WHEN opened_at IS NOT NULL THEN TRUE ELSE FALSE END AS is_opened
            FROM 
                email_tracking 
            ORDER BY 
                sent_at DESC
        `);
        
        // Format timestamps for frontend display
        const formattedTracking = result.rows.map(record => ({
            ...record,
            formattedSentTime: formatDate(new Date(record.sent_at)),
            formattedOpenTime: record.opened_at ? formatDate(new Date(record.opened_at)) : null
        }));
        
        res.json(formattedTracking);
    } catch (error) {
        console.error('Error fetching email tracking data:', error);
        res.status(500).json({ error: error.message });
    }
};

// Clear email tracking data
exports.clearEmailTrackingData = (pool) => async (req, res) => {
    try {
        await pool.query('DELETE FROM email_tracking');
        res.json({ message: 'Email tracking data cleared successfully' });
    } catch (error) {
        console.error('Error clearing email tracking data:', error);
        res.status(500).json({ error: error.message });
    }
};