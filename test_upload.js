const fs = require('fs');
const http = require('http');

console.log('Testing upload...');
const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
const testJson = JSON.stringify({ installed: { client_id: 'test' } });

const postData = 
  `--${boundary}\r\n` +
  `Content-Disposition: form-data; name="file"; filename="test_oauth.json"\r\n` +
  `Content-Type: application/json\r\n\r\n` +
  `${testJson}\r\n` +
  `--${boundary}--\r\n`;

const req = http.request({
  hostname: 'localhost',
  port: 3001,
  path: '/api/oauth/upload',
  method: 'POST',
  headers: {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': Buffer.byteLength(postData)
  }
}, res => {
  let rawData = '';
  res.on('data', chunk => rawData += chunk);
  res.on('end', () => console.log('Response:', res.statusCode, rawData));
});

req.on('error', e => console.error('Error:', e));
req.write(postData);
req.end();
