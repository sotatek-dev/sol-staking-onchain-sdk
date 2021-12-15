import {Transaction} from "@solana/web3.js";

export interface IExtractPoolData {
  nonce: number,
  version: number,
  admins: string,
  snapShots: ISnapshot[],
  token_x_stake_account: string,
  token_y_reward_account: string,
}

export interface ISnapshot {
  token_y_reward_amount: number,
  token_x_total_staked_amount: number,
  snapshot_at: number,
}

export interface IResponseTxFee {
  rawTx: Buffer;
  unsignedTransaction: Transaction;
  txFee: number;
}
