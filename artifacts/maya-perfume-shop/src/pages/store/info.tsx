import { Link } from 'wouter';
import { ArrowRight, Phone } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { GoldDivider } from '@/components/store/brand';
import { PageBar } from '@/components/store/header';
import { storePhone, storePhoneHref, whatsappLink } from '@/lib/store';
import { useStore } from '@/lib/store-context';
import { useBack } from '@/pages/store/use-back';

export default function InfoPage({ titleKey, bodyKey, label, image }: { titleKey: string; bodyKey: string; label: string; image?: string }) {
  const { t } = useStore();
  const back = useBack('/');
  return <div className="mc-page mc-info-page">
    <PageBar title={t(label)} onBack={back}/>
    {image && <div className="mc-info-img"><img src={image} alt=""/></div>}
    <section className="mc-info-card">
      <span className="mc-kicker" dir="ltr">MAYA COLLECTION · SULAYMANIYAH</span>
      <h2>{t(titleKey)}</h2>
      <GoldDivider/>
      <p>{t(bodyKey)}</p>
      <div className="mc-info-actions">
        <Link href="/collection" className="mc-teal-btn" data-testid="link-info-shop">{t('collection')} <ArrowRight size={16} className="mc-flip"/></Link>
        <a href={whatsappLink} target="_blank" rel="noreferrer" className="mc-ghost-btn" data-testid="link-info-whatsapp"><FaWhatsapp/> {t('whatsappUs')}</a>
        <a href={storePhoneHref} className="mc-text-btn" data-testid="link-info-phone"><Phone size={14}/> <span dir="ltr">{storePhone}</span></a>
      </div>
    </section>
  </div>;
}
