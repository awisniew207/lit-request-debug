import { type LitNodeClient } from "@lit-protocol/lit-node-client";
import {
  createSiweMessage,
  generateAuthSig,
  LitAccessControlConditionResource,
} from "@lit-protocol/auth-helpers";
import { AccessControlConditions } from "@lit-protocol/types";

import { getEnv, getEthersSigner, getLitNodeClient } from "./utils";
import { LIT_ABILITY, LIT_NETWORK } from "@lit-protocol/constants";
import { ethers } from "ethers";
import { LitContracts } from "@lit-protocol/contracts-sdk";

const ETHEREUM_PRIVATE_KEY0 = getEnv("ETHEREUM_PRIVATE_KEY0");
const ETHEREUM_PRIVATE_KEY1 = getEnv("ETHEREUM_PRIVATE_KEY1");

export const runExample = async () => {
  let litNodeClient: LitNodeClient;

  try {
    const randomWallet = ethers.Wallet.createRandom();
    const ethersSigner0 = getEthersSigner(ETHEREUM_PRIVATE_KEY0);
    const ethersSigner1 = getEthersSigner(ETHEREUM_PRIVATE_KEY1);
    litNodeClient = await getLitNodeClient();

    const accessControlConditions: AccessControlConditions = [
      {
        contractAddress: "",
        standardContractType: "",
        chain: "ethereum",
        method: "",
        parameters: [":userAddress"],
        returnValueTest: {
          comparator: "=",
          value: await randomWallet.getAddress(),
        },
      },
    ];

    const { ciphertext, dataToEncryptHash } = await litNodeClient.encrypt({
      dataToEncrypt: new TextEncoder().encode(
        "The answer to life, the universe, and everything is 42."
      ),
      accessControlConditions,
    });

    console.log(`ℹ️  ciphertext: ${ciphertext}`);
    console.log(`ℹ️  dataToEncryptHashh: ${dataToEncryptHash}`);

    const litContracts = new LitContracts({
      signer: ethersSigner1,
      network: LIT_NETWORK.DatilTest,
      debug: false,
    });
    await litContracts.connect();

    const tokens =
      await litContracts.rateLimitNftContractUtils.read.getTokensByOwnerAddress(
        await ethersSigner0.getAddress()
      );


    const { capacityDelegationAuthSig } =
      await litNodeClient.createCapacityDelegationAuthSig({
        dAppOwnerWallet: ethersSigner1,
        capacityTokenId: tokens[tokens.length - 1].tokenId,
        delegateeAddresses: [await randomWallet.getAddress()],
        uses: "1",
      });

    const sessionSignatures = await litNodeClient.getSessionSigs({
      chain: "ethereum",
      expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(), // 10 minutes
      capabilityAuthSigs: [capacityDelegationAuthSig],
      resourceAbilityRequests: [
        {
          resource: new LitAccessControlConditionResource("*"),
          ability: LIT_ABILITY.AccessControlConditionDecryption,
        },
      ],
      authNeededCallback: async ({
        uri,
        expiration,
        resourceAbilityRequests,
      }) => {
        const toSign = await createSiweMessage({
          uri,
          expiration,
          resources: resourceAbilityRequests,
          walletAddress: await randomWallet.getAddress(),
          nonce: await litNodeClient.getLatestBlockhash(),
          litNodeClient,
        });

        return await generateAuthSig({
          signer: randomWallet,
          toSign,
        });
      },
    });

    const decryptionResponse = await litNodeClient.decrypt({
      chain: "ethereum",
      sessionSigs: sessionSignatures,
      ciphertext,
      dataToEncryptHash,
      accessControlConditions,
    });

    const decryptedString = new TextDecoder().decode(
      decryptionResponse.decryptedData
    );
    console.log(`ℹ️  decryptedString: ${decryptedString}`);
    return decryptedString;
  } catch (error) {
    console.error(error);
  } finally {
    litNodeClient!.disconnect();
  }
};
