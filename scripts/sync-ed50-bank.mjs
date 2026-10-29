#!/usr/bin/env node
// Copies the shared dose-occupancy bank into services/ed50-bank.json.
// The master copy lives in the Psychopharmacology Visualiser repository: it is
// read from a checkout next to this one if there is one, otherwise downloaded.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'services', 'ed50-bank.json');
const sibling = join(root, '..', 'Psychopharmacology_visualiser', 'ed50-bank.json');
const remote = 'https://raw.githubusercontent.com/Trent-Koessler/Psychopharmacology_visualiser/main/ed50-bank.json';

let text;
if (existsSync(sibling)) {
  text = readFileSync(sibling, 'utf8');
  console.log(`Read ${sibling}`);
} else {
  const response = await fetch(remote);
  if (!response.ok) throw new Error(`Could not download ${remote}: ${response.status}`);
  text = await response.text();
  console.log(`Downloaded ${remote}`);
}
JSON.parse(text); // refuse to write anything that is not valid JSON
writeFileSync(target, text);
console.log(`Wrote ${target}`);
