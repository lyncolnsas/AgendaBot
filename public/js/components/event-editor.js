// Event Editor & Modal Logic
let _modalDraft = null;

function initColorPicker() {
    const picker = document.getElementById('color-picker');
    if (!picker) return;
    picker.innerHTML = '';

    const googleColorMap = {
        "1": "#7986cb", "2": "#33b679", "3": "#8e24aa", "4": "#e67c73", "5": "#f6bf26", 
        "6": "#f4511e", "7": "#039be5", "8": "#616161", "9": "#3f51b5", "10": "#0b8043", "11": "#d50000"
    };

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
        if (id === "5") dot.classList.add('light-color'); 
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
    const modal = document.getElementById('event-modal');
    if (!modal) return;
    const isNew = document.getElementById('event-id').value === "";
    const submitBtn = document.getElementById('btn-save-event');
    if (submitBtn) {
        submitBtn.innerHTML = isNew ? '<i data-lucide="save"></i> <strong>Agendar</strong>' : '<i data-lucide="save"></i> <strong>Salvar</strong>';
        if (window.lucide) lucide.createIcons();
    }
    const calSelect = document.getElementById('event-calendar');
    if (calSelect) calSelect.disabled = !isNew;
}

function openCreateModal() {
    document.getElementById('event-id').value = '';
    toggleModalEditMode(true);

    if (_hasDraftContent(_modalDraft)) {
        _restoreDraft(_modalDraft);
        document.getElementById('event-modal').style.display = 'flex';
        return;
    }

    _modalDraft = null;
    const fields = ['event-title', 'event-location', 'event-description', 'calendar-summary', 'calendar-description'];
    fields.forEach(f => { const el = document.getElementById(f); if (el) el.value = ''; });

    const calendarSelect = document.getElementById('event-calendar');
    if (calendarSelect && window.activeCalendars.size > 0) {
        calendarSelect.value = Array.from(window.activeCalendars)[0];
    }
    
    // Clear Dynamic
    const pContainer = document.getElementById('participants-container');
    if (pContainer) { pContainer.innerHTML = ''; addParticipantRow(); }
    const clWrapper = document.getElementById('checklists-wrapper');
    if (clWrapper) clWrapper.innerHTML = '';
    const attList = document.getElementById('attachments-list');
    if (attList) attList.innerHTML = '';

    selectColor('');
    const now = new Date();
    const startIso = now.toISOString().slice(0, 16);
    const endIso = new Date(now.getTime() + 3600000).toISOString().slice(0, 16);
    
    document.getElementById('event-start-date').value = startIso.split('T')[0];
    document.getElementById('event-start-time').value = startIso.split('T')[1].substring(0, 5);
    document.getElementById('event-end-date').value = endIso.split('T')[0];
    document.getElementById('event-end-time').value = endIso.split('T')[1].substring(0, 5);

    document.getElementById('btn-delete-event').style.display = 'none';
    document.getElementById('event-modal').style.display = 'flex';
}

function openEventModal(event) {
    document.getElementById('event-id').value = event.id;
    toggleModalEditMode(false);
    
    const titleEl = document.getElementById('event-title');
    if (titleEl) titleEl.value = event.summary || '';
    
    const locEl = document.getElementById('event-location');
    if (locEl) locEl.value = event.location || '';
    
    const calSelect = document.getElementById('event-calendar');
    if (calSelect) {
        calSelect.value = event.calendarId || 'primary';
        calSelect.disabled = true;
    }

    if (window.selectColor) selectColor(event.colorId || "");

    const start = parseGoogleDate(event.start);
    const end = parseGoogleDate(event.end || event.start);
    
    if (start) {
        document.getElementById('event-start-date').value = toLocaleISO(start);
        document.getElementById('event-start-time').value = start.toTimeString().substring(0, 5);
    }
    if (end) {
        document.getElementById('event-end-date').value = toLocaleISO(end);
        document.getElementById('event-end-time').value = end.toTimeString().substring(0, 5);
    }

    const desc = event.description || "";
    const descEl = document.getElementById('event-description');
    if (descEl) descEl.value = desc.split('\n').filter(l => !l.startsWith('[')).join('\n').trim();
    
    // Checklists & Attachments
    if (window.renderChecklistsAndAttachments) renderChecklistsAndAttachments(event);

    // Participants
    const pContainer = document.getElementById('participants-container');
    if (pContainer) {
        pContainer.innerHTML = '';
        const waMatch = desc.match(/\[WA_IDS:\s*(.*?)\]/);
        if (waMatch && waMatch[1]) {
            waMatch[1].split(', ').forEach(p => {
                const [n, w] = p.split('|');
                if (n || w) addParticipantRow(n || "", w || "");
            });
        }
        if (pContainer.children.length === 0) addParticipantRow();
    }

    const deleteBtn = document.getElementById('btn-delete-event');
    if (deleteBtn) deleteBtn.style.display = 'block';
    
    const modal = document.getElementById('event-modal');
    if (modal) modal.style.display = 'flex';
}

function closeModal() {
    const draft = _readModalDraft();
    if (_hasDraftContent(draft)) _modalDraft = draft;
    else _modalDraft = null;
    document.getElementById('event-modal').style.display = 'none';
}

function _readModalDraft() {
    if (document.getElementById('event-id').value !== '') return null;
    return {
        title: document.getElementById('event-title')?.value || '',
        location: document.getElementById('event-location')?.value || '',
        description: document.getElementById('event-description')?.value || ''
    };
}
function _hasDraftContent(d) { return d && (d.title.trim() !== '' || d.description.trim() !== ''); }
function _restoreDraft(d) {
    if (!d) return;
    document.getElementById('event-title').value = d.title;
    document.getElementById('event-location').value = d.location;
    document.getElementById('event-description').value = d.description;
}

async function submitEvent() {
    const eventId = document.getElementById('event-id').value;
    const title = document.getElementById('event-title').value;
    const startD = document.getElementById('event-start-date').value;
    const startT = document.getElementById('event-start-time').value;
    const endD = document.getElementById('event-end-date').value;
    const endT = document.getElementById('event-end-time').value;

    if (!title || !startD || !startT) { alert("Título e Início são obrigatórios."); return; }

    const payload = {
        summary: title,
        location: document.getElementById('event-location').value,
        description: document.getElementById('event-description').value,
        start: `${startD}T${startT}:00`,
        end: `${endD}T${endT}:00`,
        calendarId: document.getElementById('event-calendar').value,
        colorId: document.getElementById('event-color').value
    };

    const isEdit = eventId !== "";
    const method = isEdit ? 'PUT' : 'POST';
    const url = isEdit ? `/v1/events/${eventId}` : '/v1/events';

    try {
        const res = await fetch(url, {
            method: method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        if (res.ok) { closeModal(); refreshEvents(); }
        else { alert("Erro ao salvar"); }
    } catch(e) { alert("Erro de conexão"); }
}

async function deleteEvent() {
    const eventId = document.getElementById('event-id').value;
    if (!eventId || !confirm("Deseja realmente excluir este evento?")) return;
    const calId = document.getElementById('event-calendar').value || 'primary';
    try {
        const res = await fetch(`/v1/events/${eventId}?calendarId=${encodeURIComponent(calId)}`, { method: 'DELETE' });
        if (res.ok) { closeModal(); refreshEvents(); }
    } catch(e) { alert("Erro ao excluir"); }
}

// Global Exports
window.initColorPicker = initColorPicker;
window.selectColor = selectColor;
window.toggleModalEditMode = toggleModalEditMode;
window.openCreateModal = openCreateModal;
window.openEventModal = openEventModal;
window.closeModal = closeModal;
window.submitEvent = submitEvent;
window.deleteEvent = deleteEvent;
