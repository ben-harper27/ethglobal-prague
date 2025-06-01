/**
 * Nitrolite RPC (WebSocket) client
 * This file handles all WebSocket communication with Nitrolite server
 */
import { createAuthRequestMessage, createAuthVerifyMessage, createPingMessage, NitroliteRPC, MessageSigner } from "@erc7824/nitrolite";
import dotenv from "dotenv";
import { ethers } from "ethers";
import WebSocket from "ws";

import logger from "../utils/logger.js";

import { getWalletClient } from "./nitroliteOnChain.js";

// Type definitions
type MessageCallback = (message: any) => void;
type StatusCallback = (status: WSStatus) => void;

interface PendingRequest {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
}

interface NitroliteMessage {
    res?: [number, string, any, number];
    err?: [number, string, string];
    type?: string;
    channel?: any;
}

interface AuthRequestPayload {
    wallet: string;
    participant: string;
    app_name: string;
    scope: string;
    expire: string;
    application: string;
    allowances: any[];
}

// Connection status enum
export enum WSStatus {
    CONNECTED = "connected",
    CONNECTING = "connecting",
    DISCONNECTED = "disconnected",
    RECONNECTING = "reconnecting",
    RECONNECT_FAILED = "reconnect_failed",
    AUTH_FAILED = "auth_failed",
    AUTHENTICATING = "authenticating"
}

/**
 * EIP-712 domain and types for auth_verify challenge
 */
const getAuthDomain = () => {
    return {
        name: "Auction App",
    };
};

const AUTH_TYPES = {
    Policy: [
        { name: "challenge", type: "string" },
        { name: "scope", type: "string" },
        { name: "wallet", type: "address" },
        { name: "application", type: "address" },
        { name: "participant", type: "address" },
        { name: "expire", type: "uint256" },
        { name: "allowances", type: "Allowance[]" },
    ],
    Allowance: [
        { name: "asset", type: "string" },
        { name: "amount", type: "uint256" },
    ],
};

const expire = String(Math.floor(Date.now() / 1000) + 24 * 60 * 60);

// Load environment variables
dotenv.config();

// Server-side WebSocket client with authentication
export class NitroliteRPCClient {
    private url: string;
    private privateKey: `0x${string}`;
    private ws: WebSocket | null;
    private status: WSStatus;
    private channel: any | null;
    private wallet: ethers.Wallet;
    private address: `0x${string}`;
    private pendingRequests: Map<number, PendingRequest>;
    private nextRequestId: number;
    private reconnectAttempts: number;
    private maxReconnectAttempts: number;
    private reconnectDelay: number;
    private reconnectTimeout: NodeJS.Timeout | null;
    private onMessageCallbacks: MessageCallback[];
    private onStatusChangeCallbacks: StatusCallback[];
    protected walletClient: any | null;
    private pingInterval: NodeJS.Timeout | undefined;

    constructor(url: string, privateKey: string) {
        this.url = url;
        this.privateKey = privateKey as `0x${string}`;
        this.ws = null;
        this.status = WSStatus.DISCONNECTED;
        this.channel = null;
        this.wallet = new ethers.Wallet(privateKey);
        this.address = this.wallet.address as `0x${string}`;
        this.pendingRequests = new Map();
        this.nextRequestId = 1;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.reconnectTimeout = null;
        this.onMessageCallbacks = [];
        this.onStatusChangeCallbacks = [];
        this.walletClient = null;

        logger.system(`RPC client initialized with address: ${this.address}`);
    }

    // Register message callback
    onMessage(callback: MessageCallback): void {
        this.onMessageCallbacks.push(callback);
    }

    // Register status change callback
    onStatusChange(callback: StatusCallback): void {
        this.onStatusChangeCallbacks.push(callback);
    }

    // Connect to WebSocket server
    async connect(): Promise<void> {
        if (this.status === WSStatus.CONNECTED || this.status === WSStatus.CONNECTING) {
            logger.ws("Already connected or connecting...");
            return;
        }

        try {
            logger.ws(`Connecting to ${this.url}...`);
            this.setStatus(WSStatus.CONNECTING);

            this.ws = new WebSocket(this.url);

            this.ws.on("open", async () => {
                logger.ws("WebSocket connection established");
                this.setStatus(WSStatus.AUTHENTICATING);
                try {
                    await this.authenticate();
                    logger.auth("Successfully authenticated with the WebSocket server");
                    this.reconnectAttempts = 0;
                    this.startPingInterval();
                } catch (error) {
                    logger.error("Authentication failed:", error);
                    this.setStatus(WSStatus.AUTH_FAILED);
                    this.ws?.close();
                }
            });

            this.ws.on("message", (data: WebSocket.Data) => {
                this.handleMessage(data);
            });

            this.ws.on("error", (error: Error) => {
                logger.error("WebSocket error:", error);
            });

            this.ws.on("close", () => {
                logger.ws("WebSocket connection closed");
                this.setStatus(WSStatus.DISCONNECTED);
                if (this.pingInterval) clearInterval(this.pingInterval);
                this.handleReconnect();
            });
        } catch (error) {
            logger.error("Failed to connect:", error);
            this.setStatus(WSStatus.DISCONNECTED);
            this.handleReconnect();
        }
    }

    // Update status and notify listeners
    private setStatus(status: WSStatus): void {
        const prevStatus = this.status;
        this.status = status;
        logger.ws(`Status changed: ${prevStatus} -> ${status}`);
        this.onStatusChangeCallbacks.forEach((callback) => callback(status));
    }

    // Extract challenge UUID from various data formats
    private extractChallenge(data: unknown): string {
        let challengeUUID = "";

        if (Array.isArray(data)) {
            logger.auth("Data is array, extracting challenge from position [2][0].challenge");
            if (data.length >= 3 && Array.isArray(data[2]) && data[2].length > 0) {
                const challengeObject = data[2][0] as { challenge?: string };
                if (challengeObject && challengeObject.challenge) {
                    challengeUUID = challengeObject.challenge;
                    logger.auth("Extracted challenge UUID from array:", challengeUUID);
                }
            }
        } else if (typeof data === "string") {
            try {
                const parsed = JSON.parse(data);
                logger.auth("Parsed challenge data:", parsed);

                if (parsed.res && Array.isArray(parsed.res)) {
                    if (parsed.res[1] === "auth_challenge" && parsed.res[2]) {
                        challengeUUID = parsed.res[2].challenge_message || parsed.res[2].challenge;
                        logger.auth("Extracted challenge UUID from auth_challenge:", challengeUUID);
                    } else if (parsed.res[1] === "auth_verify" && Array.isArray(parsed.res[2]) && parsed.res[2][0]) {
                        challengeUUID = parsed.res[2][0].challenge;
                        logger.auth("Extracted challenge UUID from auth_verify:", challengeUUID);
                    }
                } else if (Array.isArray(parsed) && parsed.length >= 3 && Array.isArray(parsed[2])) {
                    const challengeObj = parsed[2][0] as { challenge?: string };
                    challengeUUID = challengeObj?.challenge || "";
                    logger.auth("Extracted challenge UUID from direct array:", challengeUUID);
                }
            } catch (e) {
                logger.error("Could not parse challenge data:", e);
                logger.auth("Using raw string as challenge");
                challengeUUID = data;
            }
        } else if (data && typeof data === "object") {
            const challengeObj = data as { challenge?: string; challenge_message?: string };
            challengeUUID = challengeObj.challenge || challengeObj.challenge_message || "";
            logger.auth("Extracted challenge from object:", challengeUUID);
        }

        return challengeUUID;
    }

    // Sign message function that can be reused across the client
    private async signMessage(data: unknown): Promise<`0x${string}`> {
        const challengeUUID = this.extractChallenge(data);
        const address = this.address;

        if (!challengeUUID || challengeUUID.includes("[") || challengeUUID.includes("{")) {
            // Fallback to regular signing for non-auth messages
            if (!challengeUUID) {
                const messageStr = typeof data === "string" ? data : JSON.stringify(data);
                const digestHex = ethers.id(messageStr);
                const messageBytes = ethers.getBytes(digestHex);
                const { serialized: signature } = this.wallet.signingKey.sign(messageBytes);
                return signature as `0x${string}`;
            }

            throw new Error("Could not extract valid challenge UUID for EIP-712 signing");
        }

        // Create EIP-712 message
        const message = {
            challenge: challengeUUID,
            scope: "app.auction.app",
            wallet: this.address,
            application: this.address,
            participant: this.address,
            expire: expire,
            allowances: [],
        };

        logger.auth("EIP-712 message to sign:", message);

        try {
            // Sign with EIP-712 using ethers
            const signature = await this.wallet.signTypedData(getAuthDomain(), AUTH_TYPES, message);
            logger.auth("EIP-712 signature generated for challenge:", signature);
            return signature as `0x${string}`;
        } catch (error) {
            logger.error("EIP-712 signing failed:", error);
            logger.auth("Attempting fallback to regular message signing...");

            try {
                // Fallback to regular message signing if EIP-712 fails
                const fallbackMessage = `Authentication challenge for ${address}: ${challengeUUID}`;
                logger.auth("Fallback message:", fallbackMessage);

                const digestHex = ethers.id(fallbackMessage);
                const messageBytes = ethers.getBytes(digestHex);
                const { serialized: fallbackSignature } = this.wallet.signingKey.sign(messageBytes);
                logger.auth("Fallback signature generated:", fallbackSignature);
                return fallbackSignature as `0x${string}`;
            } catch (fallbackError) {
                logger.error("Fallback signing also failed:", fallbackError);
                const errMessage = error instanceof Error ? error.message : String(error);
                throw new Error(`Both EIP-712 and fallback signing failed: ${errMessage}`);
            }
        }
    }

    // Authenticate with WebSocket server
    private async authenticate(): Promise<void> {
        if (!this.ws) {
            throw new Error("WebSocket not connected");
        }

        logger.auth("Starting authentication process...");

        const sign = this.signMessage.bind(this) as MessageSigner;

        return new Promise<void>((resolve, reject) => {
            const authRequest = async () => {
                try {
                    const request = await createAuthRequestMessage({
                        wallet: this.address as `0x${string}`,
                        participant: this.address as `0x${string}`,
                        app_name: "Auction App",
                        expire: expire,
                        scope: "app.auction.app",
                        application: this.address as `0x${string}`,
                        allowances: [],
                    });

                    logger.auth("Sending auth request:", request.slice(0, 100) + "...");
                    this.ws?.send(request);
                } catch (error) {
                    logger.error("Error creating auth request:", error);
                    reject(error);
                }
            };

            const handleAuthResponse = async (data: WebSocket.Data) => {
                try {
                    const rawData = data.toString();
                    logger.auth(`Received authentication response: ${rawData.slice(0, 100)}...`);

                    const response = JSON.parse(rawData);

                    if (response.res && response.res[1] === "auth_challenge") {
                        logger.auth("Received auth challenge, sending verification...");
                        const authVerify = await createAuthVerifyMessage(sign, rawData);
                        logger.auth(`Sending auth verification: ${authVerify.slice(0, 100)}...`);
                        this.ws?.send(authVerify);
                    } else if (response.res && response.res[1] === "auth_verify") {
                        logger.auth("Authentication successful!");
                        this.ws?.removeListener("message", authMessageHandler);
                        this.setStatus(WSStatus.CONNECTED);

                        try {
                            const channels = await this.getChannelInfo();
                            const hasValidChannel = channels && Array.isArray(channels) && channels.length > 0 && channels[0] !== null;

                            if (!hasValidChannel) {
                                logger.nitro("No valid channels found after authentication, will create one");
                            }
                        } catch (error) {
                            logger.error("Failed to get channel info, continuing anyway:", error);
                        }

                        resolve();
                    } else if (response.err) {
                        logger.error("Authentication error:", response.err);
                        this.ws?.removeListener("message", authMessageHandler);
                        reject(new Error(response.err[2] || "Authentication failed"));
                    }
                } catch (error) {
                    logger.error("Error handling auth response:", error);
                    this.ws?.removeListener("message", authMessageHandler);
                    reject(error);
                }
            };

            const authMessageHandler = (data: WebSocket.Data) => {
                handleAuthResponse(data);
            };

            this.ws?.on("message", authMessageHandler);

            // Start authentication process
            authRequest();

            // Set timeout
            setTimeout(() => {
                this.ws?.removeListener("message", authMessageHandler);
                reject(new Error("Authentication timeout"));
            }, 10000);
        });
    }

    // Handle incoming WebSocket messages
    private handleMessage(data: WebSocket.Data): void {
        try {
            const rawData = typeof data === "string" ? data : data.toString();
            const message = JSON.parse(rawData) as NitroliteMessage;
            logger.data("Received message", message);

            // Notify callbacks first to allow for authentication handling
            this.onMessageCallbacks.forEach((callback) => callback(message));

            // Handle response to pending requests
            if (message.res && Array.isArray(message.res) && message.res.length >= 3) {
                const requestId = message.res[0];
                if (this.pendingRequests.has(requestId)) {
                    const { resolve } = this.pendingRequests.get(requestId)!;
                    resolve(message.res[2]);
                    this.pendingRequests.delete(requestId);
                }
            }

            // Handle errors
            if (message.err && Array.isArray(message.err) && message.err.length >= 3) {
                const requestId = message.err[0];
                if (this.pendingRequests.has(requestId)) {
                    const { reject } = this.pendingRequests.get(requestId)!;
                    reject(new Error(`Error ${message.err[1]}: ${message.err[2]}`));
                    this.pendingRequests.delete(requestId);
                }
            }

            // Handle channel-specific messages
            if (message.type === "channel_created") {
                logger.nitro("Channel created successfully");
                logger.data("Channel data", message.channel);
                this.channel = message.channel;
            }
        } catch (error) {
            logger.error("Error handling message:", error);
        }
    }

    // Send a request to the WebSocket server
    async sendRequest(method: string, params: unknown[] = []): Promise<unknown> {
        if (!this.ws) {
            throw new Error("WebSocket instance not initialized");
        }

        if (this.ws.readyState !== WebSocket.OPEN) {
            logger.error(`WebSocket not in OPEN state. Current state: ${this.ws.readyState}, Status: ${this.status}`);
            throw new Error(`WebSocket not in OPEN state. Current readyState: ${this.ws.readyState}`);
        }

        if (this.status !== WSStatus.CONNECTED) {
            logger.warn(`WebSocket status is ${this.status}, should be ${WSStatus.CONNECTED}. Proceeding anyway.`);
            if (this.status === WSStatus.AUTHENTICATING) {
                logger.system("Fixing status to CONNECTED for authenticated connection");
                this.setStatus(WSStatus.CONNECTED);
            }
        }

        const requestId = this.nextRequestId++;
        const sign = this.signMessage.bind(this);

        return new Promise(async (resolve, reject) => {
            try {
                const request = NitroliteRPC.createRequest(requestId, method, params);
                logger.ws(`Request: ${JSON.stringify(request).slice(0, 100)}...`);
                const signedRequest = await NitroliteRPC.signRequestMessage(request, sign);

                logger.ws(`Sending request: ${JSON.stringify(signedRequest).slice(0, 100)}...`);

                this.pendingRequests.set(requestId, { resolve, reject });

                setTimeout(() => {
                    if (this.pendingRequests.has(requestId)) {
                        this.pendingRequests.delete(requestId);
                        reject(new Error("Request timeout"));
                    }
                }, 10000);

                if (this.ws) {
                    this.ws.send(typeof signedRequest === "string" ? signedRequest : JSON.stringify(signedRequest));
                }
            } catch (error) {
                logger.error("Error sending request:", error);
                this.pendingRequests.delete(requestId);
                reject(error);
            }
        });
    }

    // Start ping interval to keep connection alive
    private startPingInterval(): void {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }
        
        this.pingInterval = setInterval(async () => {
            if (this.status === WSStatus.CONNECTED && this.ws) {
                try {
                    const sign = this.signMessage.bind(this) as MessageSigner;
                    const pingMessage = await createPingMessage(sign);
                    this.ws.send(pingMessage);
                } catch (error) {
                    logger.error("Error sending ping:", error);
                }
            }
        }, 30000);
    }

    // Handle reconnection
    private handleReconnect(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.ws("Maximum reconnect attempts reached");
            this.setStatus(WSStatus.RECONNECT_FAILED);
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * this.reconnectAttempts;

        logger.ws(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        this.setStatus(WSStatus.RECONNECTING);

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        
        this.reconnectTimeout = setTimeout(() => {
            this.connect();
        }, delay);
    }

    // Close connection
    close(): void {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }
        
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        logger.ws("WebSocket connection closed manually");
        this.setStatus(WSStatus.DISCONNECTED);
    }

    // Get channel information
    async getChannelInfo(): Promise<unknown[]> {
        try {
            logger.nitro("Requesting channel information...");
            const response = await this.sendRequest("get_channels", [{ participant: this.address as `0x${string}` }]);
            logger.data("Channel info received", response);

            logger.system("Debug - Raw channel response:");
            logger.system(`- response type: ${typeof response}`);
            logger.system(`- is array: ${Array.isArray(response)}`);
            logger.system(`- stringified: ${JSON.stringify(response)}`);

            let channels = response as unknown[];

            if (Array.isArray(response) && response.length === 1 && response[0] === null) {
                logger.system("Debug - Got array with single null item");
            }

            if (channels && Array.isArray(channels) && channels.length > 0 && channels[0] !== null) {
                logger.nitro(`Found ${channels.length} valid existing channels`);
                this.channel = channels[0];
                return channels;
            }

            logger.nitro("No valid channels found");

            if (!this.walletClient) {
                logger.nitro("Getting wallet client...");
                this.walletClient = await getWalletClient(this.privateKey as `0x${string}`);
            }

            return [];
        } catch (error) {
            logger.error("Error getting channel info:", error);
            throw error;
        }
    }

    // Getter for wallet client
    getWalletClient(): any {
        return this.walletClient;
    }

    // Setter for wallet client
    setWalletClient(client: any): void {
        this.walletClient = client;
    }

    // Getter for channel
    getChannel(): any {
        return this.channel;
    }

    // Setter for channel
    setChannel(channel: any): void {
        this.channel = channel;
    }
}

// Initialize and export the client instance
let rpcClient: NitroliteRPCClient | null = null;

export async function initializeRPCClient(): Promise<NitroliteRPCClient> {
    logger.system("Initializing Nitrolite RPC client...");
    if (rpcClient) {
        logger.system("Nitrolite RPC client already initialized, returning existing instance...");
        return rpcClient;
    }

    try {
        logger.system("Initializing new Nitrolite RPC client...");

        if (!process.env.SERVER_PRIVATE_KEY) {
            throw new Error("SERVER_PRIVATE_KEY environment variable is not set");
        }

        if (!process.env.CLEARNODE_WS_URL) {
            throw new Error("WS_URL environment variable is not set");
        }

        rpcClient = new NitroliteRPCClient(process.env.CLEARNODE_WS_URL, process.env.SERVER_PRIVATE_KEY);

        rpcClient.onMessage((message) => {
            logger.ws("RPC Message:", JSON.stringify(message, null, 2));
        });

        rpcClient.onStatusChange((status) => {
            logger.ws("RPC Status changed:", status);
        });

        await rpcClient.connect();

        // Initialize wallet client
        const walletClient = await getWalletClient(process.env.SERVER_PRIVATE_KEY as `0x${string}`);
        rpcClient.setWalletClient(walletClient);

        logger.system("Checking for existing channels...");
        const channels = await rpcClient.getChannelInfo();

        const hasValidChannel = channels && Array.isArray(channels) && channels.length > 0 && channels[0] !== null;

        if (hasValidChannel) {
            logger.nitro(`Found ${channels.length} existing valid channels`);
            logger.data("Channel data", channels[0]);
            rpcClient.setChannel(channels[0]);
        } else {
            logger.nitro("No valid channels found in initializeRPCClient");
        }
    } catch (error) {
        logger.error("Error during RPC client initialization:", error);
        throw error;
    }

    return rpcClient;
}

export function getRPCClient(): NitroliteRPCClient | null {
    return rpcClient;
}