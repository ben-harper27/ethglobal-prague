// WebSocket Message Types

export interface Bid {
  bidder: string;
  amount: string;
  timestamp: number;
}

export interface Auction {
  id: string;
  seller: string;
  startingPrice: string;
  currentPrice: string;
  highestBidder: string | null;
  endTime: number;
  status: 'active' | 'ended' | 'finalizing';
  bids: Bid[];
  appSessionId?: string;
}

export interface CreateAuctionPayload {
  auctionId: string;
  seller: string;
  startingPrice: string;
}

export interface PlaceBidPayload {
  auctionId: string;
  bidder: string;
  bidAmount: string;
}

export interface SettleAuctionPayload {
  auctionId: string;
  seller: string;
}

export type WebSocketMessages = {
  type: 'auction:create' | 'auction:bid' | 'auction:settle' | 'auction:getState' | 'auction:state' | 'auction:settled' | 'error' | 'onlineUsers';
  payload?: CreateAuctionPayload | PlaceBidPayload | SettleAuctionPayload;
  auctionId?: string;
  title?: string;
  description?: string;
  startingPrice?: string;
  currentBid?: string;
  currentBidder?: string;
  seller?: string;
  endTime?: Date;
  status?: string;
  bids?: Bid[];
  winner?: string;
  finalPrice?: string;
  count?: number;
  error?: {
    code: string;
    msg: string;
  };
}

export interface JoinRoomPayload {
  auctionId: string;
  address: string;
}

export interface MovePayload {
  auctionId: string;
  bidAmount: string;
}
