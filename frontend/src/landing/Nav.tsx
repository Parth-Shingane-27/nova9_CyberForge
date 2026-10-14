import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, Logo } from './ui';

const LINKS = [
  { id: 'platform', label: 'Platform' },
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'investigation', label: 'Investigation Flow' },
  { id: 'trust', label: 'Trust & Evidence' },
  { id: 'team', label: 'Team' },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // active link = the section whose top most recently crossed the upper third of the viewport
  useEffect(() => {
    const targets = LINKS.map((l) => document.getElementById(l.id)).filter((x): x is HTMLElement => !!x);
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); }),
      { rootMargin: '-30% 0px -60% 0px' },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const link = (l: (typeof LINKS)[number], mobile = false) => (
    <a key={l.id} href={`#${l.id}`} onClick={() => setOpen(false)} aria-current={active === l.id ? 'true' : undefined}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${mobile ? 'block text-base' : ''} ${
        active === l.id ? 'text-cyan' : 'text-muted hover:text-ink'}`}>
      {l.label}
    </a>
  );

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-colors ${scrolled || open ? 'border-b border-line/80 bg-obsidian/80 backdrop-blur-xl' : 'border-b border-transparent'}`}>
      <nav aria-label="Primary" className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <a href="#top" className="flex shrink-0 items-center gap-3" aria-label="TraceGuard AI, back to top">
          <Logo />
          <span className="leading-tight">
            <span className="block whitespace-nowrap text-[15px] font-semibold tracking-tight">TraceGuard AI</span>
            <span className="hidden text-[10px] font-medium uppercase tracking-[0.2em] text-muted sm:block">Security Intelligence</span>
          </span>
        </a>

        <div className="hidden items-center gap-1 lg:flex">{LINKS.map((l) => link(l))}</div>

        <div className="flex items-center gap-2">
          <Link to="/signin" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:text-ink sm:block">Sign In</Link>
          <Link to="/console" aria-label="Open Console"
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-cyan px-3 py-2 text-sm font-semibold text-obsidian transition hover:bg-ice sm:px-4">
            <span aria-hidden="true"><span className="hidden sm:inline">Open </span>Console</span><Icon name="arrow" className="h-4 w-4" />
          </Link>
          <button type="button" className="rounded-lg border border-line p-2 text-ink lg:hidden" aria-expanded={open}
            aria-controls="mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((v) => !v)}>
            <Icon name={open ? 'x' : 'menu'} className="h-5 w-5" />
          </button>
        </div>
      </nav>

      {open && (
        <div id="mobile-menu" className="border-t border-line/80 bg-obsidian/95 px-5 pb-5 pt-3 lg:hidden">
          <div className="flex flex-col">{LINKS.map((l) => link(l, true))}</div>
          <Link to="/signin" onClick={() => setOpen(false)} className="mt-3 block rounded-lg border border-line px-3 py-3 text-center text-base font-medium">Sign In</Link>
        </div>
      )}
    </header>
  );
}
