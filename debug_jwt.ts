import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

async function testJWT() {
    const keyPath = path.join(process.cwd(), 'credentials', 'google_service_account.json');
    console.log('Testing with key:', keyPath);
    
    if (!fs.existsSync(keyPath)) {
        console.error('File not found!');
        return;
    }

    try {
        const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        
        // Sanitize like we do in the app
        if (keyData.private_key && keyData.private_key.includes('\\n')) {
            console.log('Fixing literal \\n');
            keyData.private_key = keyData.private_key.replace(/\\n/g, '\n');
        }

        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: keyData.client_email,
                private_key: keyData.private_key,
            },
            scopes: ['https://www.googleapis.com/auth/calendar'],
        });

        console.log('Getting access token...');
        const client = await auth.getClient();
        const token = await client.getAccessToken();
        console.log('SUCCESS! Access token retrieved.');
        
        const calendar = google.calendar({ version: 'v3', auth });
        console.log('Fetching calendar list...');
        const list = await calendar.calendarList.list();
        console.log('Found', list.data.items?.length || 0, 'calendars.');
    } catch (e: any) {
        console.error('FAILED:', e.message);
        if (e.stack) console.error(e.stack);
    }
}

testJWT();
