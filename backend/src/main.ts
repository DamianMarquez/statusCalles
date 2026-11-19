import { createServerApp } from './server-app.js';

const { app } = await createServerApp();
const host = process.env.BACKEND_HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? process.env.BACKEND_PORT ?? 3000);

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exit(1);
}
