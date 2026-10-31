import { Link, useLocation } from 'wouter';
import { Heart, Home, Search, ShoppingBag } from 'lucide-react';
import { useStore } from '@/lib/store-context';

export function BottomNav() {
  const { t, count, wishlist, bagPulse } = useStore();
  const [path] = useLocation();
  const items = [
    { href: '/', key: 'home', icon: Home, active: path === '/' },
    { href: '/collection', key: 'explore', icon: Search, active: path.startsWith('/collection') || path.startsWith('/product') },
    { href: '/wishlist', key: 'wishlist', icon: Heart, active: path === '/wishlist', badge: wishlist.length },
    { href: '/bag', key: 'bags', icon: ShoppingBag, active: path === '/bag' || path === '/checkout', badge: count, pulse: bagPulse },
  ];
  return <nav className="mc-bottomnav" aria-label={t('mainNavigation')}>
    <div className="mc-bottomnav-inner">
      {items.map(({ href, key, icon: Icon, active, badge, pulse }) => <Link key={key} href={href} className={active ? 'is-active' : ''} aria-current={active ? 'page' : undefined} data-testid={`bottomnav-${key}`}>
        <span className="mc-bottomnav-icon" key={pulse}><Icon/>{!!badge && <em data-testid={`text-${key}-count`}>{badge}</em>}</span>
        <span className="mc-bottomnav-label">{t(key)}</span>
      </Link>)}
    </div>
  </nav>;
}
