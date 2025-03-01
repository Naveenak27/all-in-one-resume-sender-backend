// emailTemplate.js

const getEmailHtml = (senderName, emailUser, portfolio) => `
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 680px; margin: 20px auto; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e8e8e8;">
    <div style="background: #2b3d4f; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 0.5px;">${senderName}</h1>
        <p style="color: #a0b3c6; margin: 8px 0 0; font-size: 14px;">Frontend Developer Application</p>
    </div>

    <div style="padding: 32px 40px;">
        <p style="color: #4a5568; margin: 0 0 20px; line-height: 1.6;">Dear Hiring Manager,</p>
        
       <p style="color: #4a5568; margin: 0 0 20px; line-height: 1.6;">
    I trust this message finds you well. I am Naveen, a Frontend Developer with nearly 2 years of experience building modern web applications using React, TypeScript and Next.js. My expertise includes developing responsive interfaces, optimizing performance, and implementing complex user interactions.
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
                <a href="mailto:${emailUser}" style="color: #3182ce; text-decoration: none; font-size: 14px; display: block; margin: 4px 0;">📧 Email</a>
                <a href="${portfolio}" style="color: #3182ce; text-decoration: none; font-size: 14px; display: block; margin: 4px 0;">🌐 Portfolio</a>
            </div>
        </div>
    </div>

    <div style="background: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 12px 12px;">
        <p style="color: #718096; font-size: 12px; margin: 8px 0;">
            To opt out of future communications, please reply with "unsubscribe"
        </p>
    </div>
</div>
`;

const getEmailText = (emailUser, portfolio) => `
React.js Frontend Developer with Project Portfolio

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
Email: ${emailUser}
Portfolio: ${portfolio}
`;

module.exports = {
    getEmailHtml,
    getEmailText
};
