import { Link } from 'react-router-dom';
import { REPO_URL } from './teamData';
import { Logo } from './ui';

export function Footer() {
  const col = 'inline-block py-1.5 text-sm text-muted transition hover:text-ink';
  return (
    <footer className="border-t border-line bg-surface/40">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3"><Logo /><span className="text-[15px] font-semibold">TraceGuard AI</span></div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">From disconnected security events to evidence-based threat investigations.</p>
        </div>
        <nav aria-label="Footer">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Explore</p>
          <ul className="mt-3 space-y-2">
            <li><a className={col} href="#platform">Platform</a></li>
            <li><a className={col} href="#capabilities">Capabilities</a></li>
            <li><a className={col} href="#trust">Trust &amp; Evidence</a></li>
            <li><a className={col} href="#team">Team</a></li>
          </ul>
        </nav>
        <nav aria-label="Access">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Access</p>
          <ul className="mt-3 space-y-2">
            <li><Link className={col} to="/signin">Sign In</Link></li>
            <li><Link className={col} to="/console">Open Console</Link></li>
            {REPO_URL && <li><a className={col} href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a></li>}
          </ul>
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto w-full max-w-7xl px-5 py-5 text-xs text-muted sm:px-8">© {new Date().getFullYear()} TraceGuard AI. Hackathon prototype; demonstration data is simulated.</p>
      </div>
    </footer>
  );
}
