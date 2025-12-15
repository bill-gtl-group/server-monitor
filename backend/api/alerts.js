const express = require('express');
const router = express.Router();
const { getAllAlerts, getAlertById, updateAlertStatus } = require('../database');

/**
 * GET /api/alerts
 * Get all alerts
 */
router.get('/', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const status = req.query.status; // Filter by status if provided
        
        let alerts = getAllAlerts(limit);
        
        // Filter by status if specified
        if (status) {
            alerts = alerts.filter(a => a.status === status);
        }
        
        res.json({
            success: true,
            count: alerts.length,
            alerts
        });
    } catch (error) {
        console.error('Error getting alerts:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/alerts/:id
 * Get specific alert by ID
 */
router.get('/:id', (req, res) => {
    try {
        const alert = getAlertById(req.params.id);
        
        if (!alert) {
            return res.status(404).json({
                success: false,
                error: 'Alert not found'
            });
        }
        
        res.json({
            success: true,
            alert
        });
    } catch (error) {
        console.error('Error getting alert:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/alerts/:id/status
 * Update alert status via email link (GET for easy email click)
 */
router.get('/:id/status', (req, res) => {
    try {
        const { id } = req.params;
        const { action } = req.query;
        
        if (!action || !['in_process', 'abort', 'done'].includes(action)) {
            return res.status(400).send(`
                <html>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h2>❌ Invalid Action</h2>
                    <p>Valid actions are: in_process, abort, done</p>
                </body>
                </html>
            `);
        }
        
        const alert = getAlertById(id);
        if (!alert) {
            return res.status(404).send(`
                <html>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h2>❌ Alert Not Found</h2>
                    <p>Alert ID: ${id}</p>
                </body>
                </html>
            `);
        }
        
        updateAlertStatus(id, action);
        
        const statusMessages = {
            'in_process': {
                emoji: '🟡',
                title: 'Marked as In Process',
                message: 'You will receive reminders every 24 hours until resolved'
            },
            'abort': {
                emoji: '⚫',
                title: 'Alert Aborted',
                message: 'This alert has been marked as a false alarm. No more notifications will be sent.'
            },
            'done': {
                emoji: '🟢',
                title: 'Marked as Done',
                message: 'This issue has been resolved. No more notifications will be sent.'
            }
        };
        
        const status = statusMessages[action];
        
        res.send(`
            <html>
            <head>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        text-align: center;
                        padding: 50px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        min-height: 100vh;
                        margin: 0;
                    }
                    .container {
                        background: white;
                        padding: 40px;
                        border-radius: 12px;
                        max-width: 600px;
                        margin: 0 auto;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                    }
                    .emoji {
                        font-size: 80px;
                        margin-bottom: 20px;
                    }
                    h1 {
                        color: #333;
                        margin-bottom: 20px;
                    }
                    p {
                        color: #666;
                        line-height: 1.6;
                        margin-bottom: 15px;
                    }
                    .details {
                        background: #f5f5f5;
                        padding: 20px;
                        border-radius: 8px;
                        margin: 20px 0;
                        text-align: left;
                    }
                    .detail-row {
                        margin: 10px 0;
                        padding: 8px 0;
                        border-bottom: 1px solid #ddd;
                    }
                    .label {
                        font-weight: bold;
                        color: #555;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="emoji">${status.emoji}</div>
                    <h1>${status.title}</h1>
                    <p>${status.message}</p>
                    
                    <div class="details">
                        <div class="detail-row">
                            <span class="label">Server:</span> ${alert.server_name}
                        </div>
                        <div class="detail-row">
                            <span class="label">Issue:</span> ${alert.issue_type}
                        </div>
                        <div class="detail-row">
                            <span class="label">Updated:</span> ${new Date().toLocaleString()}
                        </div>
                    </div>
                    
                    <p style="margin-top: 30px; font-size: 14px; color: #999;">
                        You can close this window now.
                    </p>
                </div>
            </body>
            </html>
        `);
        
    } catch (error) {
        console.error('Error updating alert status:', error);
        res.status(500).send(`
            <html>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h2>❌ Error</h2>
                <p>${error.message}</p>
            </body>
            </html>
        `);
    }
});

/**
 * POST /api/alerts/:id/status
 * Update alert status via API
 */
router.post('/:id/status', (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        if (!status || !['new', 'in_process', 'abort', 'done'].includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid status. Must be: new, in_process, abort, or done'
            });
        }
        
        const alert = getAlertById(id);
        if (!alert) {
            return res.status(404).json({
                success: false,
                error: 'Alert not found'
            });
        }
        
        updateAlertStatus(id, status);
        
        res.json({
            success: true,
            message: 'Alert status updated',
            alert_id: id,
            new_status: status
        });
        
    } catch (error) {
        console.error('Error updating alert status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
