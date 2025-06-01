import { useState, useEffect } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { toast } from 'react-toastify';
import { WalletClient } from 'viem';

interface AuctionProps {
  auctionId: string;
  wallet: WalletClient;
  isAuthenticated: boolean;
  connectionStatus: string;
}

interface AuctionState {
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

// Helper functions for USDC decimal handling (6 decimals internally, display 2)
const formatUSDC = (amount: bigint): string => {
  const amountStr = amount.toString().padStart(7, '0');
  const dollars = amountStr.slice(0, -6) || '0';
  const cents = amountStr.slice(-6, -4).padEnd(2, '0');  // Only take first 2 decimal places
  return `${dollars}.${cents}`;
};

const parseUSDC = (amount: string): bigint => {
  try {
    // Handle empty or invalid input
    if (!amount || isNaN(Number(amount))) {
      return BigInt(0);
    }
    
    // Convert the number to a fixed 2 decimal place string first
    const normalizedAmount = Number(amount).toFixed(2);
    const [dollars, cents = '0'] = normalizedAmount.split('.');
    
    // Remove any commas from the dollars
    const cleanDollars = dollars.replace(/,/g, '');
    
    // Pad with zeros for USDC's 6 decimal places (adding 4 more zeros after cents)
    return BigInt(cleanDollars + cents.padEnd(2, '0') + '0000');
  } catch (error) {
    console.error('Error parsing USDC amount:', error);
    return BigInt(0);
  }
};

export default function Auction({ 
  auctionId, 
  wallet,
  isAuthenticated,
  connectionStatus
}: AuctionProps) {
  const [currentBid, setCurrentBid] = useState<string>('');
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
  
  const { isConnected, lastMessage, getAuctionState, placeBid: wsPlaceBid, settleAuction: wsSettleAuction } = useWebSocket();

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
            toast.success(`New bid placed: $${formatUSDC(bid.amount)} USDC`);
          }
          break;

        case 'auction:settled':
          if (lastMessage.winner && lastMessage.finalPrice) {
            setAuctionState(prev => ({ ...prev, status: 'ended' }));
            toast.success(`Auction ended! Winner: ${lastMessage.winner} with bid of $${formatUSDC(BigInt(lastMessage.finalPrice))} USDC`);
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
  }, [lastMessage]);

  // Request initial auction state
  useEffect(() => {
    const fetchAuctionState = async () => {
      try {
        getAuctionState(auctionId);
      } catch (err) {
        setError('Failed to get auction state');
        console.error('Error getting auction state:', err);
      }
    };

    if (isConnected) {
      fetchAuctionState();
    }
  }, [auctionId, isConnected, getAuctionState]);

  const handleBidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isAuthenticated) {
      toast.error('Please connect to ClearNode first');
      return;
    }

    try {
      const bidAmount = parseUSDC(currentBid);
      if (!bidAmount) {
        toast.error('Please enter a valid bid amount');
        return;
      }

      if (bidAmount <= auctionState.currentBid) {
        throw new Error('Bid must be higher than current bid');
      }

      wsPlaceBid({
        auctionId,
        bidder: wallet.account?.address as string,
        bidAmount: bidAmount.toString()
      });

      setCurrentBid('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to place bid');
    }
  };

  const handleSettleAuction = async () => {
    if (!isAuthenticated) {
      toast.error('Please connect to ClearNode first');
      return;
    }

    try {
      if (wallet.account?.address !== auctionState.seller) {
        throw new Error('Only the seller can settle the auction');
      }

      wsSettleAuction({
        auctionId,
        seller: wallet.account.address
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to settle auction');
    }
  };

  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-lg shadow-lg p-6 max-w-2xl mx-auto border border-gray-700">
        <div className="text-white text-center">Loading auction details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg shadow-lg p-6 max-w-2xl mx-auto border border-gray-700">
        <div className="text-red-500 text-center">{error}</div>
      </div>
    );
  }

  const isSeller = wallet.account?.address === auctionState.seller;

  return (
    <div className="bg-gray-800 rounded-lg shadow-lg p-6 max-w-2xl mx-auto border border-gray-700">
      {/* Connection Status */}
      <div className={`mb-4 text-sm ${isConnected && isAuthenticated ? 'text-green-500' : 'text-red-500'}`}>
        {connectionStatus} {isAuthenticated ? '(Authenticated)' : ''}
      </div>

      {/* Auction Details */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2 text-white">{auctionState.title}</h2>
        <p className="text-gray-300 mb-4">{auctionState.description}</p>
        <div className="flex justify-between items-center">
          <p className="text-lg text-gray-200">
            Starting Price: ${formatUSDC(auctionState.startingPrice)} USDC
          </p>
          <p className="text-lg text-gray-200">
            Ends: {auctionState.endTime.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Current Highest Bid */}
      <div className="mb-8 p-4 bg-gray-700 rounded-lg border border-gray-600">
        <h3 className="text-xl font-semibold mb-2 text-white">Current Highest Bid</h3>
        <p className="text-2xl text-blue-400">
          ${formatUSDC(auctionState.currentBid)} USDC
        </p>
        {auctionState.currentBidder && (
          <p className="text-sm text-gray-400 mt-1">
            by {auctionState.currentBidder.slice(0, 6)}...{auctionState.currentBidder.slice(-4)}
          </p>
        )}
      </div>

      {/* Bid Form - Only show if auction is active, user is authenticated, and not the seller */}
      {auctionState.status === 'active' && isAuthenticated && !isSeller && (
        <form onSubmit={handleBidSubmit} className="mb-8">
          <div className="flex gap-4">
            <input
              type="number"
              step="0.01"
              value={currentBid}
              onChange={(e) => setCurrentBid(e.target.value)}
              placeholder="Enter bid amount in USDC"
              className="flex-1 p-2 border rounded bg-gray-700 text-white placeholder-gray-400 border-gray-600 focus:outline-none focus:border-blue-500"
              required
            />
            <button
              type="submit"
              disabled={!isConnected || !isAuthenticated}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors duration-200 disabled:bg-gray-600"
            >
              Place Bid
            </button>
          </div>
        </form>
      )}

      {/* Settle Button - Only show if auction is active, user is authenticated, and is the seller */}
      {auctionState.status === 'active' && isAuthenticated && isSeller && (
        <button
          onClick={handleSettleAuction}
          disabled={!isConnected || !isAuthenticated}
          className="w-full mb-8 bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 transition-colors duration-200 disabled:bg-gray-600"
        >
          Settle Auction
        </button>
      )}

      {/* Bid History */}
      <div>
        <h3 className="text-xl font-semibold mb-4 text-white">Bid History</h3>
        <div className="space-y-4">
          {auctionState.bids.map((bid, index) => (
            <div
              key={index}
              className="flex justify-between items-center p-4 bg-gray-700 rounded border border-gray-600"
            >
              <div>
                <p className="font-medium text-gray-200">
                  {bid.bidder.slice(0, 6)}...{bid.bidder.slice(-4)}
                </p>
                <p className="text-sm text-gray-400">
                  {new Date(bid.timestamp).toLocaleString()}
                </p>
              </div>
              <p className="text-lg font-semibold text-blue-400">
                ${formatUSDC(bid.amount)} USDC
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 