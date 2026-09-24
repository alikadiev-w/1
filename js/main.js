import * as THREE from 'three';
import { loadGameTextures } from './assets.js';
import { createWorldMaterials } from './materials.js';
import { loadXanthippeModel, updateXanthippeAnimation } from './xanthippe.js';
window.addEventListener('error', e => console.error('[ERR]', e.message, e.filename, e.lineno));
window.addEventListener('unhandledrejection', e => console.error('[PROMISE]', e.reason));

const rand = (a,b) => a + Math.random()*(b-a);
const clamp = (v,a,b) => v<a?a:v>b?b:v;
const lerp = (a,b,t) => a+(b-a)*t;
const pick = a => a[Math.floor(Math.random()*a.length)];
const TAU = Math.PI*2;
const $ = id => document.getElementById(id);

/* HIT-STOP + SHAKE + DMG NUMBERS */
let timeScale = 1, hitStopT = 0, shakeT = 0, shakeAmp = 0;
function hitStop(dur) { hitStopT = Math.max(hitStopT, dur); }
function shakeScreen(amp, dur) { shakeAmp = Math.max(shakeAmp, amp); shakeT = Math.max(shakeT, dur); }

const dmgCanvas = document.createElement('canvas');
dmgCanvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:11;';
document.body.appendChild(dmgCanvas);
const dmgCtx = dmgCanvas.getContext('2d');
function sizeDmgCanvas() { dmgCanvas.width = innerWidth; dmgCanvas.height = innerHeight; }
sizeDmgCanvas();
addEventListener('resize', sizeDmgCanvas);
const dmgNumbers = [];
const DMG_MAX_ACTIVE = 24;
function spawnDmgNumber(pos, amount, isCrit) {
  if (dmgNumbers.length >= DMG_MAX_ACTIVE) return;
  const v = pos.clone().project(camera);
  if (v.z > 1 || v.z < -1) return;
  dmgNumbers.push({
    x: (v.x*0.5+0.5)*innerWidth, y: (-v.y*0.5+0.5)*innerHeight,
    vx: (Math.random()-0.5)*30, vy: -70-Math.random()*30,
    t: 0, life: 0.7, amount: Math.round(amount), isCrit
  });
}
function updateDmgNumbers(dt) {
  dmgCtx.clearRect(0, 0, dmgCanvas.width, dmgCanvas.height);
  if (dmgNumbers.length === 0) return;
  dmgCtx.textAlign = 'center';
  dmgCtx.textBaseline = 'middle';
  for (let i = dmgNumbers.length - 1; i >= 0; i--) {
    const d = dmgNumbers[i];
    d.t += dt;
    if (d.t >= d.life) { dmgNumbers.splice(i, 1); continue; }
    d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 200 * dt;
    dmgCtx.globalAlpha = clamp(1 - d.t/d.life, 0, 1);
    dmgCtx.font = (d.isCrit ? 'bold 22px' : 'bold 15px') + ' Trebuchet MS, sans-serif';
    dmgCtx.fillStyle = '#000'; dmgCtx.fillText(d.amount, d.x + 1.5, d.y + 1.5);
    dmgCtx.fillStyle = d.isCrit ? '#ffcc44' : '#fff'; dmgCtx.fillText(d.amount, d.x, d.y);
  }
  dmgCtx.globalAlpha = 1;
}

/* AUDIO */
let actx=null, mg=null;
function initAudio() {
  if (actx) return;
  try { actx = new (window.AudioContext||window.webkitAudioContext)(); mg = actx.createGain(); mg.gain.value=0.45; mg.connect(actx.destination); } catch(e){}
}
function noise(dur, freq, gain, type) {
  type = type || 'lowpass';
  if (!actx) return;
  const n = Math.floor(actx.sampleRate*dur);
  const buf = actx.createBuffer(1,n,actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n);
  const src = actx.createBufferSource(); src.buffer = buf;
  const f = actx.createBiquadFilter(); f.type=type; f.frequency.value=freq;
  const g = actx.createGain(); g.gain.value=gain;
  src.connect(f); f.connect(g); g.connect(mg); src.start();
}
function tone(freq, dur, type, gain, slide) {
  type = type || 'sine'; gain = gain == null ? 0.15 : gain;
  if (!actx) return;
  const o = actx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(freq, actx.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20,slide), actx.currentTime+dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(gain, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime+dur);
  o.connect(g); g.connect(mg); o.start(); o.stop(actx.currentTime+dur);
}
const Music = {
  playing:false, timer:null, step:0, bpm:96, mode:'calm', bassGain:null, drumGain:null,
  bassPattern:[0,0,3,0,5,0,3,3], bassBaseFreq:55, scale:[0,3,5,7,10],
  start() {
    if (this.playing || !actx) return;
    this.playing = true;
    this.bassGain = actx.createGain(); this.bassGain.gain.value = 0.14; this.bassGain.connect(mg);
    this.drumGain = actx.createGain(); this.drumGain.gain.value = 0.10; this.drumGain.connect(mg);
    const interval = () => { if (!this.playing) return; this.tick(); this.timer = setTimeout(interval, (60/this.bpm/4)*1000); };
    this.tick();
    this.timer = setTimeout(interval, (60/this.bpm/4)*1000);
  },
  stop() { this.playing=false; if (this.timer) clearTimeout(this.timer); try { this.bassGain && this.bassGain.disconnect(); } catch(_) {} try { this.drumGain && this.drumGain.disconnect(); } catch(_) {} },
  setMode(m) {
    if (this.mode === m) return;
    this.mode = m;
    if (m === 'combat') { this.bpm = 120; this.bassBaseFreq = 55; this.bassGain.gain.value = 0.16; }
    else if (m === 'boss') { this.bpm = 140; this.bassBaseFreq = 46; this.bassGain.gain.value = 0.20; }
    else { this.bpm = 88; this.bassBaseFreq = 66; this.bassGain.gain.value = 0.11; }
  },
  tick() {
    if (!actx || !this.bassGain) return;
    const s = this.step % 16;
    const lowHp = player && player.alive && player.hp/player.maxHp < 0.3;
    const intense = this.mode === 'boss' || isRushWave;
    if (s % 2 === 0) {
      const ni = this.bassPattern[(this.step>>1) % this.bassPattern.length];
      const semi = this.scale[ni % this.scale.length];
      this.bass(this.bassBaseFreq * Math.pow(2, semi/12));
    }
    if (s === 0 || s === 6 || s === 10) this.kick();
    if ((intense || lowHp) && s % 2 === 1) this.hat();
    if (intense && (s === 4 || s === 12)) this.snare();
    this.step++;
  },
  bass(f) { const o = actx.createOscillator(); o.type='triangle'; o.frequency.value=f; const g = actx.createGain(); const now = actx.currentTime; g.gain.setValueAtTime(0,now); g.gain.linearRampToValueAtTime(0.9, now+0.01); g.gain.exponentialRampToValueAtTime(0.001, now+0.22); o.connect(g); g.connect(this.bassGain); o.start(now); o.stop(now+0.25); },
  kick() { const o = actx.createOscillator(); o.type='sine'; const now = actx.currentTime; o.frequency.setValueAtTime(140,now); o.frequency.exponentialRampToValueAtTime(38, now+0.15); const g = actx.createGain(); g.gain.setValueAtTime(0.9,now); g.gain.exponentialRampToValueAtTime(0.001, now+0.20); o.connect(g); g.connect(this.drumGain); o.start(now); o.stop(now+0.22); },
  hat() { const n = Math.floor(actx.sampleRate*0.04); const buf = actx.createBuffer(1,n,actx.sampleRate); const d = buf.getChannelData(0); for (let i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n); const src = actx.createBufferSource(); src.buffer = buf; const f = actx.createBiquadFilter(); f.type='highpass'; f.frequency.value=6000; const g = actx.createGain(); g.gain.value=0.35; src.connect(f); f.connect(g); g.connect(this.drumGain); src.start(); },
  snare() { const n = Math.floor(actx.sampleRate*0.12); const buf = actx.createBuffer(1,n,actx.sampleRate); const d = buf.getChannelData(0); for (let i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n); const src = actx.createBufferSource(); src.buffer = buf; const f = actx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=2200; f.Q.value=0.8; const g = actx.createGain(); g.gain.value=0.6; src.connect(f); f.connect(g); g.connect(this.drumGain); src.start(); }
};
const SFX = {
  pistol:()=>{noise(0.09,2600,0.3,'highpass');tone(190,0.09,'square',0.13,70);},
  shotgun:()=>{noise(0.24,1200,0.45);tone(95,0.22,'sawtooth',0.2,45);},
  minigun:()=>{noise(0.05,3600,0.18,'highpass');tone(150,0.04,'square',0.06,90);},
  rocket:()=>{noise(0.4,700,0.4);tone(70,0.4,'sawtooth',0.22,160);},
  zeus:()=>{noise(0.32,5200,0.32,'highpass');tone(880,0.3,'sawtooth',0.14,180);},
  bow:()=>{noise(0.08,3200,0.18,'highpass');tone(420,0.09,'triangle',0.08,220);},
  explode:()=>{noise(0.7,380,0.65);tone(55,0.7,'sawtooth',0.32,24);},
  hitFlesh: (()=>{let _last=0;return ()=>{const n=performance.now();if(n-_last<75)return;_last=n;noise(0.09,620,0.26);};})(),
  hitWall:()=>{noise(0.06,4200,0.14,'highpass');},
  die:()=>{tone(240,0.4,'sawtooth',0.18,50);noise(0.3,900,0.2);},
  hurt:()=>{tone(180,0.28,'square',0.2,70);},
  pickup:()=>{tone(660,0.09,'sine',0.18);tone(990,0.14,'sine',0.14);},
  soulPickup:()=>{tone(880,0.08,'sine',0.14);tone(1320,0.1,'sine',0.11);},
  waveStart:()=>{tone(220,0.6,'sawtooth',0.16,440);tone(330,0.7,'square',0.1,660);},
  reload:()=>{noise(0.07,1800,0.16);},
  spawn:()=>{tone(90,0.5,'sawtooth',0.12,220);},
  boss:()=>{tone(60,1.6,'sawtooth',0.26,40);},
  ult:()=>{tone(60,1.2,'sawtooth',0.34,800);noise(1.0,800,0.34);},
  ultReady:()=>{tone(880,0.18,'sine',0.14);},
  squeal:()=>{tone(900,0.14,'sawtooth',0.14,1400);},
  levelUp:()=>{tone(330,0.4,'sine',0.18);tone(440,0.5,'sine',0.16);tone(660,0.7,'sine',0.14);},
  connect:()=>{tone(660,0.12,'sine',0.2);setTimeout(()=>tone(880,0.12,'sine',0.2),100);setTimeout(()=>tone(1100,0.2,'sine',0.18),200);}
};

/* SCENE */
const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.style.filter = 'contrast(1.035) saturate(1.06)';
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x2a1f14, 65, 200);
const camera = new THREE.PerspectiveCamera(78, innerWidth/innerHeight, 0.08, 800);
const camera2 = new THREE.PerspectiveCamera(78, innerWidth/innerHeight, 0.08, 800);
scene.add(camera);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { top:{value:new THREE.Color(0x0d1226)}, mid:{value:new THREE.Color(0x3a2418)}, bottom:{value:new THREE.Color(0x8a4a1a)} },
  vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main(){ float h=normalize(vP).y*0.5+0.5; vec3 c = h<0.5 ? mix(bottom,mid,h*2.0) : mix(mid,top,(h-0.5)*2.0); gl_FragColor=vec4(c,1.0);}'
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(600,32,20), skyMat));
const hemi = new THREE.HemisphereLight(0x8899cc, 0x3a2a18, 0.55); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb060, 1.3);
sun.position.set(-80,100,60); sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-120; sun.shadow.camera.right=120;
sun.shadow.camera.top=120; sun.shadow.camera.bottom=-120;
sun.shadow.camera.far=350; sun.shadow.bias=-0.001;
scene.add(sun);

const textureSet = await loadGameTextures(renderer);

/* ATMOSPHERE — distant sun, layered clouds, floating motes */
const sunGlowTex = textureSet.sunGlow;
const cloudTex = textureSet.cloud;
const atmosphere = new THREE.Group(); scene.add(atmosphere);
const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map:sunGlowTex, color:0xffd09a, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, depthTest:false, fog:false }));
sunDisc.position.set(-210,145,-260); sunDisc.scale.set(78,78,1); atmosphere.add(sunDisc);
const skyClouds=[];
for(let i=0;i<18;i++){
  const sm=new THREE.SpriteMaterial({map:cloudTex,color:0xd9c8b5,transparent:true,opacity:rand(.10,.24),depthWrite:false,fog:false});
  const sp=new THREE.Sprite(sm); const a=(i/18)*TAU+rand(-.25,.25), r=rand(190,330);
  sp.position.set(Math.cos(a)*r,rand(38,115),Math.sin(a)*r); const sc=rand(65,125);sp.scale.set(sc*1.9,sc,1); atmosphere.add(sp);skyClouds.push(sp);
}
const moteGeo=new THREE.BufferGeometry(); const motePos=new Float32Array(240*3);
for(let i=0;i<240;i++){motePos[i*3]=rand(-55,55);motePos[i*3+1]=rand(.5,20);motePos[i*3+2]=rand(-55,55);}
moteGeo.setAttribute('position',new THREE.BufferAttribute(motePos,3));
const moteMat=new THREE.PointsMaterial({color:0xffd59a,size:.11,transparent:true,opacity:.28,depthWrite:false,sizeAttenuation:true});
const motes=new THREE.Points(moteGeo,moteMat); atmosphere.add(motes);

const flashLight = new THREE.PointLight(0xffaa44, 0, 30, 2);
scene.add(flashLight);
let flashLightLife = 0, flashLightMax = 0, flashLightBase = 0;
function useFlashLight(pos, intensity, radius, color, duration) {
  flashLight.position.copy(pos);
  flashLight.color.setHex(color);
  flashLight.distance = radius;
  flashLightBase = intensity;
  flashLight.intensity = intensity;
  flashLightLife = duration;
  flashLightMax = duration;
}
function updateFlashLight(dt) {
  if (flashLightLife > 0) {
    flashLightLife -= dt;
    if (flashLightLife <= 0) { flashLight.intensity = 0; flashLightLife = 0; }
    else flashLight.intensity = flashLightBase * (flashLightLife / flashLightMax);
  }
}
const zoneLights = [];
function addZoneLight(x, y, z, color, intensity, dist) {
  const l = new THREE.PointLight(color, intensity, dist, 2);
  l.position.set(x, y, z); scene.add(l); zoneLights.push(l);
}

/* FILE-BASED TEXTURES / MATERIALS */
const {
  floorMat, wallMat, colMat, blockMat, marbleMat, darkMarbleMat,
  stoneMat, goldMat, bronzeMat, ruinMat, ruinDarkMat
} = createWorldMaterials(textureSet);

/* MAP */
const ARENA = 65;
const MANSION_X_MIN = ARENA + 15, MANSION_X_MAX = ARENA + 95, MANSION_Z_HALF = 55, GATE_Z_HALF = 10;
const circleColliders = [], boxColliders = [], worldMeshes = [], torchParts = [];

function addBox(w, h, d, x, z, mat, y) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  m.position.set(x, y != null ? y : h/2, z);
  m.castShadow=true; m.receiveShadow=true; m.userData.isWall=true;
  scene.add(m); worldMeshes.push(m);
  if (y == null) boxColliders.push({ minX:x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2 });
  return m;
}
function addCyl(radius, height, x, z, mat, collide) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,16), mat);
  m.position.set(x,height/2,z);
  m.castShadow=true; m.receiveShadow=true; m.userData.isWall=true;
  scene.add(m); worldMeshes.push(m);
  if (collide !== false) circleColliders.push({ x, z, r: radius + 0.15 });
  return m;
}
function addStatue(x, z, scale) {
  scale = scale || 1;
  const g = new THREE.Group();
  const ped = new THREE.Mesh(new THREE.BoxGeometry(2.4*scale,1.6*scale,2.4*scale), marbleMat);
  ped.position.y = 0.8*scale; ped.castShadow=true; ped.receiveShadow=true; g.add(ped);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.5*scale,0.4*scale,2.4*scale,10), marbleMat);
  torso.position.y = 3.0*scale; torso.castShadow=true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5*scale,12,10), marbleMat);
  head.position.y = 4.6*scale; head.castShadow=true; g.add(head);
  for (const sx of [-1,1]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.18*scale,0.15*scale,2.0*scale,8), marbleMat); arm.position.set(sx*0.65*scale,3.0*scale,0); arm.castShadow=true; g.add(arm); }
  const laurel = new THREE.Mesh(new THREE.TorusGeometry(0.55*scale,0.08*scale,5,12), goldMat);
  laurel.position.y = 4.6*scale; laurel.rotation.x = Math.PI/2; g.add(laurel);
  g.position.set(x,0,z); scene.add(g);
  worldMeshes.push(torso,head);
  circleColliders.push({ x, z, r: 1.7*scale });
}
function addTorch(x, z, y) {
  y = y || 0;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.18,4.5,8), bronzeMat);
  post.position.set(x, y+2.25, z); scene.add(post); worldMeshes.push(post);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.35,0.45,10), bronzeMat);
  bowl.position.set(x, y+4.6, z); scene.add(bowl);
  const fire = new THREE.Mesh(new THREE.ConeGeometry(0.45,1.1,6), new THREE.MeshBasicMaterial({ color:0xffaa44, transparent:true, opacity:0.92 }));
  fire.position.set(x, y+5.4, z); scene.add(fire);
  fire.userData = { life: Math.random()*1.5, baseY: y+5.4, baseScale: 1 };
  torchParts.push(fire);
  circleColliders.push({ x, z, r: 0.35 });
}
function addCrate(x, z, size, stack) {
  size = size || 1.8; stack = stack || 1;
  for (let i = 0; i < stack; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(size,size,size), blockMat);
    m.position.set(x+rand(-0.1,0.1), size/2+i*size, z+rand(-0.1,0.1));
    m.rotation.y = rand(-0.3,0.3);
    m.castShadow=true; m.receiveShadow=true; m.userData.isWall=true;
    scene.add(m); worldMeshes.push(m);
    boxColliders.push({ minX:x-size/2, maxX:x+size/2, minZ:z-size/2, maxZ:z+size/2 });
  }
}
function addRuinBuilding(x, z, w, h, d) {
  const body = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), ruinMat);
  body.position.set(x,h/2,z); body.castShadow=true; body.receiveShadow=true; body.userData.isWall=true;
  scene.add(body); worldMeshes.push(body);
  boxColliders.push({ minX:x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w*1.05,0.4,d*0.5), ruinDarkMat);
  roof.position.set(x+rand(-1,1), h+0.5, z+rand(-1,1));
  roof.rotation.z = rand(-0.3,0.3); roof.rotation.x = rand(-0.2,0.2);
  roof.castShadow=true; scene.add(roof); worldMeshes.push(roof);
}
function addRubble(x, z, count, size) {
  count = count || 4; size = size || 0.7;
  for (let i = 0; i < count; i++) {
    const s = size * rand(0.6,1.4);
    const m = new THREE.Mesh(new THREE.SphereGeometry(s,6,5), ruinMat);
    m.position.set(x+rand(-1.5,1.5), s*0.6, z+rand(-1.5,1.5));
    m.scale.set(1,0.6,1); m.castShadow=true;
    scene.add(m); worldMeshes.push(m);
  }
  circleColliders.push({ x, z, r: 1.6 });
}
function addBanner(x, y, z, rotY, color) {
  const clothMat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.6,3.2), clothMat);
  banner.position.set(x,y,z); banner.rotation.y = rotY; banner.userData.isWall=true;
  scene.add(banner); worldMeshes.push(banner);
  const gold = new THREE.Mesh(new THREE.BoxGeometry(1.7,0.18,0.12), goldMat);
  gold.position.set(x, y+1.7, z); gold.rotation.y = rotY; scene.add(gold); worldMeshes.push(gold);
}

const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA*2+20, ARENA*2+20), floorMat);
floor.rotation.x = -Math.PI/2; floor.receiveShadow=true; floor.userData.isWall=true;
scene.add(floor); worldMeshes.push(floor);

addBox(ARENA*2+4,16,2,0,-ARENA-1,wallMat);
addBox(ARENA*2+4,16,2,0,ARENA+1,wallMat);
addBox(2,16,ARENA*2+4,-ARENA-1,0,wallMat);
addBox(2,16,ARENA*2+4,ARENA+1,0,wallMat);
const archL = new THREE.Mesh(new THREE.BoxGeometry(4,3,1.2), marbleMat); archL.position.set(ARENA+1,12,-GATE_Z_HALF-0.5); archL.castShadow=true; scene.add(archL); worldMeshes.push(archL);
const archR = new THREE.Mesh(new THREE.BoxGeometry(4,3,1.2), marbleMat); archR.position.set(ARENA+1,12,GATE_Z_HALF+0.5); archR.castShadow=true; scene.add(archR); worldMeshes.push(archR);
const archT = new THREE.Mesh(new THREE.TorusGeometry(5.5,0.6,8,16,Math.PI), marbleMat); archT.position.set(ARENA+1,11.5,0); archT.rotation.z=Math.PI/2; archT.rotation.y=Math.PI/2; archT.castShadow=true; scene.add(archT); worldMeshes.push(archT);
const gateSeal = new THREE.Mesh(new THREE.BoxGeometry(1.4,10.4,17.2), ruinDarkMat); gateSeal.position.set(ARENA+0.1,5.2,0); gateSeal.castShadow=true; gateSeal.receiveShadow=true; scene.add(gateSeal); worldMeshes.push(gateSeal);
const gateEmblem = new THREE.Mesh(new THREE.TorusGeometry(2.1,0.22,8,18), goldMat); gateEmblem.position.set(ARENA-0.15,8.3,0); gateEmblem.rotation.y=Math.PI/2; scene.add(gateEmblem); worldMeshes.push(gateEmblem);
const gateDisc = new THREE.Mesh(new THREE.CircleGeometry(1.1,20), bronzeMat); gateDisc.position.set(ARENA-0.35,8.3,0); gateDisc.rotation.y=-Math.PI/2; scene.add(gateDisc); worldMeshes.push(gateDisc);

for (let i=0;i<5;i++) { const x=-40+i*20; addCyl(1.4,12,x,45,marbleMat); addCyl(1.4,12,x,55,marbleMat); }
for (let i=0;i<5;i++) { const x=-40+i*20; const c1=new THREE.Mesh(new THREE.BoxGeometry(3.6,0.6,3.6), darkMarbleMat); c1.position.set(x,12.3,45); c1.castShadow=true; scene.add(c1); worldMeshes.push(c1); const c2=new THREE.Mesh(new THREE.BoxGeometry(3.6,0.6,3.6), darkMarbleMat); c2.position.set(x,12.3,55); c2.castShadow=true; scene.add(c2); worldMeshes.push(c2); }
addStatue(-35,30,1.2); addStatue(35,30,1.2); addStatue(-35,60,1.2); addStatue(35,60,1.2);
addCrate(-15,40,1.8,2); addCrate(15,40,1.8,2); addCrate(-22,55,1.6,3); addCrate(22,55,1.6,3); addCrate(0,60,2.0,1);
addTorch(-8,30); addTorch(8,30); addTorch(-8,62); addTorch(8,62);
const podium = new THREE.Mesh(new THREE.BoxGeometry(50,0.1,50), marbleMat); podium.position.set(0,0.05,2.5); podium.receiveShadow=true; scene.add(podium); worldMeshes.push(podium);
const templeCols = [[-20,-17],[0,-17],[20,-17],[-20,22],[0,22],[20,22],[-22,0],[22,0]];
for (const [x,z] of templeCols) { addCyl(1.6,15,x,z,colMat); const cap=new THREE.Mesh(new THREE.BoxGeometry(4.2,0.8,4.2), goldMat); cap.position.set(x,15.4,z); cap.castShadow=true; scene.add(cap); worldMeshes.push(cap); const base=new THREE.Mesh(new THREE.BoxGeometry(4,0.6,4), darkMarbleMat); base.position.set(x,0.3,z); base.castShadow=true; scene.add(base); worldMeshes.push(base); }
const poolPedestal = new THREE.Mesh(new THREE.CylinderGeometry(7.0,7.6,1.15,28), marbleMat); poolPedestal.position.set(0,0.57,2.5); poolPedestal.castShadow=true; poolPedestal.receiveShadow=true; scene.add(poolPedestal); worldMeshes.push(poolPedestal);
const poolRim = new THREE.Mesh(new THREE.TorusGeometry(6.2,0.34,10,28), goldMat); poolRim.position.set(0,1.06,2.5); poolRim.rotation.x=Math.PI/2; poolRim.castShadow=true; scene.add(poolRim); worldMeshes.push(poolRim);
const poolInnerWall = new THREE.Mesh(new THREE.CylinderGeometry(5.7,6.0,0.95,28,1,true), darkMarbleMat); poolInnerWall.position.set(0,0.66,2.5); poolInnerWall.castShadow=true; poolInnerWall.receiveShadow=true; scene.add(poolInnerWall); worldMeshes.push(poolInnerWall);
const poolWater = new THREE.Mesh(new THREE.CircleGeometry(5.45,36), new THREE.MeshStandardMaterial({ color:0x2d97c7, emissive:0x12364a, emissiveIntensity:0.32, transparent:true, opacity:0.84, roughness:0.18, metalness:0.0, normalMap:textureSet.waterNormal, normalScale:new THREE.Vector2(0.7,0.7) })); poolWater.rotation.x=-Math.PI/2; poolWater.position.set(0,0.96,2.5); poolWater.receiveShadow=true; poolWater.userData={ baseY:0.96 }; scene.add(poolWater); worldMeshes.push(poolWater);
const poolSigil = new THREE.Mesh(new THREE.RingGeometry(4.2,4.55,42), new THREE.MeshBasicMaterial({ color:0x8ce6ff, transparent:true, opacity:0.42, side:THREE.DoubleSide })); poolSigil.rotation.x=-Math.PI/2; poolSigil.position.set(0,1.0,2.5); scene.add(poolSigil); worldMeshes.push(poolSigil); poolWater.userData.ring = poolSigil;
const poolCore = new THREE.Mesh(new THREE.CylinderGeometry(0.85,1.1,1.75,16), marbleMat); poolCore.position.set(0,1.05,2.5); poolCore.castShadow=true; poolCore.receiveShadow=true; scene.add(poolCore); worldMeshes.push(poolCore);
const poolGlow = new THREE.Mesh(new THREE.SphereGeometry(0.52,14,12), new THREE.MeshBasicMaterial({ color:0x7edaff, transparent:true, opacity:0.85 })); poolGlow.position.set(0,1.95,2.5); poolGlow.userData={ life:1, baseY:1.95, baseScale:1.0 }; scene.add(poolGlow); torchParts.push(poolGlow);
for (const [x,z] of [[-7,2.5],[7,2.5],[0,-4.5],[0,9.5]]) { const braz=new THREE.Mesh(new THREE.CylinderGeometry(0.52,0.68,1.0,10), bronzeMat); braz.position.set(x,0.5,z); braz.castShadow=true; scene.add(braz); worldMeshes.push(braz); const flame=new THREE.Mesh(new THREE.SphereGeometry(0.45,12,10), new THREE.MeshBasicMaterial({ color:0x7ecbff, transparent:true, opacity:0.78 })); flame.position.set(x,1.35,z); flame.userData={ life:1, baseY:1.35, baseScale:0.8 }; scene.add(flame); torchParts.push(flame); }
circleColliders.push({ x:0, z:2.5, r:6.3 });

addTorch(-10,15,0); addTorch(10,15,0); addTorch(-10,-8,0); addTorch(10,-8,0);
const throneBase = new THREE.Mesh(new THREE.BoxGeometry(6,1.2,5), darkMarbleMat); throneBase.position.set(0,0.6,-58); throneBase.castShadow=true; throneBase.receiveShadow=true; scene.add(throneBase); worldMeshes.push(throneBase); boxColliders.push({ minX:-3, maxX:3, minZ:-60.5, maxZ:-55.5 });
const throneSeat = new THREE.Mesh(new THREE.BoxGeometry(5,3,4), darkMarbleMat); throneSeat.position.set(0,2.7,-58); throneSeat.castShadow=true; scene.add(throneSeat); worldMeshes.push(throneSeat);
const throneBack = new THREE.Mesh(new THREE.BoxGeometry(5,6,0.6), goldMat); throneBack.position.set(0,4.2,-60); throneBack.castShadow=true; scene.add(throneBack); worldMeshes.push(throneBack);
addStatue(-20,-35,1.6); addStatue(20,-35,1.6); addStatue(-20,-50,1.6); addStatue(20,-50,1.6);
addTorch(-14,-25); addTorch(14,-25); addTorch(-14,-45); addTorch(14,-45); addTorch(0,-30);
addCyl(1.5,12,-22,-40,darkMarbleMat); addCyl(1.5,12,22,-40,darkMarbleMat); addCyl(1.5,12,-22,-55,darkMarbleMat); addCyl(1.5,12,22,-55,darkMarbleMat);
addRubble(-48,-4,5); addRubble(48,-4,5); addRubble(-42,18,4); addRubble(42,18,4); addRubble(0,34,4);
addBox(7,2.0,1.3,-34,8,ruinMat); addBox(7,2.0,1.3,34,8,ruinMat); addBox(1.3,2.0,10,-48,18,ruinMat); addBox(1.3,2.0,10,48,18,ruinMat);
addDeadTree(-52,-20); addDeadTree(52,-20); addDeadTree(-48,38); addDeadTree(48,38);
addBanner(-40,8,60,Math.PI,0x8a2020); addBanner(40,8,60,Math.PI,0x8a2020); addBanner(-40,8,-55,0,0x202a8a); addBanner(40,8,-55,0,0x202a8a);
addZoneLight(0,9,45,0xff9944,1.4,45); addZoneLight(0,10,2.5,0x7edaff,2.0,48); addZoneLight(0,9,-40,0xff8844,1.4,45); addZoneLight(-42,8,0,0xff9955,1.25,36); addZoneLight(42,8,0,0xff9955,1.25,36);
/* PHYSICS */
function collide(pos, r) {
  for (const c of circleColliders) {
    const dx = pos.x-c.x, dz = pos.z-c.z;
    const d = Math.hypot(dx,dz), min = c.r+r;
    if (d < min && d > 0.001) { const k=(min-d)/d; pos.x+=dx*k; pos.z+=dz*k; }
  }
  for (const b of boxColliders) {
    const cx = clamp(pos.x, b.minX, b.maxX), cz = clamp(pos.z, b.minZ, b.maxZ);
    const dx = pos.x-cx, dz = pos.z-cz;
    const d = Math.hypot(dx,dz);
    if (d < r) {
      if (d < 0.001) pos.x += r;
      else { const k=(r-d)/d; pos.x+=dx*k; pos.z+=dz*k; }
    }
  }
  pos.x = clamp(pos.x, -ARENA+r, ARENA-r);
  pos.z = clamp(pos.z, -ARENA+r, ARENA-r);
}

/* HAZARDS */
const lavaPools = [], barrels = [];
function addLavaPool(x, z, radius) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 20), new THREE.MeshBasicMaterial({ color:0xff5522, transparent:true, opacity:0.85 }));
  m.rotation.x = -Math.PI/2; m.position.set(x, 0.06, z); scene.add(m);
  const light = new THREE.PointLight(0xff6622, 1.2, radius*2.5, 2);
  light.position.set(x,1.5,z); scene.add(light); zoneLights.push(light);
  lavaPools.push({ x, z, r: radius, mesh: m, cooldown: 0 });
}
function addBarrel(x, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.55,1.4,10), new THREE.MeshLambertMaterial({ color:0x8a3a1a }));
  m.position.set(x,0.7,z); m.castShadow=true;
  scene.add(m); worldMeshes.push(m);
  circleColliders.push({ x, z, r: 0.6 });
  const b = { mesh: m, x, z, alive: true };
  m.userData.barrelRef = b; barrels.push(b);
}
function updateHazards(dt) {
  for (const lp of lavaPools) {
    lp.cooldown -= dt;
    if (lp.cooldown <= 0) {
      const check = P => {
        if (!P.alive) return;
        const d = Math.hypot(P.pos.x-lp.x, P.pos.z-lp.z);
        if (d < lp.r + P.radius) {
          damagePlayer(P, 8); lp.cooldown = 0.5;
          burst(P.pos.clone().setY(0.5), 6, { mat:'fire', speed:4, life:0.4, size:0.14, gravity:6 });
        }
      };
      check(player);
      if (net.mode === 'host' && player2.alive) check(player2);
    }
  }
}
function checkBarrelHit(pos) {
  for (const b of barrels) {
    if (!b.alive) continue;
    const d = Math.hypot(pos.x-b.x, pos.z-b.z);
    if (d < 0.9) {
      b.alive = false;
      scene.remove(b.mesh);
      const idx = barrels.indexOf(b);
      if (idx >= 0) barrels.splice(idx,1);
      explode(new THREE.Vector3(b.x,1,b.z), 6, 130, 'player');
      shakeScreen(5, 0.25);
      return true;
    }
  }
  return false;
}
addLavaPool(-18,-18,2.8); addLavaPool(18,-18,2.8);
addLavaPool(-28,36,2.2); addLavaPool(28,36,2.2);
addBarrel(10,30); addBarrel(-10,30); addBarrel(15,-25); addBarrel(-15,-25);
addBarrel(-34,12); addBarrel(34,12);
addBarrel(-28,50); addBarrel(28,50);

/* STELAE */
const stelae = [];
const STELAE_TEXTS = [
  'Здесь спал Аид. Здесь он видел сны, которые стали кошмарами.',
  'Олимпийцы пировали тут, пока смертные умирали внизу.',
  'Каждый камень этих врат — могила героя.',
  'Ксантиппа впервые увидела монстра здесь. Он смотрел. Она — на него.',
  'Тот, кто войдёт сюда с миром — выйдет с проклятием.',
  'Эхо битвы Титанов всё ещё слышно в этих стенах.',
  'Боги не спят. Они делают вид.',
  'Молния Зевса — не наказание. Это подарок выжившим.',
  'Тартар — не место. Это состояние души.',
  'Печать Олимпа треснула в ночь рождения последнего стража.',
  'Здесь нет героев. Только те, кто ещё стоит.',
  'Цербер трижды обошёл эту арену. Каждый след — век.'
];
function addStela(x, z, text) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.4,0.5,1.4), darkMarbleMat); base.position.y = 0.25; base.castShadow=true; g.add(base);
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.0,3.5,0.4), marbleMat); pillar.position.y = 2.25; pillar.castShadow=true; g.add(pillar);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.7,0.7,0.3,8), goldMat); top.position.y = 4.15; top.castShadow=true; g.add(top);
  g.position.set(x,0,z); scene.add(g); worldMeshes.push(pillar);
  circleColliders.push({ x, z, r: 1.1 });
  stelae.push({ x, z, text });
}
addStela(-35,40,STELAE_TEXTS[0]); addStela(35,40,STELAE_TEXTS[1]);
addStela(0,60,STELAE_TEXTS[2]); addStela(-30,-30,STELAE_TEXTS[3]);
addStela(30,-30,STELAE_TEXTS[4]); addStela(0,-50,STELAE_TEXTS[5]);
addStela(-48,-8,STELAE_TEXTS[6]); addStela(-48,22,STELAE_TEXTS[7]);
addStela(48,-8,STELAE_TEXTS[8]); addStela(48,22,STELAE_TEXTS[9]);
addStela(-40,0,STELAE_TEXTS[10]); addStela(40,0,STELAE_TEXTS[11]);

/* PARTICLES (POOL) — billboard sprite pass */
const particles = [];
const pTex={
  blood:textureSet.particleBlood,
  blood2:textureSet.particleBlood2,
  spark:textureSet.particleSpark,
  dust:textureSet.particleDust,
  stone:textureSet.particleStone,
  smoke:textureSet.particleSmoke,
  fire:textureSet.particleFire,
  gold:textureSet.particleGold,
  magic:textureSet.particleMagic,
  ghost:textureSet.particleGhost
};
function pm(kind,color,opts){opts=opts||{};return new THREE.SpriteMaterial({map:pTex[kind],color,transparent:true,opacity:opts.opacity==null?1:opts.opacity,depthWrite:false,blending:opts.add?THREE.AdditiveBlending:THREE.NormalBlending,fog:true});}
const pMats = {
  blood:pm('blood',0x8b1010), blood2:pm('blood2',0xd02020),
  spark:pm('spark',0xffcc44,{add:true}), dust:pm('dust',0xb09a72,{opacity:.72}), stone:pm('stone',0x756448),
  smoke:pm('smoke',0x777777,{opacity:.5}), fire:pm('fire',0xff7a20,{add:true}), gold:pm('gold',0xffd27a,{add:true}),
  magic:pm('magic',0x66ccff,{add:true}), ghost:pm('ghost',0xaa66ff,{add:true,opacity:.8})
};
const PARTICLE_POOL_SIZE = 400;
const particlePool = [];
for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
  const m = new THREE.Sprite(pMats.spark);
  m.visible = false; scene.add(m); particlePool.push(m);
}
function spawnParticle(pos, opts) {
  const m = particlePool.pop(); if (!m) return;
  m.material = pMats[opts.mat] || pMats.spark;
  m.position.copy(pos);
  const sz=(opts.size||0.12)*rand(0.7,1.4);
  const stretch = (opts.mat==='spark'||opts.mat==='fire') ? rand(1.5,2.5) : 1;
  m.scale.set(sz,sz*stretch,1); m.visible = true;
  const u = m.userData;
  if (!u.v) u.v = new THREE.Vector3();
  if (opts.vel) u.v.copy(opts.vel); else u.v.set(rand(-3,3), rand(2,6), rand(-3,3));
  u.life = (opts.life||0.7) * rand(0.7,1.3); u.max = opts.life||0.7;
  u.g = opts.gravity != null ? opts.gravity : 22; u.spin = opts.spin !== false;
  particles.push(m);
}
function burst(pos, count, opts) {
  for (let i = 0; i < count; i++) {
    if (particlePool.length === 0) break;
    const v = new THREE.Vector3(rand(-1,1),rand(-0.3,1.4),rand(-1,1)).normalize().multiplyScalar(rand(2,opts.speed||9));
    spawnParticle(pos, { ...opts, vel:v, life:(opts.life||0.7)*rand(0.6,1.4) });
  }
}
function updateParticles(dt) {
  for (let i = particles.length-1; i >= 0; i--) {
    const p = particles[i], u=p.userData; u.life -= dt;
    if (u.life <= 0) { p.visible=false; particles.splice(i,1); if(particlePool.length<PARTICLE_POOL_SIZE)particlePool.push(p); continue; }
    u.v.y -= u.g*dt; p.position.addScaledVector(u.v,dt);
    if (p.position.y < 0.05) { p.position.y=0.05; u.v.y=Math.abs(u.v.y)*0.3; u.v.x*=.7;u.v.z*=.7; }
    const k=clamp(u.life/u.max,0,1); const base=Math.max(.25,k);
    p.scale.multiplyScalar(1+dt*((p.material===pMats.smoke||p.material===pMats.ghost)?1.2:.15));
    if (p.material===pMats.smoke) p.position.y += dt*.35;
  }
}
/* IMPACT / BLOOD DECALS — image assets */
const decalGeo = new THREE.PlaneGeometry(1,1);
const decalMats={
  impact:new THREE.MeshBasicMaterial({map:textureSet.decalCrack,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,side:THREE.DoubleSide}),
  blood:new THREE.MeshBasicMaterial({map:textureSet.decalBlood,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,side:THREE.DoubleSide,color:0x9b1414})
};
const decals=[];
function spawnDecal(pos, normal, kind, size){
  kind=kind||'impact';size=size||rand(.45,.9); const m=new THREE.Mesh(decalGeo,decalMats[kind]||decalMats.impact);
  const n=(normal||UP).clone().normalize();m.position.copy(pos).addScaledVector(n,.018);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),n);m.rotateZ(rand(0,TAU));m.scale.set(size,size,1);m.renderOrder=2;scene.add(m);decals.push(m);
  if(decals.length>120){const d=decals.shift();scene.remove(d);}
}

/* BEAMS (POOL) */
const beamGeo = new THREE.CylinderGeometry(1,1,1,6,1,true);
const beams = [];
const beamPool = [];
const BEAM_POOL_MAX = 80;
const UP = new THREE.Vector3(0,1,0);
function spawnBeam(from, to, color, radius, life) {
  color = color || 0x66ccff; radius = radius || 0.07; life = life || 0.14;
  const dir = new THREE.Vector3().subVectors(to,from);
  const len = dir.length(); if (len < 0.01) return;
  let b = beamPool.pop();
  if (b) { b.m.visible = true; b.m.material.color.setHex(color); b.m.material.opacity = 0.95; }
  else {
    const mat = new THREE.MeshBasicMaterial({ transparent:true, opacity:0.95, depthWrite:false, color });
    const mesh = new THREE.Mesh(beamGeo, mat); scene.add(mesh);
    b = { m: mesh, life: 0, max: 0, isLight: false };
  }
  b.m.position.copy(from).addScaledVector(dir, 0.5);
  b.m.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
  b.m.scale.set(radius, len, radius);
  b.life = life; b.max = life; b.isLight = false;
  beams.push(b);
}
function updateBeams(dt) {
  for (let i = beams.length-1; i >= 0; i--) {
    const b = beams[i]; if (b.isLight) continue;
    b.life -= dt;
    if (b.life <= 0) {
      b.m.visible = false;
      if (beamPool.length < BEAM_POOL_MAX) beamPool.push(b);
      else scene.remove(b.m);
      beams.splice(i,1); continue;
    }
    b.m.material.opacity = (b.life/b.max) * 0.95;
  }
}

/* PLAYERS */
const GRAVITY = 24;
function newPlayer(x, z) {
  return {
    pos: new THREE.Vector3(x,1.7,z), vel: new THREE.Vector3(), yaw: Math.PI, pitch: 0,
    hp: 100, maxHp: 100, armor: 0, maxArmor: 100,
    radius: 0.55, height: 1.7, onGround: true,
    speed: 8.4, sprintMul: 2.15, jumpPower: 8.6,
    bobT: 0, bobAmp: 0, recoil: 0, kick: 0,
    alive: true, invuln: 0, souls: 0,
    weapons: null, curWeapon: 0, weaponCd: 0,
    avatar: null, _semiLatch: false, grenades: 3,
    upgrades: { damage:1, fireRate:1, pierce:0, regen:0, lifesteal:0, ultDmg:1, explosive:false, bloodFeast:false, sets:{}, _bulletCount:0, _regenT:0 },
    powerups: {}
  };
}
const player = newPlayer(0, 45);
const player2 = newPlayer(-3, 47);

/* WEAPONS */
const WEAPON_TPL = [
  { id:'pistol', name:'Пистолет', auto:true, damage:32, rate:0.11, spread:0.010, pellets:1, range:150, ammoMax:600, unlockedDefault:true, slot:'1', sfx:'pistol', kick:0.022 },
  { id:'shotgun', name:'Дробовик Аида', auto:false, damage:20, rate:0.72, spread:0.09, pellets:10, range:42, ammoMax:120, unlockedDefault:false, slot:'2', sfx:'shotgun', kick:0.075 },
  { id:'minigun', name:'Миниган Гефеста', auto:true, damage:11, rate:0.024, spread:0.048, pellets:1, range:110, ammoMax:1200, unlockedDefault:false, slot:'3', sfx:'minigun', kick:0.014 },
  { id:'rocket', name:'Ракетница Титанов', auto:false, damage:230, rate:1.0, spread:0, pellets:1, range:200, splash:7.5, ammoMax:55, unlockedDefault:false, slot:'4', sfx:'rocket', kick:0.11 },
  { id:'zeus', name:'Молния Зевса', auto:false, damage:150, rate:0.60, spread:0, pellets:1, range:90, chain:3, ammoMax:100, unlockedDefault:false, slot:'5', sfx:'zeus', lightning:true, kick:0.05 },
  { id:'flamer', name:'Огнемёт Гефеста', auto:true, damage:12, rate:0.045, spread:0.14, pellets:1, range:17, ammoMax:700, unlockedDefault:false, slot:'6', sfx:'minigun', kick:0.008, flamer:true },
  { id:'sword', name:'Меч Ареса', auto:true, damage:85, rate:0.28, spread:0, pellets:1, range:4.5, ammoMax:99999, unlockedDefault:false, slot:'7', sfx:'punch', kick:0.04, melee:true, sweep:true, sweepAngle:1.2 }
];
const WEAPON_UNLOCK_WAVE = { shotgun:2, minigun:3, rocket:4, zeus:5, flamer:6, sword:7 };
function makeWeapons() {
  return WEAPON_TPL.map(w => ({ ...w, ammo: w.ammoMax, unlocked: w.unlockedDefault }));
}
player.weapons = makeWeapons();
player2.weapons = makeWeapons();

/* FIRST-PERSON WEAPON VIEWMODEL */
const vmRoot = new THREE.Group();
vmRoot.position.set(.36,-.38,-.82); camera.add(vmRoot);
const vmState={id:null,recoil:0,muzzle:0,swing:0};
function vmMat(color,metalness,roughness,emissive){const m=new THREE.MeshStandardMaterial({color,metalness:metalness||0,roughness:roughness==null ? .5 : roughness,emissive:emissive||0,emissiveIntensity:emissive ? .45 : 0,depthTest:false,depthWrite:false});return m;}
const VM_MAT={bronze:vmMat(0x9b6734,.72,.34),gold:vmMat(0xd8b34f,.88,.24),dark:vmMat(0x191713,.5,.35),steel:vmMat(0x777b80,.82,.26),wood:vmMat(0x5a3218,0,.8),skin:vmMat(0xd9ab83,0,.72),red:vmMat(0x7b1d16,.25,.48),zeus:vmMat(0x7fcfff,.18,.25,0x185a88)};
function vmMesh(geo,mat,x,y,z,rx,ry,rz){const m=new THREE.Mesh(geo,mat);m.position.set(x||0,y||0,z||0);m.rotation.set(rx||0,ry||0,rz||0);m.frustumCulled=false;m.renderOrder=999;return m;}
function vmBarrel(r,len,mat,x,y,z){return vmMesh(new THREE.CylinderGeometry(r,r,len,12),mat,x,y,z,Math.PI/2,0,0);}
function buildVMWeapon(id){
  const g=new THREE.Group();g.renderOrder=999;
  const hand=vmMesh(new THREE.CapsuleGeometry(.095,.22,6,10),VM_MAT.skin,.16,-.12,.04,.2,0,-.25);g.add(hand);
  if(id==='pistol'){
    g.add(vmMesh(new THREE.BoxGeometry(.24,.22,.72),VM_MAT.bronze,0,.02,-.18));g.add(vmBarrel(.075,.62,VM_MAT.dark,0,.09,-.55));g.add(vmMesh(new THREE.BoxGeometry(.18,.46,.2),VM_MAT.wood,.02,-.28,.02,.18,0,0));g.add(vmMesh(new THREE.BoxGeometry(.12,.05,.42),VM_MAT.gold,0,.15,-.22));
  } else if(id==='shotgun'){
    g.add(vmBarrel(.075,.92,VM_MAT.steel,-.085,.08,-.42));g.add(vmBarrel(.075,.92,VM_MAT.steel,.085,.08,-.42));g.add(vmMesh(new THREE.BoxGeometry(.3,.22,.72),VM_MAT.bronze,0,-.03,-.18));g.add(vmMesh(new THREE.BoxGeometry(.23,.2,.52),VM_MAT.wood,0,-.16,.32,.1,0,0));
  } else if(id==='minigun'){
    g.add(vmMesh(new THREE.CylinderGeometry(.24,.28,.55,14),VM_MAT.bronze,0,-.01,-.12,Math.PI/2));
    for(let i=0;i<6;i++){const a=i/6*TAU;g.add(vmBarrel(.035,.88,VM_MAT.steel,Math.cos(a)*.13,.04+Math.sin(a)*.13,-.58));}
    g.add(vmMesh(new THREE.TorusGeometry(.22,.035,8,18),VM_MAT.gold,0,.04,-.24,Math.PI/2));
  } else if(id==='rocket'){
    g.add(vmBarrel(.18,.95,VM_MAT.dark,0,.02,-.35));g.add(vmMesh(new THREE.CylinderGeometry(.24,.21,.36,12),VM_MAT.bronze,0,.02,.12,Math.PI/2));g.add(vmMesh(new THREE.TorusGeometry(.2,.035,7,18),VM_MAT.gold,0,.02,-.45,Math.PI/2));g.add(vmMesh(new THREE.BoxGeometry(.14,.32,.3),VM_MAT.wood,.12,-.23,.15,.15,0,0));
  } else if(id==='zeus'){
    g.add(vmMesh(new THREE.CapsuleGeometry(.13,.48,8,12),VM_MAT.gold,0,-.05,.05,0,0,.12));const orb=vmMesh(new THREE.SphereGeometry(.12,16,12),VM_MAT.zeus,0,.13,-.35);g.add(orb);for(const sx of [-1,1])g.add(vmMesh(new THREE.ConeGeometry(.035,.42,7),VM_MAT.gold,sx*.11,.12,-.48,-Math.PI/2,sx*.18,0));
  } else if(id==='flamer'){
    g.add(vmBarrel(.1,.75,VM_MAT.steel,0,.05,-.45));g.add(vmMesh(new THREE.CylinderGeometry(.22,.22,.5,12),VM_MAT.red,.18,-.1,.02,0,0,Math.PI/2));g.add(vmMesh(new THREE.TorusGeometry(.13,.03,8,16),VM_MAT.gold,0,.05,-.75,Math.PI/2));
  } else if(id==='sword'){
    g.add(vmMesh(new THREE.BoxGeometry(.08,.08,.55),VM_MAT.wood,.07,-.1,-.02,.15,0,-.35));g.add(vmMesh(new THREE.BoxGeometry(.52,.06,.08),VM_MAT.gold,0,.08,-.24,0,0,-.35));g.add(vmMesh(new THREE.BoxGeometry(.14,1.25,.055),VM_MAT.steel,-.18,.62,-.66,0,0,-.35));g.add(vmMesh(new THREE.ConeGeometry(.07,.34,4),VM_MAT.steel,-.39,1.24,-.83,0,0,-.35));
  }
  g.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;o.frustumCulled=false;o.renderOrder=999;}});
  return g;
}
const vmWeapons={};for(const w of WEAPON_TPL){vmWeapons[w.id]=buildVMWeapon(w.id);vmWeapons[w.id].visible=false;vmRoot.add(vmWeapons[w.id]);}
const muzzleTex=textureSet.particleFire;
const vmMuzzle=new THREE.Sprite(new THREE.SpriteMaterial({map:muzzleTex,color:0xffc060,transparent:true,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false}));vmMuzzle.scale.set(.35,.35,1);vmMuzzle.position.set(0,.08,-.92);vmMuzzle.visible=false;vmMuzzle.renderOrder=1000;vmRoot.add(vmMuzzle);
function triggerViewWeapon(w){if(!w)return;vmState.recoil=Math.min(1,vmState.recoil+(w.melee ? .65 : (.32+w.kick*5)));if(w.melee)vmState.swing=1;else if(!w.lightning)vmState.muzzle=.065;}
function updateWeaponViewModel(dt){
  const P=net.mode==='client'?player2:player;const w=P&&P.weapons?P.weapons[P.curWeapon]:null;vmRoot.visible=gameState==='playing'&&!!w&&P.alive;if(!w)return;
  if(vmState.id!==w.id){if(vmState.id&&vmWeapons[vmState.id])vmWeapons[vmState.id].visible=false;vmState.id=w.id;vmWeapons[w.id].visible=true;vmState.recoil=.7;}
  vmState.recoil=lerp(vmState.recoil,0,Math.min(1,dt*13));vmState.swing=lerp(vmState.swing,0,Math.min(1,dt*9));vmState.muzzle=Math.max(0,vmState.muzzle-dt);
  const bob=P.bobT||0,amp=(P.bobAmp||0)*2.4; const side=Math.cos(bob)*amp,up=Math.abs(Math.sin(bob))*amp;
  vmRoot.position.set(.36+side*.45,-.40-up*.22+vmState.recoil*.055,-.82+vmState.recoil*.22);
  vmRoot.rotation.set(-.035-vmState.recoil*.13+vmState.swing*.4,-.04-vmState.swing*.38,side*.18-vmState.swing*.7);
  vmMuzzle.visible=vmState.muzzle>0; if(vmMuzzle.visible){const q=vmState.muzzle/.065;vmMuzzle.material.opacity=q;const z=.30+q*.18;vmMuzzle.scale.set(z,z,1);}
}

/* AVATARS */
function buildAvatar(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.5) });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.24,0.7,12), mat);
  torso.position.y = 1.5; torso.castShadow=true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18,12,10), mat);
  head.position.y = 2.0; head.castShadow=true; g.add(head);
  const legs = [];
  for (const sx of [-1,1]) {
    const pv = new THREE.Group(); pv.position.set(sx*0.14,1.15,0);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.08,0.9,8), dark);
    leg.position.y=-0.45; leg.castShadow=true; pv.add(leg);
    g.add(pv); legs.push(pv);
  }
  const arms = [];
  for (const sx of [-1,1]) {
    const pv = new THREE.Group(); pv.position.set(sx*0.32,1.85,0);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.065,0.7,8), mat);
    arm.position.y=-0.35; arm.castShadow=true; pv.add(arm);
    g.add(pv); arms.push(pv);
  }
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08,0.08,0.5), dark);
  gun.position.set(0,-0.6,0.25); arms[1].add(gun);
  g.userData.limbs = { legs, arms };
  g.visible = false;
  return g;
}
player.avatar = buildAvatar(0x44aaff);
player.avatar.position.copy(player.pos); player.avatar.position.y = 0;
scene.add(player.avatar);
player2.avatar = buildAvatar(0xff8844);
player2.avatar.position.copy(player2.pos); player2.avatar.position.y = 0;
scene.add(player2.avatar);

/* SOULS / ULT */
const ultWaves = [];
const soulOrbs = [];
const SOUL_COLORS = { greek: 0x66ddff, undead: 0xaa66ff, olympian: 0xffcc44 };
function addSoul(P) {
  if (!P) return;
  P.souls = (P.souls || 0) + 1;
  if (P === player) {
    const s = P.souls;
    if (s === 1) addFeed('<span style="color:#66ddff">⚡ Первая душа! Жми Q</span>');
    else if (s === 10) addFeed('<span style="color:#66ddff">⚡ 10 душ</span>');
    else if (s === 25) addFeed('<span style="color:#ffd27a">⚡ 25 душ — большая сфера!</span>');
    else if (s === 50) addFeed('<span style="color:#ff8844">⚡ 50 — ЯРОСТЬ ОЛИМПА!</span>');
    else if (s === 100) addFeed('<span style="color:#ff4422">⚡ 100 ДУШ — БОГ ГНЕВА!</span>');
    updateUltHUD();
  }
}
function spawnSoulOrb(from, target, family) {
  if (!target) return;
  const color = SOUL_COLORS[family] || 0x66ddff;
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), mat);
  mesh.position.copy(from); scene.add(mesh);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28 }));
  mesh.add(halo);
  soulOrbs.push({ mesh, target, life: 3.5, t: 0, color });
}
function updateSoulOrbs(dt) {
  for (let i = soulOrbs.length - 1; i >= 0; i--) {
    const o = soulOrbs[i]; o.life -= dt; o.t += dt;
    if (o.t > 0.2) {
      const toT = new THREE.Vector3().subVectors(o.target.pos, o.mesh.position);
      toT.y += 1.2;
      const dist = toT.length();
      if (dist < 1.0) {
        burst(o.mesh.position.clone(), 6, { mat:'magic', speed:5, life:0.35, size:0.11, gravity:2 });
        scene.remove(o.mesh); soulOrbs.splice(i,1);
        SFX.soulPickup(); continue;
      }
      toT.normalize().multiplyScalar(Math.min(34, 6 + o.t * 26) * dt);
      o.mesh.position.add(toT);
      if (Math.random() < 0.6) spawnParticle(o.mesh.position.clone(), { mat:'magic', size:0.12, vel:new THREE.Vector3(rand(-0.5,0.5),rand(0.5,1.5),rand(-0.5,0.5)), life:0.4, gravity:-1, spin:false });
    } else o.mesh.position.y += dt * 3.5;
    o.mesh.rotation.y += dt * 10; o.mesh.rotation.x += dt * 8;
    if (o.life <= 0) { scene.remove(o.mesh); soulOrbs.splice(i,1); }
  }
}
function activateUlt(P) {
  if (!P) return;
  const souls = P.souls || 0;
  if (souls < 1) { addFeed('<span style="color:#c04040">НЕТ ДУШ</span>'); return; }
  P.souls = 0;
  if (P === player) updateUltHUD();
  SFX.ult();
  const dmg = (80 + souls * 55) * (P.upgrades ? P.upgrades.ultDmg : 1);
  let R = Math.min(65, 5 + souls * 1.15);
  if (P.upgrades && P.upgrades.sets && P.upgrades.sets.chaos) R *= 1.5;
  const isRage = souls >= 50, isBig = souls >= 25;
  showMsg(isRage ? '⚡ ЯРОСТЬ ОЛИМПА! ⚡' : (isBig ? '⚡ ГНЕВ ОЛИМПА ⚡' : '⚡ ГНЕВ ОЛИМПА'), 1500);
  addFeed(`<span style="color:#66ddff">⚡ ${souls} душ → ${Math.round(dmg)} урона · R ${Math.round(R)}</span>`);
  const sphereColor = isRage ? 0xffaa22 : (isBig ? 0x66ddff : 0x88ccff);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(1,24,16), new THREE.MeshBasicMaterial({ color: sphereColor, transparent:true, opacity:0.42, depthWrite:false, side:THREE.DoubleSide }));
  sphere.position.copy(P.pos); sphere.position.y += 0.6;
  scene.add(sphere);
  ultWaves.push({ mesh: sphere, life: 0.85, max: 0.85, delay: 0, R, isSphere: true });
  const cols = isRage ? [0xfff5cc,0xffcc44,0xff7722] : (isBig ? [0xffffff,0x88ddff,0x2299dd] : [0xffffff,0x88ccff,0x4488aa]);
  for (let k = 0; k < 3; k++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8,1.4,48), new THREE.MeshBasicMaterial({ color: cols[k], transparent:true, opacity:0.95, side:THREE.DoubleSide, depthWrite:false }));
    ring.rotation.x = -Math.PI/2;
    ring.position.copy(P.pos); ring.position.y = 0.4+k*0.15;
    scene.add(ring);
    ultWaves.push({ mesh: ring, life: 0.85+k*0.12, max: 0.85+k*0.12, delay: k*0.08, R, isSphere: false });
  }
  useFlashLight(P.pos.clone().setY(P.pos.y + 1.5), 70 + Math.min(120, souls*2.5), R*3, isRage ? 0xffbb66 : 0xaaeaff, 1.0);
  const pc = P.pos.clone(); pc.y += 0.6;
  for (const e of enemies) {
    if (e.dead) continue;
    const eCenter = e.mesh.position.clone(); eCenter.y += e.cfg.scale * 1.3;
    const d = eCenter.distanceTo(pc);
    if (d < R) damageEnemy(e, dmg * (1 - (d/R)*0.45), eCenter, P);
  }
  const pcount = Math.min(60, 20 + souls * 2);
  burst(P.pos.clone().setY(0.6), pcount, { mat:'magic', speed:22, life:0.9, size:0.22, gravity:6 });
  burst(P.pos.clone().setY(1.2), Math.floor(pcount*0.6), { mat:'gold', speed:16, life:1.0, size:0.16, gravity:3 });
  $('ultFlash').style.opacity = '1';
  setTimeout(() => { $('ultFlash').style.opacity = '0'; }, 180);
  if (net.mode === 'host') sendToPeer({ t:'event', e:{ t:'ult', p: P === player ? 1 : 2, R, rage: isRage } });
}
function updateUltWaves(dt) {
  for (let i = ultWaves.length-1; i >= 0; i--) {
    const w = ultWaves[i];
    if (w.delay > 0) { w.delay -= dt; w.mesh.scale.setScalar(0.01); continue; }
    w.life -= dt;
    if (w.life <= 0) {
      scene.remove(w.mesh);
      if (w.mesh.material && w.mesh.material.dispose) w.mesh.material.dispose();
      ultWaves.splice(i,1); continue;
    }
    const t = 1 - w.life / w.max;
    if (w.isSphere) { w.mesh.scale.setScalar(0.5 + t*w.R); w.mesh.material.opacity = (1-t)*0.5; }
    else { w.mesh.scale.setScalar(t * w.R); w.mesh.material.opacity = (w.life/w.max)*0.9; }
  }
}
function updateUltHUD() {
  const box = $('ultBox'); if (!box) return;
  const souls = player.souls || 0;
  const pct = clamp(souls/50, 0, 1);
  $('ultBar').firstElementChild.style.width = (pct*100) + '%';
  $('ultCount').textContent = 'ДУШ: ' + souls;
  box.classList.toggle('ready', souls > 0);
  if (souls >= 50) $('ultBar').firstElementChild.style.background = 'linear-gradient(90deg,#ff7722,#ffcc44,#fff5cc)';
  else if (souls >= 25) $('ultBar').firstElementChild.style.background = 'linear-gradient(90deg,#aa6622,#ffaa44,#ffddaa)';
  else $('ultBar').firstElementChild.style.background = 'linear-gradient(90deg,#2a6a8a,#66ccff,#ccf0ff)';
}

/* LEVELS */
let currentLevel = 0, ngPlus = 0;
const LEVELS = [
  { name:'ЛОКАЦИЯ С БАССЕЙНОМ', subtitle:'Главная арена.', skyTop:0x0d1226, skyMid:0x3a2418, skyBottom:0x8a4a1a, fog:0x2a1f14, fogNear:65, fogFar:200, sun:0xffb060, hemiSky:0x8899cc, hemiGround:0x3a2a18, hemiInt:0.6, floorTint:0xffffff, wallTint:0xffffff, colTint:0xffffff, types:['satyr','centaur','minotaur','harpy'], boss:'titan', bossName:'ТИТАН КРОНОС', story:'Священный бассейн стал последним рубежом.' },
  { name:'ТАРТАР', subtitle:'Подземное царство.', skyTop:0x040208, skyMid:0x2a0a18, skyBottom:0x5a0e20, fog:0x150510, fogNear:30, fogFar:130, sun:0xff4020, hemiSky:0x6633aa, hemiGround:0x1a0a0a, hemiInt:0.45, floorTint:0x8866aa, wallTint:0x775588, colTint:0x9977bb, types:['skeleton','skeleton_archer','cyclops','wraith'], boss:'cerberus', bossName:'ЦЕРБЕР', story:'Спустился во тьму.' },
  { name:'ЛАБИРИНТ', subtitle:'Обитель Минотавра.', skyTop:0x1a1410, skyMid:0x2a2018, skyBottom:0x4a3a20, fog:0x3a2a1a, fogNear:40, fogFar:150, sun:0xffaa66, hemiSky:0xaa8866, hemiGround:0x2a1a10, hemiInt:0.55, floorTint:0xd8c0a0, wallTint:0xc0a880, colTint:0xd8c0a0, types:['minotaur','guard_archer','chimera','gryphon'], boss:'hydra', bossName:'ГИДРА ЛЕРНЕЙСКАЯ', story:'Лабиринт не имеет конца.' },
  { name:'ЛЕДЯНАЯ ЦИТАДЕЛЬ', subtitle:'Северные пределы.', skyTop:0x0a1a3a, skyMid:0x4a7ab0, skyBottom:0xcce8ff, fog:0x8ab8e0, fogNear:55, fogFar:220, sun:0xcce8ff, hemiSky:0xddeeff, hemiGround:0x88aacc, hemiInt:0.8, floorTint:0xaaddff, wallTint:0xbbddff, colTint:0xddeeff, types:['skeleton','skeleton_archer','minotaur','gryphon'], boss:'titan', bossName:'ИМИР', story:'Здесь правит вечная мерзлота.' },
  { name:'ВЕРШИНА ОЛИМПА', subtitle:'Трон богов.', skyTop:0x4477bb, skyMid:0x99bbee, skyBottom:0xffe8cc, fog:0xbbddee, fogNear:70, fogFar:250, sun:0xfff0e0, hemiSky:0xddeeff, hemiGround:0xaabbcc, hemiInt:0.95, floorTint:0xfff0e0, wallTint:0xfff5e0, colTint:0xffffff, types:['chimera','guard_archer','cyclops','harpy'], boss:'hydra', bossName:'ТИФОН', story:'Финальная битва.' },
  { name:'АТЛАНТИДА', subtitle:'Подводное царство.', skyTop:0x001a3a, skyMid:0x0a4a7a, skyBottom:0x2a8aaa, fog:0x1a5a7a, fogNear:20, fogFar:110, sun:0x66ccff, hemiSky:0x66bbdd, hemiGround:0x0a3a4a, hemiInt:0.55, floorTint:0x66aacc, wallTint:0x4488aa, colTint:0x88ccee, types:['wraith','guard_archer','cyclops','gryphon'], boss:'cerberus', bossName:'ЛЕВИАФАН', story:'Воды Атлантиды.' },
  { name:'ОЛИМП', subtitle:'Обитель богов.', skyTop:0xffddaa, skyMid:0xffeecc, skyBottom:0xffffff, fog:0xfff0dd, fogNear:80, fogFar:280, sun:0xffffff, hemiSky:0xffffff, hemiGround:0xccccaa, hemiInt:1.1, floorTint:0xffffff, wallTint:0xffffee, colTint:0xffffff, types:['guard_archer','chimera','minotaur','gryphon'], boss:'hydra', bossName:'ЗЕВС РАЗГНЕВАННЫЙ', story:'Последний рубеж.' }
];
function applyLevel(idx) {
  const L = LEVELS[idx];
  skyMat.uniforms.top.value.setHex(L.skyTop);
  skyMat.uniforms.mid.value.setHex(L.skyMid);
  skyMat.uniforms.bottom.value.setHex(L.skyBottom);
  scene.fog.color.setHex(L.fog); scene.fog.near = L.fogNear; scene.fog.far = L.fogFar;
  sun.color.setHex(L.sun);
  hemi.color.setHex(L.hemiSky); hemi.groundColor.setHex(L.hemiGround); hemi.intensity = L.hemiInt;
  floorMat.color.setHex(L.floorTint);
  wallMat.color.setHex(L.wallTint);
  colMat.color.setHex(L.colTint);
  blockMat.color.setHex(L.wallTint);
  sunDisc.material.color.setHex(L.sun);
  moteMat.color.setHex(idx===1?0xff6844:(idx===3||idx===5?0x99ddff:0xffd59a));
  moteMat.opacity = idx===5 ? 0.45 : (idx===1 ? 0.32 : 0.24);
  for (const c of skyClouds) { c.material.color.setHex(idx===1?0x4a2030:(idx===5?0x2a789a:(idx===6?0xffffff:0xd9c8b5))); c.material.opacity = idx===5 ? 0.12 : (idx===1 ? 0.18 : 0.16); }
  $('levelName').textContent = L.name;
}

/* ENEMY TYPES */
const ENEMY_TYPES = {
  satyr: { name:'Сатир', hp:70, speed:5.0, damage:12, range:2.6, cooldown:1.05, scale:1.0, color:0x8b5a2b, score:100, hitR:0.9, melee:true, mass:1, family:'greek' },
  centaur: { name:'Кентавр-лучник', hp:130, speed:5.8, damage:16, range:34, cooldown:1.9, scale:1.2, color:0x9a6a3a, score:220, hitR:1.05, ranged:true, archer:true, mass:1.4, family:'greek', projSpeed:40 },
  harpy: { name:'Гарпия', hp:58, speed:6.6, damage:9, range:3.0, cooldown:1.0, scale:1.0, color:0xb04a28, score:140, hitR:0.9, melee:true, fly:true, flyH:3.2, mass:0.85, family:'greek' },
  minotaur: { name:'Минотавр', hp:520, speed:3.8, damage:30, range:3.8, cooldown:1.35, scale:1.85, color:0x4a2f1a, score:600, hitR:1.75, melee:true, mass:3, family:'greek' },
  titan: { name:'ТИТАН', hp:5200, speed:2.8, damage:46, range:5.2, cooldown:1.7, scale:4.0, color:0x5a3a20, score:6500, hitR:3.4, melee:true, ranged:true, boss:true, mass:12, projSpeed:30, family:'greek' },
  skeleton: { name:'Скелет', hp:85, speed:6.4, damage:12, range:2.8, cooldown:0.85, scale:1.05, color:0xe8dcc0, score:130, hitR:0.85, melee:true, mass:0.9, family:'undead' },
  skeleton_archer: { name:'Скелет-лучник', hp:80, speed:5.6, damage:14, range:36, cooldown:2.0, scale:1.05, color:0xe8dcc0, score:170, hitR:0.85, ranged:true, archer:true, mass:0.9, family:'undead', projSpeed:36 },
  wraith: { name:'Призрак', hp:95, speed:6.0, damage:13, range:3.0, cooldown:1.15, scale:1.1, color:0x9955cc, score:210, hitR:0.95, melee:true, fly:true, flyH:2.6, mass:0.7, family:'undead' },
  cyclops: { name:'Циклоп', hp:420, speed:2.9, damage:22, range:3.6, cooldown:1.65, scale:1.95, color:0x9a7b4f, score:450, hitR:1.85, melee:true, mass:3.5, family:'undead' },
  cerberus: { name:'ЦЕРБЕР', hp:4800, speed:4.2, damage:40, range:4.6, cooldown:1.1, scale:2.8, color:0x2a1010, score:7500, hitR:2.6, melee:true, ranged:true, boss:true, mass:10, projSpeed:26, family:'undead' },
  chimera: { name:'Химера', hp:320, speed:4.6, damage:20, range:3.6, cooldown:1.35, scale:1.65, color:0xd0662a, score:500, hitR:1.55, melee:true, mass:2.5, family:'olympian' },
  guard_archer: { name:'Страж Аполлона', hp:180, speed:5.4, damage:20, range:42, cooldown:1.6, scale:1.25, color:0xffcc88, score:340, hitR:1.1, ranged:true, archer:true, mass:1.5, family:'olympian', projSpeed:44 },
  gryphon: { name:'Грифон', hp:230, speed:7.0, damage:18, range:3.2, cooldown:0.95, scale:1.5, color:0xc9a55a, score:380, hitR:1.3, melee:true, fly:true, flyH:4.0, mass:1.4, family:'olympian' },
  hydra: { name:'ГИДРА', hp:6500, speed:2.8, damage:46, range:5.5, cooldown:1.6, scale:3.3, color:0x2a6a30, score:9500, hitR:2.9, melee:true, ranged:true, boss:true, mass:14, projSpeed:28, family:'olympian' }
};
const enemies = [];
const enemyHitMeshes = [];
let nextNetId = 1;
/* BUILDERS */
function buildModernBody(g, s, mat, dark, eyeMat, opts) {
  opts = opts || {};
  const bulky = opts.bulky || 1, hasBeard = opts.hasBeard || false;
  const skinMat = opts.skin || mat;
  const tag = m => { m.castShadow = true; g.userData.hitMeshes.push(m); return m; };
  const torso = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.55*s*bulky, 0.40*s*bulky, 1.30*s, 14), mat));
  torso.position.y = 1.62*s; torso.scale.set(1,1,0.78); g.add(torso);
  if (bulky > 1.2) for (const sx of [-1,1]) {
    const pec = tag(new THREE.Mesh(new THREE.SphereGeometry(0.30*s,12,10), mat));
    pec.position.set(sx*0.24*s, 1.85*s, 0.30*s); pec.scale.set(1,0.8,0.7); g.add(pec);
  }
  const waist = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.36*s,0.38*s,0.30*s,12), dark));
  waist.position.y = 1.02*s; waist.scale.set(1,1,0.78); g.add(waist);
  const hips = tag(new THREE.Mesh(new THREE.SphereGeometry(0.46*s,14,12), dark));
  hips.position.y = 0.82*s; hips.scale.set(1,0.72,0.78); g.add(hips);
  const neck = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.16*s,0.20*s,0.28*s,10), dark));
  neck.position.y = 2.32*s; g.add(neck);
  const skull = tag(new THREE.Mesh(new THREE.SphereGeometry(0.34*s,18,16), skinMat));
  skull.position.y = 2.65*s; skull.scale.set(0.92,1.05,0.96); g.add(skull);
  const jaw = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.20*s,0.14*s,0.20*s,10), skinMat));
  jaw.position.set(0,2.50*s,0.10*s); jaw.rotation.x = Math.PI; g.add(jaw);
  if (hasBeard) { const beard = new THREE.Mesh(new THREE.ConeGeometry(0.22*s,0.42*s,8), mat); beard.position.set(0,2.42*s,0.20*s); beard.rotation.x = Math.PI; g.add(beard); }
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.5*s,0.08*s,0.16*s), dark);
  brow.position.set(0,2.76*s,0.28*s); g.add(brow);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.09*s,0.22*s,6), skinMat);
  nose.position.set(0,2.65*s,0.32*s); nose.rotation.x = Math.PI/2*1.05; g.add(nose);
  for (const sx of [-1,1]) {
    const soc = new THREE.Mesh(new THREE.SphereGeometry(0.085*s,10,8), new THREE.MeshLambertMaterial({ color:0x1a1a1a }));
    soc.position.set(sx*0.13*s, 2.68*s, 0.28*s); g.add(soc);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.05*s,10,8), eyeMat);
    iris.position.set(sx*0.13*s, 2.68*s, 0.33*s); g.add(iris);
  }
  const arms = [];
  for (const sx of [-1,1]) {
    const pv = new THREE.Group(); pv.position.set(sx*0.68*s*bulky, 1.92*s, 0);
    const up = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.155*s,0.115*s,0.55*s,10), skinMat)); up.position.y = -0.28*s; pv.add(up);
    const el = tag(new THREE.Mesh(new THREE.SphereGeometry(0.13*s,8,8), skinMat)); el.position.y = -0.58*s; pv.add(el);
    const lo = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.115*s,0.10*s,0.50*s,10), skinMat)); lo.position.y = -0.87*s; pv.add(lo);
    const hand = tag(new THREE.Mesh(new THREE.SphereGeometry(0.11*s,8,8), dark)); hand.position.y = -1.16*s; hand.scale.set(1,0.85,1.15); pv.add(hand);
    g.add(pv); arms.push(pv);
  }
  const legs = [];
  for (const sx of [-1,1]) {
    const pv = new THREE.Group(); pv.position.set(sx*0.26*s, 0.82*s, 0);
    const th = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.19*s,0.145*s,0.52*s,10), skinMat)); th.position.y = -0.26*s; pv.add(th);
    const kn = tag(new THREE.Mesh(new THREE.SphereGeometry(0.135*s,8,8), dark)); kn.position.y = -0.55*s; pv.add(kn);
    const sh = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.135*s,0.10*s,0.50*s,10), skinMat)); sh.position.y = -0.83*s; pv.add(sh);
    const ft = tag(new THREE.Mesh(new THREE.BoxGeometry(0.22*s,0.13*s,0.36*s), dark)); ft.position.set(0,-1.10*s,0.08*s); pv.add(ft);
    g.add(pv); legs.push(pv);
  }
  return { torso, arms, legs };
}
function buildEnemyMesh(type) {
  const cfg = ENEMY_TYPES[type];
  const g = new THREE.Group();
  const s = cfg.scale;
  const col = new THREE.Color(cfg.color);
  const mat = new THREE.MeshLambertMaterial({ color: col });
  const dark = new THREE.MeshLambertMaterial({ color: col.clone().multiplyScalar(0.5) });
  const eye = new THREE.MeshBasicMaterial({ color: cfg.boss ? 0xff3020 : 0xffcc22 });
  g.userData.hitMeshes = [];
  const tag = m => { m.castShadow = true; g.userData.hitMeshes.push(m); return m; };
  if (type === 'skeleton' || type === 'skeleton_archer') {
    const bone = new THREE.MeshLambertMaterial({ color: 0xe8dcc0 });
    const spine = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.1*s,0.1*s,1.3*s,8), bone)); spine.position.y = 1.65*s; g.add(spine);
    for (let i=0;i<5;i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(0.26*s+i*0.02*s,0.03*s,5,12,Math.PI), bone); rib.position.y = 1.35*s+i*0.16*s; rib.rotation.x = Math.PI/2; rib.rotation.z = Math.PI/2; g.add(rib); }
    const skull = tag(new THREE.Mesh(new THREE.SphereGeometry(0.24*s,14,12), bone)); skull.position.y = 2.55*s; g.add(skull);
    for (const sx of [-1,1]) {
      const soc = new THREE.Mesh(new THREE.SphereGeometry(0.075*s,8,6), new THREE.MeshBasicMaterial({ color:0x080402 })); soc.position.set(sx*0.1*s, 2.58*s, 0.18*s); g.add(soc);
      const pup = new THREE.Mesh(new THREE.SphereGeometry(0.025*s,6,6), new THREE.MeshBasicMaterial({ color:0xff2020 })); pup.position.set(sx*0.1*s, 2.58*s, 0.23*s); g.add(pup);
    }
    const arms = [];
    for (const sx of [-1,1]) {
      const pv = new THREE.Group(); pv.position.set(sx*0.3*s, 2.05*s, 0);
      const up = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.05*s,0.045*s,0.5*s,8), bone)); up.position.y = -0.25*s; pv.add(up);
      const lo = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.045*s,0.04*s,0.45*s,8), bone)); lo.position.y = -0.7*s; pv.add(lo);
      g.add(pv); arms.push(pv);
    }
    const legs = [];
    for (const sx of [-1,1]) {
      const pv = new THREE.Group(); pv.position.set(sx*0.14*s, 0.95*s, 0);
      const up = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.06*s,0.055*s,0.55*s,8), bone)); up.position.y = -0.3*s; pv.add(up);
      const lo = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.055*s,0.045*s,0.55*s,8), bone)); lo.position.y = -0.85*s; pv.add(lo);
      const ft = tag(new THREE.Mesh(new THREE.BoxGeometry(0.16*s,0.1*s,0.26*s), bone)); ft.position.set(0,-1.15*s,0.05*s); pv.add(ft);
      g.add(pv); legs.push(pv);
    }
    if (type === 'skeleton_archer') {
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.55*s,0.045*s,6,12,Math.PI), new THREE.MeshLambertMaterial({ color:0x4a2a10 }));
      bow.position.set(0,-0.95*s,0.15*s); bow.rotation.z = Math.PI; arms[0].add(bow);
    } else {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05*s,1.0*s,0.1*s), new THREE.MeshLambertMaterial({ color:0x8a8a90 }));
      blade.position.set(0,-1.3*s,0.1*s); arms[1].add(blade);
    }
    g.userData.limbs = { arms, legs };
  }
  else if (type === 'wraith') {
    const cloak = tag(new THREE.Mesh(new THREE.ConeGeometry(0.85*s,2.4*s,14,1,true), new THREE.MeshLambertMaterial({ color: col, transparent:true, opacity:0.78, side:THREE.DoubleSide })));
    cloak.position.y = 1.7*s; g.add(cloak);
    const hood = tag(new THREE.Mesh(new THREE.SphereGeometry(0.42*s,14,12), new THREE.MeshLambertMaterial({ color:0x3a1a5a, transparent:true, opacity:0.9 })));
    hood.position.y = 2.55*s; g.add(hood);
    for (const sx of [-1,1]) { const glow = new THREE.Mesh(new THREE.SphereGeometry(0.075*s,8,6), new THREE.MeshBasicMaterial({ color:0xcc44ff })); glow.position.set(sx*0.14*s, 2.55*s, 0.34*s); g.add(glow); }
    g.userData.limbs = { arms:[], legs:[] };
  }
  else if (type === 'cerberus') {
    const body = tag(new THREE.Mesh(new THREE.CapsuleGeometry(0.85*s,1.5*s,8,16), mat));
    body.position.y = 1.5*s; body.rotation.z = Math.PI/2; g.add(body);
    const heads = [];
    for (const hp of [{x:-0.55,z:1.6,yaw:-0.35},{x:0,z:1.8,yaw:0},{x:0.55,z:1.6,yaw:0.35}]) {
      const hg = new THREE.Group(); hg.position.set(hp.x*s, 2.2*s, hp.z*s); hg.rotation.y = hp.yaw;
      const sk = tag(new THREE.Mesh(new THREE.SphereGeometry(0.32*s,14,12), mat)); hg.add(sk);
      const sn = tag(new THREE.Mesh(new THREE.CapsuleGeometry(0.16*s,0.28*s,6,10), mat)); sn.position.set(0,-0.05*s,0.42*s); sn.rotation.x = Math.PI/2; hg.add(sn);
      for (const sx of [-1,1]) { const ir = new THREE.Mesh(new THREE.SphereGeometry(0.035*s,8,6), eye); ir.position.set(sx*0.13*s, 0.1*s, 0.29*s); hg.add(ir); }
      g.add(hg); heads.push(hg);
    }
    const legs = [];
    for (const sx of [-1,1]) for (const sz of [-1,1]) {
      const pv = new THREE.Group(); pv.position.set(sx*0.55*s, 0.95*s, sz*0.85*s);
      const up = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.15*s,0.12*s,0.55*s,8), dark)); up.position.y = -0.28*s; pv.add(up);
      const lo = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.12*s,0.09*s,0.55*s,8), dark)); lo.position.y = -0.9*s; pv.add(lo);
      g.add(pv); legs.push(pv);
    }
    g.userData.limbs = { arms:null, legs, heads };
  }
  else if (type === 'chimera') {
    const body = tag(new THREE.Mesh(new THREE.CapsuleGeometry(0.62*s,1.4*s,8,14), mat));
    body.position.y = 1.5*s; body.rotation.z = Math.PI/2; g.add(body);
    const mane = tag(new THREE.Mesh(new THREE.SphereGeometry(0.75*s,14,12), new THREE.MeshLambertMaterial({ color:0x5a2a10 })));
    mane.position.set(0,2.0*s,1.15*s); g.add(mane);
    const head = tag(new THREE.Mesh(new THREE.SphereGeometry(0.55*s,16,14), mat)); head.position.set(0,2.3*s,1.35*s); g.add(head);
    for (const sx of [-1,1]) { const ir = new THREE.Mesh(new THREE.SphereGeometry(0.05*s,8,6), eye); ir.position.set(sx*0.2*s, 2.42*s, 1.68*s); g.add(ir); }
    const legs = [];
    for (const sx of [-1,1]) for (const sz of [-1,1]) {
      const pv = new THREE.Group(); pv.position.set(sx*0.42*s, 1.05*s, sz*0.7*s);
      const up = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.14*s,0.11*s,0.6*s,8), dark)); up.position.y = -0.3*s; pv.add(up);
      const lo = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.11*s,0.08*s,0.55*s,8), dark)); lo.position.y = -0.9*s; pv.add(lo);
      g.add(pv); legs.push(pv);
    }
    g.userData.limbs = { arms:null, legs };
  }
  else if (type === 'gryphon') {
    const body = tag(new THREE.Mesh(new THREE.CapsuleGeometry(0.45*s,1.0*s,8,12), mat));
    body.position.y = 1.55*s; body.rotation.z = Math.PI/2; g.add(body);
    const head = tag(new THREE.Mesh(new THREE.SphereGeometry(0.38*s,14,12), mat)); head.position.set(0,2.25*s,0.95*s); g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.13*s,0.35*s,6), new THREE.MeshLambertMaterial({ color:0xffaa22 }));
    beak.position.set(0,2.22*s,1.32*s); beak.rotation.x = Math.PI/2; g.add(beak);
    for (const sx of [-1,1]) { const ir = new THREE.Mesh(new THREE.SphereGeometry(0.05*s,8,6), eye); ir.position.set(sx*0.16*s, 2.35*s, 1.26*s); g.add(ir); }
    const wings = [];
    const wMat = new THREE.MeshLambertMaterial({ color:0x8a6a3a, side:THREE.DoubleSide });
    for (const sx of [-1,1]) {
      const pv = new THREE.Group(); pv.position.set(sx*0.5*s, 2.05*s, 0);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(2.4*s,1.1*s), wMat); w.position.x = sx*1.2*s; pv.add(w);
      g.add(pv); wings.push(pv);
    }
    const legs = [];
    for (const sx of [-1,1]) {
      const pv = new THREE.Group(); pv.position.set(sx*0.32*s, 1.1*s, 0.35*s);
      const leg = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.11*s,0.08*s,0.7*s,8), dark)); leg.position.y = -0.35*s; pv.add(leg);
      g.add(pv); legs.push(pv);
    }
    g.userData.limbs = { arms:null, legs, wings };
  }
  else if (type === 'hydra') {
    const body = tag(new THREE.Mesh(new THREE.SphereGeometry(1.7*s,16,14), mat));
    body.position.y = 1.4*s; body.scale.set(1.05,0.9,1.0); g.add(body);
    const heads = [];
    for (let i=0;i<7;i++) {
      const a = (i/7)*TAU;
      const hp = new THREE.Group(); hp.position.set(Math.cos(a)*1.3*s, 2.3*s, Math.sin(a)*1.3*s); hp.rotation.y = -a;
      const nk = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.15*s,0.24*s,1.6*s,10), new THREE.MeshLambertMaterial({ color: col.clone().multiplyScalar(0.85) })));
      nk.position.set(0,0.8*s,0.3*s); nk.rotation.x = -0.3; hp.add(nk);
      const sk = tag(new THREE.Mesh(new THREE.SphereGeometry(0.30*s,12,10), mat)); sk.position.set(0,1.65*s,0.65*s); hp.add(sk);
      for (const sx of [-1,1]) { const ir = new THREE.Mesh(new THREE.SphereGeometry(0.05*s,8,6), new THREE.MeshBasicMaterial({ color:0xffe000 })); ir.position.set(sx*0.11*s, 1.72*s, 0.86*s); hp.add(ir); }
      g.add(hp); heads.push(hp);
    }
    g.userData.limbs = { arms:null, legs:null, heads };
  }
  else if (type === 'guard_archer') {
    const gold = new THREE.MeshLambertMaterial({ color:0xffcc88 });
    const goldDark = new THREE.MeshLambertMaterial({ color:0x8a6030 });
    const torso = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.55*s,0.4*s,1.3*s,14), gold));
    torso.position.y = 1.62*s; torso.scale.set(1,1,0.8); g.add(torso);
    const skull = tag(new THREE.Mesh(new THREE.SphereGeometry(0.34*s,18,16), gold)); skull.position.y = 2.65*s; g.add(skull);
    for (const sx of [-1,1]) { const ir = new THREE.Mesh(new THREE.SphereGeometry(0.05*s,10,8), eye); ir.position.set(sx*0.13*s, 2.68*s, 0.33*s); g.add(ir); }
    const arms = [];
    for (const sx of [-1,1]) {
      const pv = new THREE.Group(); pv.position.set(sx*0.6*s, 1.92*s, 0);
      const a = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.15*s,0.11*s,0.55*s,10), gold)); a.position.y = -0.28*s; pv.add(a);
      const b = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.11*s,0.1*s,0.5*s,10), gold)); b.position.y = -0.85*s; pv.add(b);
      g.add(pv); arms.push(pv);
    }
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.6*s,0.055*s,6,16,Math.PI), new THREE.MeshBasicMaterial({ color:0xffd27a }));
    bow.position.set(0,-0.95*s,0.15*s); bow.rotation.z = Math.PI; arms[0].add(bow);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42*s,0.04*s,6,20), new THREE.MeshBasicMaterial({ color:0xfff0c0, transparent:true, opacity:0.85 }));
    halo.position.set(0,3.1*s,0); halo.rotation.x = Math.PI/2; g.add(halo);
    const legs = [];
    for (const sx of [-1,1]) {
      const pv = new THREE.Group(); pv.position.set(sx*0.26*s, 0.82*s, 0);
      const a = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.19*s,0.14*s,0.52*s,10), goldDark)); a.position.y = -0.26*s; pv.add(a);
      const b = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.14*s,0.1*s,0.5*s,10), goldDark)); b.position.y = -0.83*s; pv.add(b);
      g.add(pv); legs.push(pv);
    }
    g.userData.limbs = { arms, legs };
  }
  else {
    const bulky = type === 'titan' ? 1.6 : (type === 'minotaur' ? 1.45 : (type === 'cyclops' ? 1.7 : 1.0));
    const body = buildModernBody(g, s, mat, dark, eye, { bulky, hasBeard: type === 'satyr' || type === 'minotaur' });
    if (type === 'satyr' || type === 'minotaur' || type === 'titan') {
      const hm = new THREE.MeshLambertMaterial({ color:0xe8dcc0 });
      for (const sx of [-1,1]) {
        const h = new THREE.Mesh(new THREE.ConeGeometry(0.09*s,0.7*s,7), hm);
        h.position.set(sx*0.26*s, 2.9*s, 0);
        h.rotation.z = sx*0.6; h.rotation.x = -0.4; g.add(h);
      }
    }
    if (type === 'cyclops') {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.16*s,14,12), new THREE.MeshBasicMaterial({ color:0xffcc22 }));
      e.position.set(0,2.68*s,0.30*s); g.add(e);
    }
    let wings = null;
    if (type === 'harpy') {
      wings = [];
      const wMat = new THREE.MeshLambertMaterial({ color:0x8a3a1a, side:THREE.DoubleSide });
      for (const sx of [-1,1]) {
        const pv = new THREE.Group(); pv.position.set(sx*0.5*s, 2.05*s, -0.2*s);
        const w = new THREE.Mesh(new THREE.PlaneGeometry(2.4*s,1.2*s), wMat); w.position.x = sx*1.2*s; pv.add(w);
        g.add(pv); wings.push(pv);
      }
    }
    if (type === 'cyclops' || type === 'minotaur' || type === 'titan') {
      const cm = new THREE.MeshLambertMaterial({ color:0x3a2a1a });
      const club = new THREE.Mesh(new THREE.CylinderGeometry(0.15*s,0.42*s,2.2*s,7), cm);
      club.position.set(0,-1.6*s,0.2*s); body.arms[1].add(club);
    }
    g.userData.limbs = { arms: body.arms, legs: body.legs, wings };
  }
  // v16: keep the chunky primitive silhouettes, but render them with a cleaner single-room pool arena look.
  g.traverse(o => {
    if (!o.isMesh || !o.material || !o.material.isMeshLambertMaterial) return;
    const old=o.material;
    const nm=new THREE.MeshStandardMaterial({ color:old.color.clone(), map:old.map||null, transparent:old.transparent, opacity:old.opacity, side:old.side, roughness:cfg.boss?0.58:0.76, metalness:0.02 });
    o.material=nm;
  });
  g.userData.animT = Math.random()*10;
  return g;
}

/* HP BARS */
const barContainer = $('enemyBars');
const barPool = [];
function getBar(isBoss) {
  let b = barPool.pop();
  if (!b) {
    b = document.createElement('div'); b.className = 'ebar';
    const fill = document.createElement('i'); b.appendChild(fill);
    const nm = document.createElement('span'); nm.className = 'nm'; b.appendChild(nm);
    b._fill = fill; b._nm = nm;
  }
  b.className = 'ebar' + (isBoss ? ' boss' : '');
  b.style.width = isBoss ? '100px' : '54px'; b.style.height = isBoss ? '9px' : '6px';
  b._nm.style.display = isBoss ? 'block' : 'none';
  b._fill.style.width = '100%';
  barContainer.appendChild(b); return b;
}
function releaseBar(b) { if (!b || !b.parentNode) return; b.parentNode.removeChild(b); barPool.push(b); }
function updateEnemyBars() {
  if (net.mode === 'client') return;
  const camPos = camera.position;
  const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
  const tmp = new THREE.Vector3();
  for (const e of enemies) {
    if (!e.bar) continue;
    if (e.spawnT > 0 || e.dead) { e.bar.style.display = 'none'; continue; }
    tmp.copy(e.mesh.position); tmp.y += e.cfg.scale * 2.9;
    if (tmp.clone().sub(camPos).dot(camDir) <= 0.1) { e.bar.style.display = 'none'; continue; }
    const v = tmp.project(camera);
    if (v.z > 1) { e.bar.style.display = 'none'; continue; }
    e.bar.style.display = 'block';
    e.bar.style.left = ((v.x*0.5+0.5)*innerWidth)+'px';
    e.bar.style.top = ((-v.y*0.5+0.5)*innerHeight)+'px';
    const pct = clamp(e.hp/e.maxHp, 0, 1);
    e.bar._fill.style.width = (pct*100)+'%';
    if (e.cfg.boss) e.bar._fill.style.background = 'linear-gradient(90deg,#5a0010,#c01010,#ff3030)';
    else if (pct > 0.5) e.bar._fill.style.background = 'linear-gradient(90deg,#1a6a20,#3ac050)';
    else if (pct > 0.25) e.bar._fill.style.background = 'linear-gradient(90deg,#8a6a10,#e0c030)';
    else e.bar._fill.style.background = 'linear-gradient(90deg,#8a1010,#e04020)';
    e.bar.style.opacity = camPos.distanceTo(e.mesh.position) > 80 ? 0.35 : 1;
  }
}

/* MODIFIERS / WEATHER / ACHIEVEMENTS */
let activeModifier = null;
const MODIFIERS = [
  { id:'speed', name:'ГНЕВ ГЕРМЕСА', desc:'Враги быстрее на 30%' },
  { id:'tanky', name:'ПАНЦИРЬ ГЕИ', desc:'+50% HP' },
  { id:'frenzy', name:'ЯРОСТЬ АРЕСА', desc:'+40% урона врагам' },
  { id:'dark', name:'ТЬМА АИДА', desc:'Туман ближе' }
];
let currentWeather = null, weatherTimer = 0;
const WEATHERS = [
  { id:'bloodmoon', name:'КРОВАВАЯ ЛУНА', color:0x881111, desc:'Враги +30% урона, +20% скорости',
    start:()=>{ sun.color.setHex(0xff4422); scene.fog.color.setHex(0x3a0808); },
    end:()=>{ sun.color.setHex(LEVELS[currentLevel].sun); scene.fog.color.setHex(LEVELS[currentLevel].fog); } },
  { id:'storm', name:'ГРОЗА', color:0x88aaff, desc:'Молнии', start:()=>{}, end:()=>{} },
  { id:'sandstorm', name:'ПЕСЧАНАЯ БУРЯ', color:0xcc9966, desc:'Обзор 18 м',
    start:()=>{ scene.fog.near = 5; scene.fog.far = 18; },
    end:()=>{ scene.fog.near = LEVELS[currentLevel].fogNear; scene.fog.far = LEVELS[currentLevel].fogFar; } }
];
function rollWeather() {
  if (Math.random() < 0.4) { currentWeather = null; return; }
  currentWeather = pick(WEATHERS);
  currentWeather.start();
  showMsg(currentWeather.name, 2600);
  addFeed(`<span style="color:#88aaff">☁ ${currentWeather.name} — ${currentWeather.desc}</span>`);
}
function updateWeather(dt) {
  if (!currentWeather) return;
  weatherTimer -= dt;
  if (currentWeather.id === 'storm' && weatherTimer > 0 && Math.random() < dt * 1.2) {
    const a = Math.random() * TAU, r = rand(8, 20);
    const x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
    const pos = new THREE.Vector3(x, 0, z);
    burst(pos, 20, { mat:'magic', speed:12, life:0.5, size:0.2, gravity:6 });
    spawnBeam(new THREE.Vector3(x, 30, z), pos, 0x88ddff, 0.3, 0.3);
    useFlashLight(pos, 40, 25, 0x88ddff, 0.3);
    SFX.explode();
    for (const e of enemies) if (!e.dead && e.mesh.position.distanceTo(pos) < 4) damageEnemy(e, 60, e.mesh.position.clone(), player);
  }
  if (weatherTimer <= 0) { if (currentWeather.end) currentWeather.end(); currentWeather = null; }
}
const ACH_KEY = 'wrath_ach_v1';
function loadAch() { try { return JSON.parse(localStorage.getItem(ACH_KEY) || '{}'); } catch(_) { return {}; } }
function saveAch(a) { try { localStorage.setItem(ACH_KEY, JSON.stringify(a)); } catch(_) {} }
const ACHIEVEMENTS = [
  { id:'first_blood', name:'Первая кровь', desc:'Убей первого монстра' },
  { id:'titan_slayer', name:'Титанический', desc:'Убей босса' },
  { id:'no_damage_wave', name:'Неприкосновенный', desc:'Волна без урона' },
  { id:'souls_50', name:'Коллекционер душ', desc:'50 душ' },
  { id:'elite_killer', name:'Элитный охотник', desc:'10 элитных' },
  { id:'streak_god', name:'БОГ ВОЙНЫ', desc:'30 за 3 сек' },
  { id:'all_weapons', name:'Арсенал', desc:'Всё оружие' },
  { id:'hard_clear', name:'Кошмар пройден', desc:'10-я волна на Кошмаре' }
];
function unlockAch(id) {
  const a = loadAch(); if (a[id]) return;
  a[id] = Date.now(); saveAch(a);
  const def = ACHIEVEMENTS.find(x => x.id === id);
  if (def) {
    showMsg('★ ' + def.name, 2000);
    addFeed(`<span style="color:#ffd27a;font-weight:bold">🏆 ДОСТИЖЕНИЕ: ${def.name}</span>`);
    tone(880, 0.2, 'sine', 0.22);
    setTimeout(() => tone(1100, 0.3, 'sine', 0.22), 150);
  }
}
let achState = { eliteKills: 0, waveStartTookDamage: false };
const DIFFICULTIES = {
  easy: { name:'ЛЕГКО', hpMul:0.8, dmgMul:0.8, spawnMul:0.85, creditMul:0.7 },
  normal: { name:'ОБЫЧНО', hpMul:1.0, dmgMul:1.0, spawnMul:1.0, creditMul:1.0 },
  hard: { name:'КОШМАР', hpMul:1.5, dmgMul:1.35, spawnMul:1.15, creditMul:2.0 }
};
let currentDiff = 'normal', dailyMode = false, dailySeed = 0;

/* SPAWN */
function spawnEnemy(type, pos) {
  const cfg = ENEMY_TYPES[type];
  const mesh = buildEnemyMesh(type);
  mesh.position.copy(pos);
  if (cfg.fly) mesh.position.y = cfg.flyH;
  mesh.traverse(o => { if (o.isMesh) o.castShadow = false; });
  scene.add(mesh);
  for (const hm of mesh.userData.hitMeshes) enemyHitMeshes.push(hm);
  markRayTargetsDirty();
  const diff = DIFFICULTIES[currentDiff];
  const hpScale = (1 + (wave-1)*0.08) * (1 + ngPlus*0.8) * diff.hpMul;
  const eliteChance = wave >= 5 ? Math.min(0.28, 0.10 + (wave-5)*0.012) : 0;
  const isElite = !cfg.boss && Math.random() < eliteChance;
  const e = {
    type, cfg, mesh, netId: nextNetId++,
    hp: cfg.hp*hpScale, maxHp: cfg.hp*hpScale, radius: cfg.hitR*0.55,
    vel: new THREE.Vector3(), atkCd: rand(0.3,1.2),
    hurtT: 0, dead: false, animT: Math.random()*10,
    strafe: Math.random()<0.5?1:-1, strafeT: rand(0.6,2.2),
    spawnT: 0.55, bar: null,
    phase2: false, phase3: false, windup: 0,
    status: { burn: 0, freeze: 0, poison: 0 },
    _burnTick: 0, _poisonTick: 0,
    _dmgMul: diff.dmgMul, _speedMul: 1
  };
  if (currentWeather && currentWeather.id === 'bloodmoon') { e._dmgMul *= 1.3; e._speedMul *= 1.2; }
  if (activeModifier) {
    if (activeModifier.id === 'speed') e._speedMul *= 1.3;
    if (activeModifier.id === 'tanky') { e.hp *= 1.5; e.maxHp *= 1.5; }
    if (activeModifier.id === 'frenzy') e._dmgMul *= 1.4;
  }
  if (isElite) {
    e.isElite = true; e.hp *= 3; e.maxHp *= 3; e._dmgMul *= 1.5;
    mesh.traverse(o => {
      if (o.isMesh && o.material && o.material.emissive) {
        if (!o.material._statusClone) { o.material = o.material.clone(); o.material._statusClone = true; }
        o.material.emissive.setHex(0x661111);
        o.material.emissiveIntensity = 1.0;
      }
    });
    const aura = new THREE.Mesh(new THREE.SphereGeometry(cfg.scale * 1.4, 12, 8), new THREE.MeshBasicMaterial({ color:0xff2222, transparent:true, opacity:0.08, side:THREE.BackSide }));
    aura.position.y = cfg.scale * 1.5; mesh.add(aura);
  }
  // Предклонируем материалы — чтобы первое попадание не подвисало
  for (const hm of mesh.userData.hitMeshes) {
    if (hm.material.emissive && !hm.material._statusClone) {
      hm.material = hm.material.clone();
      hm.material._statusClone = true;
    }
  }
  for (const hm of mesh.userData.hitMeshes) hm.userData.enemyRef = e;
  e.bar = getBar(cfg.boss);
  e.bar._nm.textContent = (isElite ? '★ ' : '') + (cfg.boss ? LEVELS[currentLevel].bossName : cfg.name);
  enemies.push(e);
  burst(mesh.position.clone().setY(mesh.position.y*0.5+0.5), 6, { mat:'magic', speed:6, life:0.5, size:0.13, gravity:4 });
  SFX.spawn();
  return e;
}

/* PROJECTILES */
const projectiles = [];
const rocketGeo = new THREE.ConeGeometry(0.22,0.85,7);
const fireballGeo = new THREE.SphereGeometry(0.42,10,8);
const arrowGeo = new THREE.CylinderGeometry(0.03,0.03,0.9,5);
function spawnProjectile(from, dir, speed, owner, opts) {
  opts = opts || {};
  const { damage=40, splash=0, color=null, size=1, homing=false, kind=null } = opts;
  let mesh;
  if (kind === 'arrow') {
    mesh = new THREE.Mesh(arrowGeo, new THREE.MeshLambertMaterial({ color:0x9a6a3a }));
    mesh.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
  } else if (owner === 'player') {
    mesh = new THREE.Mesh(rocketGeo, new THREE.MeshBasicMaterial({ color:0xff6633 }));
    mesh.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
  } else {
    mesh = new THREE.Mesh(fireballGeo, new THREE.MeshBasicMaterial({ color: color||0xff7722 }));
    mesh.scale.setScalar(size);
  }
  mesh.position.copy(from);
  scene.add(mesh);
  projectiles.push({ mesh, dir: dir.clone().normalize(), speed, owner, damage, splash, life: 5, homing });
}
function explode(pos, R, dmg, source) {
  source = source || 'player';
  if (net.mode === 'host') netEvent('explode', { x: pos.x, y: pos.y, z: pos.z, r: R });
  SFX.explode();
  burst(pos, 14, { mat:'fire', speed:14, life:0.55, size:0.3, gravity:12 });
  burst(pos, 8, { mat:'smoke', speed:6, life:1.0, size:0.55, gravity:-2, spin:false });
  burst(pos, 6, { mat:'stone', speed:10, life:0.8, size:0.16, gravity:24 });
  useFlashLight(pos, 30, R*3, 0xffaa44, 0.32);
  if (source === 'player') {
    for (const e of enemies) {
      if (e.dead) continue;
      const d = e.mesh.position.distanceTo(pos);
      if (d < R + e.radius) damageEnemy(e, dmg*(0.35 + (1 - clamp((d-e.radius)/R,0,1))*0.65), pos, player);
    }
  } else {
    const P = player.alive ? player : (player2.alive ? player2 : null);
    if (P) {
      const d = P.pos.distanceTo(pos);
      if (d < R + 0.8) damagePlayer(P, dmg*(0.35 + (1 - clamp((d-0.8)/R,0,1))*0.65));
    }
  }
}
function updateProjectiles(dt) {
  for (let i = projectiles.length-1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    if (p.homing && p.owner !== 'player') {
      const P = player.alive ? player : (player2.alive ? player2 : null);
      if (P) { const des = new THREE.Vector3(P.pos.x, P.pos.y-0.2, P.pos.z).sub(p.mesh.position).normalize(); p.dir.lerp(des, 1.6*dt).normalize(); }
    }
    p.mesh.position.addScaledVector(p.dir, p.speed*dt);
    let hit = false;
    const mp = p.mesh.position;
    if (p.owner === 'player') {
      for (const e of enemies) {
        if (e.dead) continue;
        const c = e.mesh.position.clone(); c.y += e.cfg.scale*1.3;
        if (mp.distanceTo(c) < e.radius + 0.6) { hit = true; break; }
      }
    } else {
      if (player.alive && mp.distanceTo(player.pos) < 0.95) hit = true;
      if (!hit && player2.alive && net.mode === 'host' && mp.distanceTo(player2.pos) < 0.95) hit = true;
    }
    if (!hit && (mp.y < 0.15 || mp.x < -ARENA || mp.x > ARENA || Math.abs(mp.z) > ARENA)) hit = true;
    if (!hit) for (const c of circleColliders) if (Math.hypot(mp.x-c.x, mp.z-c.z) < c.r + 0.3) { hit = true; break; }
    if (hit || p.life <= 0) {
      if (p.splash > 0) explode(mp.clone(), p.splash, p.damage, p.owner);
      else {
        burst(mp.clone(), 6, { mat: p.owner==='player'?'stone':'fire', speed:5, life:0.4, size:0.12 });
        if (p.owner !== 'player') {
          if (player.alive && player.pos.distanceTo(mp) < 1.4) damagePlayer(player, p.damage);
          else if (player2.alive && net.mode === 'host' && player2.pos.distanceTo(mp) < 1.4) damagePlayer(player2, p.damage);
        }
      }
      scene.remove(p.mesh);
      projectiles.splice(i,1);
    }
  }
}

/* GRENADES */
const grenades = [];
function throwGrenade(P, cam) {
  if (!P || !P.alive) return;
  if (P.grenades == null) P.grenades = 3;
  if (P.grenades <= 0) { addFeed('<span style="color:#c04040">НЕТ ГРАНАТ</span>'); return; }
  P.grenades--;
  const origin = cam.getWorldPosition(tmpV1).clone();
  const dir = getAimDir(cam, 0);
  const vel = dir.clone().multiplyScalar(22); vel.y += 8;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.18,10,8), new THREE.MeshLambertMaterial({ color:0x3a5a2a, emissive:0x110800 }));
  mesh.position.copy(origin); scene.add(mesh);
  grenades.push({ mesh, vel, life: 2.5, owner: P });
  SFX.reload();
}
function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.life -= dt; g.vel.y -= 20*dt;
    g.mesh.position.addScaledVector(g.vel, dt);
    if (g.mesh.position.y < 0.18) { g.mesh.position.y = 0.18; g.vel.y = Math.abs(g.vel.y)*0.4; g.vel.x *= 0.7; g.vel.z *= 0.7; }
    g.mesh.rotation.x += dt * 10; g.mesh.rotation.y += dt * 12;
    if (g.life <= 0) {
      const pos = g.mesh.position.clone();
      scene.remove(g.mesh);
      const R = 7;
      for (const e of enemies) {
        if (e.dead) continue;
        const d = e.mesh.position.distanceTo(pos);
        if (d < R + e.radius) {
          const falloff = 1 - clamp((d - e.radius) / R, 0, 1);
          damageEnemy(e, 180 * (0.4 + falloff*0.6), pos, g.owner);
          if (e.status) e.status.burn = Math.max(e.status.burn, 2);
        }
      }
      SFX.explode();
      burst(pos, 16, { mat:'fire', speed:15, life:0.6, size:0.32, gravity:12 });
      burst(pos, 8, { mat:'smoke', speed:7, life:1.1, size:0.55, gravity:-2, spin:false });
      useFlashLight(pos, 40, 30, 0xffaa44, 0.4);
      if (net.mode === 'host') netEvent('explode', { x: pos.x, y: pos.y, z: pos.z, r: R });
      grenades.splice(i, 1);
    }
  }
}

/* PICKUPS + POWERUPS */
const pickups = [];
const pickupGeo = new THREE.OctahedronGeometry(0.42,0);
const PICKUP_DEF = {
  health: { color:0x22cc55, emissive:0x0a3a12 },
  armor: { color:0x2299ff, emissive:0x0a2a4a },
  ammo: { color:0xffcc33, emissive:0x4a3a0a }
};
function spawnPickup(type, pos) {
  const def = PICKUP_DEF[type];
  const mesh = new THREE.Mesh(pickupGeo, new THREE.MeshLambertMaterial({ color: def.color, emissive: def.emissive, emissiveIntensity: 1.4 }));
  mesh.position.copy(pos); mesh.position.y = 1.0; scene.add(mesh);
  const halo = new THREE.PointLight(def.color, 1.6, 6, 2);
  halo.position.y = 0.1; mesh.add(halo);
  pickups.push({ type, mesh, t: 0, life: 26 });
}
function updatePickups(dt) {
  for (let i = pickups.length-1; i >= 0; i--) {
    const p = pickups[i];
    p.t += dt; p.life -= dt;
    p.mesh.rotation.y += dt*2.4;
    p.mesh.position.y = 1.0 + Math.sin(p.t*3)*0.22;
    let got = false;
    if (player.alive && p.mesh.position.distanceTo(player.pos) < 1.9) { applyPickup(p.type, player); got = true; }
    if (!got && net.mode === 'host' && player2.alive && p.mesh.position.distanceTo(player2.pos) < 1.9) { applyPickup(p.type, player2); got = true; }
    if (got) { burst(p.mesh.position.clone(), 10, { mat:'gold', speed:5, life:0.4, size:0.12, gravity:4 }); scene.remove(p.mesh); pickups.splice(i,1); SFX.pickup(); continue; }
    if (p.life <= 0) { scene.remove(p.mesh); pickups.splice(i,1); }
  }
}
function applyPickup(type, P) {
  if (type === 'health') { P.hp = Math.min(P.maxHp, P.hp+30); if (P === player) flashHeal(); }
  else if (type === 'armor') P.armor = Math.min(P.maxArmor, P.armor+30);
  else if (type === 'ammo') {
    P.grenades = Math.min(6, (P.grenades || 0) + 1);
    for (const w of P.weapons) if (w.unlocked) w.ammo = Math.min(w.ammoMax, w.ammo + Math.ceil(w.ammoMax*0.22));
  }
  updateHUD();
}
const powerups = [];
const POWERUP_DEF = {
  quad: { color:0xffaa22, label:'×3 УРОН', duration:15 },
  haste: { color:0x66ccff, label:'+50% ТЕМП', duration:10 },
  regen: { color:0x66ff88, label:'РЕГЕНЕРАЦИЯ', duration:8 },
  invuln: { color:0xffaaee, label:'НЕУЯЗВИМОСТЬ', duration:5 }
};
function spawnPowerup(type, pos) {
  const def = POWERUP_DEF[type];
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: def.color }));
  mesh.position.copy(pos); mesh.position.y = 1.2; scene.add(mesh);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.85,10,8), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.22 }));
  mesh.add(halo);
  powerups.push({ type, mesh, t: 0, life: 22 });
}
function updatePowerups(dt) {
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    p.t += dt; p.life -= dt;
    p.mesh.rotation.y += dt * 2.5;
    p.mesh.rotation.x += dt * 1.8;
    p.mesh.position.y = 1.2 + Math.sin(p.t*3)*0.25;
    let got = null;
    if (player.alive && p.mesh.position.distanceTo(player.pos) < 2.2) got = player;
    else if (net.mode === 'host' && player2.alive && p.mesh.position.distanceTo(player2.pos) < 2.2) got = player2;
    if (got) { applyPowerup(p.type, got); burst(p.mesh.position.clone(), 20, { mat:'gold', speed:8, life:0.6, size:0.2, gravity:4 }); scene.remove(p.mesh); powerups.splice(i,1); SFX.pickup(); continue; }
    if (p.life <= 0) { scene.remove(p.mesh); powerups.splice(i,1); }
  }
}
function applyPowerup(type, P) {
  const def = POWERUP_DEF[type];
  if (!P.powerups) P.powerups = {};
  P.powerups[type] = def.duration;
  addFeed(`<span style="color:#ffd27a">⚡ ${def.label} на ${def.duration} сек</span>`);
  if (player === P) shakeScreen(2, 0.15);
}
function updatePowerupTimers(dt) {
  const check = P => {
    if (!P.powerups) P.powerups = {};
    for (const k in P.powerups) { P.powerups[k] -= dt; if (P.powerups[k] <= 0) delete P.powerups[k]; }
  };
  check(player);
  if (net.mode === 'host') check(player2);
}
function hasPowerup(P, type) { return P && P.powerups && P.powerups[type] > 0; }

/* COMBO / STREAK */
let combo = 0, comboTimer = 0;
const COMBO_WINDOW = 3.0;
let streakCount = 0, streakTimer = 0;
const STREAK_LEVELS = [
  { n: 5, text: 'RAMPAGE!', color: '#ffaa22', slow: 0 },
  { n: 10, text: 'DOMINATING!', color: '#ff6622', slow: 0 },
  { n: 20, text: 'GODLIKE!', color: '#ff2222', slow: 0.3 },
  { n: 30, text: 'БОГ ВОЙНЫ!', color: '#ffdd44', slow: 0.5 }
];
function announceStreak(text, color) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;top:32%;left:50%;transform:translateX(-50%);font-size:64px;letter-spacing:8px;color:${color};font-weight:bold;text-shadow:0 0 30px ${color},0 4px 0 #000;z-index:15;pointer-events:none;opacity:0;transition:opacity .2s;`;
  el.textContent = text;
  $('hud').appendChild(el);
  setTimeout(() => el.style.opacity = '1', 30);
  setTimeout(() => el.style.opacity = '0', 1200);
  setTimeout(() => el.remove(), 1500);
  tone(440, 0.15, 'square', 0.2, 880);
  setTimeout(() => tone(660, 0.2, 'square', 0.22, 1320), 120);
  setTimeout(() => tone(880, 0.3, 'square', 0.18, 1760), 260);
}
function updateCombo(dt) {
  if (comboTimer > 0) {
    comboTimer -= dt;
    $('comboTimer').style.width = (comboTimer / COMBO_WINDOW * 100) + '%';
    if (comboTimer <= 0) { combo = 0; hideComboBox(); }
  }
}
function updateStreak(dt) {
  if (streakTimer > 0) {
    streakTimer -= dt;
    if (streakTimer <= 0) streakCount = 0;
  }
}
function updateComboBox(m) { $('comboBox').classList.add('on'); $('comboNum').innerHTML = 'x' + m.toFixed(1); }
function hideComboBox() { $('comboBox').classList.remove('on'); }

/* DAMAGE / KILL */
function damageEnemy(e, amount, hitPos, attacker) {
  if (e.dead) return;
  e.hp -= amount;
  e.hurtT = 0.10;
  if (hitPos && Math.random() < 0.35) {
    burst(hitPos.clone(), 1, { mat: e.cfg.family==='undead'?'ghost':'blood', speed:5, life:0.3, size:0.09, gravity:14 });
  }
  const isCrit = Math.random() < 0.15;
  if (isCrit) e.hp -= amount * 0.5;
  if (hitPos && attacker === player && (isCrit || amount >= 40 || dmgNumbers.length < 12)) {
    spawnDmgNumber(hitPos.clone(), isCrit ? amount*1.5 : amount, isCrit);
  }
  if (isCrit) { hitStop(0.05); shakeScreen(3, 0.12); }
  else shakeScreen(0.6, 0.08);
  SFX.hitFlesh();
  if (e.hp <= 0) killEnemy(e, attacker);
}
function killEnemy(e, attacker) {
  if (e.dead) return;
  e.dead = true;
  const p = e.mesh.position.clone(); p.y += e.cfg.scale*1.4;
  burst(p, e.cfg.boss?26:12, { mat: e.cfg.family==='undead'?'ghost':'blood', speed: e.cfg.boss?12:9, life:0.7, size:0.16, gravity:20 });
  burst(p, 8, { mat:'blood2', speed:7, life:0.6, size:0.14, gravity:22 });
  if (e.cfg.family !== 'undead') spawnDecal(new THREE.Vector3(e.mesh.position.x,0.025,e.mesh.position.z), UP, 'blood', e.cfg.boss?rand(3.0,4.2):rand(1.0,1.8));
  releaseBar(e.bar); e.bar = null;
  scene.remove(e.mesh);
  const idx = enemies.indexOf(e);
  if (idx >= 0) enemies.splice(idx,1);
  for (let i = enemyHitMeshes.length-1; i >= 0; i--) if (enemyHitMeshes[i].userData.enemyRef === e) enemyHitMeshes.splice(i,1);
  markRayTargetsDirty();
  SFX.die();
  shakeScreen(e.cfg.boss ? 8 : 3, e.cfg.boss ? 0.4 : 0.18);
  kills++;
  if (kills === 1) unlockAch('first_blood');
  if (e.cfg.boss) unlockAch('titan_slayer');
  if (e.isElite) { achState.eliteKills++; if (achState.eliteKills >= 10) unlockAch('elite_killer'); }
  combo++;
  comboTimer = COMBO_WINDOW;
  streakCount++;
  streakTimer = 3.5;
  const lvl = STREAK_LEVELS.find(s => s.n === streakCount);
  if (lvl) { announceStreak(lvl.text, lvl.color); if (lvl.slow > 0) hitStop(lvl.slow); }
  if (streakCount >= 30) unlockAch('streak_god');
  const multiplier = Math.min(5, 1 + Math.floor(combo / 3) * 0.5);
  const eliteMul = e.isElite ? 3 : 1;
  score += Math.floor(e.cfg.score * multiplier * eliteMul);
  if (combo >= 3) updateComboBox(multiplier);
  const dispName = (e.isElite ? '★ ' : '') + (e.cfg.boss ? LEVELS[currentLevel].bossName : e.cfg.name);
  addFeed(`☠ ${dispName} <span style="color:#a08a68">+${Math.floor(e.cfg.score * multiplier * eliteMul)}</span>`);
  if (net.mode === 'host') netEvent('feed', { html: `☠ ${dispName} +${Math.floor(e.cfg.score * multiplier * eliteMul)}` });
  if (attacker && attacker.upgrades) {
    if (attacker.upgrades.lifesteal) attacker.hp = Math.min(attacker.maxHp, attacker.hp + attacker.upgrades.lifesteal);
    if (attacker.upgrades.bloodFeast) attacker.hp = Math.min(attacker.maxHp, attacker.hp + 2);
    if (attacker.upgrades.sets && attacker.upgrades.sets.blood) attacker.hp = Math.min(attacker.maxHp, attacker.hp + 5);
    addSoul(attacker);
    spawnSoulOrb(p.clone(), attacker, e.cfg.family);
  }
  const roll = Math.random();
  if (e.cfg.boss) {
    spawnPickup('health', p.clone().setY(1));
    spawnPickup('armor', p.clone().add(new THREE.Vector3(2.5,0,0)).setY(1));
    spawnPickup('ammo', p.clone().add(new THREE.Vector3(-2.5,0,0)).setY(1));
    spawnPowerup('quad', p.clone().add(new THREE.Vector3(0,0,3)).setY(1));
    spawnPowerup('invuln', p.clone().add(new THREE.Vector3(0,0,-3)).setY(1));
  } else if (roll < 0.14) spawnPickup('health', p.clone().setY(1));
  else if (roll < 0.26) spawnPickup('armor', p.clone().setY(1));
  else if (roll < 0.44) spawnPickup('ammo', p.clone().setY(1));
  if (e.isElite) spawnPowerup(pick(['quad','haste','regen','invuln']), p.clone().setY(1));
  if (companion && Math.random() < 0.3) companionSay(pick(COMPANION_KILL), 2000);
  updateHUD();
}
function damagePlayer(P, amount) {
  if (!P || !P.alive || P.invuln > 0) return;
  if (hasPowerup(P, 'invuln')) return;
  achState.waveStartTookDamage = true;
  let dmg = amount;
  if (P.armor > 0) { const ab = Math.min(P.armor, dmg*0.65); P.armor -= ab; dmg -= ab; }
  P.hp -= dmg;
  P.invuln = 0.18;
  if (P === player) flashDamage();
  SFX.hurt();
  if (P.hp <= 0) {
    P.hp = 0; P.alive = false;
    if (net.mode === 'host') { if (!player.alive && !player2.alive) gameOver(); }
    else gameOver();
  }
  updateHUD();
}

/* ENEMY AI */
function updateEnemies(dt) {
  for (const e of enemies) {
    const cfg = e.cfg, m = e.mesh;
    e.animT += dt;
    if (e.status) {
      if (e.status.burn > 0) {
        e.status.burn -= dt;
        e._burnTick += dt;
        if (e._burnTick >= 0.5) {
          e._burnTick = 0;
          e.hp -= 6;
          burst(m.position.clone().setY(cfg.scale*1.5), 2, { mat:'fire', speed:3, life:0.3, size:0.11, gravity:-1, spin:false });
          if (e.hp <= 0) { killEnemy(e, player); continue; }
        }
      }
      if (e.status.poison > 0) {
        e.status.poison -= dt;
        e._poisonTick += dt;
        if (e._poisonTick >= 1.0) {
          e._poisonTick = 0;
          e.hp -= 4;
          if (e.hp <= 0) { killEnemy(e, player); continue; }
        }
      }
      if (e.status.freeze > 0) e.status.freeze -= dt;
    }
    if (e.hurtT > 0) e.hurtT -= dt;
    if (e.spawnT > 0) {
      e.spawnT -= dt;
      m.scale.setScalar(0.2 + (1 - e.spawnT/0.55)*0.8);
      continue;
    }
    m.scale.setScalar(1);
    if (cfg.boss && !e.phase2 && e.hp/e.maxHp < 0.7) {
      e.phase2 = true;
      cfg.speed = (cfg.speed||2.5)*1.3;
      cfg.cooldown = (cfg.cooldown||1.8)*0.75;
      showMsg('⚠ ФАЗА 2 ⚠', 1500);
      burst(m.position.clone().setY(3), 40, { mat:'fire', speed:12, life:0.9, size:0.3, gravity:8 });
      useFlashLight(m.position.clone().setY(3), 60, 40, 0xff4020, 0.5);
    }
    if (cfg.boss && !e.phase3 && e.hp/e.maxHp < 0.4) {
      e.phase3 = true;
      cfg.speed = (cfg.speed||3)*1.25;
      cfg.cooldown = (cfg.cooldown||1.5)*0.6;
      showMsg('☠ ЯРОСТЬ ☠', 1500);
      burst(m.position.clone().setY(3), 60, { mat:'blood', speed:14, life:1.1, size:0.35, gravity:8 });
      useFlashLight(m.position.clone().setY(3), 80, 50, 0xff2020, 0.7);
    }
    if (e.windup > 0) {
      e.windup -= dt;
      m.rotation.z = Math.sin(e.animT * 40) * 0.05;
      if (e.windup <= 0) m.rotation.z = 0;
    }
    let target = null;
    if (player.alive && player2.alive) target = player.pos.distanceTo(m.position) < player2.pos.distanceTo(m.position) ? player : player2;
    else if (player.alive) target = player;
    else if (player2.alive && net.mode === 'host') target = player2;
    if (!target) continue;
    const toPlayer = new THREE.Vector3().subVectors(target.pos, m.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    const dirToPlayer = dist > 0.001 ? toPlayer.clone().divideScalar(dist) : new THREE.Vector3(1,0,0);
    const targetYaw = Math.atan2(dirToPlayer.x, dirToPlayer.z);
    let dy = targetYaw - m.rotation.y;
    while (dy > Math.PI) dy -= TAU;
    while (dy < -Math.PI) dy += TAU;
    m.rotation.y += dy * Math.min(1, dt*7);
    let spd = 0;
    const moveDir = new THREE.Vector3();
    if (cfg.archer) {
      const ideal = cfg.range * 0.65;
      if (dist > ideal+3) { moveDir.copy(dirToPlayer); spd = cfg.speed; }
      else if (dist < ideal-3) { moveDir.copy(dirToPlayer).negate(); spd = cfg.speed; }
      else { e.strafeT -= dt; if (e.strafeT <= 0) { e.strafe *= -1; e.strafeT = rand(1,2.5); } moveDir.set(-dirToPlayer.z, 0, dirToPlayer.x).multiplyScalar(e.strafe); spd = cfg.speed*0.7; }
    } else if (cfg.ranged && !cfg.melee) {
      const ideal = 14;
      if (dist > ideal+3) { moveDir.copy(dirToPlayer); spd = cfg.speed; }
      else if (dist < ideal-3) { moveDir.copy(dirToPlayer).negate(); spd = cfg.speed*0.8; }
    } else if (cfg.ranged && cfg.melee) {
      if (dist > cfg.range) { moveDir.copy(dirToPlayer); spd = cfg.speed; }
    } else {
      if (dist > cfg.range*0.85) { moveDir.copy(dirToPlayer); spd = cfg.speed; }
    }
    if (e.windup > 0) { spd = 0; moveDir.set(0,0,0); }
    if (moveDir.lengthSq() > 0) moveDir.normalize();
    spd *= (0.7 + 0.3*cfg.mass/4);
    if (e._speedMul) spd *= e._speedMul;
    if (e.status && e.status.freeze > 0) spd *= 0.15;
    m.position.x += moveDir.x * spd * dt;
    m.position.z += moveDir.z * spd * dt;
    const p2 = { x: m.position.x, z: m.position.z };
    collide(p2, e.radius);
    m.position.x = p2.x; m.position.z = p2.z;
    if (cfg.fly) m.position.y = cfg.flyH + Math.sin(e.animT*2)*0.5;
    else m.position.y = 0;
    const L = m.userData.limbs;
    const swing = e.windup > 0 ? 0.6 : Math.sin(e.animT*(4+cfg.speed)) * (spd>0.1?0.75:0.12);
    if (L.legs) { if (L.legs[0]) L.legs[0].rotation.x = swing; if (L.legs[1]) L.legs[1].rotation.x = -swing; }
    if (L.arms) { if (L.arms[0]) L.arms[0].rotation.x = -swing*0.7; if (L.arms[1]) L.arms[1].rotation.x = swing*0.7; }
    if (L.wings) { const flap = Math.sin(e.animT*9)*0.75; L.wings[0].rotation.z = flap; L.wings[1].rotation.z = -flap; }
    if (L.heads) for (let i=0;i<L.heads.length;i++) L.heads[i].rotation.x = Math.sin(e.animT*2+i*0.7)*0.35;
    e.atkCd -= dt;
    if (e.atkCd <= 0) {
      if (e.status && e.status.freeze > 0) { e.atkCd = 0.5; continue; }
      const dmgTo = d => Math.floor(d * e._dmgMul);
      if (e.windup <= 0 && (cfg.melee || cfg.boss) && dist < cfg.range*1.5) { e.windup = 0.42; continue; }
      if (cfg.boss && e.phase2 && dist < 25 && Math.random() < 0.4) {
        e.atkCd = cfg.cooldown * 1.5;
        if (e.type === 'titan') {
          const origin = m.position.clone(); origin.y += 4;
          const tgt = target.pos.clone(); tgt.y -= 0.2;
          spawnProjectile(origin, tgt.sub(origin).normalize(), 22, 'enemy', { damage: 30, size: 2, color: 0x886644 });
        } else if (e.type === 'cerberus') {
          for (let h = -1; h <= 1; h++) {
            const origin = m.position.clone(); origin.y += 3.5;
            const tgt = target.pos.clone().add(new THREE.Vector3(h*3,0,0)); tgt.y -= 0.2;
            spawnProjectile(origin, tgt.sub(origin).normalize(), 24, 'enemy', { damage: 22, size: 1.2, color: 0xff4422 });
          }
        } else if (e.type === 'hydra') {
          const origin = m.position.clone(); origin.y += 3;
          const tgt = target.pos.clone(); tgt.y -= 0.2;
          spawnProjectile(origin, tgt.sub(origin).normalize(), 26, 'enemy', { damage: 18, size: 1.6, color: 0x66ff22 });
          setTimeout(() => addLavaPool(target.pos.x, target.pos.z, 3), 500);
        }
        continue;
      }
      if (cfg.archer && dist < cfg.range) {
        e.atkCd = cfg.cooldown;
        const origin = m.position.clone(); origin.y += cfg.scale*2;
        const tgt = target.pos.clone(); tgt.y -= 0.2;
        const pd = tgt.sub(origin).normalize();
        pd.x += rand(-0.03,0.03); pd.z += rand(-0.03,0.03); pd.normalize();
        spawnProjectile(origin, pd, cfg.projSpeed, 'enemy', { damage: dmgTo(cfg.damage), kind:'arrow', color:0xffcc88 });
        SFX.bow();
      } else if (cfg.melee && dist < cfg.range + e.radius) {
        e.atkCd = cfg.cooldown;
        damagePlayer(target, dmgTo(cfg.damage));
        burst(target.pos.clone().setY(1.2), 5, { mat:'blood2', speed:5, life:0.3, size:0.1 });
      } else if (cfg.ranged && !cfg.melee && dist < cfg.range) {
        e.atkCd = cfg.cooldown;
        const origin = m.position.clone(); origin.y += cfg.scale*1.6;
        const tgt = target.pos.clone(); tgt.y -= 0.15;
        spawnProjectile(origin, tgt.sub(origin).normalize(), cfg.projSpeed, 'enemy', { damage: dmgTo(cfg.damage), homing: cfg.boss, color:0xff8822 });
      } else if (cfg.melee && cfg.ranged && dist < cfg.range*5) {
        e.atkCd = cfg.cooldown*1.6;
        const origin = m.position.clone(); origin.y += cfg.scale*2.2;
        const tgt = target.pos.clone(); tgt.y -= 0.2;
        spawnProjectile(origin, tgt.sub(origin).normalize(), cfg.projSpeed, 'enemy', { damage: dmgTo(30), homing:true, size:2, color:0xaa5533 });
      }
    }
  }
}

/* SHOOTING */
const ray = new THREE.Raycaster();
const tmpV1 = new THREE.Vector3();
const rayTargets = [];
let rayTargetsDirty = true;
function markRayTargetsDirty() { rayTargetsDirty = true; }
function rebuildRayTargets() {
  rayTargets.length = 0;
  for (let i = 0; i < worldMeshes.length; i++) rayTargets.push(worldMeshes[i]);
  for (let i = 0; i < enemyHitMeshes.length; i++) rayTargets.push(enemyHitMeshes[i]);
  rayTargetsDirty = false;
}
function getAimDir(cam, spread) {
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  if (spread > 0) {
    const r = new THREE.Vector3().crossVectors(dir, UP).normalize();
    const u = new THREE.Vector3().crossVectors(r, dir).normalize();
    dir.addScaledVector(r, rand(-spread,spread)).addScaledVector(u, rand(-spread,spread)).normalize();
  }
  return dir;
}
function fireHitscan(P, w, dir, cam) {
  const origin = cam.getWorldPosition(tmpV1).clone();
  if (w.flamer) {
    for (let k = 0; k < 3; k++) {
      spawnParticle(origin.clone().addScaledVector(dir, rand(1, w.range*0.8)), { mat:'fire', vel: dir.clone().multiplyScalar(rand(2,6)), size: rand(0.15,0.4), life: rand(0.3,0.6), gravity: -2, spin: false });
    }
    const cc = Math.cos(0.4);
    for (const e of enemies) {
      if (e.dead) continue;
      const toE = e.mesh.position.clone().sub(origin);
      const d = toE.length();
      if (d > w.range + e.radius) continue;
      toE.normalize();
      if (toE.dot(dir) < cc) continue;
      damageEnemy(e, w.damage, e.mesh.position.clone(), P);
      if (e.status) e.status.burn = Math.max(e.status.burn, 3);
    }
    return;
  }
  ray.set(origin, dir);
  ray.far = w.range;
  if (rayTargetsDirty) rebuildRayTargets();
  const hits = ray.intersectObjects(rayTargets, false);
  let endPoint = origin.clone().addScaledVector(dir, w.range);
  for (const h of hits) {
    if (h.object.userData.enemyRef && !h.object.userData.enemyRef.dead) {
      const target = h.object.userData.enemyRef;
      damageEnemy(target, w.damage, h.point, P);
      if (w.id === 'rocket' && target.status && Math.random() < 0.5) target.status.burn = Math.max(target.status.burn, 3);
      else if (w.id === 'zeus' && target.status && Math.random() < 0.15) target.status.freeze = Math.max(target.status.freeze, 1.5);
      endPoint = h.point;
      break;
    } else if (h.object.userData.barrelRef) { checkBarrelHit(h.point); endPoint = h.point; break; }
    else if (h.object.userData.isWall || h.object === floor || h.object === mansionFloor) {
      burst(h.point, 5, { mat:'stone', speed:4, life:0.34, size:0.08, gravity:14 });
      const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : UP.clone();
      if (Math.random() < 0.82) spawnDecal(h.point, n, 'impact', rand(.35,.72));
      SFX.hitWall(); endPoint = h.point; break;
    }
  }
  const start = origin.clone().addScaledVector(dir, 1.0);
  start.y -= 0.12;
  spawnBeam(start, endPoint, 0xffd27a, 0.028, 0.06);
  if (net.mode === 'host' && P === player2) netEvent('beam', { fx:start.x, fy:start.y, fz:start.z, tx:endPoint.x, ty:endPoint.y, tz:endPoint.z, c:0xffd27a, rad:0.028, life:0.06 });
}
function fireLightning(P, w, cam) {
  const origin = cam.getWorldPosition(tmpV1).clone();
  const dir = getAimDir(cam, 0);
  ray.set(origin, dir); ray.far = w.range;
  if (rayTargetsDirty) rebuildRayTargets();
  const hits = ray.intersectObjects(rayTargets, false);
  let endPoint = origin.clone().addScaledVector(dir, w.range);
  let first = null;
  for (const h of hits) {
    if (h.object.userData.enemyRef && !h.object.userData.enemyRef.dead) { first = h.object.userData.enemyRef; endPoint = h.point; break; }
    if (h.object.userData.isWall || h.object === floor || h.object === mansionFloor) { endPoint = h.point; break; }
  }
  spawnBeam(origin, endPoint, 0x88ddff, 0.10, 0.16);
  spawnBeam(origin, endPoint, 0xffffff, 0.045, 0.22);
  if (net.mode === 'host' && P === player2) netEvent('beam', { fx:origin.x, fy:origin.y, fz:origin.z, tx:endPoint.x, ty:endPoint.y, tz:endPoint.z, c:0x88ddff, rad:0.10, life:0.16 });
  if (first) {
    damageEnemy(first, w.damage, endPoint, P);
    if (first.status) first.status.freeze = Math.max(first.status.freeze, 1.5);
    const chained = new Set([first]);
    let src = first;
    for (let c = 0; c < w.chain; c++) {
      let best = null, bd = 14;
      for (const e of enemies) {
        if (e.dead || chained.has(e)) continue;
        const d = e.mesh.position.distanceTo(src.mesh.position);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) break;
      chained.add(best);
      const a = src.mesh.position.clone(); a.y += src.cfg.scale*1.5;
      const b = best.mesh.position.clone(); b.y += best.cfg.scale*1.5;
      spawnBeam(a, b, 0x66bbff, 0.06, 0.18);
      damageEnemy(best, w.damage*0.55, b, P);
      if (best.status) best.status.freeze = Math.max(best.status.freeze, 1.5);
      src = best;
    }
  }
  SFX.zeus();
}
function tryFire(P, cam) {
  if (!P || !P.alive || P.weaponCd > 0) return;
  const w = P.weapons[P.curWeapon];
  if (w.melee && w.sweep) {
    P.weaponCd = w.rate;
    P.kick = w.kick;
    if (P === player || net.mode === 'client') triggerViewWeapon(w);
    SFX.punch();
    hitStop(0.035);
    shakeScreen(3, 0.15);
    const origin = cam.getWorldPosition(tmpV1).clone();
    const dir = getAimDir(cam, 0);
    const coneCos = Math.cos(w.sweepAngle);
    let hitAny = false;
    for (const e of enemies) {
      if (e.dead) continue;
      const toE = e.mesh.position.clone().sub(origin);
      toE.y = 0;
      const d = toE.length();
      if (d > w.range + e.radius) continue;
      toE.normalize();
      if (toE.dot(new THREE.Vector3(dir.x, 0, dir.z).normalize()) < coneCos) continue;
      const dd = Math.floor(w.damage * (P.upgrades ? P.upgrades.damage : 1));
      damageEnemy(e, dd, e.mesh.position.clone().setY(1.2), P);
      const push = toE.clone().multiplyScalar(3);
      e.mesh.position.x += push.x;
      e.mesh.position.z += push.z;
      hitAny = true;
    }
    if (hitAny) burst(origin.clone().addScaledVector(dir, 3), 8, { mat:'magic', speed:6, life:0.3, size:0.14, gravity:4 });
    spawnBeam(origin.clone().addScaledVector(dir, 0.5), origin.clone().addScaledVector(dir, w.range), 0xffddaa, 0.10, 0.10);
    updateHUD();
    return;
  }
  if (w.ammo <= 0) {
    P.weaponCd = 0.3;
    SFX.reload();
    addFeed('<span style="color:#c04040">НЕТ ПАТРОНОВ</span>');
    return;
  }
  let rateMul = P.upgrades ? P.upgrades.fireRate : 1;
  if (hasPowerup(P, 'haste')) rateMul *= 0.66;
  P.weaponCd = w.rate * rateMul;
  w.ammo--;
  P.kick = w.kick;
  P.recoil += w.kick*22;
  if (P === player || net.mode === 'client') triggerViewWeapon(w);
  let dmgMul = P.upgrades ? P.upgrades.damage : 1;
  if (hasPowerup(P, 'quad')) dmgMul *= 3;
  const origDamage = w.damage;
  w.damage = origDamage * dmgMul;
  if (w.sfx) SFX[w.sfx]();
  if (w.lightning) fireLightning(P, w, cam);
  else if (w.id === 'rocket') {
    const origin = cam.getWorldPosition(tmpV1).clone();
    const dir = getAimDir(cam, 0);
    origin.addScaledVector(dir, 1.0);
    spawnProjectile(origin, dir, 44, 'player', { damage: w.damage, splash: w.splash });
  } else if (w.flamer) fireHitscan(P, w, getAimDir(cam, w.spread||0), cam);
  else for (let i = 0; i < (w.pellets||1); i++) fireHitscan(P, w, getAimDir(cam, w.spread||0), cam);
  w.damage = origDamage;
  updateHUD();
}

/* COMPANION */
const COMPANION_PANIC = ['АААА!','Помоги!','НЕТ-НЕТ-НЕТ!','Убей его!','Спаси меня!','Ой-ой-ой!'];
const COMPANION_IDLE = ['Скучно...','Красиво тут.','Убей кого-нибудь.','Я тут просто гуляю.','Ноги устали.'];
const COMPANION_KILL = ['Молодец!','Убил!','Один готов!','Красиво!','Ещё есть?'];
const companion = {
  pos: new THREE.Vector3(8,0,28), vel: new THREE.Vector3(), yaw: 0,
  state: 'wander', stateT: 2, target: new THREE.Vector3(8,0,28),
  mesh: null, animT: 0, sayCd: 4, speed: 5.4, radius: 0.4, panic: false,
  tripTimer: 0, tripCd: 10, lieDir: 1,
  trickTimer: 0, trickCd: 6, trickType: 'flip', aidCd: 8
};
function buildCompanion() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color:0xf0d8b8 });
  const top = new THREE.MeshLambertMaterial({ color:0x18b4a8 });
  const shorts = new THREE.MeshLambertMaterial({ color:0x1a1f2a });
  const hair = new THREE.MeshLambertMaterial({ color:0x3a1a08 });
  const gold = new THREE.MeshLambertMaterial({ color:0xd9b060 });
  const sandal = new THREE.MeshLambertMaterial({ color:0x4a2c18 });
  const t = m => { m.castShadow = true; return m; };
  const legs = [];
  for (const sx of [-1,1]) {
    const pv = new THREE.Group(); pv.position.set(sx*0.13, 1.10, 0);
    const th = t(new THREE.Mesh(new THREE.CylinderGeometry(0.135,0.10,0.55,12), skin)); th.position.y = -0.275; pv.add(th);
    const c = t(new THREE.Mesh(new THREE.CylinderGeometry(0.10,0.06,0.50,12), skin)); c.position.y = -0.80; pv.add(c);
    const f = t(new THREE.Mesh(new THREE.BoxGeometry(0.14,0.08,0.26), sandal)); f.position.set(0,-1.06,0.05); pv.add(f);
    g.add(pv); legs.push(pv);
  }
  const sh = t(new THREE.Mesh(new THREE.CylinderGeometry(0.30,0.36,0.42,20), shorts)); sh.position.y = 1.19; sh.scale.set(1,1,0.9); g.add(sh);
  for (const sx of [-1,1]) {
    const gl = t(new THREE.Mesh(new THREE.SphereGeometry(0.14,14,12), shorts)); gl.position.set(sx*0.115, 1.05, -0.17); gl.scale.set(1,0.98,0.88); g.add(gl);
    const hp = t(new THREE.Mesh(new THREE.SphereGeometry(0.13,14,12), shorts)); hp.position.set(sx*0.175, 1.09, -0.02); hp.scale.set(0.95,1.05,0.92); g.add(hp);
  }
  const mid = t(new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.26,0.24,16), skin)); mid.position.y = 1.56; mid.scale.set(1,1,0.85); g.add(mid);
  const tp = t(new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.23,0.38,20), top)); tp.position.y = 1.87; tp.scale.set(1,1,0.8); g.add(tp);
  for (const sx of [-1,1]) {
    const b = t(new THREE.Mesh(new THREE.SphereGeometry(0.175,20,16), top)); b.position.set(sx*0.135, 1.84, 0.155); b.scale.set(1,0.95,0.92); g.add(b);
    const m = t(new THREE.Mesh(new THREE.SphereGeometry(0.13,14,12), top)); m.position.set(sx*0.07, 1.83, 0.13); m.scale.set(1,0.95,0.85); g.add(m);
  }
  const shs = t(new THREE.Mesh(new THREE.CylinderGeometry(0.26,0.28,0.10,14), skin)); shs.position.y = 2.14; shs.scale.set(1,1,0.82); g.add(shs);
  const neck = t(new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.09,0.14,12), skin)); neck.position.y = 2.24; g.add(neck);
  const head = t(new THREE.Mesh(new THREE.SphereGeometry(0.20,20,18), skin)); head.position.y = 2.47; head.scale.set(0.92,1.05,0.98); g.add(head);
  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.09,12,10), skin); chin.position.set(0,2.34,0.03); chin.scale.set(1,0.7,1.05); g.add(chin);
  const nb = new THREE.Mesh(new THREE.BoxGeometry(0.045,0.13,0.06), skin); nb.position.set(0,2.48,0.185); g.add(nb);
  for (const sx of [-1,1]) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.048,14,12), new THREE.MeshBasicMaterial({ color:0xf5f5f0 })); w.position.set(sx*0.075, 2.52, 0.175); w.scale.set(1.05,1,0.6); g.add(w);
    const ir = new THREE.Mesh(new THREE.SphereGeometry(0.026,12,10), new THREE.MeshBasicMaterial({ color:0x5a3a1a })); ir.position.set(sx*0.075, 2.52, 0.198); g.add(ir);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(0.012,8,6), new THREE.MeshBasicMaterial({ color:0x0a0505 })); pu.position.set(sx*0.075, 2.52, 0.208); g.add(pu);
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.10,0.018,0.028), hair); br.position.set(sx*0.075, 2.60, 0.178); br.rotation.z = sx*-0.2; g.add(br);
  }
  const ul = new THREE.Mesh(new THREE.SphereGeometry(0.052,12,8), new THREE.MeshLambertMaterial({ color:0xd06070 })); ul.position.set(0,2.36,0.178); ul.scale.set(1.3,0.35,0.5); g.add(ul);
  const ll = new THREE.Mesh(new THREE.SphereGeometry(0.052,12,8), new THREE.MeshLambertMaterial({ color:0xd06070 })); ll.position.set(0,2.335,0.178); ll.scale.set(1.25,0.42,0.5); g.add(ll);
  const hb = t(new THREE.Mesh(new THREE.SphereGeometry(0.215,16,14), hair)); hb.position.set(0,2.47,-0.03); hb.scale.set(0.98,1.05,1.02); g.add(hb);
  const ht = t(new THREE.Mesh(new THREE.SphereGeometry(0.19,14,12), hair)); ht.position.set(0,2.58,0); ht.scale.set(1.05,0.85,1); g.add(ht);
  const strands = [];
  for (let i=0;i<5;i++) {
    const ang = (i-2)*0.14;
    const s = t(new THREE.Mesh(new THREE.CylinderGeometry(0.032,0.05,0.65,8), hair));
    s.position.set(ang, 2.13, -0.16); s.rotation.z = ang*0.4;
    g.add(s); strands.push(s);
  }
  const pin = new THREE.Mesh(new THREE.SphereGeometry(0.03,10,8), gold); pin.position.set(0.16,2.56,0.05); g.add(pin);
  const arms = [];
  for (const sx of [-1,1]) {
    const pv = new THREE.Group(); pv.position.set(sx*0.30, 2.10, 0);
    const u = t(new THREE.Mesh(new THREE.CylinderGeometry(0.078,0.065,0.36,12), skin)); u.position.y = -0.18; pv.add(u);
    const l = t(new THREE.Mesh(new THREE.CylinderGeometry(0.065,0.055,0.34,12), skin)); l.position.y = -0.52; pv.add(l);
    g.add(pv); arms.push(pv);
  }
  const brace = new THREE.Mesh(new THREE.TorusGeometry(0.075,0.016,6,12), gold);
  brace.position.y = -0.66; brace.rotation.x = Math.PI/2; arms[0].add(brace);
  g.userData.limbs = { arms, legs, strands };
  return g;
}
companion.mesh = buildCompanion();
companion.mesh.position.copy(companion.pos);
scene.add(companion.mesh);
loadXanthippeModel().then(model => {
  const old = companion.mesh;
  model.position.copy(companion.pos);
  model.rotation.y = companion.yaw;
  scene.add(model);
  companion.mesh = model;
  updateXanthippeAnimation(companion.mesh, { state:'idle', time:companion.animT, speedNorm:0 });
  if (old) scene.remove(old);
  console.log('[XANTHIPPE] GLB model loaded + procedural auto-rig active');
}).catch(err => console.warn('[XANTHIPPE] GLB load failed; fallback model kept', err));
let sayBubble = null;
function ensureBubble() {
  if (sayBubble) return;
  sayBubble = document.createElement('div');
  sayBubble.style.cssText = 'position:absolute;padding:6px 12px;background:rgba(255,240,245,.96);color:#3a0a1e;border-radius:14px;font-size:13px;pointer-events:none;transform:translate(-50%,-100%);box-shadow:0 2px 10px rgba(0,0,0,.5);z-index:20;font-family:inherit;transition:opacity .25s;max-width:280px;text-align:center;line-height:1.3;opacity:0;';
  $('hud').appendChild(sayBubble);
}
let sayTimer = null;
function companionSay(text, dur) {
  dur = dur || 2200;
  ensureBubble();
  sayBubble.innerHTML = text + `<div style="position:absolute;left:50%;bottom:-6px;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:7px solid rgba(255,240,245,.96);"></div>`;
  sayBubble.style.opacity = '1';
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => sayBubble.style.opacity = '0', dur);
  addFeed(`<span style="color:#ff99cc">💃 Ксантиппа:</span> <span style="color:#ffe6f0">${text}</span>`);
}
function updateCompanionBubble() {
  if (!sayBubble || sayBubble.style.opacity === '0') return;
  const pos = companion.pos.clone(); pos.y += 2.95;
  const v = pos.project(camera);
  if (v.z > 1 || v.z < -1) { sayBubble.style.display = 'none'; return; }
  sayBubble.style.display = 'block';
  sayBubble.style.left = ((v.x*0.5+0.5)*innerWidth)+'px';
  sayBubble.style.top = ((-v.y*0.5+0.5)*innerHeight)+'px';
}
function pickCompTarget() {
  let tries = 0;
  while (tries++ < 15) {
    const a = Math.random()*TAU, r = rand(15, ARENA-15);
    const x = Math.cos(a)*r, z = Math.sin(a)*r;
    let ok = true;
    for (const cc of circleColliders) if (Math.hypot(x-cc.x, z-cc.z) < cc.r+1.5) { ok = false; break; }
    if (!ok) continue;
    for (const b of boxColliders) if (x > b.minX-1 && x < b.maxX+1 && z > b.minZ-1 && z < b.maxZ+1) { ok = false; break; }
    if (!ok) continue;
    companion.target.set(x, 0, z); return;
  }
  companion.target.set(rand(-30,30), 0, rand(-30,30));
}
function updateCompanion(dt) {
  const c = companion;
  if (!c.mesh) return;
  c.animT += dt; c.stateT -= dt; c.sayCd -= dt; c.tripCd -= dt; c.trickCd -= dt; c.aidCd -= dt;
  if (c.state === 'wander' && c.tripCd <= 0 && c.trickCd > 2 && Math.random() < 0.012) {
    c.state = 'trip'; c.tripTimer = 1.7; c.tripCd = rand(9,20); c.lieDir = Math.random() < 0.5 ? 1 : -1;
    SFX.squeal();
    if (Math.random() < 0.65) companionSay(pick(['Ой! Камень!','Ай! Споткнулась!','Кто тут ящик поставил?!','Я в порядке!','Мои колени...','Это всё пол виноват!']), 1700);
  }
  if (c.state === 'wander' && c.trickCd <= 0 && c.tripCd > 2 && Math.random() < 0.008) {
    c.state = 'trick'; c.trickTimer = 1.2; c.trickType = Math.random() < 0.5 ? 'flip' : 'cartwheel';
    c.trickCd = rand(10,25);
    if (Math.random() < 0.4) companionSay(pick(['Смотри как я умею!','Оп!','Разминка!','Это я просто так.']), 1500);
  }
  if (c.state === 'trip') {
    c.tripTimer -= dt;
    if (c.tripTimer <= 0) { c.state = 'wander'; c.stateT = 1; }
    const t = c.tripTimer;
    let lie = 1;
    if (t > 1.3) lie = (1.7-t)/0.4;
    else if (t > 0.3) lie = 1;
    else lie = t/0.3;
    lie = clamp(lie, 0, 1);
    c.mesh.position.copy(c.pos);
    c.mesh.position.y = 0.15*lie;
    c.mesh.rotation.y = c.yaw;
    c.mesh.rotation.x = -1.5*lie;
    c.mesh.rotation.z = Math.sin(c.animT*18)*0.06*lie;
    updateXanthippeAnimation(c.mesh, { state:'trip', time:c.animT, amount:lie, panic:c.panic });
    const L = c.mesh.userData.limbs;
    if (L) { L.legs[0].rotation.x = -0.9*lie; L.legs[1].rotation.x = -1.15*lie; L.arms[0].rotation.x = -1.7*lie; L.arms[1].rotation.x = -1.5*lie; for (let i = 0; i < L.strands.length; i++) L.strands[i].rotation.z = Math.sin(c.animT*12+i)*0.35*lie; }
    updateCompanionBubble();
    return;
  }
  if (c.state === 'trick') {
    c.trickTimer -= dt;
    if (c.trickTimer <= 0) { c.state = 'wander'; c.stateT = 1; }
    const t = 1 - c.trickTimer/1.2;
    c.mesh.position.copy(c.pos);
    c.mesh.rotation.y = c.yaw;
    updateXanthippeAnimation(c.mesh, { state:'trick', time:c.animT, speedNorm:0 });
    if (c.trickType === 'flip') {
      c.mesh.rotation.x = -t * TAU;
      c.mesh.rotation.z = 0;
      c.mesh.position.y = Math.sin(t*Math.PI) * 1.2;
      const L = c.mesh.userData.limbs;
      if (L) { L.arms[0].rotation.x = -2.5; L.arms[1].rotation.x = -2.5; L.legs[0].rotation.x = 1.2; L.legs[1].rotation.x = 1.2; }
    } else {
      c.mesh.rotation.z = t * TAU;
      c.mesh.rotation.x = 0;
      c.mesh.position.y = 0.9 + Math.sin(t*Math.PI) * 0.2;
      const L = c.mesh.userData.limbs;
      if (L) { L.arms[0].rotation.x = -Math.PI/2; L.arms[1].rotation.x = -Math.PI/2; L.legs[0].rotation.x = 0.3; L.legs[1].rotation.x = -0.3; }
    }
    updateCompanionBubble();
    return;
  }
  if (c.state === 'wander' && c.aidCd <= 0 && player.alive && net.mode !== 'client') {
    if (player.hp < player.maxHp * 0.5 && Math.random() < 0.5) {
      player.hp = Math.min(player.maxHp, player.hp + 20);
      flashHeal();
      burst(player.pos.clone().setY(1.5), 12, { mat:'gold', speed:5, life:0.6, size:0.16, gravity:4 });
      companionSay('Держи! Нашла в кустах!', 1800);
      c.aidCd = rand(15,25);
    } else if (Math.random() < 0.4) {
      let best = null, bd = 25;
      for (const e of enemies) { if (e.dead) continue; const d = e.mesh.position.distanceTo(c.pos); if (d < bd) { bd = d; best = e; } }
      if (best) {
        damageEnemy(best, 40, best.mesh.position.clone().setY(best.mesh.position.y + 1), player);
        burst(best.mesh.position.clone().setY(1), 6, { mat:'stone', speed:6, life:0.4, size:0.12, gravity:14 });
        companionSay(pick(['Получи, гад!','Хрясь!','Вот тебе камень!']), 1400);
        c.aidCd = rand(10,18);
      } else {
        let anyNear = false;
        for (const e of enemies) if (!e.dead && e.mesh.position.distanceTo(c.pos) < 10) { anyNear = true; break; }
        if (anyNear) {
          for (const e of enemies) if (!e.dead && e.mesh.position.distanceTo(c.pos) < 10) e.atkCd = Math.max(e.atkCd, 2.5);
          companionSay('ИДИТЕ ПРОЧЬ! АААА!', 1600);
          c.aidCd = rand(12,20);
        }
      }
    }
  }
  let nearEnemy = null, nearDist = Infinity;
  for (const e of enemies) {
    if (e.dead) continue;
    const d = e.mesh.position.distanceTo(c.pos);
    if (d < nearDist) { nearDist = d; nearEnemy = e; }
  }
  if (nearEnemy && nearDist < 8) {
    if (c.state !== 'flee') { c.state = 'flee'; c.panic = true; SFX.squeal(); if (c.sayCd <= 0) { c.sayCd = rand(2.5,5); companionSay(pick(COMPANION_PANIC), 1800); } }
    c.stateT = 0.4;
  } else if (nearEnemy && nearDist < 14) { c.state = 'nervous'; c.panic = true; c.stateT = 0.8; }
  else if (c.stateT <= 0) { c.state = 'wander'; c.panic = false; pickCompTarget(); c.stateT = rand(2.5,5); }
  const move = new THREE.Vector3();
  let spd = 0;
  if (c.state === 'flee' && nearEnemy) { const away = new THREE.Vector3().subVectors(c.pos, nearEnemy.mesh.position); away.y = 0; away.normalize(); move.copy(away); spd = c.speed*1.95; }
  else if (c.state === 'nervous' && nearEnemy) { const away = new THREE.Vector3().subVectors(c.pos, nearEnemy.mesh.position); away.y = 0; away.normalize(); move.copy(away); spd = c.speed*1.2; }
  else { const to = new THREE.Vector3().subVectors(c.target, c.pos); to.y = 0; const d = to.length(); if (d < 1.2) pickCompTarget(); else { move.copy(to).divideScalar(d); spd = c.speed; } }
  c.pos.x += move.x*spd*dt;
  c.pos.z += move.z*spd*dt;
  const p2 = { x: c.pos.x, z: c.pos.z };
  collide(p2, c.radius);
  c.pos.x = p2.x; c.pos.z = p2.z;
  if (move.lengthSq() > 0.01) {
    const ty = Math.atan2(move.x, move.z);
    let dy = ty - c.yaw;
    while (dy > Math.PI) dy -= TAU;
    while (dy < -Math.PI) dy += TAU;
    c.yaw += dy*Math.min(1, dt*9);
  }
  c.mesh.position.copy(c.pos);
  c.mesh.rotation.y = c.yaw;
  c.mesh.rotation.x = 0;
  c.mesh.rotation.z = 0;
  const sn = clamp(spd/c.speed, 0, 2.2);
  updateXanthippeAnimation(c.mesh, { state:c.state, time:c.animT, speedNorm:sn, panic:c.panic });
  const L = c.mesh.userData.limbs;
  const sw = Math.sin(c.animT*(4.5+spd*0.85))*(0.32+sn*0.55);
  if (L) { L.legs[0].rotation.x = sw; L.legs[1].rotation.x = -sw; const pu = (c.panic && c.state === 'flee') ? 1.15 : 0; L.arms[0].rotation.x = -sw*0.9 - pu; L.arms[1].rotation.x = sw*0.9 - pu; for (let i = 0; i < L.strands.length; i++) L.strands[i].rotation.z = Math.sin(c.animT*4.5+i)*0.15; }
  if (c.sayCd <= 0 && !c.panic) { c.sayCd = rand(5,9); companionSay(pick(COMPANION_IDLE), 2200); }
  updateCompanionBubble();
}

/* INPUT */
const keys = {}, keys2 = {};
let mouseDown = false, pointerLocked = false;
addEventListener('keydown', e => {
  const el = document.activeElement;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
  if (e.code === 'Escape') {
    const b = document.getElementById('stelaPrompt');
    if (b && b.style.display === 'block') { b.style.display = 'none'; return; }
    if (gameState === 'playing') {
      gameState = 'paused';
      if (document.exitPointerLock) document.exitPointerLock();
      $('pauseScreen').classList.remove('hidden');
    } else if (gameState === 'paused') {
      gameState = 'playing';
      $('pauseScreen').classList.add('hidden');
      safeLock(); clock.getDelta();
    }
    return;
  }
  if (['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight'].includes(e.code)) keys[e.code] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyI','KeyJ','KeyK','KeyL','Slash','Comma','Period','Semicolon'].includes(e.code)) keys2[e.code] = true;
  if (net.mode !== 'client') {
    if (e.code === 'Digit1') selectWeapon(player, 0);
    if (e.code === 'Digit2') selectWeapon(player, 1);
    if (e.code === 'Digit3') selectWeapon(player, 2);
    if (e.code === 'Digit4') selectWeapon(player, 3);
    if (e.code === 'Digit5') selectWeapon(player, 4);
    if (e.code === 'Digit6') selectWeapon(player, 5);
    if (e.code === 'Digit7') selectWeapon(player, 6);
    if (e.code === 'KeyQ') activateUlt(player);
    if (e.code === 'KeyG') throwGrenade(player, camera);
  }
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; keys2[e.code] = false; });
renderer.domElement.addEventListener('mousedown', e => { if (e.button === 0) mouseDown = true; });
addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
addEventListener('mousemove', e => {
  if (!pointerLocked || net.mode === 'client' || !player.alive) return;
  player.yaw -= e.movementX*0.0022;
  player.pitch -= e.movementY*0.0022;
  player.pitch = clamp(player.pitch, -Math.PI/2+0.05, Math.PI/2-0.05);
});
addEventListener('wheel', e => {
  if (!pointerLocked) return;
  const dir = e.deltaY > 0 ? 1 : -1;
  const P = net.mode === 'client' ? player2 : player;
  for (let i = 1; i <= P.weapons.length; i++) {
    const idx = (P.curWeapon + dir*i + P.weapons.length*4) % P.weapons.length;
    if (P.weapons[idx].unlocked) { selectWeapon(P, idx); break; }
  }
}, { passive:true });
document.addEventListener('pointerlockchange', () => { pointerLocked = document.pointerLockElement === renderer.domElement; });
renderer.domElement.addEventListener('click', () => { if (gameState === 'playing' && !pointerLocked) safeLock(); });
function safeLock() { try { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(()=>{}); } catch(e) {} }
function selectWeapon(P, i) {
  if (i < 0 || i >= P.weapons.length) return;
  if (!P.weapons[i].unlocked) return;
  if (i === P.curWeapon) return;
  P.curWeapon = i;
  P.weaponCd = 0.2;
  P.kick = 0.14;
  SFX.reload();
  updateHUD();
}

/* WAVES */
let wave = 0, score = 0, kills = 0;
let spawnQueue = [], spawnTimer = 0;
let waveActive = false, waveBreakTimer = 0;
const MAX_ALIVE_BASE = 26, MAX_ALIVE_RUSH = 65;
let isRushWave = false;
function isRush(n) { return n >= 4 && n % 5 === 4; }
function waveComposition(n) {
  const L = LEVELS[currentLevel];
  const list = [];
  if (n % 5 === 0) { list.push(L.boss); const adds = 4 + Math.floor(n/5)*2; for (let i = 0; i < adds; i++) list.push(L.types[0]); return list; }
  const rush = isRush(n);
  const total = Math.floor((6 + n*1.8) * (rush ? 1.9 : 1.0));
  for (let i = 0; i < total; i++) {
    const r = Math.random();
    let tp;
    if (n === 1) tp = L.types[0];
    else if (n === 2) tp = r < 0.6 ? L.types[0] : L.types[1];
    else if (n === 3) tp = r < 0.45 ? L.types[0] : (r < 0.75 ? L.types[1] : L.types[2]);
    else if (rush) tp = r < 0.5 ? L.types[0] : (r < 0.75 ? L.types[1] : (r < 0.9 ? L.types[3] : L.types[2]));
    else tp = r < 0.25 ? L.types[0] : (r < 0.5 ? L.types[1] : (r < 0.75 ? L.types[3] : L.types[2]));
    list.push(tp);
  }
  return list;
}
function startWave(n) {
  if (currentWeather) { try { currentWeather.end(); } catch(_) {} currentWeather = null; }
  wave = n; waveActive = true;
  isRushWave = isRush(n);
  spawnQueue = waveComposition(n);
  spawnTimer = 0;
  SFX.waveStart();
  achState.waveStartTookDamage = false;
  if (isRushWave) {
    showMsg('☠ ВСПЛЕСК ☠', 2400);
    addFeed('<span style="color:#ff4444;font-weight:bold">⚠ ПРОРЫВ! ДЕРЖИСЬ!</span>');
    if (companion) companionSay(pick(['ИХ СЛИШКОМ МНОГО!','ОНИ ВЕЗДЕ!','Я В УКРЫТИЕ!','ЭТО КОНЕЦ!']), 2400);
    Music.setMode('boss');
  }
  if (n === 1 || (n - 1) % 5 === 0) {
    const L = LEVELS[currentLevel];
    setTimeout(() => {
      showMsg(L.name, 3000);
      setTimeout(() => {
        addFeed(`<span style="color:#ffd27a">📍 ${L.name} — ${L.subtitle}</span>`);
        addFeed(`<span style="color:#c9a55a;font-style:italic;">${L.story}</span>`);
        if (companion) companionSay(pick(['Ох... куда нас занесло.','Это место мне не нравится.','Красиво... по-страшному.']), 2600);
      }, 1200);
    }, 400);
  }
  if (n % 5 === 0) {
    SFX.boss();
    const bn = LEVELS[currentLevel].bossName;
    showMsg('⚠ ' + bn + ' ⚠', 3000);
    setTimeout(() => {
      addFeed(`<span style="color:#ff4444;font-weight:bold">☠ БОСС: ${bn}</span>`);
      if (companion) companionSay(pick(['Это ' + bn + '! БЕЖИМ!','Я НЕ ХОЧУ УМИРАТЬ!','Этот точно нас убьёт!']), 2800);
    }, 800);
    Music.setMode('boss');
  } else if (!isRushWave) { showMsg(`ВОЛНА ${n}`, 1500); Music.setMode('combat'); }
  if (n >= 2 && n % 4 === 0 && !isRushWave) { rollWeather(); weatherTimer = 25; }
  if (n >= 3 && n % 3 === 0 && n % 5 !== 0 && !isRushWave) {
    activeModifier = pick(MODIFIERS);
    setTimeout(() => {
      showMsg('МОДИФИКАТОР: ' + activeModifier.name, 2600);
      addFeed('<span style="color:#ff8844">⚠ ' + activeModifier.name + ' — ' + activeModifier.desc + '</span>');
    }, 1600);
    if (activeModifier.id === 'dark') { scene.fog.near *= 0.55; scene.fog.far *= 0.6; }
  } else activeModifier = null;
  for (const w of player.weapons) {
    if (WEAPON_UNLOCK_WAVE[w.id] === n && !w.unlocked) {
      w.unlocked = true;
      w.ammo = w.ammoMax;
      const p2w = player2.weapons.find(x => x.id === w.id);
      if (p2w) { p2w.unlocked = true; p2w.ammo = p2w.ammoMax; }
      if (player.weapons.every(x => x.unlocked)) unlockAch('all_weapons');
      setTimeout(() => {
        showMsg(`НОВОЕ ОРУЖИЕ: ${w.name}`, 2000);
        addFeed(`<span style="color:#ffd27a">★ ${w.name}</span>`);
        companionSay(`О! ${w.name}!`, 1800);
      }, 900);
    }
  }
  updateHUD();
}
function spawnPoint() {
  for (let i = 0; i < 28; i++) {
    let x, z;
    const r = Math.random();
    if (r < 0.28) { x = rand(-50,50); z = rand(30,60); }
    else if (r < 0.50) { x = rand(-26,26); z = rand(-12,20); }
    else if (r < 0.72) { x = rand(-28,28); z = rand(-58,-24); }
    else if (r < 0.86) { x = rand(-56,-34); z = rand(-8,42); }
    else { x = rand(34,56); z = rand(-8,42); }
    let ok = true;
    for (const c of circleColliders) if (Math.hypot(x-c.x, z-c.z) < c.r+2.5) { ok = false; break; }
    if (!ok) continue;
    for (const b of boxColliders) if (x > b.minX-2 && x < b.maxX+2 && z > b.minZ-2 && z < b.maxZ+2) { ok = false; break; }
    if (!ok) continue;
    return new THREE.Vector3(x, 0, z);
  }
  return new THREE.Vector3(rand(-40,40), 0, rand(28,52));
}
function updateWaves(dt) {
  if (!waveActive) {
    waveBreakTimer -= dt;
    if (waveBreakTimer <= 0) startWave(wave + 1);
    return;
  }
  const maxAlive = isRushWave ? MAX_ALIVE_RUSH : MAX_ALIVE_BASE;
  if (spawnQueue.length > 0) {
    spawnTimer -= dt;
    if (spawnTimer <= 0 && enemies.length < maxAlive) {
      const type = spawnQueue.shift();
      spawnEnemy(type, spawnPoint());
      let base = ENEMY_TYPES[type].boss ? 1.5 : rand(0.22, 0.7);
      if (isRushWave) base *= 0.28;
      if (activeModifier && activeModifier.id === 'swarm') base *= 0.66;
      spawnTimer = base;
    }
  }
  if (spawnQueue.length === 0 && enemies.length === 0) {
    if (!achState.waveStartTookDamage && wave >= 3) unlockAch('no_damage_wave');
    if (currentDiff === 'hard' && wave >= 10) unlockAch('hard_clear');
    if (activeModifier && activeModifier.id === 'dark') applyLevel(currentLevel);
    activeModifier = null;
    if (isRushWave) { const rb = 500 * wave; score += rb; addFeed(`<span style="color:#ffd27a;font-weight:bold">✦ ПРОРЫВ ОТБИТ! +${rb}</span>`); }
    isRushWave = false;
    waveActive = false;
    waveBreakTimer = 4.5;
    const bonus = 250 * wave;
    score += bonus;
    addFeed(`<span style="color:#66ff88">ВОЛНА ${wave} ОЧИЩЕНА +${bonus}</span>`);
    showMsg('ВОЛНА ОЧИЩЕНА', 1800);
    companionSay('Уф! Чуть не умерла!', 2400);
    player.hp = Math.min(player.maxHp, player.hp+22);
    player.armor = Math.min(player.maxArmor, player.armor+12);
    if (net.mode === 'host') { player2.hp = Math.min(player2.maxHp, player2.hp+22); player2.armor = Math.min(player2.maxArmor, player2.armor+12); }
    for (const w of player.weapons) if (w.unlocked) w.ammo = Math.min(w.ammoMax, w.ammo + Math.ceil(w.ammoMax*0.18));
    if (net.mode === 'host') for (const w of player2.weapons) if (w.unlocked) w.ammo = Math.min(w.ammoMax, w.ammo + Math.ceil(w.ammoMax*0.18));
    spawnPickup('health', new THREE.Vector3(rand(-25,25), 1, rand(-25,25)));
    spawnPickup('ammo', new THREE.Vector3(rand(-25,25), 1, rand(-25,25)));
    if (wave % 5 !== 0) setTimeout(() => { if (gameState === 'playing') showUpgradeScreen(); }, 1200);
    if (wave % 5 === 0) {
      if (currentLevel < LEVELS.length - 1) {
        currentLevel++;
        setTimeout(() => {
          applyLevel(currentLevel);
          SFX.levelUp();
          const L = LEVELS[currentLevel];
          showMsg(`→ ${L.name}`, 3200);
          addFeed(`<span style="color:#66ddff">✦ ПЕРЕХОД: ${L.name}</span>`);
          companionSay(L.story, 3400);
        }, 1400);
      } else {
        ngPlus++;
        currentLevel = 0;
        setTimeout(() => {
          if (ngPlus === 1) {
            Music.setMode('calm');
            gameState = 'paused';
            if (document.exitPointerLock) document.exitPointerLock();
            $('victoryScreen').classList.remove('hidden');
            meta = loadMeta();
            meta.credits += 500;
            saveMeta(meta);
          } else {
            applyLevel(0);
            showMsg(`ВОСХОЖДЕНИЕ ${ngPlus}`, 3200);
            addFeed(`<span style="color:#ffd27a">✦ ВОСХОЖДЕНИЕ ${ngPlus}</span>`);
          }
        }, 1400);
      }
    }
    updateHUD();
  }
}

/* PLAYER UPDATE */
function updatePlayerEntity(P, cam, inp, dt) {
  if (!P.alive) return;
  if (P.invuln > 0) P.invuln -= dt;
  if (hasPowerup(P, 'regen')) P.hp = Math.min(P.maxHp, P.hp + 12*dt);
  if (P.upgrades && P.upgrades.regen > 0) {
    P.upgrades._regenT = (P.upgrades._regenT || 0) + dt;
    if (P.upgrades._regenT >= 3) { P.upgrades._regenT = 0; P.hp = Math.min(P.maxHp, P.hp + P.upgrades.regen); }
  }
  const fwd = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  const right = new THREE.Vector3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  const wish = new THREE.Vector3();
  if (inp.forward) wish.add(fwd);
  if (inp.back) wish.sub(fwd);
  if (inp.right) wish.add(right);
  if (inp.left) wish.sub(right);
  if (inp.turnLeft) P.yaw += dt*2;
  if (inp.turnRight) P.yaw -= dt*2;
  if (inp.lookUp) P.pitch = clamp(P.pitch + dt*1.6, -Math.PI/2+0.05, Math.PI/2-0.05);
  if (inp.lookDown) P.pitch = clamp(P.pitch - dt*1.6, -Math.PI/2+0.05, Math.PI/2-0.05);
  const moving = wish.lengthSq() > 0;
  if (moving) wish.normalize();
  const sprinting = inp.sprint && moving;
  const speed = P.speed * (sprinting ? P.sprintMul : 1);
  const accel = P.onGround ? 58 : 16;
  P.vel.x = lerp(P.vel.x, wish.x*speed, Math.min(1, accel*dt/speed||0));
  P.vel.z = lerp(P.vel.z, wish.z*speed, Math.min(1, accel*dt/speed||0));
  if (inp.jump && P.onGround) { P.vel.y = P.jumpPower; P.onGround = false; }
  P.vel.y -= GRAVITY*dt;
  P.pos.x += P.vel.x*dt; P.pos.z += P.vel.z*dt; P.pos.y += P.vel.y*dt;
  if (P.pos.y <= P.height) { P.pos.y = P.height; P.vel.y = 0; P.onGround = true; }
  const p2 = { x: P.pos.x, z: P.pos.z };
  collide(p2, P.radius);
  P.pos.x = p2.x; P.pos.z = p2.z;
  const hs = Math.hypot(P.vel.x, P.vel.z);
  if (P.onGround && hs > 1) { P.bobT += dt*hs*1.05; P.bobAmp = lerp(P.bobAmp, sprinting ? 0.10 : 0.045, dt*8); }
  else P.bobAmp = lerp(P.bobAmp, 0, dt*9);
  P.recoil = lerp(P.recoil, 0, dt*11);
  P.kick = lerp(P.kick, 0, dt*13);
  const bx = Math.cos(P.bobT)*P.bobAmp, by = Math.abs(Math.sin(P.bobT))*P.bobAmp;
  const shX = shakeT > 0 ? (Math.random()-0.5)*shakeAmp*0.008 : 0;
  const shY = shakeT > 0 ? (Math.random()-0.5)*shakeAmp*0.008 : 0;
  cam.position.set(P.pos.x + bx*0.5, P.pos.y + by - P.kick*0.25, P.pos.z);
  cam.rotation.set(P.pitch + P.recoil*0.012 + shY, P.yaw + shX, 0, 'YXZ');
  cam.rotation.z += Math.cos(P.bobT)*0.008;
  if (cam.fov !== undefined) {
    const targetFov = sprinting && hs > 4 ? 86 : 78;
    cam.fov = lerp(cam.fov, targetFov, dt * 6);
    cam.updateProjectionMatrix();
  }
  if (P.weaponCd > 0) P.weaponCd -= dt;
  const w = P.weapons[P.curWeapon];
  if (inp.shoot) {
    if (w.auto) tryFire(P, cam);
    else if (!P._semiLatch) { tryFire(P, cam); P._semiLatch = true; }
  } else P._semiLatch = false;
  if (P.avatar) {
    P.avatar.position.set(P.pos.x, 0, P.pos.z);
    P.avatar.rotation.y = P.yaw + Math.PI;
    const L = P.avatar.userData.limbs;
    const sw = Math.sin(P.bobT*2.5)*(hs>1?0.5:0.08);
    L.legs[0].rotation.x = sw; L.legs[1].rotation.x = -sw;
  }
}

/* WORLD UPDATE */
function updateWorld(dt) {
  sun.intensity = 1.3 + Math.sin(performance.now()*0.0004)*0.08;
  updateFlashLight(dt);
  const t = performance.now();
  atmosphere.position.x = camera.position.x;
  atmosphere.position.z = camera.position.z;
  for (let i=0;i<skyClouds.length;i++) skyClouds[i].position.x += Math.sin(i*1.7+1)*dt*0.35;
  motes.rotation.y += dt*0.012; motes.position.y = Math.sin(t*.00035)*.5;
  for (const f of torchParts) {
    f.userData.life -= dt;
    if (f.userData.life <= 0) f.userData.life = 1.2;
    const baseY = f.userData.baseY || 0;
    const baseScale = f.userData.baseScale || 1;
    f.position.y = baseY + Math.sin(t*0.005 + baseY) * 0.15;
    f.scale.setScalar(baseScale * (1 + Math.sin(t*0.02 + baseY) * 0.08));
    f.rotation.y += dt * 4;
    f.material.opacity = 0.75 + Math.sin(t*0.01 + baseY) * 0.15;
  }
  if (poolWater) {
    poolWater.position.y = (poolWater.userData.baseY || 0.96) + Math.sin(t*0.0018) * 0.04;
    poolWater.material.opacity = 0.82 + Math.sin(t*0.0025) * 0.05;
    if (poolWater.userData.ring) {
      poolWater.userData.ring.material.opacity = 0.36 + Math.sin(t*0.0021) * 0.08;
      poolWater.userData.ring.rotation.z += dt * 0.12;
      if (poolWater.material.normalMap) { poolWater.material.normalMap.offset.x += dt*0.025; poolWater.material.normalMap.offset.y += dt*0.012; }
    }
  }
  for (let i = beams.length-1; i >= 0; i--) {
    const b = beams[i];
    if (!b.isLight) continue;
    b.life -= dt;
    b.m.intensity = Math.max(0, b.life/b.max) * 30;
    if (b.life <= 0) { scene.remove(b.m); beams.splice(i,1); }
  }
}

/* STELAE PROMPT */
let nearbyStela = null;
function updateStelae() {
  let found = null, bestD = 4.5;
  for (const s of stelae) {
    const d = Math.hypot(player.pos.x - s.x, player.pos.z - s.z);
    if (d < bestD) { bestD = d; found = s; }
  }
  if (found !== nearbyStela) {
    let b = document.getElementById('stelaPrompt');
    if (!found) { if (b) b.style.display = 'none'; }
    else {
      if (!b) {
        b = document.createElement('div');
        b.id = 'stelaPrompt';
        b.style.cssText = 'position:fixed;bottom:180px;left:50%;transform:translateX(-50%);padding:14px 32px;background:rgba(20,12,6,.92);border:2px solid #7a5c26;border-radius:8px;color:#ffd27a;font-size:16px;letter-spacing:2px;box-shadow:0 0 30px rgba(0,0,0,.9);z-index:20;text-align:center;font-family:inherit;max-width:640px;line-height:1.6;';
        $('hud').appendChild(b);
      }
      b.innerHTML = `<b>${found.text}</b><br><span style="font-size:11px;color:#a8895a;">ESC чтобы закрыть</span>`;
      b.style.display = 'block';
    }
    nearbyStela = found;
  }
}

/* MINIMAP */
const minimapCanvas = $('minimap');
const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
if (minimapCanvas) { minimapCanvas.width = 190; minimapCanvas.height = 190; }
function drawMinimap() {
  if (!minimapCtx) return;
  const c = minimapCtx, W = 190, H = 190;
  c.clearRect(0, 0, W, H);
  const worldW = ARENA*2, worldH = ARENA*2;
  const sc = Math.min(W/worldW, H/worldH) * 0.94;
  const ox = W/2, oy = H/2;
  const wx = x => ox + x * sc, wz = z => oy + z * sc;
  c.fillStyle = 'rgba(56,44,31,0.92)'; c.fillRect(wx(-ARENA), wz(-ARENA), worldW*sc, worldH*sc);
  c.fillStyle = 'rgba(96,78,54,0.50)'; c.fillRect(wx(-ARENA), wz(25), ARENA*2*sc, 40*sc);
  c.fillStyle = 'rgba(206,182,128,0.58)'; c.fillRect(wx(-25), wz(-22.5), 50*sc, 50*sc);
  c.fillStyle = 'rgba(68,48,70,0.55)'; c.fillRect(wx(-ARENA), wz(-ARENA), ARENA*2*sc, 45*sc);
  c.strokeStyle = '#ffd27a'; c.lineWidth = 2; c.strokeRect(wx(-ARENA), wz(-ARENA), worldW*sc, worldH*sc);
  c.beginPath(); c.fillStyle = 'rgba(70,180,220,0.78)'; c.arc(wx(0), wz(2.5), 6.1*sc, 0, TAU); c.fill();
  c.beginPath(); c.strokeStyle = 'rgba(170,230,255,0.85)'; c.lineWidth = 1.5; c.arc(wx(0), wz(2.5), 4.4*sc, 0, TAU); c.stroke();
  for (const e of enemies) {
    if (e.dead) continue;
    c.fillStyle = e.cfg.boss ? '#ff2020' : (e.isElite ? '#ff4400' : '#ff6644');
    const r = e.cfg.boss ? 4 : 2;
    c.beginPath(); c.arc(wx(e.mesh.position.x), wz(e.mesh.position.z), r, 0, TAU); c.fill();
  }
  c.fillStyle = '#ff99cc'; c.beginPath(); c.arc(wx(companion.pos.x), wz(companion.pos.z), 2.5, 0, TAU); c.fill();
  c.fillStyle = '#44aaff'; c.beginPath(); c.arc(wx(player.pos.x), wz(player.pos.z), 3.5, 0, TAU); c.fill();
  if (net.mode === 'host' && player2.alive) { c.fillStyle = '#ff8844'; c.beginPath(); c.arc(wx(player2.pos.x), wz(player2.pos.z), 3.5, 0, TAU); c.fill(); }
}
/* HUD */
function updateHUD() {
  const P = net.mode === 'client' ? player2 : player;
  $('hpVal').textContent = Math.max(0, Math.ceil(P.hp));
  $('apVal').textContent = Math.max(0, Math.ceil(P.armor));
  $('hpBar').firstElementChild.style.width = clamp(P.hp/P.maxHp*100, 0, 100) + '%';
  $('apBar').firstElementChild.style.width = clamp(P.armor/P.maxArmor*100, 0, 100) + '%';
  const w = P.weapons[P.curWeapon];
  $('wName').textContent = w.name;
  $('wAmmo').innerHTML = w.melee ? '∞' : `${w.ammo}<small> / ${w.ammoMax}</small>`;
  $('scoreVal').textContent = score;
  $('killVal').textContent = kills;
  if (waveActive) {
    $('wave').textContent = `ВОЛНА ${wave}`;
    $('waveSub').textContent = `Врагов: ${enemies.length + spawnQueue.length}`;
  } else {
    $('wave').textContent = `ВОЛНА ${wave+1} ЧЕРЕЗ ${Math.max(0, Math.ceil(waveBreakTimer))}`;
    $('waveSub').textContent = 'Приготовься...';
  }
}
function addFeed(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  $('feed').appendChild(d);
  setTimeout(() => d.remove(), 3400);
  while ($('feed').children.length > 8) $('feed').firstChild.remove();
}
let msgTimer = null;
function showMsg(text, dur) {
  dur = dur || 1500;
  $('msg').textContent = text;
  $('msg').style.opacity = '1';
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { $('msg').style.opacity = '0'; }, dur);
}
let dmgT = null;
function flashDamage() {
  $('dmgFlash').style.opacity = '0.85';
  clearTimeout(dmgT);
  dmgT = setTimeout(() => $('dmgFlash').style.opacity = '0', 90);
}
let healT = null;
function flashHeal() {
  $('healFlash').style.opacity = '0.7';
  clearTimeout(healT);
  healT = setTimeout(() => $('healFlash').style.opacity = '0', 90);
}

/* UPGRADES */
const UPGRADE_POOL = [
  { id:'dmg', icon:'⚔', name:'Урон +25%', desc:'Все оружия наносят на 25% больше урона.', rarity:'common', apply:P=>{ P.upgrades.damage = (P.upgrades.damage||1) * 1.25; } },
  { id:'hp', icon:'❤', name:'Здоровье +30', desc:'Максимум здоровья +30.', rarity:'common', apply:P=>{ P.maxHp += 30; P.hp = P.maxHp; } },
  { id:'rate', icon:'⚡', name:'Скорострельность +20%', desc:'Все оружия на 20% быстрее.', rarity:'common', apply:P=>{ P.upgrades.fireRate = (P.upgrades.fireRate||1) * 0.8; } },
  { id:'armor', icon:'🛡', name:'Броня +40', desc:'Максимум брони +40.', rarity:'common', apply:P=>{ P.maxArmor += 40; P.armor = P.maxArmor; } },
  { id:'soulMag', icon:'💠', name:'Пожиратель душ', desc:'+20% урона от ульты.', rarity:'rare', apply:P=>{ P.upgrades.ultDmg = (P.upgrades.ultDmg||1) * 1.2; } },
  { id:'lifesteal', icon:'🩸', name:'Вампиризм', desc:'+3 HP за убийство.', rarity:'rare', apply:P=>{ P.upgrades.lifesteal = (P.upgrades.lifesteal||0) + 3; } },
  { id:'regen', icon:'✚', name:'Регенерация', desc:'+2 HP каждые 3 сек.', rarity:'rare', apply:P=>{ P.upgrades.regen = (P.upgrades.regen||0) + 2; } },
  { id:'explosive', icon:'💥', name:'Взрывные пули', desc:'Микро-взрывы при попаданиях.', rarity:'epic', apply:P=>{ P.upgrades.explosive = true; } },
  { id:'giant', icon:'🔥', name:'Гигант', desc:'+50 HP, +25 брони, −10% скорости.', rarity:'epic', apply:P=>{ P.maxHp += 50; P.hp = P.maxHp; P.maxArmor += 25; P.armor = P.maxArmor; P.speed *= 0.9; } },
  { id:'bloodFeast', icon:'👑', name:'Кровавый пир', desc:'+2 HP за убийство (постоянно).', rarity:'epic', apply:P=>{ P.upgrades.bloodFeast = true; } },
  { id:'ultRage', icon:'🌪', name:'Смерч', desc:'Ульта наносит +50% урона.', rarity:'epic', apply:P=>{ P.upgrades.ultDmg = (P.upgrades.ultDmg||1) * 1.5; } },
  { id:'glass', icon:'💀', name:'Стеклянная пушка', desc:'×2 урона, но −50% макс. HP.', rarity:'epic', apply:P=>{ P.upgrades.damage *= 2; P.maxHp = Math.floor(P.maxHp*0.5); P.hp = Math.min(P.hp, P.maxHp); } },
  { id:'frenzyCurse', icon:'🔥', name:'Ярость мёртвых', desc:'Враги +40% быстрее.', rarity:'epic', apply:P=>{ P.upgrades._frenzy = true; } },
  { id:'oneShot', icon:'🎯', name:'Один патрон', desc:'−70% боезапас, +150% урона.', rarity:'epic', apply:P=>{ P.upgrades.damage *= 2.5; for (const w of P.weapons) if (w.ammoMax < 10000) w.ammoMax = Math.floor(w.ammoMax*0.3); } }
];
function pickUpgrades(count) {
  const pool = UPGRADE_POOL.slice();
  const picked = [];
  for (let i = 0; i < count && pool.length; i++) {
    const idx = Math.floor(Math.random()*pool.length);
    picked.push(pool.splice(idx,1)[0]);
  }
  return picked;
}
function showUpgradeScreen() {
  if (!player.alive) return;
  const isCurse = (wave > 0 && wave % 5 === 0);
  const cards = pickUpgrades(3);
  if (isCurse) {
    const pool = UPGRADE_POOL.filter(u => ['glass','frenzyCurse','oneShot'].includes(u.id));
    if (pool.length) cards[2] = pick(pool);
  }
  const container = $('upgradeCards');
  container.innerHTML = '';
  for (const card of cards) {
    const el = document.createElement('div');
    el.className = 'card r-' + card.rarity;
    el.innerHTML = `<div class="icon">${card.icon}</div><div class="name">${card.name}</div><div class="desc">${card.desc}</div><div class="rarity">${card.rarity === 'common' ? 'ОБЫЧНОЕ' : card.rarity === 'rare' ? 'РЕДКОЕ' : 'ЭПИЧЕСКОЕ'}</div>`;
    el.onclick = () => {
      card.apply(player);
      if (player2 && net.mode === 'host') card.apply(player2);
      if (card.id === 'frenzyCurse') addFeed('<span style="color:#ff8844">⚠ Проклятие: враги быстрее</span>');
      const U = player.upgrades;
      if (U.lifesteal && U.bloodFeast && !U.sets.blood) { U.sets.blood = true; player.maxHp += 25; player.hp = Math.min(player.hp+25, player.maxHp); addFeed('<span style="color:#ff4444;font-weight:bold">★ СЕТ: КРОВАВЫЙ БОГ</span>'); }
      if (U.explosive && U.ultDmg >= 1.5 && !U.sets.chaos) { U.sets.chaos = true; addFeed('<span style="color:#ff6622;font-weight:bold">★ СЕТ: ХАОС</span>'); }
      if (U.regen && U.damage >= 1.25 && !U.sets.tank) { U.sets.tank = true; player.maxArmor += 30; player.armor = player.maxArmor; addFeed('<span style="color:#66ddff;font-weight:bold">★ СЕТ: КРЕПОСТЬ</span>'); }
      SFX.pickup();
      $('upgradeScreen').classList.add('hidden');
      gameState = 'playing';
      safeLock();
      clock.getDelta();
      waveBreakTimer = 0.5;
    };
    container.appendChild(el);
  }
  $('upgradeScreen').classList.remove('hidden');
  gameState = 'paused';
  if (document.exitPointerLock) document.exitPointerLock();
}

/* META */
const META_KEY = 'wrath_meta_v2';
function loadMeta() { try { const r = localStorage.getItem(META_KEY); if (r) return JSON.parse(r); } catch(_) {} return { credits:0, totalKills:0, bestScore:0, upgrades:{} }; }
function saveMeta(m) { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch(_) {} }
let meta = loadMeta();
const META_UPGRADES = [
  { id:'hpStart', name:'Живучесть', desc:'+10 HP', maxLvl:5, baseCost:50, costMul:1.8, apply:lvl=>{ player.maxHp = 100 + lvl*10; player.hp = player.maxHp; } },
  { id:'dmgStart', name:'Оружейник', desc:'+8% урон', maxLvl:5, baseCost:80, costMul:1.9, apply:lvl=>{ player.upgrades.damage = (player.upgrades.damage||1) * (1 + lvl*0.08); } },
  { id:'grenades', name:'Арсенал', desc:'+1 граната', maxLvl:3, baseCost:120, costMul:2.2, apply:lvl=>{ player.grenades = 3 + lvl; } },
  { id:'armorStart', name:'Кузнец', desc:'+20 брони', maxLvl:3, baseCost:70, costMul:1.8, apply:lvl=>{ player.armor = lvl*20; player.maxArmor = 100 + lvl*20; } },
  { id:'soulDmg', name:'Пожиратель душ', desc:'+15% ульта', maxLvl:3, baseCost:150, costMul:2.1, apply:lvl=>{ player.upgrades.ultDmg = (player.upgrades.ultDmg||1) * (1 + lvl*0.15); } }
];
function metaCost(up, lvl) { return Math.floor(up.baseCost * Math.pow(up.costMul, lvl)); }
function renderMetaScreen() {
  meta = loadMeta();
  $('metaStats').innerHTML = `УБИЙСТВ: <b>${meta.totalKills}</b> · ЛУЧШИЙ: <b>${meta.bestScore}</b><br>КРЕДИТЫ: <b style="color:#ffd27a">${meta.credits}</b>`;
  const c = $('metaUpgrades');
  c.innerHTML = '';
  for (const up of META_UPGRADES) {
    const lvl = meta.upgrades[up.id] || 0;
    const cost = metaCost(up, lvl);
    const maxed = lvl >= up.maxLvl;
    const canBuy = !maxed && meta.credits >= cost;
    const row = document.createElement('div');
    row.className = 'metaRow';
    row.innerHTML = `<div class="info"><div class="nm">${up.name}</div><div class="ds">${up.desc}</div></div><div class="lvl">ур.${lvl}/${up.maxLvl}</div><button ${canBuy?'':'disabled'} data-id="${up.id}">${maxed?'MAX':'КУПИТЬ · '+cost}</button>`;
    c.appendChild(row);
  }
  c.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      const up = META_UPGRADES.find(u => u.id === id);
      if (!up) return;
      const lvl = meta.upgrades[up.id] || 0;
      const cost = metaCost(up, lvl);
      if (lvl >= up.maxLvl || meta.credits < cost) return;
      meta.credits -= cost;
      meta.upgrades[up.id] = lvl + 1;
      saveMeta(meta);
      SFX.pickup();
      renderMetaScreen();
    };
  });
}
function applyMetaBonuses() {
  meta = loadMeta();
  player.maxHp = 100; player.hp = 100;
  player.maxArmor = 100; player.armor = 0;
  player.grenades = 3;
  player.upgrades = { damage:1, fireRate:1, pierce:0, regen:0, lifesteal:0, ultDmg:1, explosive:false, bloodFeast:false, sets:{}, _bulletCount:0, _regenT:0 };
  for (const up of META_UPGRADES) {
    const lvl = meta.upgrades[up.id] || 0;
    if (lvl > 0) try { up.apply(lvl); } catch(e) {}
  }
}
function saveScore(rec) {
  try {
    const raw = localStorage.getItem('wrath_scores_v1');
    let list = raw ? JSON.parse(raw) : [];
    list.push(rec);
    list.sort((a,b) => b.score-a.score);
    list = list.slice(0,10);
    localStorage.setItem('wrath_scores_v1', JSON.stringify(list));
  } catch(e) {}
}
function renderBoard() {
  let list = [];
  try { const raw = localStorage.getItem('wrath_scores_v1'); if (raw) list = JSON.parse(raw); } catch(e) {}
  const el = $('boardList');
  el.innerHTML = list.length
    ? list.map((r,i) => `<div>${i+1}. <b style="color:#fff">${r.score}</b> — волна ${r.wave}, ${r.kills} убийств · ${r.diff || 'normal'}</div>`).join('')
    : '<i>Пока нет записей.</i>';
  const ach = loadAch();
  $('achList').innerHTML = ACHIEVEMENTS.map(a => {
    const got = ach[a.id];
    return `<div style="opacity:${got?1:0.35};">${got?'✅':'⬜'} <b style="color:${got?'#ffd27a':'#888'}">${a.name}</b> — ${a.desc}</div>`;
  }).join('');
}

/* NETWORK */
const PEER_CONFIG = {
  debug: 1, host: '0.peerjs.com', port: 443, path: '/', secure: true,
  config: { iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ] }
};
const net = {
  mode: 'none', peer: null, conn: null, nick: '', peerId: '', connected: false,
  hostTickT: 0, TICK: 0.05,
  remoteInput: { forward:false, back:false, left:false, right:false, jump:false, sprint:false, shoot:false, yawDelta:0, pitchDelta:0 },
  events: []
};
function netEvent(t, d) { net.events.push({ t, ...d }); }
const NICKS_ADJ = ['Короткий','Длинный','Мокрый','Сухой','Толстый','Тонкий','Лысый','Волосатый','Бородатый','Ржавый','Косой','Пьяный','Сонный','Голодный','Злой','Весёлый','Хромой','Кривой','Пузатый','Задумчивый','Скромный','Буйный','Тихий','Тупой','Хитрый','Упрямый','Грязный','Ленивый','Быстрый','Пугливый'];
const NICKS_NOUN = ['Писюн','Кулак','Кот','Дракон','Баран','Молот','Кабан','Хомяк','Пельмень','Чувак','Сатир','Титан','Кентавр','Гопник','Депутат','Сантехник','Барабашка','Скелет','Минотавр','Гарпия','Циклоп','Грифон','Щегол','Крот','Воробей','Огурец','Помидор','Кирпич','Валенок','Морж'];
const TRANSLIT = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',' ':'-' };
function translit(s) { return s.toLowerCase().split('').map(c => TRANSLIT[c] != null ? TRANSLIT[c] : c).join('').replace(/[^a-z0-9-]/g,'').replace(/-+/g,'-').replace(/^-|-$/g,''); }
function genNick() { return pick(NICKS_ADJ) + ' ' + pick(NICKS_NOUN); }
function setConnState(side, state, text, sub) {
  const p = side === 1 ? '' : '2';
  const box = $('connStatus' + p);
  const textEl = $('connText' + p);
  const subEl = $('connSub' + p);
  if (!box) return;
  box.className = 'state-' + state;
  if (textEl) textEl.textContent = text;
  if (subEl) subEl.textContent = sub || '';
}
function makePeer(peerId, onReady, onError) {
  let peer;
  try { peer = peerId ? new Peer(peerId, PEER_CONFIG) : new Peer(PEER_CONFIG); }
  catch(e) { onError({ type:'create-failed', message:e.message }); return null; }
  let opened = false;
  const timeout = setTimeout(() => { if (!opened) { try { peer.destroy(); } catch(_) {} onError({ type:'timeout' }); } }, 10000);
  peer.on('open', id => { opened = true; clearTimeout(timeout); onReady(peer, id); });
  peer.on('error', e => { clearTimeout(timeout); onError(e); });
  peer.on('disconnected', () => { try { peer.reconnect(); } catch(_) {} });
  return peer;
}
function humanizePeerError(e) {
  if (!e) return 'НЕИЗВЕСТНАЯ ОШИБКА';
  const t = e.type || e.message || '';
  if (t === 'network' || t === 'socket-error' || t === 'socket-closed' || t === 'timeout') return 'НЕТ СВЯЗИ С СЕРВЕРОМ';
  if (t === 'server-error') return 'СЕРВЕР PEERJS НЕДОСТУПЕН';
  if (t === 'unavailable-id') return 'НИК ЗАНЯТ';
  if (t === 'peer-unavailable') return 'ИГРОК НЕ НАЙДЕН';
  return 'ОШИБКА: ' + t.toUpperCase();
}
function startHost() {
  net.mode = 'host';
  net.nick = genNick();
  net.peerId = 'wrath-olympus-v14-' + translit(net.nick);
  $('netChoice').classList.add('hidden');
  $('hostPanel').classList.remove('hidden');
  $('joinPanel').classList.add('hidden');
  $('nickBox').textContent = net.nick;
  $('startNetBtn').classList.add('hidden');
  $('retryNetBtn').classList.add('hidden');
  setConnState(1, 'info', 'СОЗДАЁМ КОМНАТУ...', '');
  let attempts = 0;
  function tryConnect() {
    attempts++;
    setConnState(1, 'wait', attempts > 1 ? 'ПОПЫТКА ' + attempts + '...' : 'СОЗДАЁМ КОМНАТУ...', '');
    net.peer = makePeer(net.peerId, peer => {
      setConnState(1, 'wait', 'ОЖИДАНИЕ ИГРОКА...', 'Отправь другу ссылку или ник «' + net.nick + '»');
      peer.on('connection', conn => {
        net.conn = conn;
        conn.on('open', () => {
          net.connected = true;
          SFX.connect();
          setConnState(1, 'ok', '✓ ИГРОК ПОДКЛЮЧЁН!', 'Жми «НАЧАТЬ ИГРУ»');
          $('startNetBtn').classList.remove('hidden');
        });
        conn.on('data', onClientData);
        conn.on('close', () => {
          net.connected = false;
          setConnState(1, 'wait', 'ИГРОК ОТКЛЮЧИЛСЯ', '');
          $('startNetBtn').classList.add('hidden');
        });
      });
    }, e => {
      const retr = ['network','socket-error','socket-closed','timeout','server-error'].includes(e.type);
      if (e.type === 'unavailable-id') {
        setConnState(1, 'wait', 'НИК ЗАНЯТ', '');
        try { net.peer.destroy(); } catch(_) {}
        net.nick = genNick();
        net.peerId = 'wrath-olympus-v14-' + translit(net.nick);
        $('nickBox').textContent = net.nick;
        setTimeout(tryConnect, 400);
        return;
      }
      if (retr && attempts < 3) {
        setConnState(1, 'wait', 'ПОПЫТКА ' + attempts + ' НЕ УДАЛАСЬ', 'Ждём 2 сек...');
        try { net.peer.destroy(); } catch(_) {}
        setTimeout(tryConnect, 2000);
        return;
      }
      setConnState(1, 'err', humanizePeerError(e), 'Попробуй ещё раз');
      $('retryNetBtn').classList.remove('hidden');
    });
  }
  tryConnect();
}
function joinRoom(input) {
  let code = input.trim();
  if (code.includes('join=')) { try { const u = new URL(code, location.href); code = u.searchParams.get('join') || code; } catch(_) {} }
  code = decodeURIComponent(code).replace(/^wrath-olympus-v14-/i, '').trim();
  if (!code) { setConnState(2, 'err', 'ВВЕДИ НИК ИЛИ ССЫЛКУ', ''); return; }
  net.nick = code;
  net.mode = 'client';
  net.peerId = 'wrath-olympus-v14-' + translit(code);
  setConnState(2, 'info', 'ПОДКЛЮЧАЕМСЯ К «' + code + '»...', '');
  let attempts = 0;
  function tryJoin() {
    attempts++;
    setConnState(2, attempts > 1 ? 'wait' : 'info', attempts > 1 ? 'ПОПЫТКА ' + attempts + '...' : 'ПОДКЛЮЧАЕМСЯ К «' + code + '»...', '');
    net.peer = makePeer(null, peer => {
      const conn = peer.connect(net.peerId, { reliable: true });
      net.conn = conn;
      let settled = false;
      const ct = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { conn.close(); } catch(_) {}
          if (attempts < 3) { setConnState(2, 'wait', 'ХОСТ НЕ ОТВЕЧАЕТ', 'Пробуем ещё...'); setTimeout(tryJoin, 2000); }
          else setConnState(2, 'err', 'ХОСТ НЕ ОТВЕЧАЕТ', 'Проверь ник.');
        }
      }, 8000);
      conn.on('open', () => {
        settled = true;
        clearTimeout(ct);
        net.connected = true;
        SFX.connect();
        setConnState(2, 'ok', '✓ ПОДКЛЮЧЕНО!', 'Ждём старта');
      });
      conn.on('data', onHostData);
      conn.on('close', () => { net.connected = false; setConnState(2, 'err', 'ХОСТ ОТКЛЮЧИЛСЯ', ''); });
    }, e => {
      if (e.type === 'peer-unavailable') { setConnState(2, 'err', 'ИГРОК «' + code + '» НЕ НАЙДЕН', ''); return; }
      const retr = ['network','socket-error','socket-closed','timeout','server-error'].includes(e.type);
      if (retr && attempts < 3) {
        setConnState(2, 'wait', 'ПОПЫТКА ' + attempts + ' НЕ УДАЛАСЬ', 'Ждём 2 сек...');
        try { net.peer.destroy(); } catch(_) {}
        setTimeout(tryJoin, 2000);
        return;
      }
      setConnState(2, 'err', humanizePeerError(e), '');
    });
  }
  tryJoin();
}
function onClientData(data) {
  if (!data || data.t !== 'input') return;
  const i = data.i;
  net.remoteInput.forward = i.forward; net.remoteInput.back = i.back;
  net.remoteInput.left = i.left; net.remoteInput.right = i.right;
  net.remoteInput.jump = i.jump; net.remoteInput.sprint = i.sprint;
  net.remoteInput.shoot = i.shoot;
  net.remoteInput.yawDelta = i.yawDelta; net.remoteInput.pitchDelta = i.pitchDelta;
}
function onHostData(data) {
  if (!data) return;
  if (data.t === 'state') applyNetState(data);
  else if (data.t === 'start') startNetClientGame();
  else if (data.t === 'event') handleNetEvent(data.e);
  else if (data.t === 'end') {
    gameState = 'over';
    if ($('goStats')) $('goStats').innerHTML = data.stats || '';
    $('overScreen').classList.remove('hidden');
  }
}
function sendToPeer(obj) { if (net.conn && net.conn.open) try { net.conn.send(obj); } catch(e) {} }
function serializeState() {
  const evs = net.events; net.events = [];
  return {
    t: 'state', wave, waveActive, currentLevel, ngPlus, score, kills,
    p1: { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw, pitch: player.pitch, hp: player.hp, armor: player.armor, alive: player.alive, w: player.curWeapon, souls: player.souls },
    p2: { x: player2.pos.x, y: player2.pos.y, z: player2.pos.z, yaw: player2.yaw, pitch: player2.pitch, hp: player2.hp, armor: player2.armor, alive: player2.alive, w: player2.curWeapon, souls: player2.souls },
    enemies: enemies.map(e => ({ id:e.netId, type:e.type, x:e.mesh.position.x, y:e.mesh.position.y, z:e.mesh.position.z, yaw:e.mesh.rotation.y, hp:e.hp, maxHp:e.maxHp, spawnT:e.spawnT })),
    companion: { x: companion.pos.x, y: companion.pos.y, z: companion.pos.z, yaw: companion.yaw, panic: companion.panic },
    events: evs
  };
}
function applyNetState(s) {
  wave = s.wave; waveActive = s.waveActive;
  if (s.currentLevel !== currentLevel) { currentLevel = s.currentLevel; applyLevel(currentLevel); }
  score = s.score; kills = s.kills;
  player.pos.set(s.p1.x, s.p1.y, s.p1.z);
  player.yaw = s.p1.yaw; player.pitch = s.p1.pitch;
  player.hp = s.p1.hp; player.armor = s.p1.armor; player.alive = s.p1.alive;
  player.souls = s.p1.souls;
  player2.pos.set(s.p2.x, s.p2.y, s.p2.z);
  player2.yaw = s.p2.yaw; player2.pitch = s.p2.pitch;
  player2.hp = s.p2.hp; player2.armor = s.p2.armor; player2.alive = s.p2.alive;
  player2.curWeapon = s.p2.w; player2.souls = s.p2.souls;
  if (player.avatar) { player.avatar.position.set(s.p1.x, 0, s.p1.z); player.avatar.rotation.y = s.p1.yaw + Math.PI; }
  companion.pos.set(s.companion.x, s.companion.y, s.companion.z);
  companion.yaw = s.companion.yaw;
  if (companion.mesh) { companion.mesh.position.copy(companion.pos); companion.mesh.rotation.y = companion.yaw; }
  const seen = new Set();
  for (const es of s.enemies) {
    seen.add(es.id);
    let e = enemies.find(x => x.netId === es.id);
    if (!e) { e = spawnEnemyClient(es.type, new THREE.Vector3(es.x, es.y, es.z)); e.netId = es.id; }
    e.mesh.position.set(es.x, es.y, es.z);
    e.mesh.rotation.y = es.yaw;
    e.hp = es.hp; e.maxHp = es.maxHp; e.spawnT = es.spawnT;
    if (e.bar) { const pct = clamp(e.hp/e.maxHp, 0, 1); e.bar._fill.style.width = (pct*100) + '%'; }
  }
  for (let i = enemies.length-1; i >= 0; i--) {
    if (!seen.has(enemies[i].netId)) { releaseBar(enemies[i].bar); scene.remove(enemies[i].mesh); enemies.splice(i,1); }
  }
  if (s.events) for (const ev of s.events) handleNetEvent(ev);
  updateHUD();
  updateUltHUD();
}
function spawnEnemyClient(type, pos) {
  const cfg = ENEMY_TYPES[type];
  const mesh = buildEnemyMesh(type);
  mesh.position.copy(pos);
  if (cfg.fly) mesh.position.y = cfg.flyH;
  mesh.traverse(o => { if (o.isMesh) o.castShadow = false; });
  scene.add(mesh);
  const e = { type, cfg, mesh, netId: null, hp: cfg.hp, maxHp: cfg.hp, radius: cfg.hitR*0.55, vel: new THREE.Vector3(), atkCd: 999, hurtT: 0, dead: false, animT: Math.random()*10, strafe: 1, strafeT: 1, spawnT: 0.55, bar: null, isClient: true, phase2: false, phase3: false, windup: 0, status:{ burn:0, freeze:0, poison:0 }, _burnTick: 0, _poisonTick: 0, _dmgMul: 1, _speedMul: 1 };
  e.bar = getBar(cfg.boss);
  e.bar._nm.textContent = cfg.boss ? LEVELS[currentLevel].bossName : cfg.name;
  enemies.push(e);
  return e;
}
function handleNetEvent(ev) {
  if (!ev) return;
  if (ev.t === 'explode') {
    const p = new THREE.Vector3(ev.x, ev.y, ev.z);
    SFX.explode();
    burst(p, 14, { mat:'fire', speed:14, life:0.55, size:0.3, gravity:12 });
    burst(p, 8, { mat:'smoke', speed:6, life:1.0, size:0.55, gravity:-2, spin:false });
    useFlashLight(p, 30, (ev.r||6)*3, 0xffaa44, 0.32);
  } else if (ev.t === 'beam') {
    spawnBeam(new THREE.Vector3(ev.fx,ev.fy,ev.fz), new THREE.Vector3(ev.tx,ev.ty,ev.tz), ev.c, ev.rad, ev.life);
  } else if (ev.t === 'ult') {
    const P = ev.p === 1 ? player : player2;
    const R = ev.R || 24;
    const isRage = !!ev.rage;
    const col = isRage ? 0xffaa22 : 0x66ddff;
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1,24,16), new THREE.MeshBasicMaterial({ color: col, transparent:true, opacity:0.42, depthWrite:false, side:THREE.DoubleSide }));
    sphere.position.copy(P.pos); sphere.position.y += 0.6;
    scene.add(sphere);
    ultWaves.push({ mesh: sphere, life: 0.85, max: 0.85, delay: 0, R, isSphere: true });
    const cols = isRage ? [0xfff5cc,0xffcc44,0xff7722] : [0xffffff,0x88ccff,0x2299dd];
    for (let k = 0; k < 3; k++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8,1.4,48), new THREE.MeshBasicMaterial({ color: cols[k], transparent:true, opacity:0.95, side:THREE.DoubleSide, depthWrite:false }));
      ring.rotation.x = -Math.PI/2;
      ring.position.copy(P.pos); ring.position.y = 0.4+k*0.15;
      scene.add(ring);
      ultWaves.push({ mesh: ring, life: 0.85+k*0.12, max: 0.85+k*0.12, delay: k*0.08, R, isSphere: false });
    }
    SFX.ult();
  } else if (ev.t === 'feed') addFeed(ev.html);
}
function sendClientInput() {
  if (net.mode !== 'client' || !net.connected) return;
  sendToPeer({ t:'input', i:{
    forward: !!keys2['KeyI'], back: !!keys2['KeyK'], left: !!keys2['KeyJ'], right: !!keys2['KeyL'],
    jump: !!keys2['Comma'], sprint: !!keys2['Period'], shoot: !!keys2['Slash'],
    yawDelta: (keys2['ArrowLeft']?1:0)-(keys2['ArrowRight']?1:0),
    pitchDelta: (keys2['ArrowDown']?1:0)-(keys2['ArrowUp']?1:0)
  }});
}
function applyRemoteInput(dt) {
  const inp = net.remoteInput, P = player2;
  if (!P.alive) return;
  P.yaw += inp.yawDelta * dt * 2.2;
  P.pitch = clamp(P.pitch + inp.pitchDelta*dt*1.7, -Math.PI/2+0.05, Math.PI/2-0.05);
  const fwd = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  const right = new THREE.Vector3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  const wish = new THREE.Vector3();
  if (inp.forward) wish.add(fwd);
  if (inp.back) wish.sub(fwd);
  if (inp.right) wish.add(right);
  if (inp.left) wish.sub(right);
  const moving = wish.lengthSq() > 0;
  if (moving) wish.normalize();
  const spd = P.speed * (inp.sprint && moving ? P.sprintMul : 1);
  const accel = P.onGround ? 58 : 16;
  P.vel.x = lerp(P.vel.x, wish.x*spd, Math.min(1, accel*dt/spd||0));
  P.vel.z = lerp(P.vel.z, wish.z*spd, Math.min(1, accel*dt/spd||0));
  if (inp.jump && P.onGround) { P.vel.y = P.jumpPower; P.onGround = false; }
  P.vel.y -= GRAVITY*dt;
  P.pos.x += P.vel.x*dt; P.pos.z += P.vel.z*dt; P.pos.y += P.vel.y*dt;
  if (P.pos.y <= P.height) { P.pos.y = P.height; P.vel.y = 0; P.onGround = true; }
  const p2 = { x: P.pos.x, z: P.pos.z };
  collide(p2, P.radius);
  P.pos.x = p2.x; P.pos.z = p2.z;
  if (P.weaponCd > 0) P.weaponCd -= dt;
  const w = P.weapons[P.curWeapon];
  if (inp.shoot && P.weaponCd <= 0 && (w.melee || w.ammo > 0)) {
    if (!player2.tempCam) player2.tempCam = new THREE.PerspectiveCamera(78, 1, 0.08, 600);
    player2.tempCam.position.set(P.pos.x, P.pos.y, P.pos.z);
    player2.tempCam.rotation.set(P.pitch, P.yaw, 0, 'YXZ');
    tryFire(P, player2.tempCam);
  }
  if (P.avatar) {
    P.avatar.position.set(P.pos.x, 0, P.pos.z);
    P.avatar.rotation.y = P.yaw + Math.PI;
  }
}

/* GAME STATE */
let gameState = 'menu';
const clock = new THREE.Clock();
function resetGame() {
  for (const e of enemies) { releaseBar(e.bar); scene.remove(e.mesh); }
  enemies.length = 0;
  enemyHitMeshes.length = 0;
  nextNetId = 1;
  markRayTargetsDirty();
  for (const p of projectiles) scene.remove(p.mesh);
  projectiles.length = 0;
  for (const g of grenades) scene.remove(g.mesh);
  grenades.length = 0;
  for (const p of pickups) scene.remove(p.mesh);
  pickups.length = 0;
  for (const p of powerups) scene.remove(p.mesh);
  powerups.length = 0;
  for (const b of beams) scene.remove(b.m);
  beams.length = 0;
  for (const w of ultWaves) scene.remove(w.mesh);
  ultWaves.length = 0;
  for (const p of particles) p.visible = false;
  particles.length = 0;
  for (const s of soulOrbs) scene.remove(s.mesh);
  soulOrbs.length = 0;
  applyMetaBonuses();
  player.pos.set(0, 1.7, 45); player.vel.set(0,0,0);
  player.yaw = Math.PI; player.pitch = 0;
  player.alive = true; player.invuln = 0; player.recoil = 0; player.kick = 0;
  player.weapons = makeWeapons(); player.curWeapon = 0; player.weaponCd = 0; player.souls = 0;
  player.powerups = {};
  player2.pos.set(-3, 1.7, 47); player2.vel.set(0,0,0);
  player2.yaw = Math.PI; player2.pitch = 0;
  player2.hp = player2.maxHp; player2.armor = 0;
  player2.alive = true; player2.invuln = 0; player2.recoil = 0; player2.kick = 0;
  player2.weapons = makeWeapons(); player2.curWeapon = 0; player2.weaponCd = 0; player2.souls = 0;
  player2.powerups = {};
  player2.avatar.position.copy(player2.pos); player2.avatar.position.y = 0;
  wave = 0; score = 0; kills = 0;
  combo = 0; comboTimer = 0; hideComboBox();
  streakCount = 0; streakTimer = 0;
  spawnQueue = []; waveActive = false; waveBreakTimer = 1.2;
  activeModifier = null; isRushWave = false;
  if (currentWeather) { try { currentWeather.end(); } catch(_) {} currentWeather = null; }
  currentLevel = 0; ngPlus = 0;
  dailyMode = false;
  applyLevel(0);
  companion.pos.set(8, 0, 28); companion.vel.set(0,0,0);
  companion.state = 'wander'; companion.stateT = 2; companion.panic = false;
  companion.tripTimer = 0; companion.tripCd = 10;
  companion.trickTimer = 0; companion.trickCd = 6; companion.aidCd = 8;
  companion.mesh.position.copy(companion.pos);
  $('feed').innerHTML = '';
  updateHUD();
  updateUltHUD();
}
function gameOver() {
  gameState = 'over';
  Music.setMode('calm');
  if (document.exitPointerLock) document.exitPointerLock();
  meta = loadMeta();
  meta.totalKills += kills;
  meta.bestScore = Math.max(meta.bestScore, score);
  meta.credits += Math.floor(score / 100 * DIFFICULTIES[currentDiff].creditMul);
  saveMeta(meta);
  saveScore({ score, wave, kills, diff: currentDiff, date: Date.now() });
  $('goStats').innerHTML = `УРОВЕНЬ <b>${currentLevel+1} (${LEVELS[currentLevel].name})</b><br>ВОЛНА <b>${wave}</b><br>УБИЙСТВ <b>${kills}</b><br>ОЧКОВ <b>${score}</b><br><span style="color:#ffd27a">+${Math.floor(score/100*DIFFICULTIES[currentDiff].creditMul)} кредитов</span>`;
  $('overScreen').classList.remove('hidden');
  mouseDown = false;
  if (sayBubble) sayBubble.style.opacity = '0';
  if (net.mode === 'host' && net.connected) sendToPeer({ t:'end', stats: $('goStats').innerHTML });
}
function startSolo() {
  initAudio();
  if (actx && actx.state === 'suspended') actx.resume();
  player2.avatar.visible = false;
  $('ultBox').style.display = 'block';
  $('modeScreen').classList.add('hidden');
  net.mode = 'none';
  resetGame();
  gameState = 'playing';
  safeLock();
  clock.getDelta();
  Music.start();
  Music.setMode('combat');
  setTimeout(() => companionSay('Ну наконец-то!', 2400), 800);
}
function startNetHost() {
  initAudio();
  if (actx && actx.state === 'suspended') actx.resume();
  player2.alive = true;
  player2.hp = player2.maxHp;
  player2.armor = 0;
  player2.pos.set(-3, 1.7, 47);
  player2.vel.set(0,0,0);
  player2.yaw = Math.PI;
  player2.weapons = makeWeapons();
  player2.curWeapon = 0;
  player2.souls = 0;
  player2.avatar.visible = true;
  player2.avatar.position.copy(player2.pos);
  player2.avatar.position.y = 0;
  $('ultBox').style.display = 'block';
  $('netScreen').classList.add('hidden');
  resetGame();
  gameState = 'playing';
  safeLock();
  clock.getDelta();
  Music.start();
  Music.setMode('combat');
  sendToPeer({ t:'start' });
}
function startNetClientGame() {
  $('ultBox').style.display = 'block';
  player2.alive = true;
  player2.hp = player2.maxHp;
  player2.weapons = makeWeapons();
  player2.curWeapon = 0;
  player2.souls = 0;
  player2.avatar.visible = false;
  player.avatar.visible = true;
  $('netScreen').classList.add('hidden');
  gameState = 'playing';
  safeLock();
  Music.start();
  Music.setMode('combat');
}

/* BUTTONS */
$('introBtn').onclick = () => {
  initAudio();
  if (actx && actx.state === 'suspended') actx.resume();
  $('introScreen').classList.add('hidden');
  $('modeScreen').classList.remove('hidden');
};
$('diffEasy').onclick = () => { currentDiff = 'easy'; $('diffLabel').textContent = 'СЛОЖНОСТЬ: ЛЕГКО'; };
$('diffNormal').onclick = () => { currentDiff = 'normal'; $('diffLabel').textContent = 'СЛОЖНОСТЬ: ОБЫЧНО'; };
$('diffHard').onclick = () => { currentDiff = 'hard'; $('diffLabel').textContent = 'СЛОЖНОСТЬ: КОШМАР'; };
$('soloBtn').onclick = startSolo;
$('dailyBtn').onclick = () => {
  dailyMode = true;
  const d = new Date();
  dailySeed = d.getFullYear()*10000 + (d.getMonth()+1)*100 + d.getDate();
  startSolo();
};
$('metaBtn').onclick = () => { $('modeScreen').classList.add('hidden'); $('metaScreen').classList.remove('hidden'); renderMetaScreen(); };
$('metaBackBtn').onclick = () => { $('metaScreen').classList.add('hidden'); $('modeScreen').classList.remove('hidden'); };
$('boardBtn').onclick = () => { $('modeScreen').classList.add('hidden'); $('boardScreen').classList.remove('hidden'); renderBoard(); };
$('boardBackBtn').onclick = () => { $('boardScreen').classList.add('hidden'); $('modeScreen').classList.remove('hidden'); };
$('netBtn').onclick = () => {
  initAudio();
  $('modeScreen').classList.add('hidden');
  $('netScreen').classList.remove('hidden');
  $('netChoice').classList.remove('hidden');
  $('hostPanel').classList.add('hidden');
  $('joinPanel').classList.add('hidden');
};
$('netBackBtn').onclick = () => {
  if (net.peer) try { net.peer.destroy(); } catch(e) {}
  net.peer = null; net.conn = null; net.connected = false; net.mode = 'none';
  $('netScreen').classList.add('hidden');
  $('modeScreen').classList.remove('hidden');
  $('hostPanel').classList.add('hidden');
  $('joinPanel').classList.add('hidden');
  $('netChoice').classList.remove('hidden');
  $('codeInput').value = '';
};
$('hostBtn').onclick = startHost;
$('joinBtn').onclick = () => { $('netChoice').classList.add('hidden'); $('joinPanel').classList.remove('hidden'); $('codeInput').focus(); };
$('joinConfirmBtn').onclick = () => {
  const c = $('codeInput').value.trim();
  if (c.length < 2) { setConnState(2, 'err', 'ВВЕДИ НИК ИЛИ ССЫЛКУ', ''); return; }
  joinRoom(c);
};
$('codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('joinConfirmBtn').click(); });
$('startNetBtn').onclick = startNetHost;
$('rerollBtn').onclick = () => {
  if (net.peer) try { net.peer.destroy(); } catch(_) {}
  net.peer = null; net.conn = null; net.connected = false;
  $('startNetBtn').classList.add('hidden');
  startHost();
};
$('retryNetBtn').onclick = () => {
  if (net.peer) try { net.peer.destroy(); } catch(_) {}
  net.peer = null; net.conn = null; net.connected = false;
  $('startNetBtn').classList.add('hidden');
  $('retryNetBtn').classList.add('hidden');
  startHost();
};
$('nickBox').onclick = () => {
  const t = net.nick;
  const done = () => { $('nickBox').textContent = '✓ ' + t; setTimeout(() => $('nickBox').textContent = t, 1500); };
  const fb = () => {
    const ta = document.createElement('textarea');
    ta.value = t; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch(_) {}
    document.body.removeChild(ta); done();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done).catch(fb);
  else fb();
};
$('copyInviteBtn').onclick = () => {
  const link = location.origin + location.pathname + '?join=' + encodeURIComponent(net.nick);
  const done = () => { $('copyInviteBtn').textContent = '✓ ССЫЛКА!'; setTimeout(() => $('copyInviteBtn').textContent = '📋 СКОПИРОВАТЬ ССЫЛКУ', 1800); };
  const fb = () => {
    const ta = document.createElement('textarea');
    ta.value = link; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch(_) {}
    document.body.removeChild(ta); done();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done).catch(fb);
  else fb();
};
$('resumeBtn').onclick = () => {
  $('pauseScreen').classList.add('hidden');
  gameState = 'playing';
  safeLock();
  clock.getDelta();
};
$('pauseExitBtn').onclick = () => {
  $('pauseScreen').classList.add('hidden');
  if (net.peer) try { net.peer.destroy(); } catch(e) {}
  net.peer = null; net.conn = null; net.connected = false; net.mode = 'none';
  player2.avatar.visible = false;
  $('ultBox').style.display = 'none';
  $('modeScreen').classList.remove('hidden');
  gameState = 'menu';
  Music.setMode('calm');
  resetGame();
};
$('victoryBtn').onclick = () => {
  $('victoryScreen').classList.add('hidden');
  $('modeScreen').classList.remove('hidden');
  gameState = 'menu';
  resetGame();
};
$('restartBtn').onclick = () => {
  $('overScreen').classList.add('hidden');
  if (net.peer) try { net.peer.destroy(); } catch(e) {}
  net.peer = null; net.conn = null; net.connected = false; net.mode = 'none';
  player2.avatar.visible = false;
  $('modeScreen').classList.remove('hidden');
  gameState = 'menu';
  resetGame();
};

/* MAIN LOOP */
function animate() {
  requestAnimationFrame(animate);
  const rawDt = Math.min(0.05, clock.getDelta());
  if (hitStopT > 0) { hitStopT -= rawDt; timeScale = 0.1; }
  else timeScale = lerp(timeScale, 1, rawDt * 12);
  const dt = rawDt * timeScale;
  if (shakeT > 0) { shakeT -= rawDt; if (shakeT <= 0) shakeAmp = 0; }
  updateDmgNumbers(rawDt);
  if (gameState === 'playing') {
    if (net.mode === 'client') {
      sendClientInput();
      const bx = Math.cos(player2.bobT)*player2.bobAmp;
      const by = Math.abs(Math.sin(player2.bobT))*player2.bobAmp;
      camera.position.set(player2.pos.x + bx*0.5, player2.pos.y + by - player2.kick*0.25, player2.pos.z);
      camera.rotation.set(player2.pitch + player2.recoil*0.012, player2.yaw, 0, 'YXZ');
      updateParticles(dt);
      updateBeams(dt);
      updateUltWaves(dt);
      updateGrenades(dt);
      updateSoulOrbs(dt);
      updateWorld(dt);
      updateCompanionBubble();
      updateHUD();
      updateUltHUD();
      updateCombo(dt);
      updateStreak(dt);
      updateWeaponViewModel(dt);
      renderer.render(scene, camera);
      return;
    }
    updatePlayerEntity(player, camera, {
      forward: keys['KeyW'], back: keys['KeyS'], left: keys['KeyA'], right: keys['KeyD'],
      jump: keys['Space'], sprint: keys['ShiftLeft'] || keys['ShiftRight'],
      shoot: mouseDown
    }, dt);
    if (net.mode === 'host') applyRemoteInput(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updateGrenades(dt);
    updatePickups(dt);
    updatePowerups(dt);
    updatePowerupTimers(dt);
    updateHazards(dt);
    updateWeather(dt);
    updateCompanion(dt);
    updateSoulOrbs(dt);
    updateParticles(dt);
    updateBeams(dt);
    updateUltWaves(dt);
    updateWorld(dt);
    updateWaves(dt);
    updateEnemyBars();
    updateCombo(dt);
    updateStreak(dt);
    if (!animate._hudT || performance.now() - animate._hudT > 120) {
      animate._hudT = performance.now();
      updateHUD();
    }
    if (!animate._mapT || performance.now() - animate._mapT > 180) {
      animate._mapT = performance.now();
      drawMinimap();
    }
    if (!animate._stelaT || performance.now() - animate._stelaT > 150) {
      animate._stelaT = performance.now();
      updateStelae();
    }
    if (net.mode === 'host' && net.connected) {
      net.hostTickT -= dt;
      if (net.hostTickT <= 0) {
        net.hostTickT = net.TICK;
        sendToPeer(serializeState());
      }
    }
    player.avatar.visible = false;
    updateWeaponViewModel(dt);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
    renderer.render(scene, camera);
    player.avatar.visible = true;
  } else {
    updateParticles(dt*0.3);
    updateWorld(dt*0.3);
    updateUltWaves(dt*0.3);
    updateSoulOrbs(dt*0.3);
    updateCompanionBubble();
    updateWeaponViewModel(dt*0.3);
    renderer.render(scene, camera);
  }
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* INIT */
(function checkInvite() {
  try {
    const params = new URLSearchParams(location.search);
    const join = params.get('join');
    if (join) {
      $('introScreen').classList.add('hidden');
      $('modeScreen').classList.add('hidden');
      $('netScreen').classList.remove('hidden');
      $('netChoice').classList.add('hidden');
      $('hostPanel').classList.add('hidden');
      $('joinPanel').classList.remove('hidden');
      $('codeInput').value = join;
      setConnState(2, 'info', 'ТЕБЯ ПРИГЛАСИЛИ К «' + join + '»', 'Нажми ПРИСОЕДИНИТЬСЯ');
    }
  } catch(e) {}
})();
updateHUD();
updateUltHUD();
applyLevel(0);
camera.position.copy(player.pos);
camera.rotation.set(0, player.yaw, 0, 'YXZ');
animate();
console.log('%c⚔ WRATH OF OLYMPUS v19 — Xanthippe auto-rig', 'color:#ffd27a;font-size:16px;font-weight:bold');
