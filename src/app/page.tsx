'use client';

import { useState, useEffect } from 'react';
import { useClearNodeConnection } from '@/hooks/useClearNodeConnection';
import { CLEARNODE_CONFIG } from '@/config/clearnode';
import { ethers } from 'ethers';
import { createWalletClient, custom, WalletClient } from 'viem';
import { polygon } from 'viem/chains';

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
    connect
  } = useClearNodeConnection(CLEARNODE_CONFIG.WS_URL, wallet);

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Off-Chain Auction System</h1>
        
        {/* Connection Status */}
        <div className="mb-8">
          <p className="mb-2">Status: {connectionStatus}</p>
          {error && <p className="text-red-500 mb-2">{error}</p>}
          {!isAuthenticated && (
            <button
              onClick={connect}
              className="bg-blue-500 text-white px-4 py-2 rounded"
            >
              Connect to ClearNode
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
