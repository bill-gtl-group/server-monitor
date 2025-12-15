const axios = require('axios');
const https = require('https');
const tls = require('tls');
const { URL } = require('url');

/**
 * Check server health and SSL certificate
 * @param {Object} server - Server configuration
 * @returns {Object} Check result
 */
async function checkServer(server) {
    const result = {
        server_name: server.name,
        server_url: server.url,
        is_online: false,
        response_time: null,
        ssl_valid: null,
        ssl_expires_at: null,
        ssl_days_remaining: null,
        status_code: null,
        error_message: null
    };

    try {
        const startTime = Date.now();
        
        // Perform HTTP/HTTPS request with browser-like headers
        const response = await axios.get(server.url, {
            timeout: 15000, // 15 second timeout (allow time for redirects)
            validateStatus: (status) => status < 500, // Don't throw on 4xx errors
            followRedirect: true, // Explicitly follow redirects
            maxRedirects: 10, // Allow up to 10 redirects
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache',
                'Upgrade-Insecure-Requests': '1'
            },
            httpsAgent: new https.Agent({
                rejectUnauthorized: false, // Allow self-signed certs for checking
                keepAlive: true
            })
        });

        const endTime = Date.now();
        
        result.is_online = response.status >= 200 && response.status < 400;
        result.response_time = endTime - startTime;
        result.status_code = response.status;

        // Check SSL certificate if HTTPS
        if (server.url.startsWith('https://')) {
            const sslInfo = await checkSSLCertificate(server.url);
            result.ssl_valid = sslInfo.valid;
            result.ssl_expires_at = sslInfo.expires_at;
            result.ssl_days_remaining = sslInfo.days_remaining;
            
            // SSL issues (expired, revoked, invalid) are tracked and trigger alerts
            // but do NOT mark the server as offline - only connection failures do that
            // This allows monitoring SSL problems while showing the service as accessible
        }

    } catch (error) {
        // Check if this is an SSL-related error but server is responding
        const isSSLError = error.code && (
            error.code.includes('CERT') || 
            error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
            error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
            error.code === 'SELF_SIGNED_CERT_IN_CHAIN'
        );
        
        // For HTTPS with SSL errors, try to check SSL separately
        if (server.url.startsWith('https://') && isSSLError) {
            try {
                const sslInfo = await checkSSLCertificate(server.url);
                result.ssl_valid = sslInfo.valid;
                result.ssl_expires_at = sslInfo.expires_at;
                result.ssl_days_remaining = sslInfo.days_remaining;
                
                // If we can check SSL, the server is responding (just has SSL issues)
                // Mark as online with SSL warning
                result.is_online = true;
                result.status_code = 200; // Assume successful connection despite SSL
                result.response_time = 0; // We didn't time the full request
                
                console.log(`SSL error for ${server.url}, but server is accessible. SSL valid: ${sslInfo.valid}`);
            } catch (sslError) {
                // Can't even connect to check SSL - server is truly offline
                result.is_online = false;
                result.ssl_valid = false;
                result.error_message = `Connection failed: ${error.message}`;
                console.error(`Complete failure for ${server.url}:`, error.message);
            }
        } else {
            // Non-SSL error or HTTP - server is offline
            result.is_online = false;
            
            // More detailed error logging
            if (error.response) {
                // Server responded with error status
                result.error_message = `HTTP ${error.response.status}: ${error.response.statusText}`;
            } else if (error.request) {
                // Request made but no response received
                result.error_message = error.code ? `${error.code}: ${error.message}` : error.message;
            } else {
                // Error setting up request
                result.error_message = error.message;
            }
            
            console.error(`Check failed for ${server.url}:`, result.error_message);
            
            // Still try to check SSL for HTTPS sites
            if (server.url.startsWith('https://')) {
                try {
                    const sslInfo = await checkSSLCertificate(server.url);
                    result.ssl_valid = sslInfo.valid;
                    result.ssl_expires_at = sslInfo.expires_at;
                    result.ssl_days_remaining = sslInfo.days_remaining;
                } catch (sslError) {
                    result.ssl_valid = false;
                    result.error_message += ` | SSL: ${sslError.message}`;
                }
            }
        }
    }

    return result;
}

/**
 * Check SSL certificate details
 * @param {string} url - HTTPS URL to check
 * @returns {Object} SSL certificate info
 */
function checkSSLCertificate(url) {
    return new Promise((resolve, reject) => {
        try {
            const parsedUrl = new URL(url);
            const hostname = parsedUrl.hostname;
            const port = parsedUrl.port || 443;

            const options = {
                host: hostname,
                port: port,
                servername: hostname,
                rejectUnauthorized: false
            };

            const socket = tls.connect(options, () => {
                const cert = socket.getPeerCertificate();
                
                if (!cert || !cert.valid_to) {
                    socket.destroy();
                    return reject(new Error('No certificate found'));
                }

                const expiryDate = new Date(cert.valid_to);
                const now = new Date();
                const daysRemaining = Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));
                
                const result = {
                    valid: daysRemaining > 0,
                    expires_at: expiryDate.getTime(),
                    days_remaining: daysRemaining,
                    issuer: cert.issuer,
                    subject: cert.subject
                };

                socket.destroy();
                resolve(result);
            });

            socket.on('error', (error) => {
                reject(new Error(`SSL connection failed: ${error.message}`));
            });

            socket.setTimeout(10000, () => {
                socket.destroy();
                reject(new Error('SSL connection timeout'));
            });

        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Determine server health status
 * @param {Object} checkResult - Check result from checkServer
 * @param {number} sslAlertDays - Days threshold for SSL expiry warning
 * @returns {Object} Status information
 */
function getServerStatus(checkResult, sslAlertDays = 30) {
    const status = {
        level: 'healthy', // healthy, warning, critical
        issues: []
    };

    // Check if server is offline
    if (!checkResult.is_online) {
        status.level = 'critical';
        status.issues.push({
            type: 'offline',
            message: `Server is offline: ${checkResult.error_message || 'No response'}`
        });
    }

    // Check SSL certificate
    if (checkResult.server_url.startsWith('https://')) {
        if (checkResult.ssl_valid === false) {
            status.level = 'critical';
            status.issues.push({
                type: 'ssl_failed',
                message: 'SSL certificate is invalid or expired'
            });
        } else if (checkResult.ssl_days_remaining !== null && checkResult.ssl_days_remaining <= sslAlertDays) {
            if (status.level !== 'critical') {
                status.level = 'warning';
            }
            status.issues.push({
                type: 'ssl_expiring',
                message: `SSL certificate expiring in ${checkResult.ssl_days_remaining} days`,
                days_remaining: checkResult.ssl_days_remaining
            });
        }
    }

    // Check response time (warn if > 5 seconds)
    if (checkResult.response_time && checkResult.response_time > 5000) {
        if (status.level === 'healthy') {
            status.level = 'warning';
        }
        status.issues.push({
            type: 'slow_response',
            message: `Slow response time: ${checkResult.response_time}ms`
        });
    }

    return status;
}

module.exports = {
    checkServer,
    checkSSLCertificate,
    getServerStatus
};
