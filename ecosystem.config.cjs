// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'base-agent',
    script: 'index.js',
    interpreter: 'node', // Explicitly set the interpreter
    interpreter_args: '--experimental-modules', // Add this for ES modules
    env_file: '.env',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    },
    error_file: './logs/base-agent-error.log',
    out_file: './logs/base-agent-out.log',
    log_file: './logs/base-agent-combined.log',
    time: true
  }]
};
