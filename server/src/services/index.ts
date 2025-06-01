/**
 * Services index - exports all service modules
 */

// Nitrolite RPC (WebSocket) client
export { 
  initializeRPCClient, 
  getRPCClient,
  NitroliteRPCClient, 
  WSStatus 
} from './nitroliteRPC.js';

// Auction sessions
export {
  createAuctionSession,
  updateAuctionBid,
  settleAuctionSession,
  getAuctionSession,
  hasAuctionSession,
  getAllAuctionSessions
} from './appSessions.js';
