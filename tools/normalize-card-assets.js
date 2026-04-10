// tools/normalize-card-assets.js
// Usage:
//  node tools/normalize-card-assets.js --dry
//  node tools/normalize-card-assets.js

const fs = require('fs');
const path = require('path');

function slugify(name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  const s = base
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_+/g, '-')
    .replace(/[^a-z0-9\-\.]/g, '')
    .replace(/\-+/g, '-');
  return s + ext.toLowerCase();
}

function walkDir(start, cb, ignoreDirs = new Set()) {
  if (!fs.existsSync(start)) return;
  const entries = fs.readdirSync(start, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(start, e.name);
    if (e.isDirectory()) {
      const base = path.basename(full);
      if (ignoreDirs.has(base)) continue;
      walkDir(full, cb, ignoreDirs);
    } else {
      cb(full);
    }
  }
}

function findCardFiles() {
  const roots = ['cards', path.join('public', 'cards')];
  const exts = ['.png', '.jpg', '.jpeg', '.gif', '.svg'];
  const files = [];
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    walkDir(r, (f) => {
      const ext = path.extname(f).toLowerCase();
      if (exts.includes(ext)) files.push(f);
    }, new Set(['.git', 'node_modules', 'tools']));
  }
  return files;
}

function findReferencingFiles() {
  const exts = ['.js', '.html'];
  const files = [];
  walkDir('.', (f) => {
    const rel = path.relative('.', f);
    // ignore vendor folders and the tools script itself (we'll update it manually if needed)
    if (rel.startsWith('node_modules' + path.sep)) return;
    if (rel.startsWith('.git' + path.sep)) return;
    if (rel.startsWith('tools' + path.sep)) return;
    const ext = path.extname(f).toLowerCase();
    if (exts.includes(ext)) files.push(f);
  }, new Set(['node_modules', '.git']));
  return files;
}

function ensureUniqueTarget(mapOldToNew) {
  const used = new Set();
  const final = {};
  for (const oldp of Object.keys(mapOldToNew)) {
    const newp = mapOldToNew[oldp];
    const dir = path.dirname(newp);
    const base = path.basename(newp);
    let candidate = base;
    let i = 1;
    while (used.has(path.join(dir, candidate))) {
      const ext = path.extname(base);
      const name = path.basename(base, ext);
      candidate = `${name}-${i}${ext}`;
      i++;
    }
    used.add(path.join(dir, candidate));
    final[oldp] = path.join(path.dirname(newp), candidate);
  }
  return final;
}

async function main() {
  const dry = process.argv.includes('--dry') || process.argv.includes('-d');

  console.log('Scanning for card image files...');
  const cardFiles = findCardFiles();
  if (cardFiles.length === 0) {
    console.log('No card files found under cards/ or public/cards/. Exiting.');
    return;
  }

  const map = {};
  for (const f of cardFiles) {
    const base = path.basename(f);
    const slug = slugify(base);
    if (slug !== base) {
      const newPath = path.join(path.dirname(f), slug);
      map[f] = newPath;
    }
  }

  if (Object.keys(map).length === 0) {
    console.log('No filenames require normalization. Nothing to do.');
    return;
  }

  const normalizedMap = ensureUniqueTarget(map);

  console.log('Planned renames:');
  Object.keys(normalizedMap).forEach(oldp => {
    console.log(`  ${oldp}  ->  ${normalizedMap[oldp]}`);
  });

  const refFiles = findReferencingFiles();
  console.log(`\nWill update references in ${refFiles.length} files (js/html).`);

  const replacements = Object.keys(normalizedMap).map(oldp => {
    return { oldName: path.basename(oldp), newName: path.basename(normalizedMap[oldp]) };
  });

  if (dry) {
    console.log('\nDRY RUN. No files will be renamed. To apply changes, run:\n  node tools/normalize-card-assets.js\n');
    return;
  }

  console.log('\nApplying renames...');
  for (const oldp of Object.keys(normalizedMap)) {
    const newp = normalizedMap[oldp];
    try {
      const dir = path.dirname(newp);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.renameSync(oldp, newp);
      console.log(`Renamed: ${oldp} -> ${newp}`);
    } catch (e) {
      console.error(`Error renaming ${oldp} -> ${newp}:`, e);
    }
  }

  console.log('\nUpdating references in files...');
  for (const file of refFiles) {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;
    for (const { oldName, newName } of replacements) {
      const escaped = oldName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const re = new RegExp(escaped, 'g');
      if (re.test(content)) {
        content = content.replace(re, newName);
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(file, content, 'utf8');
      console.log(`Updated references in: ${file}`);
    }
  }

  console.log('\nDone. Please review the changes, run:');
  console.log('  git status');
  console.log('  git add -A');
  console.log('  git commit -m "Normalize card image filenames (slugify) and update references"');
  console.log('  git push -u origin normalize-card-filenames (create branch first)');
}

main().catch(err => { console.error(err); process.exit(1); });