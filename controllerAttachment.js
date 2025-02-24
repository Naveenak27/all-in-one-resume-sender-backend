const csv = require('csv-parser');
const fs = require('fs');
const xlsx = require('xlsx');

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
        await pool.query('DELETE FROM csv_data');
        res.json({ message: 'All records deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Add single email
exports.addEmail = (pool) => async (req, res) => {
    try {
        const { email } = req.body;
        await pool.query('INSERT INTO csv_data (email) VALUES ($1)', [email]);
        res.json({ message: 'Email added successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
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
// Send emails
exports.sendEmails = (pool, transporter) => async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No resume file uploaded' });
        }

        const result = await pool.query('SELECT email FROM csv_data');
        const emails = result.rows.map(row => row.email);
        
        if (emails.length === 0) {
            return res.status(400).json({ error: 'No email recipients found' });
        }

        const resumePath = req.file.path;
        const resumeFilename = req.file.originalname;
        const senderName = "NAVEEN K";
        const job = "Frontend Developer";
        
        // Function to delay execution
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        
        let sentCount = 0;

        for (const recipientEmail of emails) {
            try {
                const messageId = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}@naveenak.com`;
                
                await transporter.sendMail({
                    from: {
                        name: senderName,
                        address: process.env.EMAIL_USER
                    },
                    to: recipientEmail,
                    subject: `Frontend Developer Position - ${job}`,
                    messageId: `<${messageId}>`,
                    headers: {
                        'List-Unsubscribe': `<mailto:${process.env.EMAIL_USER}?subject=unsubscribe>`,
                        'Precedence': 'Bulk',
                        'X-Auto-Response-Suppress': 'OOF, AutoReply',
                        'X-Report-Abuse': `Please report abuse to: ${process.env.EMAIL_USER}`,
                        'Feedback-ID': messageId
                    },
                    html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 680px; margin: 20px auto; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e8e8e8;">
                    <div style="background: #2b3d4f; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 0.5px;">NAVEEN K</h1>
                        <p style="color: #a0b3c6; margin: 8px 0 0; font-size: 14px;">Frontend Developer Application</p>
                    </div>
                
                    <div style="padding: 32px 40px;">
                        <p style="color: #4a5568; margin: 0 0 20px; line-height: 1.6;">Dear Hiring Manager,</p>
                        
                        <p style="color: #4a5568; margin: 0 0 20px; line-height: 1.6;">
                            I trust this message finds you well. I am Naveen, a Frontend Developer with over a year of experience crafting responsive web applications. I am writing to express my interest in contributing to your development team.
                        </p>
                
                        <div style="border-left: 3px solid #2b3d4f; padding-left: 20px; margin: 20px 0;">
                            <p style="color: #4a5568; margin: 0 0 16px; line-height: 1.6;">
                                Key Technical Proficiencies:
                            </p>
                            <ul style="margin: 0; padding: 0; list-style: none;">
                                <li style="margin: 8px 0; padding-left: 24px; position: relative; color: #4a5568;">
                                    <span style="position: absolute; left: 0; color: #2b3d4f;">▹</span>
                                    Frontend Development: HTML5, CSS3, JavaScript (ES6+)
                                </li>
                                <li style="margin: 8px 0; padding-left: 24px; position: relative; color: #4a5568;">
                                    <span style="position: absolute; left: 0; color: #2b3d4f;">▹</span>
                                    React.js Development: Components, Hooks, Context API
                                </li>
                                <li style="margin: 8px 0; padding-left: 24px; position: relative; color: #4a5568;">
                                    <span style="position: absolute; left: 0; color: #2b3d4f;">▹</span>
                                    State Management: Redux Toolkit, React Query
                                </li>
                                <li style="margin: 8px 0; padding-left: 24px; position: relative; color: #4a5568;">
                                    <span style="position: absolute; left: 0; color: #2b3d4f;">▹</span>
                                    Backend Familiarity: Node.js, Express.js, MySQL
                                </li>
                            </ul>
                        </div>
                
                        <div style="margin: 24px 0;">
                            <p style="color: #4a5568; margin: 0 0 16px; line-height: 1.6;">
                                Project Portfolio:
                            </p>
                            
                            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
                                <h3 style="color: #2b3d4f; margin: 0 0 12px;">Cleaning Service Web Application</h3>
                                <p style="color: #4a5568; margin: 0; line-height: 1.6;">
                                    Created a responsive interface using React.js and Redux Toolkit, featuring reusable components and seamless API integration for real-time data management.
                                </p>
                            </div>
                
                            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
                                <h3 style="color: #2b3d4f; margin: 0 0 12px;">Portfolio Website</h3>
                                <p style="color: #4a5568; margin: 0; line-height: 1.6;">
                                    Developed a personal portfolio using HTML, CSS, and JavaScript, integrating Firebase for secure form submissions and enhanced user interaction.
                                </p>
                            </div>
                
                            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
                                <h3 style="color: #2b3d4f; margin: 0 0 12px;">Khannan Finance Website</h3>
                                <p style="color: #4a5568; margin: 0; line-height: 1.6;">
                                    Built a professional finance company website with responsive design, implementing Formspree for reliable contact form functionality and user engagement.
                                </p>
                            </div>
                
                            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
                                <h3 style="color: #2b3d4f; margin: 0 0 12px;">Automatic Resume Sender</h3>
                                <p style="color: #4a5568; margin: 0; line-height: 1.6;">
                                    Engineered an automated email solution using React.js frontend and Node.js/Express.js backend with Nodemailer, enabling efficient bulk resume distribution through CSV file processing.
                                </p>
                            </div>
                
                            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
                                <h3 style="color: #2b3d4f; margin: 0 0 12px;">Vote Tracker</h3>
                                <p style="color: #4a5568; margin: 0; line-height: 1.6;">
                                    Developed a React.js voting application with Firebase integration, featuring dynamic candidate selection by state and district, single-vote verification, and real-time top candidate tracking.
                                </p>
                            </div>
                
                            <div style="background: #f8fafc; padding: 20px; border-radius: 8px;">
                                <h3 style="color: #2b3d4f; margin: 0 0 12px;">Chennai Gated Website</h3>
                                <p style="color: #4a5568; margin: 0; line-height: 1.6;">
                                    Designed and implemented a modern real estate platform using React.js, featuring an intuitive interface for property listings and comprehensive amenity showcases.
                                </p>
                            </div>
                        </div>
                
                        <p style="color: #4a5568; margin: 20px 0; line-height: 1.6;">
                            I welcome the opportunity to discuss how my experience aligns with your team's needs. Please visit my portfolio at naveenak.netlify.app to explore these projects in detail.
                        </p>
                
                        <div style="margin-top: 32px; border-top: 1px solid #e8e8e8; padding-top: 24px;">
                            <p style="margin: 0 0 8px; color: #4a5568;">
                                Best regards,<br>
                                <strong style="color: #2b3d4f;">Naveen K</strong>
                            </p>
                            <div style="margin-top: 12px;">
                                <p style="color: #4a5568; margin: 4px 0; font-size: 14px;">📞 7548865624</p>
                                <a href="mailto:${process.env.EMAIL_USER}" style="color: #3182ce; text-decoration: none; font-size: 14px; display: block; margin: 4px 0;">📧 Email</a>
                                <a href="${process.env.PORTFOLIO}" style="color: #3182ce; text-decoration: none; font-size: 14px; display: block; margin: 4px 0;">🌐 Portfolio</a>
                            </div>
                        </div>
                    </div>
                
                    <div style="background: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 12px 12px;">
                        <p style="color: #718096; font-size: 12px; margin: 8px 0;">
                            To opt out of future communications, please reply with "unsubscribe"
                        </p>
                    </div>
                </div>
                `,
                    text: `
                Frontend Developer Application
                
                Dear Hiring Manager,
                
                I trust this message finds you well. I am Naveen, a Frontend Developer with over a year of experience crafting responsive web applications. I am writing to express my interest in contributing to your development team.
                
                Key Technical Proficiencies:
                - Frontend Development: HTML5, CSS3, JavaScript (ES6+)
                - React.js Development: Components, Hooks, Context API
                - State Management: Redux Toolkit, React Query
                - Backend Familiarity: Node.js, Express.js, MySQL
                
                Project Portfolio:
                
                Cleaning Service Web Application
                - Created a responsive interface using React.js and Redux Toolkit
                - Implemented reusable components and real-time data integration
                
                Portfolio Website
                - Developed a personal portfolio using HTML, CSS, and JavaScript
                - Integrated Firebase for secure form submissions
                
                Khannan Finance Website
                - Built a professional finance company website with responsive design
                - Implemented Formspree for reliable contact form functionality
                
                Automatic Resume Sender
                - Engineered an automated email solution using React.js and Node.js/Express.js
                - Enabled efficient bulk resume distribution through CSV file processing
                
                Vote Tracker
                - Developed a React.js voting application with Firebase integration
                - Implemented dynamic candidate selection and real-time tracking
                
                Chennai Gated Website
                - Designed a modern real estate platform using React.js
                - Created intuitive interface for property listings and amenities
                
                I welcome the opportunity to discuss how my experience aligns with your team's needs. Please visit my portfolio at naveenak.netlify.app to explore these projects in detail.
                
                Best regards,
                Naveen K
                Phone: 7548865624
                Email: ${process.env.EMAIL_USER}
                Portfolio: ${process.env.PORTFOLIO}
                `,
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
                
                sentCount++;
                
                // Add 30-second delay between emails
                if (sentCount < emails.length) {
                    await delay(30000); // 30 seconds in milliseconds
                }
                
            } catch (emailError) {
                console.error(`Failed to send email to ${recipientEmail}:`, emailError);
            }
        }

        fs.unlinkSync(req.file.path);
        
        res.json({ 
            message: 'Emails sent successfully with 30-second intervals',
            sentCount: sentCount,
            totalTime: `${(emails.length - 1) * 30} seconds`
        });
    } catch (error) {
        console.error('Send emails error:', error);
        res.status(500).json({ error: error.message });
    }
};
// Get all data
exports.getData = (pool) => async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM csv_data');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};