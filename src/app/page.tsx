import { redirect } from 'next/navigation';
import { DEFAULT_LOCALE } from '@/config/env';

/** Doc 22 §3: every customer route is locale-prefixed, so `/` resolves to one. */
export default function RootPage() {
  redirect(`/${DEFAULT_LOCALE}`);
}
