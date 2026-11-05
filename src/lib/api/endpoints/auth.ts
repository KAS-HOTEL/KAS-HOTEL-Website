import { api } from '../client';
import type {
  LoginRequest,
  ConsoleRole,
  CustomerRegistrationRequest,
  SessionView,
} from '@/lib/domain/session';

/**
 * Authentication and session endpoints — verified against `AuthController` and
 * `SessionController`.
 *
 * Login and refresh return no body: the session travels as `Set-Cookie`
 * (`kas_access`, `kas_refresh`), which is why nothing here returns a token and
 * why no caller can be tempted to store one.
 */
export const authApi = {
  /** `POST /api/v1/public/auth/login` */
  login: (credentials: LoginRequest) =>
    api.post<void>('/api/v1/public/auth/login', credentials),

  /** `POST /api/v1/public/auth/customer-register` creates a customer and sends its verification code. */
  registerCustomer: (registration: CustomerRegistrationRequest) =>
    api.post<void>('/api/v1/public/auth/customer-register', registration),

  /** `POST /api/v1/public/auth/forgot-password` — same response whether or not the email has an account. */
  forgotCustomerPassword: (email: string) =>
    api.post<{ readonly message: string }>('/api/v1/public/auth/forgot-password', { email }),

  resetCustomerPassword: (token: string, newPassword: string) =>
    api.post<void>('/api/v1/public/auth/reset-password', { token, newPassword }),

  verifyCustomerEmail: (email: string, code: string) => api.post<void>('/api/v1/public/auth/verify-email', { email, code }),
  resendVerification: (email: string) => api.post<void>('/api/v1/public/auth/resend-verification', { email }),

  /**
   * `POST /api/v1/public/auth/refresh`
   *
   * The refresh cookie's path is `/api/v1/public/auth`, so this exact path is
   * the only one the browser will send it to.
   */
  refresh: () => api.post<void>('/api/v1/public/auth/refresh'),

  /** `POST /api/v1/public/auth/logout` */
  logout: () => api.post<void>('/api/v1/public/auth/logout'),
} as const;

export const sessionApi = {
  /** `GET /api/v1/me/sessions` — also the "am I signed in?" probe (see lib/auth). */
  list: (cookieHeader?: string) =>
    api.get<SessionView[]>(
      '/api/v1/me/sessions',
      cookieHeader === undefined ? {} : { cookieHeader },
    ),

  /** `GET /api/v1/me/console` — chooses the menu; every action is still decided per endpoint. */
  console: (cookieHeader?: string) =>
    api.get<{ readonly console: ConsoleRole }>(
      '/api/v1/me/console',
      cookieHeader === undefined ? {} : { cookieHeader },
    ),

  /** `DELETE /api/v1/me/sessions/{id}` */
  revoke: (sessionId: string) => api.delete<void>(`/api/v1/me/sessions/${sessionId}`),

  /** `DELETE /api/v1/me/sessions` — revokes every other session. */
  revokeAll: () => api.delete<void>('/api/v1/me/sessions'),
} as const;
