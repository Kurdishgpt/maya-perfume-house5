import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { ChevronDown, MapPin, Phone } from 'lucide-react';
import { FaInstagram, FaWhatsapp } from 'react-icons/fa';
import { useStore } from '@/lib/store-context';
import { instagramLink, languages, storeAddress, storeMapLink, storePhone, storePhoneHref, whatsappLink } from '@/lib/store';

function Section({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return <details className="mc-facc" data-testid={`footer-section-${id}`}>
    <summary><span>{title}</span><ChevronDown size={20}/></summary>
    <div className="mc-facc-body">{children}</div>
  </details>;
}

export function Footer() {
  const { t, language, setLanguage } = useStore();
  return <footer className="mc-foot">
    <div className="mc-foot-inner">
      <Link href="/" className="mc-foot-logo" aria-label="MAYA COLLECTION" data-testid="link-footer-logo"><img src="/images/reference/maya-gold-logo.png" alt="MAYA COLLECTION" dir="ltr"/></Link>
      <div className="mc-foot-acc">
        <Section title={t('language')} id="language">
          <div className="mc-foot-langs">{languages.map((l) => <button key={l.code} onClick={() => setLanguage(l.code)} className={l.code === language ? 'is-active' : ''} aria-pressed={l.code === language} data-testid={`footer-language-${l.code}`}>{l.label}</button>)}</div>
        </Section>
        <Section title={t('pages')} id="pages">
          <Link href="/">{t('home')}</Link><Link href="/welcome" data-testid="link-footer-welcome">{t('welcomePage')}</Link>
          <Link href="/contact">{t('contact')}</Link><Link href="/privacy">{t('privacy')}</Link><Link href="/terms">{t('terms')}</Link>
          <Link href="/admin" data-testid="link-admin">{t('admin')}</Link>
        </Section>
        <Section title={t('support')} id="support">
          <Link href="/faq">{t('faq')}</Link><Link href="/shipping">{t('shipping')}</Link><Link href="/returns">{t('returns')}</Link>
          <a href={whatsappLink} target="_blank" rel="noreferrer">{t('contactSupport')}</a>
        </Section>
      </div>
      <div className="mc-foot-contact">
        <a href={storePhoneHref} data-testid="link-footer-phone"><Phone/><span dir="ltr" className="is-phone">{storePhone}</span></a>
        <a href={storeMapLink} target="_blank" rel="noreferrer" data-testid="link-footer-address"><MapPin/><span><strong>{t('storeName')}</strong><span dir="ltr">{storeAddress}</span></span></a>
      </div>
    </div>
    <div className="mc-foot-follow">
      <div><span>{t('followUs')}</span>
        <nav aria-label={t('followUs')}>
          <a href={whatsappLink} target="_blank" rel="noreferrer" aria-label="WhatsApp" data-testid="footer-whatsapp"><FaWhatsapp/></a>
          <a href={instagramLink} target="_blank" rel="noopener noreferrer" aria-label="Instagram" data-testid="footer-instagram"><FaInstagram/></a>
        </nav>
      </div>
    </div>
  </footer>;
}
