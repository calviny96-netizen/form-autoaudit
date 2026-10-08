module.exports = {
  apps: [
    {
      name: "auto-audit-interview",
      cwd: "/home/oem/calendar",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3210",
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      max_memory_restart: "600M",
      restart_delay: 3000,
      exp_backoff_restart_delay: 1000,
      kill_timeout: 10000,
      time: true,
      out_file: "/home/oem/.local/share/auto-audit-interview/app-out.log",
      error_file: "/home/oem/.local/share/auto-audit-interview/app-error.log",
      merge_logs: true,
    },
  ],
};
