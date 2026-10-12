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
  green: '目前選擇綠幕。純綠分數高；非綠主體通常分數低。分數可用來估算邊緣混入多少幕色。',
  magenta: '目前選擇洋紅幕。紅、藍必須同時佔優；少一個通道都不算純洋紅。紅色主體可能和幕色重疊。',
  blue: '目前選擇藍幕。藍通道必須高過紅、綠；不能沿用綠幕或洋紅幕的固定公式。',
  custom: '目前是自訂幕色。演算法依幕色的高通道組合計分；黑、白、灰缺少色度差，無法安全用色鍵分離。'
};

let currentSample = 'hair';
let sourceIsUpload = false;
let pendingFrame = 0;
let sampleLoadSequence = 0;

const sampleDefinitions = {
  hair: {
    image: 'assets/examples/green-dark-hair-v2.webp',
    key: '#00ff00',
    keyFromCorners: true,
    caption: '綠幕・深色髮絲',
    insight: '深色長髮和細髮絲落在綠幕前，適合比較邊緣 alpha 與去色汙。'
  },
  collision: {
    image: 'assets/examples/green-collision-brooch.webp',
    key: '#00ff00',
    keyFromCorners: true,
    caption: '綠幕・撞色配件',
    insight: '胸前亮綠胸針和幕色相同；色鍵可能挖掉胸針，連通區域法則有機會保住封閉細節。'
  },
  blue: {
    image: 'assets/examples/blue-screen-warm-portrait.webp',
    key: '#0000ff',
    keyFromCorners: true,
    caption: '藍幕・暖色衣著與深色頭髮',
    insight: '藍幕主要看 B 通道是否高過 R、G；暖色衣著和深髮提供對照，若主體含藍色也可能一起被去掉。'
  },
  cyan: {
    image: 'assets/examples/cyan-screen-burgundy-portrait.webp',
    key: '#00ffff',
    keyFromCorners: true,
    caption: '青幕・酒紅衣著',
    insight: '青幕同時看 G、B 是否高過 R；這是自訂幕色的例子，青綠或藍綠主體也可能和背景混在一起。'
  },
  yellow: {
    image: 'assets/examples/yellow-screen-navy-portrait.webp',
    key: '#ffff00',
    keyFromCorners: true,
    caption: '黃幕・深色服裝',
    insight: '黃幕同時看 R、G 是否高過 B；這是自訂幕色的例子，暖色膚色或黃色物件可能被誤當成背景。'
  },
  busy: {
    image: 'assets/examples/park-portrait.webp',
    key: '#00ff00',
    caption: '照片・複雜背景',
    insight: '這張自然照片不適合 chroma key（色鍵）去背，因為背景沒有單一、均勻的幕色。這個範例刻意展示色鍵在複雜背景下的限制：背景會殘留，與幕色相近的樹葉或衣物也可能被誤刪。'
  },
  pose1: {
    image: 'assets/examples/byog-ref-B2-1.png',
    key: '#ff00ff',
    caption: '洋紅幕・站姿與長髮（B2-1）',
    insight: '長髮與花飾在洋紅背景前，適合觀察細線條、髮絲和半透明邊緣。'
  }
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

function drawSample(kind, keyHex, deriveSampleKey) {
  const sample = sampleDefinitions[kind];
  if (!sample) return;

  const sequence = ++sampleLoadSequence;
  sourceIsUpload = false;
  currentSample = kind;
  const image = new Image();
  image.onload = function () {
    if (sequence !== sampleLoadSequence) return;
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    setCanvasDimensions(width, height);
    const output = sourceCanvas.getContext('2d', { willReadFrequently: true });
    output.clearRect(0, 0, width, height);
    output.drawImage(image, 0, 0, width, height);
    sampleCaption.textContent = sample.caption;
    const activeKey = deriveSampleKey && sample.keyFromCorners
      ? setKeySelection(readCornerKey())
      : keyHex;
    updateKeyFormula(activeKey);
    document.querySelectorAll('.sample-button').forEach(function (button) {
      const selected = button.dataset.sample === kind;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    scheduleProcess();
  };
  image.onerror = function () {
    if (sequence !== sampleLoadSequence) return;
    liveInsight.textContent = '範例圖片無法載入，請重新整理頁面或改載入自己的圖片。';
  };
  image.src = sample.image;
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
  const sample = sampleDefinitions[currentSample];
  const keyName = {
    green: '綠幕', magenta: '洋紅幕', blue: '藍幕', custom: '自訂幕色'
  }[classifyKey(keyInput.value)];
  const methodNotes = {
    distance: '色差法按 RGB 距離清除接近' + keyName + '的像素；調高容差，觀察背景殘色和主體細節的取捨。',
    dominance: '通道優勢法以' + keyName + '的通道分數估 alpha；主體本身含有幕色時也可能被一起清除。',
    connected: '邊界連通法只清除連到畫面邊界的' + keyName + '區域；封閉在主體裡的同色細節可能留下。'
  };
  let text = (sample ? sample.insight : '') + ' ' + methodNotes[mode];
  if (spillOn && mode !== 'connected') {
    text += '邊緣修色已開啟。';
  } else if (!spillOn && mode !== 'connected') {
    text += '邊緣修色目前關閉。';
  }
  liveInsight.textContent = text;
}

function setKeySelection(hex) {
  const normalized = hex.toLowerCase();
  const category = classifyKey(normalized);
  keyInput.value = normalized;
  document.querySelectorAll('.color-swatch').forEach(function (button) {
    const sameColor = button.dataset.key.toLowerCase() === normalized;
    const sameCategory = category !== 'custom' && classifyKey(button.dataset.key) === category;
    button.classList.toggle('is-selected', sameColor || sameCategory);
  });
  updateKeyFormula(normalized);
  return normalized;
}

function selectKey(hex) {
  const normalized = setKeySelection(hex);
  if (!sourceIsUpload) {
    drawSample(currentSample, normalized);
    return;
  }
  scheduleProcess();
}

function classifyKey(hex) {
  const rgb = hexToRgb(hex.toLowerCase());
  const red = rgb[0];
  const green = rgb[1];
  const blue = rgb[2];
  if (green > Math.max(red, blue) * 1.25) return 'green';
  if (red > green * 1.25 && blue > green * 1.25) return 'magenta';
  if (blue > Math.max(red, green) * 1.25) return 'blue';
  return 'custom';
}

function updateKeyFormula(hex) {
  const formula = classifyKey(hex);
  document.querySelectorAll('.formula-tile').forEach(function (tile) {
    tile.classList.toggle('is-current', tile.dataset.formula === formula);
  });
  document.getElementById('formula-note').textContent = formulaNotes[formula];
}

function readCornerKey() {
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
  return rgbToHex(medians);
}

function sampleCorners() {
  selectKey(readCornerKey());
  document.getElementById('tolerance-help').textContent = '已取四角中位色。若四角是主體、陰影或不同背景，請手動指定幕色。';
}

function loadImage(file) {
  if (!file) return;
  const sequence = ++sampleLoadSequence;
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = function () {
    if (sequence !== sampleLoadSequence) { URL.revokeObjectURL(url); return; }
    const scale = Math.min(1, 900 / image.width, 700 / image.height);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    setCanvasDimensions(width, height);
    const context = sourceCanvas.getContext('2d', { willReadFrequently: true });
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    sourceIsUpload = true;
    sampleCaption.textContent = file.name + '（縮放預覽）';
    document.querySelectorAll('.sample-button').forEach(function (button) {
      button.classList.remove('is-active');
      button.setAttribute('aria-pressed', 'false');
    });
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
    const sample = sampleDefinitions[button.dataset.sample];
    if (!sample) return;
    const key = setKeySelection(sample.key || keyInput.value);
    drawSample(button.dataset.sample, key, true);
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

drawSample('hair', keyInput.value, true);
