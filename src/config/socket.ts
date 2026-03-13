import { Server as HttpServer }  from 'http';
import { Server }                from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents } from '../types';

// ─────────────────────────────────────────────
// Module-level io instance
// Exported so controllers can emit events
// without going through req.app.get('io')
// ─────────────────────────────────────────────

let io: Server<ClientToServerEvents, ServerToClientEvents>;

export function initSocket(server: HttpServer): void {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    process.env.CLIENT_URL,
  ].filter(Boolean) as string[];

  io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: {
      origin:      allowedOrigins,
      credentials: true,
      methods:     ['GET', 'POST'],
    },
  });

  io.on('connection', socket => {
    console.log(`[socket] connected: ${socket.id}`);

    // Facilitators call this after login to receive safeguarding alerts
    // Client emits: socket.emit('room:join', 'room:facilitators')
    socket.on('room:join', room => {
      socket.join(room);
      console.log(`[socket] ${socket.id} joined ${room}`);
    });

    socket.on('disconnect', () => {
      console.log(`[socket] disconnected: ${socket.id}`);
    });
  });

  console.log('✅ Socket.io initialised');
}

// ─────────────────────────────────────────────
// getIO
//
// Used in chatController to fire safeguarding
// alerts without needing req.app.get('io')
//
// Usage:
//   import { getIO } from '../config/socket';
//   getIO().to('room:facilitators').emit('safeguarding:alert', payload);
// ─────────────────────────────────────────────

export function getIO(): Server<ClientToServerEvents, ServerToClientEvents> {
  if (!io) throw new Error('Socket.io not initialised — call initSocket(server) first');
  return io;
}