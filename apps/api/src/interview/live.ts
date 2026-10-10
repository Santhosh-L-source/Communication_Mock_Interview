// Socket.IO server handle, so REST routes and jobs can message a live interview room.
import type { Server } from 'socket.io'

let io: Server | null = null
export const setIo = (server: Server) => { io = server }
export function emitToSession(sessionId: string, event: string, payload: unknown) {
  io?.to(`session:${sessionId}`).emit(event, payload)
}
export function emitToStaff(event: string, payload: unknown) {
  io?.to('staff').emit(event, payload)
}
