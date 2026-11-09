import { redirect } from 'next/navigation';

/** "Giá nâng cao" was merged into the hotel's single pricing page (2026-11-08). */
export default async function AdvancedPricingRedirect({ params }: {
  readonly params: Promise<{ readonly propertyId: string }>;
}) {
  const { propertyId } = await params;
  redirect(`/partner/pricing/${propertyId}`);
}
