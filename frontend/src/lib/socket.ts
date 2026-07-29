import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

let socket: Socket | null = null;

/**
 * Get or create the Socket.IO connection.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

/**
 * Connect to the WebSocket server.
 */
export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
}

/**
 * Disconnect from the WebSocket server.
 */
export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}

/**
 * Join a session room to receive targeted updates.
 */
export function joinSession(sessionId: string): void {
  getSocket().emit('join:session', sessionId);
}

/**
 * Leave a session room.
 */
export function leaveSession(sessionId: string): void {
  getSocket().emit('leave:session', sessionId);
}
