"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const whatsapp_1 = require("./whatsapp");
const google_calendar_1 = require("./google-calendar");
require("dotenv/config");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
// Use text limit only for specific routes if possible, or just regular json
app.use(express_1.default.text({ type: 'application/x-google-credential' })); // Custom type for security
// Serve uploaded files from public/uploads
const uploadsDir = path_1.default.join(process.cwd(), 'public', 'uploads');
if (!fs_1.default.existsSync(uploadsDir))
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
app.use(express_1.default.static('public'));
// Multer storage: keep original filename + timestamp to avoid collisions
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        const base = path_1.default.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_\-]/g, '_');
        cb(null, `${Date.now()}_${base}${ext}`);
    }
});
const upload = (0, multer_1.default)({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50 MB
const PORT = process.env.PORT || 3001;
// Initialize clients
const whatsappClient = new whatsapp_1.WhatsAppClient();
const googleCalendar = new google_calendar_1.GoogleCalendarService();
whatsappClient.connect();
// ──────────────────────────────────────
// File Upload API
// ──────────────────────────────────────
app.post('/v1/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file)
            return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        const fileUrl = `/uploads/${req.file.filename}`;
        res.json({ url: fileUrl, name: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// Delete uploaded file
app.delete('/v1/upload/:filename', (req, res) => {
    try {
        const filePath = path_1.default.join(uploadsDir, req.params.filename);
        if (fs_1.default.existsSync(filePath))
            fs_1.default.unlinkSync(filePath);
        res.json({ success: true });
    }
    catch (e) {
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
    }
    catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});
app.get('/v1/whatsapp/photo/:number', async (req, res) => {
    try {
        const jid = `${req.params.number}@s.whatsapp.net`;
        const url = await whatsappClient.getProfilePic(jid);
        res.json({ url });
    }
    catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});
app.post('/v1/whatsapp/reset', async (req, res) => {
    try {
        await whatsappClient.resetConnection();
        res.json({ status: 'ok', message: 'Conexão resetada com sucesso. Leia o novo QR Code.' });
    }
    catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});
app.get('/v1/whatsapp/groups', async (req, res) => {
    console.log('[API] Hit /v1/whatsapp/groups');
    try {
        const groups = await whatsappClient.getGroups();
        res.json(groups);
    }
    catch (e) {
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
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/v1/config/whatsapp/disconnect', async (req, res) => {
    try {
        await whatsappClient.disconnect();
        res.json({ status: 'success' });
    }
    catch (e) {
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
    }
    catch (e) {
        res.json([]);
    }
});
app.post('/v1/config/calendar-id', (req, res) => {
    try {
        let body = req.body;
        if (typeof body === 'string')
            body = JSON.parse(body);
        const emails = body.emails || [];
        googleCalendar.setTargetCalendarIds(emails);
        res.json({ message: 'Agendas atualizadas' });
    }
    catch (e) {
        res.status(500).json({ message: e.message });
    }
});
app.get('/v1/config/google-credentials', (req, res) => {
    try {
        const credsDir = path_1.default.join(process.cwd(), 'credentials');
        if (!fs_1.default.existsSync(credsDir))
            return res.json([]);
        const files = fs_1.default.readdirSync(credsDir).filter(f => f.endsWith('.json'));
        const result = files.map(f => {
            try {
                const data = JSON.parse(fs_1.default.readFileSync(path_1.default.join(credsDir, f), 'utf-8'));
                return { fileName: f, email: data.client_email || f };
            }
            catch (e) {
                return { fileName: f, email: f };
            }
        });
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/v1/config/google-credentials', (req, res) => {
    try {
        let body = req.body;
        // If it was sent as text, parse it
        if (typeof body === 'string')
            body = JSON.parse(body);
        if (!body.client_email)
            throw new Error("Invalid Service Account JSON");
        const credsDir = path_1.default.join(process.cwd(), 'credentials');
        if (!fs_1.default.existsSync(credsDir))
            fs_1.default.mkdirSync(credsDir, { recursive: true });
        const fileName = `google_${Date.now()}.json`;
        fs_1.default.writeFileSync(path_1.default.join(credsDir, fileName), JSON.stringify(body, null, 2));
        googleCalendar.loadCalendars();
        res.json({ status: 'success', message: 'Credencial adicionada.' });
    }
    catch (e) {
        res.status(400).json({ status: 'error', message: e.message });
    }
});
app.delete('/v1/config/google-credentials/:fileName', (req, res) => {
    try {
        const filePath = path_1.default.join(process.cwd(), 'credentials', req.params.fileName);
        if (fs_1.default.existsSync(filePath)) {
            fs_1.default.unlinkSync(filePath);
            googleCalendar.loadCalendars();
            res.json({ status: 'success' });
        }
        else {
            res.status(404).json({ status: 'error', message: 'Not found' });
        }
    }
    catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});
app.post('/v1/config/reboot', async (req, res) => {
    try {
        console.log('[System] Reboot requested via API. Exiting process...');
        res.json({ status: 'success', message: 'Rebooting...' });
        setTimeout(() => process.exit(1), 1000);
    }
    catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});
app.get('/v1/system/logs', (req, res) => {
    try {
        const logPath = path_1.default.join(process.cwd(), 'system.log');
        if (fs_1.default.existsSync(logPath)) {
            const content = fs_1.default.readFileSync(logPath, 'utf8');
            res.json({ logs: content.slice(-5000) });
        }
        else {
            res.json({ logs: "Arquivo de log ainda não criado." });
        }
    }
    catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});
// --------------
// Calendar APIs
// --------------
app.get('/v1/events/calendars', async (req, res) => {
    try {
        if (!googleCalendar.isAuthorized())
            return res.json([]);
        const cals = await googleCalendar.getCalendars();
        res.json(cals);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.get('/v1/events', async (req, res) => {
    try {
        if (!googleCalendar.isAuthorized())
            return res.json([]);
        const now = Date.now();
        const thirtyDaysMs = 1000 * 60 * 60 * 24 * 30;
        const sixtyDaysMs = 1000 * 60 * 60 * 24 * 60;
        const events = await googleCalendar.getEvents(now - thirtyDaysMs, now + sixtyDaysMs);
        res.json(events);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/v1/events', async (req, res) => {
    try {
        if (!googleCalendar.isAuthorized()) {
            return res.status(412).json({ error: 'Google Calendar não configurado.' });
        }
        let body = req.body;
        if (typeof body === 'string')
            body = JSON.parse(body);
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
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.put('/v1/events/:id', async (req, res) => {
    try {
        if (!googleCalendar.isAuthorized()) {
            return res.status(412).json({ error: 'Google Calendar não configurado.' });
        }
        let body = req.body;
        if (typeof body === 'string')
            body = JSON.parse(body);
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
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.delete('/v1/events/:id', async (req, res) => {
    try {
        if (!googleCalendar.isAuthorized()) {
            return res.status(412).json({ error: 'Google Calendar não configurado.' });
        }
        const calendarId = req.query.calendarId || 'primary';
        try {
            const event = await googleCalendar.getEvent(calendarId, req.params.id);
            whatsappClient.sendEventCancellation(event).catch(err => console.error('Cancellation Error:', err));
        }
        catch (err) {
            console.warn('Could not fetch event for cancellation notice:', err);
        }
        await googleCalendar.deleteEvent(calendarId, req.params.id);
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.get('/v1/config/notifications', (req, res) => {
    try {
        const notificationFile = path_1.default.join(process.cwd(), 'notification.json');
        if (fs_1.default.existsSync(notificationFile)) {
            const data = JSON.parse(fs_1.default.readFileSync(notificationFile, 'utf8'));
            res.json(data);
        }
        else {
            res.json({ contactNo: null });
        }
    }
    catch (e) {
        res.json({ contactNo: null });
    }
});
app.post('/v1/config/notifications', (req, res) => {
    try {
        let body = req.body;
        if (typeof body === 'string')
            body = JSON.parse(body);
        const notificationFile = path_1.default.join(process.cwd(), 'notification.json');
        fs_1.default.writeFileSync(notificationFile, JSON.stringify({ contactNo: body.contactNo || null }));
        res.json({ status: 'success', message: body.contactNo ? 'Número de notificação salvo.' : 'Notificações desativadas.' });
    }
    catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});
app.listen(PORT, () => {
    console.log(`[Server] Baileys Bridge listening on port ${PORT}`);
});
