const express = require('express');
const router = express.Router();
const { getLatestServerChecks, getServerCheckHistory } = require('../database');
const { checkServer } = require('../checker');
const { loadServers } = require('../scheduler');

/**
 * GET /api/status
 * Get current status of all servers
 */
router.get('/', (req, res) => {
    try {
        const latestChecks = getLatestServerChecks();
        const servers = loadServers();
        
        // Merge CSV data (customer info) with check data
        const serversWithCustomer = latestChecks.map(check => {
            const serverConfig = servers.find(s => s.url === check.server_url);
            return {
                ...check,
                customer: serverConfig ? serverConfig.customer : 'Unknown'
            };
        });
        
        // Calculate overall stats
        const stats = {
            total: serversWithCustomer.length,
            online: serversWithCustomer.filter(c => c.is_online).length,
            offline: serversWithCustomer.filter(c => !c.is_online).length,
            sslWarning: serversWithCustomer.filter(c => c.ssl_days_remaining !== null && c.ssl_days_remaining <= 30 && c.ssl_days_remaining > 0).length,
            sslFailed: serversWithCustomer.filter(c => c.ssl_valid === 0).length
        };

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            stats,
            servers: serversWithCustomer
        });
    } catch (error) {
        console.error('Error getting status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/status/:serverUrl/history
 * Get check history for a specific server
 */
router.get('/history/:serverUrl', (req, res) => {
    try {
        const serverUrl = decodeURIComponent(req.params.serverUrl);
        const limit = parseInt(req.query.limit) || 50;
        
        const history = getServerCheckHistory(serverUrl, limit);
        
        res.json({
            success: true,
            server_url: serverUrl,
            history
        });
    } catch (error) {
        console.error('Error getting history:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/status/check/:serverUrl
 * Manually trigger a check for specific server
 */
router.post('/check/:serverUrl', async (req, res) => {
    try {
        const serverUrl = decodeURIComponent(req.params.serverUrl);
        const servers = loadServers();
        const server = servers.find(s => s.url === serverUrl);
        
        if (!server) {
            return res.status(404).json({
                success: false,
                error: 'Server not found in configuration'
            });
        }

        const checkResult = await checkServer(server);
        
        res.json({
            success: true,
            server_url: serverUrl,
            result: checkResult
        });
    } catch (error) {
        console.error('Error checking server:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/status/check-all
 * Manually trigger check for all servers
 */
router.post('/check-all', async (req, res) => {
    try {
        const { triggerImmediateCheck } = require('../scheduler');
        
        // Don't wait for completion, trigger async
        triggerImmediateCheck().catch(err => {
            console.error('Error in triggered check:', err);
        });
        
        res.json({
            success: true,
            message: 'Check triggered for all servers'
        });
    } catch (error) {
        console.error('Error triggering check:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
