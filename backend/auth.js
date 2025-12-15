const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

/**
 * Load authentication configuration
 */
function loadAuthConfig() {
    try {
        const configPath = path.join(__dirname, 'data', 'config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return config.auth || null;
        }
    } catch (error) {
        console.error('Error loading auth config:', error.message);
    }
    return null;
}

/**
 * Verify user credentials
 * @param {string} username 
 * @param {string} password 
 * @returns {Promise<boolean>}
 */
async function verifyCredentials(username, password) {
    const authConfig = loadAuthConfig();
    
    if (!authConfig) {
        // No auth configured, allow access (for initial setup)
        return username === 'admin' && password === 'admin';
    }
    
    if (username !== authConfig.username) {
        return false;
    }
    
    // If password is hashed (starts with $2b$)
    if (authConfig.password && authConfig.password.startsWith('$2b$')) {
        return await bcrypt.compare(password, authConfig.password);
    }
    
    // Plain text password (for initial setup)
    return password === authConfig.password;
}

/**
 * Hash a password
 * @param {string} password 
 * @returns {Promise<string>}
 */
async function hashPassword(password) {
    return await bcrypt.hash(password, 10);
}

/**
 * Middleware to check if user is authenticated
 */
function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) {
        return next();
    }
    
    // AJAX requests get JSON error
    if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    // Regular requests get redirected to login
    res.redirect('/login');
}

module.exports = {
    verifyCredentials,
    hashPassword,
    requireAuth,
    loadAuthConfig
};
