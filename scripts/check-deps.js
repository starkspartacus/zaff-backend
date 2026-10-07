#!/usr/bin/env node
/**
 * Vérifie que toutes les dépendances de package.json sont installées.
 * Lancé avant le serveur de développement : après un `git pull` qui ajoute une
 * bibliothèque, on obtient un message clair au lieu d'erreurs « Cannot find module ».
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const wanted = { ...pkg.dependencies, ...pkg.devDependencies };

const missing = Object.keys(wanted).filter((name) => !fs.existsSync(path.join(root, 'node_modules', name, 'package.json')));

if (missing.length) {
  console.error('\n\x1b[31m✖ Dépendances manquantes :\x1b[0m ' + missing.join(', '));
  console.error('  Le projet a reçu de nouvelles bibliothèques (git pull). Lancez :\n');
  console.error('    \x1b[1mnpm install\x1b[0m\n');
  process.exit(1);
}
