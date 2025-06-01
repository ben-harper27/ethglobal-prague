# ⚡ FlashBid

**Gasless, high-speed auctions using ERC-7824 state channels via Yellow's Nitrolite SDK.**

FlashBid is a trustless auction platform where bidding happens off-chain using signed messages, and only the winning bid is finalized on-chain. It’s powered by the ERC-7824 standard and built with Yellow’s Nitrolite SDK.

---

## 🚀 Features

- 🟡 Off-chain bidding via ERC-7824 state channels
- ⏱️ Real-time countdown timer for auction expiration
- 🌐 Simple frontend with wallet connection via ethers/viem

---

## 🧱 Tech Stack

| Layer           | Tech                                     |
|-----------------|------------------------------------------|
| Frontend        | React, TypeScript, Tailwind, Ethers/Viem |
| Off-chain logic | `@erc7824/nitrolite` (Nitrolite SDK)     |
| Wallet Signing  | Ethers.js                                |

---

## 🧠 How It Works

1. **Start Auction**: A new auction is created with a duration and reserve price.
2. **Bid Off-Chain**: Participants submit signed bids using Nitrolite SDK, stored locally.
3. **Finalize**: After expiration, the top signed bid is submitted on-chain and the transaction is finalised.

---

## 🛠️ Setup & Run

```bash
# 1. Install dependencies
npm install

# 2. Run frontend locally
npm run dev
