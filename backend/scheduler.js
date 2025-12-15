const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { v4: uuidv4 } = require('uuid');
const { checkServer, getServerStatus } = require('./checker');
const { recordServerCheck, getAlertByServerAndType, createAlert, updateAlertLastAlerted, getActiveAlerts, getLastCheckForServer, updateConsecutiveFailures } = require('./database');
const { sendAlertEmail, sendWeeklyReport, loadSMTPConfig } = require('./emailer');
const { generateWeeklyReport } = require('./reporter');

let servers = [];
let isChecking = false;
let retestQueue = []; // Queue for 1-minute retests

/**
 * Load servers from CSV file
 */
function loadServers() {
    try {
        const csvPath = path.join(__dirname, 'data', 'servers.csv');
        if (!fs.existsSync(csvPath)) {
            console.warn('⚠️  No servers.csv found. Please upload server list.');
            return [];
        }

        const fileContent = fs.readFileSync(csvPath, 'utf8');
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });

        servers = records.filter(server => server.enabled !== 'false');
        console.log(`✅ Loaded ${servers.length} enabled servers from CSV`);
        return servers;

    } catch (error) {
        console.error('❌ Error loading servers:', error.message);
        return [];
    }
}

/**
 * Check if alert should be sent based on throttling rules
 * @param {Object} alert - Existing alert
 * @returns {boolean} Should send alert
 */
function shouldSendAlert(alert) {
    if (!alert) return true; // No existing alert, send new one

    const now = Date.now();
    const timeSinceLastAlert = now - alert.last_alerted_at;
    
    // Status-based throttling
    if (alert.status === 'new') {
        // Send every hour (3600000ms)
        return timeSinceLastAlert >= 3600000;
    } else if (alert.status === 'in_process') {
        // Send every 24 hours (86400000ms)
        return timeSinceLastAlert >= 86400000;
    } else {
        // 'done' or 'abort' - don't send
        return false;
    }
}

/**
 * Schedule a retest for a failed server after 1 minute
 * @param {Object} server - Server configuration
 * @param {number} currentFailures - Current consecutive failure count
 */
function scheduleRetest(server, currentFailures) {
    // Remove any existing retest for this server
    retestQueue = retestQueue.filter(item => item.server.url !== server.url);
    
    // Schedule new retest
    const retestTime = Date.now() + 60000; // 1 minute from now
    retestQueue.push({
        server,
        currentFailures,
        retestTime
    });
    
    console.log(`⏰ Scheduled retest for ${server.name} in 1 minute (failures: ${currentFailures})`);
}

/**
 * Process retest queue - check servers that need retesting
 */
async function processRetestQueue() {
    const now = Date.now();
    const itemsToRetest = retestQueue.filter(item => item.retestTime <= now);
    
    if (itemsToRetest.length === 0) return;
    
    // Remove items from queue
    retestQueue = retestQueue.filter(item => item.retestTime > now);
    
    console.log(`🔄 Processing ${itemsToRetest.length} scheduled retests...`);
    
    for (const item of itemsToRetest) {
        try {
            const checkResult = await checkServer(item.server);
            await processCheckResult(item.server, checkResult, item.currentFailures);
            
            const statusIcon = checkResult.is_online ? '🟢' : '🔴';
            console.log(`${statusIcon} Retest ${item.server.name}: ${checkResult.is_online ? 'OK' : 'OFFLINE'}`);
        } catch (error) {
            console.error(`❌ Error retesting ${item.server.name}:`, error.message);
        }
    }
}

/**
 * Process check result and handle alerts with consecutive failure tracking
 * @param {Object} server - Server configuration
 * @param {Object} checkResult - Check result
 * @param {number} previousFailures - Previous consecutive failure count (for retests)
 */
async function processCheckResult(server, checkResult, previousFailures = 0) {
    // Record check in database
    recordServerCheck(checkResult);

    // Get last check to track consecutive failures
    const lastCheck = getLastCheckForServer(server.url);
    const failureThreshold = parseInt(server.failure_threshold) || 3;
    
    let consecutiveFailures = 0;
    
    if (!checkResult.is_online) {
        // Server is down - increment failure count
        if (previousFailures > 0) {
            // This is a retest - use the passed failure count
            consecutiveFailures = previousFailures + 1;
        } else if (lastCheck && !lastCheck.is_online) {
            // Previous check also failed
            consecutiveFailures = (lastCheck.consecutive_failures || 0) + 1;
        } else {
            // First failure
            consecutiveFailures = 1;
        }
        
        // Update consecutive failures in database
        updateConsecutiveFailures(server.url, consecutiveFailures);
        
        console.log(`📉 ${server.name} failure count: ${consecutiveFailures}/${failureThreshold}`);
        
        // Check if we should send alert or schedule retest
        if (consecutiveFailures < failureThreshold) {
            // Not enough failures yet - schedule a retest in 1 minute
            scheduleRetest(server, consecutiveFailures);
            return; // Don't process alerts yet
        } else {
            console.log(`⚠️  ${server.name} reached failure threshold (${consecutiveFailures}/${failureThreshold})`);
        }
    } else {
        // Server is online - reset failure count
        if (lastCheck && lastCheck.consecutive_failures > 0) {
            console.log(`✅ ${server.name} recovered (was ${lastCheck.consecutive_failures} failures)`);
        }
        updateConsecutiveFailures(server.url, 0);
        consecutiveFailures = 0;
    }

    // Only process alerts if failure threshold is reached OR server is online
    const sslAlertDays = parseInt(server.ssl_alert_days) || 30;
    const status = getServerStatus(checkResult, sslAlertDays);

    // Track pending alerts for customer grouping
    const pendingAlerts = [];

    // Process each issue
    for (const issue of status.issues) {
        const existingAlert = getAlertByServerAndType(server.url, issue.type);

        if (existingAlert) {
            // Check if we should send alert
            if (shouldSendAlert(existingAlert)) {
                updateAlertLastAlerted(existingAlert.id);
                const updatedAlert = { ...existingAlert, alert_count: existingAlert.alert_count + 1 };
                pendingAlerts.push({
                    alert: updatedAlert,
                    server,
                    isNew: false
                });
                console.log(`📧 Re-alert for ${server.name}: ${issue.type}`);
            }
        } else {
            // Create new alert
            const newAlert = {
                id: uuidv4(),
                server_name: server.name,
                server_url: server.url,
                issue_type: issue.type,
                issue_details: issue.message,
                status: 'new'
            };

            createAlert(newAlert);
            pendingAlerts.push({
                alert: { ...newAlert, created_at: Date.now(), alert_count: 1 },
                server,
                isNew: true
            });
            console.log(`🆕 New alert for ${server.name}: ${issue.type}`);
        }
    }

    // Return pending alerts for customer grouping
    return pendingAlerts;
}

/**
 * Group alerts by customer and send one email per customer
 * @param {Array} allPendingAlerts - All pending alerts from this check cycle
 */
async function sendCustomerGroupedAlerts(allPendingAlerts) {
    if (!allPendingAlerts || allPendingAlerts.length === 0) return;

    // Group by customer
    const customerGroups = {};
    
    for (const item of allPendingAlerts) {
        const customer = item.server.customer || 'Unknown';
        const email = item.server.alert_email;
        
        if (!email) continue; // Skip if no email configured
        
        const key = `${customer}|${email}`;
        
        if (!customerGroups[key]) {
            customerGroups[key] = {
                customer,
                email,
                servers: []
            };
        }
        
        customerGroups[key].servers.push({
            name: item.server.name,
            url: item.server.url,
            issue_type: item.alert.issue_type,
            issue_details: item.alert.issue_details,
            alert_count: item.alert.alert_count,
            isNew: item.isNew
        });
    }

    // Send one email per customer
    for (const [key, group] of Object.entries(customerGroups)) {
        try {
            await sendCustomerGroupAlert(group);
            console.log(`📧 Sent grouped alert to ${group.customer} (${group.servers.length} issues)`);
        } catch (error) {
            console.error(`❌ Failed to send alert to ${group.customer}:`, error.message);
        }
    }
}

/**
 * Send alert email for customer group
 * @param {Object} group - Customer group with alerts
 */
async function sendCustomerGroupAlert(group) {
    // Build email subject
    const subject = `[Server Monitor] ${group.customer}: ${group.servers.length} Alert${group.servers.length > 1 ? 's' : ''}`;
    
    // Build email body
    let body = `<h2>Customer: ${group.customer}</h2>`;
    body += `<p><strong>${group.servers.length}</strong> server issue${group.servers.length > 1 ? 's' : ''} detected:</p>`;
    body += '<ul>';
    
    for (const server of group.servers) {
        const badge = server.isNew ? '<span style="background:#e74c3c;color:white;padding:2px 6px;border-radius:3px;font-size:11px;margin-left:5px;">NEW</span>' : '';
        body += `<li><strong>${server.name}</strong> ${badge}<br/>`;
        body += `URL: ${server.url}<br/>`;
        body += `Issue: ${server.issue_type}<br/>`;
        body += `Details: ${server.issue_details}`;
        if (server.alert_count > 1) {
            body += `<br/><em>Alert count: ${server.alert_count}</em>`;
        }
        body += '</li><br/>';
    }
    
    body += '</ul>';
    body += `<p><em>Generated at: ${new Date().toLocaleString()}</em></p>`;
    
    // Use the emailer's sendEmail function
    const emailer = require('./emailer');
    if (emailer.sendEmail) {
        await emailer.sendEmail(group.email, subject, body);
    }
}

/**
 * Check all servers
 */
async function checkAllServers() {
    if (isChecking) {
        console.log('⏭️  Skipping check - previous check still running');
        return;
    }

    isChecking = true;
    const startTime = Date.now();
    const allPendingAlerts = [];

    try {
        // Reload config and servers before each check cycle
        console.log('🔄 Reloading configuration...');
        loadSMTPConfig();
        const currentServers = loadServers();
        
        if (currentServers.length === 0) {
            console.log('⚠️  No servers to check');
            isChecking = false;
            return;
        }

        console.log(`\n🔍 Starting health check for ${currentServers.length} servers...`);

        // Check all servers in parallel (with concurrency limit)
        const batchSize = 10; // Check 10 servers at a time
        for (let i = 0; i < currentServers.length; i += batchSize) {
            const batch = currentServers.slice(i, i + batchSize);
            
            const batchResults = await Promise.all(batch.map(async (server) => {
                try {
                    const checkResult = await checkServer(server);
                    const pendingAlerts = await processCheckResult(server, checkResult);
                    
                    const statusIcon = checkResult.is_online ? '🟢' : '🔴';
                    console.log(`${statusIcon} ${server.name}: ${checkResult.is_online ? 'OK' : 'OFFLINE'} (${checkResult.response_time}ms)`);
                    
                    return pendingAlerts || [];
                } catch (error) {
                    console.error(`❌ Error checking ${server.name}:`, error.message);
                    return [];
                }
            }));
            
            // Collect all pending alerts
            batchResults.forEach(alerts => {
                if (Array.isArray(alerts)) {
                    allPendingAlerts.push(...alerts);
                }
            });
        }

        // Send grouped alerts by customer
        await sendCustomerGroupedAlerts(allPendingAlerts);

        const duration = Date.now() - startTime;
        console.log(`✅ Health check completed in ${duration}ms\n`);

    } catch (error) {
        console.error('❌ Error during health check:', error);
    } finally {
        isChecking = false;
    }
}

/**
 * Process pending alert emails
 */
async function processAlertQueue() {
    try {
        const activeAlerts = getActiveAlerts();
        
        for (const alert of activeAlerts) {
            if (shouldSendAlert(alert)) {
                // Find server config to get email
                const server = servers.find(s => s.url === alert.server_url);
                if (server) {
                    updateAlertLastAlerted(alert.id);
                    await sendAlertEmail(alert, server.alert_email);
                    console.log(`📧 Sent scheduled alert: ${alert.server_name} - ${alert.issue_type}`);
                }
            }
        }
    } catch (error) {
        console.error('❌ Error processing alert queue:', error);
    }
}

/**
 * Generate and send weekly report
 */
async function sendWeeklyReportJob() {
    try {
        console.log('\n📊 Generating weekly report...');
        
        const report = generateWeeklyReport();
        
        if (report.success) {
            // Send email
            await sendWeeklyReport(report);
            console.log('✅ Weekly report generated and sent successfully\n');
        } else {
            console.error('❌ Failed to generate weekly report:', report.error);
        }
    } catch (error) {
        console.error('❌ Error in weekly report job:', error);
    }
}

/**
 * Start the scheduler
 */
function startScheduler() {
    // Load SMTP config
    loadSMTPConfig();

    // Load servers from CSV
    loadServers();

    // Schedule health checks every 5 minutes
    cron.schedule('*/5 * * * *', () => {
        console.log(`\n⏰ Scheduled check triggered at ${new Date().toLocaleString()}`);
        checkAllServers();
    });

    // Process retest queue every minute
    cron.schedule('* * * * *', () => {
        processRetestQueue();
    });

    // Process alert queue every 10 minutes
    cron.schedule('*/10 * * * *', () => {
        processAlertQueue();
    });

    // Schedule weekly report - Every Monday at 9:00 AM
    cron.schedule('0 9 * * 1', () => {
        console.log(`\n📅 Weekly report triggered at ${new Date().toLocaleString()}`);
        sendWeeklyReportJob();
    });

    // Run initial check after 30 seconds
    setTimeout(() => {
        console.log('🚀 Running initial health check...');
        checkAllServers();
    }, 30000);

    console.log('✅ Scheduler started:');
    console.log('   - Health checks: Every 5 minutes');
    console.log('   - Retest queue: Every 1 minute');
    console.log('   - Alert processing: Every 10 minutes');
    console.log('   - Weekly reports: Every Monday at 9:00 AM');
}

/**
 * Force immediate check (for manual triggers)
 */
async function triggerImmediateCheck() {
    console.log('🔄 Manual check triggered');
    await checkAllServers();
}

module.exports = {
    startScheduler,
    loadServers,
    checkAllServers,
    triggerImmediateCheck
};
