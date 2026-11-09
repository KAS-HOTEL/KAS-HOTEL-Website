import { redirect } from 'next/navigation';

/** Moved: room prices belong to SUPER_ADMIN since 2026-11-08, under /partner/pricing. */
export default async function MovedAdvancedPricing({ params, searchParams }: {
  readonly params: Promise<{ readonly propertyId: string }>;
  readonly searchParams: Promise<{ readonly from?: string; readonly to?: string }>;
}) {
  const { propertyId } = await params;
  const { from, to } = await searchParams;
  const query = from && to ? `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` : '';
  redirect(`/partner/pricing/${encodeURIComponent(propertyId)}/advanced${query}`);
}
