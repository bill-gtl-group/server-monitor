const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

let transporter = null;
let smtpConfig = null;
let apiConfig = null;

/**
 * Load SMTP configuration from config file
 */
function loadSMTPConfig() {
    try {
        const configPath = path.join(__dirname, 'data', 'config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            smtpConfig = config.smtp;
            apiConfig = config.api;
            
            // Create transporter
            transporter = nodemailer.createTransport({
                host: smtpConfig.host,
                port: smtpConfig.port || 25,
                secure: smtpConfig.secure || false,
                tls: {
                    rejectUnauthorized: false
                }
            });
            
            console.log(`✅ SMTP configured: ${smtpConfig.host}:${smtpConfig.port}`);
            return true;
        } else {
            console.warn('⚠️  No SMTP config found. Create data/config.json');
            return false;
        }
    } catch (error) {
        console.error('❌ Error loading SMTP config:', error.message);
        return false;
    }
}

/**
 * Get configured base URL
 * @returns {string} Base URL
 */
function getBaseUrl() {
    return (apiConfig && apiConfig.baseUrl) || 'http://localhost:3000';
}

/**
 * Get email alert template
 * @param {Object} alert - Alert details
 * @param {string} baseUrl - Base URL for action links
 * @returns {Object} Email subject and HTML body
 */
function getAlertTemplate(alert, baseUrl = 'http://localhost:3000') {
    const statusEmoji = {
        'offline': '🔴',
        'ssl_expiring': '🟡',
        'ssl_failed': '🔴',
        'slow_response': '🟡'
    };

    const emoji = statusEmoji[alert.issue_type] || '⚠️';
    const issueTitle = {
        'offline': 'Server Offline',
        'ssl_expiring': 'SSL Certificate Expiring Soon',
        'ssl_failed': 'SSL Certificate Failed',
        'slow_response': 'Slow Response Time'
    }[alert.issue_type] || 'Server Issue';

    const subject = `${emoji} ALERT: ${alert.server_name} - ${issueTitle}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 8px 8px 0 0;
        }
        .content {
            background: #f9f9f9;
            padding: 20px;
            border: 1px solid #ddd;
            border-top: none;
        }
        .alert-box {
            background: white;
            padding: 15px;
            border-left: 4px solid #dc3545;
            margin: 15px 0;
            border-radius: 4px;
        }
        .info-row {
            margin: 10px 0;
            padding: 8px 0;
            border-bottom: 1px solid #eee;
        }
        .label {
            font-weight: bold;
            color: #666;
        }
        .actions {
            background: white;
            padding: 20px;
            border-radius: 0 0 8px 8px;
            border: 1px solid #ddd;
            border-top: none;
        }
        .action-btn {
            display: inline-block;
            padding: 12px 24px;
            margin: 5px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
            text-align: center;
        }
        .btn-process {
            background: #ffc107;
            color: #333;
        }
        .btn-abort {
            background: #6c757d;
            color: white;
        }
        .btn-done {
            background: #28a745;
            color: white;
        }
        .footer {
            text-align: center;
            margin-top: 20px;
            padding: 20px;
            color: #666;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1 style="margin: 0;">${emoji} Server Health Alert</h1>
        <p style="margin: 5px 0 0 0; opacity: 0.9;">Immediate Action Required</p>
    </div>
    
    <div class="content">
        <div class="alert-box">
            <h2 style="margin-top: 0; color: #dc3545;">${issueTitle}</h2>
            <div class="info-row">
                <span class="label">Server:</span> ${alert.server_name}
            </div>
            <div class="info-row">
                <span class="label">URL:</span> ${alert.server_url}
            </div>
            <div class="info-row">
                <span class="label">Issue:</span> ${alert.issue_details}
            </div>
            <div class="info-row">
                <span class="label">Time:</span> ${new Date(alert.created_at).toLocaleString('en-US', { timeZone: 'UTC' })} UTC
            </div>
            <div class="info-row">
                <span class="label">Alert ID:</span> ${alert.id}
            </div>
            <div class="info-row">
                <span class="label">Current Status:</span> <strong style="text-transform: uppercase;">${alert.status}</strong>
            </div>
        </div>
        
        ${alert.alert_count > 1 ? `
        <div style="background: #fff3cd; padding: 10px; border-radius: 4px; margin: 10px 0;">
            <strong>⚠️ This is alert #${alert.alert_count}</strong> for this issue.
        </div>
        ` : ''}
    </div>
    
    <div class="actions">
        <h3 style="margin-top: 0;">Action Required:</h3>
        <p>Click one of the buttons below to update the alert status:</p>
        
        <div style="text-align: center; margin: 20px 0;">
            <a href="${baseUrl}/api/alerts/${alert.id}/status?action=in_process" class="action-btn btn-process">
                🟡 Mark as In Process
            </a>
            <br>
            <a href="${baseUrl}/api/alerts/${alert.id}/status?action=abort" class="action-btn btn-abort">
                ⚫ Abort (False Alarm)
            </a>
            <br>
            <a href="${baseUrl}/api/alerts/${alert.id}/status?action=done" class="action-btn btn-done">
                🟢 Mark as Done
            </a>
        </div>
        
        <div style="background: #e7f3ff; padding: 15px; border-radius: 4px; margin-top: 20px;">
            <strong>📌 Note:</strong>
            <ul style="margin: 10px 0;">
                <li><strong>In Process:</strong> Alerts will be sent every 24 hours</li>
                <li><strong>Abort:</strong> No more alerts for this issue</li>
                <li><strong>Done:</strong> Issue resolved, no more alerts</li>
            </ul>
        </div>
    </div>
    
    <div class="footer">
        <p>Server Health Monitor | Automated Alert System</p>
        <p>View Dashboard: <a href="${baseUrl}">${baseUrl}</a></p>
    </div>
</body>
</html>
    `;

    return { subject, html };
}

/**
 * Send alert email
 * @param {Object} alert - Alert details
 * @param {string} recipientEmail - Email address to send to
 * @param {string} baseUrl - Base URL for action links (optional, uses config if not provided)
 * @returns {Promise<boolean>} Success status
 */
async function sendAlertEmail(alert, recipientEmail, baseUrl = null) {
    if (!transporter || !smtpConfig) {
        if (!loadSMTPConfig()) {
            console.error('❌ Cannot send email: SMTP not configured');
            return false;
        }
    }

    try {
        const actualBaseUrl = baseUrl || getBaseUrl();
        const { subject, html } = getAlertTemplate(alert, actualBaseUrl);

        // Build recipient list
        let toList = recipientEmail;
        if (smtpConfig.to && smtpConfig.to.trim()) {
            // Add configured "to" email (e.g., for CC/monitoring)
            toList = `${recipientEmail}, ${smtpConfig.to}`;
        }

        const mailOptions = {
            from: `"${smtpConfig.fromName || 'Server Monitor'}" <${smtpConfig.from}>`,
            to: toList,
            subject: subject,
            html: html
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 Alert email sent to ${toList}: ${info.messageId}`);
        return true;

    } catch (error) {
        console.error(`❌ Failed to send email to ${recipientEmail}:`, error.message);
        return false;
    }
}

/**
 * Test SMTP connection
 * @returns {Promise<boolean>} Connection success
 */
async function testSMTPConnection() {
    if (!transporter || !smtpConfig) {
        if (!loadSMTPConfig()) {
            return false;
        }
    }

    try {
        await transporter.verify();
        console.log('✅ SMTP connection verified');
        return true;
    } catch (error) {
        console.error('❌ SMTP connection failed:', error.message);
        return false;
    }
}

/**
 * Send weekly report email
 * @param {Object} report - Report data
 * @returns {Promise<boolean>} Success status
 */
async function sendWeeklyReport(report) {
    if (!transporter || !smtpConfig) {
        if (!loadSMTPConfig()) {
            console.error('❌ Cannot send email: SMTP not configured');
            return false;
        }
    }

    try {
        const subject = `📊 Weekly Server Health Report - ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
        
        // Determine recipient
        const toEmail = smtpConfig.to || smtpConfig.from;
        
        const mailOptions = {
            from: `"${smtpConfig.fromName || 'Server Monitor'}" <${smtpConfig.from}>`,
            to: toEmail,
            subject: subject,
            html: report.htmlContent,
            attachments: [
                {
                    filename: `weekly-report-${report.timestamp}.csv`,
                    content: report.csvContent,
                    contentType: 'text/csv'
                }
            ]
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 Weekly report emailed to ${toEmail}: ${info.messageId}`);
        return true;

    } catch (error) {
        console.error(`❌ Failed to send weekly report:`, error.message);
        return false;
    }
}

module.exports = {
    loadSMTPConfig,
    sendAlertEmail,
    sendWeeklyReport,
    testSMTPConnection,
    getAlertTemplate
};
