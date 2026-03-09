import makeWASocket, {
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    WASocket,
    ConnectionState
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import 'dotenv/config';
import { format, parseISO, addMinutes, isBefore, isAfter } from 'date-fns';
import { GoogleCalendarService } from './google-calendar';
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';

export class WhatsAppClient {
    private readonly googleCalendar = new GoogleCalendarService();
    private sock: WASocket | null = null;
    public lastQr: string | null = null;
    public connectionStatus: 'initializing' | 'waiting_qr' | 'open' | 'closed' = 'initializing';
    private notifiedCallEvents: Set<string> = new Set();
    private notifiedReminders: Set<string> = new Set();
    private deletedGroups: Set<string> = new Set();
    private contacts: Map<string, { name?: string, notify?: string }> = new Map();
    private readonly logsPath = path.join(process.cwd(), 'system.log');
    private readonly notificationFile = path.join(process.cwd(), 'notification.json');
    private readonly contactsCacheFile = path.join(process.cwd(), 'data', 'contacts_cache.json');
    private readonly messageQueueFile = path.join(process.cwd(), 'data', 'message_queue.json');
    private messageQueue: Array<{ event: any; isUpdate: boolean; queuedAt: string }> = [];
    private saveContactsTimer: NodeJS.Timeout | null = null;

    constructor() {
        // Handle unhandled errors globally to avoid crashing completely 
        process.on('unhandledRejection', (reason, promise) => {
            console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
        });
        process.on('uncaughtException', (err) => {
            console.error('[CRITICAL] Uncaught Exception thrown:', err);
            this.addLog('CRITICAL', `Uncaught Exception: ${err.message}`);
        });

        this.initCronJobs();
        this.loadContactsCache();
        this.loadMessageQueue();
    }

    private loadContactsCache() {
        try {
            if (fs.existsSync(this.contactsCacheFile)) {
                const data = JSON.parse(fs.readFileSync(this.contactsCacheFile, 'utf8'));
                for (const [k, v] of Object.entries(data)) {
                    this.contacts.set(k, v as any);
                }
                this.addLog('INFO', `Carregados ${this.contacts.size} contatos do cache local.`);
            }
        } catch (e: any) {
            this.addLog('WARNING', `Falha ao ler cache de contatos: ${e.message}`);
        }
    }

    private loadMessageQueue() {
        try {
            const dir = path.join(process.cwd(), 'data');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            if (fs.existsSync(this.messageQueueFile)) {
                this.messageQueue = JSON.parse(fs.readFileSync(this.messageQueueFile, 'utf8')) || [];
                if (this.messageQueue.length > 0) {
                    this.addLog('INFO', `Fila carregada: ${this.messageQueue.length} mensagem(ns) pendente(s).`);
                }
            }
        } catch (e: any) {
            this.addLog('WARNING', `Falha ao ler fila de mensagens: ${e.message}`);
            this.messageQueue = [];
        }
    }

    private saveMessageQueue() {
        try {
            const dir = path.join(process.cwd(), 'data');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(this.messageQueueFile, JSON.stringify(this.messageQueue, null, 2));
        } catch (e: any) {
            this.addLog('WARNING', `Falha ao salvar fila de mensagens: ${e.message}`);
        }
    }

    private async processMessageQueue() {
        if (this.messageQueue.length === 0) return;
        this.addLog('INFO', `Processando fila: ${this.messageQueue.length} mensagem(ns) pendente(s)...`);
        const queued = [...this.messageQueue];
        this.messageQueue = [];
        this.saveMessageQueue();
        for (const item of queued) {
            try {
                await new Promise(r => setTimeout(r, 1500)); // small delay between messages
                await this.sendEventConfirmation(item.event, item.isUpdate);
            } catch (e: any) {
                this.addLog('ERROR', `Erro ao enviar mensagem da fila: ${e.message}`);
            }
        }
    }

    private queueSaveContacts() {
        if (this.saveContactsTimer) clearTimeout(this.saveContactsTimer);
        this.saveContactsTimer = setTimeout(() => {
            try {
                const data = Object.fromEntries(this.contacts);
                if (!fs.existsSync(path.dirname(this.contactsCacheFile))) {
                    fs.mkdirSync(path.dirname(this.contactsCacheFile), { recursive: true });
                }
                fs.writeFileSync(this.contactsCacheFile, JSON.stringify(data), 'utf8');
            } catch (e: any) {
                this.addLog('WARNING', `Falha ao salvar cache de contatos: ${e.message}`);
            }
        }, 5000); // 5 sec debounce
    }

    private readonly MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB
    private readonly MAX_LOG_FILES = 3; // keep system.log.1, .2, .3

    public addLog(level: string, message: string) {
        const entry = `[${new Date().toISOString()}] [${level}] ${message}\n`;

        // Rotate log if it exceeds max size
        try {
            if (fs.existsSync(this.logsPath)) {
                const size = fs.statSync(this.logsPath).size;
                if (size >= this.MAX_LOG_SIZE) {
                    // Shift existing rotated files: .2 → .3, .1 → .2, current → .1
                    for (let i = this.MAX_LOG_FILES; i > 1; i--) {
                        const older = `${this.logsPath}.${i - 1}`;
                        const newer = `${this.logsPath}.${i}`;
                        if (fs.existsSync(older)) fs.renameSync(older, newer);
                    }
                    fs.renameSync(this.logsPath, `${this.logsPath}.1`);
                }
            }
        } catch (e) {
            // Rotation failed silently — don't break logging
        }

        fs.appendFileSync(this.logsPath, entry);
        console.log(entry.trim());
    }

    private initCronJobs() {
        // Daily Summary at 08:00 AM
        cron.schedule('0 8 * * *', () => {
            this.sendDailySummary();
        });

        // Proactive Check every 5 minutes for upcoming meetings and calls
        cron.schedule('*/5 * * * *', () => {
            this.checkUpcomingReminders();
        });
    }

    private async getNotificationNumber(): Promise<string | null> {
        try {
            if (fs.existsSync(this.notificationFile)) {
                const data = JSON.parse(fs.readFileSync(this.notificationFile, 'utf8'));
                return data.contactNo ? `${data.contactNo}@s.whatsapp.net` : null;
            }
        } catch (e) { }
        return null;
    }

    private async sendDailySummary() {
        const target = await this.getNotificationNumber();
        if (!target || this.connectionStatus !== 'open') return;

        this.addLog('INFO', 'Running Daily Summary Cron');
        const summary = await this.handleCalendarCommands('#hoje');
        await this.sendMessage(target, `🌞 *Bom dia! Resumo da sua Agenda de Hoje:* \n\n${summary}`);
    }

    private async checkUpcomingReminders() {
        if (!this.googleCalendar.isAuthorized()) return;
        const target = await this.getNotificationNumber();
        if (this.connectionStatus !== 'open') return;

        try {
            const now = new Date();
            const lookahead = addMinutes(now, 60);
            const events = await this.googleCalendar.getEvents(now.getTime(), lookahead.getTime());

            for (const event of events) {
                const startStr = event.start?.dateTime;
                if (!startStr) continue;

                const startDate = parseISO(startStr);
                const diffMinutes = Math.floor((startDate.getTime() - now.getTime()) / 60000);

                const desc = event.description || '';
                const groupJidTag = this.extractTag(event, 'GROUP_JID');

                // 1. Admin/Global Reminders (to target only)
                if (target && diffMinutes >= 10 && diffMinutes <= 20) {
                    const reminderKey = `MSG_15_${event.id}`;
                    if (!this.notifiedReminders.has(reminderKey)) {
                        this.addLog('INFO', `Sending admin reminder for ${event.summary}`);
                        await this.sendMessage(target, `🔔 *Lembrete:* O evento "${event.summary}" começa em breve!`);
                        this.notifiedReminders.add(reminderKey);
                    }
                }

                // 2. Automatic Calls (Admin or Group)
                const callMinutesStr = this.extractTag(event, 'CALL');
                if (callMinutesStr) {
                    const callMinutes = parseInt(callMinutesStr);
                    if (diffMinutes >= callMinutes - 1 && diffMinutes <= callMinutes + 1) {
                        const callKey = `${event.id}_${callMinutes}`;
                        if (!this.notifiedCallEvents.has(callKey)) {
                            // If group exists, call the group. Otherwise call target.
                            const callTarget = groupJidTag || target;
                            if (callTarget) {
                                this.addLog('INFO', `Triggering call to ${callTarget} for ${event.summary}`);
                                await this.sendMessage(callTarget, `📞 *VOU TE LIGAR AGORA:* Iniciando lembrete de "${event.summary}"!`);
                                setTimeout(() => this.offerCall(callTarget), 3000);
                            }
                            this.notifiedCallEvents.add(callKey);
                        }
                    }
                }

                // 3. Participant/Group Reminders (15 min before)
                if (diffMinutes >= 14 && diffMinutes <= 16) {
                    const reminderKey = `PARTICIPANT_REMIND_${event.id}`;
                    if (!this.notifiedReminders.has(reminderKey)) {
                        const sala = event.location || 'Não definida';
                        const hourStr = format(startDate, 'HH:mm');

                        const callMinutes = this.extractTag(event, 'CALL');
                        let callNotice = '';
                        if (callMinutes) {
                            callNotice = `\n\n📞 *Aviso:* Você receberá uma ligação faltando ${callMinutes} minutos antes do evento. A ligação é pré-configurada na hora da criação do evento.`;
                        }

                        const reminderMsg = `📅 *Lembrete de Reunião*\n\nTeremos uma reunião em breve:\n📌 Assunto: *${event.summary}*\n🕒 Inicia em: *${hourStr}*\n📍 Local: *${sala}*${callNotice}\n\n_Estamos aguardando você!_`;

                        if (groupJidTag) {
                            this.addLog('INFO', `Enviando lembrete para o grupo: ${groupJidTag}`);
                            await this.sendMessage(groupJidTag, reminderMsg);

                            const attachments = this.parseAttachments(event);
                            if (attachments.length > 0) {
                                await this.sendAttachments(groupJidTag, attachments);
                            }
                        } else {
                            const participants = this.parseParticipants(event);
                            if (participants.length > 0) {
                                this.addLog('INFO', `Enviando lembretes individuais para: ${event.summary}`);
                                const attachments = this.parseAttachments(event);
                                for (const p of participants) {
                                    try {
                                        const jid = `${p.number}@s.whatsapp.net`;
                                        await this.sendMessage(jid, `🔔 *Lembrete:* Olá *${p.name}*,\n\n${reminderMsg}`);
                                        if (attachments.length > 0) {
                                            await this.sendAttachments(jid, attachments);
                                        }
                                        await new Promise(r => setTimeout(r, 1500));
                                    } catch (e) {
                                        this.addLog('ERROR', `Erro no lembrete individual para ${p.name}`);
                                    }
                                }
                            }
                        }
                        this.notifiedReminders.add(reminderKey);
                    }
                }
            }

            // Cleanup notified sets occasionally
            if (this.notifiedReminders.size > 1000) this.notifiedReminders.clear();
            if (this.notifiedCallEvents.size > 1000) this.notifiedCallEvents.clear();

            // --- Auto-delete Groups (1 hour after end) ---
            const nowTime = now.getTime();
            const pastLookback = nowTime - (1000 * 60 * 60 * 24);
            const pastEvents = await this.googleCalendar.getEvents(pastLookback, nowTime);

            for (const event of pastEvents) {
                const endStr = event.end?.dateTime;
                if (!endStr) continue;

                const endDate = parseISO(endStr);
                const diffAfterEnd = Math.floor((nowTime - endDate.getTime()) / 60000);

                // Delete 1 hour (60 mins) after end
                if (diffAfterEnd >= 60 && diffAfterEnd <= 90) {
                    const desc = event.description || '';
                    const groupJid = this.extractTag(event, 'GROUP_JID');
                    if (groupJid && !this.deletedGroups.has(groupJid)) {
                        this.addLog('INFO', `Deleting group ${groupJid} for event ${event.summary} (1h after end)`);
                        try {
                            await this.sendMessage(groupJid, `🏁 *Reunião finalizada.* Encerrando grupo.`);

                            // 1. Get participants and remove them
                            const metadata = await (this.sock as any).groupMetadata(groupJid);
                            const members = metadata.participants.map((p: any) => p.id).filter((id: string) => id !== (this.sock as any).user.id);

                            if (members.length > 0) {
                                await (this.sock as any).groupParticipantsUpdate(groupJid, members, 'remove');
                            }

                            // 2. Leave and Archive/Delete
                            await (this.sock as any).groupLeave(groupJid);
                            this.deletedGroups.add(groupJid);
                        } catch (e: any) {
                            this.addLog('ERROR', `Failed to delete group ${groupJid}: ${e.message}`);
                        }
                    }
                }
            }
        } catch (e: any) {
            this.addLog('ERROR', `Reminder Check Failed: ${e.message}`);
        }
    }

    private extractTag(event: any, tag: string): string | null {
        // 1. Check direct extendedProperties
        const metadata = event.extendedProperties?.private?.[tag.toUpperCase()];
        if (metadata) return metadata;

        // 2. Fallback to raw description or clean description
        const description = event.extendedProperties?.private?._raw || event.description || '';
        const regex = new RegExp(`\\[${tag}:\\s*(.+?)\\]`, 'i');
        const match = description.match(regex);
        return match ? match[1].trim() : null;
    }

    private parseParticipants(event: any): { name: string, number: string }[] {
        let rawIds = event.extendedProperties?.private?.['WA_IDS'];

        if (!rawIds) {
            const description = event.extendedProperties?.private?._raw || event.description || '';
            const match = description.match(/\[WA_IDS:\s*(.+?)\]/);
            if (!match) return [];
            rawIds = match[1];
        }

        const parts: { name: string, number: string }[] = [];
        const rawItems = rawIds.split(',');

        for (const item of rawItems) {
            const [name, wa] = item.trim().split('|');
            if (name && wa) {
                // Clean the number (remove non-digits)
                const cleanNumber = wa.replace(/\D/g, '');
                if (cleanNumber) {
                    parts.push({ name, number: cleanNumber });
                }
            }
        }
        return parts;
    }

    private parseAttachments(event: any): string[] {
        // Use raw description if present, fallback to event.description
        const desc = event.extendedProperties?.private?._raw || event.description || '';
        const matches = [...desc.matchAll(/\[ATTACH:\s*(.+?)\]/g)];
        if (!matches || matches.length === 0) return [];
        return matches.map(m => m[1].trim());
    }

    private async sendAttachments(to: string, urls: string[]) {
        for (const url of urls) {
            try {
                this.addLog('INFO', `Enviando anexo para ${to}: ${url}`);

                let fileBuffer: Buffer | string = url;
                let fileName = url.split('/').pop() || 'arquivo';

                // If it's a local upload, read it directly from disk
                if (url.startsWith('/uploads/')) {
                    const localPath = path.join(process.cwd(), 'public', url);
                    if (fs.existsSync(localPath)) {
                        fileBuffer = fs.readFileSync(localPath);
                        fileName = fileName.replace(/^\d+_/, ''); // remove timestamp prefix for cleaner name
                    }
                }

                const ext = fileName.split('.').pop()?.toLowerCase() || '';
                const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext);
                const isVideo = ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext);
                const isAudio = ['mp3', 'ogg', 'wav', 'm4a', 'aac'].includes(ext);
                const isDoc = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'zip', 'rar'].includes(ext);

                if (isImage) {
                    await this.sock?.sendMessage(to, { image: fileBuffer instanceof Buffer ? fileBuffer : { url }, caption: 'Anexo de Imagem' });
                } else if (isVideo) {
                    await this.sock?.sendMessage(to, { video: fileBuffer instanceof Buffer ? fileBuffer : { url }, caption: 'Anexo de Vídeo' });
                } else if (isAudio) {
                    await this.sock?.sendMessage(to, { audio: fileBuffer instanceof Buffer ? fileBuffer : { url }, mimetype: `audio/${ext === 'mp3' ? 'mpeg' : ext}` });
                } else if (isDoc) {
                    const mimeMap: any = { pdf: 'application/pdf', zip: 'application/zip', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
                    await this.sock?.sendMessage(to, {
                        document: fileBuffer instanceof Buffer ? fileBuffer : { url },
                        fileName: fileName,
                        mimetype: mimeMap[ext] || 'application/octet-stream'
                    });
                } else {
                    // Fallback to text link if it's an external URL
                    if (url.startsWith('http')) {
                        await this.sock?.sendMessage(to, { text: `🔗 *Link Anexo:*\n${url}` });
                    } else {
                        // Try sending as document anyway
                        await this.sock?.sendMessage(to, {
                            document: fileBuffer instanceof Buffer ? fileBuffer : { url },
                            fileName: fileName,
                            mimetype: 'application/octet-stream'
                        });
                    }
                }

                await new Promise(r => setTimeout(r, 2000));
            } catch (err: any) {
                this.addLog('ERROR', `Erro ao enviar anexo ${url}: ${err.message}`);
            }
        }
    }

    public async sendEventConfirmation(event: any, isUpdate = false) {
        if (!this.sock || this.connectionStatus !== 'open') {
            // WhatsApp offline — enqueue for later delivery
            this.messageQueue.push({ event, isUpdate, queuedAt: new Date().toISOString() });
            this.saveMessageQueue();
            this.addLog('INFO', `WhatsApp offline. Evento "${event.summary}" adicionado à fila (${this.messageQueue.length} na fila).`);
            return;
        }

        // Use the full raw description (with all [TAG:...]) for parsing metadata
        // After processEventMetadata, the clean description is in event.description
        // and the full raw is in event.extendedProperties?.private?._raw
        const desc = event.extendedProperties?.private?._raw || event.description || '';
        this.addLog('INFO', `Processando confirmação para: ${event.summary} (desc len: ${desc.length})`);

        const participants = this.parseParticipants(event);
        const groupMode = this.extractTag(event, 'GROUP_MODE') || 'individual';
        const groupJid = this.extractTag(event, 'GROUP_JID');
        this.addLog('DEBUG', `sendEventConfirmation: Mode=${groupMode}, JID=${groupJid}, Participants=${participants.length}, isUpdate=${isUpdate}`);
        const sala = event.location || 'Não definida';

        const startStr = event.start?.dateTime || event.start?.date;
        let dateStr = 'Não definida';
        let hourStr = 'Não definida';
        if (startStr) {
            const dt = parseISO(startStr);
            dateStr = format(dt, 'dd/MM/yyyy');
            hourStr = format(dt, 'HH:mm');
        }

        const callMinutes = this.extractTag(event, 'CALL');
        let callNotice = '';
        if (callMinutes) {
            callNotice = `\n\n📞 *Aviso:* Você receberá uma ligação faltando ${callMinutes} minutos antes do evento.`;
        }

        // Extract human-readable description (strip all [TAG:...] lines)
        const cleanDesc = desc
            .split('\n')
            .filter((line: string) => !line.trim().match(/^\[.+:.+\]/))
            .join('\n')
            .trim();

        let descSection = '';
        if (cleanDesc) {
            descSection = `\n\n📝 *Descrição:*\n${cleanDesc}`;
        }

        // Extract checklists [CHECKLIST:título|item_text:true/false|...]
        const checklistMatches = [...desc.matchAll(/\[CHECKLIST:([^\]]+)\]/g)];
        let checklistSection = '';
        if (checklistMatches.length > 0) {
            checklistSection = '\n\n📋 *Lista de Tarefas:*';
            for (const match of checklistMatches) {
                const parts = match[1].split('|');
                const listTitle = parts[0] || 'Tarefas';
                const items = parts.slice(1);
                checklistSection += `\n*${listTitle}*`;
                for (const item of items) {
                    const colonIdx = item.lastIndexOf(':');
                    let itemText: string;
                    let isChecked = false;
                    if (colonIdx !== -1) {
                        itemText = item.substring(0, colonIdx).trim();
                        isChecked = item.substring(colonIdx + 1).trim() === 'true';
                    } else {
                        itemText = item.trim();
                    }
                    if (itemText) {
                        checklistSection += `\n  ${isChecked ? '✅' : '☐'} ${itemText}`;
                    }
                }
            }
        }

        // Build participants line with name when available
        const participantNames = participants.map(p => p.name || p.number).join(', ');
        const participantSection = participantNames ? `\n👤 *Participantes:* ${participantNames}` : '';

        const eventType = this.extractTag(event, 'EVENT_TYPE') || 'reuniao';
        const typeLabel = eventType === 'atividade' ? 'Atividade' : 'Reunião';

        const titleStatus = isUpdate ? `⚠️ *${typeLabel} Atualizada*` : `📅 *Nova ${typeLabel} / Lembrete*`;
        const formattedMsg = `${titleStatus}\n\nAgenda: *${event.summary}*\n📅 Data: *${dateStr}*\n🕒 Hora: *${hourStr}*\n📍 Local: *${sala}*${participantSection}${descSection}${checklistSection}${callNotice}\n\n_Favor confirmar presença!_`;

        if (groupMode === 'create' && !groupJid) {
            const groupName = this.extractTag(event, 'GROUP_NAME') || event.summary || 'Reunião';
            const members = participants.map(p => `${p.number}@s.whatsapp.net`);

            this.addLog('INFO', `Criando novo grupo: ${groupName}`);
            try {
                const group = await (this.sock as any).groupCreate(groupName, members);
                const newJid = group.id;

                this.addLog('INFO', `Grupo criado com JID: ${newJid}. Aguardando para enviar mensagem...`);
                await new Promise(r => setTimeout(r, 3000)); // Wait for synchronization

                await this.sendMessage(newJid, `👋 Olá! Este grupo foi criado para: *${event.summary}*.\n\n${formattedMsg}\n\n⚠️ *Aviso:* Este grupo será apagado automaticamente 1 hora após o término.`);

                const attachments = this.parseAttachments(event);
                if (attachments.length > 0) {
                    await this.sendAttachments(newJid, attachments);
                }

                // Update event with JID
                const updatedDesc = `${desc}\n[GROUP_JID:${newJid}]`;
                await this.googleCalendar.updateEventDescription(event.calendarId || 'primary', event.id, updatedDesc);

                this.addLog('SUCCESS', `Grupo criado e notificado: ${newJid}`);
                return;
            } catch (e: any) {
                this.addLog('ERROR', `Erro ao criar grupo, migrando para individual: ${e.message}`);
            }
        } else if (groupMode === 'existing' && groupJid) {
            this.addLog('INFO', `Enviando para grupo existente: ${groupJid}`);
            try {
                const header = isUpdate ? '🔔 *Agenda Atualizada*' : '🔔 *Nova Agenda Registrada*';
                await this.sendMessage(groupJid, `${header}\n\n${formattedMsg}`);

                const attachments = this.parseAttachments(event);
                if (attachments.length > 0) {
                    await this.sendAttachments(groupJid, attachments);
                }

                this.addLog('SUCCESS', `Grupo existente notificado: ${groupJid}`);
                return; // Use return if group is the only target
            } catch (e: any) {
                this.addLog('ERROR', `Erro ao enviar para grupo: ${e.message}`);
            }
        }

        // Default or Fallback: Individual Notifications
        if (participants.length === 0) {
            this.addLog('WARNING', 'Nenhum participante para notificar individualmente.');
            return;
        }

        for (const p of participants) {
            try {
                const individualMsg = `⚠️ *Aviso de Reunião*\n\nOlá *${p.name}*,\n\n${formattedMsg}`;
                const jid = `${p.number}@s.whatsapp.net`;
                await this.sendMessage(jid, individualMsg);

                const attachments = this.parseAttachments(event);
                if (attachments.length > 0) {
                    await this.sendAttachments(jid, attachments);
                }

                // Anti-spam delay
                await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
            } catch (err: any) {
                this.addLog('ERROR', `Erro ao notificar ${p.name}: ${err.message}`);
            }
        }
    }

    public async sendEventCancellation(event: any) {
        if (!this.sock || this.connectionStatus !== 'open') {
            this.addLog('WARNING', `WhatsApp offline. Não foi possível enviar cancelamento para "${event.summary}".`);
            return;
        }

        const participants = this.parseParticipants(event);
        const groupJid = this.extractTag(event, 'GROUP_JID');
        this.addLog('INFO', `Processando CANCELAMENTO para: ${event.summary}. Grupo: ${groupJid || 'Nenhum'}`);

        const cancelMsg = `🚫 *EVENTO CANCELADO*\n\nAgenda: *${event.summary}*\n\n_Infelizmente esta reunião/agenda foi cancelada. Favor entrar em contato com a secretaria para rever outro horário._`;

        if (groupJid) {
            try {
                // 1. Send notice to group
                await (this.sock as any).sendMessage(groupJid, { text: cancelMsg });
                await new Promise(r => setTimeout(r, 2000));

                // 2. Remove all participants
                const members = participants.map(p => `${p.number}@s.whatsapp.net`);
                if (members.length > 0) {
                    this.addLog('INFO', `Removendo ${members.length} participantes do grupo ${groupJid}`);
                    try {
                        await (this.sock as any).groupParticipantsUpdate(groupJid, members, 'remove');
                        await new Promise(r => setTimeout(r, 2000));
                    } catch (err: any) {
                        this.addLog('WARNING', `Alguns participantes não puderam ser removidos: ${err.message}`);
                    }
                }

                // 3. Bot leaves and deletes group
                this.addLog('INFO', `Bot saindo e apagando o grupo ${groupJid}`);
                await (this.sock as any).groupLeave(groupJid);
                await new Promise(r => setTimeout(r, 2000));

                // Attempt to delete chat from the bot's account as well
                try {
                    await (this.sock as any).chatModify({ delete: true, lastMessages: [{ key: { remoteJid: groupJid, fromMe: true }, messageTimestamp: Date.now() }] }, groupJid);
                } catch (e: any) {
                    this.addLog('WARNING', `Não foi possível apagar a conversa da lista: ${e.message}`);
                }

                this.addLog('SUCCESS', `Cancelamento de grupo processado: ${groupJid}`);
                return;
            } catch (e: any) {
                this.addLog('ERROR', `Erro ao processar cancelamento de grupo: ${e.message}`);
                // Fallback to individual if group fails
            }
        }

        // Individual cancellation for each participant
        for (const p of participants) {
            try {
                const jid = `${p.number}@s.whatsapp.net`;
                await this.sendMessage(jid, `⚠️ *Aviso de Cancelamento*\n\nOlá *${p.name}*,\n\n${cancelMsg}`);
                await new Promise(r => setTimeout(r, 2000));
            } catch (err: any) {
                this.addLog('ERROR', `Erro ao notificar cancelamento para ${p.name}: ${err.message}`);
            }
        }
    }

    public async resetConnection(): Promise<void> {
        this.addLog('INFO', 'Iniciando reset completo da conexão WhatsApp...');
        if (this.sock) {
            try { this.sock.logout('Vazando por reset do usuário'); } catch { }
            this.sock = null;
        }

        const authPath = path.join(process.cwd(), 'auth_info_baileys');
        if (fs.existsSync(authPath)) fs.rmSync(authPath, { recursive: true, force: true });
        if (fs.existsSync(this.contactsCacheFile)) fs.unlinkSync(this.contactsCacheFile);

        this.contacts.clear();
        this.deletedGroups.clear();
        this.connectionStatus = 'initializing';

        setTimeout(() => this.connect(), 2000);
    }

    public async connect(): Promise<void> {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`[WhatsApp] Booting v${version.join('.')}, isLatest: ${isLatest}`);

        this.sock = makeWASocket({
            version,
            printQRInTerminal: false,
            auth: state,
            logger: pino({ level: 'silent' }) as any,
            browser: ['Planka Bridge', 'Chrome', '1.0.0'],
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 25000, // Heartbeat every 25s
            emitOwnEvents: true,
            generateHighQualityLinkPreview: false,
            retryRequestDelayMs: 2500,
            markOnlineOnConnect: true
        });

        // Handle connection events
        this.sock.ev.on('connection.update', (update) => this.handleConnectionUpdate(update));

        // Save credentials every time they are updated
        this.sock.ev.on('creds.update', saveCreds);

        // Handle incoming calls (e.g. Reject them)
        this.sock.ev.on('call', (call) => this.handleIncomingCall(call));

        // Handle incoming messages
        this.sock.ev.on('messages.upsert', (msg) => this.handleIncomingMessages(msg));

        // Sync contacts
        this.sock.ev.on('contacts.upsert', (contacts) => {
            for (const contact of contacts) {
                if (!contact.id) continue;
                const existing = this.contacts.get(contact.id) || {};
                this.contacts.set(contact.id, {
                    name: contact.name || contact.verifiedName || existing.name,
                    notify: contact.notify || existing.notify
                });
            }
            this.queueSaveContacts();
        });

        this.sock.ev.on('contacts.update', (updates) => {
            for (const update of updates) {
                if (!update.id) continue;
                const existing = this.contacts.get(update.id) || {};
                this.contacts.set(update.id, {
                    name: update.name || update.verifiedName || existing.name,
                    notify: update.notify || existing.notify
                });
            }
            this.queueSaveContacts();
        });

        this.sock.ev.on('messaging-history.set', ({ contacts }) => {
            if (contacts) {
                this.addLog('INFO', `Received ${contacts.length} contacts from history sync`);
                for (const contact of contacts) {
                    if (!contact.id) continue;
                    const existing = this.contacts.get(contact.id) || {};
                    this.contacts.set(contact.id, {
                        name: contact.name || contact.verifiedName || existing.name,
                        notify: contact.notify || existing.notify
                    });
                }
                this.queueSaveContacts();
            }
        });
    }

    private handleConnectionUpdate(update: Partial<ConnectionState>): void {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            this.lastQr = qr;
            qrcodeTerminal.generate(qr, { small: true });
            this.connectionStatus = 'waiting_qr';
            this.addLog('INFO', 'New QR Code generated');
        }

        if (connection === 'close') {
            const error = lastDisconnect?.error as Boom | undefined;
            const statusCode = error?.output?.statusCode;
            const isLoggedOut = statusCode === DisconnectReason.loggedOut; // 401

            // ── Status code guide ────────────────────────────────────────
            // 401 loggedOut        – phone removed this device
            // 405 connectionReplaced – another session replaced this one (WhatsApp Web tab?)
            // 408 timedOut         – connection timed out
            // 428 connectionClosed – server closed gracefully  
            // 440 multideviceMismatch – multidevice protocol rejected
            // ────────────────────────────────────────────────────────────

            console.warn(`[WhatsApp] Connection closed (Status: ${statusCode}). LoggedOut: ${isLoggedOut}`);
            this.connectionStatus = 'closed';

            if (isLoggedOut) {
                // 401: Phone removed this linked device — clear session and show QR
                this.addLog('WARNING', 'WhatsApp: sessão removida pelo celular. Limpando e aguardando novo QR...');
                const authPath = path.join(process.cwd(), 'auth_info_baileys');
                if (fs.existsSync(authPath)) {
                    fs.rmSync(authPath, { recursive: true, force: true });
                }
                setTimeout(() => this.connect(), 3000);

            } else if (statusCode === 405) {
                // 405 connectionReplaced: Another WhatsApp session (e.g. WhatsApp Web) replaced this one.
                // The other session will likely time out. Wait longer before retrying.
                this.addLog('WARNING', 'WhatsApp: sessão substituída por outro dispositivo/aba. Aguardando 30s para reconectar...');
                setTimeout(() => this.connect(), 30000);

            } else if (statusCode === 428 || statusCode === 408) {
                // 428 connectionClosed or 408 timedOut: Network issue or timeout. Reconnect faster.
                this.addLog('INFO', `WhatsApp: conexão interrompida (${statusCode}). Tentando reestabelecer...`);
                setTimeout(() => this.connect(), 2000);

            } else {
                // Temporary disconnect (network issue, server restart) — reconnect with 10s delay
                const delay = 10000;
                this.addLog('INFO', `Reconectando em ${delay / 1000}s... (código: ${statusCode})`);
                setTimeout(() => this.connect(), delay);
            }

        } else if (connection === 'open') {
            console.log('[WhatsApp] Connection opened successfully!');
            this.connectionStatus = 'open';
            this.lastQr = null;
            this.addLog('INFO', 'WhatsApp conectado com sucesso.');
            // Process any queued messages now that we are connected
            setTimeout(() => this.processMessageQueue(), 3000);
        }
    }

    private async handleIncomingCall(calls: any[]): Promise<void> {
        console.log('[WhatsApp] Call Update:', calls);
        const callInfo = calls[0];

        if (callInfo.status === 'offer') {
            try {
                // Reject call immediately (can be customized)
                console.log(`[WhatsApp] Rejecting call from ${callInfo.from}...`);
                await this.sock?.rejectCall(callInfo.id, callInfo.from);
            } catch (e: any) {
                console.error('[WhatsApp] Error hanging up:', e.message);
            }
        }
    }


    private async handleIncomingMessages({ messages, type }: any): Promise<void> {
        if (type !== 'notify') return;

        for (const msg of messages) {
            // Check if message is valid and NOT from a status broadcast or from ourselves
            if (!msg.key.fromMe && msg.message && msg.key.remoteJid !== 'status@broadcast') {
                const from = msg.key.remoteJid;
                const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

                if (text) {
                    const cmd = text.toLowerCase().trim();
                    const pushName = msg.pushName || 'Usuário';

                    // Update contact name in map if we got a pushName
                    if (msg.pushName) {
                        const existing = this.contacts.get(from) || {};
                        if (!existing.name) {
                            this.contacts.set(from, { ...existing, name: msg.pushName });
                        }
                    }
                    this.queueSaveContacts(); // Added this line as per instruction

                    this.addLog('CHAT', `Message from ${pushName} (${from}): ${text}`);

                    // Handle Internal Agenda Commands
                    if (cmd === '#' || cmd.startsWith('#agenda') || cmd.startsWith('#hoje') || cmd.startsWith('#semana')) {
                        this.addLog('CMD', `Command: ${cmd}`);
                        let responseText = '';

                        if (!this.googleCalendar.isAuthorized()) {
                            responseText = '⚠️ *Erro:* O Google Calendar ainda não foi configurado (json não encontrado).';
                        } else if (cmd === '#') {
                            responseText = `Olá ${pushName}! 👋\n\nComandos disponíveis:\n🔹 *#agenda* - Próximos 30 dias\n🔹 *#hoje* - Eventos de hoje\n🔹 *#semana* - Eventos dos próximos 7 dias\n🔹 *#hora* - Horário atual\n\n💡 *Dica:* Para agendar algo, apenas descreva. Ex:\n_"Bot, agendar reunião amanhã às 14h"_`;
                        } else {
                            responseText = await this.handleCalendarCommands(cmd);
                        }

                        if (responseText) {
                            await this.sendMessage(from, responseText);
                        }
                    } else if (cmd === '#hora') {
                        const agora = new Date().toLocaleTimeString('pt-BR');
                        await this.sendMessage(from, `⌚ Horário Atual do Servidor: *${agora}*`);
                    } else if (cmd === '#ip') {
                        const os = await import('os');
                        const nets = os.networkInterfaces();
                        let ip = 'Nenhum IP encontrado';
                        for (const name of Object.keys(nets)) {
                            for (const net of nets[name]!) {
                                if (net.family === 'IPv4' && !net.internal) {
                                    ip = net.address;
                                }
                            }
                        }
                        await this.sendMessage(from, `🌐 *IP do Servidor:* ${ip}\n📊 *Painel:* http://${ip}:${process.env.PORT || 3001}`);
                    } else if (cmd === '#config') {
                        const target = await this.getNotificationNumber();
                        const googleOk = this.googleCalendar.isAuthorized() ? '✅' : '❌';
                        const wppOk = this.connectionStatus === 'open' ? '✅' : '❌';
                        await this.sendMessage(from, `⚙️ *Configurações do Bot:*\n\nWhatsApp: ${wppOk}\nGoogle Calendar: ${googleOk}\nNúmero de Notificações: ${target || 'Nenhum'}`);
                    } else if (cmd.includes('agendar') || cmd.includes('marcar')) {
                        this.addLog('NLP', `Processing request: ${text}`);
                        await this.sendMessage(from, '✨ _Estou processando seu pedido de agendamento..._');

                        // Simple Mock of NLP for now (to be replaced by Gemini/ChatGPT)
                        // This logic extracts date and title from patterns like "agendar REMOCAO DE CISTO amanhã as 10h"
                        const summaryMatch = text.match(/(?:agendar|marcar)\s+(.+?)(?:\s+amanhã|\s+hoje|\s+dia|\s+às|\s+as|$)/i);
                        const summary = summaryMatch ? summaryMatch[1].trim() : "Novo Compromisso";

                        let startDate = new Date();
                        if (text.toLowerCase().includes('amanhã')) startDate.setDate(startDate.getDate() + 1);

                        const timeMatch = text.match(/(\d{1,2})[h:](\d{0,2})/i);
                        if (timeMatch) {
                            startDate.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2] || "0"), 0);
                        } else {
                            startDate.setHours(9, 0, 0); // Default to 9 AM
                        }

                        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour duration

                        try {
                            await this.googleCalendar.createEvent('primary', {
                                summary: summary,
                                description: `Agendado via WhatsApp por ${pushName}`,
                                start: { dateTime: startDate.toISOString() },
                                end: { dateTime: endDate.toISOString() }
                            });
                            await this.sendMessage(from, `✅ *Agendado com Sucesso!*\n\n📌 *Evento:* ${summary}\n📅 *Data:* ${format(startDate, 'dd/MM')}\n🕒 *Hora:* ${format(startDate, 'HH:mm')}\n\n_Já está sincronizado com seu Google Calendar!_`);
                        } catch (e: any) {
                            await this.sendMessage(from, `❌ *Erro ao agendar:* ${e.message}`);
                        }
                    } else if (cmd.startsWith('!') || cmd.startsWith('#')) {
                        await this.sendMessage(from, 'Comando não reconhecido. Digite *#* para ver as opções.');
                    }
                }
            }
        }
    }

    private async handleCalendarCommands(cmd: string): Promise<string> {
        try {
            const now = Date.now();
            let timeMax: number;
            let periodName: string;

            if (cmd.includes('#hoje')) {
                timeMax = now + (1000 * 60 * 60 * 24);
                periodName = 'Hoje';
            } else if (cmd.includes('#semana')) {
                timeMax = now + (1000 * 60 * 60 * 24 * 7);
                periodName = 'Próximos 7 Dias';
            } else {
                timeMax = now + (1000 * 60 * 60 * 24 * 30);
                periodName = 'Próximos 30 Dias';
            }

            const events = await this.googleCalendar.getEvents(now, timeMax);

            if (!events || events.length === 0) {
                return `📅 Você não tem nenhum evento para: *${periodName}*.`;
            }

            let sb = `📅 *Sua Agenda (${periodName}):*\n\n`;
            let count = 0;

            for (const event of events) {
                if (count++ > 15) {
                    sb += '... e outros eventos.';
                    break;
                }

                const summary = event.summary || 'Evento Sem Título';
                const start = event.start?.dateTime || event.start?.date;

                if (!start) {
                    sb += `🔹 *${summary}*\n   📅 Horário não definido\n\n`;
                } else if (start.length === 10) {
                    // YYYY-MM-DD
                    sb += `🔹 *${summary}*\n   📅 Dia inteiro (${start})\n\n`;
                } else {
                    const dt = parseISO(start);
                    const formatted = format(dt, 'dd/MM HH:mm');
                    sb += `🔹 *${summary}*\n   🕒 ${formatted}\n\n`;
                }
            }

            return sb;
        } catch (error: any) {
            console.error('[Calendar Error]', error);
            return '❌ Erro ao buscar eventos: ' + error.message;
        }
    }

    // Public API Methods
    public async getUserInfo() {
        if (!this.sock || this.connectionStatus !== 'open' || !this.sock.user) return null;
        try {
            // Clean JID (remove :device-id if present)
            const baseId = this.sock.user.id.split(':')[0];
            const jid = `${baseId}@s.whatsapp.net`;

            let photoUrl = null;
            try {
                photoUrl = await this.sock.profilePictureUrl(jid, 'image');
            } catch (e) {
                // If no profile picture or error fetching it
            }

            return {
                id: jid,
                name: this.sock.user.name || baseId,
                photo: photoUrl
            };
        } catch (e) {
            return null;
        }
    }

    public async getQrData(): Promise<{ status: string; qr?: string }> {
        if (this.connectionStatus === 'open') return { status: 'connected' };
        if (!this.lastQr) return { status: this.connectionStatus };

        try {
            const qrImage = await QRCode.toDataURL(this.lastQr);
            return { status: 'waiting_qr', qr: qrImage };
        } catch (err) {
            throw new Error('Failed to generate QR image');
        }
    }

    public async sendMessage(to: string, text: string): Promise<void> {
        if (!this.sock || this.connectionStatus !== 'open') {
            throw new Error('WhatsApp not connected');
        }

        try {
            // 1. Simular "digitando..."
            await this.sock.sendPresenceUpdate('composing', to);

            // 2. Tempo de espera baseado no tamanho da mensagem (mínimo 2s, máximo 7s)
            const typingDuration = Math.min(Math.max(text.length * 40, 2000), 7000);
            await new Promise(resolve => setTimeout(resolve, typingDuration));

            // 3. Parar de "digitar"
            await this.sock.sendPresenceUpdate('paused', to);

            // 4. Enviar a mensagem real
            await this.sock.sendMessage(to, { text });
        } catch (error: any) {
            this.addLog('ERROR', `Error sending message to ${to}: ${error.message}`);
            throw error;
        }
    }

    public async offerCall(to: string): Promise<string> {
        if (!this.sock || this.connectionStatus !== 'open') {
            throw new Error('WhatsApp not connected');
        }
        console.log(`[WhatsApp] Initiating call to ${to}...`);
        const callId = await (this.sock as any).offerCall(to);
        return callId.id || callId;
    }

    public async getProfilePic(jid: string): Promise<string | null> {
        if (!this.sock || this.connectionStatus !== 'open') return null;
        try {
            const url = await this.sock.profilePictureUrl(jid, 'image');
            return url || null;
        } catch {
            return null;
        }
    }

    public async getContacts(): Promise<{ id: string, name?: string, notify?: string }[]> {
        if (this.contacts.size === 0) {
            this.addLog('INFO', 'getContacts called but list is empty. Still syncing?');
        }
        return Array.from(this.contacts.entries())
            .filter(([id]) => id.endsWith('@s.whatsapp.net') || id.endsWith('@lid')) // Include LID contacts
            .map(([id, data]) => ({ id, ...data }));
    }

    public async getGroups(): Promise<{ id: string, subject: string }[]> {
        if (!this.sock || this.connectionStatus !== 'open') {
            this.addLog('WARNING', 'Attempted to fetch groups while WhatsApp is not connected.');
            return [];
        }
        try {
            this.addLog('INFO', 'Fetching all participating groups...');
            const groups = await this.sock.groupFetchAllParticipating();
            const result = Object.values(groups).map((g: any) => ({
                id: g.id,
                subject: g.subject
            }));
            this.addLog('INFO', `Found ${result.length} groups.`);
            return result;
        } catch (e: any) {
            this.addLog('ERROR', `Failed to fetch groups: ${e.message}`);
            return [];
        }
    }

    public async disconnect(): Promise<void> {
        console.log('[WhatsApp] User requested disconnect/reset...');
        await this.resetConnection();
    }
}
