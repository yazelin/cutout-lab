'use strict';

const sourceCanvas = document.getElementById('source-canvas');
const matteCanvas = document.getElementById('matte-canvas');
const resultCanvas = document.getElementById('result-canvas');
const methodSelect = document.getElementById('method');
const keyInput = document.getElementById('key-color');
const toleranceInput = document.getElementById('tolerance');
const toleranceValue = document.getElementById('tolerance-value');
const previewSelect = document.getElementById('preview-bg');
const resultFrame = document.getElementById('result-frame');
const uploadInput = document.getElementById('image-upload');
const sampleCaption = document.getElementById('source-caption');
const methodSummary = document.getElementById('method-summary');
const liveInsight = document.getElementById('live-insight');
const imageSize = { width: 560, height: 360 };
const formulaNotes = {
  '#00ff00': '目前選擇綠幕。純綠分數高；非綠主體通常分數低。分數可用來估算邊緣混入多少幕色。',
  '#ff00ff': '目前選擇洋紅幕。紅、藍必須同時佔優；少一個通道都不算純洋紅。紅色主體可能和幕色重疊。',
  '#0000ff': '目前選擇藍幕。藍通道必須高過紅、綠；不能沿用綠幕或洋紅幕的固定公式。',
  custom: '目前是自訂幕色。演算法依幕色的高通道組合計分；黑、白、灰缺少色度差，無法安全用色鍵分離。'
};

let currentSample = 'hair';
let sourceIsUpload = false;
let pendingFrame = 0;

const sampleNames = {
  hair: '綠幕・深色髮絲',
  collision: '綠幕・撞色配件',
  busy: '照片・複雜背景'
};

function hexToRgb(hex) {
  const cleaned = hex.replace('#', '');
  return [
    parseInt(cleaned.slice(0, 2), 16),
    parseInt(cleaned.slice(2, 4), 16),
    parseInt(cleaned.slice(4, 6), 16)
  ];
}

function rgbToHex(rgb) {
  return '#' + rgb.map(function (v) {
    return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  }).join('');
}

function setCanvasDimensions(width, height) {
  imageSize.width = width;
  imageSize.height = height;
  [sourceCanvas, matteCanvas, resultCanvas].forEach(function (canvas) {
    canvas.width = width;
    canvas.height = height;
    canvas.closest('.canvas-frame').style.aspectRatio = width + ' / ' + height;
  });
}

function drawSample(kind, keyHex) {
  sourceIsUpload = false;
  currentSample = kind;
  const width = 560;
  const height = 360;
  setCanvasDimensions(width, height);

  const detailCanvas = document.createElement('canvas');
  detailCanvas.width = width * 2;
  detailCanvas.height = height * 2;
  const ctx = detailCanvas.getContext('2d');
  ctx.scale(2, 2);

  if (kind === 'busy') {
    const sky = ctx.createLinearGradient(0, 0, 560, 360);
    sky.addColorStop(0, '#d8dfd7');
    sky.addColorStop(.48, '#a3b7a4');
    sky.addColorStop(1, '#667d73');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 560, 360);
    ctx.fillStyle = 'rgba(252, 228, 168, .65)';
    [[62, 70, 36], [464, 57, 54], [404, 213, 43], [93, 275, 62], [520, 315, 39]].forEach(function (dot) {
      ctx.beginPath(); ctx.arc(dot[0], dot[1], dot[2], 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = 'rgba(37, 67, 52, .35)';
    ctx.beginPath(); ctx.moveTo(0, 250); ctx.quadraticCurveTo(130, 180, 235, 250); ctx.lineTo(270, 360); ctx.lineTo(0, 360); ctx.fill();
    ctx.beginPath(); ctx.moveTo(410, 208); ctx.quadraticCurveTo(500, 160, 560, 229); ctx.lineTo(560, 360); ctx.lineTo(410, 360); ctx.fill();
  } else {
    ctx.fillStyle = keyHex;
    ctx.fillRect(0, 0, 560, 360);
  }

  drawPortrait(ctx, kind === 'collision', keyHex);

  const output = sourceCanvas.getContext('2d', { willReadFrequently: true });
  output.clearRect(0, 0, width, height);
  output.imageSmoothingEnabled = true;
  output.drawImage(detailCanvas, 0, 0, width, height);
  sampleCaption.textContent = sampleNames[kind];
  updateKeyFormula(keyHex);
  document.querySelectorAll('.sample-button').forEach(function (button) {
    button.classList.toggle('is-active', button.dataset.sample === kind);
  });
  scheduleProcess();
}

function drawPortrait(ctx, hasCollision, keyHex) {
  ctx.save();
  ctx.fillStyle = 'rgba(28, 42, 39, .12)';
  ctx.beginPath(); ctx.ellipse(280, 350, 150, 25, 0, 0, Math.PI * 2); ctx.fill();

  // 肩膀與衣服
  ctx.fillStyle = '#789487';
  ctx.beginPath();
  ctx.moveTo(155, 360); ctx.quadraticCurveTo(169, 284, 222, 267);
  ctx.lineTo(252, 253); ctx.lineTo(315, 253); ctx.lineTo(345, 267);
  ctx.quadraticCurveTo(403, 286, 418, 360); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f0d7b6';
  ctx.beginPath(); ctx.moveTo(241, 257); ctx.lineTo(320, 257); ctx.lineTo(306, 312); ctx.quadraticCurveTo(280, 328, 254, 310); ctx.closePath(); ctx.fill();

  // 背髮、耳朵與臉
  ctx.fillStyle = '#28272d';
  ctx.beginPath();
  ctx.moveTo(189, 163); ctx.quadraticCurveTo(178, 46, 271, 39);
  ctx.quadraticCurveTo(375, 27, 375, 156); ctx.lineTo(364, 252);
  ctx.quadraticCurveTo(348, 304, 327, 284); ctx.lineTo(315, 194);
  ctx.lineTo(225, 206); ctx.lineTo(218, 286); ctx.quadraticCurveTo(190, 279, 184, 235); ctx.closePath(); ctx.fill();

  ctx.fillStyle = '#cf8d70';
  ctx.beginPath(); ctx.ellipse(202, 178, 18, 27, -.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(352, 178, 18, 27, .1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8ad88';
  ctx.beginPath(); ctx.ellipse(278, 164, 75, 96, 0, 0, Math.PI * 2); ctx.fill();

  // 瀏海與側邊碎髮
  ctx.fillStyle = '#28272d';
  ctx.beginPath();
  ctx.moveTo(205, 150); ctx.quadraticCurveTo(187, 47, 278, 42);
  ctx.quadraticCurveTo(368, 38, 358, 144);
  ctx.quadraticCurveTo(326, 128, 308, 97);
  ctx.quadraticCurveTo(288, 135, 267, 144);
  ctx.quadraticCurveTo(250, 122, 239, 99);
  ctx.quadraticCurveTo(226, 137, 205, 150); ctx.fill();
  ctx.beginPath(); ctx.moveTo(197, 137); ctx.quadraticCurveTo(183, 209, 205, 266); ctx.lineTo(222, 253); ctx.lineTo(220, 150); ctx.fill();
  ctx.beginPath(); ctx.moveTo(348, 139); ctx.quadraticCurveTo(373, 203, 349, 273); ctx.lineTo(331, 257); ctx.lineTo(335, 155); ctx.fill();

  // 面部細節
  ctx.strokeStyle = '#713f3e'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(245, 177); ctx.quadraticCurveTo(254, 171, 262, 177); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(297, 177); ctx.quadraticCurveTo(306, 171, 314, 177); ctx.stroke();
  ctx.fillStyle = '#372f36';
  ctx.beginPath(); ctx.ellipse(254, 181, 3.4, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(305, 181, 3.4, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#b76062'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(269, 211); ctx.quadraticCurveTo(280, 219, 292, 210); ctx.stroke();
  ctx.fillStyle = 'rgba(213, 107, 111, .28)';
  ctx.beginPath(); ctx.ellipse(235, 207, 15, 7, -.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(322, 207, 15, 7, .2, 0, Math.PI * 2); ctx.fill();

  // 深髮上帶幕色的柔邊，模擬攝影或生圖時的色彩溢出
  ctx.save();
  ctx.globalAlpha = .26;
  ctx.strokeStyle = keyHex;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(197, 142); ctx.quadraticCurveTo(177, 210, 204, 268); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(348, 142); ctx.quadraticCurveTo(379, 207, 350, 274); ctx.stroke();
  ctx.restore();

  // 幾根混入背景色的細髮
  ctx.save();
  ctx.strokeStyle = '#27262b'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.globalAlpha = .58;
  [[192, 120, 169, 174], [197, 148, 177, 207], [358, 121, 378, 174], [355, 150, 378, 219], [211, 110, 192, 154]].forEach(function (line, index) {
    ctx.beginPath();
    ctx.moveTo(line[0], line[1]);
    ctx.quadraticCurveTo(line[2] - (index % 2 ? 4 : -4), line[3] - 20, line[2], line[3]);
    ctx.stroke();
  });
  ctx.restore();

  // 領口小飾品。第二個素材讓裝飾和綠幕撞色，示範顏色法會誤刪、連通法可能保留。
  ctx.fillStyle = '#e0c886';
  ctx.beginPath(); ctx.arc(281, 300, 17, 0, Math.PI * 2); ctx.fill();
  if (hasCollision) {
    ctx.fillStyle = '#00ea40';
    ctx.beginPath(); ctx.ellipse(281, 300, 8, 13, .4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#4f6545'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(273, 305); ctx.lineTo(289, 295); ctx.stroke();
  } else {
    ctx.fillStyle = '#d47872';
    ctx.beginPath(); ctx.arc(281, 300, 7, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function scheduleProcess() {
  if (pendingFrame) cancelAnimationFrame(pendingFrame);
  pendingFrame = requestAnimationFrame(function () {
    pendingFrame = 0;
    processImage();
  });
}

function distanceBetween(r, g, b, key) {
  const dr = r - key[0];
  const dg = g - key[1];
  const db = b - key[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function smoothstep(edge0, edge1, value) {
  if (edge1 <= edge0) return value <= edge0 ? 0 : 1;
  const x = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function getDistanceAlpha(distance, tolerance) {
  const inner = tolerance * 1.25;
  const feather = Math.max(11, tolerance * .85);
  return Math.round(smoothstep(inner, inner + feather, distance) * 255);
}

function makeDominanceParameters(key, tolerance) {
  const keyChannels = [];
  const otherChannels = [];
  for (let channel = 0; channel < 3; channel++) {
    if (key[channel] > 128) keyChannels.push(channel);
    else otherChannels.push(channel);
  }
  if (!keyChannels.length || !otherChannels.length) return null;
  let pureKey = 255;
  let pureOther = 0;
  for (let i = 0; i < keyChannels.length; i++) pureKey = Math.min(pureKey, key[keyChannels[i]]);
  for (let i = 0; i < otherChannels.length; i++) pureOther = Math.max(pureOther, key[otherChannels[i]]);
  const pureKeyScore = pureKey - pureOther;
  if (pureKeyScore <= 0) return null;
  return { keyChannels: keyChannels, otherChannels: otherChannels, pureKeyScore: pureKeyScore, clearAt: 1 - tolerance / 400 };
}

function getDominanceAlpha(r, g, b, params) {
  let keyLevel = 255;
  let otherLevel = 0;
  for (let i = 0; i < params.keyChannels.length; i++) {
    const channel = params.keyChannels[i];
    const value = channel === 0 ? r : channel === 1 ? g : b;
    keyLevel = Math.min(keyLevel, value);
  }
  for (let i = 0; i < params.otherChannels.length; i++) {
    const channel = params.otherChannels[i];
    const value = channel === 0 ? r : channel === 1 ? g : b;
    otherLevel = Math.max(otherLevel, value);
  }
  const score = keyLevel - otherLevel;
  if (score <= 0) return 255;
  const ratio = score / params.pureKeyScore;
  if (ratio >= params.clearAt) return 0;
  return Math.round(Math.max(0, Math.min(1, 1 - ratio)) * 255);
}

function processImage() {
  const width = imageSize.width;
  const height = imageSize.height;
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const original = sourceContext.getImageData(0, 0, width, height);
  const rgba = new Uint8ClampedArray(original.data);
  const total = width * height;
  const alpha = new Uint8Array(total);
  const distances = new Float32Array(total);
  const key = hexToRgb(keyInput.value);
  const tolerance = Number(toleranceInput.value);
  const mode = methodSelect.value;
  const feather = Math.max(11, tolerance * .85);
  const dominance = mode === 'dominance' ? makeDominanceParameters(key, tolerance) : null;

  for (let i = 0; i < total; i++) {
    const offset = i * 4;
    const distance = distanceBetween(rgba[offset], rgba[offset + 1], rgba[offset + 2], key);
    distances[i] = distance;
    if (mode === 'dominance') {
      const estimate = dominance
        ? getDominanceAlpha(rgba[offset], rgba[offset + 1], rgba[offset + 2], dominance)
        : null;
      alpha[i] = estimate === null ? getDistanceAlpha(distance, tolerance) : estimate;
    } else {
      alpha[i] = getDistanceAlpha(distance, tolerance);
    }
  }

  if (mode === 'connected') {
    const candidates = new Uint8Array(total);
    const border = tolerance * 1.25 + feather;
    for (let i = 0; i < total; i++) candidates[i] = distances[i] <= border ? 1 : 0;
    const connected = findBoundaryConnected(candidates, width, height);
    for (let i = 0; i < total; i++) {
      if (!connected[i]) alpha[i] = 255;
    }
  }

  if (document.getElementById('erode').checked) erodeAlpha(alpha, width, height);
  if (document.getElementById('despill').checked) removeSpill(rgba, alpha, key);

  for (let i = 0; i < total; i++) rgba[i * 4 + 3] = alpha[i];
  makeMatteCanvas(alpha, width, height);
  renderComposite(rgba, width, height);
  updateMethodCopy();
  updateCounts(alpha);
  updateInsight();
}

function findBoundaryConnected(candidates, width, height) {
  const total = width * height;
  const connected = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  function add(index) {
    if (candidates[index] && !connected[index]) {
      connected[index] = 1;
      queue[tail++] = index;
    }
  }
  for (let x = 0; x < width; x++) {
    add(x);
    add((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    add(y * width);
    add(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = (index / width) | 0;
    if (x > 0) add(index - 1);
    if (x + 1 < width) add(index + 1);
    if (y > 0) add(index - width);
    if (y + 1 < height) add(index + width);
  }
  return connected;
}

function erodeAlpha(alpha, width, height) {
  const total = width * height;
  let mask = new Uint8Array(total);
  for (let i = 0; i < total; i++) mask[i] = alpha[i] > 100 ? 1 : 0;
  const next = new Uint8Array(total);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      if (!mask[index]) continue;
      let keep = true;
      for (let dy = -1; dy <= 1 && keep; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!mask[index + dy * width + dx]) { keep = false; break; }
        }
      }
      next[index] = keep ? 1 : 0;
    }
  }
  for (let i = 0; i < total; i++) {
    if (!next[i]) alpha[i] = 0;
  }
}

function removeSpill(rgba, alpha, key) {
  const total = alpha.length;
  for (let i = 0; i < total; i++) {
    const a = alpha[i] / 255;
    if (a <= .14 || a >= .98) continue;
    const offset = i * 4;
    const backgroundPart = 1 - a;
    rgba[offset] = clampByte((rgba[offset] - backgroundPart * key[0]) / a);
    rgba[offset + 1] = clampByte((rgba[offset + 1] - backgroundPart * key[1]) / a);
    rgba[offset + 2] = clampByte((rgba[offset + 2] - backgroundPart * key[2]) / a);
  }
}

function makeMatteCanvas(alpha, width, height) {
  const context = matteCanvas.getContext('2d');
  const image = context.createImageData(width, height);
  for (let i = 0; i < alpha.length; i++) {
    const offset = i * 4;
    const value = alpha[i];
    image.data[offset] = value;
    image.data[offset + 1] = value;
    image.data[offset + 2] = value;
    image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function renderComposite(rgba, width, height) {
  const context = resultCanvas.getContext('2d');
  const background = previewSelect.value;
  if (background === 'checker') {
    resultFrame.classList.add('checker-bg');
    context.clearRect(0, 0, width, height);
  } else {
    resultFrame.classList.remove('checker-bg');
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
  }
  const layer = document.createElement('canvas');
  layer.width = width;
  layer.height = height;
  layer.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0);
  context.drawImage(layer, 0, 0);
}

function updateCounts(alpha) {
  let transparent = 0;
  let partial = 0;
  let opaque = 0;
  for (let i = 0; i < alpha.length; i++) {
    if (alpha[i] < 10) transparent++;
    else if (alpha[i] > 245) opaque++;
    else partial++;
  }
  const total = alpha.length || 1;
  const t = transparent / total * 100;
  const p = partial / total * 100;
  const o = opaque / total * 100;
  document.getElementById('meter-transparent').style.width = t + '%';
  document.getElementById('meter-partial').style.width = p + '%';
  document.getElementById('meter-opaque').style.width = o + '%';
  document.getElementById('count-transparent').textContent = t.toFixed(1) + '%';
  document.getElementById('count-partial').textContent = p.toFixed(1) + '%';
  document.getElementById('count-opaque').textContent = o.toFixed(1) + '%';
}

function updateMethodCopy() {
  const mode = methodSelect.value;
  const copy = {
    distance: '量每個像素離幕色多遠，越接近就越透明。',
    dominance: '估算像素有多少比例被幕色覆蓋，讓半透明的細髮保留漸層。',
    connected: '只清除連到畫面邊界的幕色；封閉在主體內的同色細節可能留下。'
  };
  methodSummary.textContent = copy[mode];
  const currentTolerance = toleranceInput.value;
  toleranceValue.textContent = currentTolerance;
  document.getElementById('tolerance-help').textContent = mode === 'dominance'
    ? '調高會把更多像幕色的像素直接清空；alpha 仍用通道優勢估算。'
    : '調高會清掉更多接近幕色的像素，也可能吃掉撞色細節。';
}

function updateInsight() {
  const mode = methodSelect.value;
  const spillOn = document.getElementById('despill').checked;
  let text = '';
  if (currentSample === 'busy') {
    text = '這張背景有漸層和紋理。色鍵只認顏色，可能把背景留下或挖掉相近色；這種素材通常改用主體分割或 AI 遮罩，再人工檢查髮絲。';
  } else if (currentSample === 'collision' && mode !== 'connected') {
    text = '領口的綠色飾品和幕色接近，所以顏色算法可能把它一起清掉。切換邊界連通法，比較「顏色相同」和「背景相連」的差別。';
  } else if (currentSample === 'collision') {
    text = '封閉在衣服上的綠色飾品現在能留下來。若輪廓有缺口，外部幕色可能穿過缺口連進去，仍要放大檢查。';
  } else if (mode === 'distance') {
    text = spillOn
      ? '色差門檻會把綠幕和主體的混色轉成半透明。邊緣修色已開啟；試著提高容差，觀察細髮與輪廓怎麼改變。'
      : '已關閉邊緣修色。把結果疊在洋紅或深色底上，注意半透明輪廓是否還帶著綠色。';
  } else if (mode === 'dominance') {
    text = '通道優勢估算每個邊緣像素的幕色比例。半透明細髮有機會留下；幕色和主體撞色時，比例估算仍可能誤判。';
  } else {
    text = '演算法只從畫面外框追蹤幕色。它能保住封閉的同色區域，但也更依賴完整輪廓與乾淨的取樣容差。';
  }
  liveInsight.textContent = text;
}

function selectKey(hex) {
  const normalized = hex.toLowerCase();
  keyInput.value = normalized;
  document.querySelectorAll('.color-swatch').forEach(function (button) {
    button.classList.toggle('is-selected', button.dataset.key.toLowerCase() === normalized);
  });
  updateKeyFormula(normalized);
  if (!sourceIsUpload) {
    drawSample(currentSample, normalized);
    return;
  }
  scheduleProcess();
}

function updateKeyFormula(hex) {
  const normalized = hex.toLowerCase();
  const formula = normalized === '#00ff00' ? 'green' :
    normalized === '#ff00ff' ? 'magenta' :
      normalized === '#0000ff' ? 'blue' : '';
  document.querySelectorAll('.formula-tile').forEach(function (tile) {
    tile.classList.toggle('is-current', tile.dataset.formula === formula);
  });
  document.getElementById('formula-note').textContent = formulaNotes[normalized] || formulaNotes.custom;
}

function sampleCorners() {
  const width = imageSize.width;
  const height = imageSize.height;
  const data = sourceCanvas.getContext('2d').getImageData(0, 0, width, height).data;
  const size = Math.max(2, Math.min(12, Math.floor(Math.min(width, height) / 8)));
  const values = [[], [], []];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      [[x, y], [width - 1 - x, y], [x, height - 1 - y], [width - 1 - x, height - 1 - y]].forEach(function (point) {
        const offset = (point[1] * width + point[0]) * 4;
        for (let channel = 0; channel < 3; channel++) values[channel].push(data[offset + channel]);
      });
    }
  }
  const medians = values.map(function (channel) {
    channel.sort(function (a, b) { return a - b; });
    return channel[Math.floor(channel.length / 2)];
  });
  selectKey(rgbToHex(medians));
  document.getElementById('tolerance-help').textContent = '已取四角中位色。若四角是主體、陰影或不同背景，請手動指定幕色。';
}

function loadImage(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = function () {
    const scale = Math.min(1, 900 / image.width, 700 / image.height);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    setCanvasDimensions(width, height);
    const context = sourceCanvas.getContext('2d', { willReadFrequently: true });
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    sourceIsUpload = true;
    sampleCaption.textContent = file.name + '（縮放預覽）';
    document.querySelectorAll('.sample-button').forEach(function (button) { button.classList.remove('is-active'); });
    URL.revokeObjectURL(url);
    scheduleProcess();
  };
  image.onerror = function () {
    URL.revokeObjectURL(url);
    liveInsight.textContent = '圖片無法讀取。請選擇 PNG、JPEG 或 WebP 圖片。';
  };
  image.src = url;
}

document.querySelectorAll('.sample-button').forEach(function (button) {
  button.addEventListener('click', function () {
    drawSample(button.dataset.sample, keyInput.value);
  });
});
document.querySelectorAll('.color-swatch').forEach(function (button) {
  button.addEventListener('click', function () { selectKey(button.dataset.key); });
});
keyInput.addEventListener('input', function () { selectKey(keyInput.value); });
methodSelect.addEventListener('change', scheduleProcess);
toleranceInput.addEventListener('input', function () {
  toleranceValue.textContent = toleranceInput.value;
  scheduleProcess();
});
previewSelect.addEventListener('change', scheduleProcess);
document.getElementById('despill').addEventListener('change', scheduleProcess);
document.getElementById('erode').addEventListener('change', scheduleProcess);
document.getElementById('sample-border').addEventListener('click', sampleCorners);
uploadInput.addEventListener('change', function (event) { loadImage(event.target.files[0]); });

drawSample('hair', keyInput.value);
