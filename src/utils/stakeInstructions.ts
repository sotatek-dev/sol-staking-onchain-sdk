import {PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction} from "@solana/web3.js";
import * as BufferLayout from 'buffer-layout';
import {clockSysvarAccount} from "../constants";
import * as Layout from './layout';
import {Numberu64} from "./layout";

export class StakeInstructions {

    static initStakeMemberAccount(
        owner: PublicKey,
        associatedStakeAccount: PublicKey,
        stake: PublicKey,
        programId: PublicKey
    ): TransactionInstruction {
        const keys = [
            {
                pubkey: SystemProgram.programId,
                isSigner: false,
                isWritable: false,
            },
            {pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false},
            {pubkey: owner, isSigner: true, isWritable: true},
            {pubkey: associatedStakeAccount, isSigner: false, isWritable: true},
            {pubkey: stake, isSigner: false, isWritable: false},
        ];

        const commandDataLayout = BufferLayout.struct([BufferLayout.u8('instruction')]);

        let data = Buffer.alloc(1024);
        {
            const encodeLength = commandDataLayout.encode(
                {
                    instruction: 1, // Early Join Pool instruction
                },
                data,
            );
            data = data.slice(0, encodeLength);
        }

        return new TransactionInstruction({
            keys,
            programId,
            data,
        });
    }


    static initStakeMemberData(
        owner: PublicKey,
        stakePoolAddress: PublicKey,
        associatedStakeAccount: PublicKey,
        programId: PublicKey
    ): TransactionInstruction {
        const keys = [
            {pubkey: associatedStakeAccount, isSigner: false, isWritable: true},
            {pubkey: stakePoolAddress, isSigner: false, isWritable: false},
            {pubkey: owner, isSigner: false, isWritable: false},
            {pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false},
        ];

        const commandDataLayout = BufferLayout.struct([BufferLayout.u8('instruction')]);

        let data = Buffer.alloc(1024);
        {
            const encodeLength = commandDataLayout.encode(
                {
                    instruction: 5, // init member data
                },
                data,
            );
            data = data.slice(0, encodeLength);
        }
        return new TransactionInstruction({
            keys,
            programId,
            data,
        });
    }

    static sendRewardToPoolByAdmin(
        accounts: {
            stakePoolAccount: PublicKey;
            stakePoolAuthority: PublicKey;
            tokenProgramId: PublicKey;

            adminAccount: PublicKey;
            adminAssociatedTokenYAccount: PublicKey;

            poolTokenXStakeAccount: PublicKey;
            poolTokenYRewardAccount: PublicKey;
        },
        inputData: {
            incoming_amount: number;
        },
        poolProgramId: PublicKey,
    ): TransactionInstruction {
        const {
            stakePoolAccount,
            stakePoolAuthority,

            adminAccount,
            adminAssociatedTokenYAccount,

            poolTokenXStakeAccount,
            poolTokenYRewardAccount,
            tokenProgramId,
        } = accounts;
        const keys = [
            {pubkey: stakePoolAccount, isSigner: false, isWritable: true},
            {pubkey: stakePoolAuthority, isSigner: false, isWritable: false},
            {pubkey: tokenProgramId, isSigner: false, isWritable: false},
            {pubkey: adminAccount, isSigner: true, isWritable: true},
            {pubkey: adminAssociatedTokenYAccount, isSigner: false, isWritable: true},
            {pubkey: poolTokenXStakeAccount, isSigner: false, isWritable: true},
            {pubkey: poolTokenYRewardAccount, isSigner: false, isWritable: true},
            {
                pubkey: clockSysvarAccount,
                isSigner: false,
                isWritable: false,
            },
        ];

        const commandDataLayout = BufferLayout.struct([
            BufferLayout.u8('instruction'),
            Layout.uint64('incoming_amount'),
        ]);

        let data = Buffer.alloc(1024);
        {
            const encodeLength = commandDataLayout.encode(
                {
                    instruction: 101, // Join instruction
                    incoming_amount: new Numberu64(inputData.incoming_amount).toBuffer(),
                },
                data,
            );
            data = data.slice(0, encodeLength);
        }

        return new TransactionInstruction({
            keys,
            programId: poolProgramId,
            data,
        });
    }


    static stakeByUser(
        accounts: {
            stakePoolAccount: PublicKey;
            stakePoolAuthority: PublicKey;
            tokenProgramId: PublicKey;

            userAccount: PublicKey;
            userStakeAccount: PublicKey;

            userAssociatedTokenXAccount: PublicKey;
            poolTokenXStakeAccount: PublicKey;

            userAssociatedTokenYAccount: PublicKey;
            poolTokenYRewardAccount: PublicKey;
        },
        inputData: {
            incoming_amount: number;
        },
        poolProgramId: PublicKey,
    ): TransactionInstruction {
        const {
            stakePoolAccount,
            stakePoolAuthority,
            userAccount,
            userStakeAccount,
            userAssociatedTokenXAccount,
            userAssociatedTokenYAccount,
            poolTokenXStakeAccount,
            poolTokenYRewardAccount,
            tokenProgramId,
        } = accounts;
        const keys = [
            {pubkey: stakePoolAccount, isSigner: false, isWritable: true},
            {pubkey: stakePoolAuthority, isSigner: false, isWritable: false},
            {pubkey: tokenProgramId, isSigner: false, isWritable: false},
            {pubkey: userAccount, isSigner: true, isWritable: true},
            {pubkey: userStakeAccount, isSigner: false, isWritable: true},
            {pubkey: userAssociatedTokenXAccount, isSigner: false, isWritable: true},
            {pubkey: poolTokenXStakeAccount, isSigner: false, isWritable: true},
            {pubkey: userAssociatedTokenYAccount, isSigner: false, isWritable: true},
            {pubkey: poolTokenYRewardAccount, isSigner: false, isWritable: true},
            {
                pubkey: clockSysvarAccount,
                isSigner: false,
                isWritable: false,
            },
        ];

        const commandDataLayout = BufferLayout.struct([
            BufferLayout.u8('instruction'),
            Layout.uint64('incoming_amount'),
        ]);

        let data = Buffer.alloc(1024);
        {
            const encodeLength = commandDataLayout.encode(
                {
                    instruction: 2, // stake instruction
                    incoming_amount: new Numberu64(inputData.incoming_amount).toBuffer(),
                },
                data,
            );
            data = data.slice(0, encodeLength);
        }

        return new TransactionInstruction({
            keys,
            programId: poolProgramId,
            data,
        });
    }

    static updatePenaltyFee(
        accounts: {
            poolAccount: PublicKey;
            adminAddress: PublicKey;
        },
        poolProgramId: PublicKey,
        inputData: {
            fee: number,
            minStakeHours: number
        }
    ): TransactionInstruction {
        const {poolAccount, adminAddress} = accounts;
        const keys = [
            {pubkey: poolAccount, isSigner: false, isWritable: true},
            {pubkey: adminAddress, isSigner: true, isWritable: true},
        ];

        const commandDataLayout = BufferLayout.struct([
            BufferLayout.u8('instruction'),
            BufferLayout.u32('new_penalty_fee'),
            BufferLayout.nu64('new_min_stake_hours'),
        ]);
        console.log('inputData.minStakeHours', inputData.minStakeHours);
        

        let data = Buffer.alloc(1024);
        {
            const encodeLength = commandDataLayout.encode(
            {
                instruction: 102, // Update Penalty Fee,
                new_penalty_fee: inputData.fee,
                new_min_stake_hours: inputData.minStakeHours

            },
            data,
            );
            data = data.slice(0, encodeLength);
        }

        return new TransactionInstruction({
            keys,
            programId: poolProgramId,
            data,
        })
    }

    static unStakeByUser(
        accounts: {
            stakePoolAccount: PublicKey;
            stakePoolAuthority: PublicKey;
            tokenProgramId: PublicKey;

            userAccount: PublicKey;
            userStakeAccount: PublicKey;

            userAssociatedTokenXAccount: PublicKey;
            poolTokenXStakeAccount: PublicKey;

            userAssociatedTokenYAccount: PublicKey;
            poolTokenYRewardAccount: PublicKey;
        },
        inputData: {
            withdraw_amount: number;
        },
        poolProgramId: PublicKey,
    ): TransactionInstruction {
        const {
            stakePoolAccount,
            stakePoolAuthority,
            userAccount,
            userStakeAccount,
            userAssociatedTokenXAccount,
            userAssociatedTokenYAccount,
            poolTokenXStakeAccount,
            poolTokenYRewardAccount,
            tokenProgramId,
        } = accounts;
        const keys = [
            {pubkey: stakePoolAccount, isSigner: false, isWritable: true},
            {pubkey: stakePoolAuthority, isSigner: false, isWritable: false},
            {pubkey: tokenProgramId, isSigner: false, isWritable: false},
            {pubkey: userAccount, isSigner: true, isWritable: true},
            {pubkey: userStakeAccount, isSigner: false, isWritable: true},
            {pubkey: userAssociatedTokenXAccount, isSigner: false, isWritable: true},
            {pubkey: poolTokenXStakeAccount, isSigner: false, isWritable: true},
            {pubkey: userAssociatedTokenYAccount, isSigner: false, isWritable: true},
            {pubkey: poolTokenYRewardAccount, isSigner: false, isWritable: true},
            {
                pubkey: clockSysvarAccount,
                isSigner: false,
                isWritable: false,
            },
        ];

        const commandDataLayout = BufferLayout.struct([
            BufferLayout.u8('instruction'),
            Layout.uint64('withdraw_amount'),
        ]);

        let data = Buffer.alloc(1024);
        {
            const encodeLength = commandDataLayout.encode(
                {
                    instruction: 4, // unstake instruction
                    withdraw_amount: new Numberu64(inputData.withdraw_amount).toBuffer(),
                },
                data,
            );
            data = data.slice(0, encodeLength);
        }

        return new TransactionInstruction({
            keys,
            programId: poolProgramId,
            data,
        });
    }

    static withdrawPenalty(
        accounts: {
            stakePoolAccount: PublicKey;
            stakePoolAuthority: PublicKey;
            tokenProgramId: PublicKey;

            adminAddress: PublicKey;
            adminAssociatedTokenXAccount: PublicKey;

            poolTokenXStakeAccount: PublicKey;
        },
        poolProgramId: PublicKey,
    ): TransactionInstruction {
        const {
            stakePoolAccount,
            stakePoolAuthority,
            tokenProgramId,
            adminAddress,
            adminAssociatedTokenXAccount,
            poolTokenXStakeAccount
        } = accounts;
        const keys = [
            {pubkey: stakePoolAccount, isSigner: false, isWritable: true},
            {pubkey: stakePoolAuthority, isSigner: false, isWritable: false},
            {pubkey: tokenProgramId, isSigner: false, isWritable: false},
            {pubkey: adminAddress, isSigner: true, isWritable: true},
            {pubkey: adminAssociatedTokenXAccount, isSigner: false, isWritable: true},
            {pubkey: poolTokenXStakeAccount, isSigner: false, isWritable: true}
        ];

        const commandDataLayout = BufferLayout.struct([
            BufferLayout.u8('instruction'),
        ]);

        let data = Buffer.alloc(1024);
        {
            const encodeLength = commandDataLayout.encode(
                {
                    instruction: 103, // withdraw amount instruction
                },
                data,
            );
            data = data.slice(0, encodeLength);
        }

        return new TransactionInstruction({
            keys,
            programId: poolProgramId,
            data,
        });
    }

    static withdrawRewardsByUser(
        accounts: {
            stakePoolAccount: PublicKey;
            stakePoolAuthority: PublicKey;

            userAccount: PublicKey;
            userStakeAccount: PublicKey;

            userAssociatedTokenYAccount: PublicKey;
            poolTokenYRewardAccount: PublicKey;
            tokenProgramId: PublicKey;
        },
        poolProgramId: PublicKey,
    ): TransactionInstruction {
        const {
            stakePoolAccount,
            stakePoolAuthority,
            userAccount,
            userStakeAccount,
            userAssociatedTokenYAccount,
            poolTokenYRewardAccount,
            tokenProgramId,
        } = accounts;
        const keys = [
            {pubkey: stakePoolAccount, isSigner: false, isWritable: true},
            {pubkey: stakePoolAuthority, isSigner: false, isWritable: false},
            {pubkey: userAccount, isSigner: true, isWritable: true},
            {pubkey: userStakeAccount, isSigner: false, isWritable: true},
            {pubkey: userAssociatedTokenYAccount, isSigner: false, isWritable: true},
            {pubkey: poolTokenYRewardAccount, isSigner: false, isWritable: true},
            {pubkey: tokenProgramId, isSigner: false, isWritable: false},
            {
                pubkey: clockSysvarAccount,
                isSigner: false,
                isWritable: false,
            },
        ];

        const commandDataLayout = BufferLayout.struct([
            BufferLayout.u8('instruction'),
        ]);

        let data = Buffer.alloc(1024);
        {
            const encodeLength = commandDataLayout.encode(
                {
                    instruction: 3, // withdraw reward instruction
                },
                data,
            );
            data = data.slice(0, encodeLength);
        }

        return new TransactionInstruction({
            keys,
            programId: poolProgramId,
            data,
        });
    }
}