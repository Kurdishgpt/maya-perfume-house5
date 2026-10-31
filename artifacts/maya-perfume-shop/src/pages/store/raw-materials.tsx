import { useMemo, useState } from 'react';
import { getListRawMaterialsQueryKey, getListRawMaterialsQueryOptions } from '@workspace/api-client-react';
import type { RawMaterial } from '@workspace/api-client-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { FlaskConical, RefreshCw, Search, ChevronLeft, ChevronRight, ShoppingBag } from 'lucide-react';
import { PageBar } from '@/components/store/header';
import { useStore } from '@/lib/store-context';
import { formatMoney } from '@/lib/money';
import { useBack } from '@/pages/store/use-back';
import './raw-materials.css';

function MaterialCard({ m, index }: { m: RawMaterial; index: number }) {
  const { t, addRawMaterial } = useStore();
  const [quantity, setQuantity] = useState(m.unit === 'g' ? 10 : 1);
  const [imageFailed, setImageFailed] = useState(false);
  const [added, setAdded] = useState(false);
  const safe = Math.max(1, Math.round(quantity) || 1);
  const unitLabel = m.unit === 'g' ? t('rawUnitGram') : t('rawUnitItem');
  const quantityLabel = m.unit === 'g' ? t('rawGrams') : t('rawItems');
  const customerDescription = (value?: string | null) => (value ?? '')
    .replace(/\b(?:listed by|by|from)\s+Hillen99(?:\s+as a set)?/gi, '')
    .replace(/\bHillen99\b/gi, '')
    .replace(/\bis\s*\./gi, '.')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
  const addToBag = () => { addRawMaterial(m, safe); setAdded(true); };
  return <article className="mc-raw-card" style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }} data-testid={`card-raw-material-${m.id}`}>
    <div className="mc-raw-top">
      <div className="mc-raw-img">{m.image_url && !imageFailed ? <img src={m.image_url} alt={m.name} loading="lazy" onError={() => setImageFailed(true)}/> : <FlaskConical size={22}/>}</div>
      <div style={{ minWidth: 0 }}>
        <h3 data-testid={`text-raw-name-${m.id}`}>{m.name}</h3>
        <span className="mc-raw-cat">{m.category}</span>
        <div className="mc-raw-price" dir="ltr" data-testid={`text-raw-price-${m.id}`}>{formatMoney(m.price, m.currency)} <small>/ {unitLabel}</small></div>
      </div>
    </div>
    {m.description && <p className="mc-raw-desc">{customerDescription(m.description)}</p>}
    <details className="mc-raw-details" data-testid={`details-raw-material-${m.id}`}>
      <summary>{t('rawSpecDescription')}</summary>
      <div className="mc-raw-detail-copy">
        {m.source_sku && <p><strong>{t('sku')}:</strong> {m.source_sku}</p>}
        {m.source_category && <p><strong>{t('category')}:</strong> {m.source_category}</p>}
        <p><strong>{t('rawUnitLabel')}:</strong> {t('rawPer')} {unitLabel}</p>
        {m.quantity_options.length > 0 && <p><strong>{t('rawPackageOptions')}:</strong> {m.quantity_options.map((option) =>
          `${option.label}: ${option.value}${option.price != null ? ` (${formatMoney(option.price, option.currency === 'IQD' ? 'IQD' : 'USD')})` : ''}`,
        ).join(' · ')}</p>}
        <p className="mc-raw-original">{customerDescription(m.source_description || m.description)}</p>
      </div>
    </details>
    <div className="mc-raw-ask">
      <label>{quantityLabel}<input type="number" min={1} step={1} value={quantity} onChange={(e) => { setQuantity(Number(e.target.value)); setAdded(false); }} aria-label={`${quantityLabel} ${m.name}`} data-testid={`input-raw-grams-${m.id}`}/></label>
      <button className="mc-raw-wa" type="button" onClick={addToBag} data-testid={`button-add-raw-bag-${m.id}`}><ShoppingBag size={16}/>{added ? t('rawAdded') : t('add')}</button>
    </div>
    {added && <p className="mc-raw-added" role="status">{t('rawAddedToBag')} <Link href="/bag">{t('viewBag')}</Link></p>}
    <div className="mc-raw-note">{t('rawEstimate').replace('{quantity}', String(safe)).replace('{unit}', m.unit === 'g' ? t('rawUnitGram') : t('rawUnitItemPlural'))} <span dir="ltr">{formatMoney(m.price * safe, m.currency)}</span>. {t('rawAvailability')}</div>
  </article>;
}

export default function RawMaterialsPage() {
  const { t } = useStore();
  const back = useBack('/');
  const q = useQuery(getListRawMaterialsQueryOptions({ query: { queryKey: getListRawMaterialsQueryKey(), retry: 1 } }));
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('All');
  const [sort, setSort] = useState('featured');
  const [page, setPage] = useState(1);
  const items = q.data ?? [];
  const cats = useMemo(() => ['All', ...[...new Set(items.map((m) => m.category).filter(Boolean))].sort()], [items]);
  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    const matching = items.filter((m) => m.published && (cat === 'All' || m.category === cat) &&
      (!s || `${m.name} ${m.source_sku ?? ''} ${m.category} ${m.description} ${m.source_description}`.toLowerCase().includes(s)));
    if (sort === 'low') matching.sort((a, b) => a.currency.localeCompare(b.currency) || a.price - b.price);
    if (sort === 'high') matching.sort((a, b) => a.currency.localeCompare(b.currency) || b.price - a.price);
    return matching;
  }, [items, search, cat, sort]);
  const pageSize = 24;
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const shown = list.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return <div className="mc-page" data-testid="page-raw-materials">
    <PageBar title={t('rawMaterials')} onBack={back}/>
    <section className="mc-raw-intro">
      <span className="mc-kicker" dir="ltr">MAYA COLLECTION · {t('rawMaterialsKicker')}</span>
      <h2>{t('rawIntroTitle')}</h2>
      <p>{t('rawIntroBody')}</p>
    </section>
    <div className="mc-raw-tools">
      <label className="mc-raw-search"><Search size={16}/><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t('rawSearchPlaceholder')} aria-label={t('rawSearchAria')} data-testid="input-raw-search"/></label>
      {cats.length > 2 && <div className="mc-raw-chips" role="group" aria-label={t('rawFilterCategory')}>{cats.map((c) => <button key={c} className={`mc-raw-chip${cat === c ? ' is-on' : ''}`} onClick={() => { setCat(c); setPage(1); }} aria-pressed={cat === c} data-testid={`chip-raw-category-${c}`}>{c === 'All' ? t('fam_all') : c}</button>)}</div>}
      <label className="mc-raw-sort">{t('rawSortBy')}
        <select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} aria-label={t('rawSortAria')} data-testid="select-raw-sort">
          <option value="featured">{t('rawSortFeatured')}</option><option value="low">{t('rawSortLow')}</option><option value="high">{t('rawSortHigh')}</option>
        </select>
      </label>
    </div>
    {q.isLoading ? <div className="mc-raw-list" aria-label={t('rawLoading')} data-testid="state-raw-loading">{[1, 2, 3, 4].map((n) => <div key={n} className="mc-raw-skel"/>)}</div>
      : q.isError ? <div className="mc-state" role="alert" data-testid="state-raw-error"><p>{t('rawLoadFailed')}</p><button className="mc-ghost-btn" onClick={() => void q.refetch()} data-testid="button-raw-retry"><RefreshCw size={15}/> {t('retry')}</button></div>
      : items.length === 0 ? <div className="mc-state" data-testid="state-raw-empty"><p>{t('rawEmpty')}</p></div>
      : list.length === 0 ? <div className="mc-state" data-testid="state-raw-no-results"><p>{t('rawNoMatches')}</p><button className="mc-ghost-btn" onClick={() => { setSearch(''); setCat('All'); }} data-testid="button-raw-clear">{t('clearSearch')}</button></div>
      : <>
         <p className="mc-raw-count" data-testid="text-raw-count">{t('rawCount').replace('{count}', String(list.length)).replace('{page}', String(currentPage)).replace('{pages}', String(totalPages))}</p>
         <div className="mc-raw-list">{shown.map((m, i) => <MaterialCard key={m.id} m={m} index={i}/>)}</div>
         {totalPages > 1 && <nav className="mc-raw-pages" aria-label={t('rawPageNav')}><button onClick={() => { setPage((old) => Math.max(1, old - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }} disabled={currentPage <= 1} aria-label={t('rawPagePreviousAria')}><ChevronLeft size={16}/>{t('rawPrevious')}</button><span>{t('rawPageSummary').replace('{page}', String(currentPage)).replace('{pages}', String(totalPages))}</span><button onClick={() => { setPage((old) => Math.min(totalPages, old + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }} disabled={currentPage >= totalPages} aria-label={t('rawPageNextAria')}>{t('rawNext')}<ChevronRight size={16}/></button></nav>}
      </>}
  </div>;
}
