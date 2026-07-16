"use client";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { mainnet, sepolia } from "wagmi/chains";
import { http } from "wagmi";

export const wagmiConfig = getDefaultConfig({
  appName: "PetID",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
  chains: [mainnet, sepolia],
  transports: {
    [mainnet.id]: http(process.env.NEXT_PUBLIC_RPC_URL_MAINNET),
    [sepolia.id]: http(process.env.NEXT_PUBLIC_RPC_URL_SEPOLIA),
  },
  ssr: true,
});
