/**
 * Component: Main Calendar View (FullCalendar)
 */

let calendarInstance = null;

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

function renderMainCalendar(events) {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl || !window.FullCalendar) return;

    const eventsForFC = events.map(event => {
        let bgColor = '#3788d8';
        if (event.colorId && googleColorMap[event.colorId]) {
            bgColor = googleColorMap[event.colorId];
        } else if (event.calendarId) {
            const cal = (window.availableCalendars || []).find(c => c.id === event.calendarId);
            if (cal && cal.backgroundColor) bgColor = cal.backgroundColor;
        }
        return {
            id: event.id,
            title: event.summary,
            start: event.start.dateTime || event.start.date || event.start,
            end: event.end ? (event.end.dateTime || event.end.date || event.end) : (event.start.dateTime || event.start.date || event.start),
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
            if (window.openCreateModal) window.openCreateModal();
            // Pre-fill dates if possible
            const startIn = document.getElementById('event-start-date');
            if (startIn) startIn.value = info.startStr.slice(0, 10);
        },
        eventClick: function (info) {
            const eventObj = window.cachedEvents.find(e => e.id === info.event.id);
            if (eventObj && window.openEditModalFromEvent) {
                window.openEditModalFromEvent(eventObj);
            }
        }
    });

    calendarInstance.render();
}

window.renderMainCalendar = renderMainCalendar;
