function initUI() {
    // Search Handler
    const searchInput = document.getElementById('event-search');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            filterAndRenderEvents();
        });
    }

    // Modal Close
    window.onclick = (event) => {
        const modal = document.getElementById('event-modal');
        const calModal = document.getElementById('calendar-modal');
        const waModal = document.getElementById('wa-modal');
        const statusModal = document.getElementById('status-modal');

        if (event.target === modal) closeModal();
        if (event.target === calModal) closeCreateCalendarModal();
        if (event.target === waModal) closeWaModal();
        // statusModal is usually urgent, we don't close it on click outside unless desired.
    };

    // Tabs logic if present
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = (e) => {
            const tabId = btn.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const pane = document.getElementById(tabId);
            if (pane) pane.classList.add('active');
        };
    });

    // Setup Sidebar Mobile Toggle
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    if (sidebarToggle && sidebar) {
        sidebarToggle.onclick = () => {
            sidebar.classList.toggle('collapsed');
        };
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' : (type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle');
    
    toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

function showStatus(id, message, isSuccess) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerText = message;
    el.style.color = isSuccess ? 'var(--success)' : '#ff4444';
    setTimeout(() => { el.innerText = ''; }, 5000);
}

function log(msg) {
    console.log(`[AgendaBot] ${msg}`);
}

function toggleConfigSection(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const isVisible = target.style.display === 'block';
    
    // Hide all first? Or just toggle? Let's toggle.
    target.style.display = isVisible ? 'none' : 'block';
}

function openCreateCalendarModal() {
    const modal = document.getElementById('calendar-modal');
    if (modal) modal.style.display = 'flex';
}

function closeCreateCalendarModal() {
    const modal = document.getElementById('calendar-modal');
    if (modal) modal.style.display = 'none';
}

function renderAgendaList() {
    const list = document.getElementById('agenda-list');
    if (!list) return;
    list.innerHTML = '';

    window.savedAgendas.forEach((email, index) => {
        const item = document.createElement('div');
        item.className = 'agenda-item';
        item.innerHTML = `
            <span>${email}</span>
            <button onclick="removeAgenda(${index})" title="Remover"><i class="fas fa-trash"></i></button>
        `;
        list.appendChild(item);
    });
}

function addAgenda() {
    const input = document.getElementById('calendar-id-input');
    const email = input.value.trim();
    if (email && !window.savedAgendas.includes(email)) {
        window.savedAgendas.push(email);
        input.value = '';
        renderAgendaList();
    }
}

function removeAgenda(index, btn) {
    // Forwarding to api.js is handled there, but we need consistency
    if (window.confirm && !confirm("Deseja remover esta agenda?")) return;
    // Call the API function defined in api.js or handled here?
    // Let's keep it here if it's UI logic, but api action should be in api.js
    if (window._removeAgendaApi) window._removeAgendaApi(index);
}

function renderGroupOptions(groups) {
    const select = document.getElementById('event-group-id') || document.getElementById('event-group-jid');
    if (!select) return;
    
    let options = '<option value="">-- Selecione o Grupo --</option>';
    groups.forEach(g => {
        options += `<option value="${g.id}">${g.subject} (${g.id.split('@')[0]})</option>`;
    });
    select.innerHTML = options;
}

// Persistência de preferências de Agendas
function getDisabledCalendars() {
    const saved = localStorage.getItem('disabledCalendars');
    return new Set(saved ? JSON.parse(saved) : []);
}

function setCalendarDisabled(id, disabled) {
    const current = getDisabledCalendars();
    if (disabled) current.add(id);
    else current.delete(id);
    localStorage.setItem('disabledCalendars', JSON.stringify([...current]));
}

// Global Exports
window.initUI = initUI;
window.showToast = showToast;
window.showStatus = showStatus;
window.log = log;
window.toggleConfigSection = toggleConfigSection;
window.openCreateCalendarModal = openCreateCalendarModal;
window.closeCreateCalendarModal = closeCreateCalendarModal;
window.renderAgendaList = renderAgendaList;
window.addAgenda = addAgenda;
window.removeAgenda = removeAgenda;
window.renderGroupOptions = renderGroupOptions;
window.getDisabledCalendars = getDisabledCalendars;
window.setCalendarDisabled = setCalendarDisabled;
