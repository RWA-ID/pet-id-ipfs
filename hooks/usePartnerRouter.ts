"use client";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { namehash } from "viem/ens";

export const ROUTER_ABI = [
  {
    name: "registerViaPartner",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "parentNode", type: "bytes32" },
      { name: "label", type: "string" },
      { name: "contenthash", type: "bytes" },
      { name: "partner", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "setPartner",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "price", type: "uint256" },
      { name: "name", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "partnerInfo",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "partner", type: "address" }],
    outputs: [
      { name: "price", type: "uint256" },
      { name: "name", type: "string" },
      { name: "baseFee", type: "uint256" },
      { name: "accrued", type: "uint256" },
    ],
  },
] as const;

export const ROUTER_ADDRESS = process.env
  .NEXT_PUBLIC_PETID_ROUTER_ADDRESS as `0x${string}`;

/** Live partner config — price, display name, base fee, accrued earnings. */
export function usePartnerInfo(partner?: `0x${string}`) {
  const { data, isLoading, refetch } = useReadContract({
    address: ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: "partnerInfo",
    args: partner ? [partner] : undefined,
    query: { enabled: !!partner && !!ROUTER_ADDRESS },
  });
  const [price, name, baseFee, accrued] = (data ?? []) as unknown as [
    bigint, string, bigint, bigint
  ];
  return { price, name, baseFee, accrued, isLoading, refetch };
}

/** Register through a partner at the partner's price. */
export function useRegisterViaPartner(parentDomain: "dogid.eth" | "catid.eth") {
  const { writeContractAsync, reset, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const register = async (
    label: string,
    contenthash: `0x${string}`,
    partner: `0x${string}`,
    price: bigint
  ) => {
    const parentNode = namehash(parentDomain) as `0x${string}`;
    return writeContractAsync({
      address: ROUTER_ADDRESS,
      abi: ROUTER_ABI,
      functionName: "registerViaPartner",
      args: [parentNode, label, contenthash, partner],
      value: price,
    });
  };

  return { register, reset, hash, isPending, isConfirming, isSuccess, error };
}

/** Partner self-service: set price/name, withdraw earnings. */
export function usePartnerAdmin() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const setPartner = (price: bigint, name: string) =>
    writeContractAsync({
      address: ROUTER_ADDRESS,
      abi: ROUTER_ABI,
      functionName: "setPartner",
      args: [price, name],
    });

  const withdraw = () =>
    writeContractAsync({
      address: ROUTER_ADDRESS,
      abi: ROUTER_ABI,
      functionName: "withdraw",
      args: [],
    });

  return { setPartner, withdraw, hash, isPending, isConfirming, isSuccess, error };
}
