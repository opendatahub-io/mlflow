#!/usr/bin/env node
// audit-css-overrides.js
//
// Static check that CSS override selectors in patternfly/ still exist in the
// installed packages. Runs in a few seconds after `yarn install` — no server,
// no data, no browser required.
//
// Usage:
//   node scripts/audit-css-overrides.js                    # normal CI run
//   node scripts/audit-css-overrides.js --update-baseline  # accept current state
//
// Exit codes:  0 = no new failures,  1 = new failures found

const fs = require('fs');
const path = require('path');
const { extractCssClasses, extractCssCustomProperties, parseNamedImports, readFilesRecursively } = require('./helpers/ast-helpers');

const SCRIPT_DIR = __dirname;
const JS_ROOT = path.resolve(SCRIPT_DIR, '..');
const OVERRIDES_DIR = path.join(JS_ROOT, 'src/common/styles/patternfly');

const DS_CSS = path.join(JS_ROOT, 'node_modules/@databricks/design-system/dist/index.css');
const PF_CSS = path.join(JS_ROOT, 'node_modules/@patternfly/patternfly/patternfly.css');
const PF_TOKENS_ESM = path.join(JS_ROOT, 'node_modules/@patternfly/react-tokens/dist/esm');
const RADIX_POPPER = path.join(JS_ROOT, 'node_modules/@radix-ui/react-popper/dist/index.js');
const BASELINE_FILE = path.join(SCRIPT_DIR, 'css-overrides-baseline.txt');

const RED = '\x1b[0;31m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[1;33m';
const NC = '\x1b[0m';

const updateBaseline = process.argv.includes('--update-baseline');
const allFailures = [];

function ok(name) {
  console.log(`  ${GREEN}OK${NC}   ${name}`);
}

function miss(name) {
  console.log(`  ${RED}MISS${NC} ${name}`);
  allFailures.push(name);
}

function warn(name) {
  console.log(`  ${YELLOW}WARN${NC} ${name}`);
}

function checkPrereqs() {
  let fail = false;
  for (const f of [DS_CSS, PF_CSS, PF_TOKENS_ESM]) {
    if (!fs.existsSync(f)) {
      console.error(`${RED}ERROR${NC}: not found: ${f}  (run 'yarn install' first)`);
      fail = true;
    }
  }
  if (fail) process.exit(1);
}

function checkDuboisClasses() {
  console.log('');
  console.log('=== 1/3  du-bois selectors  →  @databricks/design-system/dist/index.css ===');

  const classes = extractCssClasses(OVERRIDES_DIR, 'du-bois-');
  const dsCss = fs.readFileSync(DS_CSS, 'utf8');

  let count = 0;
  for (const cls of classes) {
    const lookup = cls.replace('du-bois-dark-', 'du-bois-light-');
    if (dsCss.includes(lookup)) {
      ok(cls);
    } else {
      miss(cls);
    }
    count++;
  }
  console.log(`  checked ${count} selectors`);
}

function checkPfCssVars() {
  console.log('');
  console.log('=== 2/3  --pf-t-- variables  →  @patternfly/patternfly/patternfly.css ===');

  const vars = extractCssCustomProperties(OVERRIDES_DIR, '--pf-t--');
  const pfCss = fs.readFileSync(PF_CSS, 'utf8');

  let count = 0;
  for (const v of vars) {
    if (pfCss.includes(`${v}:`)) {
      ok(v);
    } else {
      miss(v);
    }
    count++;
  }
  console.log(`  checked ${count} variables`);
}

function checkPfReactTokens() {
  console.log('');
  console.log('=== 3/3  react-tokens imports  →  @patternfly/react-tokens/dist/esm/*.js ===');

  const stylesDir = path.join(OVERRIDES_DIR, 'patternflyStyles');
  const skip = new Set(['convertRemStringToPx', 'convertPxStringToPx']);
  const tokens = new Set();

  for (const file of readFilesRecursively(stylesDir, '.ts')) {
    for (const name of parseNamedImports(file, '@patternfly/react-tokens', { skip })) {
      tokens.add(name);
    }
  }

  let count = 0;
  for (const tok of [...tokens].sort()) {
    if (fs.existsSync(path.join(PF_TOKENS_ESM, `${tok}.js`))) {
      ok(tok);
    } else {
      miss(tok);
    }
    count++;
  }
  console.log(`  checked ${count} token imports`);
}

function checkRadixAttrs() {
  console.log('');
  console.log('=== bonus  Radix attribute selectors (informational) ===');

  if (!fs.existsSync(RADIX_POPPER)) {
    warn('data-radix-popper-content-wrapper: @radix-ui/react-popper not installed');
    return;
  }
  const content = fs.readFileSync(RADIX_POPPER, 'utf8');
  if (content.includes('data-radix-popper-content-wrapper')) {
    ok('data-radix-popper-content-wrapper');
  } else {
    warn('data-radix-popper-content-wrapper: not found (may have been renamed)');
  }
}

function reportVersions() {
  console.log('');
  console.log('=== dependency versions ===');
  const pkg = JSON.parse(fs.readFileSync(path.join(JS_ROOT, 'package.json'), 'utf8'));
  for (const dep of ['@databricks/design-system', '@patternfly/patternfly', '@patternfly/react-tokens']) {
    const ver = pkg.dependencies?.[dep] || pkg.devDependencies?.[dep] || 'n/a';
    console.log(`  ${dep}: ${ver}`);
  }
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) return [];
  return fs
    .readFileSync(BASELINE_FILE, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .sort();
}

function writeBaseline() {
  const sorted = [...new Set(allFailures)].sort();
  const baseline = loadBaseline();

  if (baseline.length > 0) {
    const recovered = baseline.filter((b) => !sorted.includes(b)).length;
    const added = sorted.filter((s) => !baseline.includes(s)).length;
    console.log('');
    console.log(`  ${added} newly added to baseline,  ${recovered} removed (fixed)`);
  }

  const lines = [
    '# CSS override selector baseline',
    '# Generated by: yarn audit:css-overrides:update',
    `# Updated: ${new Date().toISOString().slice(0, 10)}`,
    '#',
    '# Selectors listed here are known to be missing from the installed packages.',
    '# They warn in CI but do NOT block it.',
    '# Remove an entry once you\'ve updated the selector and verified it visually.',
    '',
    ...sorted,
    '',
  ];
  fs.writeFileSync(BASELINE_FILE, lines.join('\n'));
  console.log(`${GREEN}Baseline updated${NC}: ${sorted.length} entries written to scripts/css-overrides-baseline.txt`);
  console.log('Commit scripts/css-overrides-baseline.txt alongside your other changes.');
}

function evaluateResults() {
  const baseline = loadBaseline();
  const failures = [...new Set(allFailures)].sort();

  const newFails = failures.filter((f) => !baseline.includes(f));
  const knownFails = failures.filter((f) => baseline.includes(f));
  const recovered = baseline.filter((b) => !failures.includes(b));

  console.log('');
  console.log('══════════════════════════════════════════════════════════════════');

  if (recovered.length > 0) {
    console.log(`  ${GREEN}Fixed${NC} (${recovered.length} — remove from baseline):`);
    for (const s of recovered) console.log(`    ${s}`);
  }

  if (knownFails.length > 0) {
    console.log(`  ${YELLOW}Known${NC} (${knownFails.length} — in baseline, warn only):`);
    for (const s of knownFails) console.log(`    ${s}`);
  }

  if (newFails.length > 0) {
    console.log(`  ${RED}New failures${NC} (${newFails.length} — not in baseline, blocking):`);
    for (const s of newFails) console.log(`    ${s}`);
  }

  console.log('══════════════════════════════════════════════════════════════════');

  if (newFails.length > 0) {
    console.log('');
    console.log(`${RED}FAIL${NC}: ${newFails.length} new override selector(s) no longer exist in installed packages.`);
    console.log('');
    console.log('  Options:');
    console.log('    a) Find the new class/token name and update the SCSS override');
    console.log('    b) If this is dead CSS you\'re intentionally deferring:');
    console.log('         yarn audit:css-overrides:update');
    console.log('');
    process.exit(1);
  }

  console.log('');
  if (knownFails.length > 0) {
    console.log(`${YELLOW}WARN${NC}: ${knownFails.length} known issue(s) in baseline (CI not blocked).`);
    console.log("  Run 'yarn audit:css-overrides:update' after fixing them to shrink the baseline.");
  } else {
    console.log(`${GREEN}All selectors and tokens match installed packages.${NC}`);
    if (recovered.length > 0) {
      console.log(
        `  Run 'yarn audit:css-overrides:update' to remove ${recovered.length} fixed entry/entries from baseline.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║         MLflow ODH — CSS override selector audit               ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

checkPrereqs();
checkDuboisClasses();
checkPfCssVars();
checkPfReactTokens();
checkRadixAttrs();
reportVersions();

if (updateBaseline) {
  writeBaseline();
  process.exit(0);
}

evaluateResults();
