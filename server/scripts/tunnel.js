const { spawn } = require('node:child_process');

function runTunnel() {
  console.log('[Tunnel] Spawning localtunnel...');
  const proc = spawn('cmd.exe', ['/c', 'npx', '--yes', 'localtunnel', '--port', '4534'], {
    stdio: 'inherit'
  });

  proc.on('close', (code) => {
    console.log(`[Tunnel] Exited with code ${code}. Restarting in 3s...`);
    setTimeout(runTunnel, 3000);
  });
}

runTunnel();
