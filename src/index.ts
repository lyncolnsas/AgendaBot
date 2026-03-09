import express from 'express';
import multer from 'multer';
import { WhatsAppClient } from './whatsapp';
import { GoogleCalendarService } from './google-calendar';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

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
        const contacts = await whatsappClient.getContacts();
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

app.get('/v1/config/google-credentials', (req, res) => {
    try {
        const credsDir = path.join(process.cwd(), 'credentials');
        if (!fs.existsSync(credsDir)) return res.json([]);
        const files = fs.readdirSync(credsDir).filter(f => f.endsWith('.json'));
        const result = files.map(f => {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(credsDir, f), 'utf-8'));
                return { fileName: f, email: data.client_email || f };
            } catch (e) {
                return { fileName: f, email: f };
            }
        });
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/v1/config/google-credentials', (req, res) => {
    try {
        let body = req.body;
        // If it was sent as text, parse it
        if (typeof body === 'string') body = JSON.parse(body);

        if (!body.client_email) throw new Error("Invalid Service Account JSON");

        const credsDir = path.join(process.cwd(), 'credentials');
        if (!fs.existsSync(credsDir)) fs.mkdirSync(credsDir, { recursive: true });

        const fileName = `google_${Date.now()}.json`;
        fs.writeFileSync(path.join(credsDir, fileName), JSON.stringify(body, null, 2));

        googleCalendar.loadCalendars();
        res.json({ status: 'success', message: 'Credencial adicionada.' });
    } catch (e: any) {
        res.status(400).json({ status: 'error', message: e.message });
    }
});

app.delete('/v1/config/google-credentials/:fileName', (req, res) => {
    try {
        const filePath = path.join(process.cwd(), 'credentials', req.params.fileName);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            googleCalendar.loadCalendars();
            res.json({ status: 'success' });
        } else {
            res.status(404).json({ status: 'error', message: 'Not found' });
        }
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
        if (!googleCalendar.isAuthorized()) return res.json([]);
        const cals = await googleCalendar.getCalendars();
        res.json(cals);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/v1/events', async (req, res) => {
    try {
        if (!googleCalendar.isAuthorized()) return res.json([]);
        const now = Date.now();
        const thirtyDaysMs = 1000 * 60 * 60 * 24 * 30;
        const sixtyDaysMs = 1000 * 60 * 60 * 24 * 60;
        const events = await googleCalendar.getEvents(now - thirtyDaysMs, now + sixtyDaysMs);
        res.json(events);
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
        res.json(created);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/v1/events/:id', async (req, res) => {
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
        const updated = await googleCalendar.updateEvent(calendarId, req.params.id, event);
        whatsappClient.sendEventConfirmation(updated, true).catch(err => console.error('Confirmation Update Error:', err));
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

app.listen(PORT, () => {
    console.log(`[Server] Baileys Bridge listening on port ${PORT}`);
});
