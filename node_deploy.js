const Client = require('ssh2-sftp-client');
const { Client: SSHClient } = require('ssh2');
const fs = require('fs');

const config = {
    host: '10.11.85.184',
    port: 22,
    username: 'hotspot',
    password: '22101844',
    readyTimeout: 20000,
};

const localZipPath = './deploy_package.zip';
const remoteZipPath = '/tmp/deploy_package.zip';
const targetDir = '/home/hotspot/AgendaBot';

async function deploy() {
    const sftp = new Client();
    try {
        console.log('🔗 Connecting to SFTP...');
        await sftp.connect(config);
        
        console.log(`📤 Uploading ${localZipPath} to ${remoteZipPath}...`);
        await sftp.put(localZipPath, remoteZipPath);
        console.log('✅ Upload complete.');
        
        await sftp.end();

        console.log('🔗 Connecting to SSH for execution...');
        const conn = new SSHClient();
        conn.on('ready', () => {
            console.log('✅ SSH Client :: ready');
            const cmd = `mkdir -p ${targetDir} && unzip -o ${remoteZipPath} -d ${targetDir} && cd ${targetDir} && chmod +x scripts/start.sh && ./scripts/start.sh`;
            console.log(`🏃 Executing: ${cmd}`);
            
            conn.exec(cmd, (err, stream) => {
                if (err) throw err;
                stream.on('close', (code, signal) => {
                    console.log(`🏁 Stream :: close :: code: ${code}, signal: ${signal}`);
                    conn.end();
                }).on('data', (data) => {
                    console.log('STDOUT: ' + data);
                }).stderr.on('data', (data) => {
                    console.error('STDERR: ' + data);
                });
            });
        }).on('error', (err) => {
             console.error('❌ SSH Connection Error:', err);
        }).connect(config);

    } catch (err) {
        console.error('❌ Error during deployment:', err);
        sftp.end();
    }
}

deploy();
