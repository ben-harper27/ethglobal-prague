import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { 
  createAuthRequestMessage, 
  createAuthVerifyMessage,
  createGetChannelsMessage,
  createGetLedgerBalancesMessage,
  createGetConfigMessage,
  generateRequestId, 
  getCurrentTimestamp
} from '@erc7824/nitrolite';
import { MessageSigner } from '@erc7824/nitrolite';
import { createEthersSigner, CryptoKeypair, WalletSigner } from '@/context/createSigner';
import { generateKeyPair } from '@/context/createSigner';
import { AUTH_TYPES } from '@/config/clearnode';

// Custom hook for ClearNode connection
export function useClearNodeConnection(clearNodeUrl: string, eoaWallet: ethers.JsonRpcSigner) {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      return async (data: any): Promise<`0x${string}`> => {
          console.log("Signing auth_verify challenge with EIP-712:", data);

          let challengeUUID = "";
          const address = await walletClient.getAddress();

          // The data coming in is the array from createAuthVerifyMessage
          // Format: [timestamp, "auth_verify", [{"address": "0x...", "challenge": "uuid"}], timestamp]
          if (Array.isArray(data)) {
              console.log("Data is array, extracting challenge from position [2][0].challenge");

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
                          challengeUUID = parsed.res[2].challenge_message || parsed.res[2].challenge;
                          console.log("Extracted challenge UUID from auth_challenge:", challengeUUID);
                      }
                      // auth_verify message: [timestamp, "auth_verify", [{"address": "0x...", "challenge": "uuid"}], timestamp]
                      else if (parsed.res[1] === "auth_verify" && Array.isArray(parsed.res[2]) && parsed.res[2][0]) {
                          challengeUUID = parsed.res[2][0].challenge;
                          console.log("Extracted challenge UUID from auth_verify:", challengeUUID);
                      }
                  }
                  // Direct array format
                  else if (Array.isArray(parsed) && parsed.length >= 3 && Array.isArray(parsed[2])) {
                      challengeUUID = parsed[2][0]?.challenge;
                      console.log("Extracted challenge UUID from direct array:", challengeUUID);
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

          if (!challengeUUID || challengeUUID.includes("[") || challengeUUID.includes("{")) {
              console.error("Challenge extraction failed or contains invalid characters:", challengeUUID);
              throw new Error("Could not extract valid challenge UUID for EIP-712 signing");
          }

          console.log("Final challenge UUID for EIP-712:", challengeUUID);
          console.log("Signing for address:", address);
          console.log("Auth domain:", getAuthDomain());

          // Create EIP-712 message
          const message = {
              challenge: challengeUUID,
              scope: "app.nitro.aura",
              wallet: address as `0x${string}`,
              application: address as `0x${string}`,
              participant: stateSigner.address as `0x${string}`,
              expire: expire,
              allowances: [],
          };

          console.log("EIP-712 message to sign:", message);

          try {
              // Sign with EIP-712
              const signature = await walletClient.signTypedData(
                  getAuthDomain(),
                  AUTH_TYPES,
                  message
              );

              console.log("EIP-712 signature generated for challenge:", signature);
              return signature as `0x${string}`;
          } catch (eip712Error) {
              console.error("EIP-712 signing failed:", eip712Error);
              console.log("Attempting fallback to regular message signing...");

              try {
                  // Fallback to regular message signing if EIP-712 fails
                  const fallbackMessage = `Authentication challenge for ${address}: ${challengeUUID}`;

                  console.log("Fallback message:", fallbackMessage);

                  const fallbackSignature = await walletClient.signMessage(
                      fallbackMessage,
                  );

                  console.log("Fallback signature generated:", fallbackSignature);
                  return fallbackSignature as `0x${string}`;
              } catch (fallbackError) {
                  console.error("Fallback signing also failed:", fallbackError);
                  throw new Error(`Both EIP-712 and fallback signing failed: ${(eip712Error as Error)?.message}`);
              }
          }
      };
  }
  
  // Message signer function
  const messageSigner: MessageSigner = useCallback(async (payload) => {
    if (!eoaWallet) throw new Error('State wallet not available');
    
    try {
      const message = JSON.stringify(payload);
      const digestHex = ethers.id(message);
      const messageBytes = ethers.getBytes(digestHex);
      const { serialized: signature } = eoaWallet.signingKey.sign(messageBytes);
      return signature;
    } catch (error) {
      console.error("Error signing message:", error);
      throw error;
    }
  }, [eoaWallet]);
  
  // Create a signed request
  const createSignedRequest = useCallback(async (method: string, params: unknown[] = []): Promise<string> => {
    if (!eoaWallet) throw new Error('State wallet not available');
    
    const requestId = generateRequestId();
    const timestamp = getCurrentTimestamp();
    const requestData = [requestId, method, params, timestamp];
    const request: any = { req: requestData };
    
    // Sign the request
    const message = JSON.stringify(request);
    const digestHex = ethers.id(message);
    const messageBytes = ethers.getBytes(digestHex);
    const { serialized: signature } = eoaWallet.signingKey.sign(messageBytes);
    request.sig = [signature];
    
    return JSON.stringify(request);
  }, [eoaWallet]);
  
  // Send a message to the ClearNode
  const sendMessage = useCallback((message: any): boolean => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError('WebSocket not connected');
      return false;
    }
    
    try {
      ws.send(typeof message === 'string' ? message : JSON.stringify(message));
      return true;
    } catch (error: any) {
      setError(`Error sending message: ${error.message}`);
      return false;
    }
  }, [ws]);
  
  // Connect to the ClearNode
  const connect = useCallback(() => {
    if (ws) {
      ws.close();
    }
    
    setConnectionStatus('connecting');
    setError(null);
    
    const newWs = new WebSocket(clearNodeUrl);
    
    newWs.onopen = async () => {
      console.log('WebSocket opened, starting authentication');
      setConnectionStatus('connected');
      
      // Start authentication process
      try {
        console.log('Creating auth request message');
        const newKeyPair = await generateKeyPair();
        localStorage.setItem("crypto_keypair", JSON.stringify(newKeyPair));
        console.log("Generated and stored new crypto keys");
        const signer = createEthersSigner(newKeyPair.privateKey);
        const eoaAddress = await eoaWallet.getAddress();
        const authRequest = await createAuthRequestMessage({
          wallet: eoaAddress as `0x${string}`,
          participant: signer.address as `0x${string}`,
          app_name: "Auction App",
          expire: expire,
          application: eoaAddress as `0x${string}`,
          allowances: []
        });
        console.log('Auth request created:', authRequest);
        newWs.send(authRequest);
        return new Promise<void>((resolve, reject) => {
          const handleAuthResponse = async (event: MessageEvent) => {
            let response;

            try {
              response = JSON.parse(event.data);
            } catch (error) {
              return;
            }

            try {
              if (response.res && response.res[1] === 'auth_challenge') {
                const eip712SigningFunction = createEIP712SigningFunction(signer);
                console.log("Calling createAuthVerifyMessage");
                const authVerify = await createAuthVerifyMessage(
                  eip712SigningFunction,
                  event.data
                );
                newWs.send(authVerify);
              } else if (response.res && (response.res[1] === "auth_verify" || response.res[1] === "auth_success")) {
                console.log("Authentication successful");
                resolve();
              }
            } catch (err: any) {
              console.error('Error handling auth response:', err);
              reject(err);
            }
          };

          newWs.addEventListener('message', handleAuthResponse);
        });
      } catch (err: any) {
        console.error('Full auth request error:', err);
        setError(`Authentication request failed: ${err.message}`);
      }
    };
    
    newWs.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('Received message:', message);
        
        // Handle authentication flow
        if (message.res && message.res[1] === 'auth_challenge') {
          try {
            console.log('Received auth challenge, creating verify message');
            const savedKeys = localStorage.getItem("crypto_keypair");
            if (!savedKeys) {
              throw new Error("No saved keys found");
            }
            const keypair = JSON.parse(savedKeys) as CryptoKeypair;
            const signer = createEthersSigner(keypair.privateKey);
            const eip712SigningFunction = createEIP712SigningFunction(signer);
            console.log("Calling createAuthVerifyMessage");
            const authVerify = await createAuthVerifyMessage(
              eip712SigningFunction,
              event.data
            );
            console.log('Auth verify created:', authVerify);
            newWs.send(authVerify);
          } catch (err: any) {
            console.error('Full auth verify error:', err);
            setError(`Authentication verification failed: ${err.message}`);
          }
        } else if (message.res && message.res[1] === 'auth_success') {
          console.log('Authentication successful');
          setIsAuthenticated(true);
        } else if (message.res && message.res[1] === 'auth_failure') {
          console.error('Authentication failed:', message.res[2]);
          setIsAuthenticated(false);
          setError(`Authentication failed: ${message.res[2]}`);
        }
        
        // Additional message handling can be added here
      } catch (err: any) {
        console.error('Error handling message:', err);
      }
    };
    
    newWs.onerror = (error: any) => {
      setError(`WebSocket error: ${error.message}`);
      setConnectionStatus('error');
    };
    
    newWs.onclose = () => {
      setConnectionStatus('disconnected');
      setIsAuthenticated(false);
    };
    
    setWs(newWs);
  }, [clearNodeUrl, messageSigner, eoaWallet]);
  
  // Disconnect from the ClearNode
  const disconnect = useCallback(() => {
    if (ws) {
      ws.close();
      setWs(null);
    }
  }, [ws]);
  
  // Connect when the component mounts
  useEffect(() => {
    if (clearNodeUrl && eoaWallet) {
      connect();
    }
    
    // Clean up on unmount
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [clearNodeUrl, eoaWallet, connect]);
  
  // Create helper methods for common operations
  const getChannels = useCallback(async () => {
    // Using the built-in helper function from NitroliteRPC
    const message = await createGetChannelsMessage(
      messageSigner,
      eoaWallet?.address || "0x"
    );
    return sendMessage(message);
  }, [messageSigner, sendMessage, eoaWallet]);
  
  const getLedgerBalances = useCallback(async (channelId: any) => {
    // Using the built-in helper function from NitroliteRPC
    const message = await createGetLedgerBalancesMessage(
      messageSigner,
      channelId
    );
    return sendMessage(message);
  }, [messageSigner, sendMessage]);
  
  const getConfig = useCallback(async () => {
    // Using the built-in helper function from NitroliteRPC
    const message = await createGetConfigMessage(
      messageSigner,
      eoaWallet?.address || "0x"
    );
    return sendMessage(message);
  }, [messageSigner, sendMessage, eoaWallet]);
  
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
    createSignedRequest
  };
}
