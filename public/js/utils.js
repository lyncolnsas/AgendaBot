/** Robust helper to parse Google Calendar start/end into a Date object */
function parseGoogleDate(raw) {
    if (!raw) return null;
    if (raw instanceof Date) return raw;
    if (typeof raw === 'object' && (raw.dateTime || raw.date)) return parseGoogleDate(raw.dateTime || raw.date);
    if (typeof raw === 'string' && raw.length === 10) {
        const [y, m, d] = raw.split('-').map(Number);
        return new Date(y, m - 1, d, 0, 0, 0, 0); 
    }
    return new Date(raw);
}

/** Helper to check if a date falls on the same calendar day as another */
function isSameDay(d1, d2) {
    if (!d1 || !d2) return false;
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

/** Helper for local YYYY-MM-DD string */
function toLocaleISO(d) {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// Google Calendar standard color IDs mapped to HEX for UI display
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

// Icon map by file extension
function getAttachmentIcon(name, mimetype) {
    const ext = (name || '').split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext) || (mimetype || '').startsWith('image/')) return '🖼️';
    if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext) || (mimetype || '').startsWith('video/')) return '🎥';
    if (['mp3', 'ogg', 'wav', 'm4a', 'aac', 'flac'].includes(ext) || (mimetype || '').startsWith('audio/')) return '🎵';
    if (['pdf'].includes(ext)) return '📄';
    if (['doc', 'docx'].includes(ext)) return '📝';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
    if (['xml', 'json', 'txt', 'log'].includes(ext)) return '📋';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '🗜️';
    return '📎';
}

// Export to window to maintain facade compatibility
window.parseGoogleDate = parseGoogleDate;
window.isSameDay = isSameDay;
window.toLocaleISO = toLocaleISO;
window.googleColorMap = googleColorMap;
window.getAttachmentIcon = getAttachmentIcon;
