import { createApp } from './app.js';
import { loadConfig } from './config/env.config.js';

const config = loadConfig();
const app = await createApp(config);
// SIGTERM from `docker stop` closes the app cleanly instead of being killed mid-request.
app.enableShutdownHooks();
await app.listen(config.port);
