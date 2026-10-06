/** What anyone may see about an account. Never includes the password hash. */
export interface PublicUser {
  id: string
  name: string
  email: string
}

/** An account as it is stored. The email is in lower case. */
export interface User extends PublicUser {
  passwordHash: string
  createdAt: Date
}

/**
 * A signed-in browser. The token itself is never stored, only its SHA-256 digest (`tokenHash`),
 * so a copy of the database cannot be used to sign in.
 */
export interface Session {
  tokenHash: string
  userId: string
  createdAt: Date
  expiresAt: Date
}

/** What a successful registration or login answers with. */
export interface SignedIn {
  user: PublicUser
  /** The session token: sent back as `Authorization: Bearer <token>`. Shown once, never stored. */
  token: string
  /** When the session ends, as an ISO date. */
  expiresAt: string
}

/** What the middleware knows about the request once it has been authenticated. */
export interface AuthContext {
  user: PublicUser
  /** The digest of the token that was used, which identifies the session. */
  tokenHash: string
}
