import {Connection, PublicKey, Transaction} from "@solana/web3.js";
import {StakeInstructions} from "./utils/stakeInstructions";
import {CURRENT_STAKE_PROGRAM_ID} from "./constants";

export class ActionsStaking {
    private connection: Connection;

    constructor(connection: Connection) {
        this.connection = connection;
    }

    async findAssociatedStakeAddress(
        targetAddress: PublicKey,
        stakePoolAddress,
    ): Promise<PublicKey> {
        return (
            await PublicKey.findProgramAddress(
                [
                    targetAddress.toBuffer(),
                    new PublicKey(CURRENT_STAKE_PROGRAM_ID).toBuffer(),
                    stakePoolAddress.toBuffer(),
                ],
                new PublicKey(CURRENT_STAKE_PROGRAM_ID),
            )
        )[0];
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
        transaction.add(
            StakeInstructions.initStakeMemberAccount(
                userAddress,
                new PublicKey(CURRENT_STAKE_PROGRAM_ID),
                stakePoolAddress,
            ),
            StakeInstructions.initStakeMemberData(
                userAddress,
                stakePoolAddress,
                memberStakeAccount,
            ),
        );

        return {transaction};
    }
}