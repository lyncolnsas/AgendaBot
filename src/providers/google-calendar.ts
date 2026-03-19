import { google, calendar_v3 } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { dbRun, dbQuery } from '../database/sqlite';

export class GoogleCalendarService {
    private readonly calendarIdFile = path.join(process.cwd(), 'calendar_id.txt');
    private calendarClients: Map<string, calendar_v3.Calendar> = new Map();

    private oauth2Client: any = null;
    private readonly oauthTokenPath = path.join(process.cwd(), 'credentials', 'oauth_tokens.json');
    private readonly oauthCredentialsPath = path.join(process.cwd(), 'credentials', 'google_oauth.json');

    constructor() {
        this.loadCalendars();
    }

    public loadCalendars() {
        this.calendarClients.clear();
        this.loadOAuthClient();
        console.log(`[Calendar] Loaded ${this.calendarClients.size} calendar clients (OAuth).`);
    }

    private loadOAuthClient() {
        try {
            if (fs.existsSync(this.oauthCredentialsPath)) {
                const creds = JSON.parse(fs.readFileSync(this.oauthCredentialsPath, 'utf8'));
                const keys = creds.installed || creds.web;
                if (keys) {
                    this.oauth2Client = new google.auth.OAuth2(
                        keys.client_id,
                        keys.client_secret,
                        keys.redirect_uris[0]
                    );

                    if (fs.existsSync(this.oauthTokenPath)) {
                        const tokens = JSON.parse(fs.readFileSync(this.oauthTokenPath, 'utf8'));
                        this.oauth2Client.setCredentials(tokens);
                        
                        const client = google.calendar({ version: 'v3', auth: this.oauth2Client });
                        this.calendarClients.set('oauth', client);
                        console.log('[Calendar] Loaded OAuth credentials successfully.');
                    }
                }
            }
        } catch (e: any) {
            console.error('[Calendar] Error loading OAuth client:', e.message);
        }
    }

    public generateAuthUrl(redirectUri: string) {
        if (!fs.existsSync(this.oauthCredentialsPath)) throw new Error('OAuth JSON missing');
        const creds = JSON.parse(fs.readFileSync(this.oauthCredentialsPath, 'utf8'));
        const keys = creds.installed || creds.web;
        
        const oauth2Client = new google.auth.OAuth2(
            keys.client_id,
            keys.client_secret,
            redirectUri
        );

        return oauth2Client.generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent',
            scope: ['https://www.googleapis.com/auth/calendar']
        });
    }

    public async handleOAuthCallback(code: string, redirectUri: string) {
         if (!fs.existsSync(this.oauthCredentialsPath)) throw new Error('OAuth JSON missing');
         const creds = JSON.parse(fs.readFileSync(this.oauthCredentialsPath, 'utf8'));
         const keys = creds.installed || creds.web;
         
         const tempClient = new google.auth.OAuth2(
             keys.client_id,
             keys.client_secret,
             redirectUri
         );
         
         const { tokens } = await tempClient.getToken(code);
         fs.writeFileSync(this.oauthTokenPath, JSON.stringify(tokens));
         this.loadCalendars();
    }

    public isOAuthConfigured(): boolean {
         return fs.existsSync(this.oauthCredentialsPath);
    }

    public isOAuthAuthorized(): boolean {
         return fs.existsSync(this.oauthTokenPath) && this.calendarClients.has('oauth');
    }

    public logoutOAuth() {
         if (fs.existsSync(this.oauthTokenPath)) fs.unlinkSync(this.oauthTokenPath);
         this.loadCalendars();
    }

    public isAuthorized(): boolean {
        return this.calendarClients.size > 0;
    }

    public getTargetCalendarIds(): string[] {
        const ids: string[] = [];
        try {
            if (fs.existsSync(this.calendarIdFile)) {
                const raw = fs.readFileSync(this.calendarIdFile, 'utf8').trim();
                for (const id of raw.split(',')) {
                    const cleanId = id.trim();
                    if (cleanId) ids.push(cleanId);
                }
            }
        } catch (error: any) {
            console.error('[Calendar] Error reading calendar_id.txt:', error.message);
        }

        if (ids.length === 0) ids.push('primary');
        return ids;
    }

    public setTargetCalendarIds(ids: string[]) {
        fs.writeFileSync(this.calendarIdFile, ids.join(','));
    }

    public async syncCalendarList(client: calendar_v3.Calendar) {
        const targetIds = this.getTargetCalendarIds();
        console.log(`[Calendar] Syncing calendar list for ${targetIds.length} targets: ${targetIds.join(', ')}`);
        try {
            const list = await client.calendarList.list();
            const existingIds = (list.data.items || []).map(i => i.id);
            console.log(`[Calendar] Existing calendars in service account list: ${existingIds.join(', ')}`);

            for (const calendarId of targetIds) {
                if (calendarId === 'primary') continue;

                if (!existingIds.includes(calendarId)) {
                    console.log(`[Calendar] Attempting to insert calendar ${calendarId} into list...`);
                    try {
                        await client.calendarList.insert({
                            requestBody: { id: calendarId }
                        });
                        console.log(`[Calendar] Successfully inserted calendar ${calendarId}`);
                    } catch (e: any) {
                        console.error(`[Calendar] Failed to insert calendar ${calendarId}: ${e.message}`);
                        if (e.message.includes('notFound')) {
                            console.error(`[Calendar] TIP: Ensure you shared the calendar ${calendarId} with the service account email.`);
                        }
                    }
                } else {
                    console.log(`[Calendar] Calendar ${calendarId} already in list.`);
                }
            }
        } catch (error: any) {
            console.error('[Calendar] Could not sync calendar list:', error.message);
        }
    }

    public async getCalendars(): Promise<any[]> {
        const result: any[] = [];
        const foundIds: Set<string> = new Set();
        
        for (const [_, client] of this.calendarClients.entries()) {
            await this.syncCalendarList(client);
            try {
                const list = await client.calendarList.list();
                if (list.data.items) {
                    for (const entry of list.data.items) {
                        if (entry.id) foundIds.add(entry.id);
                        const alreadyAdded = result.some(m => m.id === entry.id);
                        if (!alreadyAdded) {
                            const calData = {
                                id: entry.id,
                                summary: entry.summary,
                                colorId: entry.colorId,
                                backgroundColor: entry.backgroundColor,
                                accessRole: entry.accessRole // used to determine if it's shared/read-only
                            };
                            result.push(calData);
                            
                            // Espelha no banco de dados local
                            const isShared = (entry.accessRole === 'reader' || entry.accessRole === 'freeBusyReader') ? 1 : 0;
                            await dbRun(
                                `INSERT INTO calendars (id, summary, description, colorId, backgroundColor, is_shared)
                                 VALUES (?, ?, ?, ?, ?, ?)
                                 ON CONFLICT(id) DO UPDATE SET 
                                 summary=excluded.summary, colorId=excluded.colorId, backgroundColor=excluded.backgroundColor, is_shared=excluded.is_shared`,
                                [entry.id, entry.summary, entry.description || '', entry.colorId || '', entry.backgroundColor || '', isShared]
                            ).catch(err => console.error('[SQLite] Error saving calendar:', err));
                        }
                    }
                }
            } catch (e: any) {
                console.error('[Calendar] Error fetching calendar list', e.message);
            }
        }
        
        // Auto-save all discovered IDs so that getEvents() can fetch them
        if (foundIds.size > 0) {
            this.setTargetCalendarIds(Array.from(foundIds));
        }
        
        return result;
    }

    public async getEvents(timeMin: number, timeMax: number): Promise<any[]> {
        const targetIds = this.getTargetCalendarIds();
        const startDateFilter = new Date(timeMin).toISOString();
        const endDateFilter = new Date(timeMax).toISOString();

        // 1. Carregar eventos do período OU qualquer um que tenha status (concluído/cancelado/adiado)
        const localEvents: any[] = [];
        try {
            const rows = await dbQuery(
                `SELECT * FROM events 
                 WHERE (start_date <= ? AND end_date >= ?) 
                    OR local_status IS NOT NULL`,
                [endDateFilter, startDateFilter]
            );
            for (const row of rows) {
                localEvents.push({
                    id: row.id,
                    calendarId: row.calendar_id,
                    summary: row.summary,
                    description: row.description,
                    location: row.location,
                    start: { dateTime: row.start_date },
                    end: { dateTime: row.end_date },
                    colorId: row.colorId,
                    local_wa_participants: row.local_wa_participants,
                    local_status: row.local_status
                });
            }
        } catch (e: any) {
            console.error('[Calendar] Erro ao buscar eventos locais:', e.message);
        }

        const uniqueEventsMap = new Map<string, any>();
        // Popula o mapa com o que temos no banco local
        for (const ev of localEvents) {
            uniqueEventsMap.set(ev.id, ev);
        }

        // 2. Se autorizado, tentar sincronizar com o Google
        if (this.isAuthorized()) {
            for (const [_, client] of this.calendarClients.entries()) {
                for (const calendarId of targetIds) {
                    try {
                        const response = await client.events.list({
                            calendarId: calendarId,
                            timeMin: startDateFilter,
                            timeMax: endDateFilter,
                            orderBy: 'startTime',
                            singleEvents: true,
                        });

                        if (response.data.items) {
                            for (const gEvent of response.data.items) {
                                if (!gEvent.id) continue;

                                // Preservar metadados locais se já existirem no mapa
                                const existing = uniqueEventsMap.get(gEvent.id);
                                
                                const startStr = gEvent.start?.dateTime || gEvent.start?.date || '';
                                const endStr = gEvent.end?.dateTime || gEvent.end?.date || startStr;
                                const summary = gEvent.summary || '';
                                const description = gEvent.description || '';
                                const location = gEvent.location || '';
                                const colorId = gEvent.colorId || '';

                                // COMPARATIVO: Só atualiza o banco se algo mudou na fonte (Google)
                                let hasChanged = true;
                                if (existing) {
                                    // Se já temos no mapa (veio do DB), comparamos os campos fundamentais
                                    const isSame = existing.summary === summary &&
                                                  existing.description === description &&
                                                  existing.location === location &&
                                                  existing.start?.dateTime === startStr &&
                                                  existing.end?.dateTime === endStr &&
                                                  existing.colorId === colorId;
                                    
                                    if (isSame) {
                                        hasChanged = false;
                                    }
                                }

                                const eventToSave = { 
                                    ...gEvent, 
                                    calendarId,
                                    local_wa_participants: existing?.local_wa_participants || null,
                                    local_status: existing?.local_status || null
                                };

                                uniqueEventsMap.set(gEvent.id, eventToSave);

                                if (hasChanged) {
                                    console.log(`[Calendar] Detectada mudança no Google para "${summary}" (${gEvent.id}). Atualizando local...`);
                                    // Sincroniza/Salva no SQLite local
                                    await dbRun(
                                        `INSERT INTO events (id, calendar_id, summary, description, start_date, end_date, colorId, location, local_wa_participants, local_status)
                                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                         ON CONFLICT(id) DO UPDATE SET 
                                         summary=excluded.summary, description=excluded.description, start_date=excluded.start_date, end_date=excluded.end_date, colorId=excluded.colorId, location=excluded.location`,
                                        [
                                            gEvent.id, 
                                            calendarId, 
                                            summary, 
                                            description, 
                                            startStr, 
                                            endStr, 
                                            colorId, 
                                            location,
                                            eventToSave.local_wa_participants, 
                                            eventToSave.local_status
                                        ]
                                    ).catch(err => console.error('[SQLite] Error saving event sync:', err));
                                }
                            }
                        }
                    } catch (error: any) {
                        console.warn(`[Calendar] Falha ao sincronizar agenda ${calendarId}:`, error.message);
                    }
                }
            }
        } else {
            console.log('[Calendar] Google não autorizado, operando apenas com cache local.');
        }

        // 3. Processar metadados e status para todos os eventos no mapa
        const finalEvents = Array.from(uniqueEventsMap.values());
        for (const event of finalEvents) {
            this.applyLocalMetadata(event);
        }

        return finalEvents.sort((a, b) => {
            const startA = a.start?.dateTime || a.start?.date || '';
            const startB = b.start?.dateTime || b.start?.date || '';
            return startA.localeCompare(startB);
        });
    }

    /**
     * Aplica prefixos visuais de status e metadados locais (WA_IDS) ao objeto de evento
     * para que o Frontend renderize corretamente.
     */
    private applyLocalMetadata(event: any): void {
        if (!event) return;

        // Restaurar _raw description se existir (Google Extended Properties)
        const raw = event.extendedProperties?.private?._raw;
        if (raw) event.description = raw;

        // Injetar WA_IDS se houver no campo local_wa_participants
        if (event.local_wa_participants) {
            try {
                const parsedWa = JSON.parse(event.local_wa_participants);
                if (parsedWa && parsedWa.length > 0) {
                    // Evitar repetir se já estiver lá
                    if (!event.description?.includes('[WA_IDS:')) {
                        event.description = (event.description || '') + `\n[WA_IDS:${parsedWa.join(', ')}]`;
                    }
                }
            } catch(e) {}
        }

        // Aplicar status visual baseado no local_status
        if (event.local_status) {
            let baseSummary = event.summary || '';
            // Limpa prefixos existentes para evitar duplicação em refreshes
            baseSummary = baseSummary.replace(/^\[(CANCELADO|ADIADO|CONCLUÍDO|CANCELADA|ADIADA|CONCLUÍDA)\]\s*/i, '');
            
            if (event.local_status === 'done') {
                event.summary = `[CONCLUÍDO] ${baseSummary}`;
            } else if (event.local_status === 'canceled') {
                event.summary = `[CANCELADO] ${baseSummary}`;
            } else if (event.local_status === 'postponed') {
                event.summary = `[ADIADO] ${baseSummary}`;
            }

            // Injetar tags no description para o frontend
            const statusTag = `[${event.local_status.toUpperCase()}]`;
            if (!event.description?.includes(statusTag)) {
                event.description = `${event.description || ''}\n${statusTag}`.trim();
            }
        }
    }

    private processEventMetadata(event: calendar_v3.Schema$Event): calendar_v3.Schema$Event {
        const description = event.description || '';

        // Save the FULL raw description (with all [TAG:...] metadata) into extendedProperties._raw
        // This is the source of truth and will be restored on getEvents()
        event.extendedProperties = event.extendedProperties || {};
        event.extendedProperties.private = event.extendedProperties.private || {};
        if (description) {
            event.extendedProperties.private._raw = description;
        }

        // Also extract named tags into individual extendedProperties for quick access
        const tags: Record<string, string> = {};
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
            .filter((line: string) => !line.trim().match(/^\[.+:.+\]/))
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
                    } else if (item.trim()) {
                        checklistSummary += `\n  ☐ ${item.trim()}`;
                    }
                }
            }
            cleanDesc = cleanDesc ? `${cleanDesc}${checklistSummary}` : checklistSummary.trim();
        }

        event.description = cleanDesc;

        return event;
    }

    public async createEvent(calendarId: string, event: calendar_v3.Schema$Event): Promise<any> {
        let isShared = false;
        try {
            const calRows = await dbQuery('SELECT is_shared FROM calendars WHERE id = ?', [calendarId]);
            if (calRows.length > 0 && calRows[0].is_shared) {
                isShared = true;
            }
        } catch (e) {}
        
        if (isShared) {
            throw new Error(`Esta é uma agenda compartilhada e você tem apenas permissão de leitura. Não é possível criar eventos nela diretamente pelo bot.`);
        }

        const processedEvent = this.processEventMetadata(event);
        for (const [_, client] of this.calendarClients.entries()) {
            try {
                const res = await client.events.insert({
                    calendarId,
                    requestBody: processedEvent
                });
                return { ...res.data, calendarId };
            } catch (e) {
                // Try next client
            }
        }
        throw new Error(`Nenhuma conta de serviço tem permissão para inserir eventos na agenda: ${calendarId}`);
    }

    public async updateEvent(calendarId: string, eventId: string, event: calendar_v3.Schema$Event): Promise<any> {
        let isShared = false;
        try {
            const calRows = await dbQuery('SELECT is_shared FROM calendars WHERE id = ?', [calendarId]);
            if (calRows.length > 0 && calRows[0].is_shared) {
                isShared = true;
            }
        } catch (e) {}

        const processedEvent = this.processEventMetadata(event);

        // 1. Detectar se o frontend está tentando definir um Local Status permanente
        let newLocalStatus = (processedEvent as any).local_status || null;
        
        // Se não veio explícito, tenta detectar pelo resumo (legado ou fallback)
        if (!newLocalStatus) {
            const incomingSummary = processedEvent.summary || '';
            const normalized = incomingSummary.toUpperCase();
            
            if (normalized.includes('[CONCLUÍDO]') || normalized.includes('[CONCLUÍDA]')) newLocalStatus = 'done';
            else if (normalized.includes('[CANCELADO]') || normalized.includes('[CANCELADA]')) newLocalStatus = 'canceled';
            else if (normalized.includes('[ADIADO]') || normalized.includes('[ADIADA]')) newLocalStatus = 'postponed';
        }

        // 2. Salvar no banco SQLite local instantaneamente se for um status reconhecido
        if (newLocalStatus) {
            console.log(`[Calendar] Persistindo status local "${newLocalStatus}" para o evento: ${eventId}`);
            await dbRun('UPDATE events SET local_status = ? WHERE id = ?', [newLocalStatus, eventId]).catch((err)=>{
                console.error(`[SQLite] Falha ao atualizar status local para ${eventId}:`, err.message);
            });
        }

        if (isShared) {
            // For shared (read-only) calendars, we don't send the update to Google API.
            // We just extract WA_IDS and save them to local_wa_participants in SQLite.
            const desc = event.extendedProperties?.private?._raw || '';
            const match = desc.match(/\[WA_IDS:\s*(.+?)\]/);
            let localWa = null;
            if (match && match[1]) {
                const parts = match[1].split(',').map((s: string) => s.trim());
                localWa = JSON.stringify(parts);
            }
            
            await dbRun('UPDATE events SET local_wa_participants = ? WHERE id = ? AND calendar_id = ?', [localWa, eventId, calendarId]);
            
            // Return mocked response based on DB + updated descripton so frontend can render
            const eventRows = await dbQuery('SELECT * FROM events WHERE id = ?', [eventId]);
            if (eventRows.length > 0) {
                const mockEvent: any = {
                    id: eventId,
                    calendarId,
                    summary: processedEvent.summary || eventRows[0].summary,
                    description: desc,
                    start: { dateTime: eventRows[0].start_date },
                    end: { dateTime: eventRows[0].end_date },
                    colorId: eventRows[0].colorId,
                    local_status: newLocalStatus
                };
                this.applyLocalMetadata(mockEvent);
                return mockEvent;
            }
            throw new Error("Local event not found for shared calendar update.");
        }
        
        for (const [_, client] of this.calendarClients.entries()) {
            try {
                const res = await client.events.update({
                    calendarId,
                    eventId,
                    requestBody: processedEvent
                });
                
                // Keep metadata on the response so the frontend knows it was saved correctly!
                const finalEvent: any = { ...res.data, calendarId, local_status: newLocalStatus };
                this.applyLocalMetadata(finalEvent);
                
                return finalEvent;
            } catch (e) {
                // Try next client
            }
        }
        throw new Error("Nenhuma conta de serviço tem permissão para editar este evento.");
    }

    public async getEvent(calendarId: string, eventId: string): Promise<any> {
        for (const [_, client] of this.calendarClients.entries()) {
            try {
                const response = await client.events.get({ calendarId, eventId });
                const event = response.data;
                // Restore _raw before returning
                if (event.extendedProperties?.private?._raw) {
                    event.description = event.extendedProperties.private._raw;
                }
                return { ...event, calendarId };
            } catch (e) {
                // Try next client
            }
        }
        throw new Error("Evento não encontrado ou sem permissão de acesso.");
    }

    public async deleteEvent(calendarId: string, eventId: string): Promise<void> {
        for (const [_, client] of this.calendarClients.entries()) {
            try {
                await client.events.delete({
                    calendarId,
                    eventId
                });
                return;
            } catch (e) {
                // Try next client
            }
        }
        throw new Error("Nenhuma conta de serviço tem permissão para deletar este evento.");
    }

    public async updateEventDescription(calendarId: string, eventId: string, description: string): Promise<void> {
        const processed = this.processEventMetadata({ description });
        for (const [_, client] of this.calendarClients.entries()) {
            try {
                await client.events.patch({
                    calendarId,
                    eventId,
                    requestBody: processed
                });
                return;
            } catch (e) {
                // Try next client
            }
        }
    }

    public async createCalendar(summary: string, description: string): Promise<any> {
        for (const [_, client] of this.calendarClients.entries()) {
            try {
                const res = await client.calendars.insert({
                    requestBody: { summary, description }
                });
                
                // Immediately sync to the calendar list and local DB
                if (res.data.id) {
                    await this.syncCalendarList(client);
                    await dbRun(
                        `INSERT INTO calendars (id, summary, description, colorId, backgroundColor, is_shared) VALUES (?, ?, ?, ?, ?, ?)
                         ON CONFLICT(id) DO UPDATE SET summary=excluded.summary, description=excluded.description`,
                        [res.data.id, res.data.summary, res.data.description || '', '#3788d8', '#3788d8', 0]
                    ).catch(err => console.error('[SQLite] Error saving new calendar:', err));
                }
                
                return res.data;
            } catch (e) {
                // Try next client
            }
        }
        throw new Error("Nenhuma conta de serviço tem permissão para criar agendas.");
    }
}
