function renderChecklistsAndAttachments(event) {
    const desc = event.description || "";
    const clWrapper = document.getElementById('checklists-wrapper');
    const attList = document.getElementById('attachments-list');
    
    if (clWrapper) clWrapper.innerHTML = '';
    if (attList) attList.innerHTML = '';

    // Render Checklists: [CHECKLIST:Title|Item1:true|Item2:false]
    const clMatches = desc.matchAll(/\[CHECKLIST:(.+?)\|(.+?)\]/g);
    for (const match of clMatches) {
        const title = match[1];
        const items = match[2].split('|');
        addChecklistUI(title, items);
    }

    // Render Attachments: [ATTACH:Title|URL]
    const attMatches = desc.matchAll(/\[ATTACH:(.+?)\|(.+?)\]/g);
    for (const match of attMatches) {
        const title = match[1];
        const url = match[2];
        addAttachmentUI(title, url);
    }
}

function addChecklistUI(title = "Tarefas", items = []) {
    const wrapper = document.getElementById('checklists-wrapper');
    if (!wrapper) return;

    const div = document.createElement('div');
    div.className = 'planka-section checklist-section';
    div.innerHTML = `
        <div class="section-header">
            <span><i data-lucide="check-square"></i> ${title}</span>
            <button class="btn-ghost-sm" onclick="this.closest('.checklist-section').remove()">Excluir</button>
        </div>
        <div class="checklist-items"></div>
        <button class="btn-ghost-sm" onclick="addChecklistRow(this)">+ Item</button>
    `;
    
    const itemsCont = div.querySelector('.checklist-items');
    items.forEach(item => {
        const [text, done] = item.split(':');
        addChecklistRow(itemsCont, text, done === 'true');
    });

    wrapper.appendChild(div);
    if (window.lucide) lucide.createIcons();
}

function addChecklistRow(containerOrBtn, text = "", done = false) {
    const container = containerOrBtn.tagName === 'BUTTON' ? containerOrBtn.previousElementSibling : containerOrBtn;
    const row = document.createElement('div');
    row.className = 'checklist-row';
    row.innerHTML = `
        <input type="checkbox" ${done ? 'checked' : ''}>
        <input type="text" class="meta-lite-input" value="${text}" placeholder="O que precisa ser feito?">
        <button onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(row);
}

function serializeChecklists() {
    const sections = document.querySelectorAll('.checklist-section');
    return Array.from(sections).map(s => {
        const title = s.querySelector('.section-header span').innerText.trim();
        const rows = s.querySelectorAll('.checklist-row');
        const items = Array.from(rows).map(r => {
            const txt = r.querySelector('input[type="text"]').value.trim();
            const done = r.querySelector('input[type="checkbox"]').checked;
            return `${txt}:${done}`;
        }).filter(i => i.split(':')[0] !== '');
        return items.length > 0 ? `[CHECKLIST:${title}|${items.join('|')}]` : '';
    }).filter(s => s !== '').join('\n');
}

function addAttachmentUI(title, url) {
    const list = document.getElementById('attachments-list');
    if (!list) return;
    const div = document.createElement('div');
    div.className = 'attachment-item';
    div.innerHTML = `
        <a href="${url}" target="_blank">${title}</a>
        <button onclick="this.parentElement.remove()">×</button>
    `;
    list.appendChild(div);
}

function serializeAttachments() {
    const items = document.querySelectorAll('.attachment-item');
    return Array.from(items).map(item => {
        const a = item.querySelector('a');
        return `[ATTACH:${a.innerText}|${a.href}]`;
    }).join('\n');
}

// Global Exports
window.renderChecklistsAndAttachments = renderChecklistsAndAttachments;
window.addChecklistUI = addChecklistUI;
window.addChecklistRow = addChecklistRow;
window.serializeChecklists = serializeChecklists;
window.serializeAttachments = serializeAttachments;
