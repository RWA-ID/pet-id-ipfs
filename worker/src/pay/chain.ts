import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  keccak256,
  namehash,
  parseAbi,
  parseGwei,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import type { Env } from "./env";

export const REGISTRAR_ABI = parseAbi([
  "function isAvailable(bytes32 parentNode, string label) view returns (bool)",
  "function fulfiller() view returns (address)",
  "function orderNode(bytes32 orderRef) view returns (bytes32)",
  "function custodyOrder(bytes32 node) view returns (bytes32)",
  "function mintCustodial(bytes32 parentNode, string label, bytes contenthash, bytes32 orderRef) returns (bytes32)",
  "function releaseCustodial(bytes32 parentNode, string label, address to)",
]);

export const NAME_WRAPPER = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401" as const;
export const WRAPPER_ABI = parseAbi(["function ownerOf(uint256 id) view returns (address)"]);

export function chain(env: Env) {
  const account = privateKeyToAccount(env.FULFILLER_PRIVATE_KEY as Hex);
  const transport = http(env.RPC_URL);
  return {
    account,
    registrar: getAddress(env.REGISTRAR_ADDRESS),
    pub: createPublicClient({ chain: mainnet, transport }),
    wallet: createWalletClient({ account, chain: mainnet, transport }),
  };
}
export type Chain = ReturnType<typeof chain>;

/** The on-chain key for an order. Derived from Stripe's session id, which is unique per payment. */
export const orderRefFor = (stripeSessionId: string): Hex => keccak256(toBytes(stripeSessionId));

export const nodeOf = (parent: string, label: string): Hex => namehash(`${label}.${parent}`);

export function isAvailable(c: Chain, parent: string, label: string): Promise<boolean> {
  return c.pub.readContract({
    address: c.registrar, abi: REGISTRAR_ABI, functionName: "isAvailable", args: [namehash(parent), label],
  });
}

export async function gasTooHigh(env: Env, c: Chain): Promise<boolean> {
  return (await c.pub.getGasPrice()) > parseGwei(env.MAX_GAS_GWEI);
}

/** The exact text a buyer's wallet signs to prove it can receive the name. Shown to them verbatim. */
export function claimMessage(o: { id: string; parent: string; label: string }, to: Address): string {
  return [
    `PetID: claim ${o.label}.${o.parent}`,
    "",
    "Send this name permanently to my wallet:",
    to,
    "",
    `Order ${o.id}`,
  ].join("\n");
}
