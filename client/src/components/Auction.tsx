import { useState, useEffect, useCallback } from 'react';

interface Bid {
  bidder: string;
  amount: bigint;
  timestamp: number;
}

interface AuctionProps {
  userAddress: string;
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

interface Auction {
  id: string;
  seller: string;
  startingPrice: bigint;
  currentPrice: bigint;
  highestBidder: string | null;
  endTime: number;
  status: 'active' | 'ended' | 'finalizing';
  bids: Bid[];
}

export default function Auction({ userAddress }: AuctionProps) {
  const [currentBid, setCurrentBid] = useState<string>('');
  const [auction, setAuction] = useState<Auction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auctionId, setAuctionId] = useState<string | null>(null);

  // Fetch existing auction or create new one
  const initializeAuction = useCallback(async () => {
    try {
      // Try to get auction ID from localStorage
      const storedAuctionId = localStorage.getItem('currentAuctionId');
      
      if (storedAuctionId) {
        console.log('Found stored auction:', storedAuctionId);
        const response = await fetch(`http://localhost:3001/api/auctions/${storedAuctionId}`);
        if (response.ok) {
          const data = await response.json();
          setAuction({
            ...data,
            startingPrice: BigInt(data.startingPrice),
            currentPrice: BigInt(data.currentPrice),
            bids: data.bids.map((bid: { bidder: string; amount: string; timestamp: number }) => ({
              ...bid,
              amount: BigInt(bid.amount),
            })),
          });
          setAuctionId(storedAuctionId);
          return;
        }
      }

      // If no stored auction or fetch failed, create new one
      console.log('Creating new auction...');
      const response = await fetch('http://localhost:3001/api/auctions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          seller: userAddress,
          startingPrice: '100000', // 0.1 USDC
          duration: 60 * 1000, // 1 minute
        }),
      });

      console.log('Create auction response:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`Failed to create auction: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log('Created auction:', data);
      localStorage.setItem('currentAuctionId', data.id);
      setAuctionId(data.id);
      setAuction({
        ...data,
        startingPrice: BigInt(data.startingPrice),
        currentPrice: BigInt(data.currentPrice),
        bids: data.bids.map((bid: { bidder: string; amount: string; timestamp: number }) => ({
          ...bid,
          amount: BigInt(bid.amount),
        })),
      });
    } catch (error) {
      console.error('Error initializing auction:', error);
      setError(error instanceof Error ? error.message : 'Failed to initialize auction');
    }
  }, [userAddress]);

  // Fetch auction details
  const fetchAuction = useCallback(async () => {
    if (!auctionId) return;
    
    try {
      const response = await fetch(`http://localhost:3001/api/auctions/${auctionId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch auction');
      }

      const data = await response.json();
      setAuction({
        ...data,
        startingPrice: BigInt(data.startingPrice),
        currentPrice: BigInt(data.currentPrice),
        bids: data.bids.map((bid: { bidder: string; amount: string; timestamp: number }) => ({
          ...bid,
          amount: BigInt(bid.amount),
        })),
      });
    } catch (error) {
      console.error('Error fetching auction:', error);
      setError('Failed to fetch auction');
    }
  }, [auctionId]);

  // Initialize auction on mount
  useEffect(() => {
    if (userAddress && !auction) {
      initializeAuction();
    }
  }, [userAddress, auction, initializeAuction]);

  // Poll for updates when auction is active
  useEffect(() => {
    if (!auction || auction.status !== 'active') return;

    const interval = setInterval(() => {
      fetchAuction();
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [auction, fetchAuction]);

  // Create a new auction button
  const handleCreateNew = useCallback(async () => {
    localStorage.removeItem('currentAuctionId');
    setAuctionId(null);
    setAuction(null);
    await initializeAuction();
  }, [initializeAuction]);

  // Place a bid
  const handleBidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!auction) return;

    const bidAmount = parseUSDC(currentBid);
    if (!bidAmount) {
      setError('Please enter a valid bid amount');
      return;
    }
    
    if (bidAmount <= auction.currentPrice) {
      setError('Bid must be higher than current highest bid');
      return;
    }

    try {
      const response = await fetch(`http://localhost:3001/api/auctions/${auction.id}/bid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bidder: userAddress,
          amount: bidAmount.toString(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to place bid');
      }

      await fetchAuction();
      setCurrentBid('');
      setError(null);
    } catch (error) {
      console.error('Error placing bid:', error);
      setError('Failed to place bid');
    }
  };

  // Finalize auction
  const finalizeAuction = async () => {
    if (!auction) return;

    try {
      const response = await fetch(`http://localhost:3001/api/auctions/${auction.id}/finalize`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to finalize auction');
      }

      await fetchAuction();
    } catch (error) {
      console.error('Error finalizing auction:', error);
      setError('Failed to finalize auction');
    }
  };

  if (!auction) {
    return <div className="text-white">Loading...</div>;
  }

  return (
    <div className="bg-gray-800 rounded-lg shadow-lg p-6 max-w-2xl mx-auto border border-gray-700">
      {error && (
        <div className="mb-4 p-4 bg-red-900/50 border border-red-500 rounded text-red-200">
          {error}
        </div>
      )}

      {/* Create New Auction Button */}
      {auction && auction.status !== 'active' && (
        <button
          onClick={handleCreateNew}
          className="w-full mb-8 bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors duration-200"
        >
          Create New Auction
        </button>
      )}

      {/* Auction Details */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2 text-white">Auction #{auction.id}</h2>
        <div className="flex justify-between items-center">
          <p className="text-lg text-gray-200">
            Starting Price: ${formatUSDC(auction.startingPrice)} USDC
          </p>
          <p className="text-lg text-gray-200">
            Ends: {new Date(auction.endTime).toLocaleString()}
          </p>
        </div>
        <p className="text-gray-400 mt-2">
          Seller: {auction.seller.slice(0, 6)}...{auction.seller.slice(-4)}
        </p>
      </div>

      {/* Current Highest Bid */}
      <div className="mb-8 p-4 bg-gray-700 rounded-lg border border-gray-600">
        <h3 className="text-xl font-semibold mb-2 text-white">Current Highest Bid</h3>
        <p className="text-2xl text-blue-400">
          ${formatUSDC(auction.currentPrice)} USDC
        </p>
        {auction.highestBidder && (
          <p className="text-gray-300 mt-2">
            by {auction.highestBidder.slice(0, 6)}...{auction.highestBidder.slice(-4)}
          </p>
        )}
      </div>

      {/* Bid Form */}
      {auction.status === 'active' && Date.now() <= auction.endTime && (
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
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors duration-200"
            >
              Place Bid
            </button>
          </div>
        </form>
      )}

      {/* Finalize Button */}
      {auction.status === 'active' && Date.now() > auction.endTime && (
        <button
          onClick={finalizeAuction}
          className="w-full mb-8 bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 transition-colors duration-200"
        >
          Finalize Auction
        </button>
      )}

      {/* Status */}
      {auction.status !== 'active' && (
        <div className="mb-8 p-4 bg-gray-700 rounded-lg border border-gray-600">
          <h3 className="text-xl font-semibold text-white">
            Auction {auction.status === 'finalizing' ? 'Finalizing' : 'Ended'}
          </h3>
          {auction.status === 'finalizing' && (
            <p className="text-gray-300 mt-2">
              Creating settlement channel...
            </p>
          )}
        </div>
      )}

      {/* Bid History */}
      <div>
        <h3 className="text-xl font-semibold mb-4 text-white">Bid History</h3>
        <div className="space-y-4">
          {auction.bids.map((bid, index) => (
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