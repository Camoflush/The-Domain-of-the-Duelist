// tools/normalize-card-assets.js
// Usage:
//  node tools/normalize-card-assets.js --dry
//  node tools/normalize-card-assets.js       (actually perform changes)
//  node tools/normalize-card-assets.js --apply (same as no flag)
// It will:
//  - find files under ./cards/** with spaces or uppercase or unsafe chars
//  - compute a slugified filename (lowercase, spaces -> -, remove unsafe chars)
//  - ensure unique target names (append -1, -2 if needed)
//  - rename files on disk (if not --dry)
//  - update references in .js and .html files (replace occurrences of the old basename with new basename)
//  - print a summary

const fs = require('fs');
const path = require('path');
const glob = require('glob');

function slugify(name) {
  // keep extension
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  // lower, replace spaces and underscores with -, remove non-alnum-.
  const s = base
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/\-+/g, '-');
  return s + ext.toLowerCase();
}

function findCardFiles() {
  // find images under any cards/ subfolder
  const patterns = ['cards/**/*.{png,jpg,jpeg,gif,svg}', 'public/cards/**/*.{png,jpg,jpeg,gif,svg}'];
  const files = new Set();
  for (const p of patterns) {
    const matches = glob.sync(p, { nodir: true });
    matches.forEach(m => files.add(m));
  }
  return Array.from(files);
}

function findReferencingFiles() {
  // files to update references in: data/*.js, *.html, backup/*.html, other js files
  const patterns = ['**/*.js', '**/*.html'];
  // exclude node_modules, .git and tools itself will be edited
  const files = new Set();
  for (const p of patterns) {
    const matches = glob.sync(p, { nodir: true, ignore: ['node_modules/**', '.git/**', 'tools/**'] });
    matches.forEach(m => files.add(m));
  }
  return Array.from(files);
}

function ensureUniqueTarget(mapOldToNew) {
  // if collisions occur (two different old names map to same new), append suffixes
  const used = new Map();
  const final = {};
  Object.keys(mapOldToNew).forEach(oldp => {
    const newp = mapOldToNew[oldp];
    const dir = path.dirname(newp);
    let base = path.basename(newp);
    let candidate = base;
    let i = 1;
    while (used.has(path.join(dir, candidate))) {
      i++;
      const ext = path.extname(base);
      const name = path.basename(base, ext);
      candidate = `${name}-${i}${ext}`;
    }
    used.set(path.join(dir, candidate), true);
    final[oldp] = path.join(path.dirname(newp), candidate);
  });
  return final;
}

async function main() {
  const dry = process.argv.includes('--dry') || process.argv.includes('-d');
  const apply = !dry;

  console.log('Scanning for card image files...');
  const cardFiles = findCardFiles();
  if (cardFiles.length === 0) {
    console.log('No card files found under cards/ or public/cards/. Exiting.');
    return;
  }

  // build mapping old -> new (only for files that need change i.e. slug differs)
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

  // ensure unique targets
  const normalizedMap = ensureUniqueTarget(map);

  console.log('Planned renames:');
  Object.keys(normalizedMap).forEach(oldp => {
    console.log(`  ${oldp}  ->  ${normalizedMap[oldp]}`);
  });

  // find files to update references
  const refFiles = findReferencingFiles();
  console.log(`\nWill update references in ${refFiles.length} files (js/html).`);

  // preview replacements: we will replace occurrences of basename(old) with basename(new)
  const replacements = Object.keys(normalizedMap).map(oldp => {
    return { oldName: path.basename(oldp), newName: path.basename(normalizedMap[oldp]) };
  });

  if (dry) {
    console.log('\nDRY RUN. No files will be renamed. To apply changes, run:\n  node tools/normalize-card-assets.js\n');
    return;
  }

  // perform renames
  console.log('\nApplying renames...');
  for (const oldp of Object.keys(normalizedMap)) {
    const newp = normalizedMap[oldp];
    try {
      // ensure destination dir exists
      const dir = path.dirname(newp);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.renameSync(oldp, newp);
      console.log(`Renamed: ${oldp} -> ${newp}`);
    } catch (e) {
      console.error(`Error renaming ${oldp} -> ${newp}:`, e);
    }
  }

  // update references in files
  console.log('\nUpdating references in files...');
  for (const file of refFiles) {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;
    for (const { oldName, newName } of replacements) {
      const re = new RegExp(oldName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'); // escape
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
