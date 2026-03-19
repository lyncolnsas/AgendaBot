let statusCheckQueue = [];
let isStatusModalOpen = false;

function queueStatusCheck(event) {
    const statusModalIdVal = document.getElementById('status-modal-event-id');
    const currentOpenId = statusModalIdVal ? statusModalIdVal.value : null;
    
    if (isStatusModalOpen && currentOpenId === event.id) return;
    
    if (!statusCheckQueue.find(e => e.id === event.id)) {
        statusCheckQueue.push(event);
    }
}

function processStatusQueue() {
    if (isStatusModalOpen || statusCheckQueue.length === 0) return;
    
    // Only show if we're on the dashboard
    const eventosPage = document.getElementById('eventos');
    if (!eventosPage || !eventosPage.classList.contains('active')) return;

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
    const eventIdVal = document.getElementById('status-modal-event-id');
    const eventId = eventIdVal ? eventIdVal.value : null;
    if (!eventId) return;

    document.getElementById('status-modal').style.display = 'none';
    isStatusModalOpen = false;
    
    const event = window.cachedEvents.find(e => e.id === eventId);
    if (!event) {
        processStatusQueue();
        return;
    }

    try {
        let newTitle = event.summary || "Sem Título";
        let newDesc = event.description || "";
        
        // Limpar tags velhas
        newTitle = newTitle.replace(/^\s*\[(CANCELADO|ADIADO|CONCLUÍDO)\]\s*/i, '');
        newDesc = newDesc.replace(/\[COLUNA:.+?\]/g, '').replace(/\[(CANCELED|POSTPONED|DONE)\]/g, '').trim();

        if (statusAction === 'done') {
            newTitle = `[CONCLUÍDO] ${newTitle}`;
            newDesc = `${newDesc}\n[COLUNA:done]\n[DONE]`.trim();
        } 
        else if (statusAction === 'canceled') {
            newTitle = `[CANCELADO] ${newTitle}`;
            newDesc = `${newDesc}\n[COLUNA:done]\n[CANCELED]`.trim();
        } 
        else if (statusAction === 'postponed_today') {
            newTitle = `[ADIADO] ${newTitle}`;
            newDesc = `${newDesc}\n[COLUNA:doing]\n[POSTPONED]`.trim();
            // Implementação de mudança de data omitida por brevidade ou deve ser completa? 
            // Vou manter a paridade com o original.
        }

        const res = await fetch(`/v1/events/${eventId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                calendarId: event.calendarId || 'primary',
                summary: newTitle,
                description: newDesc,
                start: event.start,
                end: event.end
            })
        });

        if (res.ok) {
            if (window.showToast) showToast('Status atualizado com sucesso!', 'success');
            refreshEvents();
        }
    } catch (e) {
        console.error('Error updating status via modal', e);
    } finally {
        setTimeout(processStatusQueue, 1000);
    }
}

// Global Exports
window.queueStatusCheck = queueStatusCheck;
window.processStatusQueue = processStatusQueue;
window.answerStatusModal = answerStatusModal;
