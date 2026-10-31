import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { PerfumeResearch } from "@/components/store/perfume-research";
import { CommaSeparatedInput } from "@/components/store/comma-separated-input";
import { RawMaterialAdmin } from "@/components/store/raw-material-admin";
import AdminContact from "@/pages/admin-contact";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  useAutofillFragrance,
  useCreateProduct,
  useDeleteProduct,
  getGetAdminPasscodeStatusQueryKey,
  useGetAdminPasscodeStatus,
  useLockAdminPasscode,
  useListProducts,
  useRequestUploadUrl,
  useUpdateProduct,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import type { FragranceSuggestion, Product, ProductInput } from "@workspace/api-client-react";
import {
  AlertTriangle, ArrowDown, ArrowDownUp, ArrowLeft, ArrowRight, Boxes, Check, CheckCircle2, Database,
  ChevronDown, CircleHelp, CloudUpload, Download, ExternalLink, FlaskConical, LayoutDashboard, Loader2, Mail,
  Menu, Package, Pencil, Plus, Search, Settings2, Sparkles, Store, Trash2, Upload, X,
} from "lucide-react";

type Page = "Dashboard" | "Products" | "Raw Materials" | "Storefront Sync" | "Inbox & Hours" | "Settings";
type EditorMode = "manual" | "ai";
type Draft = ProductInput;
import { comparePrices, formatMoney } from "@/lib/money";
import { getSupabaseClient } from "@/lib/supabase";

const blankDraft = (): Draft => ({
  title: "", brand: "", price: 0, currency: "USD", bottle_size_ml: null, stock: 0, sku: "", category: "", description: "",
  top_notes: [], heart_notes: [], base_notes: [], ingredients: [], image_url: "", gallery_images: [],
});
const navItems: { label: Page; icon: typeof LayoutDashboard }[] = [
  { label: "Dashboard", icon: LayoutDashboard }, { label: "Products", icon: Package },
  { label: "Raw Materials", icon: FlaskConical },
  { label: "Storefront Sync", icon: Store }, { label: "Inbox & Hours", icon: Mail },
  { label: "Settings", icon: Settings2 },
];
const money = formatMoney;
const errText = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";

export default function AdminPanel() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const access = useGetAdminPasscodeStatus({
    query: { queryKey: getGetAdminPasscodeStatusQueryKey(), refetchInterval: 60_000 },
  });
  const lockAdmin = useLockAdminPasscode();
  const productsQuery = useListProducts();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const autofill = useAutofillFragrance();
  const requestUpload = useRequestUploadUrl();
  const [page, setPage] = useState<Page>("Products");
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All categories");
  const [brand, setBrand] = useState("All brands");
  const [sort, setSort] = useState("featured");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [mode, setMode] = useState<EditorMode>("manual");
  const [aiQuery, setAiQuery] = useState("");
  const [suggestion, setSuggestion] = useState<FragranceSuggestion | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [syncChecked, setSyncChecked] = useState("");
  const [lowStockThreshold, setLowStockThreshold] = useState(() => {
    try { return Number(localStorage.getItem("maya-low-stock") || 5); } catch { return 5; }
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const editorSession = useRef(0);
  const originalDraft = useRef(JSON.stringify(blankDraft()));
  const [uploading, setUploading] = useState(false);
  const saving = createProduct.isPending || updateProduct.isPending;
  const dirty = JSON.stringify(draft) !== originalDraft.current;
  useEffect(() => {
    if (!editorOpen || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editorOpen, dirty]);
  const products = productsQuery.data ?? [];
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(), [products]);
  const brands = useMemo(() => [...new Set(products.map((p) => p.brand).filter(Boolean))].sort(), [products]);
  const filtered = useMemo(() => {
    let list = products.filter((p) => {
      const q = search.trim().toLowerCase();
      const matchesQuery = !q || [p.title, p.brand, p.sku, p.category, ...p.top_notes, ...p.heart_notes, ...p.base_notes].join(" ").toLowerCase().includes(q);
      return matchesQuery && (category === "All categories" || p.category === category) && (brand === "All brands" || p.brand === brand);
    });
    if (sort === "price-low") list = [...list].sort((a, b) => comparePrices(a, b));
    if (sort === "price-high") list = [...list].sort((a, b) => comparePrices(a, b, -1));
    if (sort === "stock-low") list = [...list].sort((a, b) => a.stock - b.stock);
    if (sort === "stock-high") list = [...list].sort((a, b) => b.stock - a.stock);
    return list;
  }, [products, search, category, brand, sort]);
  const lowStock = products.filter((p) => p.stock <= lowStockThreshold);
  const notify = (tone: "success" | "error", text: string) => {
    setToast({ tone, text });
    window.setTimeout(() => setToast(null), 4200);
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
  const signOut = async () => {
    try {
      await lockAdmin.mutateAsync();
      queryClient.setQueryData(getGetAdminPasscodeStatusQueryKey(), { unlocked: false });
      setLocation("/");
    } catch (error) { notify("error", `Sign out failed. ${errText(error)}`); }
  };
  const checkSync = async () => {
    const result = await productsQuery.refetch();
    setSyncChecked(new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }));
    notify(result.isError ? "error" : "success", result.isError ? "Storefront catalog could not be reached." : "Storefront catalog is up to date.");
  };
  const openCreate = (initialMode: EditorMode = "manual") => {
    editorSession.current += 1;
    const initial = blankDraft();
    originalDraft.current = JSON.stringify(initial);
    setUploading(false);
    setEditTarget(null); setDraft(initial); setMode(initialMode); setAiQuery(""); setSuggestion(null); setEditorOpen(true);
  };
  const openEdit = (product: Product) => {
    const { id: _id, created_at: _created, ...input } = product;
    editorSession.current += 1;
    originalDraft.current = JSON.stringify(input);
    setUploading(false);
    setEditTarget(product); setDraft({ ...input }); setMode("manual"); setSuggestion(null); setEditorOpen(true);
  };
  const closeEditor = () => {
    if (saving) return;
    if ((dirty || uploading || autofill.isPending) && !window.confirm("Discard unsaved changes and close this fragrance?")) return;
    editorSession.current += 1;
    setUploading(false);
    setEditorOpen(false);
  };
  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const setNotes = (key: "top_notes" | "heart_notes" | "base_notes" | "ingredients", value: string) =>
    setField(key, value.split(",").map((note) => note.trim()).filter(Boolean));
  const submitDraft = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || uploading || autofill.isPending) return;
    try {
      const payload: ProductInput = { ...draft, title: draft.title.trim(), brand: draft.brand.trim(),
        category: draft.category.trim(), sku: draft.sku.trim(), price: Number(draft.price), stock: Number(draft.stock) };
      if (!payload.title || !payload.brand || !payload.category || !payload.sku) throw new Error("Enter a name, brand, category and SKU.");
      if (!Number.isFinite(payload.price) || payload.price < 0) throw new Error("Enter a valid price of zero or more.");
      if (payload.bottle_size_ml != null && (!Number.isInteger(payload.bottle_size_ml) || payload.bottle_size_ml < 1 || payload.bottle_size_ml > 10000)) throw new Error("Bottle size must be a whole number from 1 to 10,000 ml.");
      if (!Number.isInteger(payload.stock) || payload.stock < 0) throw new Error("Stock must be a whole number of zero or more.");
      if (editTarget) await updateProduct.mutateAsync({ id: editTarget.id, data: payload });
      else await createProduct.mutateAsync({ data: payload });
      await refresh();
      editorSession.current += 1;
      setEditorOpen(false);
      notify("success", editTarget ? "Fragrance details saved." : "Fragrance added to the collection.");
    } catch (error) { notify("error", errText(error)); }
  };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteProduct.mutateAsync({ id: deleteTarget.id });
      await refresh(); setDeleteTarget(null); notify("success", `${deleteTarget.title} removed from the catalog.`);
    } catch (error) { notify("error", errText(error)); }
  };
  const generateSuggestion = async () => {
    if (aiQuery.trim().length < 2) { notify("error", "Enter at least two characters for the fragrance name."); return; }
    const session = editorSession.current;
    try {
      const result: FragranceSuggestion = await autofill.mutateAsync({ data: { query: aiQuery.trim() } });
      if (session !== editorSession.current) return;
      const { image_results: _images, sources: _sources, warnings: _warnings, ...fields } = result;
      setSuggestion(result);
      setDraft((current) => ({ ...current, ...fields, price: current.price,
        currency: current.currency, bottle_size_ml: current.bottle_size_ml,
        image_url: current.image_url, gallery_images: current.gallery_images,
        ingredients: current.ingredients, stock: current.stock, sku: current.sku }));
      notify("success", "Draft ready. Review the details and select photos below.");
    } catch (error) { if (session === editorSession.current) notify("error", errText(error)); }
  };
  const uploadImage = async (file?: File) => {
    if (!file) return;
    if (uploading) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) { notify("error", "Choose a JPEG, PNG, WebP or AVIF image."); return; }
    if (file.size > 5 * 1024 * 1024) { notify("error", "Image must be 5 MB or smaller."); return; }
    const session = editorSession.current;
    setUploading(true);
    try {
      const signed = await requestUpload.mutateAsync({ data: { name: file.name, size: file.size, contentType: file.type } });
      if (signed.uploadToken && signed.bucket && signed.publicUrl) {
        const { error } = await getSupabaseClient()
          .storage.from(signed.bucket)
          .uploadToSignedUrl(signed.objectPath, signed.uploadToken, file, { contentType: file.type });
        if (error) throw new Error("Image upload did not complete.");
      } else {
        const response = await fetch(signed.uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!response.ok) throw new Error("Image upload did not complete.");
      }
      if (session !== editorSession.current) return;
      const objectPath = signed.objectPath.replace(/^\/objects\//, "");
      setField("image_url", signed.publicUrl || `/api/storage/objects/${objectPath}`);
      notify("success", "Image uploaded and attached to this fragrance.");
    } catch (error) { if (session === editorSession.current) notify("error", errText(error)); }
    finally { if (session === editorSession.current) setUploading(false); }
  };
  const loading = access.isLoading || productsQuery.isLoading;

  if (loading) return <div className="min-h-[100dvh] bg-[#002D32] p-6 text-[#e9e6dd]" data-testid="state-admin-loading">
    <div className="mx-auto max-w-7xl animate-pulse space-y-6"><div className="h-10 w-48 rounded bg-[#03444a]"/><div className="grid gap-4 md:grid-cols-4">{[1,2,3,4].map((n)=><div key={n} className="h-28 rounded-xl bg-[#03444a]"/>)} </div><div className="h-80 rounded-xl bg-[#03444a]"/></div>
  </div>;
  if (access.isError || productsQuery.isError) return <div className="grid min-h-[100dvh] place-items-center bg-[#002D32] px-6 text-[#eee9df]" data-testid="state-admin-error">
    <div className="max-w-md text-center"><AlertTriangle className="mx-auto mb-4 text-[#c8a978]" size={30}/><h1 className="font-serif text-3xl">The archive is unavailable</h1><p className="mt-3 text-sm leading-6 text-[#9ca5a2]">{errText(access.error ?? productsQuery.error)}</p><button onClick={() => { access.refetch(); productsQuery.refetch(); }} className="mt-6 rounded-md bg-[#D9AD45] px-5 py-3 text-xs font-semibold uppercase tracking-[.14em] text-[#1a1d1d]" data-testid="button-retry-admin">Try again</button></div>
  </div>;
  if (access.data && !access.data.unlocked) return <div className="grid min-h-[100dvh] place-items-center bg-[#002D32] px-6 text-[#eee9df]" data-testid="state-admin-denied"><div className="max-w-md text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-[#c8a978]/30 text-[#c8a978]"><CircleHelp size={24}/></div><h1 className="mt-5 font-serif text-3xl">Private collection</h1><p className="mt-3 text-sm leading-6 text-[#9ca5a2]">Unlock the admin panel to manage the catalog.</p></div></div>;

  return <div className="min-h-[100dvh] bg-[#002D32] text-[#e8e5dd]" data-testid="admin-panel">
    <div className="pointer-events-none fixed inset-0 z-0 opacity-[.12]" style={{ backgroundImage: "radial-gradient(#c9b587 0.55px, transparent 0.55px)", backgroundSize: "18px 18px" }}/>
    <div className="relative z-10 min-h-[100dvh] md:flex">
      <aside className={`${mobileNav ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-40 flex w-[270px] flex-col border-r border-white/[.07] bg-[#00363b] px-5 py-6 transition-transform duration-300 md:sticky md:top-0 md:h-[100dvh] md:translate-x-0`} aria-label="Admin navigation">
        <div className="flex items-center justify-between px-2"><div><p className="font-serif text-[21px] tracking-[.13em] text-[#F0D49A]">MAYA</p><p className="mt-0.5 text-[8px] tracking-[.34em] text-[#9a9b91]">COLLECTION · ATELIER</p></div><button className="rounded p-2 text-[#9ba29e] md:hidden" onClick={() => setMobileNav(false)} aria-label="Close navigation" data-testid="button-close-sidebar"><X size={18}/></button></div>
        <div className="mt-10 px-3 text-[9px] font-semibold uppercase tracking-[.2em] text-[#68716e]">Workspace</div>
        <nav className="mt-3 grid gap-1" aria-label="Admin sections">{navItems.map(({ label, icon: Icon })=><button key={label} onClick={()=>{setPage(label);setMobileNav(false);}} className={`flex items-center gap-3 rounded-md px-3 py-3 text-left text-[13px] transition-colors ${page===label?"bg-[#0b5157] text-[#F0D49A]":"text-[#909a96] hover:bg-white/[.04] hover:text-[#e8e5dd]"}`} aria-current={page===label?"page":undefined} data-testid={`nav-${label.toLowerCase().replaceAll(" ","-")}`}><Icon size={16} strokeWidth={1.7}/>{label}{label==="Products"&&<span className="ml-auto rounded-full bg-[#313b39] px-2 py-0.5 text-[10px] text-[#c6c9bb]" data-testid="text-sidebar-product-count">{products.length}</span>}</button>)}</nav>
        <div className="mt-auto rounded-lg border border-[#c7b182]/15 bg-[#c7b182]/[.045] p-4"><div className="flex items-center gap-2 text-[#cbbb94]"><FlaskConical size={14}/><span className="text-[9px] font-semibold uppercase tracking-[.15em]">The Maya edit</span></div><p className="mt-3 font-serif text-[17px] leading-6 text-[#e7e1d2]">Every note has a reason.</p><p className="mt-2 text-[11px] leading-5 text-[#929b96]">Compose the story behind each signature scent.</p></div>
        <div className="mt-5 flex items-center gap-3 border-t border-white/[.07] px-2 pt-5"><div className="grid h-8 w-8 place-items-center rounded-full border border-[#b8a77d]/45 bg-[#252b2a] font-serif text-sm text-[#d9c797]">M</div><div><p className="text-[11px] font-medium text-[#deddd5]">Maya Collection</p><p className="mt-0.5 text-[9px] text-[#7f8985]">Catalog administrator</p></div><span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#8ca891]" aria-label="Online"/></div>
      </aside>
      {mobileNav&&<button className="fixed inset-0 z-30 bg-black/55 md:hidden" aria-label="Close menu overlay" onClick={()=>setMobileNav(false)} data-testid="button-sidebar-overlay"/>}
      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-white/[.07] bg-[#002D32]/90 px-5 backdrop-blur-xl md:px-9">
          <div className="flex items-center gap-3"><button onClick={()=>setMobileNav(true)} className="rounded p-2 text-[#adb2ad] md:hidden" aria-label="Open navigation" data-testid="button-open-sidebar"><Menu size={18}/></button><span className="hidden text-[10px] uppercase tracking-[.14em] text-[#69736f] sm:inline">Maya Collection</span><span className="hidden text-[#4b5451] sm:inline">/</span><span className="text-[11px] uppercase tracking-[.12em] text-[#d3d0c7]" data-testid="text-current-page">{page}</span></div>
          <div className="flex items-center gap-3"><span className="hidden items-center gap-2 text-[10px] text-[#929b96] sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#8aa28c]"/>Catalog connected</span><span className="h-7 w-px bg-white/10"/><span className="text-[10px] tracking-[.08em] text-[#a0a59f]" data-testid="text-admin-date">ATELIER · {new Date().toLocaleDateString("en-US",{month:"short",day:"2-digit"})}</span><button onClick={() => void signOut()} disabled={lockAdmin.isPending} className="rounded border border-white/10 px-3 py-2 text-[9px] uppercase tracking-[.12em] text-[#aeb5ae] hover:bg-white/[.05] disabled:opacity-50" data-testid="button-admin-sign-out">{lockAdmin.isPending ? "Signing out…" : "Sign out"}</button></div>
        </header>
        <div className="mx-auto max-w-[1500px] px-5 py-7 md:px-9 md:py-9">
          {page==="Products"&&<ProductsView products={products} filtered={filtered} categories={categories} brands={brands} search={search} setSearch={setSearch} category={category} setCategory={setCategory} brand={brand} setBrand={setBrand} sort={sort} setSort={setSort} onCreate={openCreate} onEdit={openEdit} onDelete={setDeleteTarget} loading={productsQuery.isFetching} threshold={lowStockThreshold}/>}
          {page==="Raw Materials"&&<RawMaterialAdmin notify={notify}/>}
          {page==="Dashboard"&&<DashboardView products={products} lowStock={lowStock} threshold={lowStockThreshold} onProducts={()=>setPage("Products")} onCreate={()=>openCreate("manual")} onSync={()=>setPage("Storefront Sync")}/>}
          {page==="Storefront Sync"&&<SyncView products={products} checked={syncChecked || (productsQuery.dataUpdatedAt ? new Date(productsQuery.dataUpdatedAt).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "Awaiting first check")} onCheck={()=>void checkSync()} checking={productsQuery.isFetching} connected={!productsQuery.isError} onProducts={()=>setPage("Products")}/>}
          {page==="Inbox & Hours"&&<AdminContact/>}
          {page==="Settings"&&<SettingsView threshold={lowStockThreshold} onThreshold={(value)=>{const safe=Math.max(0,Number(value)||0);setLowStockThreshold(safe);try{localStorage.setItem("maya-low-stock",String(safe));}catch{}}}/>}
        </div>
      </main>
    </div>
    {editorOpen&&<ProductEditor research={<PerfumeResearch draft={draft} suggestion={suggestion} setField={setField}/>} draft={draft} setField={setField} setNotes={setNotes} mode={mode} setMode={setMode} editTarget={editTarget} onClose={closeEditor} onSubmit={submitDraft} onGenerate={generateSuggestion} aiQuery={aiQuery} setAiQuery={setAiQuery} aiPending={autofill.isPending} saving={saving} uploadPending={uploading} onPickFile={()=>fileInput.current?.click()} onFile={(file)=>uploadImage(file)} fileInput={fileInput}/>}
    {deleteTarget&&<div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4" role="presentation"><section role="alertdialog" aria-modal="true" aria-labelledby="delete-title" className="w-full max-w-[430px] rounded-xl border border-white/10 bg-[#033f44] p-6 shadow-2xl"><div className="grid h-11 w-11 place-items-center rounded-full border border-[#c7796a]/25 bg-[#c7796a]/10 text-[#d28b7b]"><Trash2 size={18}/></div><h2 id="delete-title" className="mt-5 font-serif text-2xl">Remove this fragrance?</h2><p className="mt-2 text-sm leading-6 text-[#9ba39e]"><span className="text-[#e5dfd1]">{deleteTarget.title}</span> will be removed from the catalog. This cannot be undone.</p><div className="mt-7 flex justify-end gap-3"><button onClick={()=>setDeleteTarget(null)} className="rounded-md border border-white/10 px-4 py-2.5 text-xs text-[#c6cbc5]" data-testid="button-cancel-delete">Keep fragrance</button><button onClick={confirmDelete} disabled={deleteProduct.isPending} className="inline-flex items-center gap-2 rounded-md bg-[#a9574d] px-4 py-2.5 text-xs font-medium text-white disabled:opacity-50" data-testid="button-confirm-delete">{deleteProduct.isPending&&<Loader2 size={14} className="animate-spin"/>}Remove</button></div></section></div>}
    {toast&&<div role="status" aria-live="polite" className={`fixed bottom-5 right-5 z-[80] flex max-w-[calc(100vw-40px)] items-center gap-3 rounded-lg border px-4 py-3 shadow-xl ${toast.tone==="success"?"border-[#7e9b84]/30 bg-[#1c2824] text-[#dce7db]":"border-[#bd7162]/30 bg-[#2a211f] text-[#f0d6cf]"}`} data-testid={`toast-${toast.tone}`}><span className={toast.tone==="success"?"text-[#a9c3a8]":"text-[#d28b7b]"}>{toast.tone==="success"?<CheckCircle2 size={17}/>:<AlertTriangle size={17}/>}</span><span className="text-xs leading-5">{toast.text}</span><button onClick={()=>setToast(null)} className="ml-2 text-current opacity-60 hover:opacity-100" aria-label="Dismiss notification" data-testid="button-dismiss-toast"><X size={14}/></button></div>}
  </div>;
}

function ProductsView(props: {
  products: Product[]; filtered: Product[]; categories: string[]; brands: string[]; search: string; setSearch: (v:string)=>void;
  category:string; setCategory:(v:string)=>void; brand:string; setBrand:(v:string)=>void; sort:string; setSort:(v:string)=>void;
  onCreate:(mode?:EditorMode)=>void; onEdit:(p:Product)=>void; onDelete:(p:Product)=>void; loading:boolean; threshold:number;
}) {
  const {products,filtered,categories,brands,search,setSearch,category,setCategory,brand,setBrand,sort,setSort,onCreate,onEdit,onDelete,loading,threshold}=props;
  return <section className="animate-[fadeIn_.4s_ease-out]">
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#a9956d]">CURATED CATALOG · {String(products.length).padStart(2,"0")} SCENTS</p><h1 className="mt-2 font-serif text-[34px] leading-tight tracking-[-.02em] text-[#eee9df] md:text-[42px]">The fragrance archive</h1><p className="mt-2 max-w-lg text-[12px] leading-5 text-[#8c9691]">Manage the compositions, materials and stories that shape the Maya Collection.</p></div><button onClick={()=>onCreate("manual")} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#D9AD45] px-5 text-[10px] font-semibold uppercase tracking-[.13em] text-[#1b201f] transition-colors hover:bg-[#F0D49A]" data-testid="button-add-product"><Plus size={15}/> Add fragrance</button></div>
    <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">{[
      {label:"Live fragrances",value:products.length,detail:"available in the archive",icon:Boxes},
      {label:"In stock",value:products.filter(p=>p.stock>0).length,detail:"ready for the storefront",icon:Package},
      {label:"Low stock",value:products.filter(p=>p.stock<=threshold).length,detail:`at or below ${threshold} units`,icon:AlertTriangle},
      {label:"Scent families",value:categories.length,detail:"distinct categories",icon:FlaskConical},
    ].map(({label,value,detail,icon:Icon})=><div key={label} className="rounded-lg border border-white/[.07] bg-[#023f44]/85 p-4 md:p-5" data-testid={`metric-card-${label.toLowerCase().replaceAll(" ","-")}`}><div className="flex items-center justify-between"><span className="text-[9px] uppercase tracking-[.14em] text-[#8c9691]">{label}</span><Icon size={15} className="text-[#a99770]"/></div><div className="mt-3 flex items-end justify-between gap-2"><span className="font-serif text-3xl text-[#e8e4d8]" data-testid={`metric-value-${label.toLowerCase().replaceAll(" ","-")}`}>{value}</span><span className="pb-1 text-right text-[9px] leading-4 text-[#68736e]">{detail}</span></div></div>)}</div>
    <div className="mt-7 overflow-hidden rounded-lg border border-white/[.08] bg-[#023f44]/90">
      <div className="flex flex-col gap-4 border-b border-white/[.07] p-4 md:p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="font-serif text-[22px] text-[#e8e4d9]">Collection</h2><p className="mt-1 text-[10px] text-[#78827d]" data-testid="text-filtered-count">Showing {filtered.length} of {products.length} fragrances</p></div><div className="flex flex-wrap gap-2"><button onClick={()=>onCreate("ai")} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#b49e70]/30 px-3 text-[9px] font-medium uppercase tracking-[.1em] text-[#d5c69f] hover:bg-[#b49e70]/10" data-testid="button-ai-create"><Sparkles size={14}/> AI compose</button><button onClick={()=>onCreate("manual")} className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-[9px] uppercase tracking-[.1em] text-[#b9bfba] hover:bg-white/[.05]" data-testid="button-manual-create"><Plus size={14}/> Manual entry</button></div></div>
        <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_repeat(3,minmax(125px,.45fr))]">
          <label className="relative"><span className="sr-only">Search fragrances</span><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#737e79]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, note, SKU…" className="h-10 w-full rounded-md border border-white/[.09] bg-[#00262a] pl-9 pr-3 text-xs text-[#e2e0d8] outline-none placeholder:text-[#606b66] focus:border-[#b9a274]/60" data-testid="input-product-search"/></label>
          <select value={category} onChange={e=>setCategory(e.target.value)} aria-label="Filter by category" className="h-10 rounded-md border border-white/[.09] bg-[#00262a] px-3 text-[11px] text-[#b8bfba] outline-none focus:border-[#b9a274]/60" data-testid="select-category-filter"><option>All categories</option>{categories.map(c=><option key={c}>{c}</option>)}</select>
          <select value={brand} onChange={e=>setBrand(e.target.value)} aria-label="Filter by brand" className="h-10 rounded-md border border-white/[.09] bg-[#00262a] px-3 text-[11px] text-[#b8bfba] outline-none focus:border-[#b9a274]/60" data-testid="select-brand-filter"><option>All brands</option>{brands.map(b=><option key={b}>{b}</option>)}</select>
          <label className="relative"><ArrowDownUp size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#77817c]"/><select value={sort} onChange={e=>setSort(e.target.value)} aria-label="Sort products" className="h-10 w-full appearance-none rounded-md border border-white/[.09] bg-[#00262a] pl-9 pr-7 text-[11px] text-[#b8bfba] outline-none focus:border-[#b9a274]/60" data-testid="select-product-sort"><option value="featured">Sort: featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="stock-low">Stock: low to high</option><option value="stock-high">Stock: high to low</option></select><ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#77817c]"/></label>
        </div>
      </div>
      {loading&&products.length>0&&<div className="h-0.5 w-full overflow-hidden bg-white/[.04]"><div className="h-full w-1/3 animate-pulse bg-[#c4ad7c]"/></div>}
      {products.length===0?<div className="flex min-h-[290px] flex-col items-center justify-center px-6 text-center" data-testid="state-products-empty"><div className="grid h-12 w-12 place-items-center rounded-full border border-[#b9a274]/20 bg-[#b9a274]/[.06] text-[#b9a274]"><FlaskConical size={20}/></div><h3 className="mt-4 font-serif text-xl text-[#e8e4d9]">A collection waiting to unfold</h3><p className="mt-2 max-w-sm text-xs leading-5 text-[#818c87]">Begin with a considered scent, its notes and the story you want to tell.</p><button onClick={()=>onCreate("manual")} className="mt-5 text-[10px] uppercase tracking-[.15em] text-[#d2bd8e] hover:text-[#eee0bb]" data-testid="button-empty-add">Add your first fragrance <ArrowRight className="ml-1 inline" size={12}/></button></div>
      :filtered.length===0?<div className="grid min-h-[220px] place-items-center px-6 text-center" data-testid="state-products-no-results"><div><Search className="mx-auto text-[#77817c]" size={21}/><p className="mt-3 font-serif text-lg text-[#dedbd1]">No matching fragrances</p><p className="mt-1 text-xs text-[#828d87]">Try another search or clear a filter.</p><button onClick={()=>{setSearch("");setCategory("All categories");setBrand("All brands");}} className="mt-4 text-[10px] uppercase tracking-wider text-[#d0bb8c]" data-testid="button-clear-filters">Clear filters</button></div></div>
      :<>
        <ul className="grid gap-2 p-3 md:hidden" data-testid="list-products-mobile">
          {filtered.map(p=><li key={p.id} className="flex gap-3 rounded-xl border border-[#D9AD45]/15 bg-[#00262a]/70 p-3" data-testid={`card-admin-product-${p.id}`}>
            <div className="h-[74px] w-[64px] shrink-0 overflow-hidden rounded-lg bg-[#03444a]">{p.image_url?<img src={p.image_url} alt={`${p.title} bottle`} className="h-full w-full object-cover"/>:<div className="grid h-full place-items-center text-[#D9AD45]"><FlaskConical size={17}/></div>}</div>
            <div className="min-w-0 flex-1"><p className="truncate font-serif text-[17px] text-[#F0D49A]">{p.title}</p><p className="mt-0.5 truncate text-[11px] text-[#9fb3b0]">{p.brand} · <span className="font-mono">{p.sku}</span></p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                <span className="font-mono text-[#e2ddcf]">{money(p.price, p.currency)}</span>
                {p.bottle_size_ml && <span className="text-[#F0D49A]">{p.bottle_size_ml} ml</span>}
                <span className={p.stock<=5?"text-[#e5a98f]":"text-[#9fd1c4]"}>{p.stock===0?"Out of Stock":p.stock<=5?"Low Stock":"In Stock"} · {p.stock}</span><span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-[#b9c6c2]">{p.category||"Uncategorized"}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1"><button onClick={()=>onEdit(p)} aria-label={`Edit ${p.title}`} className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 text-[#F0D49A]" data-testid={`button-edit-product-mobile-${p.id}`}><Pencil size={15}/></button><button onClick={()=>onDelete(p)} aria-label={`Delete ${p.title}`} className="grid h-10 w-10 place-items-center rounded-lg border border-[#c7796a]/25 text-[#e09a8b]" data-testid={`button-delete-product-mobile-${p.id}`}><Trash2 size={15}/></button></div>
          </li>)}
        </ul>
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] border-collapse text-left">
          <thead><tr className="border-b border-white/[.06] text-[9px] uppercase tracking-[.14em] text-[#75807b]"><th className="px-5 py-3 font-medium">Fragrance</th><th className="px-4 py-3 font-medium">Category</th><th className="px-4 py-3 font-medium">Price / Size</th><th className="px-4 py-3 font-medium">Stock status</th><th className="px-4 py-3 font-medium">Olfactory notes</th><th className="px-4 py-3 text-right font-medium">Actions</th></tr></thead>
          <tbody>{filtered.map(p=><tr key={p.id} className="border-b border-white/[.055] transition-colors hover:bg-white/[.018]" data-testid={`row-product-${p.id}`}>
            <td className="px-5 py-3.5"><div className="flex items-center gap-3"><div className="h-12 w-11 shrink-0 overflow-hidden rounded bg-[#252b29]">{p.image_url?<img src={p.image_url} alt={`${p.title} bottle`} className="h-full w-full object-cover" data-testid={`img-product-${p.id}`}/>:<div className="grid h-full place-items-center text-[#b2a174]"><FlaskConical size={17}/></div>}</div><div className="min-w-0"><p className="max-w-[210px] truncate font-serif text-[15px] text-[#e5e1d7]" data-testid={`text-product-title-${p.id}`}>{p.title}</p><p className="mt-1 text-[10px] text-[#84908a]" data-testid={`text-product-brand-${p.id}`}>{p.brand} <span className="px-1 text-[#4f5955]">·</span><span className="font-mono text-[9px]">{p.sku}</span></p></div></div></td>
            <td className="px-4 py-3.5"><span className="rounded-full border border-white/[.09] px-2.5 py-1 text-[9px] text-[#aeb6af]" data-testid={`text-product-category-${p.id}`}>{p.category||"Uncategorized"}</span></td>
            <td className="px-4 py-3.5 font-mono text-xs text-[#e2ddcf]" data-testid={`text-product-price-${p.id}`}>{money(p.price, p.currency)}{p.bottle_size_ml && <small className="mt-1 block text-[#9fb3b0]">{p.bottle_size_ml} ml</small>}</td>
            <td className="px-4 py-3.5"><span className={`inline-flex items-center gap-1.5 text-[11px] ${p.stock<=5?"text-[#d5a087]":"text-[#b7c5b5]"}`} data-testid={`text-product-stock-${p.id}`}><span className={`h-1.5 w-1.5 rounded-full ${p.stock<=5?"bg-[#cf8a70]":"bg-[#92aa91]"}`}/>{p.stock===0?"Out of Stock":p.stock<=5?"Low Stock":"In Stock"} <span className="text-[9px] opacity-75">· {p.stock} units</span></span></td>
            <td className="max-w-[235px] px-4 py-3.5"><div className="flex flex-wrap gap-1" data-testid={`text-product-notes-${p.id}`}>{[...p.top_notes,...p.heart_notes,...p.base_notes].slice(0,3).map((n,i)=><span key={`${n}-${i}`} className="max-w-[100px] truncate rounded bg-[#282f2e] px-2 py-1 text-[9px] text-[#aab2aa]">{n}</span>)}{p.top_notes.length+p.heart_notes.length+p.base_notes.length>3&&<span className="px-1 py-1 text-[9px] text-[#7c8681]">+{p.top_notes.length+p.heart_notes.length+p.base_notes.length-3}</span>}</div></td>
            <td className="px-4 py-3.5"><div className="flex justify-end gap-1"><button onClick={()=>onEdit(p)} aria-label={`Edit ${p.title}`} className="grid h-8 w-8 place-items-center rounded text-[#9da7a0] hover:bg-white/[.07] hover:text-[#e6d6ae]" data-testid={`button-edit-product-${p.id}`}><Pencil size={14}/></button><button onClick={()=>onDelete(p)} aria-label={`Delete ${p.title}`} className="grid h-8 w-8 place-items-center rounded text-[#89928d] hover:bg-[#a9574d]/15 hover:text-[#d5897b]" data-testid={`button-delete-product-${p.id}`}><Trash2 size={14}/></button></div></td>
          </tr>)}</tbody>
        </table><div className="flex items-center justify-between border-t border-white/[.05] px-5 py-3 text-[9px] text-[#77817b]" data-testid="text-catalog-footer"><span>Showing {filtered.length} fragrances</span><span>USD / IQD · Prices sorted within each currency</span></div></div>
      </>}
    </div>
  </section>;
}

function DashboardView({products,lowStock,threshold,onProducts,onCreate,onSync}:{products:Product[];lowStock:Product[];threshold:number;onProducts:()=>void;onCreate:()=>void;onSync:()=>void}) {
  const totalUnits=products.reduce((sum,p)=>sum+p.stock,0);
  return <section data-testid="view-dashboard"><div><p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#a9956d]">ATELIER OVERVIEW</p><h1 className="mt-2 font-serif text-[36px] text-[#eee9df] md:text-[42px]">A considered collection.</h1><p className="mt-2 text-[12px] text-[#8c9691]">A quiet view of the fragrances moving through your house.</p></div>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[{label:"Catalog pieces",value:products.length,detail:"fragrances curated",icon:Boxes},{label:"Available units",value:totalUnits,detail:"across the collection",icon:Package},{label:"Scent families",value:new Set(products.map(p=>p.category)).size,detail:"distinct compositions",icon:FlaskConical},{label:"Needs attention",value:lowStock.length,detail:`at or below ${threshold} units`,icon:AlertTriangle}].map(({label,value,detail,icon:Icon})=><div key={label} className="rounded-lg border border-white/[.07] bg-[#023f44] p-5" data-testid={`dashboard-metric-${label.toLowerCase().replaceAll(" ","-")}`}><div className="flex justify-between text-[#8e9992]"><span className="text-[9px] uppercase tracking-[.14em]">{label}</span><Icon size={15} className="text-[#b49e70]"/></div><p className="mt-4 font-serif text-4xl text-[#e8e4d9]" data-testid={`dashboard-value-${label.toLowerCase().replaceAll(" ","-")}`}>{value}</p><p className="mt-1 text-[10px] text-[#748079]">{detail}</p></div>)}</div>
    <div className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_.65fr]"><div className="rounded-lg border border-white/[.07] bg-[#023f44] p-5 md:p-6"><div className="flex items-start justify-between"><div><p className="text-[9px] uppercase tracking-[.17em] text-[#a9956d]">Recent collection</p><h2 className="mt-2 font-serif text-2xl text-[#e6e1d6]">The latest compositions</h2></div><button onClick={onProducts} className="text-[9px] uppercase tracking-[.13em] text-[#c8b687] hover:text-[#e5d2a3]" data-testid="button-dashboard-all-products">View archive <ArrowRight size={12} className="ml-1 inline"/></button></div>{products.length? <div className="mt-5 divide-y divide-white/[.06]">{[...products].slice(0,5).map(p=><div key={p.id} className="flex items-center gap-3 py-3" data-testid={`dashboard-product-${p.id}`}><div className="grid h-10 w-9 shrink-0 place-items-center overflow-hidden rounded bg-[#282f2d] text-[#b2a174]">{p.image_url?<img src={p.image_url} alt="" className="h-full w-full object-cover"/>:<FlaskConical size={16}/>}</div><div className="min-w-0 flex-1"><p className="truncate font-serif text-[14px] text-[#dedbd1]" data-testid={`dashboard-title-${p.id}`}>{p.title}</p><p className="mt-1 truncate text-[10px] text-[#818c86]">{p.brand} · {p.category}{p.bottle_size_ml ? ` · ${p.bottle_size_ml} ml` : ""}</p></div><span className="font-mono text-[11px] text-[#c9c2af]">{money(p.price, p.currency)}</span></div>)}</div>:<div className="py-12 text-center text-xs text-[#84908a]" data-testid="state-dashboard-empty">Your first composition will find its place here.</div>}</div>
      <div className="flex flex-col gap-5"><div className="rounded-lg border border-[#b99e6e]/20 bg-[#b99e6e]/[.045] p-5"><p className="text-[9px] uppercase tracking-[.16em] text-[#c1ad7f]">Storefront connection</p><div className="mt-4 flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full border border-[#8ea98f]/20 bg-[#8ea98f]/10 text-[#adc3a8]"><Check size={16}/></span><div><p className="text-sm text-[#e2dfd5]">Catalog is connected</p><p className="mt-1 text-[10px] text-[#929a91]">{products.length} fragrances available to sync</p></div></div><button onClick={onSync} className="mt-5 w-full rounded border border-[#b99e6e]/25 py-2.5 text-[9px] uppercase tracking-[.13em] text-[#d4c49c] hover:bg-[#b99e6e]/10" data-testid="button-dashboard-sync">Review sync status <ArrowRight size={12} className="ml-1 inline"/></button></div><div className="rounded-lg border border-white/[.07] bg-[#023f44] p-5"><div className="flex justify-between"><div><p className="text-[9px] uppercase tracking-[.16em] text-[#a9956d]">One more fragrance?</p><h3 className="mt-2 font-serif text-xl text-[#e4e0d5]">Add to the archive</h3></div><FlaskConical size={18} className="text-[#aa986e]"/></div><p className="mt-2 text-[11px] leading-5 text-[#87918b]">Give a new composition its notes, materials and place in the collection.</p><button onClick={onCreate} className="mt-4 inline-flex items-center gap-2 text-[9px] uppercase tracking-[.13em] text-[#d3bf91]" data-testid="button-dashboard-add-product"><Plus size={13}/> New fragrance</button></div></div>
    </div>
    <div className="mt-6 rounded-lg border border-white/[.07] bg-[#023f44] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[9px] uppercase tracking-[.16em] text-[#a9956d]">Stock watch</p><h2 className="mt-1 font-serif text-xl text-[#e5e0d5]">Replenishment notes</h2></div><span className="rounded-full border border-[#bd886a]/20 bg-[#bd886a]/[.08] px-3 py-1 text-[9px] text-[#d4a687]" data-testid="text-low-stock-count">{lowStock.length} need attention</span></div>{lowStock.length?<div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{lowStock.slice(0,6).map(p=><div key={p.id} className="flex items-center justify-between rounded border border-white/[.05] bg-[#141a1c] px-3 py-3" data-testid={`low-stock-item-${p.id}`}><span className="truncate text-xs text-[#c9cbc3]">{p.title}</span><span className="ml-3 font-mono text-[10px] text-[#d5a087]">{p.stock} left</span></div>)}</div>:<p className="mt-4 text-xs text-[#819087]" data-testid="state-low-stock-clear">Every fragrance is comfortably stocked.</p>}</div>
  </section>;
}

function SyncView({products,checked,onCheck,onProducts,checking,connected}:{products:Product[];checked:string;onCheck:()=>void;onProducts:()=>void;checking:boolean;connected:boolean}) {
  return <section data-testid="view-storefront-sync"><p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#a9956d]">PUBLISHING CHANNEL</p><h1 className="mt-2 font-serif text-[36px] text-[#eee9df] md:text-[42px]">Storefront sync</h1><p className="mt-2 max-w-lg text-[12px] leading-5 text-[#8c9691]">A clear view of the fragrance catalog shared with Maya Collection shoppers.</p>
    <div className="mt-8 grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><div className="rounded-lg border border-white/[.07] bg-[#023f44] p-6 md:p-8"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div><div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[9px] uppercase tracking-[.12em] ${connected?"border-[#89a78e]/20 bg-[#89a78e]/[.08] text-[#aac2a6]":"border-[#bd886a]/20 bg-[#bd886a]/[.08] text-[#d4a687]"}`} data-testid={connected?"status-sync-connected":"status-sync-disconnected"}><span className={`h-1.5 w-1.5 rounded-full ${connected?"bg-[#92ad92]":"bg-[#d08d72]"}`}/>{connected?"Connected":"Unavailable"}</div><h2 className="mt-5 font-serif text-3xl text-[#e8e3d8]">Maya Collection storefront</h2><p className="mt-2 text-xs text-[#8c9691]">Your current product catalog is available to the shop.</p></div><div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-[#c4ad7c]/20 bg-[#c4ad7c]/[.07] text-[#c8b37f]"><Store size={21}/></div></div><div className="my-7 h-px bg-white/[.07]"/><div className="grid gap-5 sm:grid-cols-3"><div><p className="text-[9px] uppercase tracking-[.13em] text-[#78837d]">Published products</p><p className="mt-2 font-serif text-3xl text-[#e7e1d5]" data-testid="text-sync-product-count">{products.length}</p></div><div><p className="text-[9px] uppercase tracking-[.13em] text-[#78837d]">Last checked</p><p className="mt-3 text-[12px] text-[#d0d1c9]" data-testid="text-sync-last-checked">{checked}</p></div><div><p className="text-[9px] uppercase tracking-[.13em] text-[#78837d]">Availability</p><p className="mt-3 inline-flex items-center gap-2 text-[12px] text-[#b6c6b2]" data-testid="text-sync-availability"><CheckCircle2 size={14}/>All catalog items</p></div></div><button onClick={onCheck} disabled={checking} className="mt-7 inline-flex items-center gap-2 rounded-md bg-[#D9AD45] px-4 py-3 text-[9px] font-semibold uppercase tracking-[.12em] text-[#1b201f] hover:bg-[#F0D49A] disabled:opacity-50" data-testid="button-sync-check">{checking?"Checking…":"Check connection"} <ArrowRight size={13}/></button></div>
      <div className="rounded-lg border border-white/[.07] bg-[#023f44] p-6"><p className="text-[9px] uppercase tracking-[.16em] text-[#a9956d]">Sync checklist</p><h3 className="mt-2 font-serif text-2xl text-[#e6e1d6]">In good order</h3><div className="mt-5 space-y-4">{[{title:"Catalog reachable",body:"Storefront is reading your fragrance archive."},{title:"Product details",body:"Names, prices and availability are ready to display."},{title:"Scent stories",body:"Notes and descriptions accompany each listing."}].map((item,i)=><div key={item.title} className="flex gap-3" data-testid={`sync-check-${i}`}><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#8ca78e]/10 text-[#a6bd9f]"><Check size={12}/></span><div><p className="text-xs text-[#d3d4cb]">{item.title}</p><p className="mt-1 text-[10px] leading-4 text-[#818b85]">{item.body}</p></div></div>)}</div><button onClick={onProducts} className="mt-6 text-[9px] uppercase tracking-[.12em] text-[#cdb98c]" data-testid="button-sync-manage-products">Manage catalog <ExternalLink className="ml-1 inline" size={12}/></button></div>
    </div><div className="mt-5 flex gap-3 rounded-lg border border-[#c4ad7c]/15 bg-[#c4ad7c]/[.04] p-4"><CircleHelp size={15} className="mt-0.5 shrink-0 text-[#bba779]"/><p className="text-[10px] leading-5 text-[#929991]">Product edits are reflected through the connected catalog. This panel does not create a separate publishing queue.</p></div>
  </section>;
}

function SettingsView({threshold,onThreshold}:{threshold:number;onThreshold:(value:string)=>void}) {
  const [supabaseStatus, setSupabaseStatus] = useState<{ status: string; message?: string }>({ status: "checking" });
  const [checkingSupabase, setCheckingSupabase] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{
    source_counts: Record<string, number>;
    inserted_counts: Record<string, number>;
    duplicate_or_existing_counts: Record<string, number>;
    errors: { record: string; reason: string }[];
    complete: boolean;
  } | null>(null);
  const [migrationError, setMigrationError] = useState("");

  const checkSupabase = async () => {
    setCheckingSupabase(true);
    try {
      const response = await fetch("/api/supabase/status", { credentials: "same-origin" });
      const result = await response.json() as { status?: string; message?: string };
      setSupabaseStatus({
        status: result.status ?? "unavailable",
        message: result.message ?? (response.ok ? undefined : "The connection check failed."),
      });
    } catch {
      setSupabaseStatus({ status: "unavailable", message: "Could not reach the API server." });
    } finally {
      setCheckingSupabase(false);
    }
  };

  useEffect(() => {
    void checkSupabase();
  }, []);

  const migrateLegacyData = async () => {
    if (!window.confirm("Copy the existing catalog and contact inbox into Supabase? This leaves the current Replit database unchanged.")) return;
    setMigrating(true);
    setMigrationError("");
    setMigrationResult(null);
    try {
      const response = await fetch("/api/admin/supabase/migrate-legacy", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = await response.json() as typeof migrationResult & { error?: string };
      if (!response.ok && response.status !== 207) {
        throw new Error(result?.error ?? "The data transfer failed.");
      }
      setMigrationResult(result);
    } catch (error) {
      setMigrationError(error instanceof Error ? error.message : "The data transfer failed.");
    } finally {
      setMigrating(false);
    }
  };

  const connectionLabel = supabaseStatus.status === "connected"
    ? "Connected"
    : supabaseStatus.status === "checking" ? "Checking"
    : supabaseStatus.status === "schema_not_ready" ? "Migration required"
    : supabaseStatus.status === "invalid_configuration" ? "URL needs correction"
    : supabaseStatus.status === "not_configured" ? "Not configured"
    : "Unavailable";

  return <section data-testid="view-settings"><p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#a9956d]">WORKSPACE PREFERENCES</p><h1 className="mt-2 font-serif text-[36px] text-[#eee9df] md:text-[42px]">Settings</h1><p className="mt-2 max-w-lg text-[12px] leading-5 text-[#8c9691]">Small details that help keep the collection cared for.</p>
    <div className="mt-8 max-w-[850px] space-y-5"><div className="rounded-lg border border-white/[.07] bg-[#023f44] p-5 md:p-6"><div className="flex gap-4"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[#c4ad7c]/20 bg-[#c4ad7c]/[.07] text-[#c4ad7c]"><Package size={17}/></div><div className="flex-1"><h2 className="font-serif text-xl text-[#e7e2d7]">Low-stock reminder</h2><p className="mt-1 max-w-lg text-[11px] leading-5 text-[#87918c]">Flag fragrances when available inventory reaches this number or lower. Preference is saved in this browser.</p><div className="mt-5 flex flex-wrap items-center gap-3"><label htmlFor="low-stock-threshold" className="text-[10px] uppercase tracking-[.12em] text-[#aab1aa]">Remind me at</label><input id="low-stock-threshold" type="number" min="0" max="9999" value={threshold} onChange={e=>onThreshold(e.target.value)} className="h-10 w-24 rounded-md border border-white/10 bg-[#00262a] px-3 font-mono text-sm text-[#e5e0d5] outline-none focus:border-[#b9a274]/60" data-testid="input-low-stock-threshold"/><span className="text-[10px] text-[#7c8781]">units remaining</span><span className="ml-auto inline-flex items-center gap-1.5 text-[9px] text-[#a9b9a4]" data-testid="status-preference-saved"><Check size={12}/>Saved automatically</span></div></div></div></div>
      <div className="rounded-lg border border-white/[.07] bg-[#023f44] p-5 md:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[#c4ad7c]/20 bg-[#c4ad7c]/[.07] text-[#c4ad7c]"><Database size={17}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h2 className="font-serif text-xl text-[#e7e2d7]">Supabase database</h2><span className={`rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-[.1em] ${supabaseStatus.status === "connected" ? "border-[#89a78e]/25 text-[#aac2a6]" : "border-[#bd886a]/25 text-[#d4a687]"}`} data-testid="status-supabase-connection">{connectionLabel}</span></div><p className="mt-2 max-w-xl text-[11px] leading-5 text-[#87918c]">{supabaseStatus.message ?? "Check the server-side Supabase connection before moving catalog data."}</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void checkSupabase()} disabled={checkingSupabase} className="rounded-md border border-white/10 px-3 py-2 text-[9px] uppercase tracking-[.1em] text-[#c6cbc5] disabled:opacity-50" data-testid="button-check-supabase">{checkingSupabase ? "Checking…" : "Check connection"}</button><button type="button" onClick={() => void migrateLegacyData()} disabled={migrating || supabaseStatus.status !== "connected"} className="inline-flex items-center gap-2 rounded-md bg-[#D9AD45] px-3 py-2 text-[9px] font-semibold uppercase tracking-[.1em] text-[#1b201f] disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-migrate-supabase">{migrating ? <><Loader2 size={12} className="animate-spin"/>Copying records…</> : "Copy existing store data"}</button></div><p className="mt-3 text-[10px] leading-5 text-[#a8b2aa]">This copies existing products, raw materials, import history, contact messages, and store hours. It never deletes the source records or overwrites existing Supabase catalog entries. Supplier availability is kept separate from Maya’s stock.</p>{migrationError&&<p className="mt-3 text-[11px] text-[#f0c2b6]" role="alert" data-testid="text-supabase-migration-error">{migrationError}</p>}{migrationResult&&<div className="mt-4 rounded-md border border-white/[.08] bg-[#002b2f] p-3 text-[10px] leading-5 text-[#d4d8cf]" role="status" data-testid="state-supabase-migration-result"><p>{migrationResult.complete ? "Transfer complete." : "Transfer finished with some errors."} New records: {Object.values(migrationResult.inserted_counts).reduce((a,b)=>a+b,0)}. Existing/duplicate records: {Object.values(migrationResult.duplicate_or_existing_counts).reduce((a,b)=>a+b,0)}.</p>{migrationResult.errors.length>0&&<ul className="mt-2 list-disc pl-4 text-[#d4a687]">{migrationResult.errors.map((item,index)=><li key={`${item.record}-${index}`}>{item.record}: {item.reason}</li>)}</ul>}</div>}</div></div></div>
      <CatalogCsvTools enabled={supabaseStatus.status === "connected"}/>
      <div className="rounded-lg border border-white/[.07] bg-[#023f44] p-5 md:p-6"><div className="flex gap-4"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 text-[#a7ada5]"><Store size={17}/></div><div><h2 className="font-serif text-xl text-[#e7e2d7]">Store identity</h2><p className="mt-1 text-[11px] text-[#87918c]">This workspace is connected to the Maya Collection storefront.</p><div className="mt-4 flex items-center gap-2 text-[10px] text-[#b6c4b1]" data-testid="status-settings-connection"><span className="h-1.5 w-1.5 rounded-full bg-[#92ad92]"/>Catalog connection active</div></div></div></div>
      <div className="flex gap-3 rounded-lg border border-[#c4ad7c]/15 bg-[#c4ad7c]/[.04] p-4"><CircleHelp size={15} className="mt-0.5 shrink-0 text-[#bba779]"/><p className="text-[10px] leading-5 text-[#929991]">Preferences here are local to this browser. No additional catalog records are created.</p></div>
    </div>
  </section>;
}

function CatalogCsvTools({ enabled }: { enabled: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    received: number;
    imported: number;
    inserted: number;
    updated: number;
    errors: { row: number; reason: string }[];
  } | null>(null);

  const importFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Choose a CSV smaller than 10 MB.");
      const response = await fetch("/api/admin/products/import.csv", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: await file.text() }),
      });
      const payload = await response.json() as typeof result & { error?: string };
      if (!response.ok) throw new Error(payload?.error ?? "The CSV import failed.");
      setResult(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The CSV import failed.");
    } finally {
      setBusy(false);
    }
  };

  const exportFile = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/products/export.csv", { credentials: "same-origin" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error ?? "The catalog export failed.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "maya-collection-catalog.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The catalog export failed.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="rounded-lg border border-white/[.07] bg-[#023f44] p-5 md:p-6" data-testid="section-catalog-csv">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 text-[#a7ada5]"><Upload size={17}/></div>
      <div className="min-w-0 flex-1">
        <h2 className="font-serif text-xl text-[#e7e2d7]">Catalog CSV</h2>
        <p className="mt-1 max-w-xl text-[11px] leading-5 text-[#87918c]">Import up to 10,000 rows in batches or export the full catalog. Matching product slugs are updated; rows without an explicit active value stay unpublished. Raw-material inventory is never inferred from supplier availability.</p>
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Choose catalog CSV file" onChange={(event) => { void importFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} data-testid="input-catalog-csv"/>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={!enabled || busy} className="inline-flex items-center gap-2 rounded-md bg-[#D9AD45] px-3 py-2 text-[9px] font-semibold uppercase tracking-[.1em] text-[#1b201f] disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-import-catalog-csv">{busy ? <Loader2 size={12} className="animate-spin"/> : <Upload size={12}/>}Import CSV</button>
          <button type="button" onClick={() => void exportFile()} disabled={!enabled || busy} className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-[9px] uppercase tracking-[.1em] text-[#c6cbc5] disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-export-catalog-csv">{busy ? <Loader2 size={12} className="animate-spin"/> : <Download size={12}/>}Export CSV</button>
        </div>
        {error && <p className="mt-3 text-[11px] text-[#f0c2b6]" role="alert" data-testid="text-catalog-csv-error">{error}</p>}
        {result && <div className="mt-4 rounded-md border border-white/[.08] bg-[#002b2f] p-3 text-[10px] leading-5 text-[#d4d8cf]" role="status" data-testid="state-catalog-csv-result">
          <p>Read {result.received} rows; saved {result.imported} ({result.inserted} new, {result.updated} updated). {result.errors.length} row errors.</p>
          {result.errors.length > 0 && <ul className="mt-2 max-h-36 list-disc space-y-1 overflow-auto pl-4 text-[#d4a687]">{result.errors.slice(0, 20).map((item, index) => <li key={`${item.row}-${index}`}>Row {item.row}: {item.reason}</li>)}</ul>}
        </div>}
      </div>
    </div>
  </section>;
}

function ProductEditor({research,draft,setField,setNotes,mode,setMode,editTarget,onClose,onSubmit,onGenerate,aiQuery,setAiQuery,aiPending,saving,uploadPending,onPickFile,onFile,fileInput}:{research:ReactNode;draft:Draft;setField:<K extends keyof Draft>(key:K,value:Draft[K])=>void;setNotes:(key:"top_notes"|"heart_notes"|"base_notes"|"ingredients",value:string)=>void;mode:EditorMode;setMode:(v:EditorMode)=>void;editTarget:Product|null;onClose:()=>void;onSubmit:(e:FormEvent)=>void;onGenerate:()=>void;aiQuery:string;setAiQuery:(v:string)=>void;aiPending:boolean;saving:boolean;uploadPending:boolean;onPickFile:()=>void;onFile:(file?:File)=>void;fileInput:{current:HTMLInputElement|null}}) {
  const notesCount=draft.top_notes.length+draft.heart_notes.length+draft.base_notes.length;
  const fieldClass="mt-1.5 h-10 w-full rounded-md border border-white/[.1] bg-[#121819] px-3 text-[12px] text-[#e7e4dc] outline-none placeholder:text-[#5f6964] focus:border-[#b9a274]/65";
  const labelClass="text-[9px] font-medium uppercase tracking-[.13em] text-[#aab1a9]";
  const noteString=(key:"top_notes"|"heart_notes"|"base_notes"|"ingredients")=>draft[key].join(", ");
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-0 sm:p-5" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="editor-title" className="mx-auto min-h-[100dvh] w-full max-w-[1040px] border border-white/10 bg-[#023f44] shadow-2xl sm:my-4 sm:min-h-0 sm:rounded-xl">
    <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/[.08] bg-[#023f44]/95 px-5 py-4 backdrop-blur md:px-7"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-md border border-[#c4ad7c]/20 bg-[#c4ad7c]/[.07] text-[#c9b582]"><FlaskConical size={17}/></div><div><p className="text-[8px] uppercase tracking-[.19em] text-[#a9956d]">{editTarget?"EDIT COMPOSITION":"NEW COMPOSITION"}</p><h2 id="editor-title" className="mt-0.5 font-serif text-xl text-[#e9e4d9]">{editTarget?`Edit ${editTarget.title}`:"Add a fragrance"}</h2></div></div><button onClick={onClose} disabled={saving} className="grid h-9 w-9 place-items-center rounded text-[#9ba39e] hover:bg-white/[.06] disabled:opacity-50" aria-label="Close editor" data-testid="button-close-editor"><X size={18}/></button></div>
    <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
      <form onSubmit={onSubmit} className="min-w-0 px-5 py-5 md:px-7 md:py-6">
        {!editTarget&&<div className="mb-6 flex w-fit rounded-md border border-white/[.08] bg-[#00262a] p-1" role="tablist" aria-label="Creation method"><button type="button" role="tab" aria-selected={mode==="manual"} onClick={()=>setMode("manual")} className={`rounded px-4 py-2 text-[9px] uppercase tracking-[.11em] ${mode==="manual"?"bg-[#343a36] text-[#e9e3d6]":"text-[#838d87] hover:text-[#d4d4ca]"}`} data-testid="tab-manual-mode">Manual</button><button type="button" role="tab" aria-selected={mode==="ai"} onClick={()=>setMode("ai")} className={`inline-flex items-center gap-1.5 rounded px-4 py-2 text-[9px] uppercase tracking-[.11em] ${mode==="ai"?"bg-[#343a36] text-[#e9e3d6]":"text-[#838d87] hover:text-[#d4d4ca]"}`} data-testid="tab-ai-mode"><Sparkles size={12}/>AI assisted</button></div>}
        {mode==="ai"&&!editTarget&&<div className="mb-6 rounded-md border border-[#bba371]/20 bg-[#bba371]/[.05] p-4"><div className="flex gap-3"><Sparkles size={15} className="mt-0.5 shrink-0 text-[#d0b880]"/><div className="flex-1"><p className="text-xs text-[#e2dbc9]">Start with a fragrance name</p><p className="mt-1 text-[10px] leading-4 text-[#929992]">AI will suggest editable product copy and scent details for your review.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor="ai-fragrance-name">Fragrance name</label><input id="ai-fragrance-name" value={aiQuery} onChange={e=>setAiQuery(e.target.value)} placeholder="For example, Rose No. 04" className="h-10 min-w-0 flex-1 rounded-md border border-white/10 bg-[#00262a] px-3 text-xs text-[#e6e2d8] outline-none placeholder:text-[#606a65] focus:border-[#b9a274]/60" data-testid="input-ai-fragrance-name"/><button type="button" onClick={()=>void onGenerate()} disabled={aiPending} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#bba371]/35 px-4 text-[9px] uppercase tracking-[.1em] text-[#d7c697] disabled:opacity-50" data-testid="button-generate-suggestion">{aiPending?<Loader2 size={13} className="animate-spin"/>:<Sparkles size={13}/>}Generate draft</button></div><p className="mt-2 text-[9px] leading-4 text-[#d0ab83]" data-testid="text-ai-review-reminder">Before publishing, review AI-suggested copy, notes and cosmetic ingredients for accuracy and compliance.</p></div></div></div>}
        <div className="space-y-6">
          <fieldset>
            <legend className="mb-3 text-[9px] font-semibold uppercase tracking-[.16em] text-[#c3b080]">01 · Identity</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>Fragrance name<input required value={draft.title} onChange={e=>setField("title",e.target.value)} placeholder="e.g. Rose No. 04" className={fieldClass} data-testid="input-product-title"/></label>
              <label className={labelClass}>Brand<input required value={draft.brand} onChange={e=>setField("brand",e.target.value)} placeholder="Maya Collection" className={fieldClass} data-testid="input-product-brand"/></label>
              <label className={labelClass}>Category<input required value={draft.category} onChange={e=>setField("category",e.target.value)} placeholder="Floral · Powdery" className={fieldClass} data-testid="input-product-category"/></label>
              <label className={labelClass}>SKU<input required value={draft.sku} onChange={e=>setField("sku",e.target.value)} placeholder="MC-ROSE-04" className={fieldClass} data-testid="input-product-sku"/></label>
              <label className={labelClass}>Currency<select value={draft.currency ?? "USD"} onChange={e=>setField("currency",e.target.value as "USD" | "IQD")} className={fieldClass} data-testid="select-product-currency"><option value="USD">USD — US Dollar</option><option value="IQD">IQD — Iraqi Dinar</option></select></label>
              <label className={labelClass}>Price ({draft.currency ?? "USD"})<input required min="0" step="0.01" type="number" value={draft.price} onChange={e=>setField("price",Number(e.target.value))} className={fieldClass} data-testid="input-product-price"/></label>
              <label className={labelClass}>Bottle size (ml)<input min="1" max="10000" step="1" type="number" value={draft.bottle_size_ml ?? ""} onChange={e=>setField("bottle_size_ml",e.target.value === "" ? null : Number(e.target.value))} placeholder="e.g. 50 or 100" className={fieldClass} data-testid="input-product-bottle-size"/><span className="mt-1 block normal-case tracking-normal text-[#929992]">Leave blank only if the size is unknown.</span></label>
              <label className={labelClass}>Stock on hand<input required min="0" step="1" type="number" value={draft.stock} onChange={e=>setField("stock",Number(e.target.value))} className={fieldClass} data-testid="input-product-stock"/></label>
            </div>
            <p className="mt-3 text-[10px] text-[#b5c8c5]">Enter the price in the selected currency. Changing currency does not convert the amount.</p>
            <p className="mt-2 text-sm text-[#F0D49A]" data-testid="text-preview-price-size">{money(draft.price, draft.currency)}{draft.bottle_size_ml ? ` · ${draft.bottle_size_ml} ml` : ""}</p>
          </fieldset>
          <fieldset><legend className="mb-3 text-[9px] font-semibold uppercase tracking-[.16em] text-[#c3b080]">02 · The fragrance story</legend><label className={labelClass}>Description / scent story<textarea value={draft.description} onChange={e=>setField("description",e.target.value)} rows={4} placeholder="Describe the feeling, the setting, and how this composition unfolds…" className="mt-1.5 w-full resize-y rounded-md border border-white/[.1] bg-[#121819] px-3 py-3 text-[12px] leading-5 text-[#e7e4dc] outline-none placeholder:text-[#5f6964] focus:border-[#b9a274]/65" data-testid="input-product-description"/></label></fieldset>
          <fieldset><legend className="mb-3 text-[9px] font-semibold uppercase tracking-[.16em] text-[#c3b080]">03 · Olfactory pyramid</legend><div className="grid gap-3"><NoteInput label="Top notes" hint="The first impression" value={noteString("top_notes")} onChange={v=>setNotes("top_notes",v)} testId="input-top-notes" tone="top"/><NoteInput label="Heart notes" hint="The character at its heart" value={noteString("heart_notes")} onChange={v=>setNotes("heart_notes",v)} testId="input-heart-notes" tone="heart"/><NoteInput label="Base notes" hint="The lasting signature" value={noteString("base_notes")} onChange={v=>setNotes("base_notes",v)} testId="input-base-notes" tone="base"/></div><p className="mt-2 text-[9px] text-[#717c76]">Separate each note with a comma.</p></fieldset>
          <fieldset><legend className="mb-3 text-[9px] font-semibold uppercase tracking-[.16em] text-[#c3b080]">04 · Materials & image</legend><label className={labelClass}>Cosmetic ingredients<CommaSeparatedInput value={noteString("ingredients")} onChange={v=>setNotes("ingredients",v)} multiline placeholder="Alcohol denat., parfum, linalool…" className="mt-1.5 w-full resize-y rounded-md border border-white/[.1] bg-[#121819] px-3 py-2.5 text-[11px] leading-5 text-[#e7e4dc] outline-none placeholder:text-[#5f6964] focus:border-[#b9a274]/65" testId="input-product-ingredients"/></label><div className="mt-4"><label className={labelClass}>Image URL</label><div className="mt-1.5 flex gap-2"><input value={draft.image_url} onChange={e=>setField("image_url",e.target.value)} placeholder="https://… or uploaded image path" className="h-10 min-w-0 flex-1 rounded-md border border-white/[.1] bg-[#121819] px-3 text-[11px] text-[#e7e4dc] outline-none placeholder:text-[#5f6964] focus:border-[#b9a274]/65" data-testid="input-product-image-url"/><button type="button" onClick={onPickFile} disabled={uploadPending} className="inline-flex shrink-0 items-center gap-2 rounded-md border border-white/10 px-3 text-[9px] uppercase tracking-[.1em] text-[#bac0b8] hover:bg-white/[.05] disabled:opacity-50" data-testid="button-upload-image">{uploadPending?<Loader2 size={14} className="animate-spin"/>:<Upload size={14}/>}<span className="hidden sm:inline">{uploadPending?"Uploading":"Upload"}</span></button><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={e=>{onFile(e.currentTarget.files?.[0]);e.currentTarget.value="";}} aria-label="Upload fragrance image" data-testid="input-product-image-file"/></div><p className="mt-2 text-[9px] text-[#717c76]">Enter an image URL or upload JPEG, PNG, WebP or AVIF, up to 5 MB.</p></div></fieldset>
        </div>
        {research}
        <div className="sticky bottom-0 mt-7 flex justify-end gap-2 border-t border-white/[.07] bg-[#023f44]/95 py-4 backdrop-blur"><button type="button" onClick={onClose} disabled={saving} className="rounded-md border border-white/10 px-4 py-2.5 text-[10px] text-[#adb4ad] hover:bg-white/[.04] disabled:opacity-50" data-testid="button-cancel-editor">Cancel</button><button type="submit" disabled={saving||uploadPending||aiPending} className="inline-flex items-center gap-2 rounded-md bg-[#D9AD45] px-5 py-2.5 text-[9px] font-semibold uppercase tracking-[.12em] text-[#1b201f] hover:bg-[#F0D49A] disabled:opacity-50" data-testid="button-save-product">{saving?<Loader2 size={14} className="animate-spin"/>:<Check size={14}/>} {saving?"Saving…":editTarget?"Save changes":"Add to collection"}</button></div>
      </form>
      <aside className="border-t border-white/[.07] bg-[#141a1c] px-5 py-6 lg:border-l lg:border-t-0" aria-label="Live fragrance preview"><div className="flex items-center justify-between"><div><p className="text-[8px] uppercase tracking-[.18em] text-[#a9956d]">LIVE PREVIEW</p><h3 className="mt-1 font-serif text-xl text-[#e7e2d7]">Olfactory pyramid</h3></div><span className="rounded-full border border-white/[.08] px-2 py-1 text-[8px] text-[#8a948d]" data-testid="text-preview-note-count">{notesCount} notes</span></div>
        <div className="mt-7"><PyramidLayer label="Top" descriptor="First impression" notes={draft.top_notes} color="amber" testId="preview-top-notes"/><div className="mx-auto h-4 w-px bg-gradient-to-b from-[#c5a66f]/50 to-[#95a18e]/45"/><PyramidLayer label="Heart" descriptor="The character" notes={draft.heart_notes} color="sage" testId="preview-heart-notes"/><div className="mx-auto h-4 w-px bg-gradient-to-b from-[#95a18e]/45 to-[#9b887c]/50"/><PyramidLayer label="Base" descriptor="Lasting signature" notes={draft.base_notes} color="rose" testId="preview-base-notes"/></div>
        <div className="mt-7 border-t border-white/[.07] pt-5"><div className="aspect-[4/3] overflow-hidden rounded-md border border-white/[.07] bg-[#202725]">{draft.image_url?<img src={draft.image_url} alt={draft.title?`${draft.title} preview`:"Fragrance image preview"} className="h-full w-full object-cover" data-testid="img-editor-preview"/>:<div className="flex h-full flex-col items-center justify-center text-center text-[#66716b]" data-testid="state-image-preview-empty"><CloudUpload size={21} strokeWidth={1.3}/><p className="mt-2 text-[9px] uppercase tracking-[.12em]">Image preview</p></div>}</div><p className="mt-3 font-serif text-lg text-[#e2ded4]" data-testid="text-preview-product-title">{draft.title||"Your fragrance name"}</p><p className="mt-1 text-[9px] uppercase tracking-[.12em] text-[#858f88]" data-testid="text-preview-product-brand">{draft.brand||"Brand"}</p>{draft.description&&<p className="mt-3 line-clamp-4 text-[10px] leading-5 text-[#929b94]" data-testid="text-preview-description">{draft.description}</p>}</div>
        <div className="mt-5 rounded-md border border-white/[.06] bg-[#1a2122] p-3"><p className="text-[8px] uppercase tracking-[.13em] text-[#808a83]">A good composition</p><p className="mt-2 text-[9px] leading-4 text-[#9aa19a]">A balanced pyramid moves from first impression to a lasting personal signature.</p></div>
      </aside>
    </div>
  </section></div>;
}

function NoteInput({label,hint,value,onChange,testId,tone}:{label:string;hint:string;value:string;onChange:(v:string)=>void;testId:string;tone:"top"|"heart"|"base"}) {
  const tones={top:"border-[#c3a66f]/20 bg-[#c3a66f]/[.035]",heart:"border-[#93a38b]/20 bg-[#93a38b]/[.035]",base:"border-[#a78c80]/20 bg-[#a78c80]/[.035]"};
  return <label className={`block rounded-md border p-3 ${tones[tone]}`}><span className="flex items-center justify-between"><span className="text-[9px] font-semibold uppercase tracking-[.13em] text-[#c5c6bc]">{label}</span><span className="text-[8px] text-[#727d76]">{hint}</span></span><CommaSeparatedInput value={value} onChange={onChange} placeholder="Bergamot, pink pepper,…" className="mt-2 h-8 w-full border-b border-white/[.09] bg-transparent text-[11px] text-[#dedbd1] outline-none placeholder:text-[#626d66] focus:border-[#c3a66f]/50" testId={testId}/></label>;
}
function PyramidLayer({label,descriptor,notes,color,testId}:{label:string;descriptor:string;notes:string[];color:"amber"|"sage"|"rose";testId:string}) {
  const palette={amber:{line:"#c5a66f",bg:"#c5a66f"},sage:{line:"#96a78e",bg:"#96a78e"},rose:{line:"#a58d82",bg:"#a58d82"}};
  const tint=palette[color];
  return <div className="relative" data-testid={testId}><div className="mx-auto h-0.5 w-[96%]" style={{background:`linear-gradient(90deg, transparent, ${tint.line}65, transparent)`}}/><div className="mx-auto w-[88%] border-x px-3 pb-3 pt-2" style={{borderColor:`${tint.line}35`,background:`linear-gradient(180deg,${tint.bg}08,transparent)`}}><div className="flex items-baseline justify-between"><span className="text-[9px] font-semibold uppercase tracking-[.14em]" style={{color:tint.line}}>{label}</span><span className="text-[8px] text-[#747e78]">{descriptor}</span></div><div className="mt-2 flex min-h-5 flex-wrap gap-1">{notes.length?notes.map((n,i)=><span key={`${n}-${i}`} className="rounded px-1.5 py-1 text-[8px] text-[#d4d4ca]" style={{background:`${tint.bg}17`}}>{n}</span>):<span className="text-[8px] italic text-[#5d6862]">Notes appear as you compose</span>}</div></div><div className="mx-auto h-0.5 w-[82%]" style={{background:`linear-gradient(90deg, transparent, ${tint.line}55, transparent)`}}/></div>;
}
