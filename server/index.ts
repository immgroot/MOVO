import { mkdirSync } from 'node:fs';
import { createGameService } from './service';
import { createAccountService, attachAccounts } from './auth';
mkdirSync('.data', { recursive: true });
const accounts = await createAccountService();
const service = createGameService({
  database: process.env.MOVO_DB ?? '.data/movo.sqlite',
  origin: process.env.MOVO_ORIGIN,
});
attachAccounts(service.http, accounts);
await service.listen(
  Number(process.env.MOVO_PORT ?? 3001),
  process.env.MOVO_HOST ?? '127.0.0.1',
);
console.log('MOVO authoritative game server: http://127.0.0.1:3001');
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void service.close().then(() => {
      accounts.close();
      process.exit(0);
    });
  });
