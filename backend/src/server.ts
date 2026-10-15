import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';

const app = createApp(env, { prisma });

const server = app.listen(env.port, () => {
  console.info(`[server] MentorMeet API listening on port ${env.port} (${env.nodeEnv})`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.info(`[server] ${signal} received, shutting down`);
  server.close((err) => {
    prisma
      .$disconnect()
      .catch((disconnectError: unknown) =>
        console.error('[server] Error closing database connections', disconnectError),
      )
      .finally(() => {
        if (err) console.error('[server] Error during shutdown', err);
        process.exit(err ? 1 : 0);
      });
  });
  // Do not hang forever on open keep-alive connections.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
