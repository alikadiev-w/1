import * as THREE from 'three';

const BASE = new URL('../assets/textures/', import.meta.url).href;

function configure(tex, { repeat = [1,1], srgb = false } = {}, renderer) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function loadTexture(loader, renderer, file, options) {
  return new Promise((resolve, reject) => {
    loader.load(
      BASE + file,
      tex => resolve(configure(tex, options, renderer)),
      undefined,
      err => reject(new Error(`Не удалось загрузить текстуру ${file}: ${err?.message || err}`))
    );
  });
}

export async function loadGameTextures(renderer) {
  const loader = new THREE.TextureLoader();
  const specs = {
    floorDiffuse: ['floor_stone_diffuse.jpg', { repeat:[14,14], srgb:true }],
    floorNormal: ['floor_stone_normal.jpg', { repeat:[14,14] }],
    floorRoughness: ['floor_stone_roughness.jpg', { repeat:[14,14] }],

    wallDiffuse: ['wall_stone_diffuse.jpg', { repeat:[6,6], srgb:true }],
    wallNormal: ['wall_stone_normal.jpg', { repeat:[6,6] }],
    wallRoughness: ['wall_stone_roughness.jpg', { repeat:[6,6] }],

    marbleDiffuse: ['marble_diffuse.jpg', { repeat:[2,2], srgb:true }],
    marbleNormal: ['marble_normal.jpg', { repeat:[2,2] }],
    marbleRoughness: ['marble_roughness.jpg', { repeat:[2,2] }],

    ruinDiffuse: ['ruin_stone_diffuse.jpg', { repeat:[5,5], srgb:true }],
    ruinNormal: ['ruin_stone_normal.jpg', { repeat:[5,5] }],
    ruinRoughness: ['ruin_stone_roughness.jpg', { repeat:[5,5] }],

    waterNormal: ['water_normal.jpg', { repeat:[4,4] }],
    decalCrack: ['decal_crack.png', { repeat:[1,1], srgb:true }],
    decalBlood: ['decal_blood.png', { repeat:[1,1], srgb:true }],

    sunGlow: ['sun_glow.png', { repeat:[1,1], srgb:true }],
    cloud: ['cloud_soft.png', { repeat:[1,1], srgb:true }],
    particleBlood: ['particle_blood.png', { repeat:[1,1], srgb:true }],
    particleBlood2: ['particle_blood2.png', { repeat:[1,1], srgb:true }],
    particleSpark: ['particle_spark.png', { repeat:[1,1], srgb:true }],
    particleDust: ['particle_dust.png', { repeat:[1,1], srgb:true }],
    particleStone: ['particle_stone.png', { repeat:[1,1], srgb:true }],
    particleSmoke: ['particle_smoke.png', { repeat:[1,1], srgb:true }],
    particleFire: ['particle_fire.png', { repeat:[1,1], srgb:true }],
    particleGold: ['particle_gold.png', { repeat:[1,1], srgb:true }],
    particleMagic: ['particle_magic.png', { repeat:[1,1], srgb:true }],
    particleGhost: ['particle_ghost.png', { repeat:[1,1], srgb:true }],
  };

  const pairs = await Promise.all(Object.entries(specs).map(async ([key,[file,opts]]) => {
    const tex = await loadTexture(loader, renderer, file, opts);
    return [key, tex];
  }));
  return Object.fromEntries(pairs);
}
