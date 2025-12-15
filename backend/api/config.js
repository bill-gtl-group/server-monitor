const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { loadSMTPConfig, testSMTPConnection } = require('../emailer');

const configPath = path.join(__dirname, '../data/config.json');

/**
 * GET /api/config
 * Get current configuration
 */
router.get('/', (req, res) => {
    try {
        if (!fs.existsSync(configPath)) {
            return res.json({
                success: true,
                config: null,
                message: 'No configuration file found'
            });
        }

        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        // Don't send sensitive data
        const safeConfig = {
            smtp: {
                host: config.smtp?.host,
                port: config.smtp?.port,
                from: config.smtp?.from,
                fromName: config.smtp?.fromName,
                to: config.smtp?.to
            },
            api: {
                port: config.api?.port,
                corsOrigin: config.api?.corsOrigin,
                baseUrl: config.api?.baseUrl
            }
        };

        res.json({
            success: true,
            config: safeConfig
        });
    } catch (error) {
        console.error('Error getting config:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/config
 * Update configuration
 */
router.post('/', (req, res) => {
    try {
        const { smtp, api } = req.body;

        // Validate SMTP config
        if (smtp && !smtp.host) {
            return res.status(400).json({
                success: false,
                error: 'SMTP host is required'
            });
        }

        // Load existing config or create new
        let config = {};
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }

        // Update config
        if (smtp) {
            config.smtp = {
                host: smtp.host,
                port: smtp.port || 25,
                secure: smtp.secure || false,
                from: smtp.from || 'monitor@example.com',
                fromName: smtp.fromName || 'Server Monitor',
                to: smtp.to || ''
            };
        }

        if (api) {
            config.api = {
                port: api.port || 3000,
                corsOrigin: api.corsOrigin || '*',
                baseUrl: api.baseUrl || 'http://localhost:3000'
            };
        }

        // Ensure data directory exists
        const dataDir = path.dirname(configPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Save config
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        
        // Reload SMTP config
        loadSMTPConfig();

        console.log('✅ Configuration updated');

        res.json({
            success: true,
            message: 'Configuration updated successfully'
        });
    } catch (error) {
        console.error('Error updating config:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/config/test-smtp
 * Test SMTP connection
 */
router.post('/test-smtp', async (req, res) => {
    try {
        const success = await testSMTPConnection();
        
        res.json({
            success: success,
            message: success ? 'SMTP connection successful' : 'SMTP connection failed'
        });
    } catch (error) {
        console.error('Error testing SMTP:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
