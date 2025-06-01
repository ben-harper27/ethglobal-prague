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
  } = useClearNodeConnection(CLEARNODE_CONFIG.WS_URL, wallet);

  return (
    <main className="min-h-screen p-8 bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 w-full h-full">
        <div className="absolute top-10 left-10 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute top-0 right-4 w-72 h-72 bg-yellow-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <div className="max-w-4xl mx-auto relative">
        <div className="text-center mb-12">
          <h1 className="text-6xl font-extrabold mb-4 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 text-transparent bg-clip-text animate-gradient">
            Flash Bid
          </h1>
          <p className="text-gray-300 text-xl">Instant, Secure, Revolutionary Auctions</p>
        </div>
        
        {/* Connection Status */}
        <div className="mb-8 p-6 rounded-xl border border-gray-700/50 bg-gray-900/40 backdrop-blur-xl shadow-2xl transform hover:scale-[1.02] transition-all duration-300">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white mb-2">Connection Status</h2>
              <p className="text-gray-300 mb-2">
                Status: <span className={`font-medium ${connectionStatus === 'Connected' ? 'text-green-400' : 'text-yellow-400'}`}>
                  {connectionStatus}
                </span>
              </p>
              {error && <p className="text-red-400 mb-2">{error}</p>}
            </div>
            {!isAuthenticated && (
              <button
                onClick={connect}
                className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-lg font-medium 
                          hover:from-blue-600 hover:to-purple-700 transform hover:scale-105 transition-all duration-200 
                          focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 shadow-lg"
              >
                Connect to ClearNode
              </button>
            )}
          </div>
        </div>

        {/* Wallet Status */}
        <div className="mb-8 p-6 rounded-xl border border-gray-700/50 bg-gray-900/40 backdrop-blur-xl shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-2">Wallet Status</h2>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${address ? 'bg-green-400' : 'bg-red-400'} animate-pulse`}></div>
            <p className="text-gray-300">
              {address ? (
                <span className="font-mono bg-gray-800 px-3 py-1 rounded-lg">
                  {`${address.slice(0, 6)}...${address.slice(-4)}`}
                </span>
              ) : 'Not Connected'}
            </p>
          </div>
        </div>

        {/* Auction Component */}
        {wallet && isAuthenticated && (
          <div className="transform transition-all duration-300 hover:scale-[1.01]">
            <Auction 
              wallet={wallet} 
              auctionId="default-auction-0x1"
              isAuthenticated={isAuthenticated}
              connectionStatus={connectionStatus}
            />
          </div>
        )}
      </div>
    </main>
  );
}
