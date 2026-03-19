let allContacts = [];
let cachedEvents = [];
let sidebarCalendar = null;
let selectedDateFilter = null; // ISO Date String (YYYY-MM-DD)
let waModalDismissed = false;
let quickFavorites = JSON.parse(localStorage.getItem('wa_quick_favorites') || 'null') || [null, null, null, null, null, null];
const API_BASE = '/v1/config';

/** Robust helper to parse Google Calendar start/end into a Date object */
function parseGoogleDate(raw) {
    if (!raw) return null;
    if (raw instanceof Date) return raw;
    if (typeof raw === 'object' && (raw.dateTime || raw.date)) return parseGoogleDate(raw.dateTime || raw.date);
    if (typeof raw === 'string' && raw.length === 10) {
        const [y, m, d] = raw.split('-').map(Number);
        return new Date(y, m - 1, d, 0, 0, 0, 0); 
    }
    return new Date(raw);
}

/** Helper to check if a date falls on the same calendar day as another */
function isSameDay(d1, d2) {
    if (!d1 || !d2) return false;
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

/** Helper for local YYYY-MM-DD string */
function toLocaleISO(d) {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function openWaModal() {
    if (waModalDismissed) return;
    document.getElementById('wa-modal').style.display = 'flex';
}

function closeWaModal() {
    waModalDismissed = true;
    document.getElementById('wa-modal').style.display = 'none';
}

function showPage(pageId, event) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    document.getElementById(pageId).classList.add('active');
    if (event && event.target) {
        event.target.classList.add('active');
    }

    if (pageId === 'eventos') {
        loadCalendars().then(fetchEvents);
    }
    if (pageId === 'google') {
        listAgendas();
    }
    if (pageId === 'config') {
        listCredentials();
    }
}

async function updateStatus() {
    try {
        const response = await fetch(`${API_BASE}/status?t=${new Date().getTime()}`, {
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        const data = await response.json();

        // Update Backend Status
        const backendStatus = document.getElementById('status-backend');
        if (backendStatus) {
            backendStatus.className = 'status-pill online';
            backendStatus.innerHTML = '● Backend';
        }

        // Update Google Status
        const googleStatus = document.getElementById('status-google');
        if (googleStatus) {
            if (data.googleAuthorized) {
                googleStatus.className = 'status-pill online';
                googleStatus.innerHTML = '● Google';
            } else {
                googleStatus.className = 'status-pill offline';
                googleStatus.innerHTML = '● Google (Off)';
            }
        }

        // Update WhatsApp Status
        const waStatus = document.getElementById('status-whatsapp');
        const waPageStatus = document.getElementById('wa-status-text');
        const qrContainer = document.getElementById('qr-container');
        const waProfile = document.getElementById('wa-profile');

        if (waStatus) {
            if (data.whatsapp.status === 'open' || data.whatsapp.status === 'connected') {
                waStatus.className = 'status-pill online';
                waStatus.innerHTML = '● WhatsApp';
                if (waPageStatus) waPageStatus.innerHTML = 'CONECTADO COM SUCESSO!';

                // Show profile info if available
                if (data.whatsapp.user) {
                    if (waProfile) waProfile.style.display = 'flex';
                    if (qrContainer) qrContainer.style.display = 'none';
                    const photo = data.whatsapp.user.photo || 'https://via.placeholder.com/120?text=WA';
                    const name = data.whatsapp.user.name;
                    const idShort = data.whatsapp.user.id.split('@')[0];

                    if (document.getElementById('wa-user-photo')) document.getElementById('wa-user-photo').src = photo;
                    if (document.getElementById('wa-user-name')) document.getElementById('wa-user-name').innerText = name;
                    if (document.getElementById('wa-user-id')) document.getElementById('wa-user-id').innerText = idShort;

                    // Header Sync
                    const headerWaUser = document.getElementById('header-wa-user');
                    if (headerWaUser) {
                        headerWaUser.style.display = 'flex';
                        if (document.getElementById('header-wa-photo')) document.getElementById('header-wa-photo').src = photo;
                        if (document.getElementById('header-wa-name')) document.getElementById('header-wa-name').innerText = name;
                    }
                } else {
                    if (waProfile) waProfile.style.display = 'none';
                    if (document.getElementById('header-wa-user')) document.getElementById('header-wa-user').style.display = 'none';
                    if (qrContainer) {
                        qrContainer.style.display = 'flex';
                        qrContainer.innerHTML = '<h3>WhatsApp Conectado!</h3>';
                    }
                }

                if (document.getElementById('btn-disconnect-wa')) document.getElementById('btn-disconnect-wa').style.display = 'block';

                const manualCallSection = document.getElementById('manual-call-section');
                if (manualCallSection) manualCallSection.style.display = 'block';

                if (allContacts.length === 0 && !loadingContacts && (data.whatsapp.status === 'connected' || data.whatsapp.status === 'open')) {
                    loadContacts(false);
                }
            } else if (data.whatsapp.status === 'waiting_qr' || data.whatsapp.qr) {
                waStatus.className = 'status-pill warning';
                waStatus.innerHTML = '● Aguardando QR';
                if (waPageStatus) waPageStatus.innerHTML = 'Aguardando Escaneamento...';
                if (document.getElementById('btn-disconnect-wa')) document.getElementById('btn-disconnect-wa').style.display = 'none';
                if (waProfile) waProfile.style.display = 'none';
                if (qrContainer) {
                    qrContainer.style.display = 'flex';
                    if (data.whatsapp.qr) {
                        qrContainer.innerHTML = `<img src="${data.whatsapp.qr}" style="width: 250px; height: 250px;" />`;
                    }
                }
            } else {
                waStatus.className = 'status-pill offline';
                waStatus.innerHTML = '● WhatsApp (Off)';
                if (waProfile) waProfile.style.display = 'none';
                if (qrContainer) qrContainer.style.display = 'flex';
                const manualCallSection = document.getElementById('manual-call-section');
                if (manualCallSection) manualCallSection.style.display = 'none';
            }
        }

    } catch (e) {
        console.error('Error fetching status', e);
    }
}

function updateDashboardMetrics(events) {
    if (!events) return;

    let totalEvents = events.length;
    let totalMinutes = 0;
    let canceledCount = 0;
    let upcoming7dCount = 0;
    let postponedCount = 0;
    let completedCount = 0;

    const now = new Date();
    const next7d = new Date();
    next7d.setDate(now.getDate() + 7);

    events.forEach(event => {
        const startRaw = event.start.dateTime || event.start.date || event.start;
        const endRaw = event.end ? (event.end.dateTime || event.end.date || event.end) : startRaw;

        const startDate = startRaw ? new Date(startRaw) : null;
        const endDate = endRaw ? new Date(endRaw) : (startDate || now);

        // Calculate Meeting Hours (only for non-all-day events or events with time)
        if (startRaw && startRaw.includes('T') && endDate > startDate) {
            const diffMs = endDate - startDate;
            totalMinutes += diffMs / 60000;
        }

        const title = (event.summary || "").toLowerCase();
        const description = (event.description || "").toLowerCase();

        // Consistent Status Detection
        const isCanceled = title.includes('cancelado') || description.includes('[canceled]') || event.local_status === 'canceled';
        const isPostponed = title.includes('adiado') || title.includes('remarcado') || description.includes('[postponed]') || event.local_status === 'postponed';
        const isDone = title.includes('concluíd') || title.includes('concluid') || description.includes('[done]') || event.local_status === 'done';
        
        if (isCanceled) {
            canceledCount++;
        } else if (isPostponed) {
            postponedCount++;
        } else if (isDone || (endDate < now)) {
            completedCount++;
        }

        // Upcoming 7 Days (somente para eventos ativos com data)
        if (!isCanceled && !isPostponed && !isDone && startDate && startDate >= now && startDate <= next7d) {
            upcoming7dCount++;
        }
    });

    const totalHours = Math.floor(totalMinutes / 60);

    // Update UI
    const elTotal = document.getElementById('metric-total-events');
    const elHours = document.getElementById('metric-meeting-hours');
    const elCanceled = document.getElementById('metric-canceled-events');
    const elPostponed = document.getElementById('metric-postponed-events');
    const elCompleted = document.getElementById('metric-completed-events');
    const elUpcoming = document.getElementById('metric-upcoming-7d');

    if (elTotal) elTotal.innerText = totalEvents;
    if (elHours) elHours.innerText = `${totalHours}h`;
    if (elCanceled) elCanceled.innerText = canceledCount;
    if (elPostponed) elPostponed.innerText = postponedCount;
    if (elCompleted) elCompleted.innerText = completedCount;
    if (elUpcoming) elUpcoming.innerText = upcoming7dCount;
}

let calendarInstance = null;
window.activeCalendars = new Set();
window.availableCalendars = [];
window.cachedEvents = [];

// Google Calendar standard color IDs mapped to HEX for UI display
const googleColorMap = {
    "1": "#7986cb", // Lavender
    "2": "#33b679", // Sage
    "3": "#8e24aa", // Grape
    "4": "#e67c73", // Flamingo
    "5": "#f6bf26", // Banana
    "6": "#f4511e", // Tangerine
    "7": "#039be5", // Peacock
    "8": "#616161", // Graphite
    "9": "#3f51b5", // Blueberry
    "10": "#0b8043", // Basil
    "11": "#d50000"  // Tomato
};

// Initialize the visual color picker (bolinhas)
function initColorPicker() {
    const picker = document.getElementById('color-picker');
    if (!picker) return;
    picker.innerHTML = '';

    // Add default color dot
    const defaultDot = document.createElement('div');
    defaultDot.className = 'color-dot';
    defaultDot.style.backgroundColor = '#3788d8';
    defaultDot.dataset.id = "";
    defaultDot.title = "Padrão";
    defaultDot.onclick = () => selectColor("");
    picker.appendChild(defaultDot);

    Object.keys(googleColorMap).forEach(id => {
        const dot = document.createElement('div');
        dot.className = 'color-dot';
        if (id === "5") dot.classList.add('light-color'); // Banana
        dot.style.backgroundColor = googleColorMap[id];
        dot.dataset.id = id;
        dot.onclick = () => selectColor(id);
        picker.appendChild(dot);
    });
}

function selectColor(colorId) {
    const input = document.getElementById('event-color');
    if (!input) return;
    input.value = colorId || "";

    document.querySelectorAll('.color-dot').forEach(dot => {
        if (dot.dataset.id === (colorId || "")) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
}

function toggleModalEditMode(isEdit) {
    const modal = document.querySelector('.planka-modal');
    if (!modal) return;

    const isNew = document.getElementById('event-id').value === "";
    const submitBtn = modal.querySelector('button[onclick="submitEvent()"]');

    if (submitBtn) {
        submitBtn.innerHTML = isNew ? "<span>💾</span> <strong>Agendar</strong>" : "<span>💾</span> <strong>Salvar</strong>";
    }

    const calSelect = document.getElementById('event-calendar');
    if (calSelect) calSelect.disabled = !isNew;
}

// Persiste/recupera quais agendas estão desativadas entre sessões
const DISABLED_CALENDARS_KEY = 'agendabot_disabled_calendars';
function getDisabledCalendars() {
    try { return new Set(JSON.parse(localStorage.getItem(DISABLED_CALENDARS_KEY) || '[]')); }
    catch { return new Set(); }
}
function setCalendarDisabled(calId, disabled) {
    const set = getDisabledCalendars();
    if (disabled) set.add(calId); else set.delete(calId);
    localStorage.setItem(DISABLED_CALENDARS_KEY, JSON.stringify([...set]));
}

async function loadCalendars() {
    try {
        const response = await fetch('/v1/events/calendars');
        if (!response.ok) throw new Error("Failed to load calendars");
        window.availableCalendars = await response.json();

        const disabledCalendars = getDisabledCalendars();

        // Calendários ativos = todos EXCETO os explicitamente desativados
        window.activeCalendars = new Set(
            window.availableCalendars.filter(c => !disabledCalendars.has(c.id)).map(c => c.id)
        );

        const filterContainer = document.getElementById('calendar-filters-container');
        if (filterContainer) filterContainer.innerHTML = '';

        const selectContainer = document.getElementById('event-calendar');
        if (selectContainer) selectContainer.innerHTML = '';

        window.availableCalendars.forEach(cal => {
            const isActive = !disabledCalendars.has(cal.id);
            const calColor = cal.backgroundColor || '#3788d8';

            // ----- Item row -----
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 2px;border-radius:6px;transition:background 0.15s;';
            row.onmouseover = () => row.style.background = 'rgba(255,255,255,0.05)';
            row.onmouseout  = () => row.style.background = 'transparent';

            // Bolinha de cor da agenda
            const dot = document.createElement('span');
            dot.style.cssText = `width:9px;height:9px;border-radius:50%;background:${calColor};flex-shrink:0;`;
            row.appendChild(dot);

            // Label (nome da agenda)
            const label = document.createElement('span');
            label.innerText = cal.summary;
            label.title = cal.id;
            label.style.cssText = `flex:1;font-size:0.82rem;color:${isActive ? 'white' : 'var(--text-muted)'};cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:color 0.2s;`;
            row.appendChild(label);

            // Toggle switch
            const toggleLabel = document.createElement('label');
            toggleLabel.style.cssText = 'position:relative;display:inline-block;width:32px;height:18px;flex-shrink:0;cursor:pointer;';

            const toggleInput = document.createElement('input');
            toggleInput.type = 'checkbox';
            toggleInput.checked = isActive;
            toggleInput.style.cssText = 'opacity:0;width:0;height:0;position:absolute;';

            const slider = document.createElement('span');
            slider.style.cssText = `
                position:absolute;top:0;left:0;right:0;bottom:0;
                background:${isActive ? calColor : 'rgba(255,255,255,0.15)'};
                border-radius:18px;transition:background 0.25s;
            `;

            const knob = document.createElement('span');
            knob.style.cssText = `
                position:absolute;width:13px;height:13px;border-radius:50%;background:white;
                top:2.5px;left:${isActive ? '16px' : '2.5px'};transition:left 0.25s;
                box-shadow:0 1px 3px rgba(0,0,0,0.4);
            `;
            slider.appendChild(knob);
            toggleLabel.appendChild(toggleInput);
            toggleLabel.appendChild(slider);

            const applyState = (active) => {
                slider.style.background = active ? calColor : 'rgba(255,255,255,0.15)';
                knob.style.left = active ? '16px' : '2.5px';
                label.style.color = active ? 'white' : 'var(--text-muted)';
                dot.style.opacity = active ? '1' : '0.35';
            };

            toggleInput.onchange = () => {
                const active = toggleInput.checked;
                applyState(active);
                setCalendarDisabled(cal.id, !active);
                if (active) window.activeCalendars.add(cal.id);
                else window.activeCalendars.delete(cal.id);
                filterAndRenderEvents();
            };

            // Click na label/dot também activa o toggle
            label.onclick = () => { toggleInput.checked = !toggleInput.checked; toggleInput.dispatchEvent(new Event('change')); };

            row.appendChild(toggleLabel);
            if (filterContainer) filterContainer.appendChild(row);

            // Dropdown option (só aparece se a agenda está ativa)
            const opt = document.createElement('option');
            opt.value = cal.id;
            opt.innerText = cal.summary;
            opt.style.background = calColor;
            opt.style.color = 'white';
            if (selectContainer) selectContainer.appendChild(opt);
        });

    } catch (e) {
        console.error("Error loading calendars", e);
        const filterContainer = document.getElementById('calendar-filters-container');
        if (filterContainer) filterContainer.innerHTML = '<p style="color:red">Erro ao carregar agendas</p>';
    }
}


async function fetchEvents() {
    try {
        // Serve do cache do servidor — sem cache-busting, o servidor gerencia a renovação
        const response = await fetch('/v1/events');
        if (!response.ok) return;

        window.cachedEvents = await response.json();

        // Exibe a hora da última atualização do cache (vinda do servidor)
        const cacheHeader = response.headers.get('X-Cache-Updated');
        if (cacheHeader && cacheHeader !== 'never') {
            const updated = new Date(cacheHeader);
            const timeStr = updated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const el = document.getElementById('cache-last-updated');
            if (el) el.textContent = `Atualizado às ${timeStr}`;
        }

        filterAndRenderEvents();
    } catch (e) {
        console.error('Error fetching events', e);
    }
}

// Força um refresh do cache no servidor e recarrega os eventos no frontend
async function refreshEvents() {
    const btn = document.getElementById('btn-refresh-events');
    const el = document.getElementById('cache-last-updated');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Atualizando...'; }
    if (el) el.textContent = 'Atualizando...';
    try {
        const res = await fetch('/v1/events/refresh', { method: 'POST' });
        if (res.ok) {
            await fetchEvents();
        } else {
            console.error('Refresh falhou');
            if (el) el.textContent = 'Erro ao atualizar';
        }
    } catch (e) {
        console.error('Refresh error', e);
        if (el) el.textContent = 'Erro ao atualizar';
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🔄 Atualizar'; }
    }
}

function filterAndRenderEvents() {
    if (!window.cachedEvents) return;

    // Filter events based on active checkboxes (calendars)
    let filteredEvents = window.cachedEvents.filter(e => window.activeCalendars.has(e.calendarId));

    // Also filter by selected date if applicable
    const eventsForKanban = filteredEvents.filter(event => {
        if (!selectedDateFilter) return true;
        const start = parseGoogleDate(event.start);
        const end = parseGoogleDate(event.end || event.start);
        if (!start || !end) return false;
        
        const startStr = toLocaleISO(start);
        const endStr = toLocaleISO(end);
        
        // Special handling for All Day events end date
        const isAllDay = (typeof (event.start.date || event.start) === 'string' && (event.start.date || event.start).length === 10);
        let checkEndStr = endStr;
        if (isAllDay) {
            const adjustedEnd = new Date(end.getTime() - 1);
            checkEndStr = toLocaleISO(adjustedEnd);
        }

        return selectedDateFilter >= startStr && selectedDateFilter <= checkEndStr;
    });

    // Update Monthly List (Kanban)
    renderMonthlyEvents(eventsForKanban);

    // Update Dashboard Metrics - Metrics usually reflect the whole month or the filtered set? 
    // Usually metrics reflect what you SEE, so we use eventsForKanban
    updateDashboardMetrics(eventsForKanban);

    // Format for FullCalendar (The large one in the dashboard, if it exists)
    const eventsForFC = filteredEvents.map(event => {
        let bgColor = '#3788d8'; // default FullCalendar blue
        if (event.colorId && googleColorMap[event.colorId]) {
            bgColor = googleColorMap[event.colorId];
        } else if (event.calendarId) {
            const cal = window.availableCalendars.find(c => c.id === event.calendarId);
            if (cal && cal.backgroundColor) bgColor = cal.backgroundColor;
        }
        return {
            id: event.id,
            title: event.summary,
            start: event.start,
            end: event.end || event.start,
            backgroundColor: bgColor,
            borderColor: bgColor,
            extendedProps: {
                description: event.description,
                colorId: event.colorId,
                calendarId: event.calendarId,
                calendarName: event.calendarName
            }
        };
    });

    const calendarEl = document.getElementById('calendar');

    if (calendarInstance) {
        calendarInstance.destroy();
    }

    calendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'pt-br',
        events: eventsForFC,
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek'
        },
        selectable: true,
        select: function (info) {
            // Open creation modal for a NEW event
            document.getElementById('event-id').value = "";
            toggleModalEditMode(true); // Open directly in Edit mode for NEW events

            const calendarSelect = document.getElementById('event-calendar');
            if (calendarSelect && window.activeCalendars.size > 0 && Array.from(window.activeCalendars)[0]) {
                calendarSelect.value = Array.from(window.activeCalendars)[0];
            }
            if (calendarSelect) calendarSelect.disabled = false;

            document.getElementById('event-description').value = "";
            document.getElementById('event-call-reminder').value = "";

            // Dynamic Participants
            const container = document.getElementById('participants-container');
            if (container) {
                container.innerHTML = "";
                addParticipantRow(); // Add one empty row by default
            }

            selectColor("");

            document.getElementById('event-start-date').value = info.startStr;
            document.getElementById('event-start-time').value = "09:00";

            document.getElementById('event-end-date').value = info.startStr;
            document.getElementById('event-end-time').value = "10:00";

            document.getElementById('btn-delete-event').style.display = 'none';
            document.getElementById('event-modal').style.display = 'flex';
        },
        eventClick: function (info) {
            // Open edition modal for an EXISTING event
            const eventObj = info.event;
            document.getElementById('event-id').value = eventObj.id;
            toggleModalEditMode(false); // Open in View mode for EXISTING events

            document.getElementById('event-title').value = eventObj.title;

            const calendarSelect = document.getElementById('event-calendar');
            if (calendarSelect) {
                calendarSelect.value = eventObj.extendedProps.calendarId || "";
                calendarSelect.disabled = true; // Disallow changing calendar mid-edit
            }

            selectColor(eventObj.extendedProps.colorId || "");

            const splitDateAndTime = (dateObj) => {
                if (!dateObj) return { date: "", time: "" };
                const offset = dateObj.getTimezoneOffset() * 60000;
                const iso = (new Date(dateObj - offset)).toISOString();
                return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
            };

            const startVals = splitDateAndTime(eventObj.start);
            const endVals = splitDateAndTime(eventObj.end || eventObj.start);

            document.getElementById('event-start-date').value = startVals.date;
            document.getElementById('event-start-time').value = startVals.time;
            document.getElementById('event-end-date').value = endVals.date;
            document.getElementById('event-end-time').value = endVals.time;

            // Handle Description and Participants
            const fullDesc = eventObj.extendedProps.description || "";
            document.getElementById('event-call-reminder').value = "";

            const pContainer = document.getElementById('participants-container');
            if (pContainer) pContainer.innerHTML = "";

            // Store the FULL original description in a hidden field to protect unknown tags
            let hiddenRaw = document.getElementById('event-raw-desc');
            if (!hiddenRaw) {
                hiddenRaw = document.createElement('input');
                hiddenRaw.type = 'hidden';
                hiddenRaw.id = 'event-raw-desc';
                document.getElementById('event-modal').appendChild(hiddenRaw);
            }
            hiddenRaw.value = fullDesc;

            if (fullDesc) {
                // Parse Participants [WA_IDS:name|number, ...]
                const waMatch = fullDesc.match(/\[WA_IDS:\s*(.*?)\]/);
                if (waMatch && waMatch[1]) {
                    waMatch[1].split(', ').forEach(p => {
                        const [n, w] = p.split('|');
                        if (n || w) addParticipantRow(n || "", w || "");
                    });
                }

                // Restore Group Mode, JID and Name
                const groupModeMatch = fullDesc.match(/\[GROUP_MODE:(\w+)\]/);
                const groupJidMatch = fullDesc.match(/\[GROUP_JID:([^\]]+)\]/);
                const groupNameMatch = fullDesc.match(/\[GROUP_NAME:([^\]]+)\]/);
                const groupModeEl = document.getElementById('event-group-mode');
                if (groupModeEl && groupModeMatch) {
                    groupModeEl.value = groupModeMatch[1];
                }
                if (groupJidMatch) {
                    const jidEl = document.getElementById('event-group-jid');
                    if (jidEl) jidEl.value = groupJidMatch[1];
                }
                if (groupNameMatch) {
                    const nameEl = document.getElementById('event-group-name');
                    if (nameEl) nameEl.value = groupNameMatch[1];
                }

                // Clean description: only show human-readable lines (strip all [TAG:...] lines)
                const cleanDesc = fullDesc
                    .split('\n')
                    .filter(line => !line.trim().match(/^\[.+:.+\]/))
                    .join('\n')
                    .trim();
                document.getElementById('event-description').value = cleanDesc;

                // Render Checklists and Attachments from full description
                renderChecklistsAndAttachments({ description: fullDesc });
            } else {
                document.getElementById('event-description').value = "";
                renderChecklistsAndAttachments({ description: "" });
            }

            if (!pContainer || pContainer.querySelectorAll('.p-row').length === 0) {
                addParticipantRow();
            }

            // Sync Group Modes UI
            toggleGroupFields();

            document.getElementById('btn-delete-event').style.display = 'block';
            document.getElementById('event-modal').style.display = 'flex';
        }
    });
    calendarInstance.render();
}

// ---- Modal Draft Preservation ----
// Saved draft state so user can return to where they were
let _modalDraft = null;

function _readModalDraft() {
    // Only save drafts for NEW events (id is empty)
    if (document.getElementById('event-id').value !== '') return null;
    return {
        title: document.getElementById('event-title')?.value || '',
        location: document.getElementById('event-location')?.value || '',
        description: document.getElementById('event-description')?.value || '',
        startDate: document.getElementById('event-start-date')?.value || '',
        startTime: document.getElementById('event-start-time')?.value || '',
        endDate: document.getElementById('event-end-date')?.value || '',
        endTime: document.getElementById('event-end-time')?.value || '',
        calendarId: document.getElementById('event-calendar')?.value || '',
        colorId: document.getElementById('event-color')?.value || '',
        callReminder: document.getElementById('event-call-reminder')?.value || '',
        eventType: document.getElementById('event-type')?.value || 'reuniao',
        groupMode: document.getElementById('event-group-mode')?.value || 'individual',
        status: document.getElementById('event-status')?.value || 'todo',
    };
}

function _hasDraftContent(draft) {
    if (!draft) return false;
    return draft.title.trim() !== '' || draft.description.trim() !== '' || draft.location.trim() !== '';
}

function _restoreDraft(draft) {
    if (!draft) return;
    if (document.getElementById('event-title')) document.getElementById('event-title').value = draft.title;
    if (document.getElementById('event-location')) document.getElementById('event-location').value = draft.location;
    if (document.getElementById('event-description')) document.getElementById('event-description').value = draft.description;
    if (document.getElementById('event-start-date')) document.getElementById('event-start-date').value = draft.startDate;
    if (document.getElementById('event-start-time')) document.getElementById('event-start-time').value = draft.startTime;
    if (document.getElementById('event-end-date')) document.getElementById('event-end-date').value = draft.endDate;
    if (document.getElementById('event-end-time')) document.getElementById('event-end-time').value = draft.endTime;
    if (document.getElementById('event-calendar')) document.getElementById('event-calendar').value = draft.calendarId;
    if (document.getElementById('event-call-reminder')) document.getElementById('event-call-reminder').value = draft.callReminder;
    if (draft.eventType && document.getElementById('event-type')) document.getElementById('event-type').value = draft.eventType;
    if (draft.groupMode && document.getElementById('event-group-mode')) document.getElementById('event-group-mode').value = draft.groupMode;
    if (draft.status && document.getElementById('event-status')) document.getElementById('event-status').value = draft.status;
    selectColor(draft.colorId || '');
    toggleGroupFields();
}

function closeModal() {
    // Save draft if there is meaningful unsaved content in a new-event form
    const draft = _readModalDraft();
    if (_hasDraftContent(draft)) {
        _modalDraft = draft;
    } else {
        _modalDraft = null;
    }
    document.getElementById('event-modal').style.display = 'none';
}

// Click outside modal → close with draft preservation  
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('event-modal');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });
    }
});

// Function to open the create modal directly from the "Eventos" tab UI
function openCreateModal() {
    document.getElementById('event-id').value = '';
    toggleModalEditMode(true);

    // ---- Restore draft if user started typing before closing ----
    if (_hasDraftContent(_modalDraft)) {
        _restoreDraft(_modalDraft);
        document.getElementById('event-modal').style.display = 'flex';
        return; // Done: kept their draft
    }

    // No draft: fresh form
    _modalDraft = null;

    // Reset Group Modes
    if (document.getElementById('event-group-mode')) document.getElementById('event-group-mode').value = 'individual';
    toggleGroupFields();

    document.getElementById('event-title').value = '';
    document.getElementById('event-location').value = '';

    const calendarSelect = document.getElementById('event-calendar');
    if (calendarSelect && window.activeCalendars.size > 0) {
        calendarSelect.value = Array.from(window.activeCalendars)[0];
    }
    if (calendarSelect) calendarSelect.disabled = false;

    if (document.getElementById('event-description')) document.getElementById('event-description').value = '';
    if (document.getElementById('event-call-reminder')) document.getElementById('event-call-reminder').value = '';
    if (document.getElementById('event-type')) document.getElementById('event-type').value = 'reuniao';

    // Clear Dynamic Sections
    if (document.getElementById('participants-container')) {
        document.getElementById('participants-container').innerHTML = '';
        addParticipantRow();
    }

    if (document.getElementById('checklists-wrapper')) {
        document.getElementById('checklists-wrapper').innerHTML = '';
    }

    if (document.getElementById('attachments-list')) {
        document.getElementById('attachments-list').innerHTML = '';
    }

    if (document.getElementById('event-status')) document.getElementById('event-status').value = 'todo';

    selectColor('');

    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localNow = new Date(now - offset);

    const startIso = localNow.toISOString();
    document.getElementById('event-start-date').value = startIso.slice(0, 10);
    document.getElementById('event-start-time').value = startIso.slice(11, 16);

    localNow.setHours(localNow.getHours() + 1);
    const endIso = localNow.toISOString();
    document.getElementById('event-end-date').value = endIso.slice(0, 10);
    document.getElementById('event-end-time').value = endIso.slice(11, 16);

    document.getElementById('btn-delete-event').style.display = 'none';
    document.getElementById('event-modal').style.display = 'flex';
}

async function submitEvent() {
    const eventId = document.getElementById('event-id').value;
    const title = document.getElementById('event-title').value;
    const location = document.getElementById('event-location').value.trim();
    const colorId = document.getElementById('event-color').value;

    const startDate = document.getElementById('event-start-date').value;
    const startTime = document.getElementById('event-start-time').value;
    const endDate = document.getElementById('event-end-date').value;
    const endTime = document.getElementById('event-end-time').value;

    if (!title || !startDate || !startTime || !endDate || !endTime) {
        alert("Preencha todos os campos obrigatórios (Datas e Horários).");
        return;
    }

    // Combine string back to ISO offset string
    const start = `${startDate}T${startTime}:00-03:00`;
    const end = `${endDate}T${endTime}:00-03:00`;

    // Dynamic Participants Logic
    const container = document.getElementById('participants-container');
    const rows = container ? container.querySelectorAll('.p-row') : [];
    let parts = [];
    rows.forEach(row => {
        const n = row.querySelector('.p-name').value.trim();
        const w = row.querySelector('.p-wa').value.trim();
        if (n && w) parts.push(`${n}|${w}`);
    });

    const userDescription = document.getElementById('event-description').value.trim();
    let finalDescription = userDescription;
    if (parts.length > 0) {
        finalDescription += (finalDescription ? "\n" : "") + `[WA_IDS:${parts.join(', ')}]`;
    }

    // --- Status Manual ---
    let finalTitle = title;
    const currentStatus = document.getElementById('event-status').value;
    
    // Clean old status tags from title
    finalTitle = finalTitle.replace(/^\[(CONCLUÍDO|CANCELADO|ADIADO)\]\s*/i, '');
    
    // Add new tag if not 'todo'
    if (currentStatus === 'done') finalTitle = `[CONCLUÍDO] ${finalTitle}`;
    else if (currentStatus === 'canceled') finalTitle = `[CANCELADO] ${finalTitle}`;
    else if (currentStatus === 'postponed') finalTitle = `[ADIADO] ${finalTitle}`;

    // --- Tags de Grupo ---
    const eventType = document.getElementById('event-type').value;
    finalDescription += (finalDescription ? "\n" : "") + `[EVENT_TYPE:${eventType}]`;

    const groupMode = document.getElementById('event-group-mode').value;
    const groupName = document.getElementById('event-group-name') ? document.getElementById('event-group-name').value.trim() : "";
    const groupJid = document.getElementById('event-group-jid') ? document.getElementById('event-group-jid').value : "";

    if (groupMode === 'create') {
        finalDescription += (finalDescription ? "\n" : "") + `[GROUP_MODE:create]`;
        if (groupName) finalDescription += ` [GROUP_NAME:${groupName}]`;
    } else if (groupMode === 'existing' && groupJid) {
        finalDescription += (finalDescription ? "\n" : "") + `[GROUP_MODE:existing] [GROUP_JID:${groupJid}]`;
    }

    // --- Preservar COLUNA: não forçamos para novos eventos (assim fica automático) ---
    let colunaTag = null;
    if (eventId) {
        // Pesquisar tag existente na descrição original
        const rawDesc = (document.getElementById('event-raw-desc') || {}).value || '';
        const colunaMatch = rawDesc.match(/\[COLUNA:([^\]]+)\]/);
        if (colunaMatch) {
            colunaTag = colunaMatch[1];
        }
    }
    if (colunaTag) {
        finalDescription += (finalDescription ? "\n" : "") + `[COLUNA:${colunaTag}]`;
    }

    // Se marcou como concluído ou cancelado, forçamos a coluna "done" no Google
    if (currentStatus === 'done' || currentStatus === 'canceled') {
        finalDescription = finalDescription.replace(/\[COLUNA:.+?\]/g, '').trim();
        finalDescription += (finalDescription ? "\n" : "") + `[COLUNA:done]`;
    }

    // --- Persistir Checklists e Anexos ---
    const checklistData = serializeChecklists();
    if (checklistData) finalDescription += `\n${checklistData}`;

    const attachmentData = serializeAttachments();
    if (attachmentData) finalDescription += `\n${attachmentData}`;

    const payload = {
        summary: finalTitle,
        location: location,
        description: finalDescription,
        start: start,
        end: end
    };
    if (colorId) {
        payload.colorId = colorId;
    }

    const calendarSelect = document.getElementById('event-calendar');
    if (calendarSelect && calendarSelect.value) {
        payload.calendarId = calendarSelect.value;
    }

    const isEdit = eventId !== "";
    const method = isEdit ? 'PUT' : 'POST';
    const url = isEdit ? `/v1/events/${eventId}` : '/v1/events';

    document.getElementById('btn-save-event').innerText = "Salvando...";
    document.getElementById('btn-save-event').disabled = true;

    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            closeModal();
            fetchEvents(); // Refresh calendar
        } else {
            alert("Erro ao salvar evento.");
        }
    } catch (e) {
        alert("Erro de conexão.");
    } finally {
        const btn = document.getElementById('btn-save-event');
        if (btn) {
            btn.innerHTML = `<i data-lucide="save"></i> <strong>Salvar</strong>`;
            btn.disabled = false;
            if (window.lucide) lucide.createIcons();
        }
    }
}

let deleteConfirmTimeout = null;

async function deleteEvent() {
    console.log("deleteEvent called!");
    const eventId = document.getElementById('event-id').value;
    if (!eventId) {
        alert("Nenhum evento selecionado.");
        return;
    }

    const deleteBtn = document.getElementById('btn-delete-event');
    
    // Step 1: Ask for confirmation visually on the button
    if (!deleteBtn.dataset.confirm) {
        console.log("Setting confirm state...");
        deleteBtn.dataset.confirm = "true";
        deleteBtn.innerHTML = '<i data-lucide="alert-triangle" style="color: #ef4444;"></i>';
        deleteBtn.style.background = 'rgba(239, 68, 68, 0.2)';
        if (window.lucide) lucide.createIcons();
        
        // Reset after 4 seconds
        deleteConfirmTimeout = setTimeout(() => {
            console.log("Confirm state timeout.");
            deleteBtn.dataset.confirm = "";
            deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
            deleteBtn.style.background = 'rgba(255,255,255,0.03)';
            if (window.lucide) lucide.createIcons();
        }, 4000);
        return;
    }

    // Step 2: Proceed with deletion
    console.log("Executing deletion for event:", eventId);
    clearTimeout(deleteConfirmTimeout);
    deleteBtn.dataset.confirm = "";
    
    if (deleteBtn) {
        deleteBtn.innerHTML = '<i data-lucide="loader" class="fa-spin"></i>';
        deleteBtn.style.background = 'rgba(255,255,255,0.03)';
        deleteBtn.disabled = true;
        if (window.lucide) lucide.createIcons();
    }

    try {
        let calendarId = 'primary';
        if (window.cachedEvents) {
            const ev = window.cachedEvents.find(e => e.id === eventId);
            if (ev && ev.calendarId) calendarId = ev.calendarId;
        }
        
        console.log("Calling DELETE endpoint for calendar:", calendarId);
        const response = await fetch(`/v1/events/${eventId}?calendarId=${encodeURIComponent(calendarId)}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            console.log("Delete successful.");
            closeModal();
            fetchEvents(); // Refresh calendar
            alert("Evento excluído com sucesso");
        } else {
            console.error("Delete failed, response not ok.", response.status);
            alert("Erro ao excluir evento.");
        }
    } catch (e) {
        console.error("Connection error during delete:", e);
        alert("Erro de conexão.");
    } finally {
        if (deleteBtn) {
            deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
            deleteBtn.disabled = false;
            if (window.lucide) lucide.createIcons();
        }
    }
}

let savedAgendas = [];

async function listAgendas() {
    try {
        const response = await fetch(`${API_BASE}/calendar-id`);
        if (response.ok) {
            savedAgendas = await response.json();
            renderAgendaList();
        }
    } catch (error) {
        console.error('Failed to load agendas:', error);
    }
}

function renderAgendaList() {
    const list = document.getElementById('agenda-list');
    if (!list) return;
    list.innerHTML = '';

    if (savedAgendas.length === 0) {
        list.innerHTML = '<li style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.5rem; padding: 10px;">Nenhuma agenda cadastrada.</li>';
        return;
    }

    savedAgendas.forEach((agenda, index) => {
        const li = document.createElement('li');
        li.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 0.5rem;';

        const textSpan = document.createElement('span');
        textSpan.textContent = agenda;
        textSpan.style.color = 'white';
        textSpan.style.wordBreak = 'break-all';

        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '🗑️';
        removeBtn.style.cssText = 'background: rgba(255, 68, 68, 0.2); color: #ff4444; border: 1px solid rgba(255, 68, 68, 0.4); padding: 5px 10px; cursor: pointer; border-radius: 4px; font-size: 1.2rem; margin-left: 10px; transition: background 0.2s;';
        removeBtn.onmouseenter = () => removeBtn.style.background = 'rgba(255, 68, 68, 0.4)';
        removeBtn.onmouseleave = () => removeBtn.style.background = 'rgba(255, 68, 68, 0.2)';
        removeBtn.onclick = function() { removeAgenda(index, this); };

        li.appendChild(textSpan);
        li.appendChild(removeBtn);
        list.appendChild(li);
    });
}

async function removeAgenda(index, btn) {
    if (btn && !btn.dataset.confirm) {
        btn.dataset.confirm = "true";
        const oldHtml = btn.innerHTML;
        btn.innerHTML = '⚠️';
        btn.style.background = 'rgba(255, 160, 0, 0.3)';
        setTimeout(() => {
            btn.dataset.confirm = "";
            btn.innerHTML = oldHtml;
            btn.style.background = 'rgba(255, 68, 68, 0.2)';
        }, 3000);
        return;
    }
    
    if (btn) btn.innerHTML = '⏳';

    const oldAgendas = [...savedAgendas];
    savedAgendas.splice(index, 1);
    const success = await saveAgendasArray();
    if (success) {
        renderAgendaList();
        // Refresh calendars and events
        window.activeCalendars.clear();
        loadCalendars().then(() => fetchEvents());
    } else {
        savedAgendas = oldAgendas; // revert
        if (btn) {
            btn.dataset.confirm = "";
            btn.innerHTML = '🗑️';
            btn.style.background = 'rgba(255, 68, 68, 0.2)';
        }
    }
}

async function addAgenda() {
    const input = document.getElementById('new-agenda-input');
    const newAgenda = input.value.trim();

    if (!newAgenda) {
        showStatus('calendar-id-status', 'Por favor, insira o E-mail ou ID.', false);
        return;
    }

    if (savedAgendas.includes(newAgenda)) {
        showStatus('calendar-id-status', 'Esta agenda já foi adicionada.', false);
        return;
    }

    const btn = event.target;
    const oldText = btn.innerHTML;
    btn.innerHTML = 'Adicionando...';
    btn.disabled = true;

    savedAgendas.push(newAgenda);
    const success = await saveAgendasArray();

    if (success) {
        input.value = '';
        renderAgendaList();
        // Refresh calendars and events to show the newly added one
        loadCalendars().then(() => fetchEvents());
    } else {
        savedAgendas.pop(); // revert
    }

    btn.innerHTML = oldText;
    btn.disabled = false;
}

async function saveAgendasArray() {
    try {
        const response = await fetch(`${API_BASE}/calendar-id`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ emails: savedAgendas })
        });
        const data = await response.json();

        if (response.ok) {
            showStatus('calendar-id-status', data.message, true);
            return true;
        } else {
            showStatus('calendar-id-status', 'Erro: ' + data.message, false);
            return false;
        }
    } catch (error) {
        showStatus('calendar-id-status', 'Erro de conexão: ' + error.message, false);
        return false;
    }
}

function showStatus(id, message, isSuccess) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `<p style="color: ${isSuccess ? 'var(--success)' : 'var(--error)'}">${isSuccess ? '✓' : '✗'} ${message}</p>`;
    setTimeout(() => { if (el.innerHTML.includes(message)) el.innerHTML = ''; }, 5000);
}

// --- OAuth2 Logic ---
async function uploadOAuthJson() {
    const fileInput = document.getElementById('oauth-file-input');
    const file = fileInput.files[0];
    const statusText = document.getElementById('oauth-status-text');
    
    if (!file) {
        alert('Selecione um arquivo JSON primeiro.');
        return;
    }

    statusText.innerText = "⏳ Enviando e processando...";
    statusText.style.color = "var(--warning)";

    try {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/oauth/upload', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();

        if (response.ok) {
            statusText.innerText = '✅ JSON configurado! Requer Login.';
            statusText.style.color = 'var(--success)';
            document.getElementById('btn-oauth-login').style.display = 'flex';
            document.getElementById('btn-oauth-logout').style.display = 'none';
        } else {
            statusText.innerText = '❌ Erro: ' + result.message;
            statusText.style.color = '#ff4444';
        }
    } catch (e) {
        statusText.innerText = '❌ Erro de conexão.';
        statusText.style.color = '#ff4444';
    }
}

function loginOAuth() {
    window.location.href = '/api/oauth/login';
}

async function logoutOAuth() {
    if (!confirm('Deseja desconectar a integração OAuth? (Isso removerá os tokens)')) return;
    
    const statusText = document.getElementById('oauth-status-text');
    try {
        const response = await fetch('/api/oauth/logout', { method: 'POST' });
        if (response.ok) {
            statusText.innerText = '⚠ Desconectado';
            statusText.style.color = 'var(--warning)';
            document.getElementById('btn-oauth-login').style.display = 'flex';
            document.getElementById('btn-oauth-logout').style.display = 'none';
            // Refresh
            loadCalendars().then(fetchEvents);
        }
    } catch (e) {
        alert("Erro ao desconectar.");
    }
}

async function checkOAuthStatus() {
    const statusText = document.getElementById('oauth-status-text');
    const btnLogin = document.getElementById('btn-oauth-login');
    const btnLogout = document.getElementById('btn-oauth-logout');

    if (!statusText || !btnLogin) return;

    try {
        const response = await fetch('/api/oauth/status');
        const data = await response.json();
        
        if (data.configured) {
            if (data.authorized) {
                statusText.innerText = '✅ Autenticado e Pronto!';
                statusText.style.color = 'var(--success)';
                btnLogin.style.display = 'none';
                if (btnLogout) btnLogout.style.display = 'flex';
            } else {
                statusText.innerText = '⚠ Requer Login';
                statusText.style.color = 'var(--warning)';
                btnLogin.style.display = 'flex';
                if (btnLogout) btnLogout.style.display = 'none';
            }
        } else {
            statusText.innerText = '❌ Não configurado (Faça upload do JSON) ';
            statusText.style.color = '#ff4444';
            btnLogin.style.display = 'none';
            if (btnLogout) btnLogout.style.display = 'none';
        }
    } catch (e) {
        console.error('Failed to check OAuth status', e);
    }
}


function log(msg) {
    const logDiv = document.getElementById('status-log');
    if (!logDiv) return;
    const entry = document.createElement('div');
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
}

async function disconnectWhatsApp() {
    if (!confirm('Tem certeza que deseja desconectar o WhatsApp? Você precisará escanear o QR Code novamente.')) {
        return;
    }

    const btn = document.getElementById('btn-disconnect-wa');
    if (btn) {
        btn.innerText = "Desconectando...";
        btn.disabled = true;
    }

    try {
        const response = await fetch(`${API_BASE}/whatsapp/disconnect`, { method: 'POST' });
        const data = await response.json();

        if (data.status === 'success') {
            log('Sessão do WhatsApp encerrada.');
            setTimeout(() => {
                if (btn) {
                    btn.innerText = "Desconectar WhatsApp";
                    btn.disabled = false;
                }
                updateStatus();
            }, 3000);
        } else {
            alert('Erro ao desconectar: ' + data.message);
            if (btn) {
                btn.innerText = "Desconectar WhatsApp";
                btn.disabled = false;
            }
        }
    } catch (e) {
        alert('Erro de conexão ao tentar desconectar.');
        if (btn) {
            btn.innerText = "Desconectar WhatsApp";
            btn.disabled = false;
        }
    }
}

function renderMonthlyEvents(eventsData) {
    statusCheckQueue = []; // Limpa a fila antes de renderizar tudo novamente
    
    // Check Date Filter
    const filterReset = document.getElementById('calendar-filter-reset');
    if (selectedDateFilter) {
        if (filterReset) filterReset.style.display = 'block';
    } else {
        if (filterReset) filterReset.style.display = 'none';
    }

    const cols = {
        todo: document.getElementById('cards-todo'),
        doing: document.getElementById('cards-doing'),
        done: document.getElementById('cards-done'),
        canceled: document.getElementById('cards-canceled'),
        postponed: document.getElementById('cards-postponed')
    };
    if (!cols.todo) return;

    // Clear all columns
    Object.values(cols).forEach(c => c.innerHTML = '');

    const now = new Date();
    // Normalize "now" to midnight for "today" comparison
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // CHRONOLOGICAL SORT
    const sortedEvents = [...eventsData].sort((a, b) => {
        const da = parseGoogleDate(a.start);
        const db = parseGoogleDate(b.start);
        return (da || 0) - (db || 0);
    });

    sortedEvents.forEach(event => {
        const title = event.summary || 'Sem título';
        const dateObj = parseGoogleDate(event.start);
        const endObj = parseGoogleDate(event.end || event.start);
        
        // Se cancelado ou adiado, não bloqueamos por falta de data
        const isCanceledBase = (event.summary || '').toLowerCase().includes('cancelado') || (event.description || '').toLowerCase().includes('[canceled]') || (event.local_status === 'canceled');
        const isPostponedBase = (event.summary || '').toLowerCase().includes('adiado') || (event.description || '').toLowerCase().includes('[postponed]') || (event.local_status === 'postponed');

        if (!isCanceledBase && !isPostponedBase && (!dateObj || !endObj)) return;

        const isAllDay = (typeof (event.start.date || event.start) === 'string' && (event.start.date || event.start).length === 10);
        
        // Normalize for "Same Day" comparison
        const eventDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
        const eventEndDate = new Date(endObj.getFullYear(), endObj.getMonth(), endObj.getDate());

        // Determine Column
        let col = 'todo'; 
        const desc = event.description || '';
        const lowerTitle = title.toLowerCase();
        const lowerDesc = desc.toLowerCase();

        // High priority status detection (more robust regex)
        const isCanceled = /\[(CANCELAD[OA])\]/i.test(title) || /\[(CANCELED)\]/i.test(desc) || /\[COLUNA:canceled\]/i.test(desc) || (event.local_status === 'canceled');
        const isPostponed = /\[(ADIAD[OA])\]/i.test(title) || /\[(REMARCAD[OA])\]/i.test(title) || /\[(POSTPONED)\]/i.test(desc) || /\[COLUNA:postponed\]/i.test(desc) || (event.local_status === 'postponed');
        const isAlreadyDone = /\[(CONCLUÍD[OA])\]/i.test(title) || /\[(DONE)\]/i.test(desc) || /\[COLUNA:done\]/i.test(desc) || (event.local_status === 'done');

        if (isAlreadyDone) {
            col = 'done';
        }
        else if (isCanceled) {
            col = 'canceled';
        }
        else if (isPostponed) {
            col = 'postponed';
        }
        else if (desc.includes('[COLUNA:todo]')) {
            col = 'todo';
        }
        else if (desc.includes('[COLUNA:doing]')) {
            col = 'doing';
        }
        else if (event.extendedProperties?.private?.COLUNA) {
            col = event.extendedProperties.private.COLUNA;
        }
        else if (!dateObj) {
             // Fallback para eventos sem data que não estão em colunas específicas
             col = 'todo';
        }
        else {
            // Check if it's "Today"
            const startsToday = isSameDay(eventDate, today);
            
            // Adjust end date check for all-day events
            let endsToday = isSameDay(eventEndDate, today);
            let actualEnd = eventEndDate;
            if (isAllDay) {
                // If it's all day, end date might be the next day at midnight
                actualEnd = new Date(endObj.getTime() - 1);
                endsToday = isSameDay(actualEnd, today);
            }

            const occursToday = (eventDate <= today && actualEnd >= today);
            
            // Regra principal solicitada:
            // "atividades dentro do kanban devem ser movidas segundo sua data"
            // "hoje em hoje"
            // "comcluidos em comcluidos se a data tiver passado"
            // "ou crie um modal perguntando se a atividade foi concluida cancelada ou adiada"

            // Data atual com hora pra verificar eventos do próprio dia que já acabaram no relógio
            let eventRealEnd = endObj;
            if (isAllDay) eventRealEnd = new Date(endObj.getFullYear(), endObj.getMonth(), endObj.getDate(), 23, 59, 59);

            if (eventRealEnd < now) {
                col = 'done_pending_status'; // Marcador temporário para pedir revisão
            } else if (startsToday || endsToday || occursToday) {
                col = 'doing';
            } else {
                col = 'todo';
            }
        }
        
        console.log(`[Kanban v3.8] "${title}" | Start: ${dateObj.toLocaleDateString()} | Col: ${col}`);

        
        // Card Color (Label)
        const hasColor = event.colorId && googleColorMap[event.colorId];
        const labelColor = hasColor ? googleColorMap[event.colorId] : 'transparent';

        const card = document.createElement('div');
        card.className = 'kanban-card';
        card.id = `card-${event.id}`;
        card.draggable = true;
        card.ondragstart = (e) => drag(e);

        // Parse participants for badge
        let pCount = 0;
        if (desc.includes('[WA_IDS:')) {
            const match = desc.match(/\[WA_IDS:\s*(.+?)\]/);
            if (match && match[1]) pCount = match[1].split(',').length;
        }

        // Parse Checklists for Progress Badge
        let clTotal = 0;
        let clDone = 0;
        const clMatches = desc.matchAll(/\[CHECKLIST:.+?\|(.+?)\]/g);
        for (const match of clMatches) {
            const items = match[1].split('|');
            clTotal += items.length;
            clDone += items.filter(i => i.endsWith(':true')).length;
        }

        // Build date/time display
        const timeLabel = !dateObj 
            ? 'Sem data'
            : (isAllDay 
                ? 'Dia todo' 
                : dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));

        // Calendar name (short)
        const calName = (window.availableCalendars.find(c => c.id === event.calendarId)?.summary || '').split(' ')[0];

        card.innerHTML = `
            <div class="card-label" style="background: ${labelColor}; ${labelColor === 'transparent' ? 'display:none' : ''}"></div>
            <div class="card-body">
                <div class="card-title">${title}</div>
                <div class="card-badges">
                    <div class="badge">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        ${timeLabel}
                    </div>
                    ${calName ? `<div class="badge">${calName}</div>` : ''}
                    ${clTotal > 0 ? `<div class="badge ${clDone === clTotal ? 'badge-success' : ''}">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
                        ${clDone}/${clTotal}
                    </div>` : ''}
                    ${pCount > 0 ? `<div class="badge">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        ${pCount}
                    </div>` : ''}

                    ${desc.includes('[ATTACH:') ? `<div class="badge">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                        Anexo
                    </div>` : ''}
                </div>
                <div class="card-footer-avatars">
                    <div class="avatar-mini" title="${event.organizer?.email || 'Organizador'}">${(event.organizer?.email || 'A').charAt(0).toUpperCase()}</div>
                    ${pCount > 1 ? `<div class="avatar-mini">+${pCount - 1}</div>` : ''}
                </div>
            </div>
        `;

        card.onclick = (e) => {
            if (e.target.closest('.kanban-card')) {
                openEditModalFromEvent(event);
            }
        };
        
        // console.log(`[Status Debug] Evento: ${title} | isCanceled: ${isCanceled} | isPostponed: ${isPostponed} | isAlreadyDone: ${isAlreadyDone}`);

        if (col === 'done_pending_status') {
            if (isCanceled || isPostponed || isAlreadyDone) {
                // Já tem um status definido, apenas vai pro conlcuído
                cols['done'].appendChild(card);
            } else {
                // Mostrar em "todo" mas enfileirar para o modal
                cols['todo'].appendChild(card);
                queueStatusCheck(event);
            }
        } else {
            cols[col].appendChild(card);
        }
    });

    updateKanbanCounters();
    processStatusQueue();
}

let statusCheckQueue = [];
let isStatusModalOpen = false;

function queueStatusCheck(event) {
    const currentOpenId = document.getElementById('status-modal-event-id') ? document.getElementById('status-modal-event-id').value : null;
    if (isStatusModalOpen && currentOpenId === event.id) return;
    
    if (!statusCheckQueue.find(e => e.id === event.id)) {
        statusCheckQueue.push(event);
    }
}

function processStatusQueue() {
    if (isStatusModalOpen || statusCheckQueue.length === 0) return;
    
    // Only show if we're on the dashboard
    if (!document.getElementById('eventos').classList.contains('active')) return;

    const event = statusCheckQueue.shift();
    isStatusModalOpen = true;

    const modal = document.getElementById('status-modal');
    if (modal) {
        document.getElementById('status-modal-event-name').textContent = event.summary || "Sem Título";
        document.getElementById('status-modal-event-id').value = event.id;
        modal.style.display = 'flex';
    }
}

async function answerStatusModal(statusAction) {
    const eventId = document.getElementById('status-modal-event-id').value;
    if (!eventId) return;

    // Localizamo o evento real
    const event = window.cachedEvents.find(e => e.id === eventId);
    if (!event) {
        document.getElementById('status-modal').style.display = 'none';
        isStatusModalOpen = false;
        processStatusQueue();
        return;
    }

    // Disable buttons to avoid double clicks
    const modal = document.getElementById('status-modal');
    const buttons = modal.querySelectorAll('button');
    buttons.forEach(b => b.disabled = true);

    try {
        let newTitle = event.summary || "Sem Título";
        let newDesc = event.description || "";
        let newStart = event.start;
        let newEnd = event.end || event.start;
        
        // 1. Limpar tags velhas pra não duplicar
        newTitle = newTitle.replace(/^\s*\[(CANCELAD[OA]|ADIAD[OA]|CONCLUÍD[OA]|REMARCAD[OA])\]\s*/i, '');
        newDesc = newDesc.replace(/\[COLUNA:.+?\]/g, '').replace(/\[(CANCELED|POSTPONED|DONE)\]/g, '').trim();

        if (statusAction === 'done') {
            newTitle = `[CONCLUÍDO] ${newTitle}`;
            newDesc = `${newDesc}\n[COLUNA:done]\n[DONE]`.trim();
        } 
        else if (statusAction === 'canceled') {
            newTitle = `[CANCELADO] ${newTitle}`;
            newDesc = `${newDesc}\n[COLUNA:canceled]\n[CANCELED]`.trim();
        } 
        else if (statusAction === 'postponed_today') {
            newTitle = `[ADIADO] ${newTitle}`;
            newDesc = `${newDesc}\n[COLUNA:doing]\n[POSTPONED]`.trim();
            // Muda para o dia de hoje (agendado)
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const d = String(now.getDate()).padStart(2, '0');
            const todayStr = `${y}-${m}-${d}`;
            
            if (newStart.dateTime) {
                const timeStr = newStart.dateTime.substring(11, 19);
                const offset = newStart.dateTime.substring(19);
                newStart.dateTime = `${todayStr}T${timeStr}${offset}`;
                if (newEnd && newEnd.dateTime) {
                    const timeStrEnd = newEnd.dateTime.substring(11, 19);
                    const offsetEnd = newEnd.dateTime.substring(19);
                    newEnd.dateTime = `${todayStr}T${timeStrEnd}${offsetEnd}`;
                }
            } else if (newStart.date) {
                newStart.date = todayStr;
                if (newEnd && newEnd.date) {
                    const tmr = new Date(now);
                    tmr.setDate(tmr.getDate() + 1);
                    newEnd.date = `${tmr.getFullYear()}-${String(tmr.getMonth() + 1).padStart(2, '0')}-${String(tmr.getDate()).padStart(2, '0')}`;
                }
            }
        } 
        else if (statusAction === 'postponed') {
            newTitle = `[ADIADO] ${newTitle}`;
            newDesc = `${newDesc}\n[COLUNA:postponed]\n[POSTPONED]`.trim();
            
            if (confirm("Deseja definir uma nova data agora? Se cancelar, o evento ficará na coluna 'ADIADO' sem data fixa.")) {
                // Ao abrir o modal de edição, fechamos o de status e paramos o loop
                modal.style.display = 'none';
                openEditModalFromEvent(event);
                document.getElementById('event-title').value = newTitle;
                document.getElementById('event-description').value = newDesc;
                
                // Marcamos como finalizado no modal de status ANTES de retornar
                isStatusModalOpen = false;
                return;
            } else {
                newStart = { date: "2099-12-31" }; 
                newEnd = { date: "2100-01-01" };
            }
        }

        const payload = {
            ...event,
            summary: newTitle,
            description: newDesc,
            start: newStart,
            end: newEnd,
            local_status: (statusAction === 'done') ? 'done' : 
                          (statusAction === 'canceled') ? 'canceled' : 
                          (statusAction.startsWith('postponed')) ? 'postponed' : null
        };

        const res = await fetch(`/v1/events/${eventId}?calendarId=${encodeURIComponent(event.calendarId || 'primary')}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            const updatedEvent = await res.json();
            const idx = window.cachedEvents.findIndex(e => e.id === eventId);
            if (idx !== -1) window.cachedEvents[idx] = updatedEvent;
        }

    } catch (e) {
        console.error('Falha ao atualizar status via modal:', e);
    } finally {
        modal.style.display = 'none';
        isStatusModalOpen = false;
        buttons.forEach(b => b.disabled = false);
        filterAndRenderEvents(); 
    }
}

function openEditModalFromEvent(event) {
    document.getElementById('event-id').value = event.id;
    toggleModalEditMode(false);

    document.getElementById('event-title').value = event.summary || "";
    document.getElementById('event-location').value = event.location || "";

    const calendarSelect = document.getElementById('event-calendar');
    if (calendarSelect) {
        calendarSelect.value = event.calendarId || "";
        calendarSelect.disabled = true;
    }

    selectColor(event.colorId || "");

    const splitDateAndTime = (rawStr) => {
        if (!rawStr) return { date: "", time: "00:00" };
        const d = new Date(rawStr);
        if (isNaN(d.getTime())) return { date: "", time: "00:00" };
        const offset = d.getTimezoneOffset() * 60000;
        const iso = (new Date(d - offset)).toISOString();
        return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
    };

    const startRaw = event.start.dateTime || event.start.date || event.start;
    const endRaw = event.end ? (event.end.dateTime || event.end.date || event.end) : startRaw;
    const isAllDay = typeof startRaw === 'string' && startRaw.length === 10;

    if (isAllDay) {
        document.getElementById('event-start-date').value = startRaw.slice(0, 10);
        document.getElementById('event-start-time').value = "09:00";
        document.getElementById('event-end-date').value = endRaw.slice(0, 10);
        document.getElementById('event-end-time').value = "10:00";
    } else {
        const sVals = splitDateAndTime(startRaw);
        const eVals = splitDateAndTime(endRaw);
        document.getElementById('event-start-date').value = sVals.date;
        document.getElementById('event-start-time').value = sVals.time;
        document.getElementById('event-end-date').value = eVals.date;
        document.getElementById('event-end-time').value = eVals.time;
    }

    // Participants and Desc
    const container = document.getElementById('participants-container');
    if (container) container.innerHTML = "";

    let fullDesc = event.description || "";
    // ... parse calls, groups, wa_ids (reutilizando lógica anterior se necessário)
    // Para brevidade estou simplificando, mas o ideal é manter a lógica original de parse
    document.getElementById('event-id').value = event.id; // ensure ID is set

    // Re-run the existing logic for tags
    parseEventTagsIntoModal(event);

    document.getElementById('btn-delete-event').style.display = 'block';
    document.getElementById('event-modal').style.display = 'flex';
}

function updateKanbanCounters() {
    ['todo', 'doing', 'done', 'canceled', 'postponed'].forEach(col => {
        const cardsEl = document.getElementById(`cards-${col}`);
        const countEl = document.getElementById(`count-${col}`);
        if (cardsEl && countEl) {
            const count = cardsEl.children.length;
            countEl.innerText = count;
        }
    });
}

// --- Gerenciamento de Grupos ---
let cachedGroups = [];

async function loadWhatsAppGroups() {
    const select = document.getElementById('event-group-id') || document.getElementById('event-group-jid');
    if (!select) return;

    try {
        console.log('[Frontend] Chamando API de grupos...');
        select.innerHTML = '<option value="">Carregando grupos...</option>';
        const apiPath = API_BASE.includes('config') ? API_BASE.replace('/config', '') : '/v1';

        const response = await fetch(`${apiPath}/whatsapp/groups`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro ${response.status}: ${errorText || response.statusText}`);
        }

        cachedGroups = await response.json();
        console.log(`[Frontend] ${cachedGroups.length} grupos carregados.`);
        renderGroupOptions(cachedGroups);
    } catch (error) {
        select.innerHTML = `<option value="">⚠️ Erro: ${error.message}</option>`;
        console.error('[Frontend] Falha ao carregar grupos:', error);
    }
}

function renderGroupOptions(groups) {
    const select = document.getElementById('event-group-id') || document.getElementById('event-group-jid');
    if (!select) return;

    // Remember currently selected JID before rebuilding options
    const currentJid = select.value;

    select.innerHTML = '<option value="">Selecione um grupo...</option>' +
        groups.map(g => `<option value="${g.id}">${g.subject}</option>`).join('');

    // Re-select the previously saved JID if it exists in the loaded groups
    if (currentJid) {
        const match = groups.find(g => g.id === currentJid);
        if (match) {
            select.value = currentJid;
        } else {
            // JID not found in loaded groups — add a labeled placeholder
            const opt = document.createElement('option');
            opt.value = currentJid;
            opt.text = `Grupo salvo (ID: ${currentJid.split('@')[0]})`;
            select.appendChild(opt);
            select.value = currentJid;
        }
    }
}

function filterGroups() {
    const query = document.getElementById('group-search').value.toLowerCase();
    const filtered = cachedGroups.filter(g => g.subject.toLowerCase().includes(query));
    renderGroupOptions(filtered);
}

function toggleGroupFields() {
    const mainSelect = document.getElementById('event-group-mode');
    if (!mainSelect) return;

    const mode = mainSelect.value;

    // Update Sidebar Toggle Buttons
    document.querySelectorAll('.sidebar-toggle-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    const activeBtn = document.getElementById(`mode-btn-${mode}`);
    if (activeBtn) activeBtn.classList.add('active');

    const createFields = document.getElementById('group-create-fields');
    const existingFields = document.getElementById('group-existing-fields');

    if (createFields) createFields.style.display = (mode === 'create') ? 'block' : 'none';
    if (existingFields) existingFields.style.display = (mode === 'existing') ? 'block' : 'none';

    if (mode === 'existing' && cachedGroups.length === 0) {
        loadWhatsAppGroups();
    }
}

function syncGroupMode(val) {
    const mainSelect = document.getElementById('event-group-mode');
    if (mainSelect) {
        mainSelect.value = val;
        toggleGroupFields();
    }
}

function toggleAttachmentInput() {
    const container = document.getElementById('attachment-input-container');
    if (!container) return;

    const isHidden = container.style.display === 'none';
    container.style.display = isHidden ? 'flex' : 'none';

    if (isHidden) {
        document.getElementById('new-attachment-url').focus();
    }
}



function addParticipantRow(name = "", wa = "") {
    const container = document.getElementById('participants-container');
    if (!container) return;

    const rowId = `prow-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const row = document.createElement('div');
    row.className = 'p-row';
    row.id = rowId;

    row.innerHTML = `
        <div class="p-name-wrap" style="position:relative;flex:1;">
            <input type="text" placeholder="Nome ou número" class="p-name meta-lite-input" value="${name}"
                autocomplete="off"
                oninput="filterContactDropdown(this)"
                onblur="setTimeout(()=>closeContactDropdown(this),200)"
                onfocus="filterContactDropdown(this)">
            <div class="contact-dropdown" style="display:none;"></div>
        </div>
        <input type="text" placeholder="WhatsApp (DDD+Número)" class="p-wa meta-lite-input" value="${wa}" style="flex:1;">
        <button type="button" onclick="pinAsFavorite(this)" class="btn-pin-fav" title="Fixar nos Favoritos"><i data-lucide="star" style="width:16px;height:16px;"></i></button>
        <button type="button" onclick="removeParticipantRow(this)" class="btn-remove-p" title="Remover"><i data-lucide="trash-2" style="width:16px;height:16px;"></i></button>
    `;
    container.appendChild(row);

    if (window.lucide) lucide.createIcons();
    if (!name) row.querySelector('.p-name').focus();
}

function filterContactDropdown(input) {
    const query = input.value.toLowerCase().trim();
    const dropdown = input.parentElement.querySelector('.contact-dropdown');
    if (!dropdown) return;

    if (!query || allContacts.length === 0) {
        dropdown.style.display = 'none';
        return;
    }

    const matches = allContacts.filter(c => {
        const cname = (c.name || c.notify || '').toLowerCase();
        const number = c.id.split('@')[0];
        return cname.includes(query) || number.includes(query);
    }).slice(0, 12);

    if (matches.length === 0) {
        dropdown.style.display = 'none';
        return;
    }

    dropdown.innerHTML = matches.map(c => {
        const cname = c.name || c.notify || 'Sem Nome';
        const number = c.id.split('@')[0];
        return `<div class="contact-dropdown-item" 
            onmousedown="selectContactFromDropdown(event, '${cname.replace(/'/g, "\\'")}', '${number}')"
            onmouseenter="this.style.background='#334155'"
            onmouseleave="this.style.background=''">
            <div class="contact-dd-avatar">${(cname[0] || '?').toUpperCase()}</div>
            <div class="contact-dd-info">
                <div class="contact-dd-name">${cname}</div>
                <div class="contact-dd-num">+${number}</div>
            </div>
        </div>`;
    }).join('');

    // ---- Position: fixed so it escapes any overflow:hidden container ----
    const rect = input.getBoundingClientRect();
    const dropHeight = Math.min(200, matches.length * 36); // Approx height of items
    const spaceBelow = window.innerHeight - rect.bottom;
    
    // Default open downwards setting
    let topPos = rect.bottom + 2;
    
    // Open upwards if near bottom of screen and there is more room above
    if (spaceBelow < dropHeight && rect.top > dropHeight) {
        topPos = rect.top - dropHeight - 2;
    }

    Object.assign(dropdown.style, {
        display:      'block',
        position:     'fixed',
        top:          topPos + 'px',
        left:         rect.left + 'px',
        width:        rect.width + 'px',
        maxHeight:    '200px',
        overflowY:    'auto',
        background:   '#162032',
        border:       '1px solid rgba(255,255,255,0.08)',
        borderRadius: '8px',
        boxShadow:    '0 6px 20px rgba(0,0,0,0.45)',
        zIndex:       '99999'
    });
}

function selectContactFromDropdown(event, name, number) {
    event.preventDefault();
    const item = event.currentTarget;
    const wrap = item.closest('.p-name-wrap');
    const row = item.closest('.p-row');
    const nameInput = wrap.querySelector('.p-name');
    const waInput = row.querySelector('.p-wa');
    const dropdown = wrap.querySelector('.contact-dropdown');

    nameInput.value = name;
    // Only fill the number if the field is currently empty or unchanged
    if (!waInput.value || waInput.dataset.autoFilled === 'true') {
        waInput.value = number;
        waInput.dataset.autoFilled = 'true';
    }
    dropdown.style.display = 'none';
}

function closeContactDropdown(input) {
    const dropdown = input.parentElement.querySelector('.contact-dropdown');
    if (dropdown) dropdown.style.display = 'none';
}

// Legacy compat
function handleContactInput(input) {
    filterContactDropdown(input);
}


// --- Quick Favorites Logic ---
function renderQuickContactsUI() {
    for (let i = 0; i < 6; i++) {
        const fav = quickFavorites[i];
        const btn = document.getElementById(`fav-slot-${i}`);
        if (!btn) continue;

        if (fav) {
            let imgHtml = '';
            let largePhotoUrl = fav.photo || 'https://via.placeholder.com/60?text=NA';

            if (fav.photo) {
                imgHtml = `<img src="${fav.photo}" alt="${fav.name}">`;
            } else {
                const initials = fav.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                imgHtml = `<div style="width:100%; height:100%; border-radius:50%; display:flex; align-items:center; justify-content:center; background:#334155; overflow:hidden;"><span>${initials || '??'}</span></div>`;
            }

            btn.innerHTML = `
                ${imgHtml}
                <div class="contact-hover-card">
                    <img src="${largePhotoUrl}" alt="${fav.name}">
                    <span>${fav.name}</span>
                    <button onclick="removeFavorite(${i}, event)" style="margin-top:8px; background:rgba(239,68,68,0.2); color:#ef4444; border:1px solid rgba(239,68,68,0.3); padding:4px; border-radius:4px; cursor:pointer; font-size:0.7rem; width:100%; transition:all 0.2s;">
                        Remover
                    </button>
                </div>
            `;
            btn.classList.add('filled');
            btn.removeAttribute('data-tooltip'); // Remove tooltip to rely on custom hover card
        } else {
            btn.innerHTML = '<i data-lucide="star"></i>';
            btn.classList.remove('filled');
            btn.setAttribute('data-tooltip', `Vazio - Clique p/ salvar um contato aqui`);
        }
    }
    if (window.lucide) lucide.createIcons();
}

async function saveFavoriteFromData(idx, name, wa) {
    let photo = null;
    try {
        const res = await fetch(`/v1/whatsapp/photo/${wa}`);
        if (res.ok) {
            const data = await res.json();
            if (data && data.url) photo = data.url;
        }
    } catch (e) {
        console.error('Falha ao obter foto:', e);
    }

    quickFavorites[idx] = { name, wa, photo };
    localStorage.setItem('wa_quick_favorites', JSON.stringify(quickFavorites));
    renderQuickContactsUI();
    showToast(`Salvo no Favorito ${idx + 1}`, 'success');
}

async function pinAsFavorite(btn) {
    const row = btn.closest('.p-row');
    const name = row.querySelector('.p-name').value;
    const wa = row.querySelector('.p-wa').value;

    if (!name || !wa) {
        showToast('Preencha nome e número para favoritar', 'warning');
        return;
    }

    // Find first empty slot
    const emptyIdx = quickFavorites.findIndex(f => !f);
    
    if (emptyIdx !== -1) {
        await saveFavoriteFromData(emptyIdx, name, wa);
    } else {
        showToast('Favoritos cheios. Remova um passando o mouse sobre ele e clicando no "Remover".', 'error');
    }
}

function removeFavorite(idx, event) {
    event.stopPropagation();
    if(confirm('Remover este contato dos favoritos?')) {
        quickFavorites[idx] = null;
        localStorage.setItem('wa_quick_favorites', JSON.stringify(quickFavorites));
        renderQuickContactsUI();
        showToast('Favorito removido.', 'info');
    }
}

function addFromFavorite(idx) {
    const fav = quickFavorites[idx];
    if (!fav) {
        // If slot is empty, check if there's an active participant row filled out and ask to save it
        const container = document.getElementById('participants-container');
        const rows = container ? Array.from(container.querySelectorAll('.p-row')) : [];
        const filledRow = rows.find(r => r.querySelector('.p-name').value.trim() && r.querySelector('.p-wa').value.trim());

        if (filledRow) {
            const name = filledRow.querySelector('.p-name').value.trim();
            const wa = filledRow.querySelector('.p-wa').value.trim();
            if (confirm(`Deseja salvar "${name}" neste espaço de Favorito?`)) {
                saveFavoriteFromData(idx, name, wa);
                return;
            }
        }
        
        showToast(`Slot ${idx + 1} está vazio. Adicione um contato e use a estrela para salvar.`, 'info');
        return;
    }

    // If the only existing row is empty, fill it instead of adding a duplicate empty row
    const container = document.getElementById('participants-container');
    const rows = container ? container.querySelectorAll('.p-row') : [];
    if (rows.length === 1) {
        const nameIn = rows[0].querySelector('.p-name');
        const waIn = rows[0].querySelector('.p-wa');
        if (nameIn && !nameIn.value.trim() && waIn && !waIn.value.trim()) {
            nameIn.value = fav.name || '';
            waIn.value = fav.wa || '';
            return;
        }
    }

    // Otherwise always add a brand new row
    addParticipantRow(fav.name, fav.wa);
}

function handleContactInput(input) {
    const value = input.value;
    // Find contact by Name or by the "Name (Number)" format we'll use in datalist
    const contact = allContacts.find(c => {
        const name = c.name || c.notify || "Sem Nome";
        const number = c.id.split('@')[0];
        return name === value || `${name} (${number})` === value;
    });

    if (contact) {
        const row = input.closest('.p-row');
        const waInput = row.querySelector('.p-wa');
        const number = contact.id.split('@')[0];
        waInput.value = number;
        // Optional: Update name input to the clean name if it was selected from format
        const name = contact.name || contact.notify || "Sem Nome";
        input.value = name;
    }
}

let loadingContacts = false;
async function loadContacts(isManual = true, retryCount = 0) {
    if (loadingContacts) return;
    loadingContacts = true;

    const btn = document.getElementById('btn-sync-contacts');
    const badge = document.getElementById('contact-count-badge');
    const oldBtnContent = btn ? btn.innerHTML : '';

    if (btn) {
        btn.innerHTML = '⏳ Buscando contatos...';
        btn.disabled = true;
    }

    try {
        console.log('[Frontend] Carregando contatos...');
        const response = await fetch('/v1/whatsapp/contacts');
        if (!response.ok) throw new Error("Servidor Offline ou Erro no WhatsApp");

        // Capture participant numbers BEFORE updating allContacts 
        // so we NEVER lose numbers manually typed in the form
        const protectedNumbers = new Set();
        document.querySelectorAll('.p-wa').forEach(inp => {
            const v = inp.value.trim();
            if (v) protectedNumbers.add(v);
        });

        allContacts = await response.json();

        // Update datalist (for legacy compat)
        const datalist = document.getElementById('contacts-list');
        if (datalist) {
            datalist.innerHTML = "";
            allContacts.forEach(c => {
                const name = c.name || c.notify || "Sem Nome";
                const number = c.id.split('@')[0];
                const option = document.createElement('option');
                option.value = `${name} (${number})`;
                datalist.appendChild(option);
            });
        }

        // Restore protected numbers (sync should NEVER overwrite them)
        document.querySelectorAll('.p-wa').forEach(inp => {
            if (protectedNumbers.has(inp.dataset.original || inp.value)) return;
            // leave as-is — no overwrite
        });

        if (allContacts.length === 0 && retryCount < 4) {
            // WhatsApp ainda sincronizando — tenta de novo em instantes
            const waitSec = 5;
            loadingContacts = false;
            if (btn) {
                let countdown = waitSec;
                btn.innerHTML = `⌛ Aguardando sincronização... (${countdown}s)`;
                const timer = setInterval(() => {
                    countdown--;
                    if (btn) btn.innerHTML = `⌛ Aguardando sincronização... (${countdown}s)`;
                }, 1000);
                setTimeout(() => {
                    clearInterval(timer);
                    btn.disabled = false;
                    loadContacts(isManual, retryCount + 1);
                }, waitSec * 1000);
            }
            return;
        }

        if (isManual) showToast(`✅ ${allContacts.length} contatos sincronizados!`, 'success');
        console.log(`[Frontend] ${allContacts.length} contatos carregados.`);

        // Update contact count badge on the sync button
        if (badge) {
            badge.textContent = allContacts.length + ' contatos';
            badge.style.display = 'inline';
        }
    } catch (e) {
        console.error('Erro ao carregar contatos:', e);
        if (isManual) showToast("Falha ao sincronizar: " + e.message, 'error');
    } finally {
        loadingContacts = false;
        if (btn) {
            btn.innerHTML = oldBtnContent || `🔄 Atualizar Contatos <span id="contact-count-badge" style="background: rgba(0,0,0,0.3); padding: 2px 8px; border-radius: 10px; font-size: 0.8rem; margin-left: 5px;">${allContacts.length > 0 ? allContacts.length + ' contatos' : ''}</span>`;
            btn.disabled = false;
        }
    }
}

function removeParticipantRow(btn) {
    const row = btn.closest('.p-row');
    const container = document.getElementById('participants-container');
    if (container && container.querySelectorAll('.p-row').length > 1) {
        row.remove();
    } else {
        // Clear inputs if it's the last row
        const nameIn = row.querySelector('.p-name');
        const waIn = row.querySelector('.p-wa');
        if (nameIn) nameIn.value = "";
        if (waIn) { waIn.value = ""; delete waIn.dataset.autoFilled; }
    }
}

async function rebootSystem() {
    if (!confirm('Deseja realmente REINICIAR o sistema inteiro? Ele ficará indisponível por alguns segundos.')) return;
    try {
        await fetch(`${API_BASE}/reboot`, { method: 'POST' });
        alert('Comando de reinicialização enviado. Recarregue a página em alguns segundos.');
    } catch (e) {
        alert('Erro ao enviar comando de reboot.');
    }
}

async function fetchLogs() {
    const container = document.getElementById('system-logs-container');
    try {
        const res = await fetch('/v1/system/logs');
        const data = await res.json();
        if (data.logs) {
            container.textContent = data.logs;
            // Scroll to bottom
            container.scrollTop = container.scrollHeight;
        } else {
            container.textContent = "Nenhum log disponível.";
        }
    } catch (e) {
        container.textContent = "Erro ao carregar logs.";
    }
}

// DRAG AND DROP KANBAN LOGIC
function allowDrop(ev) {
    ev.preventDefault();
}

function drag(ev) {
    ev.dataTransfer.setData("text", ev.target.id);
    ev.target.classList.add('dragging');
}

async function drop(ev, colName) {
    ev.preventDefault();
    const data = ev.dataTransfer.getData("text");
    const card = document.getElementById(data);
    if (!card) return;

    card.classList.remove('dragging');
    const targetCol = document.getElementById(`cards-${colName}`);
    targetCol.appendChild(card);
    updateKanbanCounters();

    // Persist to Google Calendar
    const eventId = card.id.replace('card-', '');
    try {
        // Fetch original event from cache
        const event = window.cachedEvents.find(e => e.id === eventId);
        if (!event) return;

        let cleanDesc = (event.description || '').replace(/\[COLUNA:.+?\]/g, '').trim();
        const newDesc = `${cleanDesc}\n[COLUNA:${colName}]`.trim();
        
        // Se arrastado para colunas de status final, marcamos explicitamente
        let statusToSet = null;
        if (colName === 'done') statusToSet = 'done';
        if (colName === 'canceled') statusToSet = 'canceled';
        if (colName === 'postponed') statusToSet = 'postponed';

        await fetch(`/v1/events/${eventId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...event,
                description: newDesc,
                local_status: statusToSet || event.local_status,
                start: event.start.dateTime || event.start.date || event.start,
                end: event.end ? (event.end.dateTime || event.end.date || event.end) : event.start
            })
        });
        console.log(`Event ${eventId} moved to ${colName} (Status: ${statusToSet})`);
    } catch (e) {
        console.error('Failed to persist column move:', e);
    }
}

function parseEventTagsIntoModal(event) {
    let fullDesc = event.description || "";
    const groupModeSelect = document.getElementById('event-group-mode');
    if (groupModeSelect) groupModeSelect.value = 'individual';
    if (document.getElementById('event-group-name')) document.getElementById('event-group-name').value = '';

    const jidSelect = document.getElementById('event-group-jid');
    if (jidSelect) jidSelect.value = '';


    // Parse Status from Summary
    const statusSelect = document.getElementById('event-status');
    const title = (event.summary || "").toUpperCase();
    if (statusSelect) {
        if (title.includes('[CONCLUÍDO]')) statusSelect.value = 'done';
        else if (title.includes('[CANCELADO]')) statusSelect.value = 'canceled';
        else if (title.includes('[ADIADO]')) statusSelect.value = 'postponed';
        else statusSelect.value = 'todo';
    }

    // Parse Group Tags & Column
    const tags = ['GROUP_MODE', 'GROUP_NAME', 'GROUP_JID', 'COLUNA'];
    tags.forEach(tag => {
        const regex = new RegExp(`\\[${tag}:\\s*(.+?)\\]`, 'i');
        const match = fullDesc.match(regex);
        if (match) {
            const val = match[1].trim();
            if (tag === 'GROUP_MODE' && groupModeSelect) groupModeSelect.value = val;
            if (tag === 'GROUP_NAME' && document.getElementById('event-group-name')) document.getElementById('event-group-name').value = val;
            if (tag === 'GROUP_JID' && jidSelect) {
                // Try to find the group name from already-loaded groups
                const existingGroup = cachedGroups.find(g => g.id === val);
                const groupLabel = existingGroup
                    ? `${existingGroup.subject} ✓`
                    : `Grupo vinculado (${val.split('@')[0]})`;

                if (!Array.from(jidSelect.options).some(o => o.value === val)) {
                    const opt = document.createElement('option');
                    opt.value = val;
                    opt.text = groupLabel;
                    jidSelect.appendChild(opt);
                } else {
                    // Update text of existing option if we now have the real name
                    const existOpt = Array.from(jidSelect.options).find(o => o.value === val);
                    if (existOpt && existingGroup) existOpt.text = groupLabel;
                }
                jidSelect.value = val;

                // If groups not yet loaded, load them (will auto-select via renderGroupOptions)
                if (cachedGroups.length === 0) {
                    loadWhatsAppGroups();
                }
            }
            fullDesc = fullDesc.replace(regex, '');
        }
    });

    // Parse WA_IDS
    if (fullDesc.includes('[WA_IDS:')) {
        const parts = fullDesc.split('[WA_IDS:');
        const match = fullDesc.match(/\[WA_IDS:\s*(.+?)\]/);
        if (match && match[1]) {
            const participants = match[1].split(',');
            participants.forEach(p => {
                const innerParts = p.split('|');
                if (innerParts.length >= 2) {
                    addParticipantRow(innerParts[0].trim(), innerParts[1].trim());
                }
            });
        }
        fullDesc = parts[0].trim();
    }

    document.getElementById('event-description').value = fullDesc.trim();

    // Parse Checklists & Attachments
    renderChecklistsAndAttachments(event);

    toggleGroupFields();
}

/* --- CHECKLIST LOGIC --- */
function addChecklistUI(title = "Checklist", items = []) {
    const wrapper = document.getElementById('checklists-wrapper');
    const id = 'checklist-' + Date.now() + Math.random().toString(36).substr(2, 5);

    const container = document.createElement('div');
    container.className = 'checklist-container';
    container.id = id;

    container.innerHTML = `
        <div class="checklist-header">
            <div class="checklist-title"><span>✅</span> ${title}</div>
        <div class="checklist-progress-bar">
            <div class="checklist-progress-fill"></div>
        </div>
        <div class="checklist-items-list"></div>
        <button class="btn-add-ghost" style="margin-top: 10px; font-size: 0.75rem;" onclick="addChecklistItemUI('${id}')">+ Adicionar Item</button>
    `;

    wrapper.appendChild(container);

    items.forEach(item => {
        addChecklistItemUI(id, item.text, item.checked);
    });

    if (items.length === 0) {
        addChecklistItemUI(id);
    }
}

function addChecklistItemUI(checklistId, text = "", checked = false) {
    const container = document.getElementById(checklistId);
    if (!container) return;
    const list = container.querySelector('.checklist-items-list');

    const item = document.createElement('div');
    item.className = 'checklist-item' + (checked ? ' checked-item' : '');

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = checked;
    chk.addEventListener('change', () => {
        item.classList.toggle('checked-item', chk.checked);
        updateChecklistProgress(checklistId);
    });

    const txt = document.createElement('input');
    txt.type = 'text';
    txt.placeholder = 'Digite uma tarefa...';
    txt.value = text;
    txt.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addChecklistItemUI(checklistId);
            // Focus last added item
            const items = list.querySelectorAll('.checklist-item input[type="text"]');
            if (items.length > 0) items[items.length - 1].focus();
        }
    });
    txt.addEventListener('blur', () => updateChecklistProgress(checklistId));

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-p';
    removeBtn.innerHTML = '×';
    removeBtn.type = 'button';
    removeBtn.title = 'Remover';
    removeBtn.onclick = () => { item.remove(); updateChecklistProgress(checklistId); };

    item.appendChild(chk);
    item.appendChild(txt);
    item.appendChild(removeBtn);
    list.appendChild(item);
    updateChecklistProgress(checklistId);
}

function updateChecklistProgress(checklistId) {
    const container = document.getElementById(checklistId);
    if (!container) return;
    const items = container.querySelectorAll('.checklist-item');
    const checked = container.querySelectorAll('.checklist-item input[type="checkbox"]:checked');
    const fill = container.querySelector('.checklist-progress-fill');

    const percent = items.length > 0 ? (checked.length / items.length) * 100 : 0;
    fill.style.width = percent + '%';
}

function serializeChecklists() {
    const containers = document.querySelectorAll('.checklist-container');
    let tags = [];
    containers.forEach(c => {
        // Get the title text only from text nodes (ignoring emoji span)
        const titleEl = c.querySelector('.checklist-title');
        let title = '';
        titleEl.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) title += node.textContent;
        });
        title = title.trim() || titleEl.innerText.replace('✅', '').trim();

        const items = Array.from(c.querySelectorAll('.checklist-item')).map(item => {
            const txt = item.querySelector('input[type="text"]').value.trim();
            const chk = item.querySelector('input[type="checkbox"]').checked;
            return txt ? `${txt}:${chk}` : null;
        }).filter(Boolean);

        if (items.length > 0) {
            tags.push(`[CHECKLIST:${title}|${items.join('|')}]`);
        }
    });
    return tags.join('\n');
}

/* --- ATTACHMENT LOGIC --- */

// Icon map by file extension
function getAttachmentIcon(name, mimetype) {
    const ext = (name || '').split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext) || (mimetype || '').startsWith('image/')) return '🖼️';
    if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext) || (mimetype || '').startsWith('video/')) return '🎥';
    if (['mp3', 'ogg', 'wav', 'm4a', 'aac', 'flac'].includes(ext) || (mimetype || '').startsWith('audio/')) return '🎵';
    if (['pdf'].includes(ext)) return '📄';
    if (['doc', 'docx'].includes(ext)) return '📝';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
    if (['xml', 'json', 'txt', 'log'].includes(ext)) return '📋';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '🗜️';
    return '📎';
}

async function uploadAndAddAttachment() {
    const fileInput = document.getElementById('attachment-file-input');
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Show uploading indicator
        const list = document.getElementById('attachments-list');
        const placeholder = document.createElement('div');
        placeholder.className = 'attachment-chip uploading';
        placeholder.innerHTML = `<span class="attachment-icon">⏳</span> <span>Enviando ${file.name}...</span>`;
        list.appendChild(placeholder);

        try {
            const formData = new FormData();
            formData.append('file', file);
            const resp = await fetch('/v1/upload', { method: 'POST', body: formData });
            if (!resp.ok) throw new Error(await resp.text());
            const result = await resp.json();
            placeholder.remove();
            addAttachmentChip(result.url, result.name || file.name, result.mimetype);
        } catch (err) {
            placeholder.remove();
            showToast('Erro ao enviar arquivo: ' + err.message, 'error');
        }
        fileInput.value = ''; // reset so same file can be re-added
    };
    fileInput.click();
}

function addAttachment(urlStr = "") {
    const url = urlStr || document.getElementById('new-attachment-url').value.trim();
    if (!url) return;
    addAttachmentChip(url, url.split('/').pop() || url, null);
    if (!urlStr) document.getElementById('new-attachment-url').value = "";
}

function addAttachmentChip(url, name, mimetype) {
    const list = document.getElementById('attachments-list');
    const chip = document.createElement('div');
    chip.className = 'attachment-chip';
    chip.dataset.url = url;

    const icon = getAttachmentIcon(name, mimetype);
    const shortName = name.length > 30 ? name.substring(0, 28) + '…' : name;

    chip.innerHTML = `
        <span class="attachment-icon">${icon}</span>
        <a href="${url}" target="_blank" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:inherit;text-decoration:none;" title="${name}">${shortName}</a>
        <button type="button" onclick="removeAttachmentChip(this)" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:16px;padding:0 4px;" title="Remover">×</button>
    `;
    list.appendChild(chip);
}

function removeAttachmentChip(btn) {
    const chip = btn.closest('.attachment-chip');
    // If it was an uploaded file, optionally delete from server
    const url = chip?.dataset?.url;
    if (url && url.startsWith('/uploads/')) {
        const filename = url.split('/').pop();
        fetch(`/v1/upload/${encodeURIComponent(filename)}`, { method: 'DELETE' }).catch(() => { });
    }
    chip?.remove();
}


function serializeAttachments() {
    const chips = document.querySelectorAll('.attachment-chip');
    let tags = [];
    chips.forEach(c => {
        tags.push(`[ATTACH:${c.dataset.url}]`);
    });
    return tags.join('\n');
}

function renderChecklistsAndAttachments(event) {
    const wrapper = document.getElementById('checklists-wrapper');
    const attachList = document.getElementById('attachments-list');
    if (wrapper) wrapper.innerHTML = "";
    if (attachList) attachList.innerHTML = "";

    const desc = event.description || "";

    // Parse Checklists — format: [CHECKLIST:título|item1:checked|item2:checked...]
    // Use greedy match inside bracket to capture ALL items
    const clRegex = /\[CHECKLIST:([^\]]+)\]/g;
    let clMatch;
    while ((clMatch = clRegex.exec(desc)) !== null) {
        const parts = clMatch[1].split('|');
        const title = parts[0] || 'Checklist';
        const itemsRaw = parts.slice(1);
        const items = itemsRaw
            .map(ir => {
                const colonIdx = ir.lastIndexOf(':');
                if (colonIdx === -1) return { text: ir.trim(), checked: false };
                const text = ir.substring(0, colonIdx).trim();
                const checked = ir.substring(colonIdx + 1).trim() === 'true';
                return { text, checked };
            })
            .filter(i => i.text);
        if (title || items.length > 0) addChecklistUI(title, items);
    }

    // Parse Attachments
    const atRegex = /\[ATTACH:([^\]]+)\]/g;
    let atMatch;
    while ((atMatch = atRegex.exec(desc)) !== null) {
        addAttachment(atMatch[1]);
    }
}

// --- Attachment Logic ---

// Initial calls
loadCalendars().then(() => {
    initColorPicker();
    listAgendas();
    updateStatus();
    checkOAuthStatus();
    loadContacts(false);
    fetchEvents();
    initSidebarCalendar();
    setInterval(updateStatus, 10000); // 10s is plenty
    setInterval(fetchEvents, 30000); // Cards refresh every 30s
    renderQuickContactsUI();
});

function toggleSidebarPopover(popId) {
    let pop = null;
    let isHidden = true;

    if (popId) {
        pop = document.getElementById(popId);
        if (pop) isHidden = (pop.style.display === 'none' || pop.style.display === '');
    }

    // Close all popovers
    document.querySelectorAll('.floating-popover').forEach(p => p.style.display = 'none');

    // Open target
    if (pop && isHidden) {
        pop.style.display = 'flex';
    }
}

// Close when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.popover-group')) {
        document.querySelectorAll('.floating-popover').forEach(p => p.style.display = 'none');
    }
});

function applyTemplateByType() {
    const type = document.getElementById('event-type').value;
    const titleEl = document.getElementById('event-title');
    const descEl = document.getElementById('event-description');

    // Simple Template Logic
    if (type === 'reuniao') {
        if (!titleEl.value || titleEl.value === "Nova Atividade") titleEl.value = "Nova Reunião";
        if (!descEl.value || descEl.value.includes("Detalhamento da Atividade")) {
            descEl.value = "Pauta da Reunião:\n1. \n2. \n3. ";
        }
        selectColor("1"); // Lavender for Meetings
    } else if (type === 'atividade') {
        if (!titleEl.value || titleEl.value === "Nova Reunião") titleEl.value = "Nova Atividade";
        if (!descEl.value || descEl.value.includes("Pauta da Reunião")) {
            descEl.value = "Detalhamento da Atividade:\n- \n- ";
        }
        selectColor("10"); // Basil for Activities
    }
}
// --- Nova Agenda Modal ---

function openCreateCalendarModal() {
    document.getElementById('calendar-summary').value = '';
    document.getElementById('calendar-description').value = '';
    document.getElementById('calendar-modal').style.display = 'flex';
}

function closeCreateCalendarModal() {
    document.getElementById('calendar-modal').style.display = 'none';
}

async function saveCalendar() {
    const summary = document.getElementById('calendar-summary').value;
    const description = document.getElementById('calendar-description').value;

    if (!summary.trim()) {
        alert('Por favor, informe um nome para a agenda.');
        return;
    }

    try {
        const res = await fetch('/v1/events/calendars', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ summary, description })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        alert('Agenda criada com sucesso!');
        closeCreateCalendarModal();
        
        // Recarregar os filtros de agendas e a página de eventos
        await loadCalendars();
        listAgendas(); // Se estiver na tela de minhs agendas
    } catch (e) {
        alert('Erro ao criar agenda: ' + e.message);
    }
}

function initSidebarCalendar() {
    const calendarEl = document.getElementById('sidebar-calendar');
    if (!calendarEl || !window.FullCalendar) return;

    sidebarCalendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'pt-br',
        headerToolbar: false, // Hide header to match minimalist look
        dayHeaderFormat: { weekday: 'narrow' }, // D, S, T, Q, Q, S, S
        height: 'auto',
        selectable: true,
        unselectAuto: false,
        dateClick: function(info) {
            if (selectedDateFilter === info.dateStr) {
                clearDateFilter();
            } else {
                selectedDateFilter = info.dateStr;
                
                // Styling handled by CSS classes for selected date
                document.querySelectorAll('#sidebar-calendar .fc-daygrid-day').forEach(el => {
                    el.classList.remove('selected-day');
                });
                info.dayEl.classList.add('selected-day');
                
                filterAndRenderEvents();
            }
        },
        // Highlight selected date on first render if exists
        dayCellDidMount: function(arg) {
            if (selectedDateFilter && arg.dateStr === selectedDateFilter) {
                arg.el.classList.add('selected-day');
            }
        }
    });

    sidebarCalendar.render();
    updateCalendarHeader();
}

function updateCalendarHeader() {
    if (!sidebarCalendar) return;
    const date = sidebarCalendar.getDate();
    const monthName = date.toLocaleString('pt-br', { month: 'long' });
    const year = date.getFullYear();
    const label = document.getElementById('cal-month-name');
    if (label) label.textContent = `${monthName} de ${year}`;
}

function prevMonth() {
    if (sidebarCalendar) {
        sidebarCalendar.prev();
        updateCalendarHeader();
    }
}

function nextMonth() {
    if (sidebarCalendar) {
        sidebarCalendar.next();
        updateCalendarHeader();
    }
}

function goToday() {
    if (sidebarCalendar) {
        sidebarCalendar.today();
        updateCalendarHeader();
    }
}

function clearDateFilter() {
    selectedDateFilter = null;
    const cells = document.querySelectorAll('#sidebar-calendar .fc-daygrid-day');
    cells.forEach(c => {
        c.style.background = '';
        c.classList.remove('selected-day');
    });
    filterAndRenderEvents();
}

// --- Spell Checker Logic ---

class SpellChecker {
    constructor(dictionary = []) {
        this.dict = new Set(dictionary);
        this.suggestionMenu = null;
        this.ignoredWords = new Set();
        this.activeInput = null;
        this.activeRange = null;
        this.initSuggestionsMenu();
    }

    initSuggestionsMenu() {
        this.suggestionMenu = document.createElement('div');
        this.suggestionMenu.className = 'spell-suggestions-menu';
        document.body.appendChild(this.suggestionMenu);
        
        document.addEventListener('click', (e) => {
            if (!this.suggestionMenu.contains(e.target) && !e.target.classList.contains('spell-error')) {
                this.suggestionMenu.style.display = 'none';
            }
        });
    }

    checkWord(word) {
        const clean = word.toLowerCase().replace(/[.,!?;:()]/g, '');
        if (clean.length <= 1) return true;
        if (this.dict.has(clean) || this.ignoredWords.has(clean) || !isNaN(clean)) return true;
        return false;
    }

    getLevenshteinDistance(s1, s2) {
        const m = s1.length, n = s2.length;
        const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
            }
        }
        return dp[m][n];
    }

    getSuggestions(word) {
        const clean = word.toLowerCase();
        let suggestions = [];
        for (const dictWord of this.dict) {
            const distance = this.getLevenshteinDistance(clean, dictWord);
            if (distance <= 2) {
                suggestions.push({ word: dictWord, dist: distance });
            }
            if (suggestions.length > 50) break; // Performance guard
        }
        return suggestions.sort((a, b) => a.dist - b.dist).slice(0, 5).map(s => s.word);
    }

    highlightText(text) {
        const words = text.split(/(\s+)/);
        return words.map(w => {
            if (/\s+/.test(w)) return w;
            const clean = w.replace(/[.,!?;:()]/g, '');
            if (clean && !this.checkWord(clean)) {
                return `<span class="spell-error" data-word="${clean}">${w}</span>`;
            }
            return w;
        }).join('');
    }

    showSuggestions(e, input, overlay) {
        const word = e.target.dataset.word;
        if (!word) return;

        const suggestions = this.getSuggestions(word);
        this.suggestionMenu.innerHTML = '';
        
        suggestions.forEach(s => {
            const item = document.createElement('div');
            item.className = 'spell-suggestion-item';
            item.textContent = s;
            item.onclick = () => this.replaceWord(input, word, s);
            this.suggestionMenu.appendChild(item);
        });

        const ignore = document.createElement('div');
        ignore.className = 'spell-suggestion-item ignore';
        ignore.textContent = 'Ignorar';
        ignore.onclick = () => {
            this.ignoredWords.add(word.toLowerCase());
            this.updateOverlay(input, overlay);
            this.suggestionMenu.style.display = 'none';
        };
        this.suggestionMenu.appendChild(ignore);

        const rect = e.target.getBoundingClientRect();
        this.suggestionMenu.style.top = `${rect.bottom + window.scrollY + 5}px`;
        this.suggestionMenu.style.left = `${rect.left + window.scrollX}px`;
        this.suggestionMenu.style.display = 'flex';
    }

    replaceWord(input, oldWord, newWord) {
        const val = input.value;
        const regex = new RegExp(`\\b${oldWord}\\b`, 'gi');
        input.value = val.replace(regex, newWord);
        input.dispatchEvent(new Event('input'));
        this.suggestionMenu.style.display = 'none';
    }

    updateOverlay(input, overlay) {
        overlay.innerHTML = this.highlightText(input.value) + '\n'; // Add newline to help alignment
        overlay.scrollTop = input.scrollTop;
    }

    bind(input) {
        const container = document.createElement('div');
        container.className = 'spell-highlighter-container';
        input.parentNode.insertBefore(container, input);
        
        const overlay = document.createElement('div');
        overlay.className = 'spell-highlighter-overlay';
        container.appendChild(overlay);
        container.appendChild(input);

        input.addEventListener('input', () => this.updateOverlay(input, overlay));
        input.addEventListener('scroll', () => {
            overlay.scrollTop = input.scrollTop;
            overlay.scrollLeft = input.scrollLeft;
        });

        overlay.addEventListener('click', (e) => {
            if (e.target.classList.contains('spell-error')) {
                this.showSuggestions(e, input, overlay);
            }
        });
        
        // Initial check
        this.updateOverlay(input, overlay);
    }
}

// Common Portuguese words seed (Top 1000 approximate)
const ptDict = [
    "o", "a", "os", "as", "de", "do", "da", "dos", "das", "um", "uma", "uns", "umas", "e", "é", "que", "para", "por", "em", "com",
    "seu", "sua", "seus", "suas", "meu", "minha", "meus", "minhas", "teu", "tua", "teus", "tuas", "nosso", "nossa", "nossos", "nossas",
    "este", "esta", "estes", "estas", "esse", "essa", "esses", "essas", "aquele", "aquela", "aqueles", "aquelas", "isso", "isto", "aquilo",
    "eu", "tu", "ele", "ela", "nós", "vós", "eles", "elas", "você", "vocês", "ser", "estar", "ter", "haver", "fazer", "dar", "ir", "vir",
    "poder", "saber", "querer", "dizer", "ver", "falar", "casa", "carro", "trabalho", "tempo", "dia", "noite", "bom", "boa", "grande",
    "pequeno", "muito", "pouco", "mais", "menos", "aqui", "ali", "lá", "agora", "depois", "sempre", "nunca", "hoje", "ontem", "amanhã",
    "evento", "agenda", "calendário", "reunião", "cliente", "projeto", "contato", "mensagem", "whatsapp", "notificação", "pendente",
    "concluído", "cancelado", "adiado", "descrição", "título", "local", "sala", "participante", "grupo", "link", "anexo", "arquivo",
    "foto", "vídeo", "documento", "pdf", "drive", "meet", "zoom", "skype", "equipe", "almoço", "visita", "treinamento", "viagem",
    "palestra", "curso", "festa", "aniversário", "casamento", "feriado", "domingo", "segunda", "terça", "quarta", "quinta", "sexta",
    "sábado", "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
    "atendimento", "suporte", "venda", "contrato", "financeiro", "pagamento", "boleto", "cartão", "nota", "fiscal", "empresa", "cnpj",
    "cpf", "telefone", "celular", "email", "site", "dashboard", "sistema", "configuração", "perfil", "senha", "usuário", "admin",
    "relatório", "backup", "log", "erro", "sucesso", "teste", "desenvolvimento", "programação", "código", "funcionalidade",
    "ajuste", "correção", "melhoria", "estética", "design", "layout", "visual", "cor", "estilo", "fonte", "texto", "parágrafo",
    "página", "aba", "botão", "ícone", "banner", "logo", "marca", "marketing", "digital", "estratégia", "planejamento", "objetivo",
    "meta", "prazo", "entrega", "finalizado", "prioridade", "importante", "urgente", "crítico", "normal", "baixo", "alto", "médio",
    "tarefa", "atividade", "checklist", "passo", "etapa", "fluxo", "processo", "gestão", "liderança", "colaboração", "comunicação",
    "equipe", "membro", "pessoa", "indivíduo", "social", "comunidade", "rede", "internet", "nuvem", "nuvens", "sol", "chuva", "frio",
    "calor", "clima", "natureza", "vida", "saúde", "bem", "mal", "verdade", "mentira", "certo", "errado", "fácil", "difícil", "novo", "velho",
    "primeiro", "último", "próximo", "anterior", "cada", "todo", "algum", "nenhum", "qualquer", "vários", "muitos", "alguns", "outros",
    "mesmo", "próprio", "tal", "como", "assim", "também", "ainda", "já", "até", "mesmo", "então", "pois", "embora", "contudo", "porque",
    "porquê", "por", "que", "onde", "quando", "quem", "quanto", "qual", "quais", "quaisquer", "através", "conforme", "segundo", "durante",
    "sob", "sobre", "entre", "perante", "atrás", "frente", "lado", "dentro", "fora", "acima", "abaixo"
];

const spellChecker = new SpellChecker(ptDict);

// Bind to modal inputs when they are ready
function initSpellChecker() {
    const titleInput = document.getElementById('event-title');
    const descInput = document.getElementById('event-description');
    
    if (titleInput) spellChecker.bind(titleInput);
    if (descInput) spellChecker.bind(descInput);
}

// Re-initialize or check if needed
window.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for other scripts to initialize if needed
    setTimeout(initSpellChecker, 500);
});

