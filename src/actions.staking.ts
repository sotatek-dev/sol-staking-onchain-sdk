import {Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction} from "@solana/web3.js";
import {StakeInstructions} from "./utils/stakeInstructions";
import {getProgramIdFromPool, IExtractPoolData, Instructions, IResponseTxFee, ISnapshot, MemberLayout, snapshotHistoryDetail, StakingPoolLayout} from "./utils";
import Decimal from "decimal.js";
import {AccountLayout, ASSOCIATED_TOKEN_PROGRAM_ID, MintLayout, Token, TOKEN_PROGRAM_ID} from "@solana/spl-token";
import { WRAPPED_SOL_MINT } from "@project-serum/serum/lib/token-instructions";

export class ActionsStaking {
    private connection: Connection;

    constructor(connection: Connection) {
        this.connection = connection;
    }

    public async getOwner(address: PublicKey): Promise<PublicKey> {
        const pool_acc = await this.connection.getAccountInfo(new PublicKey(address));
        if (!pool_acc?.data) {
            throw new Error(`Invalid address`);
        }

        return new PublicKey(pool_acc.owner);
    }
    public async getStakePoolProgramId(stakePoolAddress: PublicKey): Promise<PublicKey> {
        return this.getOwner(stakePoolAddress);
    }

    /**
     * Find the authority with specific address on-chain
     *
     * @returns Promise<PublicKey>
     * @param stakePoolAddress
     */
    async findPoolAuthority(stakePoolAddress: PublicKey): Promise<PublicKey> {
        const programId = await this.getStakePoolProgramId(stakePoolAddress);
        const [authority] = await PublicKey.findProgramAddress([stakePoolAddress.toBuffer()], programId);
        return authority;
    }

    async readPool(poolAddress: PublicKey): Promise<IExtractPoolData> {
        const accountInfo = await this.connection.getAccountInfo(poolAddress);
        if (!accountInfo) {
            throw new Error('Can not find pool address');
        }
        const result = StakingPoolLayout.decode(Buffer.from(accountInfo.data));
        let snapShots: ISnapshot[] = [];
        let reward_amount = 0;
        Object.keys(result).forEach(e => {
            if (e.includes("snap_")) {
                const snap = snapshotHistoryDetail.decode(Buffer.from(result[e]));
                reward_amount += (snap.token_y_reward_amount / 10**9);
                snapShots.push(snap);
            }
        });

        const balanceToken = await this.connection.getTokenAccountBalance(
            new PublicKey(result.token_x_stake_account)
        );

        const mintTokenXAddress = await this.getSPLMintTokenAccountInfo(new PublicKey(result.token_x_stake_account))
        const tokenXDecimal = await this.getTokenDecimalsFromMintAccount(mintTokenXAddress);
        const tokenXBalance = tokenXDecimal ? (+balanceToken?.value?.amount / 10**tokenXDecimal) : +balanceToken?.value?.amount
        
        const poolData = {
            nonce: result.nonce,
            version: result.version,
            snapShots: snapShots,
            admins: new PublicKey(result.admins).toString(),
            token_x_stake_account: new PublicKey(result.token_x_stake_account).toString(),
            token_y_reward_account: new PublicKey(result.token_y_reward_account).toString(),
            token_x_balance: tokenXBalance || 0,
            token_x_decimal: tokenXDecimal,
            total_reward: result.total_reward / 10**9,
            penalty_fee: result.penalty_fee,
            min_stake_hours: result.min_stake_hours,
            penalty_amount: result.penalty_amount / 10**tokenXDecimal,
            token_x_staked_amount: tokenXBalance - result.penalty_amount / 10**tokenXDecimal
        };
        

        return poolData;
    }

    public async updatePenaltyFee(
        adminAddress: PublicKey,
        poolAddress: PublicKey,
        fee: number,
        minStakeHours: number
    ) {
        const {blockhash} = await this.connection.getRecentBlockhash();
        const transaction = new Transaction({
        recentBlockhash: blockhash,
        feePayer: adminAddress,
        });
        const poolProgramId = await this.getPoolProgramId(poolAddress);
        const authority = await this.findPoolAuthority(poolAddress);

        const txFee = await this.getLamportPerSignature(blockhash);

        transaction.add(
        StakeInstructions.updatePenaltyFee(
            {
            poolAccount: poolAddress,
            adminAddress: adminAddress,
            },
            poolProgramId,
            {
                fee,
                minStakeHours
            }
        ),
        );

        const rawTx = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: true,
        });

        return {
        rawTx,
        txFee,
        unsignedTransaction: transaction,
        };
    }

    public async getPoolProgramId(poolAddress: PublicKey): Promise<PublicKey> {
        return this.getOwner(poolAddress);
    }

    async getBalance(tokenAccountAddress: PublicKey, tokenMintAddress = 'So11111111111111111111111111111111111111112') {
        try {
            const tokenDecimal = await this.getTokenDecimalsFromMintAccount(new PublicKey(tokenMintAddress));
            
            const stakeAccountAddress = await this.findAssociatedTokenAddress(tokenAccountAddress, new PublicKey(tokenMintAddress));
            console.log(stakeAccountAddress.toString(), '-----stakeAccountAddress', tokenAccountAddress.toString());
            const res = await this.connection.getTokenAccountBalance(
              stakeAccountAddress
            );
            
    
            return +res?.value?.amount / ( 10**tokenDecimal || 0) || 0;
        } catch (e) {
            console.log("???? ~ file: actions.staking.ts ~ line 93 ~ ActionsStaking ~ getBalance ~ e", e)
            return 0;
        }
      }

    async getClaimAvailale(memberStakeAccount: PublicKey, stakePoolAddress: PublicKey): Promise<number> {
        let claimable = 0;
        const {
            exists: isExisted,
            associatedAddress: stakePoolMemberAccount,
        } = await this.getStakePoolAssociatedAccountInfo(memberStakeAccount, stakePoolAddress);

        if (!isExisted) {
            return 0;
        }
        const accountInfo = await this.connection.getAccountInfo(stakePoolMemberAccount);
        if (!accountInfo) {
            throw new Error('Can not find stakePoolMemberAccount');
        }
        const memberData = MemberLayout.decode(Buffer.from(accountInfo.data));
        const poolData = await this.readPool(stakePoolAddress);
        if (poolData.snapShots?.length > 0) {
            poolData.snapShots.forEach(snapshot => {
                if (!(memberData.stake_at > snapshot.snapshot_at || memberData.withdraw_reward_at > snapshot.snapshot_at) && snapshot.token_x_total_staked_amount > 0) {
                    let accumulationAmount = snapshot.token_y_reward_amount / snapshot.token_x_total_staked_amount * memberData.token_x_staked_amount
                    claimable += accumulationAmount;
                }
            });
        }
    
        return claimable;
    }

    async getMemberData(memberStakeAccount: PublicKey, stakePoolAddress: PublicKey) {
        const {
            exists: isExisted,
            associatedAddress: stakePoolMemberAccount,
        } = await this.getStakePoolAssociatedAccountInfo(memberStakeAccount, stakePoolAddress);

        if (!isExisted) {
            return {};
        }
        const accountInfo = await this.connection.getAccountInfo(stakePoolMemberAccount);
        if (!accountInfo) {
            throw new Error('Can not find stakePoolMemberAccount data');
        }
        const memberData = MemberLayout.decode(Buffer.from(accountInfo.data));
        if (isNaN(memberData.token_x_staked_amount)) {
            memberData.token_x_staked_amount = 0
        }
        if (isNaN(memberData.unstaked_amount)) {
            memberData.unstake_amount = 0
        }
    
        return memberData;
    }


    // base function
    /**
     * Get associated address of target address and can mint token
     *
     * @param targetAddress PublicKey (target address need to find associated)
     * @param tokenMintAddress PublicKey (token can be mint by associated address)
     * @returns Promise<PublicKey>
     */
    async findAssociatedTokenAddress(
        targetAddress: PublicKey,
        tokenMintAddress: PublicKey,
    ): Promise<PublicKey> {
        return (
            await PublicKey.findProgramAddress(
                [targetAddress.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), tokenMintAddress.toBuffer()],
                ASSOCIATED_TOKEN_PROGRAM_ID,
            )
        )[0];
    }

    // base function
    public async getSPLMintTokenAccountInfo(tokenAccountAddress: PublicKey): Promise<PublicKey> {
        const token_acc = await this.connection.getAccountInfo(new PublicKey(tokenAccountAddress));
        if (!token_acc?.data) {
            throw new Error(`Invalid tokenAccountAddress`);
        }

        const tokenInfo = AccountLayout.decode(token_acc.data);
        return new PublicKey(tokenInfo.mint);
    }

    // base function
    public async getTokenDecimalsFromTokenAccount(tokenAccountAddress: PublicKey): Promise<number> {
        const mintAccount = await this.getSPLMintTokenAccountInfo(new PublicKey(tokenAccountAddress));
        const token_acc = await this.connection.getAccountInfo(new PublicKey(mintAccount));
        if (!token_acc?.data) {
            throw new Error(`Invalid token`);
        }
        const tokenInfo = MintLayout.decode(token_acc.data);
        return tokenInfo.decimals;
    }

    // base function
    public async getTokenDecimalsFromMintAccount(tokenAccountAddress: PublicKey): Promise<number> {
        const token_acc = await this.connection.getAccountInfo(new PublicKey(tokenAccountAddress));
        if (!token_acc?.data) {
            throw new Error(`Invalid token`);
        }
        const tokenInfo = MintLayout.decode(token_acc.data);
        return tokenInfo.decimals;
    }


    /**
     * Send reward from admin token Y account and create stake pool snapshot
     * @param payer
     * @param adminAddress
     * @param stakePoolAddress
     * @param amount
     */
    public async sendRewardToStakePoolByAdmin(
        payer: PublicKey,
        adminAddress: PublicKey,
        stakePoolAddress: PublicKey,
        amount: number, // this amount is a value after separated with token decimal big number
    ): Promise<IResponseTxFee> {
        const {blockhash} = await this.connection.getRecentBlockhash();
        const transaction = new Transaction({
            recentBlockhash: blockhash,
            feePayer: payer,
        });
        const stakePoolProgramId = await this.getStakePoolProgramId(stakePoolAddress);
        const {token_y_reward_account, token_x_stake_account} = await this.readPool(stakePoolAddress);
        const authority = await this.findPoolAuthority(stakePoolAddress);
        const mintTokenYAddress = await this.getSPLMintTokenAccountInfo(new PublicKey(token_y_reward_account))
        const adminTokenYAddress = await this.findAssociatedTokenAddress(adminAddress, new PublicKey(mintTokenYAddress));
        const tokenYDecimal = await this.getTokenDecimalsFromMintAccount(mintTokenYAddress);

        const txFee = await this.getLamportPerSignature(blockhash);
        const rentFee = await this.connection.getMinimumBalanceForRentExemption(AccountLayout.span);

        transaction.add(
            SystemProgram.transfer({
                fromPubkey: adminAddress,
                toPubkey: adminTokenYAddress,
                lamports: amount * LAMPORTS_PER_SOL + rentFee,
            }),
            Instructions.createAssociatedTokenAccountInstruction(
                payer,
                adminAddress,
                WRAPPED_SOL_MINT,
                adminTokenYAddress,
            ),
            // approve to pool to withdraw admin token Y
            Instructions.createApproveInstruction({
                programId: TOKEN_PROGRAM_ID,
                source: adminTokenYAddress,
                delegate: authority,
                owner: adminAddress,
                amount: amount * Math.pow(10, tokenYDecimal),
                signers: [adminAddress],
            }),
            StakeInstructions.sendRewardToPoolByAdmin(
                {
                    adminAccount: adminAddress,
                    adminAssociatedTokenYAccount: adminTokenYAddress,
                    poolTokenXStakeAccount: new PublicKey(token_x_stake_account),
                    poolTokenYRewardAccount: new PublicKey(token_y_reward_account),
                    stakePoolAccount: new PublicKey(stakePoolAddress),
                    stakePoolAuthority: new PublicKey(authority),
                    tokenProgramId: TOKEN_PROGRAM_ID
                },
                {
                    incoming_amount: amount * Math.pow(10, tokenYDecimal),
                },
                stakePoolProgramId,
            ),
            Instructions.closeAccountInstruction({
                programId: TOKEN_PROGRAM_ID,
                account: adminTokenYAddress,
                dest: adminAddress,
                owner: adminAddress,
                signers: [],
            }),
        );

        const rawTx = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
        });

        return {
            rawTx,
            txFee,
            unsignedTransaction: transaction,
        };
    }


    /**
     * Stake by user
     * @param payer
     * @param userAddress
     * @param stakePoolAddress PublicKey
     * @param amount number
     * @returns Promise<string> transaction id
     */
    public async stakeByUser(
        payer: PublicKey,
        userAddress: PublicKey,
        stakePoolAddress: PublicKey,
        amount: number,
    ): Promise<IResponseTxFee> {
        const {blockhash} = await this.connection.getRecentBlockhash();
        const transaction = new Transaction({
            recentBlockhash: blockhash,
            feePayer: payer,
        });
        const stakePoolProgramId = await this.getStakePoolProgramId(stakePoolAddress);
        const {token_x_stake_account, token_y_reward_account} = await this.readPool(stakePoolAddress);
        const authority = await this.findPoolAuthority(stakePoolAddress);
        const mintTokenXAddress = await this.getSPLMintTokenAccountInfo(new PublicKey(token_x_stake_account))
        const mintTokenYAddress = await this.getSPLMintTokenAccountInfo(new PublicKey(token_y_reward_account))
        const userTokenXAddress = await this.findAssociatedTokenAddress(userAddress, new PublicKey(mintTokenXAddress));
        const userTokenYAddress = await this.findAssociatedTokenAddress(userAddress, new PublicKey(mintTokenYAddress));
        const tokenXDecimal = await this.getTokenDecimalsFromMintAccount(mintTokenXAddress);

        const {
            exists: isExisted,
            associatedAddress: stakePoolMemberAccount,
        } = await this.getStakePoolAssociatedAccountInfo(userAddress, stakePoolAddress);

        const programId = await getProgramIdFromPool(this.connection, stakePoolAddress);

        if (!isExisted) {
            // create joined user data if not exists
            transaction.add(
                StakeInstructions.initStakeMemberAccount(
                    userAddress,
                    stakePoolMemberAccount,
                    stakePoolAddress,
                    programId
                ),
                StakeInstructions.initStakeMemberData(
                    userAddress,
                    stakePoolAddress,
                    stakePoolMemberAccount,
                    programId
                ),
            );
        }

        const {
            associatedAddress: associatedUserToken,
            exists: associatedAddressExists,
          } = await this.getAssociatedAccountInfo(userAddress, WRAPPED_SOL_MINT);

        if (!associatedAddressExists) {
            // create associated address if not exists
            transaction.add(
              Instructions.createAssociatedTokenAccountInstruction(
                userAddress,
                userAddress,
                WRAPPED_SOL_MINT,
                associatedUserToken,
              ),
            );
        }

        const txFee = await this.getLamportPerSignature(blockhash);
        transaction.add(
            Instructions.createApproveInstruction({
                programId: TOKEN_PROGRAM_ID,
                source: userTokenXAddress,
                delegate: authority,
                owner: userAddress,
                amount: amount * Math.pow(10, tokenXDecimal),
                signers: [userAddress],
            }),
            StakeInstructions.stakeByUser(
                {
                    poolTokenXStakeAccount: new PublicKey(token_x_stake_account),
                    poolTokenYRewardAccount:  new PublicKey(token_y_reward_account),
                    stakePoolAccount: new PublicKey(stakePoolAddress),
                    stakePoolAuthority: authority,
                    tokenProgramId: TOKEN_PROGRAM_ID,
                    userAccount: new PublicKey(userAddress),
                    userAssociatedTokenXAccount: new PublicKey(userTokenXAddress),
                    userAssociatedTokenYAccount: new PublicKey(userTokenYAddress),
                    userStakeAccount: new PublicKey(stakePoolMemberAccount)
                },
                {
                    incoming_amount: amount * Math.pow(10, tokenXDecimal),
                },
                stakePoolProgramId,
            ),
            Instructions.closeAccountInstruction({
                programId: TOKEN_PROGRAM_ID,
                account: associatedUserToken,
                dest: userAddress,
                owner: userAddress,
                signers: [],
            }),
        );

        const rawTx = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
        });

        return {
            rawTx,
            txFee,
            unsignedTransaction: transaction,
        };
    }

    /**
     * unStake by user
     * @param payer
     * @param userAddress
     * @param stakePoolAddress PublicKey
     * @param amount number
     * @returns Promise<string> transaction id
     */
     public async unStakeByUser(
        payer: PublicKey,
        userAddress: PublicKey,
        stakePoolAddress: PublicKey,
        amount: number,
    ): Promise<IResponseTxFee> {
        const {blockhash} = await this.connection.getRecentBlockhash();
        const transaction = new Transaction({
            recentBlockhash: blockhash,
            feePayer: payer,
        });
        const stakePoolProgramId = await this.getStakePoolProgramId(stakePoolAddress);
        const {token_x_stake_account, token_y_reward_account} = await this.readPool(stakePoolAddress);
        const authority = await this.findPoolAuthority(stakePoolAddress);
        const mintTokenXAddress = await this.getSPLMintTokenAccountInfo(new PublicKey(token_x_stake_account))
        const mintTokenYAddress = await this.getSPLMintTokenAccountInfo(new PublicKey(token_y_reward_account))
        const userTokenXAddress = await this.findAssociatedTokenAddress(userAddress, new PublicKey(mintTokenXAddress));
        const userTokenYAddress = await this.findAssociatedTokenAddress(userAddress, new PublicKey(mintTokenYAddress));
        const tokenXDecimal = await this.getTokenDecimalsFromMintAccount(mintTokenXAddress);

        const {
            exists: isExisted,
            associatedAddress: stakePoolMemberAccount,
        } = await this.getStakePoolAssociatedAccountInfo(userAddress, stakePoolAddress);
        const programId = await getProgramIdFromPool(this.connection, stakePoolAddress);

        if (!isExisted) {
            // create joined user data if not exists
            transaction.add(
                StakeInstructions.initStakeMemberAccount(
                    userAddress,
                    stakePoolMemberAccount,
                    stakePoolAddress,
                    programId
                ),
                StakeInstructions.initStakeMemberData(
                    userAddress,
                    stakePoolAddress,
                    new PublicKey(stakePoolMemberAccount),
                    programId
                ),
            );
        }

        const {
            associatedAddress: associatedUserToken,
            exists: associatedAddressExists,
          } = await this.getAssociatedAccountInfo(userAddress, WRAPPED_SOL_MINT);

        if (!associatedAddressExists) {
            // create associated address if not exists
            transaction.add(
              Instructions.createAssociatedTokenAccountInstruction(
                userAddress,
                userAddress,
                WRAPPED_SOL_MINT,
                associatedUserToken,
              ),
            );
        }

        const txFee = await this.getLamportPerSignature(blockhash);
        transaction.add(
            StakeInstructions.unStakeByUser(
                {
                    poolTokenXStakeAccount: new PublicKey(token_x_stake_account),
                    poolTokenYRewardAccount:  new PublicKey(token_y_reward_account),
                    stakePoolAccount: new PublicKey(stakePoolAddress),
                    stakePoolAuthority: authority,
                    tokenProgramId: TOKEN_PROGRAM_ID,
                    userAccount: new PublicKey(userAddress),
                    userAssociatedTokenXAccount: new PublicKey(userTokenXAddress),
                    userAssociatedTokenYAccount: new PublicKey(userTokenYAddress),
                    userStakeAccount: new PublicKey(stakePoolMemberAccount)
                },
                {
                    withdraw_amount: amount * Math.pow(10, tokenXDecimal),
                },
                stakePoolProgramId,
            ),
            Instructions.closeAccountInstruction({
                programId: TOKEN_PROGRAM_ID,
                account: associatedUserToken,
                dest: userAddress,
                owner: userAddress,
                signers: [],
            }),
        );

        const rawTx = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: true,
        });

        return {
            rawTx,
            txFee,
            unsignedTransaction: transaction,
        };
    }

    /**
     * unStake by user
     * @param payer PublicKey
     * @param adminAddress PublicKey
     * @param stakePoolAddress PublicKey
     * @returns Promise<string> transaction id
     */
     public async withdrawPenalty(
        payer: PublicKey,
        adminAddress: PublicKey,
        stakePoolAddress: PublicKey,
    ): Promise<IResponseTxFee> {
        const {blockhash} = await this.connection.getRecentBlockhash();
        const transaction = new Transaction({
            recentBlockhash: blockhash,
            feePayer: payer,
        });
        const stakePoolProgramId = await this.getStakePoolProgramId(stakePoolAddress);
        const {token_x_stake_account, token_y_reward_account} = await this.readPool(stakePoolAddress);
        const authority = await this.findPoolAuthority(stakePoolAddress);
        const mintTokenXAddress = await this.getSPLMintTokenAccountInfo(new PublicKey(token_x_stake_account))
        const adminTokenXAddress = await this.findAssociatedTokenAddress(adminAddress, new PublicKey(mintTokenXAddress));

        const {
            exists: isExisted,
            associatedAddress: stakePoolAdminAccount,
        } = await this.getStakePoolAssociatedAccountInfo(adminAddress, stakePoolAddress);
        const programId = await getProgramIdFromPool(this.connection, stakePoolAddress);

        if (!isExisted) {
            // create joined user data if not exists
            transaction.add(
                StakeInstructions.initStakeMemberAccount(
                    adminAddress,
                    stakePoolAdminAccount,
                    stakePoolAddress,
                    programId
                ),
                StakeInstructions.initStakeMemberData(
                    adminAddress,
                    stakePoolAddress,
                    new PublicKey(stakePoolAdminAccount),
                    programId
                ),
            );
        }

        const txFee = await this.getLamportPerSignature(blockhash);
        transaction.add(
            StakeInstructions.withdrawPenalty(
                {
                    stakePoolAccount: new PublicKey(stakePoolAddress),
                    stakePoolAuthority: authority,
                    tokenProgramId: TOKEN_PROGRAM_ID,
                    adminAddress,
                    adminAssociatedTokenXAccount: adminTokenXAddress,
                    poolTokenXStakeAccount:  new PublicKey(token_x_stake_account),
                },
                stakePoolProgramId,
            ),
        );

        const rawTx = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: true,
        });

        return {
            rawTx,
            txFee,
            unsignedTransaction: transaction,
        };
    }

    /**
     * Withdraw reward by user
     * @param payer
     * @param userAddress
     * @param stakePoolAddress PublicKey
     * @returns Promise<string> transaction id
     */
    public async withdrawRewardByUser(
        payer: PublicKey,
        userAddress: PublicKey,
        stakePoolAddress: PublicKey,
    ): Promise<IResponseTxFee> {
        const {blockhash} = await this.connection.getRecentBlockhash();
        const transaction = new Transaction({
            recentBlockhash: blockhash,
            feePayer: payer,
        });
        const stakePoolProgramId = await this.getStakePoolProgramId(stakePoolAddress);
        const {token_y_reward_account} = await this.readPool(stakePoolAddress);
        const authority = await this.findPoolAuthority(stakePoolAddress);
        const mintTokenYAddress = await this.getSPLMintTokenAccountInfo(new PublicKey(token_y_reward_account));
        const userTokenYAddress = await this.findAssociatedTokenAddress(userAddress, new PublicKey(mintTokenYAddress));

        const {
            exists: isExisted,
            associatedAddress: stakePoolMemberAccount,
        } = await this.getStakePoolAssociatedAccountInfo(userAddress, stakePoolAddress);
        const programId = await getProgramIdFromPool(this.connection, stakePoolAddress);

        if (!isExisted) {
            // create joined user data if not exists
            transaction.add(
                StakeInstructions.initStakeMemberAccount(
                    userAddress,
                    stakePoolMemberAccount,
                    stakePoolAddress,
                    programId
                ),
                StakeInstructions.initStakeMemberData(
                    userAddress,
                    stakePoolAddress,
                    new PublicKey(stakePoolMemberAccount),
                    programId
                ),
            );
        }

        const {
            associatedAddress: associatedUserToken,
            exists: associatedAddressExists,
          } = await this.getAssociatedAccountInfo(userAddress, WRAPPED_SOL_MINT);

        if (!associatedAddressExists) {
            // create associated address if not exists
            transaction.add(
              Instructions.createAssociatedTokenAccountInstruction(
                userAddress,
                userAddress,
                WRAPPED_SOL_MINT,
                associatedUserToken,
              ),
            );
          }

        const txFee = await this.getLamportPerSignature(blockhash);
        transaction.add(
            StakeInstructions.withdrawRewardsByUser(
                {
                    poolTokenYRewardAccount:  new PublicKey(token_y_reward_account),
                    stakePoolAccount: new PublicKey(stakePoolAddress),
                    stakePoolAuthority: authority,
                    tokenProgramId: TOKEN_PROGRAM_ID,
                    userAccount: new PublicKey(userAddress),
                    userAssociatedTokenYAccount: new PublicKey(userTokenYAddress),
                    userStakeAccount: new PublicKey(stakePoolMemberAccount)
                },
                stakePoolProgramId,
            ),
            Instructions.closeAccountInstruction({
                programId: TOKEN_PROGRAM_ID,
                account: associatedUserToken,
                dest: userAddress,
                owner: userAddress,
                signers: [],
            }),
        );

        const rawTx = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
        });

        return {
            rawTx,
            txFee,
            unsignedTransaction: transaction,
        };
    }


    /**
     * Check associated address exists or not
     *
     * @param targetAddress PublicKey
     * @param stakePoolAddress PublicKey
     * @returns Promise<{associatedAddress: PublicKey, exists: boolean}>
     */
    public async getStakePoolAssociatedAccountInfo(
        targetAddress: PublicKey,
        stakePoolAddress: PublicKey,
    ): Promise<{associatedAddress: PublicKey; exists: boolean}> {
        const associatedAccount = await this.findAssociatedStakeAddress(targetAddress, stakePoolAddress);

        try {
            const accountInfo = await this.connection.getAccountInfo(associatedAccount);

            return {
                associatedAddress: associatedAccount,
                exists: accountInfo ? true : false,
            };
        } catch (err) {
            return {
                associatedAddress: associatedAccount,
                exists: false,
            };
        }
    }

    async findAssociatedStakeAddress(
        targetAddress: PublicKey,
        stakePoolAddress,
    ): Promise<PublicKey> {
        const programId = await getProgramIdFromPool(this.connection, stakePoolAddress);
        if (programId) {
            return (
                await PublicKey.findProgramAddress(
                    [
                        targetAddress.toBuffer(),
                        programId.toBuffer(),
                        stakePoolAddress.toBuffer(),
                    ],
                    programId,
                )
            )[0];
        }
    }

    /**
     * Init stake member corresponded with a stake pool
     * @param payer
     * @param userAddress
     * @param stakePoolAddress
     */
    async initStakeMember(payer: PublicKey, userAddress: PublicKey, stakePoolAddress: PublicKey) {
        const recentBlockhash = await this.connection.getRecentBlockhash();
        const transaction = new Transaction({
            recentBlockhash: recentBlockhash.blockhash,
            feePayer: payer,
        });

        const memberStakeAccount = await this.findAssociatedStakeAddress(userAddress, stakePoolAddress);
        const programId = await getProgramIdFromPool(this.connection, stakePoolAddress);
        transaction.add(
            StakeInstructions.initStakeMemberAccount(
                userAddress,
                memberStakeAccount,
                stakePoolAddress,
                programId
            ),
            StakeInstructions.initStakeMemberData(
                userAddress,
                stakePoolAddress,
                memberStakeAccount,
                programId
            ),
        );

        return {transaction};
    }

    async getAssociatedAccountInfo(
        targetAddress: PublicKey,
        tokenMintAddress: PublicKey,
      ): Promise<{associatedAddress: PublicKey; exists: boolean}> {
        const associatedAccount = await this.findAssociatedTokenAddress(
          targetAddress,
          tokenMintAddress,
        );
    
        try {
          const accountInfo = await this.connection.getAccountInfo(associatedAccount);
    
          return {
            associatedAddress: associatedAccount,
            exists: !!accountInfo,
          };
        } catch (err) {
          return {
            associatedAddress: associatedAccount,
            exists: false,
          };
        }
    }

    // base function
    public async getLamportPerSignature(blockhash): Promise<number> {
        const feeCalculator = await this.connection.getFeeCalculatorForBlockhash(blockhash);

        const lamportsPerSignature =
            feeCalculator && feeCalculator.value ? feeCalculator.value.lamportsPerSignature : 0;

        return lamportsPerSignature;
    }
}