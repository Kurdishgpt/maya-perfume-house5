import { useEffect, useState } from "react";
import { useSearchFragranceImages, type FragranceImage, type FragranceSuggestion, type ProductInput } from "@workspace/api-client-react";
import { ExternalLink, Loader2, Search, X } from "lucide-react";

type Props = {
  draft: ProductInput;
  suggestion: FragranceSuggestion | null;
  setField: <K extends keyof ProductInput>(key: K, value: ProductInput[K]) => void;
};

export function PerfumeResearch({ draft, suggestion, setField }: Props) {
  const [query, setQuery] = useState("");
  const [images, setImages] = useState<FragranceImage[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const search = useSearchFragranceImages();
  useEffect(() => {
    if (suggestion) {
      setImages(suggestion.image_results ?? []);
      setSearched(true);
      setQuery([suggestion.brand, suggestion.title].filter(Boolean).join(" ").slice(0, 120));
      setError("");
    }
  }, [suggestion]);
  const find = async () => {
    const term = (query || `${draft.brand} ${draft.title}`).trim();
    if (term.length < 2 || term.length > 120) { setError("Enter a perfume and brand name between 2 and 120 characters."); return; }
    setError(""); setImages([]); setSearched(false);
    try {
      const result = await search.mutateAsync({ data: { query: term } });
      setImages(result.images); setSearched(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Photo search failed. Please retry."); }
  };
  const toggleGallery = (url: string) => setField("gallery_images",
    draft.gallery_images.includes(url) ? draft.gallery_images.filter((u) => u !== url) :
      [...draft.gallery_images, url].slice(0, 8));
  return <section className="mt-5 rounded-lg border border-[#D9AD45]/25 p-3 sm:p-4" aria-label="Perfume photo search">
    <h3 className="font-serif text-lg text-[#F0D49A]">Find perfume photos</h3>
    <p className="mt-1 text-xs leading-5 text-[#b5c8c5]">Powered by Brave. Check the bottle, concentration and permission to use each photo. External images may stop loading; upload your own copy when you have permission.</p>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <input aria-label="Photo search query" value={query} maxLength={120} onChange={(e) => setQuery(e.target.value)} placeholder={draft.title || "Dior Sauvage Eau de Parfum"} className="h-11 min-w-0 flex-1 rounded border border-white/20 bg-[#00262a] px-3 text-sm text-white" data-testid="input-photo-search"/>
      <button type="button" disabled={search.isPending} onClick={() => void find()} className="flex h-11 items-center justify-center gap-2 rounded border border-[#D9AD45]/50 px-4 text-xs text-[#F0D49A] disabled:opacity-50" data-testid="button-search-photos">{search.isPending ? <Loader2 className="animate-spin" size={16}/> : <Search size={16}/>}Search photos</button>
    </div>
    {error && <p role="alert" className="mt-3 text-xs text-red-200">{error}</p>}
    {suggestion?.warnings?.map((warning) => <p key={warning} role="status" className="mt-2 text-xs text-amber-200">{warning}</p>)}
    {!search.isPending && searched && !images.length && !error && <p className="mt-3 text-xs text-[#b5c8c5]">No photos found. Try the exact brand, perfume name and concentration.</p>}
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {images.map((image, i) => <article key={image.image_url} className="min-w-0 rounded border border-white/15 bg-[#00262a] p-2" data-testid={`photo-result-${i}`}>
        <img src={image.thumbnail_url} alt={image.title} loading="lazy" referrerPolicy="no-referrer" className="aspect-square w-full rounded bg-white object-contain" onError={(e) => { e.currentTarget.hidden = true; }}/>
        <p className="mt-2 line-clamp-2 text-xs text-[#e7e4dc]">{image.title}</p>
        <a href={image.source_url} target="_blank" rel="noopener noreferrer" className="my-2 flex min-h-8 items-center gap-1 break-all text-[11px] text-[#F0D49A]">{image.source}<ExternalLink size={12} className="shrink-0"/></a>
        <button type="button" onClick={() => setField("image_url", image.image_url)} aria-pressed={draft.image_url === image.image_url} className="min-h-10 w-full rounded border border-[#D9AD45]/40 px-2 text-xs text-[#F0D49A]" data-testid={`button-main-photo-${i}`}>{draft.image_url === image.image_url ? "Main photo selected" : "Use as main photo"}</button>
        <button type="button" disabled={!draft.gallery_images.includes(image.image_url) && draft.gallery_images.length >= 8} onClick={() => toggleGallery(image.image_url)} aria-pressed={draft.gallery_images.includes(image.image_url)} className="mt-1 min-h-10 w-full rounded border border-white/15 px-2 text-xs text-white disabled:opacity-40" data-testid={`button-gallery-photo-${i}`}>{draft.gallery_images.includes(image.image_url) ? "Remove from gallery" : "Add to gallery"}</button>
      </article>)}
    </div>
    {draft.gallery_images.length > 0 && <div className="mt-4"><p className="text-xs text-[#F0D49A]">Gallery · {draft.gallery_images.length}/8</p><div className="mt-2 flex flex-wrap gap-2">{draft.gallery_images.map((url, i) => <div key={url} className="relative h-20 w-20 rounded bg-white"><img src={url} alt={`Gallery photo ${i + 1}`} className="h-full w-full rounded object-contain"/><button type="button" onClick={() => toggleGallery(url)} aria-label={`Remove gallery photo ${i + 1}`} className="absolute -right-1 -top-1 grid h-8 w-8 place-items-center rounded-full bg-[#002D32] text-white"><X size={14}/></button></div>)}</div></div>}
    {!!suggestion?.sources?.length && <div className="mt-4 border-t border-white/10 pt-3"><p className="text-xs text-[#F0D49A]">Web references for the AI draft · verify before saving</p><ul className="mt-2 space-y-2">{suggestion.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#b5c8c5] underline">{source.title}</a></li>)}</ul></div>}
  </section>;
}
