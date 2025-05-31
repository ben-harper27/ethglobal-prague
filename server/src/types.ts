export interface Bid {
  bidder: string;
  amount: bigint;
  timestamp: number;
}

export interface Auction {
  id: string;
  seller: string;
  startingPrice: bigint;
  currentPrice: bigint;
  highestBidder: string | null;
  endTime: number;
  status: 'active' | 'ended' | 'finalizing';
  bids: Bid[];
  appSessionId?: string;
}

export interface CreateAuctionRequest {
  seller: string;
  startingPrice: string;
  duration: number;
}

export interface PlaceBidRequest {
  bidder: string;
  amount: string;
}

export interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timeout?: NodeJS.Timeout;
} 