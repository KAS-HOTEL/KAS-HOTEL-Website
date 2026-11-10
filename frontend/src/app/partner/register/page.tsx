import { notFound } from 'next/navigation';

export const metadata = {
  title: 'KAS Admin — Tạo tài khoản',
  robots: { index: false },
};

/**
 * Partner self-registration — withdrawn by doc 154.
 *
 * Staff share one SUPER_ADMIN account that KAS creates, so there is no account
 * to create here and `POST /api/v1/public/auth/register` no longer exists. The
 * route answers not-found rather than showing a form that cannot succeed. The former form (`RegisterForm`) is in version control history.
 */
export default function PartnerRegisterPage() {
  notFound();
}
