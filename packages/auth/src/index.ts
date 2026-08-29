export type AuthMode = "local" | "cloud";
export type CloudSignInMethod = "magic-link" | "google" | "apple" | "passkey";

export interface AuthSession {
  mode: AuthMode;
  subject: string;
  deviceId: string;
  userId?: string;
  email?: string;
  expiresAt?: string;
}

export interface AuthCapabilities {
  availableMethods: CloudSignInMethod[];
  passwordSignIn: false;
}

export interface AuthProvider {
  readonly mode: AuthMode;
  getSession(): Promise<AuthSession | null>;
  signOut(): Promise<void>;
}

export interface CloudAuthProvider extends AuthProvider {
  readonly mode: "cloud";
  getCapabilities(): Promise<AuthCapabilities>;
  signInWithMagicLink(email: string): Promise<void>;
  signInWithOAuth(
    provider: "google" | "apple",
    redirectTo: string,
  ): Promise<void>;
  signInWithPasskey(): Promise<void>;
}

export class LocalAuthProvider implements AuthProvider {
  readonly mode = "local" as const;
  readonly #session: AuthSession;

  constructor(deviceId: string) {
    if (deviceId.trim().length === 0)
      throw new Error("A local device ID is required");
    this.#session = {
      mode: "local",
      subject: `local:${deviceId}`,
      deviceId,
    };
  }

  async getSession(): Promise<AuthSession> {
    return this.#session;
  }

  async signOut(): Promise<void> {
    // Local mode has no remote session and therefore nothing to revoke.
  }
}
