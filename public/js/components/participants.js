function addParticipantRow(name = "", wa = "") {
    const container = document.getElementById('participants-container');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'p-row';
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.marginBottom = '8px';

    row.innerHTML = `
        <div class="p-name-wrap" style="position:relative;flex:1;">
            <input type="text" class="meta-lite-input p-name" placeholder="Nome" value="${name}" 
                oninput="if(window.filterContactDropdown) window.filterContactDropdown(this)"
                onblur="setTimeout(()=> { if(window.closeContactDropdown) window.closeContactDropdown(this) }, 200)"
                onfocus="if(window.filterContactDropdown) window.filterContactDropdown(this)">
            <div class="contact-dropdown" style="display:none;"></div>
        </div>
        <input type="text" class="meta-lite-input p-wa" placeholder="WhatsApp" value="${wa}" style="flex:1">
        <button class="btn-ghost-sm" onclick="if(window.pinAsFavorite) window.pinAsFavorite(this)" title="Salvar nos Favoritos" style="color:var(--warning)">
            <i data-lucide="star" style="width:14px;height:14px;"></i>
        </button>
        <button class="btn-ghost-sm" onclick="this.parentElement.remove()" style="color:var(--error)" title="Remover">
            <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
        </button>
    `;

    container.appendChild(row);
    if (window.lucide) lucide.createIcons();
}

function toggleGroupFields() {
    const mode = document.getElementById('event-group-mode').value;
    const createF = document.getElementById('group-create-fields');
    const existingF = document.getElementById('group-existing-fields');

    if (createF) createF.style.display = (mode === 'create') ? 'block' : 'none';
    if (existingF) existingF.style.display = (mode === 'existing') ? 'block' : 'none';
}

function syncGroupMode(mode) {
    const el = document.getElementById('event-group-mode');
    if (el) {
        el.value = mode;
        toggleGroupFields();
    }
}

// Global Exports
window.addParticipantRow = addParticipantRow;
window.toggleGroupFields = toggleGroupFields;
window.syncGroupMode = syncGroupMode;
