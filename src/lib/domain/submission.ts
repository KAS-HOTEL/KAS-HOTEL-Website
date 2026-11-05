import type { BadgeTone } from '@/ui/primitives';

/**
 * Mirrors `onboarding.api.SubmissionView`.
 *
 * Seven fields, and four of them are absent until a decision is taken:
 * `property_submission` starts a row with `status = 'SUBMITTED'` and a CHECK
 * forbidding `reviewed_by` / `reviewed_at` before it is decided.
 */
export interface SubmissionView {
  readonly id: string;
  readonly propertyId: string;
  readonly status: SubmissionStatus;
  /** ISO instant. */
  readonly submittedAt: string;
  /** The reviewer's user id. Absent while the submission is open. */
  readonly reviewedBy?: string;
  readonly reviewedAt?: string;
  /** Mandatory for REJECTED and CHANGES_REQUESTED, absent otherwise. */
  readonly decisionReason?: string;
}

/** The four values of the `property_submission_status` enum (V22). */
export const SUBMISSION_STATUSES = [
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'CHANGES_REQUESTED',
] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  SUBMITTED: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Đã từ chối',
  CHANGES_REQUESTED: 'Yêu cầu chỉnh sửa',
};

/**
 * The translation, with the backend's own value never discarded.
 *
 * An unknown value is returned as itself rather than mapped to a default: if the
 * enum ever grows, an Admin should see the new state's raw name rather than be
 * told it is something it is not.
 */
export function submissionStatusLabel(status: string): string {
  return STATUS_LABELS[status as SubmissionStatus] ?? status;
}

export function submissionStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
      return 'danger';
    case 'CHANGES_REQUESTED':
      return 'warning';
    case 'SUBMITTED':
      return 'accent';
    default:
      return 'neutral';
  }
}

/** Only an open submission can be decided — the backend enforces this too. */
export function isOpen(submission: SubmissionView): boolean {
  return submission.status === 'SUBMITTED';
}

/**
 * The three decisions, as the API exposes them.
 *
 * `approve` takes no reason; the other two require one. Kept together so a UI
 * cannot offer a fourth, and cannot offer one of these without its reason.
 */
export const DECISIONS = [
  {
    key: 'approve',
    label: 'Duyệt và công bố',
    /** Approving publishes: DRAFT → COMING_SOON, plus every room type. */
    needsReason: false,
    tone: 'primary',
  },
  {
    key: 'requestChanges',
    label: 'Yêu cầu chỉnh sửa',
    needsReason: true,
    tone: 'secondary',
  },
  { key: 'reject', label: 'Từ chối', needsReason: true, tone: 'danger' },
] as const;

export type DecisionKey = (typeof DECISIONS)[number]['key'];
