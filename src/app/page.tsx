'use client';

import { useClearNodeConnection } from '../hooks/useClearNodeConnection';
import { CLEARNODE_CONFIG } from '@/config/clearnode';

export default function Home() {
  // TODO: Initialize your state wallet here
  const stateWallet = null; // Replace with actual wallet initialization

  const {
    connectionStatus,
    isAuthenticated,
    error,
    connect
  } = useClearNodeConnection(CLEARNODE_CONFIG.WS_URL, stateWallet);

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
