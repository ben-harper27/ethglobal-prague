import { Wallet } from 'ethers';

// Generate a new random wallet
const wallet = Wallet.createRandom();

console.log('\nGenerated Wallet Info:');
console.log('---------------------');
console.log('Address:', wallet.address);
console.log('Private Key:', wallet.privateKey);
console.log('\nAdd this to your .env file as:');
console.log('SERVER_PRIVATE_KEY=' + wallet.privateKey);
console.log('\nKeep this private key safe and never share it!\n'); 