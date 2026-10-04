#!/usr/bin/env node

/**
 * Render All-in-One Backend Orchestrator
 *
 * Runs all banking microservices within a single Render Web Service container:
 * - Automatically applies Prisma database migrations on startup.
 * - Boots Auth Service (port 3001).
 * - Boots Account Service (port 3002).
 * - Boots Transfer Service (port 3003).
 * - Boots API Gateway on Render's assigned $PORT (defaults to 3000 or 10000).
 * - Gracefully coordinates lifecycle and forward termination signals.
 */

import { spawn, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('🚀 [Render Orchestrator] Initializing Banking Platform backend...');

// 1. Run Database Migrations if DATABASE_URL is provided
if (process.env.DATABASE_URL) {
  console.log('📦 [Render Orchestrator] Running Prisma database migrations...');
  try {
    execSync('npx prisma migrate deploy --schema=./prisma/schema.prisma', {
      cwd: rootDir,
      stdio: 'inherit',
      env: process.env,
    });
    console.log('✅ [Render Orchestrator] Database migrations applied successfully.');
  } catch (err) {
    console.warn('⚠️ [Render Orchestrator] Migration deploy notice: Continuing with schema push fallback if needed...');
    try {
      execSync('npx prisma db push --schema=./prisma/schema.prisma --accept-data-loss', {
        cwd: rootDir,
        stdio: 'inherit',
        env: process.env,
      });
      console.log('✅ [Render Orchestrator] Database schema synchronized.');
    } catch (e) {
      console.error('❌ [Render Orchestrator] Database synchronization failed:', e.message);
    }
  }
} else {
  console.warn('⚠️ [Render Orchestrator] DATABASE_URL not set! Skipping database migration.');
}

const processes = [];

function startService(name, cwd, customEnv = {}) {
  console.log(`⏳ [Render Orchestrator] Spawning ${name}...`);
  const child = spawn('node', ['dist/index.js'], {
    cwd: path.resolve(rootDir, cwd),
    stdio: 'inherit',
    env: {
      ...process.env,
      ...customEnv,
    },
  });

  child.on('error', (err) => {
    console.error(`❌ [${name}] Process error:`, err);
  });

  child.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`⚠️ [${name}] Exited with code ${code} (signal: ${signal})`);
    }
  });

  processes.push({ name, child });
  return child;
}

// 2. Start internal microservices on local loopback ports
startService('auth-service', 'apps/auth-service', {
  AUTH_SERVICE_PORT: '3001',
});

startService('account-service', 'apps/account-service', {
  ACCOUNT_SERVICE_PORT: '3002',
});

startService('transfer-service', 'apps/transfer-service', {
  TRANSFER_SERVICE_PORT: '3003',
});

// Wait 2 seconds for internal services to bind before starting the Gateway
setTimeout(() => {
  const publicPort = process.env.PORT || process.env.API_GATEWAY_PORT || '3000';
  console.log(`🌐 [Render Orchestrator] Starting API Gateway on public port ${publicPort}...`);

  const gateway = startService('api-gateway', 'apps/api-gateway', {
    PORT: publicPort,
    API_GATEWAY_PORT: publicPort,
    AUTH_SERVICE_URL: 'http://127.0.0.1:3001',
    ACCOUNT_SERVICE_URL: 'http://127.0.0.1:3002',
    TRANSFER_SERVICE_URL: 'http://127.0.0.1:3003',
  });

  gateway.on('exit', (code) => {
    console.log(`API Gateway exited with code ${code}. Shutting down all services.`);
    shutdown(code || 0);
  });
}, 2000);

// Graceful shutdown handling
function shutdown(exitCode = 0) {
  console.log('🛑 [Render Orchestrator] Shutting down all services...');
  for (const { name, child } of processes) {
    try {
      child.kill('SIGTERM');
    } catch {}
  }
  setTimeout(() => process.exit(exitCode), 1000);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
