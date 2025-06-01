'use client';

import { useState, useEffect } from 'react';
import { useClearNodeConnection } from '@/hooks/useClearNodeConnection';
import { CLEARNODE_CONFIG } from '@/config/clearnode';
import { ethers } from 'ethers';
import { createWalletClient, custom, WalletClient } from 'viem';
import { polygon } from 'viem/chains';
import Auction from '@/components/Auction';

export default function Home() {
  const [wallet, setWallet] = useState<WalletClient | null>(null);
  const [address, setAddress] = useState<string>('');

  // Initialize wallet from MetaMask
  const initializeWallet = async () => {
    try {
      if (typeof window.ethereum === 'undefined') {
        throw new Error('Please install MetaMask');
      }

      // Request account access
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      // Create Web3Provider and get signer
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      const walletClient = createWalletClient({
        transport: custom(window.ethereum),
        chain: polygon,
        account: address as `0x${string}`,
      });

      console.log('Account:', walletClient);
      
      setWallet(walletClient);
      setAddress(address);
    } catch (error) {
      console.error('Failed to initialize wallet:', error);
    }
  };

  useEffect(() => {
    initializeWallet();
  }, []);

  const {
    connectionStatus,
    isAuthenticated,
    error,
    connect,
    sendMessage,
    createSignedRequest
  } = useClearNodeConnection(CLEARNODE_CONFIG.WS_URL, wallet);

  return (
    <main className="min-h-screen p-8 bg-gray-900">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-white">Off-Chain Auction System</h1>
        
        {/* Connection Status */}
        <div className="mb-8 p-4 bg-gray-800 rounded-lg border border-gray-700">
          <p className="mb-2 text-gray-200">Status: {connectionStatus}</p>
          {error && <p className="text-red-400 mb-2">{error}</p>}
          {!isAuthenticated && (
            <button
              onClick={connect}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors duration-200"
            >
              Connect to ClearNode
            </button>
          )}
        </div>

        {/* Wallet Status */}
        <div className="mb-8 p-4 bg-gray-800 rounded-lg border border-gray-700">
          <p className="mb-2 text-gray-200">
            Wallet: {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not Connected'}
          </p>
        </div>

        {/* Auction Component */}
        {wallet && isAuthenticated && (
          <Auction 
            wallet={wallet} 
            auctionId="default-auction-0x1" // TODO: Get from URL params or context
            isAuthenticated={isAuthenticated}
            connectionStatus={connectionStatus}
            sendMessage={sendMessage}
            createSignedRequest={createSignedRequest}
          />
        )}
      </div>
    </main>
  );
}
