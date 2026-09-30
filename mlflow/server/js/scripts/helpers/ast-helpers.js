'use strict';

const fs = require('fs');
const path = require('path');

function requireOrFail(mod, hint) {
  try {
    return require(mod);
  } catch {
    console.error(`ERROR: '${mod}' not found. ${hint}`);
    process.exit(1);
  }
}

const postcss = requireOrFail('postcss', 'It is provided transitively by react-scripts — run yarn install.');
const selectorParser = requireOrFail('postcss-selector-parser', 'It is provided transitively by postcss — run yarn install.');
const ts = requireOrFail('typescript', 'Run yarn install.');

function readFilesRecursively(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...readFilesRecursively(full, ext));
    else if (!ext || entry.name.endsWith(ext)) results.push(full);
  }
  return results;
}

function stripScssForPostcss(content) {
  content = content.replace(/\/\/[^\n]*/g, '');
  content = content.replace(/@(?:use|forward)\b[^;]*;/g, '');
  content = content.replace(/@include\b[^;{]*;/g, '');
  return content;
}

const STYLE_EXTS = new Set(['.scss', '.css']);

function extractCssClasses(dir, classPrefix) {
  const classes = new Set();
  const prefixRe = new RegExp(`^${classPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  const fallbackRe = new RegExp(`\\.(${classPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-zA-Z0-9_-]+)`, 'g');

  for (const file of readFilesRecursively(dir)) {
    if (!STYLE_EXTS.has(path.extname(file))) continue;
    const raw = fs.readFileSync(file, 'utf8');

    try {
      const content = stripScssForPostcss(raw);
      const root = postcss.parse(content, { from: file });
      root.walkRules((rule) => {
        try {
          selectorParser((selectors) => {
            selectors.walkClasses((cls) => {
              if (prefixRe.test(cls.value)) classes.add(cls.value);
            });
          }).processSync(rule.selector);
        } catch (e) {
          console.warn(`  WARN: selector parse failed in ${file}: ${e.message} — falling back to regex`);
          for (const m of rule.selector.matchAll(fallbackRe)) classes.add(m[1]);
        }
      });
    } catch (e) {
      console.warn(`  WARN: postcss parse failed for ${file}: ${e.message} — falling back to regex`);
      for (const m of raw.matchAll(fallbackRe)) classes.add(m[1]);
    }
  }

  return [...classes].sort();
}

function extractCssCustomProperties(dir, prefix) {
  const vars = new Set();
  const prefixRe = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  const varRefRe = new RegExp(`(${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-zA-Z0-9_-]+)`, 'g');

  for (const file of readFilesRecursively(dir)) {
    if (!STYLE_EXTS.has(path.extname(file))) continue;
    const raw = fs.readFileSync(file, 'utf8');

    try {
      const content = stripScssForPostcss(raw);
      const root = postcss.parse(content, { from: file });
      root.walkDecls((decl) => {
        if (prefixRe.test(decl.prop)) vars.add(decl.prop);
        for (const m of decl.value.matchAll(varRefRe)) vars.add(m[1]);
      });
    } catch (e) {
      console.warn(`  WARN: postcss parse failed for ${file}: ${e.message} — falling back to regex`);
      for (const m of raw.matchAll(varRefRe)) vars.add(m[1]);
    }
  }

  return [...vars].sort();
}

const SCRIPT_KIND_MAP = {
  '.ts': ts.ScriptKind.TS,
  '.tsx': ts.ScriptKind.TSX,
  '.js': ts.ScriptKind.JS,
  '.jsx': ts.ScriptKind.JSX,
};

function parseNamedImports(filePath, moduleSpecifier, options = {}) {
  const content = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath);
  const kind = SCRIPT_KIND_MAP[ext] || ts.ScriptKind.TS;

  const sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, kind);
  const names = new Set();

  ts.forEachChild(sf, (node) => {
    if (!ts.isImportDeclaration(node)) return;
    const spec = node.moduleSpecifier;
    if (!ts.isStringLiteral(spec) || spec.text !== moduleSpecifier) return;
    const nb = node.importClause?.namedBindings;
    if (!nb || !ts.isNamedImports(nb)) return;

    for (const el of nb.elements) {
      const name = el.propertyName ? el.propertyName.text : el.name.text;
      if (options.skip?.has(name)) continue;
      if (options.filter && !options.filter(name)) continue;
      names.add(name);
    }
  });

  return [...names].sort();
}

module.exports = { extractCssClasses, extractCssCustomProperties, parseNamedImports, readFilesRecursively };
