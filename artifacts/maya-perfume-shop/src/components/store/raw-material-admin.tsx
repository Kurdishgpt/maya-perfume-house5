import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getGetRawMaterialImportQueryKey,
  getListAdminRawMaterialsQueryKey,
  getListHillenRawMaterialCategoriesQueryOptions,
  getListRawMaterialImportsQueryKey,
  getListRawMaterialImportsQueryOptions,
  getListRawMaterialsQueryKey,
  getRawMaterialImport,
  useAddHillenRawMaterial,
  useCreateRawMaterialImport,
  useDeleteRawMaterial,
  useListAdminRawMaterials,
  useResearchRawMaterials,
  useStepRawMaterialImport,
  useUpdateRawMaterial,
} from "@workspace/api-client-react";
import type { HillenCategory, RawMaterial, RawMaterialCandidate, RawMaterialImport, RawMaterialResearch } from "@workspace/api-client-react";
import { AlertTriangle, CheckCircle2, CloudDownload, Download, ExternalLink, FlaskConical, Loader2, Pencil, Plus, RefreshCw, Search, Sparkles, Trash2, X } from "lucide-react";
import { formatMoney, type Currency } from "@/lib/money";

const card = "rounded-lg border border-white/[.08] bg-[#023f44]/90";
const input = "h-10 w-full rounded-md border border-white/[.09] bg-[#00262a] px-3 text-xs text-[#e2e0d8] outline-none placeholder:text-[#606b66] focus:border-[#b9a274]/60";
type Edit = { name: string; description: string; category: string; price: string; currency: Currency; published: boolean };

function messageOf(error: unknown) {
  if (error && typeof error === "object") {
    const details = error as { data?: { error?: string }; response?: { data?: { error?: string } }; message?: string };
    const serverMessage = details.data?.error ?? details.response?.data?.error;
    if (serverMessage) return serverMessage;
    if (details.message === "Failed to fetch" || details.message?.includes("NetworkError")) {
      return "Could not reach the store server. Check the API service and try again; saved import progress is safe.";
    }
    if (details.message) return details.message;
  }
  return "The request could not finish. Please try again.";
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function MaterialThumbnail({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded bg-[#03444a] text-[#D9AD45]">
    {src && !failed ? <img src={src} alt={name} className="h-full w-full object-cover" loading="lazy" onError={() => setFailed(true)}/> : <FlaskConical size={16}/>}
  </div>;
}

export function RawMaterialAdmin({ notify }: { notify: (tone: "success" | "error", text: string) => void }) {
  const queryClient = useQueryClient();
  const list = useListAdminRawMaterials();
  const categoriesQuery = useQuery(getListHillenRawMaterialCategoriesQueryOptions({
    query: { staleTime: 5 * 60_000, retry: 1 },
  }));
  const history = useQuery(getListRawMaterialImportsQueryOptions({
    query: { refetchInterval: 12_000, retry: 1 },
  }));
  const startRun = useCreateRawMaterialImport();
  const stepRun = useStepRawMaterialImport();
  const research = useResearchRawMaterials();
  const addOne = useAddHillenRawMaterial();
  const update = useUpdateRawMaterial();
  const remove = useDeleteRawMaterial();

  const [activeRun, setActiveRun] = useState<RawMaterialImport | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<RawMaterialResearch | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [savedCategory, setSavedCategory] = useState("All");
  const [editing, setEditing] = useState<RawMaterial | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [deleting, setDeleting] = useState<RawMaterial | null>(null);
  const [processing, setProcessing] = useState(false);

  const materials = list.data ?? [];
  const selectedCategoryId = selectedCategory === "all" ? null : Number(selectedCategory);
  const preview = activeRun?.mode === "dry-run" && activeRun.status === "complete" &&
    activeRun.category_id === selectedCategoryId ? activeRun : null;
  const busy = processing || startRun.isPending || stepRun.isPending || addOne.isPending;
  const savedIds = useMemo(() => new Set(materials.map((material) => material.source_id)), [materials]);
  const savedCategories = useMemo(() => [...new Set(materials.map((material) => material.category).filter(Boolean))].sort(), [materials]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return materials.filter((material) =>
      (savedCategory === "All" || material.category === savedCategory) &&
      (!term || `${material.name} ${material.description} ${material.source_description} ${material.source_sku ?? ""} ${material.category} ${material.source_id}`.toLowerCase().includes(term)),
    );
  }, [materials, savedCategory, search]);

  const refresh = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: getListAdminRawMaterialsQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getListRawMaterialsQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getListRawMaterialImportsQueryKey() }),
  ]);

  const processRun = async (initial: RawMaterialImport) => {
    setActiveRun(initial);
    setProcessing(true);
    let current = initial;
    try {
      for (let page = 0; page < 1000 && current.status !== "complete"; page++) {
        current = await stepRun.mutateAsync({ id: current.id });
        setActiveRun(current);
        void refresh();
        if (current.status === "partial") {
          notify("error", `Page ${current.failed_pages.join(", ")} needs a retry. Completed pages and progress are saved.`);
          return;
        }
      }
      if (current.status === "complete") {
        await refresh();
        if (current.mode === "dry-run") {
          notify("success", `Preview complete: ${current.discovered} unique supplier products across ${current.total_pages} pages.`);
        } else {
          notify("success", `Import complete: ${current.created} added, ${current.updated} supplier records refreshed, ${current.skipped} skipped.`);
        }
      }
    } catch (error) {
      try {
        current = await getRawMaterialImport(current.id);
        setActiveRun(current);
      } catch { /* Keep the latest locally saved page result visible. */ }
      notify("error", `${messageOf(error)} Use Resume to continue from the saved page.`);
    } finally {
      setProcessing(false);
      void refresh();
    }
  };

  const previewAll = async () => {
    try {
      const run = await startRun.mutateAsync({
        data: { mode: "dry-run", category_id: selectedCategoryId },
      });
      void processRun(run);
    } catch (error) {
      notify("error", messageOf(error));
    }
  };

  const importReviewed = async () => {
    if (!preview) return;
    const scope = preview.category_name;
    const approved = window.confirm(
      `Import the reviewed ${preview.discovered}-product preview for ${scope}?\n\n` +
      `${preview.created} new items and ${preview.updated} existing supplier records will be saved at their original listed prices and units. ` +
      `Your existing material edits and perfume catalog will remain unchanged.`,
    );
    if (!approved) return;
    try {
      const run = await startRun.mutateAsync({
        data: { mode: "import", category_id: preview.category_id, dry_run_id: preview.id },
      });
      void processRun(run);
    } catch (error) {
      notify("error", messageOf(error));
    }
  };

  const resumeRun = async (job: RawMaterialImport) => {
    setSelectedCategory(job.category_id === null ? "all" : String(job.category_id));
    const latest = await getRawMaterialImport(job.id).catch(() => job);
    setActiveRun(latest);
    void processRun(latest);
  };

  const runResearch = async () => {
    if (query.trim().length < 2) { notify("error", "Enter at least two characters."); return; }
    try { setResult(await research.mutateAsync({ data: { query: query.trim() } })); }
    catch (error) { notify("error", messageOf(error)); }
  };

  const importOne = async (candidate: RawMaterialCandidate) => {
    setAdding(candidate.source_id);
    try {
      await addOne.mutateAsync({ data: { source_id: candidate.source_id } });
      await refresh();
      notify("success", `${candidate.name} added at its original supplier price per gram.`);
    } catch (error) { notify("error", messageOf(error)); }
    finally { setAdding(null); }
  };

  const openEdit = (material: RawMaterial) => {
    setEditing(material);
    setEdit({
      name: material.name, description: material.description, category: material.category,
      price: String(material.price), currency: material.currency, published: material.published,
    });
  };

  const saveEdit = async () => {
    if (!editing || !edit) return;
    const price = Number(edit.price);
    if (!edit.name.trim() || !edit.category.trim()) { notify("error", "Name and category are required."); return; }
    if (!Number.isFinite(price) || price < 0) { notify("error", "Enter a valid price per gram."); return; }
    try {
      await update.mutateAsync({
        id: editing.id,
        data: {
          name: edit.name.trim(), description: edit.description, category: edit.category.trim(),
          price, currency: edit.currency, published: edit.published,
        },
      });
      await refresh();
      setEditing(null);
      notify("success", "Material saved.");
    } catch (error) { notify("error", messageOf(error)); }
  };

  const removeMaterial = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync({ id: deleting.id });
      await refresh();
      notify("success", `${deleting.name} removed.`);
      setDeleting(null);
    } catch (error) { notify("error", messageOf(error)); }
  };

  const exportJson = () => downloadFile(
    "maya-raw-materials.json", JSON.stringify(materials, null, 2), "application/json;charset=utf-8",
  );
  const exportCsv = () => {
    const fields = [
      "name", "source_sku", "category", "description", "source_description", "price", "currency",
      "unit", "source_price", "source_currency", "supplier_available", "quantity_options", "published", "source_id", "source_url",
    ] as const;
    const rows = [fields.join(","), ...materials.map((material) => fields.map((field) =>
      csvCell(field === "quantity_options" ? JSON.stringify(material.quantity_options) : material[field]),
    ).join(","))];
    downloadFile("maya-raw-materials.csv", `\uFEFF${rows.join("\r\n")}`, "text/csv;charset=utf-8");
  };

  const progress = activeRun ? Math.min(100, activeRun.total_pages
    ? Math.round(activeRun.processed_pages.length / activeRun.total_pages * 100)
    : 0) : 0;

  return <section className="animate-[fadeIn_.4s_ease-out] space-y-6" data-testid="section-raw-materials-admin">
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#a9956d]">RAW MATERIALS · {String(materials.length).padStart(2, "0")} SAVED</p>
        <h1 className="mt-2 font-serif text-[34px] leading-tight text-[#eee9df] md:text-[42px]">Material library</h1>
        <p className="mt-2 max-w-lg text-[12px] leading-5 text-[#8c9691]">Search and manage Hillen99 perfumery materials. Material listings and prices are separate from the perfume catalog.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={exportCsv} disabled={materials.length === 0} className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 px-3 text-[9px] uppercase tracking-wider text-[#d8d1bc] disabled:opacity-40" data-testid="button-export-raw-csv"><Download size={13}/>CSV</button>
        <button onClick={exportJson} disabled={materials.length === 0} className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 px-3 text-[9px] uppercase tracking-wider text-[#d8d1bc] disabled:opacity-40" data-testid="button-export-raw-json"><Download size={13}/>JSON</button>
      </div>
    </div>

    <div className={`${card} grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_260px] md:p-5`} data-testid="section-hillen-import">
      <div>
        <div className="flex items-center gap-2 text-[#d5c69f]"><CloudDownload size={16}/><h2 className="font-serif text-[21px]">Import the Hillen99 catalog</h2></div>
        <p className="mt-2 text-[11px] leading-5 text-[#9aa49f]">First review a live, read-only preview. Then import the selected category, or all discovered pages, at the supplier’s original price per gram. Import progress can be resumed after a connection fails.</p>
        <p className="mt-2 text-[10px] leading-5 text-[#beaF8c]">New materials are published on import. Image links point to Hillen99; confirm image reuse rights and current prices. Hillen99 availability is not Maya stock, and is not shown as an order promise.</p>
      </div>
      <div className="space-y-2">
        <label className="block text-[9px] uppercase tracking-wider text-[#9aa49f]">Supplier category</label>
        <select value={selectedCategory} onChange={(e) => { setSelectedCategory(e.target.value); setActiveRun(null); }} disabled={busy} className={input} data-testid="select-hillen-category">
          <option value="all">All discovered categories</option>
          {(categoriesQuery.data ?? []).map((category: HillenCategory) => <option key={category.id} value={category.id}>{category.name} · {category.count}</option>)}
        </select>
        {categoriesQuery.isError && <p className="text-[10px] text-[#e2a99b]" role="alert">Supplier categories could not be reached. The all-categories import is still available.</p>}
        <button onClick={() => void previewAll()} disabled={busy} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#b9a274]/35 px-3 text-[10px] uppercase tracking-[.11em] text-[#e3cf9e] disabled:opacity-40" data-testid="button-preview-hillen">{busy ? <Loader2 size={14} className="animate-spin"/> : <Search size={14}/>}Review catalog pages</button>
        <button onClick={() => void importReviewed()} disabled={busy || !preview || preview.created + preview.updated === 0} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#D9AD45] px-3 text-[10px] font-semibold uppercase tracking-[.11em] text-[#1b201f] hover:bg-[#F0D49A] disabled:opacity-40" data-testid="button-import-reviewed"><CloudDownload size={14}/>Import reviewed catalog</button>
      </div>
    </div>

    {activeRun && <div className={`${card} p-4 md:p-5`} data-testid="status-import-progress" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-[9px] uppercase tracking-[.16em] text-[#c1ad7f]">{activeRun.mode === "dry-run" ? "DRY-RUN PREVIEW" : "SUPPLIER IMPORT"} · {activeRun.category_name}</p>
          <h3 className="mt-1 font-serif text-xl text-[#e7e1d3]">{activeRun.status === "running" ? `Page ${activeRun.processed_pages.length + 1} of ${activeRun.total_pages || "…"}`
            : activeRun.status === "complete" ? activeRun.mode === "dry-run" ? "Review this preview before importing" : "Import complete"
              : "Some pages need a retry"}</h3>
        </div>
        {activeRun.status !== "complete" && <button onClick={() => void resumeRun(activeRun)} disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-[10px] text-[#F0D49A] disabled:opacity-50" data-testid="button-resume-import"><RefreshCw size={13}/>Resume saved pages</button>}
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded bg-white/[.06]"><div className="h-full bg-[#D9AD45] transition-all" style={{ width: `${progress}%` }}/></div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] text-[#c6c7bd] sm:grid-cols-4">
        <p><span className="block text-[9px] uppercase text-[#85908a]">Unique products</span>{activeRun.discovered} / {activeRun.processed ? activeRun.processed : activeRun.discovered}</p>
        <p><span className="block text-[9px] uppercase text-[#85908a]">{activeRun.mode === "dry-run" ? "Would be added" : "Added"}</span>{activeRun.created}</p>
        <p><span className="block text-[9px] uppercase text-[#85908a]">{activeRun.mode === "dry-run" ? "Existing records" : "Supplier data refreshed"}</span>{activeRun.updated}</p>
        <p><span className="block text-[9px] uppercase text-[#85908a]">Skipped</span>{activeRun.skipped}</p>
      </div>
      <p className="mt-3 text-[10px] text-[#909d96]">Pages checked: {activeRun.processed_pages.join(", ") || "none"} · Supplier total: {activeRun.total_pages ? `${activeRun.total_pages} pages` : "discovering"}</p>
      {activeRun.categories.length > 0 && <details className="mt-3 text-[10px] text-[#bdb9ab]"><summary className="cursor-pointer">Discovered categories ({activeRun.categories.length})</summary><p className="mt-2 leading-5">{activeRun.categories.join(" · ")}</p></details>}
      {activeRun.errors.length > 0 && <details className="mt-3 text-[10px] text-[#e4b0a5]"><summary className="cursor-pointer">Skipped items and failed URLs ({activeRun.errors.length})</summary><ul className="mt-2 max-h-44 space-y-2 overflow-auto">{activeRun.errors.map((error, index) => <li key={`${error.page}-${index}`}>Page {error.page} · <a className="underline" href={error.url} target="_blank" rel="noreferrer">source page</a> · {error.message}</li>)}</ul></details>}
    </div>}

    {history.data?.some((job) => job.status !== "complete") && <div className={`${card} p-4`} data-testid="section-resumable-imports">
      <p className="text-[9px] uppercase tracking-[.16em] text-[#c1ad7f]">SAVED IMPORTS</p>
      <div className="mt-3 space-y-2">{history.data.filter((job) => job.status !== "complete").slice(0, 5).map((job) =>
        <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[.06] pt-3 text-[11px]">
          <span className="text-[#c9c7bd]">{job.mode === "dry-run" ? "Dry run" : "Import"} · {job.category_name} · {job.processed_pages.length} of {job.total_pages || "?"} pages</span>
          <button onClick={() => void resumeRun(job)} disabled={busy} className="rounded border border-white/10 px-3 py-2 text-[10px] text-[#F0D49A] disabled:opacity-40" data-testid={`button-resume-run-${job.id}`}>Resume</button>
        </div>)}</div>
    </div>}

    <section className={`${card} p-4 md:p-5`}>
      <div className="flex items-center gap-2 text-[#d5c69f]"><Sparkles size={15}/><h2 className="font-serif text-[20px]">AI material search</h2></div>
      <p className="mt-1 text-[11px] text-[#929d97]">Search verified Hillen99 products. AI summarizes matches only; you choose each item to import.</p>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void runResearch(); }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. oud oil, iso e super, musk" className={input} minLength={2} maxLength={120} data-testid="input-raw-research"/>
        <button disabled={research.isPending} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-[#b49e70]/30 px-4 text-[10px] uppercase tracking-[.1em] text-[#d5c69f] disabled:opacity-50" data-testid="button-raw-research">{research.isPending ? <Loader2 size={14} className="animate-spin"/> : <Search size={14}/>}Search</button>
      </form>
      {result && <div className="mt-4 space-y-3" data-testid="state-raw-research-result">
        {result.warning && <p className="flex gap-2 text-[11px] text-[#e5c48f]" role="status"><AlertTriangle size={14} className="shrink-0"/>{result.warning} Verified search results remain available below.</p>}
        {result.answer && <p className="whitespace-pre-line text-[12px] leading-5 text-[#c9cbc3]">{result.answer}</p>}
        {result.matches.length === 0 ? <p className="text-[12px] text-[#828d87]" data-testid="state-raw-research-empty">No matching Hillen99 materials found.</p>
          : <ul className="grid gap-2 md:grid-cols-2">{result.matches.map((candidate) => {
            const saved = savedIds.has(candidate.source_id);
            return <li key={candidate.source_id} className="flex gap-3 rounded-lg border border-white/[.07] bg-[#00262a]/70 p-3" data-testid={`card-raw-candidate-${candidate.source_id}`}>
              <MaterialThumbnail src={candidate.image_url} name={candidate.name}/>
              <div className="min-w-0 flex-1"><p className="truncate font-serif text-[16px] text-[#F0D49A]">{candidate.name}</p><p className="text-[10px] text-[#9fb3b0]">{candidate.category} · <span className="font-mono">{formatMoney(candidate.price, candidate.currency)}/{candidate.unit === "g" ? "g" : "item"}</span> · Hillen99 {candidate.supplier_available ? "lists available" : "lists unavailable"}</p><a href={candidate.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[10px] text-[#a99770]">Source <ExternalLink size={10}/></a></div>
              <button onClick={() => void importOne(candidate)} disabled={saved || !!adding || addOne.isPending} className="h-9 shrink-0 self-center rounded-md border border-white/10 px-3 text-[10px] text-[#F0D49A] disabled:opacity-40" data-testid={`button-add-candidate-${candidate.source_id}`}>{adding === candidate.source_id ? <Loader2 size={13} className="animate-spin"/> : saved ? "Saved" : <span className="inline-flex items-center gap-1"><Plus size={12}/>Add</span>}</button>
            </li>;
          })}</ul>}
      </div>}
    </section>

    <section className={card}>
      <div className="grid gap-2 border-b border-white/[.07] p-4 sm:grid-cols-[1fr_200px]">
        <label className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#737e79]"/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, CAS, keywords or SKU" className={`${input} pl-9`} data-testid="input-raw-admin-search"/></label>
        <select value={savedCategory} onChange={(e) => setSavedCategory(e.target.value)} className={input} aria-label="Filter category" data-testid="select-raw-admin-category"><option>All</option>{savedCategories.map((category) => <option key={category}>{category}</option>)}</select>
      </div>
      {list.isLoading ? <div className="space-y-2 p-4">{[1, 2, 3].map((index) => <div key={index} className="h-16 animate-pulse rounded bg-[#03444a]"/>)}</div>
        : list.isError ? <div className="p-8 text-center" role="alert" data-testid="state-raw-admin-error"><p className="text-sm text-[#f0c2b6]">{messageOf(list.error)}</p><button onClick={() => void list.refetch()} className="mt-3 text-[10px] uppercase tracking-wider text-[#d0bb8c]" data-testid="button-raw-admin-retry">Try again</button></div>
        : materials.length === 0 ? <div className="p-10 text-center" data-testid="state-raw-admin-empty"><FlaskConical className="mx-auto text-[#b9a274]" size={20}/><p className="mt-3 font-serif text-lg text-[#e8e4d9]">No materials saved yet</p><p className="mt-1 text-xs text-[#818c87]">Review the supplier catalog above or search for a specific ingredient.</p></div>
          : filtered.length === 0 ? <div className="p-10 text-center" data-testid="state-raw-admin-no-results"><p className="font-serif text-lg text-[#dedbd1]">No matching materials</p><button onClick={() => { setSearch(""); setSavedCategory("All"); }} className="mt-3 text-[10px] uppercase tracking-wider text-[#d0bb8c]">Clear filters</button></div>
            : <ul className="divide-y divide-white/[.06]">{filtered.map((material) => <li key={material.id} className="flex gap-3 p-3 md:p-4" data-testid={`row-raw-material-${material.id}`}>
              <MaterialThumbnail src={material.image_url} name={material.name}/>
              <div className="min-w-0 flex-1"><p className="truncate font-serif text-[16px] text-[#F0D49A]">{material.name}</p><p className="mt-0.5 text-[10px] text-[#9fb3b0]">{material.category} · Hillen99 #{material.source_id} · {material.source_sku ?? "No supplier SKU"}</p>
                {material.source_category !== material.category && <p className="mt-1 text-[9px] text-[#7f8984]">Supplier category: {material.source_category || "not specified"}</p>}
                <p className="mt-1 flex flex-wrap gap-x-3 text-[11px]"><span className="font-mono text-[#e2ddcf]">{formatMoney(material.price, material.currency)}/{material.unit === "g" ? "g" : "item"}</span><span className="text-[#77817c]">Source {formatMoney(material.source_price, material.source_currency)}/{material.unit === "g" ? "g" : "item"}</span><span className={material.published ? "text-[#9fd1c4]" : "text-[#c9a98f]"}>{material.published ? "Published" : "Hidden"}</span></p>
                {material.price !== material.source_price || material.currency !== material.source_currency ? <p className="mt-1 text-[10px] text-[#d9c99b]">Merchant price differs from the supplier’s latest listing.</p> : null}
                <a href={material.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[10px] text-[#a99770]">Hillen99 source page <ExternalLink size={10}/></a>
              </div>
              <div className="flex shrink-0 flex-col gap-1 sm:flex-row sm:items-center">
                <button onClick={() => void update.mutateAsync({ id: material.id, data: { published: !material.published } }).then(refresh).catch((error) => notify("error", messageOf(error)))} disabled={update.isPending} className="h-9 rounded-md border border-white/10 px-2 text-[10px] text-[#c6cbc5] disabled:opacity-50" data-testid={`button-toggle-raw-${material.id}`}>{material.published ? "Hide" : "Publish"}</button>
                <div className="flex gap-1"><button onClick={() => openEdit(material)} aria-label={`Edit ${material.name}`} className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-[#F0D49A]" data-testid={`button-edit-raw-${material.id}`}><Pencil size={14}/></button>
                  <button onClick={() => setDeleting(material)} aria-label={`Delete ${material.name}`} className="grid h-9 w-9 place-items-center rounded-md border border-[#c7796a]/25 text-[#e09a8b]" data-testid={`button-delete-raw-${material.id}`}><Trash2 size={14}/></button></div>
              </div>
            </li>)}</ul>}
    </section>

    {editing && edit && <div className="fixed inset-0 z-[60] grid place-items-end bg-black/70 sm:place-items-center sm:p-4"><section role="dialog" aria-modal="true" aria-labelledby="raw-edit-title" className="max-h-[92dvh] w-full max-w-[520px] overflow-auto rounded-t-xl border border-white/10 bg-[#033f44] p-5 sm:rounded-xl">
      <div className="flex items-center justify-between"><h2 id="raw-edit-title" className="font-serif text-2xl text-[#eee9df]">Edit material</h2><button onClick={() => setEditing(null)} aria-label="Close" className="p-2 text-[#9ba29e]" data-testid="button-close-raw-edit"><X size={18}/></button></div>
      <div className="mt-4 grid gap-3 text-[10px] uppercase tracking-[.12em] text-[#8c9691]">
        <label>Name<input className={`${input} mt-1`} value={edit.name} maxLength={500} onChange={(e) => setEdit({ ...edit, name: e.target.value })} data-testid="input-raw-edit-name"/></label>
        <label>Category<input className={`${input} mt-1`} value={edit.category} maxLength={150} onChange={(e) => setEdit({ ...edit, category: e.target.value })} data-testid="input-raw-edit-category"/></label>
        <div className="grid grid-cols-[1fr_110px] gap-2"><label>Price per gram<input type="number" min={0} step="any" className={`${input} mt-1`} value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} data-testid="input-raw-edit-price"/></label>
          <label>Currency<select className={`${input} mt-1`} value={edit.currency} onChange={(e) => setEdit({ ...edit, currency: e.target.value as Currency })} data-testid="select-raw-edit-currency"><option value="USD">USD</option><option value="IQD">IQD</option></select></label></div>
        <p className="normal-case tracking-normal text-[#b9af92]">Supplier price: {formatMoney(editing.source_price, editing.source_currency)} per {editing.unit === "g" ? "gram" : "item"}. This is a recorded value only; changing currency does not convert the amount.</p>
        <label>Description<textarea className={`${input} mt-1 h-28 py-2`} value={edit.description} maxLength={3000} onChange={(e) => setEdit({ ...edit, description: e.target.value })} data-testid="input-raw-edit-description"/></label>
        <label className="flex items-center gap-2 normal-case tracking-normal text-[#c6cbc5]"><input type="checkbox" checked={edit.published} onChange={(e) => setEdit({ ...edit, published: e.target.checked })} data-testid="checkbox-raw-edit-published"/>Published on the public Raw Materials page</label>
      </div>
      <div className="mt-5 flex justify-end gap-2"><button onClick={() => setEditing(null)} className="rounded-md border border-white/10 px-4 py-2.5 text-xs text-[#c6cbc5]">Cancel</button><button onClick={() => void saveEdit()} disabled={update.isPending} className="inline-flex items-center gap-2 rounded-md bg-[#D9AD45] px-4 py-2.5 text-xs font-semibold text-[#1b201f] disabled:opacity-50" data-testid="button-save-raw-edit">{update.isPending && <Loader2 size={13} className="animate-spin"/>}Save</button></div>
    </section></div>}

    {deleting && <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4"><section role="alertdialog" aria-modal="true" aria-labelledby="raw-delete-title" className="w-full max-w-[420px] rounded-xl border border-white/10 bg-[#033f44] p-6">
      <h2 id="raw-delete-title" className="font-serif text-2xl text-[#eee9df]">Remove this material?</h2><p className="mt-2 text-sm leading-6 text-[#9ba39e]"><span className="text-[#e5dfd1]">{deleting.name}</span> will be removed from the library and public page. Re-importing can add it again.</p>
      <div className="mt-6 flex justify-end gap-3"><button onClick={() => setDeleting(null)} className="rounded-md border border-white/10 px-4 py-2.5 text-xs text-[#c6cbc5]" data-testid="button-cancel-raw-delete">Keep</button><button onClick={() => void removeMaterial()} disabled={remove.isPending} className="inline-flex items-center gap-2 rounded-md bg-[#a9574d] px-4 py-2.5 text-xs text-white disabled:opacity-50" data-testid="button-confirm-raw-delete">{remove.isPending && <Loader2 size={13} className="animate-spin"/>}Remove</button></div>
    </section></div>}
  </section>;
}
