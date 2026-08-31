import { createApp } from './app.js';
import { CONFIG } from './config/index.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';

async function startServer() {
  try {
    // Optionally run migrations and seed on startup if configured
    if (process.env.AUTO_MIGRATE === 'true') {
      await runMigrations();
      await seedDatabase();
    }

    const app = createApp();
    app.listen(CONFIG.PORT, () => {
      console.log(`[FlyRank Metering Engine] Server running on http://localhost:${CONFIG.PORT}`);
    });
  } catch (err) {
    console.error('[FlyRank Metering Engine] Server startup error:', err);
    process.exit(1);
  }
}

startServer();
