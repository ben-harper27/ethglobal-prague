import { useEffect, useRef, useState, useCallback } from "react";
import type { WebSocketMessages, CreateAuctionPayload, PlaceBidPayload, SettleAuctionPayload } from "@/types";

// WebSocket hook for connecting to the auction server
export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const webSocketRef = useRef<WebSocket | null>(null);
  const [lastMessage, setLastMessage] = useState<WebSocketMessages | null>(null);

  // WebSocket server URL (use environment variable if available)
  const wsUrl = "ws://localhost:3001";

  // Initialize WebSocket connection
  useEffect(() => {
    const webSocket = new WebSocket(wsUrl);

    webSocket.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    webSocket.onclose = () => {
      setIsConnected(false);
    };

    webSocket.onerror = () => {
      setError("Failed to connect to auction server");
      setIsConnected(false);
    };

    webSocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        setLastMessage(message as WebSocketMessages);
      } catch (err) {
        console.error("Error parsing WebSocket message", err);
      }
    };

    webSocketRef.current = webSocket;

    // Cleanup on unmount
    return () => {
      webSocket.close();
    };
  }, [wsUrl]);

  // Send a message to the server
  const sendMessage = useCallback(
    (message: object) => {
      if (webSocketRef.current && isConnected) {
        webSocketRef.current.send(JSON.stringify(message));
      } else {
        setError("Not connected to server");
      }
    },
    [isConnected]
  );

  // Create a new auction
  const createAuction = useCallback(
    (payload: CreateAuctionPayload) => {
      sendMessage({
        type: "auction:create",
        payload,
      });
    },
    [sendMessage]
  );

  // Place a bid on an auction
  const placeBid = useCallback(
    (payload: PlaceBidPayload) => {
      sendMessage({
        type: "auction:bid",
        payload,
      });
    },
    [sendMessage]
  );

  // Settle an auction
  const settleAuction = useCallback(
    (payload: SettleAuctionPayload) => {
      sendMessage({
        type: "auction:settle",
        payload,
      });
    },
    [sendMessage]
  );

  // Get auction state
  const getAuctionState = useCallback(
    (auctionId: string) => {
      sendMessage({
        type: "auction:getState",
        payload: { auctionId },
      });
    },
    [sendMessage]
  );

  return {
    isConnected,
    error,
    lastMessage,
    createAuction,
    placeBid,
    settleAuction,
    getAuctionState,
  };
}
