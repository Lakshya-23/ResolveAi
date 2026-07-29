import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';

import { config } from './config';
import { createLogger } from './services/logging.service';
import { initDatabase, closeDatabase } from './services/persistence.service';
import { initSocketServer } from './services/socket.service';
import { errorMiddleware } from './middleware/error.middleware';

// Routes
import healthRoutes from './routes/health.routes';
import authRoutes from './routes/auth.routes';
import repositoryRoutes from './routes/repository.routes';
import sessionRoutes from './routes/session.routes';

const log = createLogger('Server');

// ─── Express App ───
const app = express();
const httpServer = createServer(app);

// ─── Middleware ───
app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('short', {
  stream: { write: (message: string) => log.info(message.trim(), { component: 'HTTP' }) },
}));

// ─── Routes ───
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/repositories', repositoryRoutes);
app.use('/api/sessions', sessionRoutes);

// ─── Error Handler (must be last) ───
app.use(errorMiddleware);

// ─── Initialize Services ───
initDatabase();
initSocketServer(httpServer);

// ─── Start Server ───
httpServer.listen(config.port, () => {
  log.info(`ResolvAI backend running on port ${config.port}`, {
    env: config.nodeEnv,
    litellm: config.litellm.baseUrl,
    cors: config.corsOrigin,
  });
});

// ─── Graceful Shutdown ───
function shutdown(signal: string) {
  log.info(`Received ${signal}, shutting down gracefully...`);
  closeDatabase();
  httpServer.close(() => {
    log.info('Server closed');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;
