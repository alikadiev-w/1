import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ROOT = new URL('./assets/models/xanthippe/', document.baseURI);
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
      else if (idx === 11) { map = maps.hair1; alphaMap = maps.hair1a; transparent = false; alphaTest = 0.28; side = THREE.DoubleSide; roughness = 0.72; }
      else if (idx === 12) { map = maps.hair2; alphaMap = maps.hair2a; transparent = false; alphaTest = 0.28; side = THREE.DoubleSide; roughness = 0.72; }
      else if (idx === 13) { map = maps.hair3; alphaMap = maps.hair3a; transparent = false; alphaTest = 0.28; side = THREE.DoubleSide; roughness = 0.72; }
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
  const spine = new THREE.Bone(); spine.name = 'X_Spine'; spine.position.set(0, h*0.105, 0); hips.add(spine);
  const chest = new THREE.Bone(); chest.name = 'X_Chest'; chest.position.set(0, h*0.135, 0); spine.add(chest);
  const neck = new THREE.Bone(); neck.name = 'X_Neck'; neck.position.set(0, h*0.095, 0); chest.add(neck);
  const head = new THREE.Bone(); head.name = 'X_Head'; head.position.set(0, h*0.075, 0); neck.add(head);

  // A small secondary bone for the supplied hair cards. The source GLB has no
  // skin, so this lets the hair lag behind the head instead of looking glued on.
  const hair = new THREE.Bone(); hair.name = 'X_Hair'; hair.position.set(0, h*0.005, -h*0.008); head.add(hair);

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
  const kneeY = h*0.255;
  const ankleY = h*0.065;
  const pelvisY = h*0.48;

  const thighP = new THREE.Bone(); thighP.name = 'X_Thigh_P'; thighP.position.set( hipX, -h*0.012, 0); hips.add(thighP);
  const shinP = new THREE.Bone(); shinP.name = 'X_Shin_P'; shinP.position.set(0, -(pelvisY-kneeY), 0); thighP.add(shinP);
  const footP = new THREE.Bone(); footP.name = 'X_Foot_P'; footP.position.set(0, -(kneeY-ankleY), 0); shinP.add(footP);

  const thighN = new THREE.Bone(); thighN.name = 'X_Thigh_N'; thighN.position.set(-hipX, -h*0.012, 0); hips.add(thighN);
  const shinN = new THREE.Bone(); shinN.name = 'X_Shin_N'; shinN.position.set(0, -(pelvisY-kneeY), 0); thighN.add(shinN);
  const footN = new THREE.Bone(); footN.name = 'X_Foot_N'; footN.position.set(0, -(kneeY-ankleY), 0); shinN.add(footN);

  // Keep the first 18 indices stable; X_Hair is appended as index 18.
  const bones = [
    root, hips, spine, chest, neck, head,
    armP, foreP, handP, armN, foreN, handN,
    thighP, shinP, footP, thighN, shinN, footN,
    hair
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
    thighP:12, shinP:13, footP:14, thighN:15, shinN:16, footN:17,
    hair:18
  };

  // Actual mesh groups in the supplied MAX -> GLB export:
  // _02 = three hair materials, _06 = extra hair card, _05 = small face part,
  // _01 = shoes, eye_* = eye meshes, _04 = body/head, _03 = underwear.
  const isHairPart = /^_02(?:_|$)|^_06(?:_|$)/i.test(tag);
  const isHeadPart = /^_05(?:_|$)|^eye/i.test(tag);
  const isShoePart = /^_01(?:_|$)/i.test(tag);

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

    if (isHairPart) { one(i,B.hair); continue; }
    if (isHeadPart) { one(i,B.head); continue; }
    if (isShoePart) { one(i, positive ? B.footP : B.footN); continue; }

    // Head / jaw / neck in the body mesh.
    if (y > h*0.845 && ax < halfW*0.31) {
      const t = THREE.MathUtils.smoothstep(y, h*0.845, h*0.91);
      two(i,B.neck,1-t,B.head,t); continue;
    }

    // T-pose arms. Blend through shoulder, elbow and wrist to soften joints.
    if (y > h*0.585 && ax > shoulderX*0.72) {
      const a = positive ? [B.armP,B.foreP,B.handP] : [B.armN,B.foreN,B.handN];
      const shoulderBlend = h*0.018;
      const elbowBlend = Math.max(h*0.02, (elbowX-shoulderX)*0.16);
      const wristBlend = Math.max(h*0.018, (wristX-elbowX)*0.18);
      if (ax < shoulderX+shoulderBlend) {
        const t=THREE.MathUtils.smoothstep(ax, shoulderX-shoulderBlend, shoulderX+shoulderBlend);
        two(i,B.chest,1-t,a[0],t);
      } else if (ax < elbowX) {
        const t=THREE.MathUtils.smoothstep(ax, elbowX-elbowBlend, elbowX+elbowBlend);
        if (ax < elbowX-elbowBlend) one(i,a[0]); else two(i,a[0],1-t,a[1],t);
      } else if (ax < wristX) {
        const t=THREE.MathUtils.smoothstep(ax, wristX-wristBlend, wristX+wristBlend);
        if (ax < wristX-wristBlend) one(i,a[1]); else two(i,a[1],1-t,a[2],t);
      } else one(i,a[2]);
      continue;
    }

    // Legs: soften hip and knee zones, keep shoes on the feet.
    if (y < h*0.495) {
      const thigh = positive ? B.thighP : B.thighN;
      const shin = positive ? B.shinP : B.shinN;
      const foot = positive ? B.footP : B.footN;
      if (y > h*0.275) {
        const t=THREE.MathUtils.smoothstep(h*0.495-y, 0, h*0.22);
        two(i,B.hips,1-t,thigh,t);
      } else if (y > h*0.08) {
        const t=THREE.MathUtils.smoothstep(h*0.275-y, 0, h*0.195);
        two(i,thigh,1-t,shin,t);
      } else {
        const t=THREE.MathUtils.smoothstep(h*0.08-y, 0, h*0.08);
        two(i,shin,1-t,foot,t);
      }
      continue;
    }

    // Torso blend. This keeps the waist from shearing when hips/chest counter-rotate.
    const u=y/h;
    if (u < 0.57) {
      const t=THREE.MathUtils.smoothstep(u,0.48,0.57); two(i,B.hips,1-t,B.spine,t);
    } else if (u < 0.705) {
      const t=THREE.MathUtils.smoothstep(u,0.57,0.705); two(i,B.spine,1-t,B.chest,t);
    } else if (u < 0.825) {
      const t=THREE.MathUtils.smoothstep(u,0.705,0.825); two(i,B.chest,1-t,B.neck,t);
    } else {
      const t=THREE.MathUtils.smoothstep(u,0.825,0.89); two(i,B.neck,1-t,B.head,t);
    }
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
    // Animated vertices can leave the static bind-pose bounds; avoid pop-out culling.
    mesh.frustumCulled = false;
    mesh.normalizeSkinWeights();
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

function capturePose(rig) {
  if (!rig._prevP || rig._prevP.length !== rig.bones.length) {
    rig._prevP = rig.bones.map(b=>b.position.clone());
    rig._prevQ = rig.bones.map(b=>b.quaternion.clone());
    rig._targetP = rig.bones.map(b=>b.position.clone());
    rig._targetQ = rig.bones.map(b=>b.quaternion.clone());
  }
  for (let i=0;i<rig.bones.length;i++) {
    rig._prevP[i].copy(rig.bones[i].position);
    rig._prevQ[i].copy(rig.bones[i].quaternion);
  }
}

function smoothPose(rig, t, state) {
  if (!rig._anim) rig._anim = { lastT:t, initialized:false };
  const a=rig._anim;
  const dt=THREE.MathUtils.clamp(t-a.lastT, 0, 0.05);
  a.lastT=t;

  for (let i=0;i<rig.bones.length;i++) {
    rig._targetP[i].copy(rig.bones[i].position);
    rig._targetQ[i].copy(rig.bones[i].quaternion);
  }

  if (!a.initialized || dt <= 0) {
    a.initialized=true;
    return;
  }

  const rate = (state==='trip'||state==='fall'||state==='trick') ? 24 : (state==='flee' ? 18 : 12);
  const k = 1-Math.exp(-rate*dt);
  for (let i=0;i<rig.bones.length;i++) {
    rig.bones[i].position.copy(rig._prevP[i]).lerp(rig._targetP[i],k);
    rig.bones[i].quaternion.copy(rig._prevQ[i]).slerp(rig._targetQ[i],k);
  }
}

export function updateXanthippeAnimation(model, opts={}) {
  const rig = model?.userData?.xanthippeRig;
  if (!rig) return false;

  const t=opts.time || 0;
  const state=opts.state || 'idle';
  const speed=Math.max(0, opts.speedNorm || 0);
  const panic=!!opts.panic;
  const amount=opts.amount == null ? 1 : opts.amount;

  capturePose(rig);
  resetRig(rig);
  const b=rig.byName;

  // Natural asymmetrical base stance rather than the source T-pose.
  armPose(b.X_Arm_P, true, 1.34, -0.035, 0.03);
  armPose(b.X_Arm_N, false, 1.34, 0.025, -0.025);
  b.X_Forearm_P.rotation.z = -0.16;
  b.X_Forearm_N.rotation.z = 0.13;
  b.X_Hand_P.rotation.y = 0.06;
  b.X_Hand_N.rotation.y = -0.05;
  b.X_Thigh_P.rotation.z = -0.012;
  b.X_Thigh_N.rotation.z = 0.012;

  if (state === 'trip' || state === 'fall') {
    const a=THREE.MathUtils.clamp(amount,0,1);
    armPose(b.X_Arm_P,true,0.70,-0.95*a,0.1);
    armPose(b.X_Arm_N,false,0.82,-0.55*a,-0.08);
    b.X_Forearm_P.rotation.z = -0.55*a;
    b.X_Forearm_N.rotation.z = 0.36*a;
    bendX(b.X_Thigh_P, -0.58*a); bendX(b.X_Thigh_N,-0.92*a);
    bendX(b.X_Shin_P, 1.08*a); bendX(b.X_Shin_N,0.72*a);
    bendX(b.X_Foot_P,-0.28*a); bendX(b.X_Foot_N,-0.12*a);
    b.X_Hips.rotation.z = -0.10*a;
    b.X_Chest.rotation.x = -0.22*a;
    b.X_Chest.rotation.z = 0.10*a;
    b.X_Head.rotation.z = Math.sin(t*11)*0.07*a - 0.08*a;
    b.X_Hair.rotation.x = 0.20*a + Math.sin(t*7)*0.04*a;
  } else if (state === 'trick') {
    armPose(b.X_Arm_P,true,0.32,-0.30,0.08);
    armPose(b.X_Arm_N,false,0.32,0.30,-0.08);
    bendX(b.X_Thigh_P,0.95); bendX(b.X_Thigh_N,0.95);
    bendX(b.X_Shin_P,-1.28); bendX(b.X_Shin_N,-1.28);
    bendX(b.X_Foot_P,0.35); bendX(b.X_Foot_N,0.35);
    b.X_Chest.rotation.x = 0.14;
    b.X_Hair.rotation.x = -0.28;
  } else if (state === 'flee') {
    const ph=t*(10.4+speed*1.7), s=Math.sin(ph), c=-s;
    armPose(b.X_Arm_P,true,-0.82,0.34+s*0.31,0.10);
    armPose(b.X_Arm_N,false,-0.82,-0.22+c*0.31,-0.10);
    b.X_Forearm_P.rotation.z = -0.58+Math.sin(ph*1.31)*0.23;
    b.X_Forearm_N.rotation.z = 0.58-Math.sin(ph*1.17)*0.23;
    bendX(b.X_Thigh_P,s*0.86); bendX(b.X_Thigh_N,c*0.86);
    bendX(b.X_Shin_P,Math.max(0,-s)*1.08); bendX(b.X_Shin_N,Math.max(0,-c)*1.08);
    bendX(b.X_Foot_P,-s*0.16); bendX(b.X_Foot_N,-c*0.16);
    b.X_Hips.rotation.y = s*0.075;
    b.X_Hips.rotation.z = Math.sin(ph*0.5)*0.035;
    b.X_Chest.rotation.y = -s*0.065;
    b.X_Chest.rotation.x = -0.18;
    b.X_Head.rotation.y = Math.sin(t*7.4)*0.20;
    b.X_Head.rotation.z = Math.sin(t*5.2)*0.035;
    b.X_Hips.position.y += Math.abs(Math.sin(ph))*rig.h*0.020;
    b.X_Hair.rotation.x = 0.16 + Math.sin(ph-0.8)*0.08;
    b.X_Hair.rotation.z = -Math.sin(ph*0.5)*0.035;
  } else if (state === 'nervous') {
    const ph=t*(7.0+speed*1.2), s=Math.sin(ph), c=-s;
    armPose(b.X_Arm_P,true,1.03,c*0.22,0.04);
    armPose(b.X_Arm_N,false,1.03,s*0.22,-0.04);
    b.X_Forearm_P.rotation.z=-0.42;
    b.X_Forearm_N.rotation.z=0.42;
    bendX(b.X_Thigh_P,s*0.48); bendX(b.X_Thigh_N,c*0.48);
    bendX(b.X_Shin_P,Math.max(0,-s)*0.62); bendX(b.X_Shin_N,Math.max(0,-c)*0.62);
    b.X_Chest.rotation.x=-0.08;
    b.X_Head.rotation.y=Math.sin(t*3.8)*0.16;
    b.X_Hips.rotation.y=s*0.035;
    b.X_Hair.rotation.x=0.05+Math.sin(ph-0.5)*0.035;
  } else if (speed > 0.12) {
    const run=THREE.MathUtils.clamp((speed-0.95)/1.05,0,1);
    const freq=THREE.MathUtils.lerp(6.2,9.4,run) + Math.min(speed,2.2)*0.35;
    const ph=t*freq, s=Math.sin(ph), c=-s;
    const legAmp=THREE.MathUtils.lerp(0.43,0.80,run);
    const armAmp=THREE.MathUtils.lerp(0.30,0.58,run);

    armPose(b.X_Arm_P,true,1.34,c*armAmp,0.025);
    armPose(b.X_Arm_N,false,1.34,s*armAmp,-0.025);
    b.X_Forearm_P.rotation.z = -0.15 - Math.max(0,-c)*0.16;
    b.X_Forearm_N.rotation.z = 0.15 + Math.max(0,-s)*0.16;

    bendX(b.X_Thigh_P,s*legAmp); bendX(b.X_Thigh_N,c*legAmp);
    const kneeAmp=THREE.MathUtils.lerp(0.58,1.08,run);
    bendX(b.X_Shin_P,Math.max(0,-s)*kneeAmp);
    bendX(b.X_Shin_N,Math.max(0,-c)*kneeAmp);
    bendX(b.X_Foot_P,THREE.MathUtils.clamp(-s*0.22,-0.20,0.18));
    bendX(b.X_Foot_N,THREE.MathUtils.clamp(-c*0.22,-0.20,0.18));

    // Pelvis leads the stride, shoulders counter-rotate.
    b.X_Hips.rotation.y = s*THREE.MathUtils.lerp(0.045,0.075,run);
    b.X_Hips.rotation.z = Math.sin(ph*0.5)*THREE.MathUtils.lerp(0.018,0.032,run);
    b.X_Spine.rotation.y = -s*0.018;
    b.X_Chest.rotation.y = -s*THREE.MathUtils.lerp(0.04,0.067,run);
    b.X_Chest.rotation.x = -0.025-run*0.105;
    b.X_Chest.rotation.z = -b.X_Hips.rotation.z*0.55;
    b.X_Hips.position.y += Math.abs(Math.sin(ph))*rig.h*(0.006+run*0.009);
    b.X_Hips.position.x += Math.sin(ph*0.5)*rig.h*THREE.MathUtils.lerp(0.0015,0.0028,run);
    b.X_Head.rotation.y = s*0.018 + Math.sin(ph*0.5)*0.018;
    b.X_Head.rotation.z = -b.X_Hips.rotation.z*0.28;

    // Secondary hair motion lags the body motion.
    b.X_Hair.rotation.x = THREE.MathUtils.lerp(0.025,0.10,run) + Math.sin(ph-0.75)*THREE.MathUtils.lerp(0.025,0.065,run);
    b.X_Hair.rotation.z = -Math.sin(ph*0.5)*THREE.MathUtils.lerp(0.012,0.032,run);
  } else {
    // Idle breathing, weight shift and occasional head movement.
    const breathe=Math.sin(t*1.75);
    const shift=Math.sin(t*0.48);
    b.X_Chest.rotation.x = breathe*0.015;
    b.X_Chest.position.y += breathe*rig.h*0.0025;
    b.X_Chest.rotation.y = Math.sin(t*0.31)*0.018;
    b.X_Head.rotation.y = Math.sin(t*0.70)*0.052 + Math.sin(t*0.19)*0.025;
    b.X_Head.rotation.z = Math.sin(t*0.49)*0.016;
    b.X_Hips.rotation.z = shift*0.022;
    b.X_Hips.position.x += shift*rig.h*0.0022;
    bendX(b.X_Thigh_P,Math.max(0,shift)*0.035);
    bendX(b.X_Thigh_N,Math.max(0,-shift)*0.035);
    armPose(b.X_Arm_P,true,1.34,Math.sin(t*0.88)*0.022,0.03);
    armPose(b.X_Arm_N,false,1.34,-Math.sin(t*0.88)*0.022,-0.025);
    b.X_Hair.rotation.x = -breathe*0.008;
    b.X_Hair.rotation.z = -shift*0.010;
  }

  smoothPose(rig,t,state);
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
  wrapper.userData.xanthippeHeight = TARGET_HEIGHT;
  wrapper.userData.rigVersion = 21;

  updateXanthippeAnimation(wrapper, { state:'idle', time:0, speedNorm:0 });
  return wrapper;
}
