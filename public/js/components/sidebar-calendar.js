let sidebarCalendar = null;

function initSidebarCalendar() {
    const calendarEl = document.getElementById('sidebar-calendar');
    if (!calendarEl || !window.FullCalendar) {
        console.warn('[AgendaBot] sidebar-calendar element or FullCalendar library missing.');
        return;
    }

    sidebarCalendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'pt-br',
        headerToolbar: false,
        dayHeaderFormat: { weekday: 'narrow' },
        height: 'auto',
        selectable: true,
        unselectAuto: false,
        dateClick: function(info) {
            if (window.selectedDateFilter === info.dateStr) {
                clearDateFilter();
            } else {
                window.selectedDateFilter = info.dateStr;
                
                document.querySelectorAll('#sidebar-calendar .fc-daygrid-day').forEach(el => {
                    el.classList.remove('selected-day');
                });
                info.dayEl.classList.add('selected-day');
                
                if (window.filterAndRenderEvents) window.filterAndRenderEvents();
            }
        },
        dayCellDidMount: function(arg) {
            if (window.selectedDateFilter && arg.dateStr === window.selectedDateFilter) {
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
        const todayStr = toLocaleISO(new Date());
        window.selectedDateFilter = todayStr;
        if (window.filterAndRenderEvents) window.filterAndRenderEvents();
    }
}

function clearDateFilter() {
    window.selectedDateFilter = null;
    document.querySelectorAll('#sidebar-calendar .fc-daygrid-day').forEach(el => {
        el.classList.remove('selected-day');
    });
    if (window.filterAndRenderEvents) window.filterAndRenderEvents();
}

// Global Exports
window.initSidebarCalendar = initSidebarCalendar;
window.prevMonth = prevMonth;
window.nextMonth = nextMonth;
window.goToday = goToday;
window.clearDateFilter = clearDateFilter;
