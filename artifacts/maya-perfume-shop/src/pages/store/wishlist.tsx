import { Link } from 'wouter';
import { Heart } from 'lucide-react';
import { PageBar } from '@/components/store/header';
import { CardSkeletons, ProductCard } from '@/components/store/product-card';
import { useStore } from '@/lib/store-context';
import { useBack } from '@/pages/store/use-back';

export default function Wishlist() {
  const { t, products, wishlist, loading } = useStore();
  const back = useBack('/');
  const saved = products.filter((p) => wishlist.includes(p.id));
  return <div className="mc-page">
    <PageBar title={t('saved')} onBack={back}/>
    {loading ? <CardSkeletons n={4}/> : saved.length ? <div className="mc-grid">{saved.map((p, i) => <ProductCard key={p.id} product={p} index={i}/>)}</div>
      : <EmptyState icon="heart" text={t('emptyWish')} action={t('browse')}/>}
  </div>;
}

export function EmptyState({ text, action, icon }: { text: string; action: string; icon: 'heart' | 'bag' }) {
  return <div className="mc-empty" data-testid="state-empty">
    <span className="mc-empty-ring">{icon === 'heart' ? <Heart/> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M6 7h12l1 14H5L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>}</span>
    <p>{text}</p>
    <Link href="/collection" className="mc-teal-btn" data-testid="link-empty-browse">{action}</Link>
  </div>;
}
