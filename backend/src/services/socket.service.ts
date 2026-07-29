import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { config } from '../config';
import { createLogger } from './logging.service';

const log = createLogger('SocketService');

let io: SocketIOServer | null = null;

/**
 * Initialize Socket.IO server attached to the HTTP server.
 */
export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.corsOrigin,
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket: Socket) => {
    log.info('Client connected', { socketId: socket.id });

    // Join a session-specific room for targeted updates
    socket.on('join:session', (sessionId: string) => {
      socket.join(`session:${sessionId}`);
      log.info('Client joined session room', { socketId: socket.id, sessionId });
    });

    socket.on('leave:session', (sessionId: string) => {
      socket.leave(`session:${sessionId}`);
      log.info('Client left session room', { socketId: socket.id, sessionId });
    });

    socket.on('disconnect', () => {
      log.info('Client disconnected', { socketId: socket.id });
    });
  });

  log.info('Socket.IO server initialized');
  return io;
}

/**
 * Emit an event to all clients in a specific session room.
 */
export function emitToSession(sessionId: string, event: string, data: unknown): void {
  if (!io) {
    log.warn('Socket.IO not initialized, cannot emit event', { event, sessionId });
    return;
  }
  io.to(`session:${sessionId}`).emit(event, data);
}

/**
 * Emit an event to all connected clients.
 */
export function emitToAll(event: string, data: unknown): void {
  if (!io) {
    log.warn('Socket.IO not initialized, cannot emit event', { event });
    return;
  }
  io.emit(event, data);
}

/**
 * Get the Socket.IO server instance.
 */
export function getIO(): SocketIOServer | null {
  return io;
}
