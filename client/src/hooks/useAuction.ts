import { useState, useEffect } from 'react';
import { WalletClient } from 'viem';
import { useWebSocket } from './useWebSocket';
import type { WebSocketMessages, CreateAuctionPayload, PlaceBidPayload, SettleAuctionPayload } from '../types';

export interface AuctionState {
  title: string;
  description: string;
  startingPrice: bigint;
  endTime: Date;
  seller: string;
  status: 'active' | 'ended' | 'finalizing';
  currentBid: bigint;
  currentBidder: string | null;
  bids: Array<{
    bidder: string;
    amount: bigint;
    timestamp: number;
  }>;
}

interface UseAuctionOptions {
  auctionId: string;
  wallet: WalletClient;
  onBidPlaced?: (bid: { bidder: string; amount: bigint }) => void;
  onAuctionSettled?: (winner: string, amount: bigint) => void;
  sendMessage: (type: string, payload: unknown) => boolean;
  createSignedRequest: (method: string, params: unknown[]) => Promise<string>;
}

export function useAuction({ 
  auctionId, 
  wallet, 
  onBidPlaced, 
  onAuctionSettled,
  sendMessage,
  createSignedRequest 
}: UseAuctionOptions) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auctionState, setAuctionState] = useState<AuctionState>({
    title: "Loading...",
    description: "Loading auction details...",
    startingPrice: BigInt(0),
    endTime: new Date(),
    seller: "",
    status: 'active',
    currentBid: BigInt(0),
    currentBidder: null,
    bids: []
  });

  const { isConnected, lastMessage } = useWebSocket();

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    try {
      switch (lastMessage.type) {
        case 'auction:state':
          setAuctionState({
            title: lastMessage.title || "Untitled Auction",
            description: lastMessage.description || "No description available",
            startingPrice: BigInt(lastMessage.startingPrice || '0'),
            currentBid: BigInt(lastMessage.currentBid || '0'),
            currentBidder: lastMessage.currentBidder || null,
            endTime: new Date(lastMessage.endTime || Date.now()),
            seller: lastMessage.seller || "",
            status: (lastMessage.status as 'active' | 'ended' | 'finalizing') || 'active',
            bids: (lastMessage.bids || []).map(bid => ({
              bidder: bid.bidder,
              amount: BigInt(bid.amount),
              timestamp: new Date(bid.timestamp).getTime()
            }))
          });
          setIsLoading(false);
          break;

        case 'auction:bid':
          if (lastMessage.payload) {
            const bid = {
              bidder: lastMessage.payload.bidder,
              amount: BigInt(lastMessage.payload.bidAmount)
            };
            onBidPlaced?.(bid);
          }
          break;

        case 'auction:settled':
          if (lastMessage.winner && lastMessage.finalPrice) {
            setAuctionState(prev => ({ ...prev, status: 'ended' }));
            onAuctionSettled?.(lastMessage.winner, BigInt(lastMessage.finalPrice));
          }
          break;

        case 'error':
          if (lastMessage.error) {
            setError(lastMessage.error.msg);
          }
          break;
      }
    } catch (err) {
      console.error('Error processing WebSocket message:', err);
      setError('Error processing auction update');
    }
  }, [lastMessage, onBidPlaced, onAuctionSettled]);

  // Request initial auction state
  useEffect(() => {
    const getAuctionState = async () => {
      try {
        const request = await createSignedRequest('get_auction_state', [auctionId]);
        sendMessage('auction:getState', { request });
      } catch (err) {
        setError('Failed to get auction state');
        console.error('Error getting auction state:', err);
      }
    };

    if (isConnected) {
      getAuctionState();
    }
  }, [auctionId, isConnected, createSignedRequest, sendMessage]);

  const placeBid = async (amount: bigint) => {
    if (!wallet.account) {
      throw new Error('Wallet not connected');
    }

    if (amount <= auctionState.currentBid) {
      throw new Error('Bid must be higher than current bid');
    }

    const request = await createSignedRequest('place_bid', [auctionId, amount.toString()]);
    const success = sendMessage('auction:bid', { request });

    if (!success) {
      throw new Error('Failed to place bid');
    }
  };

  const settleAuction = async () => {
    if (!wallet.account) {
      throw new Error('Wallet not connected');
    }

    if (wallet.account.address !== auctionState.seller) {
      throw new Error('Only the seller can settle the auction');
    }

    const request = await createSignedRequest('settle_auction', [auctionId]);
    const success = sendMessage('auction:settle', { request });

    if (!success) {
      throw new Error('Failed to settle auction');
    }
  };

  return {
    isConnected,
    isLoading,
    error,
    auctionState,
    placeBid,
    settleAuction,
    isSeller: wallet.account?.address === auctionState.seller
  };
} 