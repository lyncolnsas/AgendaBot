const fs = require('fs');
const path = require('path');

const keyPath = path.join(__dirname, 'credentials', 'google_service_account.json');
const content = fs.readFileSync(keyPath, 'utf8');
const data = JSON.parse(content);

let key = data.private_key;
// Remove all whitespace and headers/footers to get clean base64
const body = key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

// Re-wrap at 64 chars
const wrappedBody = body.match(/.{1,64}/g).join('\n');
const fixedKey = `-----BEGIN PRIVATE KEY-----\n${wrappedBody}\n-----END PRIVATE KEY-----\n`;

data.private_key = fixedKey;
fs.writeFileSync(keyPath, JSON.stringify(data, null, 2));
console.log('Key re-wrapped successfully');
