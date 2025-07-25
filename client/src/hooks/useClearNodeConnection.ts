import { useState, useEffect, useCallback } from "react";
import {
  createAuthRequestMessage,
  createAuthVerifyMessageWithJWT,
  createAuthVerifyMessage,
  createGetChannelsMessage,
  createGetLedgerBalancesMessage,
  createGetConfigMessage,
  generateRequestId,
  getCurrentTimestamp,
} from "@erc7824/nitrolite";
import { MessageSigner } from "@erc7824/nitrolite";
import {
  createEthersSigner,
  CryptoKeypair,
  WalletSigner,
} from "@/context/createSigner";
import { generateKeyPair } from "@/context/createSigner";
import { AUTH_TYPES } from "@/config/clearnode";
import { WalletClient } from "viem";

// Custom hook for ClearNode connection
export function useClearNodeConnection(
  clearNodeUrl: string,
  eoaWallet: WalletClient | null = null
) {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<string>("disconnected");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keypair, setKeypair] = useState<CryptoKeypair | null>(null);

  const expire = String(Math.floor(Date.now() / 1000) + 24 * 60 * 60);

  const getAuthDomain = () => {
    return {
      name: "Auction App",
    };
  };

  function createEIP712SigningFunction(stateSigner: WalletSigner) {
    const walletClient = eoaWallet;

    if (!walletClient) {
      throw new Error("No wallet client available for EIP-712 signing");
    }

    return async (data: unknown): Promise<`0x${string}` | undefined> => {
      console.log("Signing auth_verify challenge with EIP-712:", data);

      let challengeUUID = "";
      const address = walletClient.account?.address;
      // The data coming in is the array from createAuthVerifyMessage
      // Format: [timestamp, "auth_verify", [{"address": "0x...", "challenge": "uuid"}], timestamp]
      if (Array.isArray(data)) {
        console.log(
          "Data is array, extracting challenge from position [2][0].challenge"
        );

        // Direct array access - data[2] should be the array with the challenge object
        if (data.length >= 3 && Array.isArray(data[2]) && data[2].length > 0) {
          const challengeObject = data[2][0];

          if (challengeObject && challengeObject.challenge) {
            challengeUUID = challengeObject.challenge;
            console.log("Extracted challenge UUID from array:", challengeUUID);
          }
        }
      } else if (typeof data === "string") {
        try {
          const parsed = JSON.parse(data);

          console.log("Parsed challenge data:", parsed);

          // Handle different message structures
          if (parsed.res && Array.isArray(parsed.res)) {
            // auth_challenge response: {"res": [id, "auth_challenge", {"challenge": "uuid"}, timestamp]}
            if (parsed.res[1] === "auth_challenge" && parsed.res[2]) {
              challengeUUID =
                parsed.res[2].challenge_message || parsed.res[2].challenge;
              console.log(
                "Extracted challenge UUID from auth_challenge:",
                challengeUUID
              );
            }
            // auth_verify message: [timestamp, "auth_verify", [{"address": "0x...", "challenge": "uuid"}], timestamp]
            else if (
              parsed.res[1] === "auth_verify" &&
              Array.isArray(parsed.res[2]) &&
              parsed.res[2][0]
            ) {
              challengeUUID = parsed.res[2][0].challenge;
              console.log(
                "Extracted challenge UUID from auth_verify:",
                challengeUUID
              );
            }
          }
          // Direct array format
          else if (
            Array.isArray(parsed) &&
            parsed.length >= 3 &&
            Array.isArray(parsed[2])
          ) {
            challengeUUID = parsed[2][0]?.challenge;
            console.log(
              "Extracted challenge UUID from direct array:",
              challengeUUID
            );
          }
        } catch (e) {
          console.error("Could not parse challenge data:", e);
          console.log("Using raw string as challenge");
          challengeUUID = data;
        }
      } else if (data && typeof data === "object") {
        // If data is already an object, try to extract challenge
        challengeUUID = data.challenge || data.challenge_message;
        console.log("Extracted challenge from object:", challengeUUID);
      }

      if (
        !challengeUUID ||
        challengeUUID.includes("[") ||
        challengeUUID.includes("{")
      ) {
        console.error(
          "Challenge extraction failed or contains invalid characters:",
          challengeUUID
        );
        throw new Error(
          "Could not extract valid challenge UUID for EIP-712 signing"
        );
      }

      console.log("Final challenge UUID for EIP-712:", challengeUUID);
      console.log("Signing for address:", address);
      console.log("Auth domain:", getAuthDomain());

      // Create EIP-712 message
      const message = {
        challenge: challengeUUID,
        scope: "app.auction.app",
        wallet: address as `0x${string}`,
        application: address as `0x${string}`,
        participant: stateSigner.address as `0x${string}`,
        expire: expire,
        allowances: [],
      };

      console.log("EIP-712 message to sign:", message);

      try {
        // Sign with EIP-712
        const signature = await walletClient.signTypedData({
          account: walletClient.account!,
          domain: getAuthDomain(),
          types: AUTH_TYPES,
          primaryType: "Policy",
          message: message,
        });

        console.log("EIP-712 signature generated for challenge:", signature);
        return signature as `0x${string}`;
      } catch (eip712Error) {
        console.error("EIP-712 signing failed:", eip712Error);
        console.log("Attempting fallback to regular message signing...");

        // try {
        //   // Fallback to regular message signing if EIP-712 fails
        //   const fallbackMessage = `Authentication challenge for ${address}: ${challengeUUID}`;

        //   console.log("Fallback message:", fallbackMessage);

        //   const fallbackSignature = await walletClient.signMessage(
        //     fallbackMessage
        //   );

        //   console.log("Fallback signature generated:", fallbackSignature);
        //   return fallbackSignature as `0x${string}`;
        // } catch (fallbackError) {
        //   console.error("Fallback signing also failed:", fallbackError);
        //   throw new Error(
        //     `Both EIP-712 and fallback signing failed: ${
        //       (eip712Error as Error)?.message
        //     }`
        //   );
        // }
      }
    };
  }

  // Message signer function
  const messageSigner: MessageSigner = useCallback(
    async (payload) => {
      if (!keypair) throw new Error("State wallet not available");

      const signer = createEthersSigner(keypair.privateKey);
      return signer.sign(payload);
    },
    [keypair]
  );

  // Create a signed request
  const createSignedRequest = useCallback(
    async (method: string, params: unknown[] = []): Promise<string> => {
      if (!keypair) throw new Error("State wallet not available");

      const requestId = generateRequestId();
      const timestamp = getCurrentTimestamp();
      const requestData = [requestId, method, params, timestamp];
      const request: any = { req: requestData };

      // Sign the request
      const signer = createEthersSigner(keypair.privateKey);
      const signature = await signer.sign(request);
      request.sig = [signature];

      return JSON.stringify(request);
    },
    [keypair]
  );

  // Send a message to the ClearNode
  const sendMessage = useCallback(
    (message: any): boolean => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        setError("WebSocket not connected");
        return false;
      }

      try {
        ws.send(
          typeof message === "string" ? message : JSON.stringify(message)
        );
        return true;
      } catch (error: any) {
        setError(`Error sending message: ${error.message}`);
        return false;
      }
    },
    [ws]
  );

  // Connect to the ClearNode
  const connect = useCallback(() => {
    if (ws) {
      ws.close();
    }

    if (!keypair) {
      console.error("Cannot connect without keypair");
      return;
    }

    setConnectionStatus("connecting");
    setError(null);

    const newWs = new WebSocket(clearNodeUrl);

    newWs.onopen = async () => {
      console.log("WebSocket opened, starting authentication");
      setConnectionStatus("connected");

      // Start authentication process
      try {
        // Check for JWT token first
        const jwtToken = localStorage.getItem("jwtToken");

        let authRequest: string;

        console.log("Using crypto keys:", keypair);
        const signer = createEthersSigner(keypair.privateKey);
        const eoaAddress = eoaWallet?.account?.address;
        console.log("Using EOA address:", eoaAddress);
        console.log("Using participant address:", signer.address);

        if (jwtToken) {
          console.log(
            "JWT token found, sending auth verification request with JWT token"
          );
          authRequest = await createAuthVerifyMessageWithJWT(jwtToken);
        } else {
          // Create the auth request with the EOA wallet address
          const authRequestPayload = {
            wallet: eoaAddress as `0x${string}`,
            participant: signer.address as `0x${string}`,
            app_name: "Auction App",
            scope: "app.auction.app",
            expire: expire,
            application: eoaAddress as `0x${string}`,
            allowances: [],
          };
          console.log("Auth request payload:", authRequestPayload);

          authRequest = await createAuthRequestMessage(authRequestPayload);
          console.log("Final auth request message:", authRequest);
        }
        newWs.send(authRequest);

        return new Promise<void>((resolve, reject) => {
          const handleAuthResponse = async (event: MessageEvent) => {
            let response;
            console.log("Received raw response:", event.data);

            try {
              response = JSON.parse(event.data);
              console.log("Parsed response:", response);
            } catch (error) {
              console.error("Failed to parse response:", error);
              return;
            }

            try {
              if (response.res && response.res[1] === "auth_challenge") {
                console.log(
                  "Got auth challenge, creating signing function with signer:",
                  signer.address
                );
                const eip712SigningFunction =
                  createEIP712SigningFunction(signer);
                console.log("Auth challenge response:", response);

                console.log(
                  "Creating auth verify message with data:",
                  event.data
                );
                const authVerify = await createAuthVerifyMessage(
                  eip712SigningFunction as MessageSigner,
                  event.data
                );
                console.log("Generated auth verify message:", authVerify);
                newWs.send(authVerify);
              } else if (
                response.res &&
                (response.res[1] === "auth_verify" ||
                  response.res[1] === "auth_success")
              ) {
                console.log(
                  "Authentication successful with response:",
                  response
                );

                // If response contains a JWT token, save it to local storage
                if (response.res[2]?.[0]?.["jwt_token"]) {
                  console.log(
                    "JWT token recieved:",
                    response.res[2][0]["jwt_token"]
                  );
                  localStorage.setItem(
                    "jwtToken",
                    response.res[2][0]["jwt_token"]
                  );
                }

                // Authentication successful
                setIsAuthenticated(true);
                resolve();
              } else if (response.res && response.res[1] === "error") {
                console.error("Received error response:", response);
                reject(new Error(JSON.stringify(response.res[2])));
              }
            } catch (err) {
              console.error("Error handling auth response:", err);
              reject(err);
            }
          };

          newWs.addEventListener("message", handleAuthResponse);
        });
      } catch (err) {
        console.error("Full auth request error:", err);
        setError(
          `Authentication request failed: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    };

    newWs.onerror = (error: Event) => {
      setError(
        `WebSocket error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      setConnectionStatus("error");
    };

    newWs.onclose = () => {
      setConnectionStatus("disconnected");
      setIsAuthenticated(false);
    };

    setWs(newWs);
  }, [clearNodeUrl, eoaWallet, keypair, expire]);

  // Initialize keypair on mount
  useEffect(() => {
    const initializeKeypair = async () => {
      try {
        const savedKeys = localStorage.getItem("crypto_keypair");
        if (savedKeys) {
          console.log("Found existing crypto keys, reusing them");
          setKeypair(JSON.parse(savedKeys));
        } else {
          console.log("No existing keys found, generating new ones");
          const newKeypair = await generateKeyPair();
          setKeypair(newKeypair);
          localStorage.setItem("crypto_keypair", JSON.stringify(newKeypair));
        }
      } catch (error) {
        console.error("Error initializing keypair:", error);
        setError("Failed to initialize keypair");
      }
    };

    initializeKeypair();
  }, []);

  // Connect when the component mounts and we have a keypair
  useEffect(() => {
    let isActive = true;

    if (clearNodeUrl && eoaWallet && keypair && isActive) {
      connect();
    }

    // Clean up on unmount
    return () => {
      isActive = false;
      if (ws) {
        ws.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearNodeUrl, eoaWallet, keypair, connect]);

  // Disconnect from the ClearNode
  const disconnect = useCallback(() => {
    if (ws) {
      ws.close();
      setWs(null);
    }
  }, [ws]);

  // Create helper methods for common operations
  const getChannels = useCallback(async () => {
    // Using the built-in helper function from NitroliteRPC
    const message = await createGetChannelsMessage(
      messageSigner,
      keypair?.address as `0x${string}`
    );
    return sendMessage(message);
  }, [messageSigner, sendMessage, keypair]);

  const getLedgerBalances = useCallback(
    async (channelId: any) => {
      // Using the built-in helper function from NitroliteRPC
      const message = await createGetLedgerBalancesMessage(
        messageSigner,
        channelId
      );
      return sendMessage(message);
    },
    [messageSigner, sendMessage]
  );

  const getConfig = useCallback(async () => {
    // Using the built-in helper function from NitroliteRPC
    const message = await createGetConfigMessage(messageSigner);
    return sendMessage(message);
  }, [messageSigner, sendMessage]);

  return {
    connectionStatus,
    isAuthenticated,
    error,
    ws,
    connect,
    disconnect,
    sendMessage,
    getChannels,
    getLedgerBalances,
    getConfig,
    createSignedRequest,
  };
}
