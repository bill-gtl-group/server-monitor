const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { loadServers } = require('../scheduler');

// Configure multer for file uploads
const upload = multer({ dest: path.join(__dirname, '../data/uploads/') });

/**
 * GET /api/servers
 * Get list of all configured servers
 */
router.get('/', (req, res) => {
    try {
        const servers = loadServers();
        
        res.json({
            success: true,
            count: servers.length,
            servers
        });
    } catch (error) {
        console.error('Error getting servers:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/servers/upload
 * Upload new servers CSV file
 */
router.post('/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        // Read uploaded file
        const uploadedContent = fs.readFileSync(req.file.path, 'utf8');
        
        // Validate CSV format (basic check)
        const lines = uploadedContent.split('\n');
        if (lines.length < 2) {
            fs.unlinkSync(req.file.path); // Clean up
            return res.status(400).json({
                success: false,
                error: 'CSV file must have at least a header and one data row'
            });
        }

        // Check header
        const header = lines[0].toLowerCase();
        const requiredFields = ['name', 'url', 'alert_email'];
        const hasRequiredFields = requiredFields.every(field => header.includes(field));
        
        if (!hasRequiredFields) {
            fs.unlinkSync(req.file.path); // Clean up
            return res.status(400).json({
                success: false,
                error: `CSV must include these columns: ${requiredFields.join(', ')}`
            });
        }

        // Move file to data directory
        const targetPath = path.join(__dirname, '../data/servers.csv');
        fs.renameSync(req.file.path, targetPath);
        
        // Reload servers
        const servers = loadServers();
        
        console.log(`✅ Uploaded new server list: ${servers.length} servers`);
        
        res.json({
            success: true,
            message: 'Server list uploaded successfully',
            server_count: servers.length
        });
        
    } catch (error) {
        console.error('Error uploading servers:', error);
        
        // Clean up uploaded file if it exists
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/servers/download
 * Download current servers CSV file
 */
router.get('/download', (req, res) => {
    try {
        const csvPath = path.join(__dirname, '../data/servers.csv');
        
        if (!fs.existsSync(csvPath)) {
            return res.status(404).json({
                success: false,
                error: 'No server list found'
            });
        }
        
        res.download(csvPath, 'servers.csv');
        
    } catch (error) {
        console.error('Error downloading servers:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/servers/template
 * Download CSV template
 */
router.get('/template', (req, res) => {
    const template = `name,url,check_interval,ssl_alert_days,alert_email,enabled
Example Server,https://example.com,300,30,admin@example.com,true
Production API,https://api.example.com,300,30,devops@example.com,true
Staging Server,https://staging.example.com,600,30,dev@example.com,false`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=servers_template.csv');
    res.send(template);
});

module.exports = router;
