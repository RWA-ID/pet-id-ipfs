// The parts of Google Identity Services (https://accounts.google.com/gsi/client)
// that components/GoogleSignInButton.tsx uses. Loaded at runtime, so there's no
// package to take types from.

interface GoogleCredentialResponse {
  credential: string;
  select_by?: string;
}

interface Window {
  google?: {
    accounts: {
      id: {
        initialize(config: {
          client_id: string;
          callback: (response: GoogleCredentialResponse) => void;
          auto_select?: boolean;
          cancel_on_tap_outside?: boolean;
          context?: "signin" | "signup" | "use";
        }): void;
        renderButton(
          parent: HTMLElement,
          options: {
            type?: "standard" | "icon";
            theme?: "outline" | "filled_blue" | "filled_black";
            size?: "large" | "medium" | "small";
            text?: "signin_with" | "signup_with" | "continue_with" | "signin";
            shape?: "rectangular" | "pill" | "circle" | "square";
            logo_alignment?: "left" | "center";
            width?: number;
          },
        ): void;
        disableAutoSelect(): void;
      };
    };
  };
}
