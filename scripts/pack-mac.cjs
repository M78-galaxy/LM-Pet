// Mac 发版：安装包进 release/v版本号/，不覆盖上一版。
// 开发用的 settings.json 全程不动。打进安装包的那一份写到 release/.pack/，
// 只在打包过程中替换 package.json 的 files 列表，结束后把 package.json 按原字节写回。
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pkgPath = path.join(root, "package.json");
const settingsPath = path.join(root, "settings.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const version = pkg.version;
const outDir = path.join(root, "release", `v${version}`);
const stageDir = path.join(root, "release", ".pack");
const notesName = "更新说明.md";

const MEDIA_RE = /(?:assets|custom)\/[A-Za-z0-9_./+-]+\.(?:png|webp|jpe?g|gif|mp4|webm|mov)/g;
const UI_FILES = ["index.html", "settings.html", "preload.cjs"];

function addMediaPaths(node, found) {
  if (typeof node === "string") {
    if (node.startsWith("assets/") || node.startsWith("custom/")) found.add(node);
    return;
  }
  if (node && typeof node === "object") {
    for (const value of Object.values(node)) addMediaPaths(value, found);
  }
}

function usedMedia() {
  const found = new Set(["assets/logo.png", "assets/lumu-thumb.png"]);
  for (const file of UI_FILES) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    for (const match of text.match(MEDIA_RE) || []) found.add(match);
  }
  addMediaPaths(JSON.parse(fs.readFileSync(path.join(root, "catalog.json"), "utf8")), found);
  found.delete("assets/pair-stroll.mp4");
  found.delete("assets/pair-stroll-alpha.webm");
  const missing = [];
  const existing = [];
  for (const rel of [...found].sort()) {
    if (fs.existsSync(path.join(root, rel))) existing.push(rel);
    else missing.push(rel);
  }
  if (missing.length) {
    throw new Error("打包要用的素材不在项目里: " + missing.join(", "));
  }
  return existing;
}

function packagedSettings(raw) {
  const data = JSON.parse(raw);
  const lumu = data.casts && data.casts.lumu;
  if (lumu && Array.isArray(lumu.actions)) {
    lumu.actions = lumu.actions.filter((action) => {
      if (!action) return false;
      if (action.id === "stroll") return false;
      if (action.src === "assets/pair-stroll.mp4") return false;
      return true;
    });
  }
  data.activeId = "lumu";
  data.showAll = false;
  return JSON.stringify(data, null, 2) + "\n";
}

const originalPkg = fs.readFileSync(pkgPath);
let status = 1;
try {
  fs.mkdirSync(stageDir, { recursive: true });
  fs.writeFileSync(
    path.join(stageDir, "settings.json"),
    packagedSettings(fs.readFileSync(settingsPath, "utf8"))
  );
  if (!fs.existsSync(path.join(root, "catalog.json"))) {
    throw new Error("缺少 catalog.json");
  }
  const media = usedMedia();
  console.log("打进安装包的素材:");
  for (const rel of media) console.log("  " + rel);
  console.log("  catalog.json");
  const packedPkg = JSON.parse(originalPkg);
  packedPkg.build.files = packedPkg.build.files.filter((item) => {
    if (typeof item !== "string") return true;
    if (item === "settings.json" || item === "custom/**/*" || item === "assets/**/*") return false;
    if (item.startsWith("assets/") || item.startsWith("custom/") || item.startsWith("!assets/")) return false;
    return true;
  });
  packedPkg.build.files.push(...media, "catalog.json");
  packedPkg.build.files.push({
    from: "release/.pack",
    to: ".",
    filter: ["settings.json"],
  });

  const builder = path.join(root, "node_modules", ".bin", "electron-builder");
  const archs = ["arm64", "x64"];
  status = 0;
  for (const arch of archs) {
    const archPkg = JSON.parse(JSON.stringify(packedPkg));
    archPkg.build.mac.artifactName = "${productName}-${version}-${arch}.${ext}";
    if (arch === "x64") delete archPkg.build.extraResources;
    fs.writeFileSync(pkgPath, JSON.stringify(archPkg, null, 2) + "\n");
    const archOut = path.join(outDir, `.${arch}`);
    fs.rmSync(archOut, { recursive: true, force: true });
    const result = spawnSync(
      builder,
      ["--mac", "dmg", `--${arch}`, `--config.directories.output=${archOut}`],
      {
        cwd: root,
        stdio: "inherit",
        env: {
          ...process.env,
          CSC_IDENTITY_AUTO_DISCOVERY: "false",
          ELECTRON_MIRROR: "https://cdn.npmmirror.com/binaries/electron/",
        },
      }
    );
    status = result.status === null ? 1 : result.status;
    if (status !== 0) break;
  }
  if (status === 0) {
    fs.mkdirSync(outDir, { recursive: true });
    for (const arch of archs) {
      const dir = path.join(outDir, `.${arch}`);
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith(".dmg")) continue;
        fs.copyFileSync(path.join(dir, name), path.join(outDir, name));
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
    const notes = path.join(root, "release-notes", `v${version}.md`);
    if (fs.existsSync(notes)) {
      fs.copyFileSync(notes, path.join(outDir, notesName));
    }
  }
} finally {
  fs.writeFileSync(pkgPath, originalPkg);
}
process.exit(status);
