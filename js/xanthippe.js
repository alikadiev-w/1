import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ROOT = new URL('../assets/models/xanthippe/', import.meta.url);
const TEX = new URL('textures/', ROOT);
const TARGET_HEIGHT = 2.65;

function tex(loader, file, { alpha=false } = {}) {
  const t = loader.load(new URL(file, TEX).href);
  if (!alpha) t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  t.anisotropy = 8;
  return t;
}

function buildMaterials(loader) {
  const maps = {
    shoes: tex(loader, 'shoes.jpg'),
    eyes: tex(loader, 'eyes.jpg'),
    underwear: tex(loader, 'underwear.jpg'),
    head: tex(loader, 'head.jpg'),
    body: tex(loader, 'body.jpg'),
    hair1: tex(loader, 'hair_1.jpg'), hair1a: tex(loader, 'hair_1_alpha.jpg', { alpha:true }),
    hair2: tex(loader, 'hair_2.jpg'), hair2a: tex(loader, 'hair_2_alpha.jpg', { alpha:true }),
    hair3: tex(loader, 'hair_3.jpg'), hair3a: tex(loader, 'hair_3_alpha.jpg', { alpha:true }),
  };

  const cache = new Map();
  return function remap(old) {
    if (!old) return new THREE.MeshStandardMaterial({ color:0xd8b09e, roughness:0.68 });
    if (cache.has(old)) return cache.get(old);
    const name = old.name || '';
    let m;
    if (name === 'Mtl_eye_cornea') {
      m = new THREE.MeshPhysicalMaterial({
        color:0xffffff, transparent:true, opacity:0.20,
        roughness:0.04, transmission:0.12, depthWrite:false,
        side:THREE.DoubleSide
      });
    } else if (name === 'Mtl_eyeiris' || name === 'Mtl_eye_bottom') {
      m = new THREE.MeshStandardMaterial({ map:maps.eyes, roughness:0.38, metalness:0 });
    } else {
      const idx = Number((name.match(/^(\d+)/) || [])[1] || -1);
      let map = maps.body, alphaMap = null, transparent = false;
      let alphaTest = 0, side = THREE.FrontSide, roughness = 0.68;

      // Material IDs as they are stored in the supplied MAX -> GLB export.
      if (idx === 10) map = maps.body;
      else if (idx === 9) map = maps.head;
      else if (idx === 2) { map = maps.underwear; roughness = 0.56; }
      else if (idx === 4) { map = maps.shoes; roughness = 0.48; }
      else if (idx === 11) { map = maps.hair1; alphaMap = maps.hair1a; transparent = true; alphaTest = 0.18; side = THREE.DoubleSide; roughness = 0.74; }
      else if (idx === 12) { map = maps.hair2; alphaMap = maps.hair2a; transparent = true; alphaTest = 0.18; side = THREE.DoubleSide; roughness = 0.74; }
      else if (idx === 13) { map = maps.hair3; alphaMap = maps.hair3a; transparent = true; alphaTest = 0.18; side = THREE.DoubleSide; roughness = 0.74; }
      else if (idx === 16) { map = maps.head; roughness = 0.58; }

      m = new THREE.MeshStandardMaterial({
        map, alphaMap, transparent, alphaTest, side,
        roughness, metalness:0,
      });
    }
    m.name = `Xanthippe_${name}`;
    cache.set(old, m);
    return m;
  };
}

function flattenModel(raw, remapMaterial) {
  raw.updateMatrixWorld(true);
  const rootInv = raw.matrixWorld.clone().invert();
  const flat = [];

  raw.traverse(o => {
    if (!o.isMesh || !o.geometry) return;
    const geom = o.geometry.clone();
    const toRoot = new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld);
    geom.applyMatrix4(toRoot);
    const mats = Array.isArray(o.material)
      ? o.material.map(remapMaterial)
      : remapMaterial(o.material);
    flat.push({ name:o.name || '', geometry:geom, material:mats });
  });
  return flat;
}

function boundsOf(flat) {
  const box = new THREE.Box3();
  for (const part of flat) {
    part.geometry.computeBoundingBox();
    box.union(part.geometry.boundingBox);
  }
  return box;
}

function centerAndGround(flat, box) {
  const center = box.getCenter(new THREE.Vector3());
  const offset = new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z);
  for (const part of flat) {
    part.geometry.applyMatrix4(offset);
    part.geometry.computeBoundingBox();
    part.geometry.computeBoundingSphere();
  }
  return boundsOf(flat);
}

function makeRig(bounds) {
  const h = bounds.max.y - bounds.min.y;
  const halfW = Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x));

  const root = new THREE.Bone(); root.name = 'X_Root';
  const hips = new THREE.Bone(); hips.name = 'X_Hips'; hips.position.set(0, h*0.48, 0); root.add(hips);
  const spine = new THREE.Bone(); spine.name = 'X_Spine'; spine.position.set(0, h*0.11, 0); hips.add(spine);
  const chest = new THREE.Bone(); chest.name = 'X_Chest'; chest.position.set(0, h*0.13, 0); spine.add(chest);
  const neck = new THREE.Bone(); neck.name = 'X_Neck'; neck.position.set(0, h*0.10, 0); chest.add(neck);
  const head = new THREE.Bone(); head.name = 'X_Head'; head.position.set(0, h*0.075, 0); neck.add(head);

  const shoulderX = halfW*0.18;
  const elbowX = halfW*0.56;
  const wristX = halfW*0.86;

  const armP = new THREE.Bone(); armP.name = 'X_Arm_P'; armP.position.set( shoulderX, h*0.04, 0); chest.add(armP);
  const foreP = new THREE.Bone(); foreP.name = 'X_Forearm_P'; foreP.position.set(elbowX-shoulderX, 0, 0); armP.add(foreP);
  const handP = new THREE.Bone(); handP.name = 'X_Hand_P'; handP.position.set(wristX-elbowX, 0, 0); foreP.add(handP);

  const armN = new THREE.Bone(); armN.name = 'X_Arm_N'; armN.position.set(-shoulderX, h*0.04, 0); chest.add(armN);
  const foreN = new THREE.Bone(); foreN.name = 'X_Forearm_N'; foreN.position.set(-(elbowX-shoulderX), 0, 0); armN.add(foreN);
  const handN = new THREE.Bone(); handN.name = 'X_Hand_N'; handN.position.set(-(wristX-elbowX), 0, 0); foreN.add(handN);

  const hipX = halfW*0.085;
  const kneeY = h*0.25;
  const ankleY = h*0.07;
  const pelvisY = h*0.48;

  const thighP = new THREE.Bone(); thighP.name = 'X_Thigh_P'; thighP.position.set( hipX, -h*0.01, 0); hips.add(thighP);
  const shinP = new THREE.Bone(); shinP.name = 'X_Shin_P'; shinP.position.set(0, -(pelvisY-kneeY), 0); thighP.add(shinP);
  const footP = new THREE.Bone(); footP.name = 'X_Foot_P'; footP.position.set(0, -(kneeY-ankleY), 0); shinP.add(footP);

  const thighN = new THREE.Bone(); thighN.name = 'X_Thigh_N'; thighN.position.set(-hipX, -h*0.01, 0); hips.add(thighN);
  const shinN = new THREE.Bone(); shinN.name = 'X_Shin_N'; shinN.position.set(0, -(pelvisY-kneeY), 0); thighN.add(shinN);
  const footN = new THREE.Bone(); footN.name = 'X_Foot_N'; footN.position.set(0, -(kneeY-ankleY), 0); shinN.add(footN);

  const bones = [
    root, hips, spine, chest, neck, head,
    armP, foreP, handP, armN, foreN, handN,
    thighP, shinP, footP, thighN, shinN, footN
  ];
  const byName = Object.fromEntries(bones.map(b => [b.name, b]));
  return { root, bones, byName, h, halfW, shoulderX, elbowX, wristX, kneeY, ankleY, pelvisY };
}

function setWeights(geometry, rig, tag='') {
  const p = geometry.getAttribute('position');
  const idx = new Uint16Array(p.count*4);
  const w = new Float32Array(p.count*4);
  const h = rig.h, halfW = rig.halfW;
  const shoulderX = rig.shoulderX, elbowX = rig.elbowX, wristX = rig.wristX;

  const B = {
    root:0, hips:1, spine:2, chest:3, neck:4, head:5,
    armP:6, foreP:7, handP:8, armN:9, foreN:10, handN:11,
    thighP:12, shinP:13, footP:14, thighN:15, shinN:16, footN:17
  };
  const isHeadPart = /(^|_)02$|(^|_)05$|(^|_)06$|eye/i.test(tag);
  const isShoePart = /(^|_)01$/i.test(tag);

  function one(i, b) {
    const o=i*4; idx[o]=b; w[o]=1;
  }
  function two(i, b0, w0, b1, w1) {
    const o=i*4; const s=w0+w1 || 1;
    idx[o]=b0; w[o]=w0/s; idx[o+1]=b1; w[o+1]=w1/s;
  }

  for (let i=0;i<p.count;i++) {
    const x=p.getX(i), y=p.getY(i), ax=Math.abs(x);
    const positive = x >= 0;
    if (isHeadPart) { one(i,B.head); continue; }
    if (isShoePart) { one(i, positive ? B.footP : B.footN); continue; }

    // Head and neck.
    if (y > h*0.84 && ax < halfW*0.30) {
      const t = THREE.MathUtils.clamp((y-h*0.84)/(h*0.08),0,1);
      two(i,B.neck,1-t,B.head,t); continue;
    }

    // T-pose arms. The supplied body mesh extends horizontally along X.
    if (y > h*0.59 && ax > shoulderX*0.78) {
      const a = positive ? [B.armP,B.foreP,B.handP] : [B.armN,B.foreN,B.handN];
      if (ax < elbowX) {
        const t=THREE.MathUtils.clamp((ax-shoulderX)/(elbowX-shoulderX),0,1);
        two(i,a[0],1-t,a[1],t);
      } else if (ax < wristX) {
        const t=THREE.MathUtils.clamp((ax-elbowX)/(wristX-elbowX),0,1);
        two(i,a[1],1-t,a[2],t);
      } else one(i,a[2]);
      continue;
    }

    // Legs.
    if (y < h*0.49) {
      const thigh = positive ? B.thighP : B.thighN;
      const shin = positive ? B.shinP : B.shinN;
      const foot = positive ? B.footP : B.footN;
      if (y > h*0.26) {
        const t=THREE.MathUtils.clamp((h*0.49-y)/(h*0.23),0,1);
        two(i,B.hips,1-t,thigh,t);
      } else if (y > h*0.075) {
        const t=THREE.MathUtils.clamp((h*0.26-y)/(h*0.185),0,1);
        two(i,thigh,1-t,shin,t);
      } else {
        const t=THREE.MathUtils.clamp((h*0.075-y)/(h*0.075),0,1);
        two(i,shin,1-t,foot,t);
      }
      continue;
    }

    // Torso blend.
    const u=y/h;
    if (u < 0.57) two(i,B.hips,(0.57-u)/0.09,B.spine,(u-0.48)/0.09);
    else if (u < 0.70) two(i,B.spine,(0.70-u)/0.13,B.chest,(u-0.57)/0.13);
    else if (u < 0.82) two(i,B.chest,(0.82-u)/0.12,B.neck,(u-0.70)/0.12);
    else two(i,B.neck,0.7,B.head,0.3);
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx,4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w,4));
}

function buildSkinnedModel(flat, bounds) {
  const model = new THREE.Group();
  model.name = 'Xanthippe_AutoRig';
  const rig = makeRig(bounds);
  model.add(rig.root);
  const skinned = [];

  for (const part of flat) {
    setWeights(part.geometry, rig, part.name);
    const mesh = new THREE.SkinnedMesh(part.geometry, part.material);
    mesh.name = part.name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    model.add(mesh);
    skinned.push(mesh);
  }

  model.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(rig.bones);
  skeleton.calculateInverses();
  for (const mesh of skinned) mesh.bind(skeleton, new THREE.Matrix4());

  rig.skeleton = skeleton;
  rig.base = rig.bones.map(b => ({ p:b.position.clone(), q:b.quaternion.clone() }));
  model.userData.xanthippeRig = rig;
  model.userData.xanthippeModel = true;
  model.userData.modelRoot = model;
  return model;
}

function resetRig(rig) {
  for (let i=0;i<rig.bones.length;i++) {
    rig.bones[i].position.copy(rig.base[i].p);
    rig.bones[i].quaternion.copy(rig.base[i].q);
  }
}

const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();
const AX = new THREE.Vector3(1,0,0);
const AY = new THREE.Vector3(0,1,0);
const AZ = new THREE.Vector3(0,0,1);

function armPose(bone, positiveSide, downAngle, swing=0, twist=0) {
  _qA.setFromAxisAngle(AZ, positiveSide ? -downAngle : downAngle);
  _qB.setFromAxisAngle(AX, swing);
  bone.quaternion.copy(_qB).multiply(_qA);
  if (twist) {
    _qB.setFromAxisAngle(AY, twist);
    bone.quaternion.multiply(_qB);
  }
}

function bendX(bone, angle) { bone.rotation.x += angle; }

export function updateXanthippeAnimation(model, opts={}) {
  const rig = model?.userData?.xanthippeRig;
  if (!rig) return false;
  resetRig(rig);
  const b=rig.byName;
  const t=opts.time || 0;
  const state=opts.state || 'idle';
  const speed=Math.max(0, opts.speedNorm || 0);
  const panic=!!opts.panic;
  const amount=opts.amount == null ? 1 : opts.amount;

  // Natural base pose: lower the T-pose arms to her sides.
  armPose(b.X_Arm_P, true, 1.32, 0);
  armPose(b.X_Arm_N, false, 1.32, 0);
  b.X_Forearm_P.rotation.z = -0.12;
  b.X_Forearm_N.rotation.z = 0.12;

  if (state === 'trip' || state === 'fall') {
    armPose(b.X_Arm_P,true,0.75,-0.85*amount);
    armPose(b.X_Arm_N,false,0.75,-0.65*amount);
    bendX(b.X_Thigh_P, -0.65*amount); bendX(b.X_Thigh_N,-0.9*amount);
    bendX(b.X_Shin_P, 1.05*amount); bendX(b.X_Shin_N,0.75*amount);
    b.X_Head.rotation.z = Math.sin(t*11)*0.08*amount;
    b.X_Chest.rotation.x = -0.15*amount;
    return true;
  }

  if (state === 'trick') {
    armPose(b.X_Arm_P,true,0.35,-0.25);
    armPose(b.X_Arm_N,false,0.35,0.25);
    bendX(b.X_Thigh_P, 0.9); bendX(b.X_Thigh_N,0.9);
    bendX(b.X_Shin_P,-1.25); bendX(b.X_Shin_N,-1.25);
    b.X_Chest.rotation.x = 0.12;
    return true;
  }

  if (state === 'flee' || panic) {
    const ph=t*(10.5+speed*1.8), s=Math.sin(ph), c=Math.sin(ph+Math.PI);
    // Arms up while panicking, with a little flailing.
    armPose(b.X_Arm_P,true,-0.88,0.25+s*0.28);
    armPose(b.X_Arm_N,false,-0.88,-0.15+c*0.28);
    b.X_Forearm_P.rotation.z = -0.45+Math.sin(ph*1.31)*0.25;
    b.X_Forearm_N.rotation.z = 0.45-Math.sin(ph*1.17)*0.25;
    bendX(b.X_Thigh_P, s*0.82); bendX(b.X_Thigh_N,c*0.82);
    bendX(b.X_Shin_P, Math.max(0,-s)*1.05); bendX(b.X_Shin_N,Math.max(0,-c)*1.05);
    b.X_Chest.rotation.x = -0.16;
    b.X_Head.rotation.y = Math.sin(t*7.4)*0.16;
    b.X_Hips.position.y += Math.abs(Math.sin(ph))*rig.h*0.018;
    return true;
  }

  if (speed > 0.12) {
    const run=THREE.MathUtils.clamp((speed-0.9)/1.0,0,1);
    const freq=6.1+speed*2.7;
    const ph=t*freq, s=Math.sin(ph), c=-s;
    const legAmp=THREE.MathUtils.lerp(0.42,0.78,run);
    const armAmp=THREE.MathUtils.lerp(0.32,0.62,run);
    armPose(b.X_Arm_P,true,1.32,c*armAmp);
    armPose(b.X_Arm_N,false,1.32,s*armAmp);
    bendX(b.X_Thigh_P,s*legAmp); bendX(b.X_Thigh_N,c*legAmp);
    bendX(b.X_Shin_P,Math.max(0,-s)*THREE.MathUtils.lerp(0.55,1.0,run));
    bendX(b.X_Shin_N,Math.max(0,-c)*THREE.MathUtils.lerp(0.55,1.0,run));
    bendX(b.X_Foot_P,-Math.max(0,s)*0.18); bendX(b.X_Foot_N,-Math.max(0,c)*0.18);
    b.X_Chest.rotation.x = -0.04-run*0.10;
    b.X_Chest.rotation.z = Math.sin(ph*0.5)*0.025;
    b.X_Hips.position.y += Math.abs(Math.sin(ph))*rig.h*(0.008+run*0.008);
    b.X_Head.rotation.y = Math.sin(ph*0.5)*0.035;
    return true;
  }

  // Idle breathing and tiny weight shifts.
  const breathe=Math.sin(t*1.8);
  b.X_Chest.rotation.x = breathe*0.018;
  b.X_Chest.position.y += breathe*rig.h*0.003;
  b.X_Head.rotation.y = Math.sin(t*0.73)*0.055;
  b.X_Head.rotation.z = Math.sin(t*0.51)*0.018;
  b.X_Hips.rotation.z = Math.sin(t*0.48)*0.018;
  armPose(b.X_Arm_P,true,1.32,Math.sin(t*0.9)*0.025);
  armPose(b.X_Arm_N,false,1.32,-Math.sin(t*0.9)*0.025);
  return true;
}

export async function loadXanthippeModel() {
  const tl = new THREE.TextureLoader();
  const remapMaterial = buildMaterials(tl);
  const gltf = await new GLTFLoader().loadAsync(new URL('xanthippe.glb', ROOT).href);
  const raw = gltf.scene;

  // Bake the export's nested MAX transforms to a clean Y-up coordinate space.
  const flat = flattenModel(raw, remapMaterial);
  if (!flat.length) throw new Error('Xanthippe GLB contains no renderable meshes');
  let box = boundsOf(flat);
  box = centerAndGround(flat, box);
  const h = box.max.y - box.min.y;
  if (!(h > 0)) throw new Error('Invalid Xanthippe model bounds');

  const rigged = buildSkinnedModel(flat, box);
  const wrapper = new THREE.Group();
  wrapper.name = 'Xanthippe';
  const scale = TARGET_HEIGHT / h;
  rigged.scale.setScalar(scale);
  wrapper.add(rigged);

  wrapper.userData.xanthippeModel = true;
  wrapper.userData.xanthippeRig = rigged.userData.xanthippeRig;
  wrapper.userData.rigRoot = rigged;
  wrapper.userData.sourceAnimations = gltf.animations?.length || 0;
  wrapper.userData.autoRigged = true;

  updateXanthippeAnimation(wrapper, { state:'idle', time:0, speedNorm:0 });
  return wrapper;
}
