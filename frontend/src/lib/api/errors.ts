/**
 * The doc 58 §2 error contract, as a typed union.
 *
 * The backend always answers a failure with
 * `{ code, message, details[], correlationId }` and never with a stack trace,
 * so the client maps that shape once and every caller handles a known kind
 * instead of inspecting status codes at each call site.
 */

/** Doc 58 §2.1 — the complete frozen code set. */
export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'DUPLICATE_REFERENCE'
  | 'ACCOUNT_ALREADY_EXISTS'
  | 'ILLEGAL_TRANSITION'
  | 'PROPERTY_CLOSED'
  | 'NO_AVAILABILITY'
  | 'OCCUPANCY_EXCEEDED'
  | 'HORIZON_EXCEEDED'
  | 'CONFIG_MISSING'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'AVAILABILITY_UNAVAILABLE';

export interface ApiErrorDetail {
  readonly field: string | null;
  readonly code: string;
  readonly message: string;
}

export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
  readonly details: readonly ApiErrorDetail[];
  readonly correlationId: string | null;
}

/**
 * A failed API call.
 *
 * `correlationId` is carried deliberately: doc 58 §2 pairs every response with
 * one, and it is the only safe thing to show a user when something breaks —
 * "quote reference 8f3a…" lets support find the log without the UI ever
 * displaying what actually went wrong.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: readonly ApiErrorDetail[];
  readonly correlationId: string | null;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
    this.correlationId = body.correlationId;
  }

  /** Not signed in. Distinct from {@link isForbidden} — doc 58 §2.1. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  /** Signed in, but not permitted. */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /**
   * Absent — or outside the caller's scope.
   *
   * Doc 85 §6.3 returns 404 rather than 403 for another partner's records, so
   * their existence is not disclosed. The UI must therefore say "not found" and
   * must never re-describe this as a permission problem, which would leak the
   * very fact the backend is hiding.
   */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** Someone else changed the record first — doc 58 §2.1 `VERSION_CONFLICT`. */
  get isConflict(): boolean {
    return this.status === 409;
  }

  /** A domain rule refused it, with actionable `details`. */
  get isUnprocessable(): boolean {
    return this.status === 422;
  }

  /** Field-level messages, keyed by field, for form rendering. */
  fieldErrors(): Record<string, string> {
    const errors: Record<string, string> = {};
    for (const detail of this.details) {
      if (detail.field !== null) {
        errors[detail.field] = detail.message;
      }
    }
    return errors;
  }
}

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Reads a failure response into an {@link ApiError}.
 *
 * Tolerant on purpose: a proxy timeout or a 502 from an upstream never reaches
 * `GlobalExceptionHandler` and so is not doc 58-shaped. Those still have to
 * become an ApiError rather than an unhandled parse failure.
 */
export async function toApiError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody = {
    code: 'INTERNAL_ERROR',
    message: FALLBACK_MESSAGE,
    details: [],
    correlationId: response.headers.get('X-Correlation-Id'),
  };

  try {
    const parsed: unknown = await response.json();
    if (isApiErrorBody(parsed)) {
      body = {
        code: parsed.code,
        message: parsed.message,
        details: parsed.details ?? [],
        correlationId: parsed.correlationId ?? body.correlationId,
      };
    }
  } catch {
    // Not JSON. Keep the fallback — never surface the raw body, which could
    // hold anything an intermediary decided to return.
  }

  return new ApiError(response.status, body);
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { code?: unknown }).code === 'string' &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}
