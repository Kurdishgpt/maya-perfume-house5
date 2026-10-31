import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { languages } from '@/lib/store';
import { useStore } from '@/lib/store-context';

export function LanguageMenu() {
  const { language, setLanguage, t } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  const current = languages.find((l) => l.code === language)!;
  return <div className="mc-lang" ref={ref}>
    <button type="button" className="mc-lang-trigger" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open} aria-label={t('language')} data-testid="select-language">
      <span>{current.label}</span><ChevronDown size={15} className={open ? 'is-open' : ''}/>
    </button>
    {open && <ul className="mc-lang-list" role="listbox" aria-label={t('language')}>
      {languages.map((l) => <li key={l.code}><button type="button" role="option" aria-selected={l.code === language} onClick={() => { setLanguage(l.code); setOpen(false); }} data-testid={`option-language-${l.code}`} lang={l.code === 'ku' ? 'ckb' : l.code}>
        <span>{l.label}</span>{l.code === language && <Check size={14}/>}
      </button></li>)}
    </ul>}
  </div>;
}
