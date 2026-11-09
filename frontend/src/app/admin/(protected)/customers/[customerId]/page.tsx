import { CustomerDetail } from '@/features/adminTools/CustomerDetail';

export const metadata = { title: 'Khách hàng — KAS Admin' };

export default async function Page({ params }: { readonly params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  return <CustomerDetail customerId={customerId} />;
}
