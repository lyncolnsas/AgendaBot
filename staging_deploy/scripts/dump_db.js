
const sqlite3 = require('sqlite3');
const fs = require('fs');
const dbPath = 'c:/Users/lyncoln.silva/OneDrive - Adventistas/Documentos/Projetos-/AgendaBot/backups/backup_manual/credentials/database.sqlite';
const db = new sqlite3.Database(dbPath);

console.log('Searching for events...');
db.all("SELECT id, summary, local_status, start_date FROM events WHERE summary LIKE '%comunica%'", (err, rows) => {
    if (err) {
        console.error('DB Error:', err);
    } else {
        console.log(`Found ${rows.length} rows`);
        fs.writeFileSync('c:/Users/lyncoln.silva/OneDrive - Adventistas/Documentos/Projetos-/AgendaBot/backups/backup_manual/tmp_db_dump.json', JSON.stringify(rows, null, 2));
        console.log('Dumped to tmp_db_dump.json');
    }
    db.close();
});
