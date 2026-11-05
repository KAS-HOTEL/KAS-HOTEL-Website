import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isSupportedLocale } from '@/config/env';
import { Guidebook } from '@/features/siteContent/Guidebook';
import { publicSiteImages } from '@/features/siteContent/siteImages.server';

export const metadata: Metadata = { title: 'KAS — Saigon City Guidebook' };

export default async function GuidebookPage({
  params,
}: {
  readonly params: Promise<{ readonly locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const imageSlots = await publicSiteImages();
  return <Guidebook locale={locale} imageSlots={imageSlots} />;
}
