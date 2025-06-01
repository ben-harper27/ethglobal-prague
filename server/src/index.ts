import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocket } from 'ws';
import { ethers } from 'ethers';
import {
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createAppSessionMessage,
  MessageSigner,
} from '@erc7824/nitrolite';
import { Auction, CreateAuctionRequest, PlaceBidRequest, PendingRequest, Bid } from './types.js';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Add request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// In-memory storage for active auctions
const activeAuctions = new Map<string, Auction>();

// ClearNode connection manager
class ClearNodeManager {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private isAuthenticated = false;
  private wallet: ethers.Wallet | null = null;
  private pendingRequests = new Map<string, PendingRequest>();

  async initialize(): Promise<void> {
    if (!process.env.SERVER_PRIVATE_KEY) {
      throw new Error('SERVER_PRIVATE_KEY environment variable is required');
    }
    // Create a wallet for the server
    this.wallet = new ethers.Wallet(process.env.SERVER_PRIVATE_KEY);
    await this.connect();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (!process.env.CLEARNODE_WS_URL) {
          throw new Error('CLEARNODE_WS_URL environment variable is required');
        }
        
        this.ws = new WebSocket(process.env.CLEARNODE_WS_URL);

        this.ws.on('open', async () => {
          console.log('Connected to ClearNode');
          this.isConnected = true;
          await this.authenticate();
          resolve();
        });

        this.ws.on('message', this.handleMessage.bind(this));

        this.ws.on('close', () => {
          console.log('Disconnected from ClearNode');
          this.isConnected = false;
          this.isAuthenticated = false;
          // Attempt to reconnect after a delay
          setTimeout(() => this.connect(), 5000);
        });

        this.ws.on('error', (error) => {
          console.error('ClearNode WebSocket error:', error);
          reject(error);
        });
      } catch (error) {
        console.error('Error connecting to ClearNode:', error);
        reject(error);
      }
    });
  }

  async authenticate(): Promise<void> {
    try {
      if (!this.wallet) {
        throw new Error('Wallet not initialized');
      }

      // Create message signer function
      const messageSigner: MessageSigner = async (payload: any): Promise<`0x${string}`> => {
        const messageStr = JSON.stringify(payload);
        const messageHash = ethers.id(messageStr);
        const messageBytes = ethers.getBytes(messageHash);
        const signature = await this.wallet!.signMessage(messageBytes);
        return signature as `0x${string}`;
      };

      // Create auth request message with signer function
      const authRequest = await createAuthRequestMessage(
        messageSigner,
        this.wallet.address as `0x${string}`,
        Date.now(), // requestId
        Math.floor(Date.now() / 1000) // timestamp
      );

      // Send auth request
      if (!this.ws) {
        throw new Error('WebSocket not connected');
      }
      this.ws.send(authRequest);
    } catch (error) {
      console.error('Error during authentication:', error);
      throw error;
    }
  }

  handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());

      // Handle authentication challenge
      if (message.res && message.res[1] === 'auth_challenge') {
        this.handleAuthChallenge(message);
      }
      // Handle authentication success
      else if (message.res && message.res[1] === 'auth_success') {
        console.log('Successfully authenticated with ClearNode');
        this.isAuthenticated = true;
      }
      // Handle other responses
      else if (message.res) {
        const requestId = message.res[0];
        const handler = this.pendingRequests.get(requestId);
        if (handler) {
          handler.resolve(message.res[2]);
          this.pendingRequests.delete(requestId);
        }
      }
      // Handle errors
      else if (message.err) {
        console.error('Received error from ClearNode:', message.err);
        const requestId = message.err[0];
        const handler = this.pendingRequests.get(requestId);
        if (handler) {
          handler.reject(new Error(message.err[2]));
          this.pendingRequests.delete(requestId);
        }
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  async handleAuthChallenge(message: any): Promise<void> {
    try {
      if (!this.wallet) {
        throw new Error('Wallet not initialized');
      }

      const messageSigner: MessageSigner = async (payload: any): Promise<`0x${string}`> => {
        const messageStr = JSON.stringify(payload);
        const messageHash = ethers.id(messageStr);
        const messageBytes = ethers.getBytes(messageHash);
        const signature = await this.wallet!.signMessage(messageBytes);
        return signature as `0x${string}`;
      };

      const authVerify = await createAuthVerifyMessage(
        messageSigner,
        message,
        this.wallet.address as `0x${string}`
      );

      if (!this.ws) {
        throw new Error('WebSocket not connected');
      }
      this.ws.send(authVerify);
    } catch (error) {
      console.error('Error handling auth challenge:', error);
    }
  }

  async createAuctionSession(
    auctionId: string,
    seller: string,
    highestBidder: string,
    amount: string
  ): Promise<any> {
    try {
      if (!this.wallet) {
        throw new Error('Wallet not initialized');
      }

      const messageSigner: MessageSigner = async (payload: any): Promise<`0x${string}`> => {
        const messageStr = JSON.stringify(payload);
        const messageHash = ethers.id(messageStr);
        const messageBytes = ethers.getBytes(messageHash);
        const signature = await this.wallet!.signMessage(messageBytes);
        return signature as `0x${string}`;
      };

      // Create app session for the auction
      const appDefinition = {
        protocol: 'app_nitrolite_v0',
        participants: [
          seller as `0x${string}`,
          highestBidder as `0x${string}`,
          this.wallet.address as `0x${string}`
        ],
        weights: [0, 0, 100], // Server has full control
        quorum: 100,
        challenge: 0,
        nonce: Date.now(),
      };

      const allocations = [
        {
          participant: seller as `0x${string}`,
          asset: 'usdc',
          amount: '0',
        },
        {
          participant: highestBidder as `0x${string}`,
          asset: 'usdc',
          amount: amount,
        },
        {
          participant: this.wallet.address as `0x${string}`,
          asset: 'usdc',
          amount: '0',
        },
      ];

      const signedMessage = await createAppSessionMessage(
        messageSigner,
        [
          {
            definition: appDefinition,
            allocations: allocations,
          },
        ]
      );

      if (!this.ws) {
        throw new Error('WebSocket not connected');
      }

      return new Promise((resolve, reject) => {
        const requestId = Date.now().toString();
        this.pendingRequests.set(requestId, { resolve, reject });
        this.ws!.send(signedMessage);
      });
    } catch (error) {
      console.error('Error creating auction session:', error);
      throw error;
    }
  }
}

// Initialize ClearNode manager
const clearNode = new ClearNodeManager();
await clearNode.initialize();

// API Routes

// Create a new auction
app.post('/api/auctions', async (req: Request<{}, {}, CreateAuctionRequest>, res: Response) => {
  try {
    const { seller, startingPrice, duration } = req.body;

    const auctionId = ethers.id(Date.now().toString()).slice(2, 10);
    const endTime = Date.now() + duration;

    const auction: Auction = {
      id: auctionId,
      seller,
      startingPrice: BigInt(startingPrice),
      currentPrice: BigInt(startingPrice),
      highestBidder: null,
      endTime,
      status: 'active',
      bids: [],
    };

    activeAuctions.set(auctionId, auction);

    res.json({
      auctionId,
      ...auction,
      currentPrice: auction.currentPrice.toString(),
      startingPrice: auction.startingPrice.toString(),
    });
  } catch (error) {
    console.error('Error creating auction:', error);
    res.status(500).json({ error: 'Failed to create auction' });
  }
});

// Place a bid
app.post('/api/auctions/:auctionId/bid', async (req: Request<{ auctionId: string }, {}, PlaceBidRequest>, res: Response) => {
  try {
    const { auctionId } = req.params;
    const { bidder, amount } = req.body;

    const auction = activeAuctions.get(auctionId);
    if (!auction) {
      return res.status(404).json({ error: 'Auction not found' });
    }

    if (auction.status !== 'active') {
      return res.status(400).json({ error: 'Auction is not active' });
    }

    if (Date.now() > auction.endTime) {
      auction.status = 'ended';
      return res.status(400).json({ error: 'Auction has ended' });
    }

    const bidAmount = BigInt(amount);
    if (bidAmount <= auction.currentPrice) {
      return res.status(400).json({ error: 'Bid amount must be higher than current price' });
    }

    // Record the bid
    auction.bids.push({
      bidder,
      amount: bidAmount,
      timestamp: Date.now(),
    });

    auction.currentPrice = bidAmount;
    auction.highestBidder = bidder;

    // Update the auction in memory
    activeAuctions.set(auctionId, auction);

    res.json({
      auctionId,
      currentPrice: auction.currentPrice.toString(),
      highestBidder: auction.highestBidder,
    });
  } catch (error) {
    console.error('Error placing bid:', error);
    res.status(500).json({ error: 'Failed to place bid' });
  }
});

// Get auction details
app.get('/api/auctions/:auctionId', (req: Request<{ auctionId: string }>, res: Response) => {
  const { auctionId } = req.params;
  const auction = activeAuctions.get(auctionId);

  if (!auction) {
    return res.status(404).json({ error: 'Auction not found' });
  }

  res.json({
    ...auction,
    currentPrice: auction.currentPrice.toString(),
    startingPrice: auction.startingPrice.toString(),
    bids: auction.bids.map((bid: Bid) => ({
      ...bid,
      amount: bid.amount.toString(),
    })),
  });
});

// Finalize auction
app.post('/api/auctions/:auctionId/finalize', async (req: Request<{ auctionId: string }>, res: Response) => {
  try {
    const { auctionId } = req.params;
    const auction = activeAuctions.get(auctionId);

    if (!auction) {
      return res.status(404).json({ error: 'Auction not found' });
    }

    if (auction.status !== 'active') {
      return res.status(400).json({ error: 'Auction is not active' });
    }

    if (Date.now() <= auction.endTime) {
      return res.status(400).json({ error: 'Auction has not ended yet' });
    }

    // Create app session for settlement
    if (auction.highestBidder) {
      const appSession = await clearNode.createAuctionSession(
        auctionId,
        auction.seller,
        auction.highestBidder,
        auction.currentPrice.toString()
      );

      auction.status = 'finalizing';
      auction.appSessionId = appSession[0].app_session_id;
    } else {
      auction.status = 'ended';
    }

    // Update the auction in memory
    activeAuctions.set(auctionId, auction);

    res.json({
      auctionId,
      status: auction.status,
      appSessionId: auction.appSessionId,
      winner: auction.highestBidder,
      finalPrice: auction.currentPrice.toString(),
    });
  } catch (error) {
    console.error('Error finalizing auction:', error);
    res.status(500).json({ error: 'Failed to finalize auction' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Auction verifier server running on port ${port}`);
}); 