import { redirect } from 'next/navigation';
export default async function RetiredStockPage({ params }: {
  readonly params: Promise<{ readonly propertyId: string }>;
}) {
  const { propertyId } = await params;
  redirect(`/partner/properties/${encodeURIComponent(propertyId)}/calendar`);
}
