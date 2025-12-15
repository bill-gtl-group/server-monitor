const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data', 'alerts.db');
let db;

function initDatabase() {
    // Create data directory if it doesn't exist
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    // Open database connection
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    // Create tables
    db.exec(`
        CREATE TABLE IF NOT EXISTS alerts (
            id TEXT PRIMARY KEY,
            server_name TEXT NOT NULL,
            server_url TEXT NOT NULL,
            issue_type TEXT NOT NULL,
            issue_details TEXT,
            status TEXT NOT NULL DEFAULT 'new',
            created_at INTEGER NOT NULL,
            last_alerted_at INTEGER NOT NULL,
            resolved_at INTEGER,
            alert_count INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS server_checks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_name TEXT NOT NULL,
            server_url TEXT NOT NULL,
            checked_at INTEGER NOT NULL,
            is_online BOOLEAN NOT NULL,
            response_time INTEGER,
            ssl_valid BOOLEAN,
            ssl_expires_at INTEGER,
            ssl_days_remaining INTEGER,
            ssl_issuer TEXT,
            status_code INTEGER,
            error_message TEXT,
            consecutive_failures INTEGER DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
        CREATE INDEX IF NOT EXISTS idx_alerts_server ON alerts(server_url);
        CREATE INDEX IF NOT EXISTS idx_checks_server ON server_checks(server_url);
        CREATE INDEX IF NOT EXISTS idx_checks_time ON server_checks(checked_at);
    `);

    // Migration: Add ssl_issuer column if it doesn't exist (for existing databases)
    try {
        db.exec(`ALTER TABLE server_checks ADD COLUMN ssl_issuer TEXT`);
        console.log('✅ Migration: Added ssl_issuer column');
    } catch (e) {
        // Column already exists, ignore error
    }

    console.log('✅ Database tables created/verified');
}

function getDatabase() {
    if (!db) {
        initDatabase();
    }
    return db;
}

// Alert operations
function createAlert(alertData) {
    const db = getDatabase();
    const stmt = db.prepare(`
        INSERT INTO alerts (id, server_name, server_url, issue_type, issue_details, status, created_at, last_alerted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const now = Date.now();
    return stmt.run(
        alertData.id,
        alertData.server_name,
        alertData.server_url,
        alertData.issue_type,
        alertData.issue_details,
        'new',
        now,
        now
    );
}

function getActiveAlerts() {
    const db = getDatabase();
    const stmt = db.prepare(`
        SELECT * FROM alerts 
        WHERE status IN ('new', 'in_process')
        ORDER BY created_at DESC
    `);
    return stmt.all();
}

function getAllAlerts(limit = 100) {
    const db = getDatabase();
    const stmt = db.prepare(`
        SELECT * FROM alerts 
        ORDER BY created_at DESC
        LIMIT ?
    `);
    return stmt.all(limit);
}

function getAlertById(id) {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM alerts WHERE id = ?');
    return stmt.get(id);
}

function updateAlertStatus(id, status) {
    const db = getDatabase();
    const now = Date.now();
    const stmt = db.prepare(`
        UPDATE alerts 
        SET status = ?, resolved_at = ?
        WHERE id = ?
    `);
    
    const resolvedAt = (status === 'done' || status === 'abort') ? now : null;
    return stmt.run(status, resolvedAt, id);
}

function updateAlertLastAlerted(id) {
    const db = getDatabase();
    const stmt = db.prepare(`
        UPDATE alerts 
        SET last_alerted_at = ?, alert_count = alert_count + 1
        WHERE id = ?
    `);
    return stmt.run(Date.now(), id);
}

function getAlertByServerAndType(serverUrl, issueType) {
    const db = getDatabase();
    const stmt = db.prepare(`
        SELECT * FROM alerts 
        WHERE server_url = ? AND issue_type = ? AND status IN ('new', 'in_process')
        LIMIT 1
    `);
    return stmt.get(serverUrl, issueType);
}

// Server check operations
function recordServerCheck(checkData) {
    const db = getDatabase();
    const stmt = db.prepare(`
        INSERT INTO server_checks (
            server_name, server_url, checked_at, is_online, 
            response_time, ssl_valid, ssl_expires_at, ssl_days_remaining,
            ssl_issuer, status_code, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    return stmt.run(
        checkData.server_name,
        checkData.server_url,
        Date.now(),
        checkData.is_online ? 1 : 0,  // Convert boolean to integer
        checkData.response_time,
        checkData.ssl_valid === null ? null : (checkData.ssl_valid ? 1 : 0),  // Convert boolean to integer
        checkData.ssl_expires_at,
        checkData.ssl_days_remaining,
        checkData.ssl_issuer || null,  // SSL certificate issuer (e.g., Let's Encrypt, Sectigo)
        checkData.status_code,
        checkData.error_message
    );
}

function getLatestServerChecks() {
    const db = getDatabase();
    const stmt = db.prepare(`
        SELECT * FROM server_checks
        WHERE id IN (
            SELECT MAX(id) 
            FROM server_checks 
            GROUP BY server_url
        )
        ORDER BY server_name
    `);
    return stmt.all();
}

function getServerCheckHistory(serverUrl, limit = 50) {
    const db = getDatabase();
    const stmt = db.prepare(`
        SELECT * FROM server_checks
        WHERE server_url = ?
        ORDER BY checked_at DESC
        LIMIT ?
    `);
    return stmt.all(serverUrl, limit);
}

function getLastCheckForServer(serverUrl) {
    const db = getDatabase();
    const stmt = db.prepare(`
        SELECT * FROM server_checks
        WHERE server_url = ?
        ORDER BY checked_at DESC
        LIMIT 1
    `);
    return stmt.get(serverUrl);
}

function updateConsecutiveFailures(serverUrl, consecutiveFailures) {
    const db = getDatabase();
    const stmt = db.prepare(`
        UPDATE server_checks
        SET consecutive_failures = ?
        WHERE id = (
            SELECT id FROM server_checks
            WHERE server_url = ?
            ORDER BY checked_at DESC
            LIMIT 1
        )
    `);
    return stmt.run(consecutiveFailures, serverUrl);
}

function cleanOldChecks(daysToKeep = 30) {
    const db = getDatabase();
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    const stmt = db.prepare('DELETE FROM server_checks WHERE checked_at < ?');
    const result = stmt.run(cutoffTime);
    console.log(`🧹 Cleaned ${result.changes} old check records`);
    return result;
}

// Close database connection
function closeDatabase() {
    if (db) {
        db.close();
        console.log('✅ Database connection closed');
    }
}

module.exports = {
    initDatabase,
    getDatabase,
    createAlert,
    getActiveAlerts,
    getAllAlerts,
    getAlertById,
    updateAlertStatus,
    updateAlertLastAlerted,
    getAlertByServerAndType,
    recordServerCheck,
    getLatestServerChecks,
    getServerCheckHistory,
    getLastCheckForServer,
    updateConsecutiveFailures,
    cleanOldChecks,
    closeDatabase
};
