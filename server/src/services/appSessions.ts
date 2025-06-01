/**
 * Nitrolite auction sessions
 * This file handles creating and managing app sessions for auctions
 */
import { createAppSessionMessage, createCloseAppSessionMessage, type CreateAppSessionRequest, type CloseAppSessionRequest } from '@erc7824/nitrolite';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';
import { getRPCClient } from './nitroliteRPC.js';
import { Auction } from '../types.js';

// Load environment variables
dotenv.config();

interface AppSessionResponse {
  app_session_id: `0x${string}`;
  status: string;
}

// Map to store auction sessions
const auctionSessions = new Map<string, {
  appId: `0x${string}`;
  seller: string;
  currentBidder: string | null;
  serverAddress: string;
  currentBid: string;
  createdAt: number;
}>();

/**
 * Create an app session for a new auction
 * @param {string} auctionId - Auction ID
 * @param {string} seller - Seller's address
 * @param {string} startingPrice - Initial auction price
 * @returns {Promise<string>} The app session ID
 */
export async function createAuctionSession(auctionId: string, seller: string, startingPrice: string): Promise<string> {
  try {
    logger.nitro(`Creating auction session for auction ${auctionId}`);
    
    // Get the RPC client
    const rpcClient = await getRPCClient();
    if (!rpcClient) {
      throw new Error('RPC client not initialized');
    }
    
    // Format seller address to proper checksum format
    const formattedSeller = ethers.getAddress(seller) as `0x${string}`;
    
    // Create app definition
    const appDefinition = {
      protocol: "app_aura_nitrolite_v0",
      participants: [formattedSeller],  // Start with just the seller
      weights: [100],  // Seller has control for managing bids
      quorum: 100,
      challenge: 0,
      nonce: Date.now(),
    };
    
    const appSessionData: CreateAppSessionRequest[] = [{
      definition: appDefinition,
      allocations: [
        {
          participant: formattedSeller,
          asset: 'usdc',
          amount: '0', // Seller starts with 0 as they're selling
        }
      ]
    }];
    
    // Create and send the request
    const requestId = Date.now();
    const response = await rpcClient.sendRequest('create_app_session', [appSessionData, requestId]) as AppSessionResponse;
    
    if (!response?.app_session_id) {
      throw new Error('Failed to get app ID from response');
    }
    
    // Get server address from RPC client's wallet
    const serverAddress = await rpcClient.getWalletClient().account.address;
    
    // Store the auction session
    auctionSessions.set(auctionId, {
      appId: response.app_session_id,
      seller: formattedSeller,
      currentBidder: null,
      serverAddress,
      currentBid: startingPrice,
      createdAt: Date.now()
    });
    
    logger.nitro(`Created auction session with ID ${response.app_session_id} for auction ${auctionId}`);
    return response.app_session_id;
    
  } catch (error) {
    logger.error(`Error creating auction session for auction ${auctionId}:`, error);
    throw error;
  }
}

/**
 * Update auction session with a new bid
 * @param {string} auctionId - Auction ID
 * @param {string} bidder - Bidder's address
 * @param {string} bidAmount - Bid amount in USDC
 * @returns {Promise<boolean>} Success status
 */
export async function updateAuctionBid(auctionId: string, bidder: string, bidAmount: string): Promise<boolean> {
  try {
    const auctionSession = auctionSessions.get(auctionId);
    if (!auctionSession) {
      throw new Error(`No auction session found for auction ${auctionId}`);
    }

    const rpcClient = await getRPCClient();
    if (!rpcClient) {
      throw new Error('RPC client not initialized');
    }

    const formattedBidder = ethers.getAddress(bidder) as `0x${string}`;

    // Update app session with new bidder
    const updateRequest = {
      app_session_id: auctionSession.appId,
      participants: [auctionSession.seller, formattedBidder],
      allocations: [
        {
          participant: auctionSession.seller as `0x${string}`,
          asset: 'usdc',
          amount: '0', // Seller still has 0 during bidding
        },
        {
          participant: formattedBidder,
          asset: 'usdc',
          amount: bidAmount, // New bid amount
        }
      ]
    };

    // Send update request
    const requestId = Date.now();
    const response = await rpcClient.sendRequest('update_app_session', [updateRequest, requestId]);
    
    if (response) {
      // Update local session state
      auctionSession.currentBidder = formattedBidder;
      auctionSession.currentBid = bidAmount;
      auctionSessions.set(auctionId, auctionSession);
      
      logger.nitro(`Updated auction session ${auctionSession.appId} with new bid from ${formattedBidder}`);
      return true;
    }

    return false;
  } catch (error) {
    logger.error(`Error updating auction bid for auction ${auctionId}:`, error);
    return false;
  }
}

/**
 * Settle an auction session and transfer funds
 * @param {string} auctionId - Auction ID
 * @returns {Promise<boolean>} Success status
 */
export async function settleAuctionSession(auctionId: string): Promise<boolean> {
  try {
    const auctionSession = auctionSessions.get(auctionId);
    if (!auctionSession) {
      logger.warn(`No auction session found for auction ${auctionId}`);
      return false;
    }
    
    if (!auctionSession.currentBidder) {
      logger.warn(`No winning bidder for auction ${auctionId}`);
      return false;
    }

    const rpcClient = await getRPCClient();
    if (!rpcClient) {
      throw new Error('RPC client not initialized');
    }
    
    // Final settlement allocations
    const settleRequest = {
      app_session_id: auctionSession.appId,
      allocations: [
        {
          participant: auctionSession.seller as `0x${string}`,
          asset: 'usdc',
          amount: auctionSession.currentBid, // Seller receives winning bid
        },
        {
          participant: auctionSession.currentBidder as `0x${string}`,
          asset: 'usdc',
          amount: '0', // Bidder's funds are transferred to seller
        }
      ]
    };
    
    // Send settlement request
    const requestId = Date.now();
    const response = await rpcClient.sendRequest('close_app_session', [settleRequest, requestId]);
    
    if (response) {
      // Remove the auction session
      auctionSessions.delete(auctionId);
      logger.nitro(`Settled auction session ${auctionSession.appId} for auction ${auctionId}`);
      return true;
    }
    
    return false;
    
  } catch (error) {
    logger.error(`Error settling auction session for auction ${auctionId}:`, error);
    return false;
  }
}

/**
 * Get the auction session for an auction
 * @param {string} auctionId - Auction ID
 * @returns {Object|null} The auction session or null if not found
 */
export function getAuctionSession(auctionId: string) {
  return auctionSessions.get(auctionId) || null;
}

/**
 * Check if an auction has an active session
 * @param {string} auctionId - Auction ID
 * @returns {boolean} Whether the auction has an active session
 */
export function hasAuctionSession(auctionId: string): boolean {
  return auctionSessions.has(auctionId);
}

/**
 * Get all auction sessions
 * @returns {Map} Map of all auction sessions
 */
export function getAllAuctionSessions() {
  return auctionSessions;
}

/**
 * Creates a default auction for testing purposes
 * @returns {Promise<string>} The default auction ID
 */
export async function createDefaultAuction(): Promise<string> {
  try {
    // Generate a deterministic auction ID for the default auction
    const defaultAuctionId = 'default-auction-0x1';
    
    // Use the server's address as the seller
    const rpcClient = await getRPCClient();
    if (!rpcClient) {
      throw new Error('RPC client not initialized');
    }
    
    const serverAddress = await rpcClient.getWalletClient().account.address;
    
    // Create auction with default values
    const startingPrice = '1000000'; // 1 USDC
    
    await createAuctionSession(defaultAuctionId, serverAddress, startingPrice);
    
    logger.nitro(`Created default auction with ID ${defaultAuctionId}`);
    return defaultAuctionId;
    
  } catch (error) {
    logger.error('Error creating default auction:', error);
    throw error;
  }
}