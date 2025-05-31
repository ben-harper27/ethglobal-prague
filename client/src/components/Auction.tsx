import { useState } from 'react';

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

export default function Auction({ userAddress }: AuctionProps) {
  const [currentBid, setCurrentBid] = useState<string>('');
  const [bids, setBids] = useState<Bid[]>([]);
  
  // Mock auction details
  const auctionDetails = {
    title: "Rare Digital Art #123",
    description: "A unique piece of digital art from a renowned artist",
    startingPrice: BigInt(100_000_000), // 100 USDC
    endTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
  };

  const handleBidSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const bidAmount = parseUSDC(currentBid);
    if (!bidAmount) {
      alert('Please enter a valid bid amount');
      return;
    }
    
    if (bidAmount <= (bids[0]?.amount ?? auctionDetails.startingPrice)) {
      alert('Bid must be higher than current highest bid');
      return;
    }

    const newBid: Bid = {
      bidder: userAddress,
      amount: bidAmount,
      timestamp: Date.now(),
    };

    setBids([newBid, ...bids]);
    setCurrentBid('');
  };

  return (
    <div className="bg-gray-800 rounded-lg shadow-lg p-6 max-w-2xl mx-auto border border-gray-700">
      {/* Auction Details */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2 text-white">{auctionDetails.title}</h2>
        <p className="text-gray-300 mb-4">{auctionDetails.description}</p>
        <div className="flex justify-between items-center">
          <p className="text-lg text-gray-200">
            Starting Price: ${formatUSDC(auctionDetails.startingPrice)} USDC
          </p>
          <p className="text-lg text-gray-200">
            Ends: {auctionDetails.endTime.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Current Highest Bid */}
      <div className="mb-8 p-4 bg-gray-700 rounded-lg border border-gray-600">
        <h3 className="text-xl font-semibold mb-2 text-white">Current Highest Bid</h3>
        <p className="text-2xl text-blue-400">
          ${bids.length > 0
            ? formatUSDC(bids[0].amount)
            : formatUSDC(auctionDetails.startingPrice)} USDC
        </p>
      </div>

      {/* Bid Form */}
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

      {/* Bid History */}
      <div>
        <h3 className="text-xl font-semibold mb-4 text-white">Bid History</h3>
        <div className="space-y-4">
          {bids.map((bid, index) => (
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