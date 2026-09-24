import * as THREE from 'three';

export function createWorldMaterials(t) {
  const floorMat = new THREE.MeshStandardMaterial({
    map:t.floorDiffuse,
    normalMap:t.floorNormal,
    roughnessMap:t.floorRoughness,
    normalScale:new THREE.Vector2(0.55,0.55),
    roughness:0.95,
    metalness:0.0
  });

  const wallMat = new THREE.MeshStandardMaterial({
    map:t.wallDiffuse,
    normalMap:t.wallNormal,
    roughnessMap:t.wallRoughness,
    normalScale:new THREE.Vector2(0.62,0.62),
    roughness:0.94,
    metalness:0.0
  });

  const colMat = new THREE.MeshStandardMaterial({
    map:t.marbleDiffuse,
    normalMap:t.marbleNormal,
    roughnessMap:t.marbleRoughness,
    normalScale:new THREE.Vector2(0.25,0.25),
    roughness:0.58,
    metalness:0.0
  });

  const blockMat = new THREE.MeshStandardMaterial({
    map:t.wallDiffuse,
    normalMap:t.wallNormal,
    roughnessMap:t.wallRoughness,
    normalScale:new THREE.Vector2(0.5,0.5),
    roughness:0.92
  });

  const marbleMat = new THREE.MeshStandardMaterial({
    color:0xe2d5b7,
    map:t.marbleDiffuse,
    normalMap:t.marbleNormal,
    roughnessMap:t.marbleRoughness,
    normalScale:new THREE.Vector2(0.22,0.22),
    roughness:0.54,
    metalness:0.0
  });

  const darkMarbleMat = new THREE.MeshStandardMaterial({
    color:0x82745e,
    map:t.marbleDiffuse,
    normalMap:t.marbleNormal,
    roughnessMap:t.marbleRoughness,
    normalScale:new THREE.Vector2(0.25,0.25),
    roughness:0.64,
    metalness:0.0
  });

  const stoneMat = new THREE.MeshStandardMaterial({
    color:0x766b5d,
    map:t.ruinDiffuse,
    normalMap:t.ruinNormal,
    roughnessMap:t.ruinRoughness,
    normalScale:new THREE.Vector2(0.6,0.6),
    roughness:0.98
  });

  const goldMat = new THREE.MeshStandardMaterial({
    color:0xd7ac51,
    metalness:0.88,
    roughness:0.25,
    emissive:0x2a1300,
    emissiveIntensity:0.18
  });

  const bronzeMat = new THREE.MeshStandardMaterial({
    color:0x986436,
    metalness:0.76,
    roughness:0.36
  });

  const ruinMat = new THREE.MeshStandardMaterial({
    color:0x62594f,
    map:t.ruinDiffuse,
    normalMap:t.ruinNormal,
    roughnessMap:t.ruinRoughness,
    normalScale:new THREE.Vector2(0.72,0.72),
    roughness:1.0
  });

  const ruinDarkMat = new THREE.MeshStandardMaterial({
    color:0x302a25,
    map:t.ruinDiffuse,
    normalMap:t.ruinNormal,
    roughnessMap:t.ruinRoughness,
    normalScale:new THREE.Vector2(0.65,0.65),
    roughness:1.0
  });

  return { floorMat, wallMat, colMat, blockMat, marbleMat, darkMarbleMat, stoneMat, goldMat, bronzeMat, ruinMat, ruinDarkMat };
}
