/**
 * WebSocket server for Nitro Aura Auction System
 */

import { createWebSocketServer, sendError, startPingInterval } from './config/websocket.js';
import { initializeRPCClient } from './services/index.js';
import logger from './utils/logger.js';
import { 
  createAuctionSession,
  updateAuctionBid,
  settleAuctionSession,
  getAuctionSession,
  hasAuctionSession,
  createDefaultAuction
} from './services/appSessions.js';
import { WebSocket } from 'ws';

// Define types
interface Connection {
  ws: WebSocket;
  auctionId: string;
}

interface CreateAuctionPayload {
  auctionId: string;
  seller: string;
  startingPrice: string;
}

interface PlaceBidPayload {
  auctionId: string;
  bidder: string;
  bidAmount: string;
}

interface SettleAuctionPayload {
  auctionId: string;
  seller: string;
}

interface HandlerContext {
  connections: Map<string, Connection>;
  sendError: (ws: WebSocket, code: string, msg: string) => void;
}

// Create WebSocket server
const wss = createWebSocketServer();

// Track active connections
const connections = new Map<string, Connection>();

// Track online users count
let onlineUsersCount = 0;

/**
 * Handles creating a new auction
 */
async function handleCreateAuction(
  ws: WebSocket, 
  payload: CreateAuctionPayload, 
  { connections, sendError }: HandlerContext
) {
  if (!payload || typeof payload !== 'object') {
    return sendError(ws, 'INVALID_PAYLOAD', 'Invalid payload format');
  }

  const { auctionId, seller, startingPrice } = payload;

  if (!auctionId || !seller || !startingPrice) {
    return sendError(ws, 'INVALID_PAYLOAD', 'Auction ID, seller address, and starting price are required');
  }

  try {
    // Create auction session
    const appId = await createAuctionSession(auctionId, seller, startingPrice);
    
    logger.nitro(`Created auction session with ID ${appId} for auction ${auctionId}`);
    
    // Store connection
    connections.set(seller, { ws, auctionId });
    
    // Send confirmation to seller
    ws.send(JSON.stringify({
      type: 'auction:created',
      auctionId,
      appId,
      startingPrice
    }));
    
  } catch (error) {
    logger.error(`Error creating auction ${auctionId}:`, error);
    return sendError(ws, 'AUCTION_CREATE_ERROR', error instanceof Error ? error.message : 'Failed to create auction');
  }
}

/**
 * Handles a new bid on an auction
 */
async function handlePlaceBid(
  ws: WebSocket, 
  payload: PlaceBidPayload, 
  { connections, sendError }: HandlerContext
) {
  if (!payload || typeof payload !== 'object') {
    return sendError(ws, 'INVALID_PAYLOAD', 'Invalid payload format');
  }

  const { auctionId, bidder, bidAmount } = payload;

  if (!auctionId || !bidder || !bidAmount) {
    return sendError(ws, 'INVALID_PAYLOAD', 'Auction ID, bidder address, and bid amount are required');
  }

  try {
    // Check if auction exists
    if (!hasAuctionSession(auctionId)) {
      return sendError(ws, 'AUCTION_NOT_FOUND', 'Auction not found');
    }

    // Get current auction state
    const auction = getAuctionSession(auctionId);
    if (!auction) {
      return sendError(ws, 'AUCTION_NOT_FOUND', 'Auction not found');
    }

    // Validate bid amount is higher than current bid
    if (BigInt(bidAmount) <= BigInt(auction.currentBid)) {
      return sendError(ws, 'INVALID_BID', 'Bid must be higher than current bid');
    }

    // Update auction with new bid
    const success = await updateAuctionBid(auctionId, bidder, bidAmount);
    
    if (!success) {
      return sendError(ws, 'BID_FAILED', 'Failed to place bid');
    }

    // Store bidder connection
    connections.set(bidder, { ws, auctionId });

    // Broadcast bid update to all connected clients
    const updatedAuction = getAuctionSession(auctionId);
    if (updatedAuction) {
      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({
            type: 'auction:bidPlaced',
            auctionId,
            currentBidder: updatedAuction.currentBidder,
            currentBid: updatedAuction.currentBid
          }));
        }
      });
    }

  } catch (error) {
    logger.error(`Error placing bid for auction ${auctionId}:`, error);
    return sendError(ws, 'BID_ERROR', error instanceof Error ? error.message : 'Failed to place bid');
  }
}

/**
 * Handles settling an auction
 */
async function handleSettleAuction(
  ws: WebSocket, 
  payload: SettleAuctionPayload, 
  { connections, sendError }: HandlerContext
) {
  if (!payload || typeof payload !== 'object') {
    return sendError(ws, 'INVALID_PAYLOAD', 'Invalid payload format');
  }

  const { auctionId, seller } = payload;

  if (!auctionId || !seller) {
    return sendError(ws, 'INVALID_PAYLOAD', 'Auction ID and seller address are required');
  }

  try {
    // Check if auction exists
    const auction = getAuctionSession(auctionId);
    if (!auction) {
      return sendError(ws, 'AUCTION_NOT_FOUND', 'Auction not found');
    }

    // Verify sender is the seller
    if (auction.seller !== seller) {
      return sendError(ws, 'NOT_AUTHORIZED', 'Only the seller can settle the auction');
    }

    // Settle the auction
    const success = await settleAuctionSession(auctionId);
    
    if (!success) {
      return sendError(ws, 'SETTLEMENT_FAILED', 'Failed to settle auction');
    }

    // Broadcast auction settled to all connected clients
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({
          type: 'auction:settled',
          auctionId,
          winner: auction.currentBidder,
          finalPrice: auction.currentBid
        }));
      }
    });

  } catch (error) {
    logger.error(`Error settling auction ${auctionId}:`, error);
    return sendError(ws, 'SETTLEMENT_ERROR', error instanceof Error ? error.message : 'Failed to settle auction');
  }
}

/**
 * Handles getting auction state
 */
async function handleGetAuctionState(ws: WebSocket, payload: { auctionId: string }, { sendError }: HandlerContext) {
  if (!payload || typeof payload !== 'object') {
    return sendError(ws, 'INVALID_PAYLOAD', 'Invalid payload format');
  }

  const { auctionId } = payload;

  if (!auctionId) {
    return sendError(ws, 'INVALID_PAYLOAD', 'Auction ID is required');
  }

  try {
    // Get auction state
    const auction = getAuctionSession(auctionId);
    if (!auction) {
      return sendError(ws, 'AUCTION_NOT_FOUND', 'Auction not found');
    }

    // Send auction state to client
    ws.send(JSON.stringify({
      type: 'auction:state',
      auctionId,
      title: "Limited Edition Digital Art Collection", 
      description: "A curated collection of unique digital artworks from renowned artists. Each piece is authenticated on the blockchain and comes with exclusive viewing rights.",
      startingPrice: auction.currentBid,
      currentBid: auction.currentBid,
      currentBidder: auction.currentBidder,
      seller: auction.seller,
      endTime: new Date(auction.createdAt + 24 * 60 * 60 * 1000), // 24 hours from creation
      status: 'active',
      bids: [] // In real app, get from auction history
    }));

  } catch (error) {
    logger.error(`Error getting auction state for auction ${auctionId}:`, error);
    return sendError(ws, 'STATE_ERROR', error instanceof Error ? error.message : 'Failed to get auction state');
  }
}

// Function to broadcast online users count to all clients
const broadcastOnlineUsersCount = () => {
  const message = JSON.stringify({
    type: 'onlineUsers',
    count: onlineUsersCount
  });
  
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
  
  logger.ws(`Broadcasting online users count: ${onlineUsersCount}`);
};

// Create context object to share between route handlers
const context: HandlerContext = {
  connections,
  sendError: (ws: WebSocket, code: string, msg: string) => sendError(ws, code, msg)
};

interface WebSocketMessage {
  type: string;
  payload: CreateAuctionPayload | PlaceBidPayload | SettleAuctionPayload;
}

wss.on('connection', (ws: WebSocket) => {
  logger.ws('Client connected');
  
  // Increment online users count and broadcast to all clients
  onlineUsersCount++;
  broadcastOnlineUsersCount();
  
  // Handle client messages
  ws.on('message', async (message: Buffer) => {
    let data: WebSocketMessage;
    try {
      const messageStr = message.toString();
      logger.ws(`Received message: ${messageStr}`);
      data = JSON.parse(messageStr);
    } catch (e) {
      return sendError(ws, 'INVALID_JSON', 'Invalid JSON format');
    }

    // Process message based on type
    try {
      switch (data.type) {
        case 'auction:create':
          await handleCreateAuction(ws, data.payload as CreateAuctionPayload, context);
          break;
        case 'auction:bid':
          await handlePlaceBid(ws, data.payload as PlaceBidPayload, context);
          break;
        case 'auction:settle':
          await handleSettleAuction(ws, data.payload as SettleAuctionPayload, context);
          break;
        case 'auction:getState':
          await handleGetAuctionState(ws, data.payload as { auctionId: string }, context);
          break;
        default:
          logger.ws(`Invalid message type: ${data.type}`);
          sendError(ws, 'INVALID_MESSAGE_TYPE', 'Invalid message type');
      }
    } catch (error) {
      logger.error(`Error handling message type ${data.type}:`, error);
      sendError(ws, 'INTERNAL_ERROR', 'An internal error occurred');
    }
  });

  // Handle disconnection
  ws.on('close', () => {
    // Remove the connection from our tracking
    for (const [address, connection] of connections.entries()) {
      if (connection.ws === ws) {
        connections.delete(address);
        break;
      }
    }
    
    // Decrement online users count and broadcast to all clients
    onlineUsersCount = Math.max(0, onlineUsersCount - 1);
    broadcastOnlineUsersCount();
    
    logger.ws('Client disconnected');
  });
});

// Initialize Nitrolite client when server starts
async function initializeNitroliteServices() {
  try {
    logger.nitro('Initializing Nitrolite services...');
    await initializeRPCClient();
    logger.nitro('Nitrolite RPC client initialized successfully');

    // Create default auction
    const defaultAuctionId = await createDefaultAuction();
    logger.system(`Created default auction with ID: ${defaultAuctionId}`);
    
  } catch (error) {
    logger.error('Failed to initialize Nitrolite services:', error);
    logger.system('Continuing in mock mode without Nitrolite channel');
  }
}

// Start server
const port = process.env.PORT || 8080;
logger.system(`WebSocket server starting on port ${port}`);

// Initialize Nitrolite client
initializeNitroliteServices().then(() => {
  logger.system('Server initialization complete');
}).catch(error => {
  logger.error('Server initialization failed:', error);
});

// Start keepalive mechanism
startPingInterval(wss);

// Broadcast online users count periodically
setInterval(() => {
  broadcastOnlineUsersCount();
}, 30000);