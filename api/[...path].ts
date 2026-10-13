import { createServerApp } from '../backend/dist/server-app.js';
import { createFastifyNodeHandler } from '../backend/dist/serverless/fastify-node-handler.js';

const handler = createFastifyNodeHandler(async () => {
  const { app } = await createServerApp({ logger: false });
  return app;
});

export default handler;
