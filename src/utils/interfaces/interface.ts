import {Transaction} from "@solana/web3.js";

export interface IExtractPoolData {
  nonce: number;
  version: number;
  admins: string,
  token_x_stake_account: string,
  token_y_reward_account: string,
}

export interface IResponseTxFee {
  rawTx: Buffer;
  unsignedTransaction: Transaction;
  txFee: number;
}
