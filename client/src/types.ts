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

export interface WebSocketMessages {
  type: string;
  title?: string;
  description?: string;
  startingPrice?: string;
  currentBid?: string;
  currentBidder?: string;
  endTime?: string;
  seller?: string;
  status?: 'active' | 'ended' | 'finalizing';
  bids?: Array<{
    bidder: string;
    amount: string;
    timestamp: string;
  }>;
  payload?: {
    bidder: string;
    bidAmount: string;
  };
  winner?: string;
  finalPrice?: string;
  error?: {
    msg: string;
  };
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

export interface JoinRoomPayload {
  auctionId: string;
  address: string;
}

export interface MovePayload {
  auctionId: string;
  bidAmount: string;
}
