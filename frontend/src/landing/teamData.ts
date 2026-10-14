/**
 * TEAM DATA — single place to edit.
 *
 * Provenance: these four names were supplied in the landing-page design brief. The project README
 * describes a two-person build and does not name anyone, and git history shows one author
 * (Parth-Shingane-27). Membership and roles are therefore UNCONFIRMED and need the team's sign-off.
 *
 * Rules: do not add job titles, experience, awards or profile URLs that have not been verified.
 * Add `profileUrl` only with a real, verified link; the card renders a link only when it is set.
 */
export interface Member {
  name: string;
  role: string;
  profileUrl?: string;
}

const NEUTRAL_ROLE = 'Project Team';

export const TEAM: Member[] = [
  { name: 'Parth Shingane', role: NEUTRAL_ROLE },
  { name: 'Harshini Bhandary', role: NEUTRAL_ROLE },
  { name: 'Madhura Patil', role: NEUTRAL_ROLE },
  { name: 'Om Shinkar', role: NEUTRAL_ROLE },
];

/** Verified repository URL for the footer. Leave undefined until one exists. */
export const REPO_URL: string | undefined = undefined;
