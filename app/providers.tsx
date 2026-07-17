"use client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppKit } from "@reown/appkit/react";
import { mainnet } from "@reown/appkit/networks";
import { wagmiConfig, wagmiAdapter, networks, projectId } from "@/lib/wagmi";
import { useState } from "react";

/**
 * Reown AppKit mounts its connect modal once at module load;
 * open it from components with useAppKit().open().
 */
createAppKit({
  adapters: [wagmiAdapter],
  networks,
  defaultNetwork: mainnet,
  projectId,
  metadata: {
    name: "PetID",
    description: "ENS Pet Identity Platform",
    url: "https://petid.eth.link",
    icons: [],
  },
  themeMode: "light",
  themeVariables: {
    "--w3m-accent": "#C87A2E", // warm orange — matches site CTAs
    "--w3m-color-mix": "#FFFDF8", // cream background
    "--w3m-color-mix-strength": 20,
    "--w3m-border-radius-master": "2px",
  },
  features: {
    analytics: false,
    email: false,
    socials: false,
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
