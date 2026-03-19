function filterAndRenderEvents() {
    const rawValue = (document.getElementById('event-search') || {value:''}).value.toLowerCase();
    
    // Filtro por termo de busca
    let filtered = window.cachedEvents.filter(ev => {
        const title = (ev.summary || '').toLowerCase();
        const desc  = (ev.description || '').toLowerCase();
        return title.includes(rawValue) || desc.includes(rawValue);
    });

    // Filtro por Agendas Ativas (Multi-calendar)
    filtered = filtered.filter(ev => {
        const calId = ev.calendarId || 'primary';
        return window.activeCalendars.has(calId);
    });

    // Filtro por Data selecionada no mini-calendário (se houver)
    if (window.selectedDateFilter) {
        filtered = filtered.filter(event => {
            const start = parseGoogleDate(event.start);
            const end = parseGoogleDate(event.end || event.start);
            if (!start || !end) return false;
            const startStr = toLocaleISO(start);
            const endStr = toLocaleISO(end);
            return window.selectedDateFilter >= startStr && window.selectedDateFilter <= endStr;
        });
    }

    renderKanban(filtered);
    renderMonthlyEvents(filtered);
    if (window.renderMainCalendar) window.renderMainCalendar(filtered);
    if (window.updateDashboardMetrics) updateDashboardMetrics(filtered);
}

function renderKanban(events) {
    const todoList = document.getElementById('cards-todo');
    const inProgressList = document.getElementById('cards-doing');
    const doneList = document.getElementById('cards-done');
    const canceledList = document.getElementById('cards-cancel');
    const postponedList = document.getElementById('cards-postpone');
    
    if (!todoList || !inProgressList || !doneList) return;

    todoList.innerHTML = '';
    inProgressList.innerHTML = '';
    doneList.innerHTML = '';
    if (canceledList) canceledList.innerHTML = '';
    if (postponedList) postponedList.innerHTML = '';

    const today = new Date();
    today.setHours(0,0,0,0);

    events.forEach(event => {
        const card = createEventCard(event);
        const start = parseGoogleDate(event.start);
        const end = parseGoogleDate(event.end);
        
        let targetList = todoList;
        
        // Regra de Colunas Baseada no Status Local (Sincronizado com DB)
        if (event.local_status === 'COMPLETED') {
            targetList = doneList;
        } else if (event.local_status === 'CANCELED') {
            targetList = canceledList || todoList;
        } else if (event.local_status === 'POSTPONED') {
            targetList = postponedList || todoList;
        } else if (start) {
            const startDate = new Date(start);
            startDate.setHours(0,0,0,0);
            const endDate = end ? new Date(end) : startDate;
            endDate.setHours(23,59,59,999);

            if (today >= startDate && today <= endDate) {
                targetList = inProgressList;
            } else if (today > endDate) {
                targetList = doneList;
            }
        }
        
        targetList.appendChild(card);
    });

    // Update Counters
    const updateCount = (id, list) => {
        const el = document.getElementById(id);
        if (el) el.innerText = list.children.length;
    };

    updateCount('count-todo', todoList);
    updateCount('count-doing', inProgressList);
    updateCount('count-done', doneList);
    if (canceledList) updateCount('count-cancel', canceledList);
    if (postponedList) updateCount('count-postpone', postponedList);
}

function createEventCard(event) {
    const div = document.createElement('div');
    div.className = 'kanban-card';
    div.onclick = () => openEventModal(event);

    const start = parseGoogleDate(event.start);
    const timeStr = start ? start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
    const dayStr = start ? start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
    const desc = event.description || '';
    
    // Ribbon de cor da agenda
    const calId = event.calendarId || 'primary';
    const calObj = (window.availableCalendars || []).find(c => c.id === calId);
    const calColor = calObj ? calObj.backgroundColor : (event.backgroundColor || '#3788d8');

    // Parse participants for badge and avatars
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

    // Identificação visual de status local
    let statusBadge = '';
    if (event.local_status === 'COMPLETED') statusBadge = '<span class="card-status-pill completed">Concluído</span>';
    if (event.local_status === 'CANCELED') statusBadge = '<span class="card-status-pill canceled">Cancelado</span>';
    if (event.local_status === 'POSTPONED') statusBadge = '<span class="card-status-pill postponed">Adiado</span>';

    div.innerHTML = `
        <div class="card-calendar-indicator" style="background:${calColor}"></div>
        <div class="card-header">
            <span class="card-time"><i class="far fa-clock"></i> ${timeStr}</span>
            <span class="card-date">${dayStr}</span>
        </div>
        <h4 class="card-title">${event.summary || '(Sem título)'}</h4>
        
        <div class="card-badges" style="display:flex; gap:6px; flex-wrap:wrap; margin: 8px 0;">
            ${clTotal > 0 ? `
                <div class="card-badge ${clDone === clTotal ? 'success' : ''}" style="font-size:0.65rem; background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px; display:flex; align-items:center; gap:4px;">
                    <i class="fas fa-check-double" style="font-size:0.6rem;"></i> ${clDone}/${clTotal}
                </div>` : ''}
            ${desc.includes('[ATTACH:') ? `
                <div class="card-badge" style="font-size:0.65rem; background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px; display:flex; align-items:center; gap:4px;">
                    <i class="fas fa-paperclip" style="font-size:0.6rem;"></i> Anexo
                </div>` : ''}
        </div>

        ${statusBadge}

        <div class="card-footer" style="display:flex; justify-content:space-between; align-items:center; margin-top:auto;">
            <div class="card-footer-avatars" style="display:flex; gap:-8px;">
                <div class="avatar-mini" style="width:20px; height:20px; border-radius:50%; background:var(--primary); color:white; font-size:0.6rem; display:flex; align-items:center; justify-content:center; border:1px solid var(--card-bg);" title="${event.organizer?.email || 'Organizador'}">
                    ${(event.organizer?.email || 'A').charAt(0).toUpperCase()}
                </div>
                ${pCount > 0 ? `<div class="avatar-mini" style="width:20px; height:20px; border-radius:50%; background:#475569; color:white; font-size:0.6rem; display:flex; align-items:center; justify-content:center; border:1px solid var(--card-bg); margin-left:-6px;">+${pCount}</div>` : ''}
            </div>
            <span class="card-id" style="font-size:0.6rem; color:var(--text-muted);">#${event.id.substring(0, 6)}</span>
        </div>
    `;
    return div;
}

function renderMonthlyEvents(events) {
    const monthList = document.getElementById('monthly-events-list');
    if (!monthList) return;
    monthList.innerHTML = '';

    const sorted = [...events].sort((a, b) => {
        const da = parseGoogleDate(a.start);
        const db = parseGoogleDate(b.start);
        return da - db;
    });

    sorted.forEach(ev => {
        const start = parseGoogleDate(ev.start);
        if (!start) return;

        const row = document.createElement('div');
        row.className = 'monthly-item';
        row.onclick = () => openEventModal(ev);

        const day = start.getDate();
        const weekDay = start.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
        
        const calId = ev.calendarId || 'primary';
        const calObj = (window.availableCalendars || []).find(c => c.id === calId);
        const calColor = calObj ? calObj.backgroundColor : (ev.backgroundColor || '#3788d8');

        row.innerHTML = `
            <div class="monthly-day-box">
                <span class="m-day">${day}</span>
                <span class="m-weekday">${weekDay}</span>
            </div>
            <div class="monthly-info">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="width:8px; height:8px; border-radius:50%; background:${calColor}"></span>
                    <span class="m-title">${ev.summary || '(Sem título)'}</span>
                </div>
                <span class="m-time">${start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
        `;
        monthList.appendChild(row);
    });
}

// Global Exports
window.filterAndRenderEvents = filterAndRenderEvents;
window.renderKanban = renderKanban;
window.createEventCard = createEventCard;
window.renderMonthlyEvents = renderMonthlyEvents;
