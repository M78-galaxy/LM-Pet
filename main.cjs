const { app, BrowserWindow, Menu, ipcMain, screen, Tray, nativeImage, dialog } = require("electron");
const fs = require("fs");
const path = require("path");

const settingsPath = path.join(__dirname, "settings.json");

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch {
    return {};
  }
}

function saveSettings(partial) {
  const next = { ...loadSettings(), ...partial };
  fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2));
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
ipcMain.on("clip:fit", (_event, payload) => {
  setClipBounds(payload && payload.w, payload && payload.h);
});
ipcMain.on("clip:idle", () => clearClipBounds());

let tray = null;
let petWin = null;
let settingsWin = null;
let clipLock = false;

function extrasFrom(saved) {
  return Array.isArray(saved.extras) ? saved.extras : [];
}

function stageFrom(saved) {
  const extras = extrasFrom(saved);
  let activeId = saved.activeId || "lumu";
  if (activeId !== "lumu" && !extras.some((item) => item.id === activeId)) {
    activeId = "lumu";
  }
  let petSize = typeof saved.petSize === "number" ? saved.petSize : 140;
  petSize = Math.max(80, Math.min(240, Math.round(petSize)));
  return {
    extras,
    activeId,
    showAll: !!saved.showAll,
    petSize,
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

function clearClipBounds() {
  clipLock = false;
  if (!petWin || petWin.isDestroyed()) return;
  const stage = stageFrom(loadSettings());
  const scale = stage.petSize / 140;
  let width = 420;
  if (stage.showAll) width = 420 + stage.extras.length * 120;
  else if (stage.activeId !== "lumu") width = 320;
  width = Math.round(width * scale);
  keepFeetSetBounds(width, Math.round(84 + stage.petSize));
}

function fitPetWindow() {
  if (!petWin || petWin.isDestroyed() || clipLock) return;
  const stage = stageFrom(loadSettings());
  const scale = stage.petSize / 140;
  let width = 420;
  if (stage.showAll) width = 420 + stage.extras.length * 120;
  else if (stage.activeId !== "lumu") width = 320;
  width = Math.round(width * scale);
  const height = Math.round(84 + stage.petSize);
  const [x, y] = petWin.getPosition();
  petWin.setBounds({ x, y, width, height });
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 520,
    height: 420,
    title: "橹穆桌宠 · 设置",
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
  saveSettings({ activeId: id || "lumu", showAll: false });
  notifyStage();
  return { ok: true };
});

ipcMain.handle("stage:setShowAll", (_event, on) => {
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
  extras.push({ id, name, image });
  saveSettings({ extras, activeId: id, showAll: false });
  notifyStage();
  return { ok: true, id };
});

ipcMain.handle("extras:remove", (_event, id) => {
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
  tray.setToolTip("橹穆桌宠");
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
    },
  });
  petWin = win;
  win.loadFile("index.html");
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
    const titles = await win.webContents.executeJavaScript("dialogueTitles()");
    const items = (titles || []).map((t, i) => ({
      label: `对话：${t}`,
      click: () => win.webContents.executeJavaScript(`talk(${i})`),
    }));
    const auto = autoFrom(loadSettings());
    const menu = Menu.buildFromTemplate([
      {
        label: "动作：牵手逛逛",
        click: () => win.webContents.executeJavaScript("playStroll()"),
      },
      { type: "separator" },
      ...items,
      { type: "separator" },
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

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());