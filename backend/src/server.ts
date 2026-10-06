import 'dotenv/config';
import { buildApp } from './app/build-app.js';

const app = buildApp();
const host = process.env.BACKEND_HOST ?? '0.0.0.0';
const port = Number(process.env.BACKEND_PORT ?? 3000);

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
