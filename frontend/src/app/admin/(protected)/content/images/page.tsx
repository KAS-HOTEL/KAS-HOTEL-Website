import { redirect } from 'next/navigation';

/** "Ảnh website" was split into the "Nội dung website" screens (2026-11-08); old links land on the first. */
export default function MovedSiteImages() {
  redirect('/admin/content/home');
}
