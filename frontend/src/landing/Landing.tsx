import { useEffect } from 'react';
import { Footer } from './Footer';
import { Hero } from './Hero';
import { Investigation } from './Investigation';
import { Nav } from './Nav';
import { Preview } from './Preview';
import { AITrust, Capabilities, HowItWorks, Limitations, Problem, Solution } from './Sections';
import { Team } from './Team';

export default function Landing() {
  useEffect(() => { document.title = 'TraceGuard AI — Evidence-first security investigations'; }, []);
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <Nav />
      <main id="main">
        <Hero />
        <Problem />
        <Solution />
        <Capabilities />
        <Investigation />
        <HowItWorks />
        <AITrust />
        <Preview />
        <Limitations />
        <Team />
      </main>
      <Footer />
    </>
  );
}
