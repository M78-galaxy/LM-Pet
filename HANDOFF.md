# 橹穆桌宠桌面版交接（LM-Pet）

新对话请先读完这份文件。工作区必须是：

**`/Users/galaxym78/Desktop/Projects/LM-Pet`**

不要打开 `/Users/galaxym78/Obsidian-pet` 当这个项目的根目录。那边是已经冻结的 Obsidian 插件。

---

## 新对话怎么带（用户可整段粘贴）

我在做「橹穆」独立桌面宠物。请先读工作区里的 `HANDOFF.md`。

项目路径：`/Users/galaxym78/Desktop/Projects/LM-Pet`。Obsidian 插件在 `/Users/galaxym78/Obsidian-pet`，只许当参考，不许改它的 `main.ts`。

准备工作已经做完：文件夹、素材、`package.json`、Electron 已安装。请从 **第 1 关** 开始教我自己写 `main.cjs` 和 `index.html`。不要一上来生成完整成品。我没明确说「你来写」时，只给文件内容和命令，等我跑通再进下一关。

---

## 给后续助手的规矩

- 用户要学习怎么做一个能跑通的 App。默认 **只教、给可复制内容**，等他跑通再往下。
- 除非用户明确说「你来写 / 开 Agent 直接改」，否则不要一次贴完整工程、不要替他写完整桌宠逻辑。
- 一次只做一关。没看到窗口之前，不要搬插件对话/精灵系统，不要打 dmg，不要上 Tauri。
- 用中文。终端命令里不要夹杂交互式 zsh 会当命令执行的 `#` 注释行。
- npm 若失败，加 `--registry=https://registry.npmmirror.com`。
- 不要 `git push --force`。不要改 git config。用户没要求就不要 commit。
- **禁止修改** `/Users/galaxym78/Obsidian-pet/main.ts` 以及该插件其它源码。

---

## 两个仓库，别搞混

| | Obsidian 插件（已完成） | 本项目（桌面版，进行中） |
|---|---|---|
| 路径 | `/Users/galaxym78/Obsidian-pet` | `/Users/galaxym78/Desktop/Projects/LM-Pet` |
| GitHub | https://github.com/M78-galaxy/LUMU-Pet-for-Desktop.git | 尚未单独绑定（需要时再建） |
| 分支 | `main` = v1；`v2-dev` = v2.0.0 | 尚未 git init（用户要求再做） |
| 运行 | 在 Obsidian 里加载插件 | `cd` 本目录后 `npm start` |

插件 Tag：`v1.0.0`、`v2.0.0`。桌面版是新产品，版本从 `0.1.0` 起。

环境（2026-10-08）：macOS Apple Silicon，Node v24，**没有** Rust / Tauri。桌面版用 **Electron**。

---

## 准备工作（已完成，不要再做一遍）

- [x] 目录 `/Users/galaxym78/Desktop/Projects/LM-Pet`
- [x] `package.json`（`"main": "main.cjs"`，`"start": "electron ."`）
- [x] `npm install --save-dev electron`（国内源）
- [x] `assets/` 已从 Obsidian 库拷入（见下方清单）
- [x] `.gitignore`（忽略 `node_modules/`、本地设置、`.DS_Store`）
- [ ] **还没有** `main.cjs`、`index.html` ← 第 1 关由用户自己写
- [ ] 还没有透明窗、拖动、对话、视频、dmg

素材已在 `assets/`：

- 坐：`A-sit.png` `B-sit.png` `A-sit-talk.png` `B-sit-talk.png` `A-sit-open.png` `B-sit-open.png`
- 站/走：`A-idle.png` `B-idle.png` `A-walk.png` `B-walk.png` `A-standup.png` `B-standup.png` `A-sitdown.png` `B-sitdown.png`
- 双人：`pair-hold.png` `pair-walk.png` `pair-sit.png` `pair-standup.png` `pair-sitdown.png` `pair-meet.png`
- 视频：`pair-stroll.mp4`（白底，插件里运行时抠透明）
- 参考旧图：`pet-cap.png` `pet-silver.png`

角色：**老妈妈 A**（黑帽 LM、菱格夹克），**老爸爸 B**（银发、灰拉链、迷彩）。

---

## 插件里有、桌面版以后要有的能力（先别实现）

参考代码：`/Users/galaxym78/Obsidian-pet/main.ts`、`styles.css`。

已有功能：坐下待机、坐着张嘴对话、站着对话（无站立张嘴图则只出气泡）、右键动作、自动互动、牵手视频 `pair-stroll.mp4`（走路段平移）。

桌面版 **没有** `obsidian` API（`Plugin` `TFile` `vault` `Setting` `Notice` `Menu`）。图片用 `assets/A-sit.png`。设置用本地 JSON。窗口必须自己用 Electron 开。

第一期产品：Mac 始终置顶、背景透明；两人坐在桌面上；可拖。对话、牵手视频、安装包往后排。

---

## 教学路线（从第 1 关开始）

第 0 关（装 Electron）已完成。在本目录运行 `npm start` 前必须先有 `main.cjs` 和 `index.html`。

### 第 1 关：普通窗口 + 一行字

用户自己新建 `main.cjs`：

```js
const { app, BrowserWindow } = require("electron");

function createWindow() {
  const win = new BrowserWindow({
    width: 480,
    height: 360,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.loadFile("index.html");
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
```

自己新建 `index.html`：标题「橹穆桌宠」，正文「如果你能看到这行字，第一关就过了。」

```bash
cd /Users/galaxym78/Desktop/Projects/LM-Pet
npm start
```

成功：弹出标准 Mac 窗口。关掉窗口或终端 `Ctrl+C`。

### 第 2 关：透明、无边框、置顶

`BrowserWindow` 加上：`transparent: true`、`frame: false`、`alwaysOnTop: true`、`hasShadow: false`、`skipTaskbar: true`。CSS：`html, body { background: transparent; }`。

成功：字浮在桌面上，没有系统标题栏。

### 第 3 关：坐下的两人 + 拖动

素材已在 `assets/`，**不要再从库拷**。`index.html` 里放 `assets/A-sit.png` 和 `assets/B-sit.png`，高度约 140px，外层 div 写 `-webkit-app-region: drag`。

成功：桌面上坐着两个人，按住能拖，背景透明。这是最小能跑通的桌宠。

### 第 3 关之后（每次只加一件）

1. 右键菜单
2. 从插件移植精灵/对话：去掉所有 `obsidian` import
3. 设置写入本地文件
4. `electron-builder` 打 dmg

---

## Electron 两段程序

| | 文件 | 职责 |
|---|---|---|
| 主进程 | `main.cjs` | 开窗口、置顶、以后打包 |
| 渲染进程 | `index.html` + JS | 画小人、对话、动画 |

`package.json` 的 `"main"` 已指向 `main.cjs`。

---

## 常见翻车

- `electron: command not found`：不在本目录，或 `node_modules` 丢失（再跑 `npm install --save-dev electron --registry=https://registry.npmmirror.com`）
- 在 `/Users/galaxym78/Obsidian-pet` 里 `npm start` 会跑插件的 esbuild，**不是**这个桌面 App
- 黑/白方块：忘了 `transparent: true` 或 body 不是透明
- 图片裂开：路径必须是相对本项目的 `assets/A-sit.png`
- 拖不动：`drag` 要写在包着图的容器上
