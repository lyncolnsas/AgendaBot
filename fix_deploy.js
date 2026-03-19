const Client = require('ssh2-sftp-client');
const { Client: SSHClient } = require('ssh2');

const config = {
    host: '10.11.85.184',
    port: 22,
    username: 'hotspot',
    password: '22101844',
    readyTimeout: 20000,
};

async function fixDeploy() {
    const sftp = new Client();
    try {
        console.log('Uploading Dockerfile and package.json...');
        await sftp.connect(config);
        await sftp.put('./Dockerfile', '/home/hotspot/AgendaBot/Dockerfile');
        await sftp.put('./package.json', '/home/hotspot/AgendaBot/package.json');
        await sftp.end();

        console.log('Starting Docker build...');
        const conn = new SSHClient();
        conn.on('ready', () => {
            conn.exec('cd /home/hotspot/AgendaBot && sh scripts/start.sh', (err, stream) => {
                stream.on('close', (code, signal) => {
                    console.log(`\nClosed with code: ${code}`);
                    conn.end();
                })
                .on('data', data => process.stdout.write(data))
                .stderr.on('data', data => process.stderr.write(data));
            });
        }).connect(config);
    } catch (err) {
        console.error(err);
        sftp.end();
    }
}
fixDeploy();
