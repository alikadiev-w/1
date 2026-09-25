import { access, readFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';

const required = [
  'index.html',
  'css/style.css',
  'js/main.js',
  'js/assets.js',
  'js/materials.js',
  'js/xanthippe.js',
  'public/.nojekyll',
  'public/assets/models/xanthippe/xanthippe.glb',
  'public/assets/models/xanthippe/textures/body.jpg',
  'public/assets/models/xanthippe/textures/head.jpg',
  'public/assets/models/xanthippe/textures/eyes.jpg',
  'public/assets/models/xanthippe/textures/underwear.jpg',
  'public/assets/models/xanthippe/textures/shoes.jpg',
  'public/assets/models/xanthippe/textures/hair_1.jpg',
  'public/assets/models/xanthippe/textures/hair_1_alpha.jpg',
  'public/assets/models/xanthippe/textures/hair_2.jpg',
  'public/assets/models/xanthippe/textures/hair_2_alpha.jpg',
  'public/assets/models/xanthippe/textures/hair_3.jpg',
  'public/assets/models/xanthippe/textures/hair_3_alpha.jpg',
  'public/assets/textures/floor_stone_diffuse.jpg',
  'public/assets/textures/floor_stone_normal.jpg',
  'public/assets/textures/floor_stone_roughness.jpg',
  'public/assets/textures/wall_stone_diffuse.jpg',
  'public/assets/textures/wall_stone_normal.jpg',
  'public/assets/textures/wall_stone_roughness.jpg',
  'public/assets/textures/marble_diffuse.jpg',
  'public/assets/textures/marble_normal.jpg',
  'public/assets/textures/marble_roughness.jpg',
  'public/assets/textures/ruin_stone_diffuse.jpg',
  'public/assets/textures/ruin_stone_normal.jpg',
  'public/assets/textures/ruin_stone_roughness.jpg',
  'public/assets/textures/water_normal.jpg',
  'public/assets/textures/decal_blood.png',
  'public/assets/textures/decal_crack.png',
  'public/assets/textures/cloud_soft.png',
  'public/assets/textures/sun_glow.png'
];

const missing = [];
for (const file of required) {
  try { await access(new URL(`../${file}`, import.meta.url), fsConstants.R_OK); }
  catch { missing.push(file); }
}

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const forbidden = ['unpkg.com', 'cdn.jsdelivr.net', 'type="importmap"'];
const runtimeProblems = forbidden.filter(x => index.includes(x));

if (missing.length || runtimeProblems.length) {
  console.error('Project validation failed.');
  if (missing.length) console.error('Missing files:\n' + missing.map(x => `  - ${x}`).join('\n'));
  if (runtimeProblems.length) console.error('Unexpected CDN/import-map references: ' + runtimeProblems.join(', '));
  process.exit(1);
}

console.log(`Project validation OK: ${required.length} required files present.`);
