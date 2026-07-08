CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email TEXT UNIQUE,
    is_premium INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_players (
    date TEXT PRIMARY KEY, -- YYYY-MM-DD
    name TEXT NOT NULL,
    height TEXT,
    weight TEXT,
    nationality TEXT,
    shoots TEXT,
    position TEXT,
    draft_status TEXT,
    franchises_count INTEGER,
    teams_played TEXT, -- JSON array of strings
    milestones TEXT, -- JSON array of strings
    awards TEXT, -- JSON array of strings
    hockeydb_url TEXT,
    active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS user_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    score INTEGER NOT NULL,
    clues_revealed INTEGER NOT NULL,
    wrong_guesses INTEGER NOT NULL,
    bet_round INTEGER, -- 1 to 10 or NULL
    won INTEGER NOT NULL, -- 1 for win, 0 for loss
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS practice_players (
    pid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    height TEXT,
    weight TEXT,
    nationality TEXT,
    shoots TEXT,
    position TEXT,
    draft_status TEXT,
    franchises_count INTEGER,
    teams_played TEXT, -- JSON array of objects
    milestones TEXT, -- JSON array of strings
    awards TEXT, -- JSON array of strings
    hockeydb_url TEXT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS error_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    error_type TEXT NOT NULL,
    message TEXT NOT NULL,
    stack_trace TEXT,
    request_path TEXT,
    user_id INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS premium_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL, -- 'grant', 'revoke'
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    duration_seconds INTEGER,
    notes TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);



