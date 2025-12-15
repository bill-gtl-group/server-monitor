const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { initDatabase } = require('./database');
const { startScheduler } = require('./scheduler');
const { verifyCredentials, requireAuth } = require('./auth');
const statusRouter = require('./api/status');
const alertsRouter = require('./api/alerts');
const serversRouter = require('./api/servers');
const configRouter = require('./api/config');

const app = express();
const PORT = process.env.PORT || 3000;

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'server-monitor-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        secure: false // Set to true if using HTTPS
    }
}));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('✅ Created data directory');
}

// Initialize database
initDatabase();
console.log('✅ Database initialized');

// Authentication routes
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    const isValid = await verifyCredentials(username, password);
    
    if (isValid) {
        req.session.authenticated = true;
        req.session.username = username;
        res.json({ success: true, message: 'Login successful' });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

app.get('/api/auth/check', (req, res) => {
    res.json({ 
        authenticated: req.session && req.session.authenticated === true,
        username: req.session?.username
    });
});

// Protected API Routes (require authentication)
app.use('/api/status', requireAuth, statusRouter);
app.use('/api/alerts', requireAuth, alertsRouter);
app.use('/api/servers', requireAuth, serversRouter);
app.use('/api/config', requireAuth, configRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Root endpoint - redirect to dashboard if authenticated, otherwise login
app.get('/', (req, res) => {
    if (req.session && req.session.authenticated) {
        res.redirect('/dashboard.html');
    } else {
        res.redirect('/login.html');
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.stack);
    res.status(500).json({ 
        error: 'Internal Server Error',
        message: err.message 
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server Monitor API running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    
    // Start the scheduler for periodic checks
    startScheduler();
    console.log('⏰ Scheduler started - checking servers every 5 minutes');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully');
    process.exit(0);
});
