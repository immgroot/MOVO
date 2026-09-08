import { mkdirSync } from 'node:fs';
import { startProdServer } from 'vinext/server/prod-server';
import { createGameService } from './service';
import { createAccountService, attachAccounts } from './auth';
mkdirSync('.data', { recursive: true });
const accounts = await createAccountService();
const { server } = await startProdServer({
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
});
const game = createGameService({
  httpServer: server,
  database: process.env.MOVO_DB ?? '.data/movo.sqlite',
  origin: process.env.MOVO_ORIGIN,
});
attachAccounts(server, accounts);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void game.close().then(() => {
      accounts.close();
      process.exit(0);
    });
  });
