/**
 * Session types, mirroring the backend records exactly.
 *
 * Hand-written and reviewed against the Java, because the repository publishes
 * no OpenAPI document (recorded as OQ-131). Every field below exists on the
 * corresponding record; nothing here is anticipated or invented.
 */

/** Mirrors `security.api.SessionView`. */
export interface SessionView {
  readonly id: string;
  readonly createdAt: string;
  readonly lastSeenAt: string | null;
  readonly expiresAt: string;
  readonly current: boolean;
}

/** Mirrors `security.api.LoginRequest`. */
export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

/** Which console a session belongs to. Mirrors `MeConsoleController`. */
export type ConsoleRole = 'SUPER_ADMIN' | 'ADMIN' | 'NONE';

/** Mirrors `security.api.CustomerRegistrationRequest`. */
export interface CustomerRegistrationRequest {
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
  readonly password: string;
  readonly locale: 'vi' | 'en';
  readonly country?: string;
}

