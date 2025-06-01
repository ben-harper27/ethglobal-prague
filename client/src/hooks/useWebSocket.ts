import { useState, useCallback, useEffect } from "react";
import { generateRequestId, getCurrentTimestamp } from "@erc7824/nitrolite";
import { createEthersSigner } from "@/context/createSigner";
import { type RequestData, type NitroliteRPCMessage } from "@erc7824/nitrolite";

interface WebSocketMessage {
  type: string;
  payload?: {
    bidder?: string;
    bidAmount?: string;
    [key: string]: unknown;
  };
  error?: { code: string; msg: string };
  title?: string;
  description?: string;
  startingPrice?: string;
  currentBid?: string;
  currentBidder?: string | null;
  endTime?: string | number;
  seller?: string;
  status?: 'active' | 'ended' | 'finalizing';
  bids?: Array<{
    bidder: string;
    amount: string;
    timestamp: string | number;
  }>;
  winner?: string;
  finalPrice?: string;
}

// WebSocket hook for connecting to the auction server
export function useWebSocket() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  // Get the keypair from localStorage
  const getKeypair = useCallback(() => {
    const savedKeys = localStorage.getItem("crypto_keypair");
    if (!savedKeys) {
      throw new Error("No crypto keypair found. Please connect to ClearNode first.");
    }
    return JSON.parse(savedKeys);
  }, []);

  // Create a signed request
  const createSignedRequest = useCallback(
    async (method: string, params: unknown[] = []): Promise<string> => {
      const keypair = getKeypair();
      if (!keypair) throw new Error("State wallet not available");

      const requestId = generateRequestId();
      const timestamp = getCurrentTimestamp();
      const requestData: RequestData = [requestId, method, params, timestamp];
      const request: NitroliteRPCMessage = { req: requestData };

      // Sign the request using the ClearNode keypair
      const signer = createEthersSigner(keypair.privateKey);
      const signature = await signer.sign(requestData);
      request.sig = [signature];

      return JSON.stringify(request);
    },
    [getKeypair]
  );

  // Initialize WebSocket connection
  useEffect(() => {
    // Connect to WebSocket server
    const wsUrl = "ws://localhost:3001";
    const webSocket = new WebSocket(wsUrl);

    webSocket.onopen = () => {
      console.log("WebSocket connection established");
      setIsConnected(true);
      setError(null);
    };

    webSocket.onclose = () => {
      console.log("WebSocket connection closed");
      setIsConnected(false);
    };

    webSocket.onerror = (event) => {
      console.error("WebSocket error:", event);
      setError("WebSocket connection error");
      setIsConnected(false);
    };

    webSocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log("Received message:", message);
        setLastMessage(message);
      } catch (err) {
        console.error("Error parsing WebSocket message:", err);
      }
    };

    setWs(webSocket);

    return () => {
      webSocket.close();
    };
  }, []);

  // Send a message to the server
  const sendMessage = useCallback(
    (message: unknown): boolean => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        setError("WebSocket not connected");
        return false;
      }

      try {
        ws.send(typeof message === "string" ? message : JSON.stringify(message));
        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        setError(`Error sending message: ${errorMessage}`);
        return false;
      }
    },
    [ws]
  );

  // Place a bid
  const placeBid = useCallback(
    async (payload: { auctionId: string; bidder: string; bidAmount: string }) => {
      try {
        // Create signed request for placing bid
        const signedRequest = await createSignedRequest("place_bid", [
          payload.auctionId,
          payload.bidder,
          payload.bidAmount
        ]);

        // Send the signed request
        sendMessage({
          type: "auction:bid",
          payload: {
            auctionId: payload.auctionId,
            request: signedRequest
          }
        });
      } catch (error) {
        console.error("Error placing bid:", error);
        throw error;
      }
    },
    [createSignedRequest, sendMessage]
  );

  // Get auction state
  const getAuctionState = useCallback(
    async (auctionId: string) => {
      try {
        // Create signed request for getting auction state
        const signedRequest = await createSignedRequest("get_auction_state", [auctionId]);

        // Send the signed request
        sendMessage({
          type: "auction:getState",
          payload: {
            auctionId,
            request: signedRequest
          }
        });
      } catch (error) {
        console.error("Error getting auction state:", error);
        throw error;
      }
    },
    [createSignedRequest, sendMessage]
  );

  // Settle auction
  const settleAuction = useCallback(
    async (payload: { auctionId: string; seller: string }) => {
      try {
        // Create signed request for settling auction
        const signedRequest = await createSignedRequest("settle_auction", [
          payload.auctionId,
          payload.seller
        ]);

        // Send the signed request
        sendMessage({
          type: "auction:settle",
          payload: {
            auctionId: payload.auctionId,
            request: signedRequest
          }
        });
      } catch (error) {
        console.error("Error settling auction:", error);
        throw error;
      }
    },
    [createSignedRequest, sendMessage]
  );

  return {
    isConnected,
    error,
    lastMessage,
    placeBid,
    getAuctionState,
    settleAuction
  };
}
