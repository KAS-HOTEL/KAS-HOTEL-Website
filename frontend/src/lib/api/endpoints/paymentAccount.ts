import { api } from '../client';

/** The one KAS account every booking is paid into (V51), printed in the payment email. */
export interface PaymentAccount {
  readonly qrImageUrl: string | null;
  readonly instructions: string | null;
  readonly bankName: string | null;
  readonly accountHolder: string | null;
  readonly accountNumber: string | null;
}

const BASE = '/api/v1/admin/payment-account';

/** SUPER_ADMIN only (`settings.manage`): the account is shared by every hotel. */
export const paymentAccountApi = {
  get: () => api.get<PaymentAccount>(BASE),
  update: (body: PaymentAccount) => api.put<PaymentAccount>(BASE, body),
} as const;
