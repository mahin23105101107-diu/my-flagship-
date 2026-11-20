import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { getDb } from './server/db.ts';
import { seedDatabase } from './server/seed.ts';
import { createFlagShipApp, processDueScheduledChanges } from './server/app.ts';

async function bootstrap() {
  const db = getDb();
  seedDatabase(db);

  const { app, bus } = createFlagShipApp(db);

  // Process due scheduled rollouts every 15 seconds
  processDueScheduledChanges(db, bus);
  setInterval(() => {
    try {
      processDueScheduledChanges(db, bus);
    } catch (err) {
      console.error('Scheduled change processor error:', err);
    }
  }, 15_000);

  const port = Number(process.env.PORT || 3000);
  const distDir = path.resolve(process.cwd(), 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distDir);

  if (isProd) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`FlagShip Server running on http://0.0.0.0:${port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start FlagShip Server:', err);
  process.exit(1);
});
