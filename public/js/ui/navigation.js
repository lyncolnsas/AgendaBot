function showPage(pageId, event) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const targetDoc = document.getElementById(pageId);
    if (targetDoc) targetDoc.classList.add('active');
    
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    } else if (event && event.target) {
        event.target.classList.add('active');
    }

    if (pageId === 'eventos') {
        loadCalendars().then(fetchEvents);
    }
    if (pageId === 'agendas') {
        listAgendas();
    }
    if (pageId === 'config') {
        if (window.listCredentials) listCredentials();
        checkOAuthStatus();
    }
    
    // Close mobile sidebar if open
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && window.innerWidth <= 768) {
        sidebar.classList.add('collapsed');
    }
}

function openWaModal() {
    if (window.waModalDismissed) return;
    const modal = document.getElementById('wa-modal');
    if (modal) modal.style.display = 'flex';
}

function closeWaModal() {
    window.waModalDismissed = true;
    const modal = document.getElementById('wa-modal');
    if (modal) modal.style.display = 'none';
}

// Global Exports
window.showPage = showPage;
window.openWaModal = openWaModal;
window.closeWaModal = closeWaModal;
