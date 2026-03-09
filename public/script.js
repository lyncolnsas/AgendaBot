let allContacts = []; // Global contact list
let quickFavorites = JSON.parse(localStorage.getItem('wa_quick_favorites')) || [null, null, null, null];
let waModalDismissed = false;
const API_BASE = '/v1/config';

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
        loadNotificationSettings();
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

    const now = new Date();
    const next7d = new Date();
    next7d.setDate(now.getDate() + 7);

    events.forEach(event => {
        const startRaw = event.start.dateTime || event.start.date || event.start;
        const endRaw = event.end ? (event.end.dateTime || event.end.date || event.end) : startRaw;

        const startDate = new Date(startRaw);
        const endDate = new Date(endRaw);

        // Calculate Meeting Hours (only for non-all-day events or events with time)
        if (startRaw.includes('T')) {
            const diffMs = endDate - startDate;
            if (diffMs > 0) {
                totalMinutes += diffMs / 60000;
            }
        }

        // Detect Canceled Events
        const title = (event.summary || "").toLowerCase();
        const description = (event.description || "").toLowerCase();
        if (title.includes('cancelado') || description.includes('cancelado')) {
            canceledCount++;
        }

        // Upcoming 7 Days
        if (startDate >= now && startDate <= next7d) {
            upcoming7dCount++;
        }
    });

    const totalHours = Math.floor(totalMinutes / 60);

    // Update UI
    const elTotal = document.getElementById('metric-total-events');
    const elHours = document.getElementById('metric-meeting-hours');
    const elCanceled = document.getElementById('metric-canceled-events');
    const elUpcoming = document.getElementById('metric-upcoming-7d');

    if (elTotal) elTotal.innerText = totalEvents;
    if (elHours) elHours.innerText = `${totalHours}h`;
    if (elCanceled) elCanceled.innerText = canceledCount;
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

async function loadCalendars() {
    try {
        const response = await fetch('/v1/events/calendars');
        if (!response.ok) throw new Error("Failed to load calendars");
        window.availableCalendars = await response.json();

        window.activeCalendars = new Set(window.availableCalendars.map(c => c.id));

        const filterContainer = document.getElementById('calendar-filters-container');
        if (filterContainer) filterContainer.innerHTML = '';

        const selectContainer = document.getElementById('event-calendar');
        if (selectContainer) selectContainer.innerHTML = '';

        window.availableCalendars.forEach(cal => {
            // Checkbox logic
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.gap = '10px';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = true;
            cb.value = cal.id;
            cb.style.accentColor = cal.backgroundColor || '#3788d8';
            cb.style.width = '18px';
            cb.style.height = '18px';
            cb.style.cursor = 'pointer';

            cb.onchange = (e) => {
                if (e.target.checked) window.activeCalendars.add(cal.id);
                else window.activeCalendars.delete(cal.id);
                filterAndRenderEvents();
            };

            const label = document.createElement('label');
            label.innerText = cal.summary;
            label.style.color = 'white';
            label.style.cursor = 'pointer';
            label.onclick = () => cb.click();

            div.appendChild(cb);
            div.appendChild(label);
            if (filterContainer) filterContainer.appendChild(div);

            // Dropdown option logic
            const opt = document.createElement('option');
            opt.value = cal.id;
            opt.innerText = cal.summary;
            opt.style.background = cal.backgroundColor || '#3788d8';
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
        const response = await fetch(`/v1/events?t=${new Date().getTime()}`, {
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        if (!response.ok) return;

        window.cachedEvents = await response.json();
        filterAndRenderEvents();
    } catch (e) {
        console.error('Error fetching events', e);
    }
}

function filterAndRenderEvents() {
    if (!window.cachedEvents) return;

    // Filter events based on active checkboxes
    const filteredEvents = window.cachedEvents.filter(e => window.activeCalendars.has(e.calendarId));

    // Update Monthly List
    renderMonthlyEvents(filteredEvents);

    // Update Dashboard Metrics
    updateDashboardMetrics(filteredEvents);

    // Format for FullCalendar
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
                // Parse Call Reminder [CALL:X]
                const callMatch = fullDesc.match(/\[CALL:(\d+)\]/);
                if (callMatch && callMatch[1]) {
                    document.getElementById('event-call-reminder').value = callMatch[1];
                }

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


function closeModal() {
    document.getElementById('event-modal').style.display = 'none';
}

// Function to open the create modal directly from the "Eventos" tab UI
function openCreateModal() {
    document.getElementById('event-id').value = "";
    toggleModalEditMode(true);

    // Reset Group Modes
    if (document.getElementById('event-group-mode')) document.getElementById('event-group-mode').value = "individual";
    toggleGroupFields();

    document.getElementById('event-title').value = "";
    document.getElementById('event-location').value = "";

    const calendarSelect = document.getElementById('event-calendar');
    if (calendarSelect && window.activeCalendars.size > 0) {
        calendarSelect.value = Array.from(window.activeCalendars)[0];
    }
    if (calendarSelect) calendarSelect.disabled = false;

    if (document.getElementById('event-description')) document.getElementById('event-description').value = "";
    if (document.getElementById('event-call-reminder')) document.getElementById('event-call-reminder').value = "";
    if (document.getElementById('event-type')) document.getElementById('event-type').value = "reuniao"; // Default to meeting

    // Clear Dyanmic Sections
    if (document.getElementById('participants-container')) {
        document.getElementById('participants-container').innerHTML = "";
        addParticipantRow();
    }

    if (document.getElementById('checklists-wrapper')) {
        document.getElementById('checklists-wrapper').innerHTML = "";
    }

    if (document.getElementById('attachments-list')) {
        document.getElementById('attachments-list').innerHTML = "";
    }

    selectColor("");

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

    const callMinutes = document.getElementById('event-call-reminder').value;
    if (callMinutes) {
        finalDescription += (finalDescription ? "\n" : "") + `[CALL:${callMinutes}]`;
    }

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

    // --- Preservar COLUNA: nunca perder posição do card ---
    const currentCard = document.getElementById(`card-${eventId}`);
    let colunaTag = 'todo'; // default only for new events
    if (eventId) {
        // Editing: preserve existing COLUNA from original description
        const rawDesc = (document.getElementById('event-raw-desc') || {}).value || '';
        const colunaMatch = rawDesc.match(/\[COLUNA:([^\]]+)\]/);
        if (colunaMatch) {
            colunaTag = colunaMatch[1];
        } else if (currentCard) {
            const colContainer = currentCard.parentElement;
            if (colContainer && colContainer.id.startsWith('cards-')) {
                colunaTag = colContainer.id.replace('cards-', '');
            }
        }
    } else if (currentCard) {
        const colContainer = currentCard.parentElement;
        if (colContainer && colContainer.id.startsWith('cards-')) {
            colunaTag = colContainer.id.replace('cards-', '');
        }
    }
    finalDescription += (finalDescription ? "\n" : "") + `[COLUNA:${colunaTag}]`;

    // --- Persistir Checklists e Anexos ---
    const checklistData = serializeChecklists();
    if (checklistData) finalDescription += `\n${checklistData}`;

    const attachmentData = serializeAttachments();
    if (attachmentData) finalDescription += `\n${attachmentData}`;

    const payload = {
        summary: title,
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

async function deleteEvent() {
    const eventId = document.getElementById('event-id').value;
    if (!eventId) return;

    if (!confirm("Tem certeza que deseja excluir este evento permanentemente?")) {
        return;
    }

    document.getElementById('btn-delete-event').innerText = "Excluindo...";
    document.getElementById('btn-delete-event').disabled = true;

    try {
        const calendarId = window.cachedEvents.find(e => e.id === eventId)?.calendarId || 'primary';
        const response = await fetch(`/v1/events/${eventId}?calendarId=${encodeURIComponent(calendarId)}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            closeModal();
            fetchEvents(); // Refresh calendar
        } else {
            alert("Erro ao excluir evento.");
        }
    } catch (e) {
        alert("Erro de conexão.");
    } finally {
        document.getElementById('btn-delete-event').innerText = "Excluir";
        document.getElementById('btn-delete-event').disabled = false;
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
        removeBtn.onclick = () => removeAgenda(index);

        li.appendChild(textSpan);
        li.appendChild(removeBtn);
        list.appendChild(li);
    });
}

async function removeAgenda(index) {
    if (!confirm('Deseja remover esta agenda?')) return;

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

// --- Google Credentials (JSON) ---
async function listCredentials() {
    try {
        const response = await fetch(`${API_BASE}/google-credentials`);
        const creds = await response.json();
        renderCredentialsList(creds);
    } catch (error) {
        console.error('Erro ao listar credenciais:', error);
    }
}

function renderCredentialsList(creds) {
    const list = document.getElementById('credentials-list');
    if (!list) return;

    if (creds.length === 0) {
        list.innerHTML = '<li style="color: var(--text-muted); font-style: italic; padding: 10px;">Nenhuma conta de serviço vinculada.</li>';
        return;
    }

    list.innerHTML = creds.map(c => `
        <li style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 10px; height: 10px; border-radius: 50%; background: #00ff00;"></div>
                <span style="font-size: 0.95rem; color: white;">${c.email}</span>
            </div>
            <button onclick="deleteCredential('${c.fileName}')" style="background: rgba(255, 68, 68, 0.1); border: 1px solid rgba(255, 68, 68, 0.3); color: #ff4444; cursor: pointer; padding: 5px 8px; border-radius: 4px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
        </li>
    `).join('');
}

async function addCredentials() {
    const jsonText = document.getElementById('new-credentials-json').value;
    const statusDiv = document.getElementById('credential-status');

    if (!jsonText.trim()) {
        showStatus('credential-status', 'Por favor, cole o conteúdo do JSON.', false);
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/google-credentials`, {
            method: 'POST',
            body: jsonText
        });
        const result = await response.json();

        if (result.status === 'success') {
            document.getElementById('new-credentials-json').value = '';
            showStatus('credential-status', result.message, true);
            listCredentials();
            loadCalendars();
        } else {
            showStatus('credential-status', result.message, false);
        }
    } catch (error) {
        showStatus('credential-status', 'Erro ao salvar: ' + error.message, false);
    }
}

async function deleteCredential(fileName) {
    if (!confirm('Deseja realmente remover esta conta de serviço?')) return;

    try {
        const response = await fetch(`${API_BASE}/google-credentials/${fileName}`, {
            method: 'DELETE'
        });
        const result = await response.json();

        if (result.status === 'success') {
            listCredentials();
            loadCalendars();
        } else {
            alert('Erro: ' + result.message);
        }
    } catch (error) {
        console.error('Erro ao deletar:', error);
    }
}

// --- Notification Settings ---
async function loadNotificationSettings() {
    try {
        const response = await fetch(`${API_BASE}/notifications`);
        if (response.ok) {
            const data = await response.json();
            if (data && data.contactNo) {
                const phoneInput = document.getElementById('notification-phone');
                if (phoneInput) phoneInput.value = data.contactNo;
            }
        }
    } catch (error) {
        console.error('Erro ao carregar configurações de notificação:', error);
    }
}

async function saveNotificationSettings() {
    const phoneInput = document.getElementById('notification-phone');
    if (!phoneInput) return;
    const contactNo = phoneInput.value.trim();
    const statusDiv = document.getElementById('notification-status');

    if (!contactNo) {
        if (statusDiv) statusDiv.innerHTML = '<p style="color: var(--error)">✗ Por favor, insira o número.</p>';
        return;
    }

    const btn = event.target;
    const oldText = btn.innerText;
    btn.innerText = 'Salvando...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/notifications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contactNo: contactNo })
        });
        const data = await response.json();
        if (response.ok) {
            if (statusDiv) {
                statusDiv.innerHTML = '<p style="color: var(--success)">✓ Configurações de notificação salvas com sucesso!</p>';
                setTimeout(() => { statusDiv.innerHTML = ''; }, 5000);
            }
        } else {
            if (statusDiv) statusDiv.innerHTML = `<p style="color: var(--error)">✗ Erro: ${data.message}</p>`;
        }
    } catch (e) {
        if (statusDiv) statusDiv.innerHTML = '<p style="color: var(--error)">✗ Erro de conexão.</p>';
    } finally {
        btn.innerText = oldText;
        btn.disabled = false;
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
    const cols = {
        todo: document.getElementById('cards-todo'),
        doing: document.getElementById('cards-doing'),
        done: document.getElementById('cards-done')
    };
    if (!cols.todo) return;

    // Clear all columns
    Object.values(cols).forEach(c => c.innerHTML = '');

    const now = new Date();
    // Simplified: show all events that were fetched (already limited to 60 days by the backend)
    const monthlyEvents = eventsData;

    const googleColorNames = {
        "1": "Lavanda", "2": "Sálvia", "3": "Uva", "4": "Flamingo",
        "5": "Banana", "6": "Tangerina", "7": "Pavão", "8": "Grafite",
        "9": "Mirtilo", "10": "Manjericão", "11": "Tomate"
    };

    monthlyEvents.forEach(event => {
        const title = event.summary || 'Sem título';
        const startRaw = event.start.dateTime || event.start.date || event.start;
        const isAllDay = typeof startRaw === 'string' && startRaw.length === 10;
        const dateObj = new Date(startRaw);

        // Determine Column
        let col = 'todo';
        const desc = event.description || '';
        if (desc.includes('[COLUNA:doing]')) col = 'doing';
        else if (desc.includes('[COLUNA:done]')) col = 'done';
        else if (event.extendedProperties?.private?.COLUNA) col = event.extendedProperties.private.COLUNA;

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

        card.innerHTML = `
            <div class="card-label" style="background: ${labelColor}"></div>
            <div class="card-title">${title}</div>
            <div class="card-badges">
                <div class="badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    ${isAllDay ? 'Dia Todo' : dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
                ${clTotal > 0 ? `<div class="badge ${clDone === clTotal ? 'badge-success' : ''}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path><path d="m9 12 2 2 4-4"></path></svg>${clDone}/${clTotal}</div>` : ''}
                ${pCount > 0 ? `<div class="badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>${pCount}</div>` : ''}
                ${desc.includes('[CALL:') ? `<div class="badge" style="background: rgba(234, 179, 8, 0.2);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg></div>` : ''}
                ${desc.includes('[ATTACH:') ? `<div class="badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg></div>` : ''}
            </div>
            <div class="card-footer-avatars">
                <div class="avatar-mini" title="${event.organizer?.email || 'Organizador'}">${(event.organizer?.email || 'A').charAt(0).toUpperCase()}</div>
                ${pCount > 1 ? `<div class="avatar-mini">+${pCount - 1}</div>` : ''}
            </div>
        `;

        card.onclick = (e) => {
            if (e.target.closest('.kanban-card')) {
                openEditModalFromEvent(event);
            }
        };

        cols[col].appendChild(card);
    });

    updateKanbanCounters();
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
    ['todo', 'doing', 'done'].forEach(col => {
        const count = document.getElementById(`cards-${col}`).children.length;
        document.getElementById(`count-${col}`).innerText = count;
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
            <div class="contact-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:9999;max-height:180px;overflow-y:auto;background:#1e293b;border:1px solid #334155;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.4);"></div>
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
            style="padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;border-bottom:1px solid #273044;"
            onmousedown="selectContactFromDropdown(event, '${cname.replace(/'/g, "\\'")}', '${number}')"
            onmouseenter="this.style.background='#334155'"
            onmouseleave="this.style.background=''">
            <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#25d366,#128c7e);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#fff;flex-shrink:0;">${(cname[0] || '?').toUpperCase()}</div>
            <div>
                <div style="font-weight:600;font-size:13px;color:#e2e8f0;">${cname}</div>
                <div style="font-size:11px;color:#64748b;">+${number}</div>
            </div>
        </div>`;
    }).join('');

    dropdown.style.display = 'block';
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
                imgHtml = `<div style="width:100%; height:100%; border-radius:50%; display:flex; align-items:center; justify-content:center; background:#334155;"><span>${initials || '??'}</span></div>`;
            }

            btn.innerHTML = `
                ${imgHtml}
                <div class="contact-hover-card">
                    <img src="${largePhotoUrl}" alt="${fav.name}">
                    <span>${fav.name}</span>
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

async function pinAsFavorite(btn) {
    const row = btn.closest('.p-row');
    const name = row.querySelector('.p-name').value;
    const wa = row.querySelector('.p-wa').value;

    if (!name || !wa) {
        showToast('Preencha nome e número para favoritar', 'warning');
        return;
    }

    // Modal/Prompt to select slot
    const slot = prompt("Em qual posição (1 a 6) deseja salvar este contato?", "1");
    if (!slot) return;
    const idx = parseInt(slot) - 1;

    if (idx >= 0 && idx < 6) {
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
}

function addFromFavorite(idx) {
    const fav = quickFavorites[idx];
    if (!fav) {
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
async function loadContacts(isManual = true) {
    if (loadingContacts) return;
    loadingContacts = true;
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

        if (isManual) showToast(`✅ ${allContacts.length} contatos sincronizados!`, 'success');
        console.log(`[Frontend] ${allContacts.length} contatos carregados.`);
    } catch (e) {
        console.error('Erro ao carregar contatos:', e);
        if (isManual) showToast("Falha ao sincronizar: " + e.message, 'error');
    } finally {
        loadingContacts = false;
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
        // Fetch original event to get current desc
        const res = await fetch(`/v1/events`);
        const events = await res.json();
        const event = events.find(e => e.id === eventId);
        if (!event) return;

        let cleanDesc = (event.description || '').replace(/\[COLUNA:.+?\]/g, '').trim();
        const newDesc = `${cleanDesc}\n[COLUNA:${colName}]`.trim();

        await fetch(`/v1/events/${eventId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...event,
                description: newDesc,
                start: event.start.dateTime || event.start.date,
                end: event.end.dateTime || event.end.date
            })
        });
        console.log(`Event ${eventId} moved to ${colName}`);
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

    // Parse Call
    if (fullDesc.includes('[CALL:')) {
        const callMatch = fullDesc.match(/\[CALL:(\d+)\]/);
        if (callMatch) document.getElementById('event-call-reminder').value = callMatch[1];
        fullDesc = fullDesc.replace(/\[CALL:\d+\]/, '');
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
            <button class="btn-ghost-sm" onclick="this.closest('.checklist-container').remove()">Excluir</button>
        </div>
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

// Initial calls
loadCalendars().then(() => {
    initColorPicker();
    listAgendas();
    listCredentials();
    loadNotificationSettings();
    updateStatus();
    loadContacts(false);
    fetchEvents();
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