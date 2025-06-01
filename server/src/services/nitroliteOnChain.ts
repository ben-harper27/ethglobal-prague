/**
 * Nitrolite on-chain operations (separate from WebSocket RPC)
 * This file handles all interactions with the blockchain
 */
import { createPublicClient, createWalletClient, http, type WalletClient, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import dotenv from "dotenv";
import logger from "../utils/logger.js";

// Load environment variables
dotenv.config();

// Singleton instances
let walletClient: WalletClient | null = null;
let publicClient: PublicClient | null = null;

/**
 * Initialize wallet and public clients
 * @param {string} privateKey - Private key for the server wallet
 * @returns {Promise<{walletClient: WalletClient, publicClient: PublicClient}>} The initialized clients
 */
export async function initializeClients(privateKey: `0x${string}`): Promise<{
    walletClient: WalletClient;
    publicClient: PublicClient;
}> {
    try {
        if (walletClient && publicClient) {
            logger.nitro("Clients already initialized");
            return { walletClient, publicClient };
        }

        logger.nitro("Initializing wallet and public clients...");

        // Create wallet from private key
        const wallet = privateKeyToAccount(privateKey);
        const address = wallet.address;

        logger.system(`Server wallet initialized with address: ${address}`);

        // Create public client
        publicClient = createPublicClient({
            transport: http(process.env.POLYGON_RPC_URL),
            chain: polygon,
        });

        // Create wallet client
        walletClient = createWalletClient({
            transport: http(process.env.POLYGON_RPC_URL),
            chain: polygon,
            account: wallet,
        });

        logger.nitro("Wallet and public clients initialized successfully");
        return { walletClient, publicClient };
    } catch (error) {
        logger.error("Error initializing clients:", error);
        throw error;
    }
}

/**
 * Get the existing wallet client or initialize a new one
 * @param {string} privateKey - Private key for the server wallet
 * @returns {Promise<WalletClient | null>} The wallet client instance
 */
export async function getWalletClient(privateKey: `0x${string}`): Promise<WalletClient | null> {
    if (!walletClient && privateKey) {
        await initializeClients(privateKey);
    }
    return walletClient;
}

/**
 * Get the existing public client or initialize a new one
 * @param {string} privateKey - Private key for the server wallet
 * @returns {Promise<PublicClient | null>} The public client instance
 */
export async function getPublicClient(privateKey: `0x${string}`): Promise<PublicClient | null> {
    if (!publicClient && privateKey) {
        await initializeClients(privateKey);
    }
    return publicClient;
}