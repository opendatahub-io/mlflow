#!/usr/bin/env node
// audit-rebase.js
//
// Run after rebasing from mlflow/mlflow to surface CSS override risks.
// Checks two things:
//   1. Package CSS drift   — did package CSS rules change for classes we override?
//   2. MLflow source diff  — did OSS mlflow add/change components using du-bois?
//
// Usage:
//   node scripts/audit-rebase.js                    # uses ORIG_HEAD set by git rebase
//   node scripts/audit-rebase.js --from=<sha>       # manually specify pre-rebase commit
//   node scripts/audit-rebase.js --update-versions  # accept current versions as verified
//
// Output: a human-review checklist. Not a CI gate.

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { extractCssClasses, parseNamedImports } = require('./helpers/ast-helpers');

const SCRIPT_DIR = __dirname;
const JS_ROOT = path.resolve(SCRIPT_DIR, '..');
const GIT_ROOT = path.resolve(JS_ROOT, '../../..');
const OVERRIDES_DIR = path.join(JS_ROOT, 'src/common/styles/patternfly');
const VERSIONS_FILE = path.join(SCRIPT_DIR, 'css-overrides-verified-versions.txt');

const RED = '\x1b[0;31m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[1;33m';
const CYAN = '\x1b[0;36m';
const BOLD = '\x1b[1m';
const NC = '\x1b[0m';

let fromSha = '';
let updateVersions = false;

for (const arg of process.argv.slice(2)) {
  if (arg === '--update-versions') updateVersions = true;
  else if (arg.startsWith('--from=')) fromSha = arg.slice(7);
  else {
    console.error(`Unknown flag: ${arg}`);
    process.exit(1);
  }
}

function section(title) {
  console.log('');
  console.log(`${BOLD}=== ${title} ===${NC}`);
}

function git(...args) {
  return execFileSync('git', args, { cwd: GIT_ROOT, encoding: 'utf8' }).trim();
}

function validateRef(ref) {
  if (!/^[a-zA-Z0-9._\-\/~^]+$/.test(ref)) return false;
  try {
    execFileSync('git', ['rev-parse', '--verify', ref], { cwd: GIT_ROOT, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function installedVersion(pkg) {
  try {
    const pkgJson = path.join(JS_ROOT, 'node_modules', pkg, 'package.json');
    return JSON.parse(fs.readFileSync(pkgJson, 'utf8')).version;
  } catch {
    return 'unknown';
  }
}

function isVendored(pkg) {
  try {
    const mainPkg = JSON.parse(fs.readFileSync(path.join(JS_ROOT, 'package.json'), 'utf8'));
    const dep = mainPkg.dependencies?.[pkg] || '';
    return dep.startsWith('file:');
  } catch {
    return false;
  }
}

function verifiedVersion(pkg) {
  if (!fs.existsSync(VERSIONS_FILE)) return 'none';
  const lines = fs.readFileSync(VERSIONS_FILE, 'utf8').split('\n');
  for (const line of lines) {
    if (line.startsWith(`${pkg}=`)) return line.split('=')[1].trim();
  }
  return 'none';
}

function classToArea(cls) {
  if (/select|dropdown|combobox|typeahead/i.test(cls)) return 'dropdowns & selects';
  if (/modal/i.test(cls)) return 'modals';
  if (/notification|toast/i.test(cls)) return 'notifications';
  if (/popover/i.test(cls)) return 'popovers';
  if (/btn|button/i.test(cls)) return 'buttons';
  if (/input/i.test(cls)) return 'inputs';
  if (/checkbox|tree/i.test(cls)) return 'checkboxes & trees';
  if (/radio/i.test(cls)) return 'radio groups';
  if (/alert/i.test(cls)) return 'alerts';
  if (/tag/i.test(cls)) return 'tags';
  return 'other';
}

function componentToArea(comp) {
  const map = {
    Select: 'dropdowns & selects',
    DialogCombobox: 'dropdowns & selects',
    DropdownMenu: 'dropdowns & selects',
    TypeaheadCombobox: 'dropdowns & selects',
    Combobox: 'dropdowns & selects',
    SelectV2: 'dropdowns & selects',
    Modal: 'modals',
    Notification: 'notifications',
    Toast: 'notifications',
    Popover: 'popovers',
    HoverCard: 'popovers',
    Button: 'buttons',
    IconButton: 'buttons',
    Input: 'inputs',
    TextArea: 'inputs',
    SearchInput: 'inputs',
    Checkbox: 'checkboxes & trees',
    Tree: 'checkboxes & trees',
    Radio: 'radio groups',
    RadioGroup: 'radio groups',
    Alert: 'alerts',
    Tag: 'tags',
    TableRow: 'tables',
    TableCell: 'tables',
    Table: 'tables',
    DataTable: 'tables',
    FormUI: 'forms',
    FormGroup: 'forms',
  };
  return map[comp] || '';
}

function buildOverrideClassList() {
  const classes = extractCssClasses(OVERRIDES_DIR, 'du-bois-');
  const normalized = new Set();
  for (const cls of classes) {
    normalized.add(cls.replace('du-bois-dark-', 'du-bois-light-'));
  }
  return normalized;
}

function extractDuboisComponents(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return parseNamedImports(filePath, '@databricks/design-system', {
    filter: (name) => /^[A-Z]/.test(name),
  });
}

// ---------------------------------------------------------------------------
// --update-versions
// ---------------------------------------------------------------------------
function doUpdateVersions() {
  const pkgs = ['@databricks/design-system', '@patternfly/patternfly', '@patternfly/react-tokens'];
  const versions = [];

  for (const pkg of pkgs) {
    const ver = installedVersion(pkg);
    if (ver === 'unknown') {
      console.error(`${RED}ERROR${NC}: ${pkg} is not installed. Run 'yarn install' first.`);
      process.exit(1);
    }
    versions.push(`${pkg}=${ver}`);
  }

  const lines = [
    '# Last visually verified package versions for CSS override compatibility.',
    '# Update with: yarn audit:rebase --update-versions',
    '# After: verifying that all CSS overrides look correct in the browser.',
    '',
    ...versions,
    '',
  ];
  fs.writeFileSync(VERSIONS_FILE, lines.join('\n'));

  console.log(`${GREEN}Versions file updated${NC}: scripts/css-overrides-verified-versions.txt`);
  console.log('Commit it alongside your other rebase changes.');
  console.log(fs.readFileSync(VERSIONS_FILE, 'utf8'));
}

// ---------------------------------------------------------------------------
// Section 1: Package CSS drift
// ---------------------------------------------------------------------------
function checkPackageDrift() {
  section('1/2  Package CSS drift');

  const PKG_CSS = {
    '@databricks/design-system': 'dist/index.css',
    '@patternfly/patternfly': 'patternfly.css',
  };

  const overrideClasses = buildOverrideClassList();
  let anyChange = false;

  for (const [pkg, cssFile] of Object.entries(PKG_CSS)) {
    const oldVer = verifiedVersion(pkg);
    const newVer = installedVersion(pkg);

    if (oldVer === 'none') {
      console.log(`  ${YELLOW}!${NC} ${pkg}: no verified version on record — run --update-versions after first visual check`);
      continue;
    }

    if (oldVer === newVer) {
      console.log(`  ${GREEN}✓${NC} ${pkg} @ ${newVer} (unchanged)`);
      continue;
    }

    console.log(`  ${YELLOW}CHANGED${NC}  ${pkg}: ${oldVer} → ${newVer}`);
    anyChange = true;

    if (isVendored(pkg)) {
      const vendorCss = path.join(JS_ROOT, 'node_modules', pkg, cssFile);
      if (fs.existsSync(vendorCss)) {
        console.log(`  ${CYAN}·${NC} ${pkg} is vendored — checking installed CSS against overrides directly.`);
        const cssContent = fs.readFileSync(vendorCss, 'utf8');
        const changedClasses = [];
        for (const cls of overrideClasses) {
          if (!cssContent.includes(cls)) changedClasses.push(cls);
        }
        if (changedClasses.length > 0) {
          console.log(`    ${YELLOW}Override classes NOT found in vendored CSS (${changedClasses.length}):${NC}`);
          for (const cls of changedClasses.sort()) {
            console.log(`      ${cls}  →  ${classToArea(cls)}`);
          }
        } else {
          console.log(`    ${GREEN}✓${NC} All overridden classes exist in vendored CSS.`);
        }
      } else {
        console.log(`  ${CYAN}·${NC} ${pkg} is vendored but ${cssFile} not found. Check vendor directory manually.`);
      }
      continue;
    }

    let diffOutput;
    const result = spawnSync('npm', ['diff', '--diff', `${pkg}@${oldVer}`, '--diff', `${pkg}@${newVer}`, '--', cssFile], {
      encoding: 'utf8',
      timeout: 60000,
    });
    if (result.error || result.status !== 0) {
      console.log(`  ${YELLOW}WARN${NC} Could not fetch diff for ${pkg} (${result.error?.message || 'exit ' + result.status}). Check manually.`);
      continue;
    }
    diffOutput = result.stdout;

    if (!diffOutput) {
      console.log(`  ${CYAN}·${NC} No CSS changes in diff.`);
      continue;
    }

    const changedClasses = new Set();
    const newClasses = new Set();
    let current = null;

    for (const line of diffOutput.split('\n')) {
      if (!line.startsWith('+') && !line.startsWith('-')) {
        const m = line.match(/\.(du-bois-(?:light|dark)-[\w-]+)/);
        if (m) current = m[1].replace('-dark-', '-light-');
      } else if (!line.startsWith('+++') && !line.startsWith('---')) {
        if (current && overrideClasses.has(current)) changedClasses.add(current);
        for (const m of line.matchAll(/\.(du-bois-light-[\w-]+)/g)) {
          if (line.startsWith('+') && !overrideClasses.has(m[1])) newClasses.add(m[1]);
        }
      }
    }

    if (changedClasses.size > 0) {
      console.log('');
      console.log(`    ${YELLOW}Classes with changed CSS rules (verify your overrides still look right):${NC}`);
      for (const cls of [...changedClasses].sort()) {
        console.log(`      ${cls}  →  ${classToArea(cls)}`);
      }
    }

    if (newClasses.size > 0) {
      console.log('');
      console.log(`    ${CYAN}New class names in package not yet in your overrides (check if needed):${NC}`);
      for (const cls of [...newClasses].sort()) {
        console.log(`      ${cls}`);
      }
    }

    if (changedClasses.size === 0 && newClasses.size === 0) {
      console.log(`  ${CYAN}·${NC} CSS changed between versions but no overridden classes were affected.`);
    }
    console.log('');
  }

  // Check react-tokens version drift (no CSS diff needed, but flag the mismatch)
  const rtPkg = '@patternfly/react-tokens';
  const rtOld = verifiedVersion(rtPkg);
  const rtNew = installedVersion(rtPkg);
  if (rtOld !== 'none' && rtOld !== rtNew) {
    console.log(`  ${YELLOW}CHANGED${NC}  ${rtPkg}: ${rtOld} → ${rtNew}`);
    console.log(`    Token values may have changed — verify PatternFly theme overrides in patternflyStyles/*.ts`);
    anyChange = true;
  }

  if (!anyChange) {
    console.log('');
    console.log(`  ${GREEN}✓${NC} All package versions match verified state — no CSS drift to check.`);
  }
}

// ---------------------------------------------------------------------------
// Section 2: MLflow source changes
// ---------------------------------------------------------------------------
function checkSourceChanges() {
  section('2/2  MLflow source changes');

  let from = fromSha;
  if (!from) {
    try {
      from = git('rev-parse', 'ORIG_HEAD');
    } catch {
      // ORIG_HEAD not available
    }
  }

  if (!from) {
    console.log(`  ${YELLOW}!${NC} No pre-rebase commit found. Pass --from=<sha> or run immediately after git rebase.`);
    return;
  }

  if (!validateRef(from)) {
    console.log(`  ${RED}ERROR${NC}: Invalid git ref: ${from}`);
    return;
  }

  console.log(`  ${CYAN}·${NC} Comparing against: ${git('log', '--oneline', '-1', from)}`);
  console.log('');

  let newFiles, changedFiles;
  function gitDiffFiles(filter) {
    try {
      const output = git('diff', from, '--name-only', `--diff-filter=${filter}`, '--', 'mlflow/server/js/src/');
      if (!output) return [];
      return output
        .split('\n')
        .filter((f) => /\.(tsx|ts)$/.test(f) && !/\.test\.|\.stories\./.test(f))
        .map((f) => f.replace('mlflow/server/js/', ''))
        .sort();
    } catch {
      return [];
    }
  }

  newFiles = gitDiffFiles('A');
  changedFiles = gitDiffFiles('M');

  // New files
  let printedNew = false;
  for (const relPath of newFiles) {
    const fullPath = path.join(JS_ROOT, relPath);
    const components = extractDuboisComponents(fullPath);
    if (components.length === 0) continue;

    const mapped = components.map((c) => ({ name: c, area: componentToArea(c) }));
    const areas = [...new Set(mapped.filter((m) => m.area).map((m) => m.area))];
    const unmapped = mapped.filter((m) => !m.area).map((m) => m.name);

    if (!printedNew) {
      console.log(`  ${YELLOW}New files${NC} — new UI areas using du-bois (full visual check needed):`);
      printedNew = true;
    }
    console.log(`    ${relPath}`);
    if (areas.length > 0) {
      console.log(`      → override areas: ${areas.join(', ')}`);
    }
    if (unmapped.length > 0) {
      console.log(`      → ${YELLOW}unmapped components (manual review needed)${NC}: ${unmapped.join(', ')}`);
    }
  }
  if (printedNew) console.log('');
  if (!printedNew) console.log(`  ${GREEN}✓${NC} No new files using @databricks/design-system.`);

  // Changed files
  console.log('');
  let foundAny = false;
  if (changedFiles.length > 0) {
    console.log(`  ${CYAN}Changed files${NC} — using @databricks/design-system:`);
    for (const relPath of changedFiles) {
      const fullPath = path.join(JS_ROOT, relPath);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf8');
      if (!content.includes('@databricks/design-system')) continue;

      let diffComponents;
      try {
        const diff = git('diff', from, '--', `mlflow/server/js/${relPath}`);
        const addedLines = diff
          .split('\n')
          .filter((l) => l.startsWith('+') && !l.startsWith('+++'));
        diffComponents = [
          ...new Set(addedLines.flatMap((l) => [...l.matchAll(/<([A-Z][a-zA-Z0-9]+)/g)].map((m) => m[1]))),
        ];
      } catch (e) {
        console.warn(`    ${YELLOW}WARN${NC}: could not diff ${relPath}: ${e.message}`);
        diffComponents = [];
      }

      const areas = [...new Set(diffComponents.map(componentToArea).filter(Boolean))];

      console.log(`    ${relPath}`);
      if (areas.length > 0) {
        console.log(`      → changed usage: ${areas.join(', ')}`);
      } else {
        console.log('      → structure may have changed (check overrides still apply)');
      }
      foundAny = true;
    }
  }

  if (!foundAny) {
    console.log(`  ${GREEN}✓${NC} No changed files import from @databricks/design-system.`);
  }

  console.log('');
  if (newFiles.length === 0 && changedFiles.length === 0) {
    console.log(`  ${GREEN}✓${NC} No TSX/TS files changed by this rebase.`);
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║         MLflow ODH — Post-rebase CSS override audit            ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

if (updateVersions) {
  doUpdateVersions();
  process.exit(0);
}

checkPackageDrift();
checkSourceChanges();

console.log('');
console.log('──────────────────────────────────────────────────────────────────');
console.log('  After verifying everything looks correct in the browser:');
console.log('    yarn audit:rebase --update-versions');
console.log('    git add scripts/css-overrides-verified-versions.txt');
console.log('──────────────────────────────────────────────────────────────────');
console.log('');
