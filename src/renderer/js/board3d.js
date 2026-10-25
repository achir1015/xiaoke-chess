// 3D 棋盤與棋子（Three.js）
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { typeOf, colorOf, rowOf, colOf, SQ, RED, BLACK, NAMES } from './xiangqi.js';

const S = 1;               // 格距
const BOARD_TOP = 0.2;     // 棋盤表面高度
const PR = 0.45;           // 棋子半徑
const PH = 0.26;           // 棋子厚度
const FONT = '"DFKai-SB","BiauKai","標楷體","Kaiti TC","STKaiti","KaiTi","Microsoft JhengHei",serif';

const HS = 1.24;            // 半盤格距
const HALF_SCALE = 1.2;    // 半盤棋子放大

const RED_INK = '#c8102e';
const BLACK_INK = '#141414';

function makeBoardTexture() {
  const W = 2048, H = 2240;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  // 木紋底
  const grd = g.createLinearGradient(0, 0, W, H);
  grd.addColorStop(0, '#e9c48a'); grd.addColorStop(0.5, '#e2b877'); grd.addColorStop(1, '#d9ab66');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = `rgba(${120 + Math.random() * 40},${70 + Math.random() * 30},${20 + Math.random() * 20},${0.04 + Math.random() * 0.06})`;
    g.lineWidth = 1 + Math.random() * 4;
    g.beginPath();
    const y = Math.random() * H;
    g.moveTo(0, y);
    for (let x = 0; x <= W; x += 64) g.lineTo(x, y + Math.sin(x / (120 + Math.random() * 80)) * 12 + (Math.random() - 0.5) * 4);
    g.stroke();
  }
  // 棋盤線：9 縱 10 橫；格距 u
  const u = 200, ox = (W - 8 * u) / 2, oy = (H - 9 * u) / 2;
  const X = (c) => ox + c * u, Y = (r) => oy + r * u;
  g.strokeStyle = '#3b2412';
  g.lineCap = 'square';
  g.lineWidth = 14;
  g.strokeRect(X(0) - 26, Y(0) - 26, 8 * u + 52, 9 * u + 52);
  g.lineWidth = 6;
  for (let r = 0; r < 10; r++) { g.beginPath(); g.moveTo(X(0), Y(r)); g.lineTo(X(8), Y(r)); g.stroke(); }
  for (let c = 0; c < 9; c++) {
    g.beginPath();
    if (c === 0 || c === 8) { g.moveTo(X(c), Y(0)); g.lineTo(X(c), Y(9)); }
    else { g.moveTo(X(c), Y(0)); g.lineTo(X(c), Y(4)); g.moveTo(X(c), Y(5)); g.lineTo(X(c), Y(9)); }
    g.stroke();
  }
  // 九宮斜線
  for (const [r0, r1] of [[0, 2], [7, 9]]) {
    g.beginPath(); g.moveTo(X(3), Y(r0)); g.lineTo(X(5), Y(r1)); g.moveTo(X(5), Y(r0)); g.lineTo(X(3), Y(r1)); g.stroke();
  }
  // 炮位、兵位記號
  const mark = (r, c) => {
    const d = 18, l = 40;
    g.lineWidth = 5;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      if ((c === 0 && sx < 0) || (c === 8 && sx > 0)) continue;
      g.beginPath();
      g.moveTo(X(c) + sx * d, Y(r) + sy * (d + l)); g.lineTo(X(c) + sx * d, Y(r) + sy * d); g.lineTo(X(c) + sx * (d + l), Y(r) + sy * d);
      g.stroke();
    }
  };
  for (const c of [1, 7]) { mark(2, c); mark(7, c); }
  for (const c of [0, 2, 4, 6, 8]) { mark(3, c); mark(6, c); }
  // 楚河漢界
  g.fillStyle = 'rgba(70,40,15,0.85)';
  g.font = `bold 130px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const ry = (Y(4) + Y(5)) / 2;
  g.fillText('楚　河', X(2), ry);
  g.fillText('漢　界', X(6), ry);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, w: W / u * S, h: H / u * S };
}

// 半盤棋盤：8 行 × 4 列方格，棋子放在格子中央
function makeHalfBoardTexture() {
  const u = 260, cols = 8, rows = 4, pad = 120;
  const W = cols * u + pad * 2, H = rows * u + pad * 2;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, W, H);
  grd.addColorStop(0, '#e9c48a'); grd.addColorStop(0.5, '#e2b877'); grd.addColorStop(1, '#d9ab66');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 220; i++) {
    g.strokeStyle = `rgba(${120 + Math.random() * 40},${70 + Math.random() * 30},${20 + Math.random() * 20},${0.04 + Math.random() * 0.06})`;
    g.lineWidth = 1 + Math.random() * 4;
    g.beginPath();
    const y = Math.random() * H;
    g.moveTo(0, y);
    for (let x = 0; x <= W; x += 64) g.lineTo(x, y + Math.sin(x / (120 + Math.random() * 80)) * 12);
    g.stroke();
  }
  g.strokeStyle = '#3b2412';
  g.lineWidth = 14;
  g.strokeRect(pad - 22, pad - 22, cols * u + 44, rows * u + 44);
  g.lineWidth = 6;
  for (let r = 0; r <= rows; r++) { g.beginPath(); g.moveTo(pad, pad + r * u); g.lineTo(pad + cols * u, pad + r * u); g.stroke(); }
  for (let c = 0; c <= cols; c++) { g.beginPath(); g.moveTo(pad + c * u, pad); g.lineTo(pad + c * u, pad + rows * u); g.stroke(); }
  // 座標（A～D 列、1～8 行）
  g.fillStyle = 'rgba(70,40,15,0.75)';
  g.font = `bold 54px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let c = 0; c < cols; c++) g.fillText(String(c + 1), pad + c * u + u / 2, pad / 2 - 6);
  for (let r = 0; r < rows; r++) g.fillText('ABCD'[r], pad / 2 - 6, pad + r * u + u / 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, w: (W / u) * HS, h: (H / u) * HS };
}

// 暗子背面
let backTex = null;
function pieceBackTexture() {
  if (backTex) return backTex;
  const N = 512;
  const cv = document.createElement('canvas');
  cv.width = N; cv.height = N;
  const g = cv.getContext('2d');
  const rg = g.createRadialGradient(N * 0.42, N * 0.38, N * 0.05, N / 2, N / 2, N / 2);
  rg.addColorStop(0, '#c98d4e'); rg.addColorStop(0.8, '#a8692f'); rg.addColorStop(1, '#8a5222');
  g.fillStyle = rg; g.beginPath(); g.arc(N / 2, N / 2, N / 2, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,225,160,0.75)'; g.lineWidth = 12;
  g.beginPath(); g.arc(N / 2, N / 2, N * 0.4, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 4;
  g.beginPath(); g.arc(N / 2, N / 2, N * 0.33, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(255,225,160,0.85)';
  g.font = `900 ${Math.round(N * 0.3)}px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('小柯', N / 2, N / 2 + 6);
  backTex = new THREE.CanvasTexture(cv);
  backTex.colorSpace = THREE.SRGBColorSpace;
  backTex.anisotropy = 8;
  return backTex;
}

const faceCache = new Map();
function pieceFaceTexture(code) {
  if (faceCache.has(code)) return faceCache.get(code);
  const N = 512;
  const cv = document.createElement('canvas');
  cv.width = N; cv.height = N;
  const g = cv.getContext('2d');
  const red = colorOf(code) === RED;
  const ink = red ? RED_INK : BLACK_INK;
  const rg = g.createRadialGradient(N * 0.42, N * 0.38, N * 0.05, N / 2, N / 2, N / 2);
  rg.addColorStop(0, '#fff8e6'); rg.addColorStop(0.75, '#f6e2b8'); rg.addColorStop(1, '#e5c690');
  g.fillStyle = rg; g.beginPath(); g.arc(N / 2, N / 2, N / 2, 0, Math.PI * 2); g.fill();
  // 內圈
  g.strokeStyle = ink; g.lineWidth = 16;
  g.beginPath(); g.arc(N / 2, N / 2, N * 0.415, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 5;
  g.beginPath(); g.arc(N / 2, N / 2, N * 0.375, 0, Math.PI * 2); g.stroke();
  // 大字
  g.fillStyle = ink;
  g.font = `900 ${Math.round(N * 0.56)}px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const ch = NAMES[colorOf(code)][typeOf(code)];
  g.shadowColor = 'rgba(0,0,0,0.25)'; g.shadowBlur = 6; g.shadowOffsetY = 3;
  g.fillText(ch, N / 2, N / 2 + N * 0.02);
  // 加粗：再描一次邊
  g.shadowColor = 'transparent';
  g.lineWidth = 6; g.strokeStyle = ink; g.strokeText(ch, N / 2, N / 2 + N * 0.02);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  faceCache.set(code, tex);
  return tex;
}

export class Board3D {
  constructor(container, { onSquareClick } = {}) {
    this.container = container;
    this.onSquareClick = onSquareClick || (() => {});
    this.orientation = RED;
    this.pieces = new Map(); // sq → Group
    this.allPieces = new Set(); // 場景中所有棋子（含動畫中被吃的）
    this.pendingMoves = new Set(); // 尚未完成的移動動畫（重設棋盤時要讓它們結束）
    this.interactive = true;
    this.anims = [];
    this.captured = [[], []]; // 被吃掉的棋子 mesh（依顏色）
    this.layout = 'full';

    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    container.appendChild(r.domElement);

    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#20150d');
    scene.fog = new THREE.Fog('#20150d', 30, 60);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 9;
    this.controls.maxDistance = 26;
    this.controls.maxPolarAngle = Math.PI * 0.42;
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.target.set(0, 0, 0.3);

    // 燈光
    scene.add(new THREE.HemisphereLight('#fff4e0', '#3a2a1a', 0.75));
    const key = new THREE.DirectionalLight('#ffe9c8', 2.2);
    key.position.set(-6, 14, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
    key.shadow.bias = -0.0005;
    key.shadow.radius = 4;
    scene.add(key);
    const fill = new THREE.DirectionalLight('#cfe0ff', 0.45);
    fill.position.set(8, 6, -6);
    scene.add(fill);

    this.buildTable();
    this.buildBoard();
    this.buildPieceGeometry();
    this.buildMarkers();

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BOARD_TOP);
    r.domElement.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    r.domElement.addEventListener('pointermove', (e) => this.onPointerMove(e));
    r.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.setView('tilt');
    this.clock = new THREE.Clock();
    r.setAnimationLoop(() => this.frame());
  }

  buildTable() {
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 1024;
    const g = cv.getContext('2d');
    g.fillStyle = '#3a2414'; g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 400; i++) {
      g.strokeStyle = `rgba(${20 + Math.random() * 30},${10 + Math.random() * 15},5,${0.15 + Math.random() * 0.2})`;
      g.lineWidth = 1 + Math.random() * 3;
      const y = Math.random() * 1024;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= 1024; x += 32) g.lineTo(x, y + Math.sin(x / 90 + i) * 6);
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    const table = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }));
    table.rotation.x = -Math.PI / 2;
    table.receiveShadow = true;
    this.scene.add(table);
  }

  X(sq) { return this.layout === 'half' ? ((sq % 8) - 3.5) * HS : (colOf(sq) - 4) * S; }
  Z(sq) { return this.layout === 'half' ? (((sq / 8) | 0) - 1.5) * HS : (rowOf(sq) - 4.5) * S; }
  get pieceScale() { return this.layout === 'half' ? HALF_SCALE : 1; }

  // 切換整盤／半盤
  setLayout(layout) {
    if (layout === this.layout) return;
    this.layout = layout;
    this.boardMesh.visible = layout === 'full';
    this.halfMesh.visible = layout === 'half';
    this.boardW = layout === 'half' ? this.halfW : this.fullW;
    this.boardH = layout === 'half' ? this.halfH : this.fullH;
    for (const m of [this.selMarker, this.lastFrom, this.lastTo, this.checkMarker, this.hintFrom, this.hintTo]) { m.scale.setScalar(this.pieceScale); m.visible = false; }
    this.setTargets([]);
    this.setHint(-1);
    if (layout === 'half') this.setOrientation(RED);
    this.fitDistance();
  }

  buildBoard() {
    const half = makeHalfBoardTexture();
    this.halfW = half.w; this.halfH = half.h;
    const hside = new THREE.MeshStandardMaterial({ color: '#b07a3e', roughness: 0.6 });
    const htop = new THREE.MeshStandardMaterial({ map: half.tex, roughness: 0.55 });
    this.halfMesh = new THREE.Mesh(new THREE.BoxGeometry(half.w, BOARD_TOP, half.h), [hside, hside, htop, hside, hside, hside]);
    this.halfMesh.position.y = BOARD_TOP / 2;
    this.halfMesh.receiveShadow = true;
    this.halfMesh.castShadow = true;
    this.halfMesh.visible = false;
    this.scene.add(this.halfMesh);
    const { tex, w, h } = makeBoardTexture();
    this.fullW = w; this.fullH = h;
    this.boardW = w; this.boardH = h;
    const side = new THREE.MeshStandardMaterial({ color: '#b07a3e', roughness: 0.6 });
    tex.center.set(0.5, 0.5);
    this.boardTex = tex;
    const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.0 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, BOARD_TOP, h), [side, side, top, side, side, side]);
    box.position.y = BOARD_TOP / 2;
    box.receiveShadow = true;
    box.castShadow = true;
    this.scene.add(box);
    this.boardMesh = box;
  }

  buildPieceGeometry() {
    // 側面圓角輪廓（Lathe）
    const pts = [];
    const rr = 0.07;
    pts.push(new THREE.Vector2(0, 0));
    pts.push(new THREE.Vector2(PR - rr, 0));
    for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2); pts.push(new THREE.Vector2(PR - rr + Math.cos(a) * rr, rr + Math.sin(a) * rr)); }
    pts.push(new THREE.Vector2(PR, PH - rr));
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * (Math.PI / 2); pts.push(new THREE.Vector2(PR - rr + Math.cos(a) * rr, PH - rr + Math.sin(a) * rr)); }
    pts.push(new THREE.Vector2(0, PH));
    this.bodyGeo = new THREE.LatheGeometry(pts, 64);
    this.faceGeo = new THREE.CircleGeometry(PR - 0.055, 64);
    this.bodyMat = [
      new THREE.MeshStandardMaterial({ color: '#b3242c', roughness: 0.45 }), // 紅方側邊
      new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.45 }), // 黑方側邊
    ];
    this.faceMat = new Map();
    this.backMat = new THREE.MeshStandardMaterial({ map: pieceBackTexture(), roughness: 0.45 });
    this.hiddenMat = new THREE.MeshStandardMaterial({ color: '#8a5222', roughness: 0.5 }); // 暗子側邊不透露顏色
  }

  faceMaterial(code) {
    if (!this.faceMat.has(code)) this.faceMat.set(code, new THREE.MeshStandardMaterial({ map: pieceFaceTexture(code), roughness: 0.35 }));
    return this.faceMat.get(code);
  }

  makePiece(code, faceUp = true) {
    const grp = new THREE.Group();
    const inner = new THREE.Group(); // 翻面用：繞棋子中心旋轉
    inner.position.y = PH / 2;
    grp.add(inner);
    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat[colorOf(code)]);
    body.position.y = -PH / 2;
    body.castShadow = true; body.receiveShadow = true;
    inner.add(body);
    const face = new THREE.Mesh(this.faceGeo, this.faceMaterial(code));
    face.rotation.x = -Math.PI / 2;
    face.position.y = PH / 2 + 0.001;
    face.rotation.z = this.orientation === RED ? 0 : Math.PI;
    face.receiveShadow = true;
    inner.add(face);
    const back = new THREE.Mesh(this.faceGeo, this.backMat);
    back.rotation.x = Math.PI / 2;
    back.position.y = -PH / 2 - 0.001;
    inner.add(back);
    if (!faceUp) { inner.rotation.x = Math.PI; body.material = this.hiddenMat; }
    grp.scale.setScalar(this.pieceScale);
    grp.userData = { code, face, inner, body, faceUp };
    this.allPieces.add(grp);
    return grp;
  }

  buildMarkers() {
    const mk = (color, opacity, geo) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      this.scene.add(m);
      return m;
    };
    this.selMarker = mk('#ffe066', 0.95, new THREE.RingGeometry(PR + 0.03, PR + 0.11, 48));
    this.lastFrom = mk('#4fc3f7', 0.75, new THREE.RingGeometry(0.2, 0.27, 4, 1, Math.PI / 4));
    this.lastTo = mk('#4fc3f7', 0.85, new THREE.RingGeometry(PR + 0.02, PR + 0.09, 48));
    this.checkMarker = mk('#ff2a2a', 0.9, new THREE.RingGeometry(PR + 0.04, PR + 0.2, 48));
    this.hintFrom = mk('#7CFC00', 0.9, new THREE.RingGeometry(PR + 0.02, PR + 0.12, 48));
    this.hintTo = mk('#7CFC00', 0.9, new THREE.RingGeometry(PR + 0.02, PR + 0.12, 48));
    this.targets = [];
    this.dotGeo = new THREE.CircleGeometry(0.14, 32);
    this.capGeo = new THREE.RingGeometry(PR - 0.02, PR + 0.08, 48);
    this.dotMat = new THREE.MeshBasicMaterial({ color: '#2ecc71', transparent: true, opacity: 0.85, depthWrite: false });
    this.capMat = new THREE.MeshBasicMaterial({ color: '#ff5252', transparent: true, opacity: 0.9, depthWrite: false });
    this.hintArrow = null;
  }

  placeMarker(m, sq, y = BOARD_TOP + 0.004) {
    if (sq == null || sq < 0) { m.visible = false; return; }
    m.position.set(this.X(sq), y, this.Z(sq));
    m.visible = true;
  }

  resize() {
    const w = this.container.clientWidth || 800, h = this.container.clientHeight || 600;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    // 畫面較窄時拉遠，讓整個棋盤都看得到
    this.camera.updateProjectionMatrix();
    this.fitDistance();
  }

  fitDistance() {
    if (!this.viewName) return;
    const dirSign = this.orientation === RED ? 1 : -1;
    // 依視角與畫面比例計算距離，讓整個棋盤（含兩側被吃的棋子）都在畫面內
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const tanH = tanV * this.camera.aspect;
    const half = this.layout === 'half';
    const needW = (half ? this.boardW / 2 + 0.35 : 5.75) / tanH;
    const needH = (half ? (this.viewName === 'top' ? this.boardH / 2 + 0.4 : this.boardH / 2 + 1.1) : (this.viewName === 'top' ? 5.75 : 5.95)) / tanV;
    const dist = Math.max(needW, needH) * (this.viewName === 'low' ? 1.04 : 1);
    const target = new THREE.Vector3(0, 0, this.viewName === 'top' || this.layout === 'half' ? 0 : 0.6 * dirSign);
    let dir;
    if (this.viewName === 'top') dir = new THREE.Vector3(0, 1, 0.0001 * dirSign);
    else if (this.viewName === 'low') dir = new THREE.Vector3(0, 0.62, 0.78 * dirSign);
    else dir = new THREE.Vector3(0, 0.83, 0.56 * dirSign);
    dir.normalize();
    this.camera.position.copy(target).addScaledVector(dir, dist);
    this.controls.target.copy(target);
    this.controls.maxDistance = Math.max(26, dist * 1.4);
    this.camera.lookAt(target);
    this.controls.update();
  }

  setView(name) { this.viewName = name; this.fitDistance(); }

  setOrientation(side) {
    this.orientation = side;
    if (this.boardTex) this.boardTex.rotation = side === RED ? 0 : Math.PI;
    for (const g of this.pieces.values()) g.userData.face.rotation.z = side === RED ? 0 : Math.PI;
    this.layoutCaptured();
    this.fitDistance();
  }

  setPosition(board, up = null) {
    // 移除所有棋子（包含動畫進行中、尚未飛離的被吃棋子）
    for (const g of this.allPieces) this.scene.remove(g);
    this.allPieces.clear();
    this.pieces.clear();
    for (let sq = 0; sq < board.length; sq++) {
      const p = board[sq];
      if (!p) continue;
      const g = this.makePiece(p, !up || !!up[sq]);
      g.position.set(this.X(sq), BOARD_TOP, this.Z(sq));
      this.scene.add(g);
      this.pieces.set(sq, g);
    }
    this.anims = [];
    for (const done of [...this.pendingMoves]) done();
    this.pendingMoves.clear();
  }

  // 被吃的棋子改在玩家卡片顯示，3D 場景不保留
  setCaptured() {}
  layoutCaptured() {}

  animateMove(from, to, { duration = 380 } = {}) {
    return new Promise((res) => {
      const resolve = () => { this.pendingMoves.delete(resolve); res(); };
      this.pendingMoves.add(resolve);
      const g = this.pieces.get(from);
      if (!g) { resolve(); return; }
      const victim = this.pieces.get(to);
      this.pieces.delete(from);
      this.pieces.set(to, g);
      const start = g.position.clone();
      const end = new THREE.Vector3(this.X(to), BOARD_TOP, this.Z(to));
      const dist = start.distanceTo(end);
      const lift = 0.45 + Math.min(0.8, dist * 0.08);
      const t0 = performance.now();
      this.anims.push((now) => {
        const k = Math.min(1, (now - t0) / duration);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        g.position.lerpVectors(start, end, e);
        g.position.y = BOARD_TOP + Math.sin(Math.PI * e) * lift;
        if (k >= 1) {
          g.position.copy(end);
          if (victim) this.flyAway(victim);
          resolve();
          return false;
        }
        return true;
      });
    });
  }

  // 翻開暗子
  flipPiece(sq, { duration = 520 } = {}) {
    return new Promise((res) => {
      const resolve = () => { this.pendingMoves.delete(resolve); res(); };
      this.pendingMoves.add(resolve);
      const g = this.pieces.get(sq);
      if (!g || g.userData.faceUp) { resolve(); return; }
      const { inner, body } = g.userData;
      const t0 = performance.now();
      let swapped = false;
      this.anims.push((now) => {
        const k = Math.min(1, (now - t0) / duration);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        inner.rotation.x = Math.PI * (1 - e);
        g.position.y = BOARD_TOP + Math.sin(Math.PI * k) * 0.9;
        if (!swapped && k > 0.5) { swapped = true; body.material = this.bodyMat[colorOf(g.userData.code)]; }
        if (k >= 1) { inner.rotation.x = 0; g.position.y = BOARD_TOP; g.userData.faceUp = true; resolve(); return false; }
        return true;
      });
    });
  }

  flyAway(g) {
    const start = g.position.clone();
    const out = start.clone().add(new THREE.Vector3(Math.sign(start.x || 1) * 2.5, 2.2, 0));
    const t0 = performance.now();
    const dur = 520;
    this.anims.push((now) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      g.position.lerpVectors(start, out, e);
      g.scale.setScalar(Math.max(0.01, (1 - e) * this.pieceScale));
      g.rotation.x = e * Math.PI;
      if (k >= 1) { this.scene.remove(g); this.allPieces.delete(g); return false; }
      return true;
    });
  }

  setSelected(sq) {
    this.selected = sq;
    this.placeMarker(this.selMarker, sq, BOARD_TOP + 0.006);
    for (const [s, g] of this.pieces) g.position.y = (s === sq) ? BOARD_TOP + 0.18 : BOARD_TOP;
  }

  setTargets(list, board) {
    for (const m of this.targets) this.scene.remove(m);
    this.targets = [];
    for (const sq of list || []) {
      const cap = board && board[sq];
      const m = new THREE.Mesh(cap ? this.capGeo : this.dotGeo, cap ? this.capMat : this.dotMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(this.X(sq), BOARD_TOP + 0.005, this.Z(sq));
      m.scale.setScalar(this.pieceScale);
      this.scene.add(m);
      this.targets.push(m);
    }
  }

  setLastMove(from, to) {
    this.placeMarker(this.lastFrom, from);
    this.placeMarker(this.lastTo, to);
  }

  setCheck(sq) { this.placeMarker(this.checkMarker, sq, BOARD_TOP + 0.007); }

  setHint(from, to) {
    this.placeMarker(this.hintFrom, from, BOARD_TOP + 0.008);
    this.placeMarker(this.hintTo, to, BOARD_TOP + 0.008);
    if (this.hintArrow) { this.scene.remove(this.hintArrow); this.hintArrow = null; }
    if (from == null || from < 0 || from === to) return; // 翻子提示只標格子
    const a = new THREE.Vector3(this.X(from), BOARD_TOP + 0.9, this.Z(from));
    const b = new THREE.Vector3(this.X(to), BOARD_TOP + 0.9, this.Z(to));
    const dir = b.clone().sub(a);
    const len = dir.length();
    this.hintArrow = new THREE.ArrowHelper(dir.normalize(), a, len, 0x39ff14, Math.min(0.6, len * 0.35), 0.35);
    this.scene.add(this.hintArrow);
  }

  setInteractive(on) {
    this.interactive = on;
    this.renderer.domElement.style.cursor = on ? 'default' : 'not-allowed';
  }

  pickSquare(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    // 先找棋子
    const meshes = [];
    for (const [sq, g] of this.pieces) g.traverse((c) => { if (c.isMesh) { c.userData.sq = sq; meshes.push(c); } });
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (hit) return hit.object.userData.sq;
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.boardPlane, p)) return -1;
    if (this.layout === 'half') {
      const hc = Math.round(p.x / HS + 3.5), hr = Math.round(p.z / HS + 1.5);
      if (hc < 0 || hc > 7 || hr < 0 || hr > 3) return -1;
      if (Math.abs(p.x - (hc - 3.5) * HS) > HS / 2 || Math.abs(p.z - (hr - 1.5) * HS) > HS / 2) return -1;
      return hr * 8 + hc;
    }
    const c = Math.round(p.x / S + 4), r = Math.round(p.z / S + 4.5);
    if (c < 0 || c > 8 || r < 0 || r > 9) return -1;
    if (Math.hypot(p.x - (c - 4) * S, p.z - (r - 4.5) * S) > 0.5) return -1;
    return SQ(r, c);
  }

  onPointerDown(e) {
    if (e.button !== 0) return;
    const sq = this.pickSquare(e);
    if (sq >= 0) this.onSquareClick(sq);
  }

  onPointerMove(e) {
    if (!this.interactive) return;
    const sq = this.pickSquare(e);
    this.renderer.domElement.style.cursor = sq >= 0 && (this.pieces.has(sq) || this.targets.length) ? 'pointer' : 'default';
  }

  frame() {
    const now = performance.now();
    // 動畫完成時可能再排入新動畫（例如被吃的棋子飛離），要保留
    const running = this.anims;
    this.anims = [];
    const keep = running.filter((fn) => fn(now) !== false);
    this.anims = keep.concat(this.anims);
    const t = now / 1000;
    if (this.checkMarker.visible) this.checkMarker.material.opacity = 0.55 + 0.4 * Math.sin(t * 7);
    if (this.selMarker.visible) this.selMarker.rotation.z = t;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  snapshot() { return this.renderer.domElement.toDataURL('image/png'); }
}
