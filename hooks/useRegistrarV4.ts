"use client";
import { useCallback, useState } from "react";
import {
  useAccount,
  useReadContract,
  useSignTypedData,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { readContract } from "wagmi/actions";
import { namehash } from "viem/ens";
import { zeroAddress } from "viem";
import { wagmiConfig } from "@/lib/wagmi";

export const REGISTRAR_V4_ABI = [
  {
    name: "registerWithEth",
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
    name: "registerWithUsdc",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "parentNode", type: "bytes32" },
      { name: "label", type: "string" },
      { name: "contenthash", type: "bytes" },
      { name: "partner", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "registerWithUsdcPermit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "parentNode", type: "bytes32" },
      { name: "label", type: "string" },
      { name: "contenthash", type: "bytes" },
      { name: "partner", type: "address" },
      { name: "permitValue", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "quote",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "buyer", type: "address" },
      { name: "partner", type: "address" },
    ],
    outputs: [
      { name: "usdCents", type: "uint256" },
      { name: "weiAmount", type: "uint256" },
      { name: "usdcAmount", type: "uint256" },
    ],
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
    name: "partnerInfo",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "partner", type: "address" }],
    outputs: [
      { name: "priceUsdCents", type: "uint256" },
      { name: "name", type: "string" },
      { name: "wholesaleUsdCents", type: "uint256" },
      { name: "accruedEth", type: "uint256" },
      { name: "accruedUsdc", type: "uint256" },
    ],
  },
  {
    name: "setPartnerPrice",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "priceUsdCents", type: "uint256" },
      { name: "name", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "withdrawEarnings",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "wholesaler",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "retailPriceUsd",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "wholesalePriceUsd",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const USDC_ABI = [
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "nonces",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const REGISTRAR_ADDRESS = process.env
  .NEXT_PUBLIC_PETID_REGISTRAR_V4_ADDRESS as `0x${string}`;

export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS ??
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48") as `0x${string}`;

export type PayWith = "eth" | "usdc";

/** Format cents as $19.99. */
export const formatUsd = (cents?: bigint) =>
  cents === undefined ? "—" : `$${(Number(cents) / 100).toFixed(2)}`;

/** Format wei with enough precision to be meaningful at ETH prices. */
export const formatEth = (wei?: bigint) =>
  wei === undefined ? "—" : `${(Number(wei) / 1e18).toFixed(5)} ETH`;

/** Format 6-decimal USDC units as 19.99 USDC. */
export const formatUsdc = (units?: bigint) =>
  units === undefined ? "—" : `${(Number(units) / 1e6).toFixed(2)} USDC`;

/**
 * Live price for this buyer: USD is authoritative, the ETH leg floats with the
 * Chainlink rate. Refetches on an interval so a quote can't go stale on screen
 * while someone fills in the form.
 */
export function useQuote(partner?: `0x${string}`) {
  const { address } = useAccount();
  const { data, isLoading, error, refetch } = useReadContract({
    address: REGISTRAR_ADDRESS,
    abi: REGISTRAR_V4_ABI,
    functionName: "quote",
    args: [address ?? zeroAddress, partner ?? zeroAddress],
    query: {
      enabled: !!REGISTRAR_ADDRESS,
      refetchInterval: 30_000,
      // A quote read reverts for an unknown partner — don't hammer it.
      retry: false,
    },
  });
  const [usdCents, weiAmount, usdcAmount] = (data ?? []) as unknown as [
    bigint,
    bigint,
    bigint,
  ];
  return { usdCents, weiAmount, usdcAmount, isLoading, error, refetch };
}

/**
 * Approved-reseller status *with* its loading flag.
 *
 * The boolean alone is indistinguishable from "not approved" while the read is
 * in flight, so any UI that branches on it flashes the unapproved state first —
 * an approved partner sees the application form for a beat before their
 * dashboard. Branch on `isLoading` to avoid that.
 */
export function useWholesalerStatus() {
  const { address } = useAccount();
  const enabled = !!address && !!REGISTRAR_ADDRESS;
  const { data, isLoading } = useReadContract({
    address: REGISTRAR_ADDRESS,
    abi: REGISTRAR_V4_ABI,
    functionName: "wholesaler",
    args: address ? [address] : undefined,
    query: { enabled },
  });
  return { approved: data === true, isLoading: enabled && isLoading };
}

/** Whether the connected wallet is an approved reseller (gets wholesale). */
export function useIsWholesaler() {
  return useWholesalerStatus().approved;
}

/** USDC balance of the connected wallet, for an affordability check. */
export function useUsdcBalance() {
  const { address } = useAccount();
  const { data, refetch } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  return { balance: data as bigint | undefined, refetch };
}

export type UsdcStep = "idle" | "signing-permit" | "approving" | "registering";

/**
 * Registration against v4.
 *
 * ETH pays in one transaction. USDC needs an allowance first — we try an
 * EIP-2612 permit signature (free, no transaction) and fall back to a plain
 * approve transaction if the wallet can't sign typed data.
 */
export function useRegisterV4(parentDomain: "dogid.eth" | "catid.eth") {
  const { address } = useAccount();
  const { writeContractAsync, reset, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const { signTypedDataAsync } = useSignTypedData();
  const [usdcStep, setUsdcStep] = useState<UsdcStep>("idle");

  const register = useCallback(
    async (
      label: string,
      contenthash: `0x${string}`,
      payWith: PayWith,
      partner?: `0x${string}`,
    ) => {
      if (!address) throw new Error("Wallet not connected");
      const parentNode = namehash(parentDomain) as `0x${string}`;
      const partnerArg = partner ?? zeroAddress;

      // Re-quote at submit time rather than trusting whatever the UI last
      // rendered — ETH/USD may have moved while the form was being filled.
      const [, weiAmount, usdcAmount] = (await readContract(wagmiConfig, {
        address: REGISTRAR_ADDRESS,
        abi: REGISTRAR_V4_ABI,
        functionName: "quote",
        args: [address, partnerArg],
      })) as unknown as [bigint, bigint, bigint];

      if (payWith === "eth") {
        // Send a small buffer so a rate move between quoting and mining doesn't
        // revert the mint. The contract refunds every wei of the excess.
        const withBuffer = (weiAmount * 102n) / 100n;
        return writeContractAsync({
          address: REGISTRAR_ADDRESS,
          abi: REGISTRAR_V4_ABI,
          functionName: "registerWithEth",
          args: [parentNode, label, contenthash, partnerArg],
          value: withBuffer,
        });
      }

      // ── USDC ──
      const allowance = (await readContract(wagmiConfig, {
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: "allowance",
        args: [address, REGISTRAR_ADDRESS],
      })) as bigint;

      if (allowance >= usdcAmount) {
        setUsdcStep("registering");
        try {
          return await writeContractAsync({
            address: REGISTRAR_ADDRESS,
            abi: REGISTRAR_V4_ABI,
            functionName: "registerWithUsdc",
            args: [parentNode, label, contenthash, partnerArg],
          });
        } finally {
          setUsdcStep("idle");
        }
      }

      // Try a gasless permit first — one signature instead of a whole tx.
      try {
        setUsdcStep("signing-permit");
        const nonce = (await readContract(wagmiConfig, {
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: "nonces",
          args: [address],
        })) as bigint;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

        const signature = await signTypedDataAsync({
          domain: {
            name: "USD Coin",
            version: "2", // FiatTokenV2 — a wrong domain just fails the try and falls back
            chainId: 1,
            verifyingContract: USDC_ADDRESS,
          },
          types: {
            Permit: [
              { name: "owner", type: "address" },
              { name: "spender", type: "address" },
              { name: "value", type: "uint256" },
              { name: "nonce", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          primaryType: "Permit",
          message: {
            owner: address,
            spender: REGISTRAR_ADDRESS,
            value: usdcAmount,
            nonce,
            deadline,
          },
        });

        const r = `0x${signature.slice(2, 66)}` as `0x${string}`;
        const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
        let v = parseInt(signature.slice(130, 132), 16);
        if (v < 27) v += 27; // some wallets return 0/1

        setUsdcStep("registering");
        return await writeContractAsync({
          address: REGISTRAR_ADDRESS,
          abi: REGISTRAR_V4_ABI,
          functionName: "registerWithUsdcPermit",
          args: [
            parentNode,
            label,
            contenthash,
            partnerArg,
            usdcAmount,
            deadline,
            v,
            r,
            s,
          ],
        });
      } catch (permitErr) {
        // A user rejection should stop here, not silently escalate into an
        // approve prompt they didn't ask for.
        const msg = permitErr instanceof Error ? permitErr.message : String(permitErr);
        if (/user rejected|denied|rejected the request/i.test(msg)) {
          setUsdcStep("idle");
          throw permitErr;
        }

        // Wallet can't sign typed data — fall back to approve + register.
        setUsdcStep("approving");
        const approveHash = await writeContractAsync({
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: "approve",
          args: [REGISTRAR_ADDRESS, usdcAmount],
        });
        // Wait for the allowance to actually land before spending it.
        const { waitForTransactionReceipt } = await import("wagmi/actions");
        await waitForTransactionReceipt(wagmiConfig, { hash: approveHash });

        setUsdcStep("registering");
        try {
          return await writeContractAsync({
            address: REGISTRAR_ADDRESS,
            abi: REGISTRAR_V4_ABI,
            functionName: "registerWithUsdc",
            args: [parentNode, label, contenthash, partnerArg],
          });
        } finally {
          setUsdcStep("idle");
        }
      }
    },
    [address, parentDomain, writeContractAsync, signTypedDataAsync],
  );

  return {
    register,
    reset,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    usdcStep,
  };
}

/** Reseller config — price in cents, display name, accrued margin per asset. */
export function usePartnerInfo(partner?: `0x${string}`) {
  const { data, isLoading, refetch } = useReadContract({
    address: REGISTRAR_ADDRESS,
    abi: REGISTRAR_V4_ABI,
    functionName: "partnerInfo",
    args: partner ? [partner] : undefined,
    query: { enabled: !!partner && !!REGISTRAR_ADDRESS },
  });
  const [priceUsdCents, name, wholesaleUsdCents, accruedEth, accruedUsdc] = (data ??
    []) as unknown as [bigint, string, bigint, bigint, bigint];
  return {
    priceUsdCents,
    name,
    wholesaleUsdCents,
    accruedEth,
    accruedUsdc,
    isLoading,
    refetch,
  };
}

/** Reseller self-service: set price/name, withdraw both asset balances. */
export function usePartnerAdmin() {
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const setPartnerPrice = (priceUsdCents: bigint, name: string) =>
    writeContractAsync({
      address: REGISTRAR_ADDRESS,
      abi: REGISTRAR_V4_ABI,
      functionName: "setPartnerPrice",
      args: [priceUsdCents, name],
    });

  const withdraw = () =>
    writeContractAsync({
      address: REGISTRAR_ADDRESS,
      abi: REGISTRAR_V4_ABI,
      functionName: "withdrawEarnings",
      args: [],
    });

  return { setPartnerPrice, withdraw, hash, isPending, isConfirming, isSuccess, error };
}
