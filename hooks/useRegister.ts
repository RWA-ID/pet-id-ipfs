"use client";
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { namehash } from "viem/ens";

export const REGISTRAR_ABI = [
  {
    name: "register",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "parentNode", type: "bytes32" },
      { name: "label", type: "string" },
      { name: "contenthash", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "isAvailable",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "parentNode", type: "bytes32" },
      { name: "label", type: "string" },
    ],
    outputs: [{ name: "available", type: "bool" }],
  },
  {
    name: "registrationFee",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const REGISTRAR_ADDRESS = process.env
  .NEXT_PUBLIC_PETID_REGISTRAR_ADDRESS as `0x${string}`;

export function useRegistrationFee() {
  const { data, isLoading } = useReadContract({
    address: REGISTRAR_ADDRESS,
    abi: REGISTRAR_ABI,
    functionName: "registrationFee",
  });
  return { fee: data as bigint | undefined, isLoading };
}

export function useRegister(parentDomain: "dogid.eth" | "catid.eth") {
  const { writeContractAsync, reset, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const { fee } = useRegistrationFee();

  const register = async (label: string, contenthash: `0x${string}`) => {
    const parentNode = namehash(parentDomain) as `0x${string}`;
    return writeContractAsync({
      address: REGISTRAR_ADDRESS,
      abi: REGISTRAR_ABI,
      functionName: "register",
      args: [parentNode, label, contenthash],
      value: fee,
    });
  };

  return { register, reset, fee, hash, isPending, isConfirming, isSuccess, error };
}
