import { VoucherManager } from '@/features/adminTools/VoucherManager';
import { hotelOptions } from '@/features/reservation/hotelOptions';

export const metadata = { title: 'Voucher — KAS Admin' };

export default async function Page() {
  return <VoucherManager hotels={await hotelOptions()} />;
}
