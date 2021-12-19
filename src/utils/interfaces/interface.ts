import {Transaction} from "@solana/web3.js";

export interface IExtractPoolData {
  nonce: number,
  version: number,
  admins: string,
  snapShots: ISnapshot[],
  token_x_stake_account: string,
  token_x_staked_amount: number,
  token_x_balance: number,
  token_y_reward_account: string,
  token_x_decimal: number,
  total_reward: number,
  penalty_fee: number,
  min_stake_hours: number,
  penalty_amount: number,
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
