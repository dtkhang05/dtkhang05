// Draws images/stats.svg from public GitHub data: public repositories, stars, contributions in the last year and the top languages.
// Run by .github/workflows/stats.yml every day; GITHUB_TOKEN only reads public data.
import { writeFileSync, mkdirSync } from 'node:fs';

const LOGIN = 'dtkhang05';
const query = `query {
  user(login: "${LOGIN}") {
    createdAt
    repositories(ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false, first: 100) {
      totalCount
      nodes { stargazerCount languages(first: 10, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name color } } } }
    }
    contributionsCollection { contributionCalendar { totalContributions } totalCommitContributions }
  }
}`;
const res = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'profile-stats' },
  body: JSON.stringify({ query }),
});
const { data, errors } = await res.json();
if (errors || !data?.user) throw new Error(JSON.stringify(errors ?? 'no user'));
const u = data.user;

// Languages by size of code, skipping notebooks and markup that would crowd out the rest.
const SKIP = new Set(['Jupyter Notebook', 'HTML', 'CSS', 'SCSS']);
const langs = new Map();
for (const r of u.repositories.nodes) {
  for (const { size, node } of r.languages.edges) {
    if (SKIP.has(node.name)) continue;
    const l = langs.get(node.name) ?? { size: 0, color: node.color ?? '#999' };
    l.size += size;
    langs.set(node.name, l);
  }
}
const total = [...langs.values()].reduce((s, l) => s + l.size, 0) || 1;
const top = [...langs.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 5).map(([name, l]) => ({ name, color: l.color, pct: (100 * l.size) / total }));

const stats = [
  ['Public repositories', u.repositories.totalCount],
  ['Stars earned', u.repositories.nodes.reduce((s, r) => s + r.stargazerCount, 0)],
  ['Contributions, last 12 months', u.contributionsCollection.contributionCalendar.totalContributions],
  ['Commits, last 12 months', u.contributionsCollection.totalCommitContributions],
  ['On GitHub since', new Date(u.createdAt).getFullYear()],
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const W = 820;
let bar = '';
let x = 430;
const BW = 350;
for (const l of top) {
  const w = (BW * l.pct) / top.reduce((s, t) => s + t.pct, 0);
  bar += `<rect x="${x.toFixed(1)}" y="70" width="${w.toFixed(1)}" height="12" fill="${l.color}"/>`;
  x += w;
}
const legend = top.map((l, i) => `<g transform="translate(${430 + (i % 2) * 180},${112 + Math.floor(i / 2) * 30})"><circle cx="6" cy="-5" r="6" fill="${l.color}"/><text x="20" y="0" class="v2">${esc(l.name)} <tspan class="k">${l.pct.toFixed(1)}%</tspan></text></g>`).join('');
const rows = stats.map(([k, v], i) => `<text x="40" y="${80 + i * 32}" class="k">${esc(k)}</text><text x="370" y="${80 + i * 32}" class="v" text-anchor="end">${esc(v)}</text>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="250" viewBox="0 0 ${W} 250" font-family="Segoe UI, Helvetica, Arial, sans-serif">
<style>.h{font-size:18px;font-weight:700;fill:#2f81f7}.k{font-size:15px;fill:#7d8590}.v{font-size:17px;font-weight:700;fill:#8b949e}.v2{font-size:15px;fill:#8b949e}</style>
<rect x="1" y="1" width="${W - 2}" height="248" rx="12" fill="none" stroke="#7d8590" stroke-opacity="0.35"/>
<text x="40" y="40" class="h">GitHub stats</text><text x="430" y="40" class="h">Most used languages</text>
${rows}
<clipPath id="c"><rect x="430" y="70" width="${BW}" height="12" rx="6"/></clipPath><g clip-path="url(#c)">${bar}</g>
${legend}
</svg>`;
mkdirSync('images', { recursive: true });
writeFileSync('images/stats.svg', svg);
console.log(stats.map(([k, v]) => `${k}: ${v}`).join(' | '), '|', top.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(', '));
