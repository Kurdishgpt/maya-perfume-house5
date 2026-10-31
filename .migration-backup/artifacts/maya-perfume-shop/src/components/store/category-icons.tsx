import { Link } from 'wouter';
import { useStore } from '@/lib/store-context';

const cats = [
  { key: 'women', href: '/collection?cat=women', img: 'women' },
  { key: 'men', href: '/collection?cat=men', img: 'men' },
  { key: 'unisex', href: '/collection?cat=unisex', img: 'unisex' },
  { key: 'rawMaterials', href: '/raw-material', img: 'materials' },
] as const;

export function CategoryGrid() {
  const { t } = useStore();
  return <div className="mc-cats">
    {cats.map(({ key, href, img }, i) => <Link key={key} href={href} className="mc-cat" style={{ animationDelay: `${120 + i * 60}ms` }} data-testid={`link-category-${key}`}>
      <span className="mc-cat-art"><img src={`/images/reference/${img}.webp`} alt="" loading="lazy"/></span>
      <span className="mc-cat-label">{t(key)}</span>
    </Link>)}
  </div>;
}
