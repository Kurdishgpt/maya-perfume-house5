import { Link } from 'wouter';

export function Crown({ className = '' }: { className?: string }) {
  return <svg viewBox="0 0 40 28" className={className} aria-hidden="true" fill="none">
    <path d="M4 22 2.5 7.5l9 7L20 3l8.5 11.5 9-7L36 22H4Z" fill="currentColor" fillOpacity=".18" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
    <path d="M5 25.5h30" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <circle cx="20" cy="3" r="1.9" fill="currentColor"/><circle cx="2.5" cy="7.5" r="1.6" fill="currentColor"/><circle cx="37.5" cy="7.5" r="1.6" fill="currentColor"/>
    <circle cx="20" cy="16" r="1.5" fill="currentColor"/>
  </svg>;
}

export function Wordmark({ compact = false, href = '/' }: { compact?: boolean; href?: string }) {
  return <Link href={href} className={`mc-wordmark ${compact ? 'is-compact' : ''}`} data-testid="link-brand" dir="ltr">
    <img src="/images/reference/maya-gold-logo.png" alt="MAYA COLLECTION"/>
  </Link>;
}

export function GoldDivider({ ornament = true }: { ornament?: boolean }) {
  return <div className="mc-divider" aria-hidden="true"><span/>{ornament && <svg viewBox="0 0 24 12"><path d="M12 1c1.6 3 1.6 6 0 10-1.6-4-1.6-7 0-10ZM12 11C9 9 6 8.5 2 9c3 3 6.5 3.4 10 2Zm0 0c3-2 6-2.5 10-2-3 3-6.5 3.4-10 2Z" fill="currentColor"/></svg>}<span/></div>;
}
