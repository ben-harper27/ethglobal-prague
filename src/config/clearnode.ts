export const CLEARNODE_CONFIG = {
    // Replace these with your actual values
    WS_URL: process.env.NEXT_PUBLIC_CLEARNODE_WS_URL || 'wss://your-clearnode-url',
    APP_NAME: 'Auction App',
    APP_ADDRESS: process.env.NEXT_PUBLIC_APP_ADDRESS || '0xYourApplicationAddress',
    CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID || '137', // Default to Polygon
    CONTRACT_ADDRESS: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0xYourContractAddress',
};

export const AUTH_TYPES = {
    EIP712Domain: [
        { name: 'name', type: 'string' }
    ],
    Policy: [
        { name: 'challenge', type: 'string' },
        { name: 'scope', type: 'string' },
        { name: 'wallet', type: 'address' },
        { name: 'application', type: 'address' },
        { name: 'participant', type: 'address' },
        { name: 'expire', type: 'uint256' },
        { name: 'allowances', type: 'Allowance[]' }
    ],
    Allowance: [
        { name: 'asset', type: 'string' },
        { name: 'amount', type: 'uint256' }
    ]
};