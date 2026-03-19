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

        const startDate = new Date(startRaw);
        const endDate = new Date(endRaw);

        // Calculate Meeting Hours
        if (typeof startRaw === 'string' && startRaw.includes('T')) {
            const diffMs = endDate - startDate;
            if (diffMs > 0) {
                totalMinutes += diffMs / 60000;
            }
        }

        const title = (event.summary || "").toLowerCase();
        const description = (event.description || "").toLowerCase();

        const isCanceled = title.includes('cancelado') || description.includes('cancelado');
        const isPostponed = title.includes('adiado') || description.includes('adiado') || title.includes('remarcado') || description.includes('remarcado');
        
        if (isCanceled) {
            canceledCount++;
        } else if (isPostponed) {
            postponedCount++;
        }
        
        if (endDate < now) {
            completedCount++;
        }

        if (startDate >= now && startDate <= next7d) {
            upcoming7dCount++;
        }
    });

    const totalHours = Math.floor(totalMinutes / 60);

    // Update UI
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };

    setVal('metric-total-events', totalEvents);
    setVal('metric-meeting-hours', `${totalHours}h`);
    setVal('metric-canceled-events', canceledCount);
    setVal('metric-postponed-events', postponedCount);
    setVal('metric-completed-events', completedCount);
    setVal('metric-upcoming-7d', upcoming7dCount);
}

// Global Export
window.updateDashboardMetrics = updateDashboardMetrics;
