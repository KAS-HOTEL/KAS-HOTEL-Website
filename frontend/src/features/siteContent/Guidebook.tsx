import Link from 'next/link';
import type { Locale } from '@/config/env';
import type { SiteImageSlot } from '@/lib/domain/siteImageSlot';
import { guidebookData } from './guidebookData';
import styles from './Guidebook.module.css';

interface GuidebookProps {
  readonly locale: Locale;
  readonly imageSlots: readonly SiteImageSlot[];
}

const copy = {
  en: {
    title: 'Saigon City Guidebook', eyebrow: 'KAS · SAIGON', home: 'Home', hotels: 'Hotels',
    photos: 'Guidebook', readSource: 'Open official reference ↗',
    distanceHeading: 'From these KAS hotels',
    footer: 'Distances are approximate walking estimates from the listed KAS hotel addresses and can vary with route, road crossings, traffic and entrance point. Opening hours, performances and access conditions can change; check the venue’s current official information before travelling.',
  },
  vi: {
    title: 'Cẩm nang thành phố Sài Gòn', eyebrow: 'KAS · SÀI GÒN', home: 'Trang chủ', hotels: 'Khách sạn',
    photos: 'Cẩm nang', readSource: 'Mở nguồn tham khảo ↗',
    distanceHeading: 'Từ những khách sạn KAS này',
    footer: 'KAS City Guidebook · Khoảng cách chỉ mang tính tham khảo · Cập nhật cùng hệ thống KAS Hotel Collection.',
  },
} as const;

function imageStyle(url: string | undefined): React.CSSProperties | undefined {
  if (!url) return undefined;
  return { backgroundImage: `url(${JSON.stringify(url)})` };
}

export function Guidebook({ locale, imageSlots }: GuidebookProps) {
  const text = copy[locale];
  const sections = guidebookData.sections[locale];
  const images = new Map(imageSlots.map((slot) => [slot.key, slot.imageReference]));
  const heroImage = images.get('guidebook.hero');

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <span className={styles.brand}>KAS HOTEL COLLECTION</span>
        <span className={styles.topLabel}>{text.eyebrow} · {text.photos}</span>
        <nav className={styles.locale} aria-label="Language">
          <Link href="/en/guidebook" aria-current={locale === 'en' ? 'page' : undefined}>EN</Link>
          <Link href="/vi/guidebook" aria-current={locale === 'vi' ? 'page' : undefined}>VI</Link>
        </nav>
      </header>

      <nav className={styles.crumb} aria-label={locale === 'vi' ? 'Đường dẫn' : 'Breadcrumb'}>
        <Link href={`/${locale}`}>{text.home}</Link><span aria-hidden="true">›</span>
        <Link href={`/${locale}/hotels`}>{text.hotels}</Link><span aria-hidden="true">›</span>
        <span aria-current="page">{text.title}</span>
      </nav>

      <section className={styles.hero} aria-labelledby="guidebook-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>{text.eyebrow}</p>
          <h1 className={styles.title} id="guidebook-title">{text.title}</h1>
        </div>
        {heroImage ? (
          <div className={styles.heroPhoto} role="img" aria-label={text.title} style={imageStyle(heroImage)} />
        ) : (
          <div className={`${styles.heroPhoto} ${styles.imageMissing}`} aria-hidden="true">{text.photos}</div>
        )}
      </section>

      <nav className={styles.toc} aria-label={locale === 'vi' ? 'Nhóm địa điểm' : 'Guide sections'}>
        {sections.map((section, index) => (
          <a key={section} href={`#guide-section-${index + 1}`}>{String(index + 1).padStart(2, '0')} · {section}</a>
        ))}
      </nav>

      {sections.map((section, index) => {
        const entries = guidebookData.entries.filter((entry) => entry.section === index + 1);
        return (
          <section className={styles.section} id={`guide-section-${index + 1}`} key={section}>
            <header className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>{section}</h2>
              <span className={styles.sectionCount}>{String(index + 1).padStart(2, '0')} / {entries.length}</span>
            </header>
            {entries.map((entry, entryIndex) => {
              const content = entry[locale];
              const url = images.get(entry.imageKey);
              return (
                <article className={styles.entry} id={entry.id} key={entry.id}>
                  {url ? (
                    <div className={styles.photo} role="img" aria-label={content.title} style={imageStyle(url)} />
                  ) : (
                    <div className={`${styles.photo} ${styles.imageMissing}`} aria-hidden="true">{text.photos}</div>
                  )}
                  <div className={styles.entryBody}>
                    <p className={styles.meta}>{String(entry.section).padStart(2, '0')} / {section} · {String(entryIndex + 1).padStart(2, '0')}</p>
                    <h3 className={styles.entryTitle}>{content.title}</h3>
                    <p className={styles.description}>{content.description}</p>
                    {content.facts.length > 0 && (
                      <div className={styles.facts}>
                        {content.facts.map((fact) => (
                          <div className={styles.fact} key={fact.label}>
                            <span className={styles.factLabel}>{fact.label}</span>
                            <span className={styles.factValue}>{fact.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {content.distances.length > 0 && (
                      <div className={styles.distances}>
                        <span className={styles.distanceTitle}>{text.distanceHeading}</span>
                        {content.distances.map((distance) => (
                          <div className={styles.distance} key={distance.hotel}>
                            <strong>{distance.hotel}</strong><span>{distance.detail}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {content.tip && <p className={styles.tip}>{content.tip}</p>}
                    {content.source && (
                      <p className={styles.source}>
                        <a href={content.source.url} target="_blank" rel="noopener noreferrer">{text.readSource}</a>
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        );
      })}

      <p className={styles.footnote}>{text.footer}</p>
    </div>
  );
}
