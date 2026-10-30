const { app, BrowserWindow, Menu, ipcMain, screen, Tray, nativeImage, dialog, shell, protocol, net } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Readable } = require("stream");
const { pathToFileURL } = require("url");

app.setName("LM-Pet");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "lm-file",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const DEFAULT_CATALOG_URL = "https://raw.githubusercontent.com/M78-galaxy/LM-Pet/main/catalog.json";

function liveSettingsFile() {
  if (app.isPackaged) return path.join(app.getPath("userData"), "settings.json");
  return path.join(__dirname, "settings.json");
}

function readRawSettings() {
  try {
    return JSON.parse(fs.readFileSync(liveSettingsFile(), "utf8"));
  } catch {
    return null;
  }
}

function loadSettings() {
  const saved = readRawSettings();
  if (saved) return saved;
  if (!app.isPackaged) return {};
  const next = blankPackagedSettings(activeCatalog());
  try {
    fs.mkdirSync(path.dirname(liveSettingsFile()), { recursive: true });
    fs.writeFileSync(liveSettingsFile(), JSON.stringify(next, null, 2));
  } catch {
    /* 写不进去时这一轮仍用内存里的名单 */
  }
  return next;
}

function saveSettings(partial) {
  const next = { ...loadSettings(), ...partial };
  const live = liveSettingsFile();
  fs.mkdirSync(path.dirname(live), { recursive: true });
  fs.writeFileSync(live, JSON.stringify(next, null, 2));
}

let catalogCache = null;

function readBundledCatalog() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, "catalog.json"), "utf8"));
    if (!data || !Array.isArray(data.characters)) return { revision: 0, lumu: {}, characters: [] };
    return data;
  } catch {
    return { revision: 0, lumu: {}, characters: [] };
  }
}

function activeCatalog() {
  return catalogCache || readBundledCatalog();
}

function httpsUrl(value) {
  return typeof value === "string" && /^https:\/\//.test(value) ? value : "";
}

function textOr(primary, fallback, last) {
  if (typeof primary === "string" && primary.trim()) return primary.trim();
  if (typeof fallback === "string" && fallback.trim()) return fallback.trim();
  return last;
}

function castFilePath(id, fileName) {
  const safeId = String(id || "");
  const safeName = path.basename(String(fileName || ""));
  if (!/^c\d+$/.test(safeId) || !safeName || safeName !== String(fileName || "")) return null;
  return path.join(app.getPath("userData"), "casts", safeId, safeName);
}

function projectMedia(rel) {
  const clean = String(rel || "").replace(/\\/g, "/");
  if (!clean || clean.includes("..")) return "";
  if (!clean.startsWith("assets/") && !clean.startsWith("custom/")) return "";
  const abs = path.join(__dirname, clean);
  return fs.existsSync(abs) ? clean : "";
}

function characterReady(extra) {
  if (!extra) return false;
  const local = castFilePath(extra.id, extra.file);
  if (local && fs.existsSync(local)) return true;
  if (projectMedia(extra.image)) return true;
  return false;
}

function playableImage(extra) {
  const local = castFilePath(extra.id, extra.file);
  if (local && fs.existsSync(local)) {
    return `lm-file://cast/${extra.id}/${encodeURIComponent(extra.file)}`;
  }
  return projectMedia(extra.image);
}

function stageExtra(extra) {
  const ready = characterReady(extra);
  return {
    ...normalizeExtra(extra),
    file: typeof extra.file === "string" ? path.basename(extra.file) : "",
    url: typeof extra.url === "string" ? extra.url : "",
    catalog: !!extra.catalog,
    ready,
    image: ready ? playableImage(extra) : "",
  };
}

function mergePackagedSettings(saved, catalog) {
  const lumuSrc = (catalog && catalog.lumu) || {};
  const prevCasts = saved.casts || {};
  const prevLumu = prevCasts.lumu || {};
  const characters = Array.isArray(catalog && catalog.characters) ? catalog.characters : [];
  const catalogIds = new Set();
  const oldById = new Map(extrasFrom(saved).map((item) => [item.id, item]));
  const extras = [];
  for (const item of characters) {
    if (!item || !/^c\d+$/.test(String(item.id || ""))) continue;
    catalogIds.add(item.id);
    const old = oldById.get(item.id) || {};
    const file = path.basename(String(item.file || old.file || ""));
    extras.push({
      id: item.id,
      name: textOr(item.name, old.name, "新角色"),
      leftName: typeof item.leftName === "string" ? item.leftName : old.leftName || "",
      rightName: typeof item.rightName === "string" ? item.rightName : old.rightName || "",
      dialogue: typeof item.dialogue === "string" ? item.dialogue : old.dialogue || "",
      actions: Array.isArray(item.actions) ? cleanActions(item.actions) : cleanActions(old.actions),
      image: typeof item.image === "string" ? item.image : old.image || "",
      file,
      url: httpsUrl(item.url) || httpsUrl(old.url),
      catalog: true,
    });
  }
  for (const extra of extrasFrom(saved)) {
    if (!catalogIds.has(extra.id) && extra && !extra.catalog) extras.push(extra);
  }
  const next = {
    ...saved,
    casts: {
      ...prevCasts,
      lumu: {
        name: textOr(lumuSrc.name, prevLumu.name, "天魔练习室采访"),
        leftName: textOr(lumuSrc.leftName, prevLumu.leftName, "老妈妈"),
        rightName: textOr(lumuSrc.rightName, prevLumu.rightName, "老爸爸"),
        dialogue: typeof lumuSrc.dialogue === "string" ? lumuSrc.dialogue : prevLumu.dialogue || "",
        actions: Array.isArray(lumuSrc.actions) ? cleanActions(lumuSrc.actions) : cleanActions(prevLumu.actions),
      },
    },
    extras,
    catalogRevision: Number(catalog && catalog.revision) || 0,
    appVersion: app.getVersion(),
  };
  const remoteUrl = httpsUrl(catalog && catalog.updateUrl);
  if (remoteUrl) next.catalogUrl = remoteUrl;
  const ids = new Set(["lumu", ...extras.map((item) => item.id)]);
  if (typeof next.activeId !== "string" || !ids.has(next.activeId)) next.activeId = "lumu";
  return next;
}

function blankPackagedSettings(catalog) {
  const next = mergePackagedSettings(
    {
      activeId: "lumu",
      showAll: false,
      petSize: 140,
      intervalMin: 8,
      intervalMax: 20,
      autoOn: true,
      fed: { count: 0, bytes: 0 },
    },
    catalog
  );
  delete next.x;
  delete next.y;
  next.showAll = false;
  next.fed = { count: 0, bytes: 0 };
  next.activeId = "lumu";
  return next;
}

async function reconcilePackaged() {
  if (!app.isPackaged) return;
  const live = liveSettingsFile();
  let saved = null;
  let existed = false;
  if (fs.existsSync(live)) {
    existed = true;
    saved = readRawSettings();
    if (!saved) return;
  } else {
    saved = {};
  }
  const bundled = readBundledCatalog();
  let catalog = bundled;
  const url = httpsUrl(saved.catalogUrl) || httpsUrl(bundled.updateUrl) || DEFAULT_CATALOG_URL;
  try {
    const res = await net.fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const remote = await res.json();
      if (remote && Array.isArray(remote.characters)) catalog = remote;
    }
  } catch {
    /* 网络上的名单拿不到时，用安装包里的这份 */
  }
  catalogCache = catalog;
  const next = existed ? mergePackagedSettings(saved, catalog) : blankPackagedSettings(catalog);
  fs.mkdirSync(path.dirname(live), { recursive: true });
  fs.writeFileSync(live, JSON.stringify(next, null, 2));
}

function devLocked() {
  return app.isPackaged ? { error: "安装包里不能改角色和对话。" } : null;
}

const PACES = [
  { label: "频繁（8–20 秒）", intervalMin: 8, intervalMax: 20 },
  { label: "普通（20–60 秒）", intervalMin: 20, intervalMax: 60 },
  { label: "偶尔（1–3 分钟）", intervalMin: 60, intervalMax: 180 },
];

function autoFrom(saved) {
  const autoOn = saved.autoOn !== false;
  let intervalMin = typeof saved.intervalMin === "number" ? saved.intervalMin : 8;
  let intervalMax = typeof saved.intervalMax === "number" ? saved.intervalMax : 20;
  if (intervalMin > intervalMax) {
    const swap = intervalMin;
    intervalMin = intervalMax;
    intervalMax = swap;
  }
  return {
    autoOn,
    intervalMin: Math.max(3, intervalMin),
    intervalMax: Math.max(intervalMin, intervalMax),
  };
}

function applyAuto(win, saved) {
  const { autoOn, intervalMin, intervalMax } = autoFrom(saved);
  return win.webContents.executeJavaScript(
    `setAutoConfig(${autoOn}, ${intervalMin}, ${intervalMax})`
  );
}

let slideAnim = null;

function stopSlide() {
  if (slideAnim) {
    clearInterval(slideAnim);
    slideAnim = null;
  }
}

function slideWindow(win, ms) {
  stopSlide();
  if (!win || win.isDestroyed()) return;
  ms = Math.max(500, Number(ms) || 5700);
  const bounds = win.getBounds();
  const work = screen.getDisplayMatching(bounds).workArea;
  const margin = 20;
  const roomR = work.x + work.width - (bounds.x + bounds.width) - margin;
  const roomL = bounds.x - work.x - margin;
  const span = Math.max(260, Math.round(work.width * 0.36));
  let dx = 0;
  if (roomR >= 160) dx = Math.min(roomR, span);
  else if (roomL >= 160) dx = -Math.min(roomL, span);
  else dx = roomR >= roomL ? Math.round(roomR * 0.7) : -Math.round(roomL * 0.7);
  let dy = Math.round(Math.random() * 64 - 32);
  const toX = Math.round(
    Math.min(
      Math.max(bounds.x + dx, work.x + margin),
      work.x + work.width - bounds.width - margin
    )
  );
  const toY = Math.round(
    Math.min(
      Math.max(bounds.y + dy, work.y + margin),
      work.y + work.height - bounds.height - margin
    )
  );
  dx = toX - bounds.x;
  dy = toY - bounds.y;
  win.webContents.executeJavaScript(`flipClip(${dx < 0})`);
  const t0 = Date.now();
  slideAnim = setInterval(() => {
    if (win.isDestroyed()) {
      stopSlide();
      return;
    }
    const p = Math.min(1, (Date.now() - t0) / ms);
    const e = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
    win.setPosition(Math.round(bounds.x + dx * e), Math.round(bounds.y + dy * e));
    if (p >= 1) stopSlide();
  }, 16);
}

ipcMain.on("walk-slide", (event, payload) => {
  slideWindow(BrowserWindow.fromWebContents(event.sender), payload && payload.ms);
});
ipcMain.on("cancel-slide", () => stopSlide());

ipcMain.on("pet:move-by", (event, payload) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  const dx = Math.round((payload && payload.dx) || 0);
  const dy = Math.round((payload && payload.dy) || 0);
  const bounds = win.getBounds();
  const area = screen.getDisplayMatching(bounds).bounds;
  const box = payload && payload.box;
  const petLeft = box && Number.isFinite(Number(box.left)) ? Number(box.left) : 0;
  const petTop = box && Number.isFinite(Number(box.top)) ? Number(box.top) : 0;
  const petW = box && Number(box.width) > 0 ? Number(box.width) : bounds.width;
  const petH = box && Number(box.height) > 0 ? Number(box.height) : bounds.height;
  let x = bounds.x + dx;
  let y = bounds.y + dy;
  const minX = area.x - petLeft;
  const maxX = area.x + area.width - petLeft - petW;
  const minY = area.y - petTop;
  const maxY = area.y + area.height - petTop - petH;
  if (minX <= maxX) x = Math.max(minX, Math.min(x, maxX));
  if (minY <= maxY) y = Math.max(minY, Math.min(y, maxY));
  win.setPosition(Math.round(x), Math.round(y));
});

ipcMain.handle("pet:feed", async (_event, paths) => {
  const list = Array.isArray(paths) ? paths.map((item) => String(item || "")).filter(Boolean) : [];
  const roots = [path.resolve(__dirname)];
  if (app.isPackaged) {
    roots.push(path.resolve(process.resourcesPath));
    roots.push(path.resolve(process.execPath, "..", "..", ".."));
  }
  const blocked = (abs) => roots.some((root) => abs === root || abs.startsWith(root + path.sep));
  let eaten = 0;
  let bytes = 0;
  const names = [];
  const skipped = [];
  for (const filePath of list) {
    const abs = path.resolve(filePath);
    if (blocked(abs)) {
      skipped.push(path.basename(abs));
      continue;
    }
    try {
      const stat = fs.statSync(abs);
      await shell.trashItem(abs);
      eaten += 1;
      bytes += stat.size || 0;
      names.push(path.basename(abs));
    } catch {
      skipped.push(path.basename(filePath));
    }
  }
  if (eaten) {
    const fed = fedFrom(loadSettings());
    saveSettings({ fed: { count: fed.count + eaten, bytes: fed.bytes + bytes } });
    notifyStage();
  }
  const fed = fedFrom(loadSettings());
  return { eaten, names, skipped, count: fed.count, bytes: fed.bytes };
});

ipcMain.on("pet:pass-through", (_event, on) => {
  setIgnoring(!!on);
});
ipcMain.on("clip:fit", (_event, payload) => {
  setClipBounds(payload && payload.w, payload && payload.h);
});
ipcMain.on("clip:idle", () => clearClipBounds());

let tray = null;
let petWin = null;
let settingsWin = null;
let clipLock = false;
let hitBox = null;
let holdCapture = false;
let ignoring = true;
let osDrag = false;
let dragGraceUntil = 0;
let hungryOn = false;
let dragProc = null;
let dragWatchReady = false;
let ignoreTimer = null;

function setIgnoring(on) {
  if (!petWin || petWin.isDestroyed()) return;
  if (on) {
    if (ignoring || ignoreTimer) return;
    ignoreTimer = setTimeout(() => {
      ignoreTimer = null;
      if (!petWin || petWin.isDestroyed() || holdCapture || dragHot()) return;
      ignoring = true;
      petWin.setIgnoreMouseEvents(true, { forward: true });
    }, 160);
    return;
  }
  if (ignoreTimer) {
    clearTimeout(ignoreTimer);
    ignoreTimer = null;
  }
  if (!ignoring) return;
  ignoring = false;
  petWin.setIgnoreMouseEvents(false);
}

function setHungry(on) {
  if (!petWin || petWin.isDestroyed() || hungryOn === on) return;
  hungryOn = on;
  petWin.webContents.send("pet:hungry", on);
}

function dragHot() {
  return osDrag || Date.now() < dragGraceUntil;
}

function tickHit() {
  if (!petWin || petWin.isDestroyed()) return;
  if (holdCapture) {
    setIgnoring(false);
    return;
  }
  const cursor = screen.getCursorScreenPoint();
  const bounds = petWin.getContentBounds();
  const hot = dragHot();
  const windowPad = hot ? 28 : 0;
  const overWindow =
    cursor.x >= bounds.x - windowPad &&
    cursor.y >= bounds.y - windowPad &&
    cursor.x <= bounds.x + bounds.width + windowPad &&
    cursor.y <= bounds.y + bounds.height + windowPad;
  const pad = dragWatchReady ? 16 : 72;
  let overPet = false;
  if (hitBox && hitBox.width > 0 && hitBox.height > 0) {
    const left = bounds.x + hitBox.left - pad;
    const top = bounds.y + hitBox.top - pad;
    const right = bounds.x + hitBox.left + hitBox.width + pad;
    const bottom = bounds.y + hitBox.top + hitBox.height + pad;
    overPet = cursor.x >= left && cursor.x <= right && cursor.y >= top && cursor.y <= bottom;
  }
  const inside = hot ? overWindow || overPet : overPet;
  setIgnoring(!inside);
  setHungry(osDrag && (overWindow || overPet));
}

ipcMain.on("pet:hit-box", (_event, box) => {
  if (!box || !(Number(box.width) > 0) || !(Number(box.height) > 0)) {
    hitBox = null;
    return;
  }
  hitBox = {
    left: Number(box.left) || 0,
    top: Number(box.top) || 0,
    width: Number(box.width),
    height: Number(box.height),
  };
});

ipcMain.on("pet:hold-capture", (_event, on) => {
  holdCapture = !!on;
  if (holdCapture) setIgnoring(false);
});

const DRAG_SWIFT = `import Cocoa
var dragging = false
func emit(_ line: String) {
  print(line)
  fflush(stdout)
}
NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .leftMouseDragged]) { _ in
  if !dragging {
    dragging = true
    emit("drag")
  }
}
NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseUp]) { _ in
  if dragging {
    dragging = false
    emit("up")
  }
}
emit("ready")
RunLoop.main.run()
`;

function attachDragProc(proc) {
  dragProc = proc;
  proc.on("error", () => {
    if (dragProc === proc) dragProc = null;
  });
  let buf = "";
  proc.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line === "ready") dragWatchReady = true;
      if (line === "drag") osDrag = true;
      if (line === "up") {
        osDrag = false;
        dragGraceUntil = Date.now() + 320;
        setHungry(false);
      }
    }
  });
  proc.on("exit", () => {
    if (dragProc === proc) dragProc = null;
  });
}

function startDragWatch() {
  if (process.platform !== "darwin") return;
  const bin = app.isPackaged
    ? path.join(process.resourcesPath, "bin", "lm-pet-dragwatch")
    : path.join(__dirname, "bin", "lm-pet-dragwatch");
  if (fs.existsSync(bin)) {
    attachDragProc(spawn(bin, [], { stdio: ["ignore", "pipe", "ignore"] }));
    return;
  }
  const src = path.join(os.tmpdir(), "lm-pet-dragwatch.swift");
  const out = path.join(os.tmpdir(), "lm-pet-dragwatch");
  try {
    fs.writeFileSync(src, DRAG_SWIFT);
  } catch {
    return;
  }
  const compile = spawn("swiftc", ["-o", out, src], { stdio: "ignore" });
  compile.on("error", () => {});
  compile.on("exit", (code) => {
    if (code === 0 && fs.existsSync(out)) {
      attachDragProc(spawn(out, [], { stdio: ["ignore", "pipe", "ignore"] }));
    }
  });
}

const LUMU_DIALOGUE = `老妈妈: 你看球吗？
老爸爸: 不看
老妈妈: 好..算了

老妈妈: 你学舞几年了
老爸爸: 二三年吧

老妈妈: 评价一下我今天的ootd，好好评价哦！
老爸爸: 看得出来是一套黑色极简风格，潮流中带着一丝复古
老妈妈: And then

老妈妈: 成都有什么特色美食
老爸爸: 麻辣兔头`;

const LUMU_ACTIONS = [
  {
    id: "stroll",
    name: "牵手逛逛",
    src: "assets/pair-stroll.mp4",
    walk: true,
    key: true,
  },
];

function extrasFrom(saved) {
  return Array.isArray(saved.extras) ? saved.extras : [];
}

function cleanActions(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && typeof item.src === "string" && item.src)
    .map((item) => ({
      id: String(item.id || `a${Date.now()}`),
      name: String(item.name || "动作").slice(0, 24),
      src: item.src,
      walk: !!item.walk,
      key: item.key !== false,
    }));
}

function lumuCast(saved) {
  const over = (saved.casts && saved.casts.lumu) || {};
  return {
    name: typeof over.name === "string" && over.name.trim() ? over.name.trim() : "橹穆",
    leftName: typeof over.leftName === "string" && over.leftName.trim() ? over.leftName.trim() : "老妈妈",
    rightName: typeof over.rightName === "string" && over.rightName.trim() ? over.rightName.trim() : "老爸爸",
    dialogue: typeof over.dialogue === "string" ? over.dialogue : LUMU_DIALOGUE,
    actions: Array.isArray(over.actions) ? cleanActions(over.actions) : LUMU_ACTIONS,
  };
}

function normalizeExtra(extra) {
  return {
    ...extra,
    name: extra.name || "新角色",
    leftName: typeof extra.leftName === "string" ? extra.leftName : "",
    rightName: typeof extra.rightName === "string" ? extra.rightName : "",
    dialogue: typeof extra.dialogue === "string" ? extra.dialogue : "",
    actions: cleanActions(extra.actions),
  };
}

function castDirName(id) {
  if (id === "lumu") return "lumu";
  if (/^c\d+$/.test(String(id || ""))) return String(id);
  return null;
}

function readCast(saved, id) {
  if (id === "lumu") return lumuCast(saved);
  const extra = extrasFrom(saved).find((item) => item.id === id);
  if (!extra) return null;
  return {
    name: extra.name || "新角色",
    leftName: typeof extra.leftName === "string" ? extra.leftName : "",
    rightName: typeof extra.rightName === "string" ? extra.rightName : "",
    dialogue: typeof extra.dialogue === "string" ? extra.dialogue : "",
    actions: cleanActions(extra.actions),
  };
}

function writeCast(id, patch) {
  const saved = loadSettings();
  const current = readCast(saved, id);
  if (!current) return;
  const next = {
    name: patch.name !== undefined ? String(patch.name || "").trim() : current.name,
    leftName: patch.leftName !== undefined ? String(patch.leftName || "").trim() : current.leftName,
    rightName: patch.rightName !== undefined ? String(patch.rightName || "").trim() : current.rightName,
    dialogue: patch.dialogue !== undefined ? patch.dialogue : current.dialogue,
    actions: patch.actions !== undefined ? patch.actions : current.actions,
  };
  if (!next.name) next.name = current.name || (id === "lumu" ? "橹穆" : "新角色");
  if (id === "lumu") {
    const casts = { ...(saved.casts || {}), lumu: next };
    saveSettings({ casts });
  } else {
    const extras = extrasFrom(saved).map((item) =>
      item.id === id
        ? {
            ...item,
            name: next.name,
            leftName: next.leftName,
            rightName: next.rightName,
            dialogue: next.dialogue,
            actions: next.actions,
          }
        : item
    );
    saveSettings({ extras });
  }
  notifyStage();
}

function stageFrom(saved) {
  const extras = extrasFrom(saved).map(stageExtra);
  let activeId = saved.activeId || "lumu";
  if (activeId !== "lumu" && !extras.some((item) => item.id === activeId)) {
    activeId = "lumu";
  }
  let petSize = typeof saved.petSize === "number" ? saved.petSize : 140;
  petSize = Math.max(80, Math.min(240, Math.round(petSize)));
  return {
    extras,
    lumu: lumuCast(saved),
    activeId,
    showAll: !!saved.showAll,
    petSize,
    fed: fedFrom(saved),
    editable: !app.isPackaged,
  };
}

function fedFrom(saved) {
  const fed = saved && saved.fed;
  return {
    count: Math.max(0, Math.round(Number(fed && fed.count) || 0)),
    bytes: Math.max(0, Math.round(Number(fed && fed.bytes) || 0)),
  };
}

function notifyStage() {
  const stage = stageFrom(loadSettings());
  if (petWin && !petWin.isDestroyed()) {
    petWin.webContents.send("stage:updated", stage);
    fitPetWindow();
  }
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send("stage:updated", stage);
  }
}

function keepFeetSetBounds(width, height) {
  if (!petWin || petWin.isDestroyed()) return;
  const bounds = petWin.getBounds();
  const work = screen.getDisplayMatching(bounds).workArea;
  width = Math.min(work.width, Math.max(160, Math.round(width)));
  height = Math.min(work.height, Math.max(120, Math.round(height)));
  let x = Math.round(bounds.x + (bounds.width - width) / 2);
  let y = bounds.y + bounds.height - height;
  if (x < work.x) x = work.x;
  if (x + width > work.x + work.width) x = work.x + work.width - width;
  if (y < work.y) y = work.y;
  if (y + height > work.y + work.height) y = work.y + work.height - height;
  petWin.setBounds({ x, y, width, height });
}

function setClipBounds(w, h) {
  if (!petWin || petWin.isDestroyed()) return;
  clipLock = true;
  keepFeetSetBounds((Number(w) || 240) + 48, (Number(h) || 180) + 36);
}

function idleWindowSize(stage) {
  const scale = stage.petSize / 140;
  let width = 420;
  if (stage.showAll) width = 420 + stage.extras.length * 120;
  else if (stage.activeId !== "lumu") width = 320;
  width = Math.round(width * scale);
  // 108 matches .pets padding-top, so a two-line bubble stays inside the window.
  const height = Math.round(108 + 20 + stage.petSize);
  return { width, height };
}

function clearClipBounds() {
  clipLock = false;
  if (!petWin || petWin.isDestroyed()) return;
  const size = idleWindowSize(stageFrom(loadSettings()));
  keepFeetSetBounds(size.width, size.height);
}

function fitPetWindow() {
  if (!petWin || petWin.isDestroyed() || clipLock) return;
  const size = idleWindowSize(stageFrom(loadSettings()));
  keepFeetSetBounds(size.width, size.height);
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 560,
    height: 760,
    title: "LM-Pet · 设置",
    icon: appIcon(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  settingsWin.loadFile("settings.html");
  settingsWin.on("closed", () => {
    settingsWin = null;
  });
}

ipcMain.handle("stage:get", () => stageFrom(loadSettings()));

ipcMain.handle("stage:setActive", (_event, id) => {
  const nextId = id || "lumu";
  if (nextId !== "lumu") {
    const extra = extrasFrom(loadSettings()).find((item) => item.id === nextId);
    if (!extra || !characterReady(extra)) return { ok: false, error: "先下载这个角色的动画" };
  }
  saveSettings({ activeId: nextId, showAll: false });
  notifyStage();
  return { ok: true };
});

ipcMain.handle("cast:download", async (_event, id) => {
  const extra = extrasFrom(loadSettings()).find((item) => item.id === id);
  if (!extra || !extra.catalog) return { ok: false, error: "这个角色不能下载" };
  const url = String(extra.url || "");
  if (!/^https:\/\//.test(url)) return { ok: false, error: "下载地址还没准备好" };
  const dest = castFilePath(extra.id, extra.file);
  if (!dest) return { ok: false, error: "文件名不对" };
  const tmp = `${dest}.part`;
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const res = await net.fetch(url);
    if (!res.ok) return { ok: false, error: "下载失败" };
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, dest);
  } catch {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* 半截文件留着也没用 */
    }
    return { ok: false, error: "下载失败" };
  }
  notifyStage();
  return { ok: true };
});

ipcMain.handle("stage:setShowAll", (_event, on) => {
  if (app.isPackaged) return { ok: false };
  saveSettings({ showAll: !!on });
  notifyStage();
  return { ok: true };
});

ipcMain.handle("stage:setPetSize", (_event, size) => {
  const petSize = Math.max(80, Math.min(240, Math.round(Number(size) || 140)));
  saveSettings({ petSize });
  notifyStage();
  return { ok: true, petSize };
});

ipcMain.handle("extras:add", async (event, payload) => {
  const locked = devLocked();
  if (locked) return locked;
  const parent = BrowserWindow.fromWebContents(event.sender);
  const picked = await dialog.showOpenDialog(parent || undefined, {
    title: "选择一张待机图",
    properties: ["openFile"],
    filters: [{ name: "图片", extensions: ["png", "webp", "jpg", "jpeg", "gif"] }],
  });
  if (picked.canceled || !picked.filePaths[0]) return { ok: false };
  const src = picked.filePaths[0];
  const id = `c${Date.now()}`;
  const ext = path.extname(src) || ".png";
  const destDir = path.join(__dirname, "custom", id);
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, `idle${ext}`);
  fs.copyFileSync(src, dest);
  const image = path.join("custom", id, `idle${ext}`).replace(/\\/g, "/");
  const name = (payload && payload.name && String(payload.name).trim()) || "新角色";
  const extras = extrasFrom(loadSettings());
  extras.push({ id, name, image, leftName: "", rightName: "", dialogue: "", actions: [] });
  saveSettings({ extras, activeId: id, showAll: false });
  notifyStage();
  return { ok: true, id };
});

ipcMain.handle("extras:remove", (_event, id) => {
  const locked = devLocked();
  if (locked) return locked;
  const saved = loadSettings();
  const extras = extrasFrom(saved).filter((item) => item.id !== id);
  const patch = { extras };
  if (saved.activeId === id) patch.activeId = "lumu";
  saveSettings(patch);
  const dir = path.join(__dirname, "custom", String(id || ""));
  if (id && dir.startsWith(path.join(__dirname, "custom")) && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  notifyStage();
  return { ok: true };
});

ipcMain.handle("cast:setDialogue", (_event, payload) => {
  const locked = devLocked();
  if (locked) return locked;
  const id = payload && payload.id;
  if (!readCast(loadSettings(), id)) return { ok: false };
  writeCast(id, {
    name: payload && payload.name,
    leftName: payload && payload.leftName,
    rightName: payload && payload.rightName,
    dialogue: payload && typeof payload.dialogue === "string" ? payload.dialogue : "",
  });
  return { ok: true };
});

ipcMain.handle("cast:addAction", async (event, payload) => {
  const locked = devLocked();
  if (locked) return locked;
  const id = payload && payload.id;
  const dirName = castDirName(id);
  if (!dirName || !readCast(loadSettings(), id)) return { ok: false, error: "找不到这个角色" };
  const parent = BrowserWindow.fromWebContents(event.sender);
  const picked = await dialog.showOpenDialog(parent || undefined, {
    title: "选择动作视频",
    properties: ["openFile"],
    filters: [{ name: "视频", extensions: ["mp4", "webm", "mov"] }],
  });
  if (picked.canceled || !picked.filePaths[0]) return { ok: false };
  const src = picked.filePaths[0];
  const actionId = `a${Date.now()}`;
  const ext = path.extname(src) || ".mp4";
  const destDir = path.join(__dirname, "custom", dirName);
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, `${actionId}${ext}`);
  fs.copyFileSync(src, dest);
  const rel = path.join("custom", dirName, `${actionId}${ext}`).replace(/\\/g, "/");
  const base = path.basename(src, ext);
  const name = (payload && payload.name && String(payload.name).trim()) || base || "动作";
  const current = readCast(loadSettings(), id);
  writeCast(id, {
    dialogue: current.dialogue,
    actions: current.actions.concat([
      { id: actionId, name: name.slice(0, 24), src: rel, walk: false, key: !/\.webm$/i.test(ext) },
    ]),
  });
  return { ok: true };
});

ipcMain.handle("cast:setActionWalk", (_event, payload) => {
  const locked = devLocked();
  if (locked) return locked;
  const id = payload && payload.id;
  const actionId = payload && payload.actionId;
  const current = readCast(loadSettings(), id);
  if (!current) return { ok: false };
  writeCast(id, {
    dialogue: current.dialogue,
    actions: current.actions.map((item) =>
      item.id === actionId ? { ...item, walk: !!(payload && payload.walk) } : item
    ),
  });
  return { ok: true };
});

ipcMain.handle("cast:removeAction", (_event, payload) => {
  const locked = devLocked();
  if (locked) return locked;
  const id = payload && payload.id;
  const actionId = payload && payload.actionId;
  const current = readCast(loadSettings(), id);
  if (!current) return { ok: false };
  const doomed = current.actions.find((item) => item.id === actionId);
  writeCast(id, {
    dialogue: current.dialogue,
    actions: current.actions.filter((item) => item.id !== actionId),
  });
  if (doomed && doomed.src && !String(doomed.src).startsWith("assets/")) {
    const abs = path.resolve(__dirname, doomed.src);
    const root = path.resolve(__dirname, "custom");
    if (abs.startsWith(root + path.sep) && fs.existsSync(abs)) fs.unlinkSync(abs);
  }
  return { ok: true };
});

function showWin(win) {
  if (!win || win.isDestroyed()) return;
  win.show();
  win.moveTop();
}

// 菜单栏图标看起来有多大：只改这个。0 最小，0.12 接近铺满。
// 改完后必须托盘点「退出」，再 npm start（Ctrl+C 有时退不干净）。
const TRAY_CROP = 0.08;

function trayIcon() {
  const src = nativeImage.createFromPath(path.join(__dirname, "assets", "logo.png"));
  const { width, height } = src.getSize();
  const m = Math.round(Math.min(width, height) * Math.max(0, Math.min(0.2, TRAY_CROP)));
  const cropped =
    m <= 0
      ? src
      : src.crop({ x: m, y: m, width: width - 2 * m, height: height - 2 * m });
  const png = cropped.resize({ width: 44, height: 44, quality: "best" }).toPNG();
  return nativeImage.createFromBuffer(png, { scaleFactor: 2 });
}

function createTray(win) {
  const icon = trayIcon();
  tray = new Tray(icon);
  tray.setToolTip("LM-Pet");
  tray.on("click", () => {
    if (win.isDestroyed()) return;
    if (win.isVisible()) win.hide();
    else showWin(win);
  });
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示", click: () => showWin(win) },
      { label: "隐藏", click: () => !win.isDestroyed() && win.hide() },
      { type: "separator" },
      { label: "设置", click: () => openSettings() },
      { label: "退出", click: () => app.quit() },
    ])
  );
}

function appIcon() {
  return nativeImage.createFromPath(path.join(__dirname, "assets", "logo.png"));
}

function createWindow() {
  const saved = loadSettings();
  const win = new BrowserWindow({
    width: 420,
    height: 260,
    icon: appIcon(),
    x: typeof saved.x === "number" ? saved.x : undefined,
    y: typeof saved.y === "number" ? saved.y : undefined,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });
  petWin = win;
  win.loadFile("index.html");
  win.setIgnoreMouseEvents(true, { forward: true });
  if (process.platform === "darwin" && app.dock) app.dock.hide();
  createTray(win);
  fitPetWindow();

  win.webContents.on("did-finish-load", () => {
    applyAuto(win, loadSettings());
    win.webContents.send("stage:updated", stageFrom(loadSettings()));
  });

  win.on("moved", () => {
    const [x, y] = win.getPosition();
    saveSettings({ x, y });
  });

  win.webContents.on("context-menu", async () => {
    const pack = await win.webContents.executeJavaScript("menuPack()");
    const actionItems = ((pack && pack.actions) || []).map((name, i) => ({
      label: `动作：${name}`,
      click: () => win.webContents.executeJavaScript(`playAction(${i})`),
    }));
    const talkItems = ((pack && pack.dialogues) || []).map((title, i) => ({
      label: `对话：${title}`,
      click: () => win.webContents.executeJavaScript(`talk(${i}, true)`),
    }));
    const auto = autoFrom(loadSettings());
    const template = [];
    if (actionItems.length) template.push(...actionItems);
    if (actionItems.length && talkItems.length) template.push({ type: "separator" });
    if (talkItems.length) template.push(...talkItems);
    if (template.length) template.push({ type: "separator" });
    const menu = Menu.buildFromTemplate([
      ...template,
      {
        label: "自动说话",
        submenu: [
          {
            label: "开启",
            type: "checkbox",
            checked: auto.autoOn,
            click: (item) => {
              saveSettings({ autoOn: item.checked });
              applyAuto(win, loadSettings());
            },
          },
          { type: "separator" },
          ...PACES.map((p) => ({
            label: p.label,
            type: "radio",
            checked:
              auto.intervalMin === p.intervalMin &&
              auto.intervalMax === p.intervalMax,
            click: () => {
              saveSettings({
                intervalMin: p.intervalMin,
                intervalMax: p.intervalMax,
              });
              applyAuto(win, loadSettings());
            },
          })),
        ],
      },
      { type: "separator" },
      {
        label: "停下",
        click: () => win.webContents.executeJavaScript("stopAll()"),
      },
      { label: "隐藏", click: () => win.hide() },
      { label: "退出", click: () => app.quit() },
    ]);
    menu.popup({ window: win });
  });
}

function registerLocalCasts() {
  protocol.handle("lm-file", (request) => {
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return new Response("bad", { status: 400 });
    }
    const parts = decodeURIComponent(url.pathname).split("/").filter(Boolean);
    const file = castFilePath(parts[0], parts[1]);
    if (!file || !fs.existsSync(file)) return new Response("missing", { status: 404 });
    const type = file.endsWith(".webp")
      ? "image/webp"
      : file.endsWith(".png")
        ? "image/png"
        : file.endsWith(".gif")
          ? "image/gif"
          : file.endsWith(".mp4")
            ? "video/mp4"
            : "application/octet-stream";
    return new Response(Readable.toWeb(fs.createReadStream(file)), {
      headers: { "Content-Type": type },
    });
  });
}

app.whenReady().then(async () => {
  registerLocalCasts();
  await reconcilePackaged();
  startDragWatch();
  setInterval(tickHit, 16);
  createWindow();
});
app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
  if (dragProc && !dragProc.killed) dragProc.kill();
});