import sqlite3 from 'sqlite3';
import path from 'path';

// Força o sqlite3 a ter um log mais detalhado em dev
const sqlite = sqlite3.verbose();

const dbPath = path.resolve(__dirname, '../../credentials/database.sqlite');

export const db = new sqlite.Database(dbPath, (err) => {
    if (err) {
        console.error('[SQLite] Error connecting to database:', err.message);
    } else {
        console.log('[SQLite] Connected to local database.');
        initDatabase();
    }
});

function initDatabase() {
    db.serialize(() => {
        // Tabela de Calendários
        db.run(`CREATE TABLE IF NOT EXISTS calendars (
            id TEXT PRIMARY KEY,
            summary TEXT NOT NULL,
            description TEXT,
            colorId TEXT,
            backgroundColor TEXT,
            is_shared BOOLEAN DEFAULT 0
        )`);

        // Tabela de Eventos (Cache do Google + Dados Locais mistos)
        db.run(`CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            calendar_id TEXT NOT NULL,
            summary TEXT,
            description TEXT,
            location TEXT,
            start_date TEXT,
            end_date TEXT,
            colorId TEXT,
            local_wa_participants TEXT, -- Array JSON dos numeros que recebem msg
            local_status TEXT, -- Status permanente (done, canceled, postponed)
            FOREIGN KEY (calendar_id) REFERENCES calendars (id) ON DELETE CASCADE
        )`);

        // Add 'location' column if it doesn't exist (for painless upgrades)
        db.run(`ALTER TABLE events ADD COLUMN location TEXT`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                // Ignore expected duplicate column error if it already exists
            }
        });
        
        // Add 'local_status' column if it doesn't exist (for painless upgrades)
        db.run(`ALTER TABLE events ADD COLUMN local_status TEXT`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                // Ignore expected duplicate column error if it already exists
            }
        });

        // Tabela de Contatos (WhatsApp DB Local para evitar duplicatas e salvar cache)
        db.run(`CREATE TABLE IF NOT EXISTS contacts (
            jid TEXT PRIMARY KEY,
            name TEXT,
            notify TEXT,
            last_seen TEXT
        )`);

        console.log('[SQLite] Database tables initialized.');
    });
}

// Funções Utilitárias baseadas em Promises
export const dbQuery = (sql: string, params: any[] = []): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

export const dbRun = (sql: string, params: any[] = []): Promise<sqlite3.RunResult> => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};
