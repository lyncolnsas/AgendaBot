module.exports = {
  apps: [
    {
      name: 'agendabot',
      script: './dist/api/index.js',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=512',
      max_memory_restart: '600M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      log_date_format: "YYYY-MM-DD HH:mm Z",
      error_file: '/var/log/agendabot-err.log',
      out_file: '/var/log/agendabot-out.log',
      merge_logs: true
    }
  ]
};
