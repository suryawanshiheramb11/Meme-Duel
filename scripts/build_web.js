// Builds the slim static site that gets hosted (Vercel, or any static host) into ./web-dist.
//
// The game has no bundler: the browser loads src/*.js directly. This script copies only the
// files the game actually references, so the hosted site is a few tens of MB instead of the
// whole repository (source packs, design assets and tests stay out).
//
//   npm run build:web            # writes web-dist/
//   cd web-dist && vercel --prod # deploy it
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'web-dist');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

function copy(rel) {
  const from = path.join(ROOT, rel);
  if (!fs.existsSync(from)) throw new Error(`Missing file the game needs: ${rel}`);
  const to = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

// Clean the output but keep .vercel (the link to the hosting project) so redeploys keep working
fs.mkdirSync(OUT, { recursive: true });
for (const entry of fs.readdirSync(OUT)) {
  if (entry !== '.vercel') fs.rmSync(path.join(OUT, entry), { recursive: true, force: true });
}

// 1. App shell
['index.html', 'styles.css'].forEach(copy);
walk(path.join(ROOT, 'src')).forEach((f) => copy(path.relative(ROOT, f)));

// 2. Everything under assets/ that the code or page mentions by literal path
const sources = ['index.html', 'styles.css', ...walk(path.join(ROOT, 'src')).map((f) => path.relative(ROOT, f))];
const referenced = new Set();
for (const rel of sources) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const m of text.matchAll(/assets\/[A-Za-z0-9_\-./]+\.(?:ogg|mp3|wav|jpg|jpeg|png|webp|json|js|mp4|svg|woff2?|ttf)/g)) {
    referenced.add(m[0]);
  }
}
referenced.forEach(copy);

// three.js pulls its core in from a sibling file
copy('assets/libs/three.core.js');

// 3. Meme clips are chosen at runtime from the manifest, so ship the whole folder
walk(path.join(ROOT, 'assets', 'memes')).forEach((f) => copy(path.relative(ROOT, f)));

// 4. Hosting config: long-lived caching for media, always-fresh code, basic hardening
const config = {
  cleanUrls: true,
  headers: [
    {
      // The clip list changes whenever memes, phrases or moves are edited, so it must always revalidate.
      source: '/assets/memes/manifest.json',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }]
    },
    {
      // Everything under /assets except the clip list (the negative lookahead keeps the two rules from overlapping)
      source: '/assets/((?!memes/manifest\\.json$).*)',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }]
    },
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }
      ]
    }
  ]
};
fs.writeFileSync(path.join(OUT, 'vercel.json'), JSON.stringify(config, null, 2) + '\n');

// Report
const files = walk(OUT);
const bytes = files.reduce((n, f) => n + fs.statSync(f).size, 0);
const byDir = {};
files.forEach((f) => {
  const top = path.relative(OUT, f).split(path.sep).slice(0, 2).join('/');
  byDir[top] = (byDir[top] || 0) + fs.statSync(f).size;
});
console.log(`web-dist: ${files.length} files, ${(bytes / 1e6).toFixed(1)} MB`);
Object.entries(byDir)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8)
  .forEach(([d, n]) => console.log(`  ${(n / 1e6).toFixed(1).padStart(5)} MB  ${d}`));
