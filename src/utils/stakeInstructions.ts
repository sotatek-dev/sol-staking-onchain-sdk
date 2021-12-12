import {PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction} from "@solana/web3.js";
import * as BufferLayout from 'buffer-layout';
import {CURRENT_STAKE_PROGRAM_ID} from "../constants";

export class StakeInstructions {
    static initStakeMemberAccount(
        owner: PublicKey,
        associatedStakeAccount: PublicKey,
        stake: PublicKey,
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
            programId: new PublicKey(CURRENT_STAKE_PROGRAM_ID),
            data,
        });
    }


    static initStakeMemberData(
        owner: PublicKey,
        stakePoolAddress: PublicKey,
        associatedStakeAccount: PublicKey,
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
            programId: new PublicKey(CURRENT_STAKE_PROGRAM_ID),
            data,
        });
    }
}