const fs = require('fs');
const path = require('path');
const { getLatestServerChecks, getServerCheckHistory } = require('./database');
const { loadServers } = require('./scheduler');

/**
 * Get configured base URL
 * @returns {string} Base URL
 */
function getBaseUrl() {
    try {
        const configPath = path.join(__dirname, 'data', 'config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return (config.api && config.api.baseUrl) || 'http://localhost:3000';
        }
    } catch (error) {
        console.error('Error reading baseUrl from config:', error.message);
    }
    return 'http://localhost:3000';
}

/**
 * Generate CSV report content
 * @returns {string} CSV content
 */
function generateCSVReport() {
    const checks = getLatestServerChecks();
    const servers = loadServers();
    
    // CSV header
    let csv = 'Server Name,URL,Status,Response Time (ms),SSL Valid,SSL Created,SSL Expires,Days Remaining,Last Checked,Uptime % (7 days)\n';
    
    // Process each server
    for (const check of checks) {
        const serverName = check.server_name || 'Unknown';
        const url = check.server_url;
        const status = check.is_online ? 'Online' : 'Offline';
        const responseTime = check.response_time || 'N/A';
        const sslValid = check.ssl_valid === 1 ? 'Yes' : check.ssl_valid === 0 ? 'No' : 'N/A';
        
        // Format SSL dates
        let sslCreated = 'N/A';
        let sslExpires = 'N/A';
        let daysRemaining = 'N/A';
        
        if (check.ssl_expires_at) {
            const expiryDate = new Date(check.ssl_expires_at);
            sslExpires = expiryDate.toISOString().split('T')[0];
            
            // Calculate created date (typically 1 year before expiry for most certs)
            const createdDate = new Date(expiryDate);
            createdDate.setFullYear(createdDate.getFullYear() - 1);
            sslCreated = createdDate.toISOString().split('T')[0];
            
            daysRemaining = check.ssl_days_remaining || 'N/A';
        }
        
        const lastChecked = new Date(check.checked_at).toISOString().replace('T', ' ').split('.')[0];
        
        // Calculate uptime for last 7 days
        const uptime = calculateUptime(url);
        
        // Escape commas in fields
        const escapedName = `"${serverName.replace(/"/g, '""')}"`;
        const escapedUrl = `"${url.replace(/"/g, '""')}"`;
        
        csv += `${escapedName},${escapedUrl},${status},${responseTime},${sslValid},${sslCreated},${sslExpires},${daysRemaining},${lastChecked},${uptime}%\n`;
    }
    
    return csv;
}

/**
 * Calculate uptime percentage for the last 7 days
 * @param {string} serverUrl - Server URL
 * @returns {string} Uptime percentage
 */
function calculateUptime(serverUrl) {
    try {
        const history = getServerCheckHistory(serverUrl, 2000); // Get up to 2000 checks
        
        if (history.length === 0) return '0.00';
        
        // Filter to last 7 days
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const recentChecks = history.filter(c => c.checked_at >= sevenDaysAgo);
        
        if (recentChecks.length === 0) return '0.00';
        
        const onlineChecks = recentChecks.filter(c => c.is_online === 1).length;
        const uptime = (onlineChecks / recentChecks.length * 100).toFixed(2);
        
        return uptime;
    } catch (error) {
        console.error(`Error calculating uptime for ${serverUrl}:`, error.message);
        return '0.00';
    }
}

/**
 * Generate HTML table for email
 * @returns {string} HTML content
 */
function generateHTMLTable() {
    const checks = getLatestServerChecks();
    
    let html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {
            font-family: Arial, sans-serif;
            padding: 20px;
            color: #333;
        }
        h1 {
            color: #667eea;
            margin-bottom: 10px;
        }
        .summary {
            background: #f0f0f0;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .summary-item {
            display: inline-block;
            margin-right: 30px;
            font-size: 16px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        th {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px;
            text-align: left;
            font-weight: bold;
        }
        td {
            padding: 10px 12px;
            border-bottom: 1px solid #ddd;
        }
        tr:hover {
            background: #f5f5f5;
        }
        .status-online {
            background: #d4edda;
        }
        .status-offline {
            background: #f8d7da;
        }
        .status-warning {
            background: #fff3cd;
        }
        .badge {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
        }
        .badge-success {
            background: #28a745;
            color: white;
        }
        .badge-danger {
            background: #dc3545;
            color: white;
        }
        .badge-warning {
            background: #ffc107;
            color: #333;
        }
        .footer {
            margin-top: 30px;
            text-align: center;
            color: #666;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <h1>📊 Weekly Server Health Report</h1>
    <p>Generated: ${new Date().toLocaleString('en-US', { timeZone: 'UTC' })} UTC</p>
    
    <div class="summary">
        <div class="summary-item">🟢 <strong>Online:</strong> ${checks.filter(c => c.is_online === 1).length}</div>
        <div class="summary-item">🔴 <strong>Offline:</strong> ${checks.filter(c => c.is_online === 0).length}</div>
        <div class="summary-item">🟡 <strong>SSL Warnings:</strong> ${checks.filter(c => c.ssl_days_remaining !== null && c.ssl_days_remaining <= 30 && c.ssl_days_remaining > 0).length}</div>
        <div class="summary-item">📊 <strong>Total Servers:</strong> ${checks.length}</div>
    </div>
    
    <table>
        <thead>
            <tr>
                <th>Server Name</th>
                <th>Status</th>
                <th>Response Time</th>
                <th>SSL Valid</th>
                <th>SSL Expires</th>
                <th>Days Remaining</th>
                <th>Uptime (7d)</th>
            </tr>
        </thead>
        <tbody>
`;
    
    // Sort: offline first, then by SSL days remaining
    const sortedChecks = checks.sort((a, b) => {
        if (a.is_online !== b.is_online) return a.is_online - b.is_online;
        if (a.ssl_days_remaining === null) return 1;
        if (b.ssl_days_remaining === null) return -1;
        return a.ssl_days_remaining - b.ssl_days_remaining;
    });
    
    for (const check of sortedChecks) {
        const isOnline = check.is_online === 1;
        const sslWarning = check.ssl_days_remaining !== null && check.ssl_days_remaining <= 30;
        
        let rowClass = '';
        if (!isOnline) rowClass = 'status-offline';
        else if (sslWarning) rowClass = 'status-warning';
        else rowClass = 'status-online';
        
        const statusBadge = isOnline 
            ? '<span class="badge badge-success">Online</span>'
            : '<span class="badge badge-danger">Offline</span>';
        
        const sslBadge = check.ssl_valid === 1
            ? '<span class="badge badge-success">Yes</span>'
            : check.ssl_valid === 0
            ? '<span class="badge badge-danger">No</span>'
            : 'N/A';
        
        const sslExpires = check.ssl_expires_at 
            ? new Date(check.ssl_expires_at).toISOString().split('T')[0]
            : 'N/A';
        
        const daysRemaining = check.ssl_days_remaining !== null
            ? check.ssl_days_remaining + ' days'
            : 'N/A';
        
        const uptime = calculateUptime(check.server_url);
        
        html += `
            <tr class="${rowClass}">
                <td><strong>${check.server_name}</strong><br><small>${check.server_url}</small></td>
                <td>${statusBadge}</td>
                <td>${check.response_time ? check.response_time + ' ms' : 'N/A'}</td>
                <td>${sslBadge}</td>
                <td>${sslExpires}</td>
                <td>${daysRemaining}</td>
                <td>${uptime}%</td>
            </tr>
        `;
    }
    
    html += `
        </tbody>
    </table>
    
    <div class="footer">
        <p>Server Health Monitor | Automated Weekly Report</p>
        <p>This report is generated automatically every Monday at 9:00 AM</p>
        <p><a href="${getBaseUrl()}" style="color: #667eea;">View Live Dashboard</a></p>
    </div>
</body>
</html>
    `;
    
    return html;
}

/**
 * Save report to file
 * @param {string} content - Report content
 * @param {string} filename - File name
 * @returns {string} Full file path
 */
function saveReport(content, filename) {
    const reportsDir = path.join(__dirname, 'data', 'reports');
    
    // Create reports directory if it doesn't exist
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
        console.log('✅ Created reports directory');
    }
    
    const filePath = path.join(reportsDir, filename);
    fs.writeFileSync(filePath, content, 'utf8');
    
    console.log(`✅ Report saved: ${filePath}`);
    return filePath;
}

/**
 * Generate and save weekly report
 * @returns {Object} Report details
 */
function generateWeeklyReport() {
    try {
        const timestamp = new Date().toISOString().split('T')[0];
        
        // Generate CSV
        const csvContent = generateCSVReport();
        const csvFilename = `weekly-report-${timestamp}.csv`;
        const csvPath = saveReport(csvContent, csvFilename);
        
        // Generate HTML
        const htmlContent = generateHTMLTable();
        const htmlFilename = `weekly-report-${timestamp}.html`;
        const htmlPath = saveReport(htmlContent, htmlFilename);
        
        console.log('📊 Weekly report generated successfully');
        
        return {
            success: true,
            csvPath,
            htmlPath,
            csvContent,
            htmlContent,
            timestamp
        };
        
    } catch (error) {
        console.error('❌ Error generating weekly report:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    generateWeeklyReport,
    generateCSVReport,
    generateHTMLTable,
    calculateUptime
};
