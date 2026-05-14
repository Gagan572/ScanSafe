import { ethers } from 'ethers';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { createBlockchainEvent } from './db';
import { BlockchainEvent } from './types';

let provider: ethers.providers.JsonRpcProvider | null = null;
let wallet: ethers.Wallet | null = null;

const rpcUrl = process.env.WEB3_RPC_URL;
const privateKey = process.env.WEB3_PRIVATE_KEY;

if (rpcUrl && privateKey) {
  provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  wallet = new ethers.Wallet(privateKey, provider);
}

export function isBlockchainEnabled(): boolean {
  return !!(provider && wallet);
}

export async function recordBlockchainEvent(params: {
  qrId: string;
  eventType: string;
  metadata: any;
}): Promise<{ txHash: string; blockNumber: number; timestamp: number }> {
  const timestamp = Date.now();

  if (provider && wallet) {
    try {
      const dataStr = JSON.stringify({
        qrId: params.qrId,
        eventType: params.eventType,
        ts: timestamp,
        metadata: params.metadata,
      });
      const dataHash = crypto.createHash('sha256').update(dataStr).digest('hex');

      const tx = await wallet.sendTransaction({
        to: wallet.address,
        data: '0x' + dataHash,
        value: 0,
      });

      const receipt = await tx.wait(1);
      const blockNumber = receipt?.blockNumber ?? 0;

      const event: BlockchainEvent = {
        id: uuidv4(),
        qrId: params.qrId,
        eventType: params.eventType,
        metadata: params.metadata,
        txHash: tx.hash,
        blockNumber,
        timestamp,
      };

      await createBlockchainEvent(event);

      return { txHash: tx.hash, blockNumber, timestamp };
    } catch {
      // fall through to mock event below
    }
  }

  const randomHex = crypto.randomBytes(8).toString('hex');
  const txHash = 'MOCK_' + randomHex;
  const event: BlockchainEvent = {
    id: uuidv4(),
    qrId: params.qrId,
    eventType: params.eventType,
    metadata: params.metadata,
    txHash,
    blockNumber: 0,
    timestamp,
  };

  await createBlockchainEvent(event);

  return { txHash, blockNumber: 0, timestamp };
}
