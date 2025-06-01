/**
 * WebSocket server configuration
 */
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

// Load environment variables
dotenv.config();

// Define error message type
interface ErrorMessage {
  type: 'error';
  code: string;
  msg: string;
}

// Define ping message type
interface PingMessage {
  type: 'ping';
}

type WSMessage = ErrorMessage | PingMessage;

/**
 * Creates a new WebSocket server
 * @returns {WebSocketServer} The WebSocket server instance
 */
export function createWebSocketServer(): WebSocketServer {
  const port = parseInt(process.env.PORT || '8080', 10);
  logger.system(`Creating WebSocket server on port ${port}`);
  
  return new WebSocketServer({ 
    host: '0.0.0.0', 
    port 
  });
}

/**
 * Utility function to send an error message
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} code - Error code
 * @param {string} msg - Error message
 */
export function sendError(ws: WebSocket, code: string, msg: string): void {
  const errorMessage: ErrorMessage = {
    type: 'error',
    code,
    msg
  };
  ws.send(JSON.stringify(errorMessage));
}

/**
 * Starts a ping interval to keep connections alive
 * @param {WebSocketServer} wss - The WebSocket server instance
 * @param {number} interval - Ping interval in milliseconds (default: 30000)
 * @returns {NodeJS.Timeout} The interval timer
 */
export function startPingInterval(wss: WebSocketServer, interval: number = 30000): NodeJS.Timeout {
  return setInterval(() => {
    wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        const pingMessage: PingMessage = { type: 'ping' };
        client.send(JSON.stringify(pingMessage));
      }
    });
  }, interval);
}