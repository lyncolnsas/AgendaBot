
const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = 'c:\\Users\\lyncoln.silva\\OneDrive - Adventistas\\Documentos\\Projetos-\\AgendaBot\\backups\\backup_manual\\credentials\\database.sqlite';
const db = new sqlite3.Database(dbPath);

db.all("SELECT id, summary, local_status FROM events WHERE summary LIKE '%comunicação ANP%'", (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log(JSON.stringify(rows, null, 2));
    }
    db.close();
});
