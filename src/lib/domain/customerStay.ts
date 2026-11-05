/** Mirrors the owner-scoped customer stays response. */
export interface CustomerStay {
  readonly reference: string;
  readonly propertySlug: string;
  readonly propertyName: string | null;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly salesStatus: string | null;
  readonly stayStatus: string | null;
  readonly currency: string;
  readonly totalMinor: number | null;
  readonly createdAt: string;
  readonly cancellationRequestId: string | null;
  readonly cancellationRequestStatus: string | null;
  readonly cancellationFeeMinor: number | null;
  readonly cancellationFeeCurrency: string | null;
  readonly cancellationFeeNote: string | null;
}

export interface CancellationResult {
  readonly reference: string;
  readonly status: string;
  readonly requestId: string | null;
  readonly feeMinor: number | null;
  readonly currency: string | null;
  readonly cancelled: boolean;
}
