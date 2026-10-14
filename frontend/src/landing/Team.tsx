import { TEAM } from './teamData';
import { Heading, Icon, Section } from './ui';

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

export function Team() {
  return (
    <Section id="team" className="py-20 sm:py-28" label="Team">
      <Heading eyebrow="Team" title="Built to Make Security Investigations Clearer." align="center">
        TraceGuard AI brings together practical engineering, analytical thinking, and evidence-first cybersecurity workflows.
      </Heading>
      <ul className="mx-auto mt-12 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {TEAM.map((m) => (
          <li key={m.name} className="glass hairline-top rounded-2xl p-6 text-center transition duration-300 hover:border-cyan/40">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-line bg-gradient-to-br from-surface2 to-panel text-lg font-semibold tracking-wide text-ice" aria-hidden="true">
              {initials(m.name)}
            </div>
            <h3 className="mt-4 text-base font-semibold">{m.name}</h3>
            <p className="mt-1 text-sm text-muted">{m.role}</p>
            {m.profileUrl && (
              <a href={m.profileUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-cyan hover:text-ice">
                Profile<Icon name="arrow" className="h-3.5 w-3.5" />
              </a>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}
