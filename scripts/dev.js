const { networkInterfaces } = require('os');
const { spawn } = require('child_process');
const net = require('net');

const preferredPort = Number(process.env.PORT || 3000);

function getLanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter(Boolean)
    .filter((iface) => iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface.address);
}

const addresses = getLanAddresses();

function canUsePort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port, '0.0.0.0');
  });
}

async function findPort(startPort) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    if (await canUsePort(port)) {
      return port;
    }
  }

  throw new Error(`No available port found from ${startPort} to ${startPort + 19}`);
}

async function main() {
  const port = await findPort(preferredPort);

  console.log('');
  console.log('ScanSafe dev server');
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is unavailable, using ${port} instead.`);
  }
  console.log(`Local:   http://localhost:${port}`);

  if (addresses.length > 0) {
    for (const address of addresses) {
      console.log(`Network: http://${address}:${port}`);
    }
  } else {
    console.log('Network: no LAN IPv4 address found yet');
  }

  console.log('');

  const nextBin = require.resolve('next/dist/bin/next');
  const child = spawn(process.execPath, [nextBin, 'dev', '-H', '0.0.0.0', '-p', String(port)], {
    stdio: 'inherit',
    shell: false,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code || 0);
    }
  });
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
