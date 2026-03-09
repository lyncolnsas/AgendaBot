"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleCalendarService = void 0;
const googleapis_1 = require("googleapis");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class GoogleCalendarService {
    credentialsDir = path_1.default.join(process.cwd(), 'credentials');
    calendarIdFile = path_1.default.join(process.cwd(), 'calendar_id.txt');
    calendarClients = new Map();
    constructor() {
        this.loadCalendars();
    }
    loadCalendars() {
        this.calendarClients.clear();
        if (!fs_1.default.existsSync(this.credentialsDir)) {
            fs_1.default.mkdirSync(this.credentialsDir, { recursive: true });
            return;
        }
        const files = fs_1.default.readdirSync(this.credentialsDir).filter(f => f.endsWith('.json'));
        if (files.length === 0) {
            console.log('[Calendar] No service account credentials (.json) found.');
            return;
        }
        for (const file of files) {
            if (!this.calendarClients.has(file)) {
                try {
                    const keyPath = path_1.default.join(this.credentialsDir, file);
                    const auth = new googleapis_1.google.auth.GoogleAuth({
                        keyFile: keyPath,
                        scopes: ['https://www.googleapis.com/auth/calendar'],
                    });
                    const client = googleapis_1.google.calendar({ version: 'v3', auth });
                    this.calendarClients.set(file, client);
                    console.log(`[Calendar] Loaded credential: ${file}`);
                }
                catch (error) {
                    console.error(`[Calendar] Error loading credential ${file}:`, error.message);
                }
            }
        }
    }
    isAuthorized() {
        return this.calendarClients.size > 0;
    }
    getTargetCalendarIds() {
        const ids = [];
        try {
            if (fs_1.default.existsSync(this.calendarIdFile)) {
                const raw = fs_1.default.readFileSync(this.calendarIdFile, 'utf8').trim();
                for (const id of raw.split(',')) {
                    const cleanId = id.trim();
                    if (cleanId)
                        ids.push(cleanId);
                }
            }
        }
        catch (error) {
            console.error('[Calendar] Error reading calendar_id.txt:', error.message);
        }
        if (ids.length === 0)
            ids.push('primary');
        return ids;
    }
    setTargetCalendarIds(ids) {
        fs_1.default.writeFileSync(this.calendarIdFile, ids.join(','));
    }
    async syncCalendarList(client) {
        const targetIds = this.getTargetCalendarIds();
        try {
            const list = await client.calendarList.list();
            const existingIds = (list.data.items || []).map(i => i.id);
            for (const calendarId of targetIds) {
                if (calendarId === 'primary')
                    continue;
                if (!existingIds.includes(calendarId)) {
                    console.log(`[Calendar] Syncing calendar ${calendarId}`);
                    try {
                        await client.calendarList.insert({
                            requestBody: { id: calendarId }
                        });
                    }
                    catch (e) {
                        // Might fail if not shared correctly
                    }
                }
            }
        }
        catch (error) {
            console.error('[Calendar] Could not sync calendar list:', error.message);
        }
    }
    async getCalendars() {
        const result = [];
        for (const [_, client] of this.calendarClients.entries()) {
            await this.syncCalendarList(client);
            try {
                const list = await client.calendarList.list();
                if (list.data.items) {
                    for (const entry of list.data.items) {
                        const alreadyAdded = result.some(m => m.id === entry.id);
                        if (!alreadyAdded) {
                            result.push({
                                id: entry.id,
                                summary: entry.summary,
                                colorId: entry.colorId,
                                backgroundColor: entry.backgroundColor
                            });
                        }
                    }
                }
            }
            catch (e) {
                console.error('[Calendar] Error fetching calendar list', e.message);
            }
        }
        return result;
    }
    async getEvents(timeMin, timeMax) {
        if (!this.isAuthorized()) {
            throw new Error('Google Calendar is not configured.');
        }
        const allEvents = [];
        const targetIds = this.getTargetCalendarIds();
        for (const [_, client] of this.calendarClients.entries()) {
            for (const calendarId of targetIds) {
                try {
                    const response = await client.events.list({
                        calendarId: calendarId,
                        timeMin: new Date(timeMin).toISOString(),
                        timeMax: new Date(timeMax).toISOString(),
                        orderBy: 'startTime',
                        singleEvents: true,
                    });
                    if (response.data.items) {
                        for (const event of response.data.items) {
                            allEvents.push({ ...event, calendarId });
                        }
                    }
                }
                catch (error) {
                    // It's common for some service accounts not to have access to some calendars
                }
            }
        }
        const uniqueEventsMap = new Map();
        for (const event of allEvents) {
            if (event.id)
                uniqueEventsMap.set(event.id, event);
        }
        const sortedEvents = Array.from(uniqueEventsMap.values()).sort((a, b) => {
            const startA = a.start?.dateTime || a.start?.date || '';
            const startB = b.start?.dateTime || b.start?.date || '';
            return startA.localeCompare(startB);
        });
        // Restore full description (with metadata tags) from _raw so the frontend
        // always receives the complete event data including checklists and participants
        for (const event of sortedEvents) {
            const raw = event.extendedProperties?.private?._raw;
            if (raw) {
                event.description = raw;
            }
        }
        return sortedEvents;
    }
    processEventMetadata(event) {
        const description = event.description || '';
        // Save the FULL raw description (with all [TAG:...] metadata) into extendedProperties._raw
        // This is the source of truth and will be restored on getEvents()
        event.extendedProperties = event.extendedProperties || {};
        event.extendedProperties.private = event.extendedProperties.private || {};
        if (description) {
            event.extendedProperties.private._raw = description;
        }
        // Also extract named tags into individual extendedProperties for quick access
        const tags = {};
        const tagRegex = /\[(\w+):\s*(.+?)\]/g;
        let match;
        while ((match = tagRegex.exec(description)) !== null) {
            const key = match[1].toUpperCase();
            if (key !== 'CHECKLIST' && key !== 'WA_IDS') { // Don't overwrite complex multi-value tags
                tags[key] = match[2].trim();
            }
        }
        Object.assign(event.extendedProperties.private, tags);
        // Remove all [TAG:...] lines from description — show only human-readable text in Google Calendar
        let cleanDesc = description
            .split('\n')
            .filter((line) => !line.trim().match(/^\[.+:.+\]/))
            .join('\n')
            .trim();
        // Also extract and format the checklist to be visible in Google Calendar
        const checklistMatches = [...description.matchAll(/\[CHECKLIST:([^\]]+)\]/g)];
        if (checklistMatches.length > 0) {
            let checklistSummary = "\n\n📋 LISTA DE TAREFAS:";
            for (const match of checklistMatches) {
                const parts = match[1].split('|');
                const title = parts[0] || 'Tarefas';
                const items = parts.slice(1);
                checklistSummary += `\n*${title}*`;
                for (const item of items) {
                    const colonIdx = item.lastIndexOf(':');
                    if (colonIdx !== -1) {
                        const itemText = item.substring(0, colonIdx).trim();
                        const isChecked = item.substring(colonIdx + 1).trim() === 'true';
                        checklistSummary += `\n  ${isChecked ? '☑' : '☐'} ${itemText}`;
                    }
                    else if (item.trim()) {
                        checklistSummary += `\n  ☐ ${item.trim()}`;
                    }
                }
            }
            cleanDesc = cleanDesc ? `${cleanDesc}${checklistSummary}` : checklistSummary.trim();
        }
        event.description = cleanDesc;
        return event;
    }
    async createEvent(calendarId, event) {
        const processedEvent = this.processEventMetadata(event);
        for (const [_, client] of this.calendarClients.entries()) {
            try {
                const res = await client.events.insert({
                    calendarId,
                    requestBody: processedEvent
                });
                return { ...res.data, calendarId };
            }
            catch (e) {
                // Try next client
            }
        }
        throw new Error(`Nenhuma conta de serviço tem permissão para inserir eventos na agenda: ${calendarId}`);
    }
    async updateEvent(calendarId, eventId, event) {
        const processedEvent = this.processEventMetadata(event);
        for (const [_, client] of this.calendarClients.entries()) {
            try {
                const res = await client.events.update({
                    calendarId,
                    eventId,
                    requestBody: processedEvent
                });
                return { ...res.data, calendarId };
            }
            catch (e) {
                // Try next client
            }
        }
        throw new Error("Nenhuma conta de serviço tem permissão para editar este evento.");
    }
    async getEvent(calendarId, eventId) {
        for (const [_, client] of this.calendarClients.entries()) {
            try {
                const response = await client.events.get({ calendarId, eventId });
                const event = response.data;
                // Restore _raw before returning
                if (event.extendedProperties?.private?._raw) {
                    event.description = event.extendedProperties.private._raw;
                }
                return { ...event, calendarId };
            }
            catch (e) {
                // Try next client
            }
        }
        throw new Error("Evento não encontrado ou sem permissão de acesso.");
    }
    async deleteEvent(calendarId, eventId) {
        for (const [_, client] of this.calendarClients.entries()) {
            try {
                await client.events.delete({
                    calendarId,
                    eventId
                });
                return;
            }
            catch (e) {
                // Try next client
            }
        }
        throw new Error("Nenhuma conta de serviço tem permissão para deletar este evento.");
    }
    async updateEventDescription(calendarId, eventId, description) {
        const processed = this.processEventMetadata({ description });
        for (const [_, client] of this.calendarClients.entries()) {
            try {
                await client.events.patch({
                    calendarId,
                    eventId,
                    requestBody: processed
                });
                return;
            }
            catch (e) {
                // Try next client
            }
        }
    }
}
exports.GoogleCalendarService = GoogleCalendarService;
