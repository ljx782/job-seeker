import { copyFile, lstat, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
const files = ['index.html', 'data/mock-jobs.json', 'data/templates.json'];
const groups = {
  css: new Set(['.css']),
  js: new Set(['.js']),
  assets: new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.woff', '.woff2'])
};

// Only known public files enter dist; never copy the project root or environment.
async function collect(relative, extensions) {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const name = path.posix.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Refusing to publish a symlink: ${name}`);
    if (entry.isDirectory()) await collect(name, extensions);
    else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) files.push(name);
  }
}
for (const [directory, extensions] of Object.entries(groups)) await collect(directory, extensions);
for (const relative of [...files, 'deploy/_headers']) {
  if (!(await lstat(path.join(root, relative))).isFile()) throw new Error(`Expected a public file: ${relative}`);
}

const html = await readFile(path.join(root, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:href|src)="((?:css|js|assets)[/][^"]+)"/g)) {
  if (!files.includes(match[1])) throw new Error(`Entry asset is missing from the publish list: ${match[1]}`);
}

// This fixed, project-local output directory contains generated files only.
const previous = await lstat(output).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
if (previous?.isSymbolicLink()) throw new Error('dist must not be a symlink');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const relative of files) {
  const target = path.join(output, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(root, relative), target);
}
await copyFile(path.join(root, 'deploy/_headers'), path.join(output, '_headers'));
console.log(`Built ${files.length + 1} public files in dist. No server files or environment variables are included.`);
console.log('Frontend ready. Deploy with Netlify CLI or Git to include the functions; uploading dist alone does not deploy the backend.');
