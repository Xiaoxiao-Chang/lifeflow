import { spawn } from 'node:child_process';

const run = (command, args) => {
  const child = spawn(command, args, { stdio: 'inherit', shell: true });
  child.on('exit', (code) => {
    if (code && code !== 0) process.exitCode = code;
  });
  return child;
};

const server = run('npm', ['run', 'dev:server']);
const client = run('npm', ['run', 'dev:client', '--', '--port', '5173']);

const stop = () => {
  server.kill();
  client.kill();
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
