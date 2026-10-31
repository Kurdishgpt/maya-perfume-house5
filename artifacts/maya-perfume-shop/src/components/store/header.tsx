import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowRight, Menu, X } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { Wordmark } from '@/components/store/brand';
import { LanguageMenu } from '@/components/store/language-menu';
import { useStore } from '@/lib/store-context';
import { storePhone, storePhoneHref, whatsappLink } from '@/lib/store';

const menuLinks = [
  { href: '/contact', key: 'contact' }, { href: '/admin', key: 'admin' },
] as const;

export function Header() {
  const { t } = useStore();
  const [open, setOpen] = useState(false);
  const [path] = useLocation();
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [open]);
  const isHome = path === '/';
  const isContact = path === '/contact';
  return <>
    {!isHome && !isContact && <div className="mc-announce" data-testid="announcement-delivery">{t('banner')}</div>}
      <header className={`mc-header${isHome ? ' is-home' : ''}${isContact ? ' is-contact' : ''}`}>
      <button className="mc-header-btn" onClick={() => setOpen(true)} aria-label={t('menu')} aria-expanded={open} data-testid="button-header-menu"><Menu/></button>
      <Wordmark compact/>
        <div className="mc-header-tools">
          <LanguageMenu/>
        </div>
    </header>
    {open && <div className="mc-sheet-overlay" onClick={() => setOpen(false)} role="presentation">
      <nav className="mc-sheet" onClick={(e) => e.stopPropagation()} aria-label={t('mainNavigation')}>
        <div className="mc-sheet-head"><Wordmark compact/><button className="mc-header-btn" onClick={() => setOpen(false)} aria-label={t('closeMenu')} data-testid="button-close-menu"><X/></button></div>
        <div className="mc-sheet-links">
          {menuLinks.map((l, i) => <Link key={l.href} href={l.href} onClick={() => setOpen(false)} style={{ animationDelay: `${i * 35}ms` }} data-testid={`mobile-nav-${l.key}`}><span>{t(l.key)}</span><ArrowRight size={15}/></Link>)}
        </div>
        <div className="mc-sheet-foot">
          <a href={whatsappLink} target="_blank" rel="noreferrer" data-testid="menu-whatsapp"><FaWhatsapp/> {t('whatsappUs')}</a>
          <a href={storePhoneHref} dir="ltr" data-testid="menu-phone">{storePhone}</a>
        </div>
      </nav>
    </div>}
  </>;
}

export function PageBar({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) {
  const { t } = useStore();
  return <div className="mc-pagebar">
    <button className="mc-round-btn" onClick={onBack} aria-label={t('back')} data-testid="button-back"><ArrowRight className="mc-flip-back"/></button>
    <h1>{title}</h1>
    <div className="mc-pagebar-right">{right}</div>
  </div>;
}
