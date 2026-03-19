import express from 'express';
import multer from 'multer';
import { WhatsAppClient } from '../providers/whatsapp';
import { GoogleCalendarService } from '../providers/google-calendar';
import { EventCacheService } from '../core/event-cache';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { dbQuery } from '../database/sqlite';

const app = express();
app.use(express.json());
// Use text limit only for specific routes if possible, or just regular json
app.use(express.text({ type: 'application/x-google-credential' })); // Custom type for security

// Serve uploaded files from public/uploads
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use(express.static('public'));

// Multer storage: keep original filename + timestamp to avoid collisions
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_\-]/g, '_');
        cb(null, `${Date.now()}_${base}${ext}`);
    }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50 MB

const PORT = process.env.PORT || 3001;

// Initialize clients
const whatsappClient = new WhatsAppClient();
const googleCalendar = new GoogleCalendarService();
whatsappClient.connect();

// ──────────────────────────────────────
// Event Cache (atualiza a cada 30 min)
// ──────────────────────────────────────
const eventCache = new EventCacheService(async () => {
    const now = Date.now();
    const thirtyDaysMs = 1000 * 60 * 60 * 24 * 30;
    const sixtyDaysMs  = 1000 * 60 * 60 * 24 * 60;
    return googleCalendar.getEvents(now - thirtyDaysMs, now + sixtyDaysMs);
});
// Inicia o cache em background — não bloqueia a subida do servidor
eventCache.init().catch(err => console.error('[EventCache] Falha na inicialização:', err));

// ──────────────────────────────────────
// File Upload API
// ──────────────────────────────────────

app.post('/v1/upload', upload.single('file'), (req: any, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        const fileUrl = `/uploads/${req.file.filename}`;
        res.json({ url: fileUrl, name: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Delete uploaded file
app.delete('/v1/upload/:filename', (req, res) => {
    try {
        const filePath = path.join(uploadsDir, req.params.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// --------------
// WhatsApp API
// --------------

app.get('/v1/whatsapp/contacts', async (req, res) => {
    try {
        let contacts = await whatsappClient.getContacts();
        
        // Fallback: if memory is empty, try loading from SQLite
        if (contacts.length === 0) {
            whatsappClient.addLog('INFO', 'getContacts: memória vazia, buscando do SQLite...');
            const rows = await dbQuery('SELECT jid, name, notify FROM contacts ORDER BY name ASC');
            contacts = rows.map((r: any) => ({ id: r.jid, name: r.name, notify: r.notify }));
            whatsappClient.addLog('INFO', `SQLite fallback: ${contacts.length} contatos encontrados.`);
        }
        
        res.json(contacts);
    } catch (e: any) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});

app.get('/v1/whatsapp/photo/:number', async (req, res) => {
    try {
        const jid = `${req.params.number}@s.whatsapp.net`;
        const url = await whatsappClient.getProfilePic(jid);
        res.json({ url });
    } catch (e: any) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});

app.post('/v1/whatsapp/reset', async (req, res) => {
    try {
        await whatsappClient.resetConnection();
        res.json({ status: 'ok', message: 'Conexão resetada com sucesso. Leia o novo QR Code.' });
    } catch (e: any) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});


app.get('/v1/whatsapp/groups', async (req, res) => {
    console.log('[API] Hit /v1/whatsapp/groups');
    try {
        const groups = await whatsappClient.getGroups();
        res.json(groups);
    } catch (e: any) {
        console.error('[API] Error in /v1/whatsapp/groups:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Alias for convenience
app.get('/v1/config/whatsapp/groups', async (req, res) => {
    console.log('[API] Hit /v1/config/whatsapp/groups');
    try {
        const groups = await whatsappClient.getGroups();
        res.json(groups);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/v1/config/whatsapp/disconnect', async (req, res) => {
    try {
        await whatsappClient.disconnect();
        res.json({ status: 'success' });
    } catch (e: any) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});

// Return all unique contacts stored in the local SQLite DB
app.get('/v1/contacts', async (req, res) => {
    try {
        const rows = await dbQuery(
            `SELECT jid, name, notify, last_seen FROM contacts
             WHERE jid NOT LIKE '%@g.us'  -- exclude group JIDs
             ORDER BY name ASC`
        );
        // Map to the same shape the frontend expects
        const contacts = rows.map((r: any) => ({
            id: r.jid,
            name: r.name || r.notify || r.jid.split('@')[0],
            number: r.jid.split('@')[0]
        }));
        res.json(contacts);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// --------------
// Config API
// --------------

app.get('/v1/config/status', async (req, res) => {
    res.json({
        googleAuthorized: googleCalendar.isAuthorized(),
        whatsapp: {
            status: whatsappClient.connectionStatus,
            qr: whatsappClient.lastQr ? await whatsappClient.getQrData().then(d => d.qr) : null,
            user: (whatsappClient.connectionStatus === 'open') ? await whatsappClient.getUserInfo() : null
        }
    });
});

app.get('/v1/config/calendar-id', (req, res) => {
    try {
        const ids = googleCalendar.getTargetCalendarIds();
        res.json(ids.filter(id => id !== 'primary'));
    } catch (e) {
        res.json([]);
    }
});

app.post('/v1/config/calendar-id', (req, res) => {
    try {
        let body = req.body;
        if (typeof body === 'string') body = JSON.parse(body);
        const emails = body.emails || [];
        googleCalendar.setTargetCalendarIds(emails);
        res.json({ message: 'Agendas atualizadas' });
    } catch (e: any) {
        res.status(500).json({ message: e.message });
    }
});

// --------------
// OAuth APIs
// --------------

app.get('/api/oauth/status', (req, res) => {
    res.json({
        configured: googleCalendar.isOAuthConfigured(),
        authorized: googleCalendar.isOAuthAuthorized()
    });
});

app.post('/api/oauth/upload', upload.single('file'), (req: any, res) => {
    try {
        if (!req.file) return res.status(400).json({ status: 'error', message: 'Nenhum arquivo enviado.' });
        
        const credsDir = path.join(process.cwd(), 'credentials');
        if (!fs.existsSync(credsDir)) fs.mkdirSync(credsDir, { recursive: true });
        
        const destPath = path.join(credsDir, 'google_oauth.json');
        fs.copyFileSync(req.file.path, destPath);
        fs.unlinkSync(req.file.path); 

        googleCalendar.loadCalendars();
        res.json({ status: 'success', message: 'OAuth JSON recebido.' });
    } catch (e: any) {
         res.status(500).json({ status: 'error', message: e.message });
    }
});

app.get('/api/oauth/login', (req, res) => {
    try {
        const redirectUri = `http://${req.get('host')}/api/oauth/callback`;
        const url = googleCalendar.generateAuthUrl(redirectUri);
        res.redirect(url);
    } catch (e: any) {
        res.status(500).send('Erro ao gerar URL de login: ' + e.message);
    }
});

app.get('/api/oauth/callback', async (req, res) => {
    try {
        const code = req.query.code as string;
        if (!code) return res.status(400).send('Código não encontrado');
        
        const redirectUri = `http://${req.get('host')}/api/oauth/callback`;
        await googleCalendar.handleOAuthCallback(code, redirectUri);
        
        res.send('<script>window.location.href="/#config";</script>');
    } catch (e: any) {
         res.status(500).send('Erro ao processar callback: ' + e.message);
    }
});

app.post('/api/oauth/logout', (req, res) => {
    try {
        googleCalendar.logoutOAuth();
        res.json({ status: 'success' });
    } catch (e: any) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});

app.post('/v1/config/reboot', async (req, res) => {
    try {
        console.log('[System] Reboot requested via API. Exiting process...');
        res.json({ status: 'success', message: 'Rebooting...' });
        setTimeout(() => process.exit(1), 1000);
    } catch (e: any) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});

app.get('/v1/system/logs', (req, res) => {
    try {
        const logPath = path.join(process.cwd(), 'system.log');
        if (fs.existsSync(logPath)) {
            const content = fs.readFileSync(logPath, 'utf8');
            res.json({ logs: content.slice(-5000) });
        } else {
            res.json({ logs: "Arquivo de log ainda não criado." });
        }
    } catch (e: any) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});

// --------------
// Calendar APIs
// --------------

app.get('/v1/events/calendars', async (req, res) => {
    try {
        googleCalendar.loadCalendars();
        if (!googleCalendar.isAuthorized()) return res.json([]);
        const cals = await googleCalendar.getCalendars();
        res.json(cals);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/v1/events/calendars', async (req, res) => {
    try {
        if (!googleCalendar.isAuthorized()) {
            return res.status(412).json({ error: 'Google Calendar não configurado.' });
        }
        let body = req.body;
        if (typeof body === 'string') body = JSON.parse(body);

        const summary = body.summary;
        const description = body.description || '';
        
        if (!summary) return res.status(400).json({ error: 'O nome da agenda é obrigatório.' });

        const created = await googleCalendar.createCalendar(summary, description);
        res.json(created);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/v1/events', async (req, res) => {
    try {
        // Serve do cache em memória — atualizado automaticamente a cada 30 min ou via refresh
        const events = eventCache.getEvents();
        const lastUpdated = eventCache.getLastUpdated();
        res.set('X-Cache-Updated', lastUpdated ? lastUpdated.toISOString() : 'never');
        res.json(events);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Endpoint para forçar refresh manual do cache
app.post('/v1/events/refresh', async (req, res) => {
    try {
        if (!googleCalendar.isAuthorized()) {
            return res.status(412).json({ error: 'Google Calendar não configurado.' });
        }
        console.log('[EventCache] Refresh manual solicitado via API.');
        await eventCache.refresh();
        const lastUpdated = eventCache.getLastUpdated();
        res.json({ success: true, events: eventCache.getEvents().length, lastUpdated });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/v1/events', async (req, res) => {
    try {
        if (!googleCalendar.isAuthorized()) {
            return res.status(412).json({ error: 'Google Calendar não configurado.' });
        }
        let body = req.body;
        if (typeof body === 'string') body = JSON.parse(body);

        const calendarId = body.calendarId || 'primary';
        const event = {
            summary: body.summary,
            location: body.location,
            description: body.description,
            colorId: body.colorId,
            start: { dateTime: body.start },
            end: { dateTime: body.end }
        };
        const created = await googleCalendar.createEvent(calendarId, event);
        whatsappClient.sendEventConfirmation(created).catch(err => console.error('Confirmation Error:', err));
        
        // Atualiza o cache local IMEDIATAMENTE antes de responder à requisição
        eventCache.addLocalEvent(created);
        eventCache.refresh().catch(err => console.error('[EventCache] Erro ao atualizar após criar:', err));
        
        res.json(created);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/v1/events/:id', async (req, res) => {
    try {
        console.log(`[API] PUT /v1/events/${req.params.id} Body:`, JSON.stringify(req.body));
        
        if (!googleCalendar.isAuthorized()) {
            return res.status(412).json({ error: 'Google Calendar não configurado.' });
        }
        
        let body = req.body;
        if (typeof body === 'string') body = JSON.parse(body);

        const calendarId = body.calendarId || 'primary';
        const event: any = {
            summary: body.summary,
            location: body.location,
            description: body.description,
            colorId: body.colorId,
            start: { dateTime: body.start },
            end: { dateTime: body.end },
            // Injetar status se vier explícito no body
            local_status: body.local_status || body.status
        };

        const updated = await googleCalendar.updateEvent(calendarId, req.params.id, event);
        whatsappClient.sendEventConfirmation(updated, true).catch(err => console.error('Confirmation Update Error:', err));
        
        // Atualiza o cache local IMEDIATAMENTE para matar a inconsistência
        eventCache.updateLocalEvent(updated);
        eventCache.refresh().catch(err => console.error('[EventCache] Erro ao atualizar após editar:', err));
        
        res.json(updated);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/v1/events/:id', async (req, res) => {
    try {
        if (!googleCalendar.isAuthorized()) {
            return res.status(412).json({ error: 'Google Calendar não configurado.' });
        }
        const calendarId = req.query.calendarId as string || 'primary';
        try {
            const event = await googleCalendar.getEvent(calendarId, req.params.id);
            whatsappClient.sendEventCancellation(event).catch(err => console.error('Cancellation Error:', err));
        } catch (err) {
            console.warn('Could not fetch event for cancellation notice:', err);
        }
        await googleCalendar.deleteEvent(calendarId, req.params.id);
        
        // Remove do cache local imediatamente
        eventCache.removeLocalEvent(req.params.id);
        eventCache.refresh().catch(err => console.error('[EventCache] Erro ao atualizar após deletar:', err));
        
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/v1/config/notifications', (req, res) => {
    try {
        const notificationFile = path.join(process.cwd(), 'notification.json');
        if (fs.existsSync(notificationFile)) {
            const data = JSON.parse(fs.readFileSync(notificationFile, 'utf8'));
            res.json(data);
        } else {
            res.json({ contactNo: null });
        }
    } catch (e: any) {
        res.json({ contactNo: null });
    }
});

app.post('/v1/config/notifications', (req, res) => {
    try {
        let body = req.body;
        if (typeof body === 'string') body = JSON.parse(body);
        const notificationFile = path.join(process.cwd(), 'notification.json');
        fs.writeFileSync(notificationFile, JSON.stringify({ contactNo: body.contactNo || null }));
        res.json({ status: 'success', message: body.contactNo ? 'Número de notificação salvo.' : 'Notificações desativadas.' });
    } catch (e: any) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});

app.get('/v1/debug', (req, res) => {
    try {
        const credsDir = path.join(process.cwd(), 'credentials');
        const files = fs.existsSync(credsDir) ? fs.readdirSync(credsDir) : [];
        res.json({
            cwd: process.cwd(),
            credsDir,
            files,
            env: {
                PORT: process.env.PORT,
                NODE_ENV: process.env.NODE_ENV
            }
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/v1/system/backup', (req, res) => {
    try {
        const archive = archiver('zip', { zlib: { level: 9 } });

        res.attachment(`agendabot_backup_${Date.now()}.zip`);
        archive.pipe(res);

        // Add credentials folder
        const credsDir = path.join(process.cwd(), 'credentials');
        if (fs.existsSync(credsDir)) {
            archive.directory(credsDir, 'credentials');
        }

        // Add auth_info_baileys folder (WhatsApp session)
        const waDir = path.join(process.cwd(), 'auth_info_baileys');
        if (fs.existsSync(waDir)) {
            archive.directory(waDir, 'auth_info_baileys');
        }

        // Finalize the stream
        archive.finalize();
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`[Server] Baileys Bridge listening on port ${PORT}`);
});
