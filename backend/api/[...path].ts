import { createServerApp } from '../dist/server-app.js';
import { createFastifyNodeHandler } from '../dist/serverless/fastify-node-handler.js';

const handler = createFastifyNodeHandler(async () => {
  const { app } = await createServerApp({ logger: false });
  return app;
});

export default handler;
