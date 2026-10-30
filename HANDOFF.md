# LM-Pet 项目说明

进度记到 2026-10-27，版本 0.1.2。工作区是：

**`/Users/galaxym78/Desktop/Projects/LM-Pet`**

软件名是 **LM-Pet**。不要改 `/Users/galaxym78/Obsidian-pet`，那边是已冻结的 Obsidian 插件，只作参考。

远程仓库：https://github.com/M78-galaxy/LM-Pet.git  
0.1.1 和 0.1.2 的说明在 `release-notes/`。安装包在本机 `release/`，不进仓库。牵手的待机动画大约 130MB，超过 GitHub 单文件限制，也留在本机。

---

## 现在能做什么

Mac 上的透明桌宠，无边框、始终置顶、不进程序坞，从菜单栏图标开关。

- 角色可切换。四组：天魔练习室采访、2025不心动挑战（`assets/An_pet/idle-2025sport.webp`）、牵手（`assets/An_pet/idle-handhold.webp`）、真爱降临（`assets/An_pet/idle-zhenai.webp`）。
- 每组有自己的左右称呼、对话和动作。气泡是 logo 的青到粉渐变，里面只显示台词。
- 右键可以选一段对话或动作。一段对话会按顺序说完，大约每 2 秒一句。自动说话也是整段说完。
- 点人物说一句，点气泡立刻接下一句，悬停会轻轻晃，双击播该场景的第一个动作。
- 按住人物可拖。拖到屏幕边缘时，对准的是人物而不是透明窗口。指针不在人物上时，点击会穿过窗口。
- 没有靠屏幕边缘自动转身。
- 「牵手逛逛」用 `assets/pair-stroll.mp4`。窗口滑动对齐视频时间，可调 `index.html` 里的 `STROLL_WALK_AT`（4650）和 `STROLL_WALK_MS`（6700），单位毫秒。
- 把文件拖到人物身上会送进废纸篓（可恢复），并记「喂食 N 份」。不吃本项目里的文件。喂的时候会蹲一下、碎屑飞进嘴里。解锁新角色还没做，现有角色都不锁。
- 开发时（`npm start`）设置里可以上传图片、改名字、改对话、加动作。打进安装包之后，别人只能换角色和调大小，不能改这些内容。

---

## 怎么在这台电脑上跑

```bash
cd /Users/galaxym78/Desktop/Projects/LM-Pet
npm start
```

改了 `main.cjs`、`preload.cjs` 或菜单栏图标后，要先从菜单栏图标里选退出，再 `npm start`。只在终端里停掉，旧进程还在。

`settings.json` 和 `custom/` 不进 git，角色和对话在这里。`npm start` 直接读写项目里的 `settings.json`。

---

## 打包和给别人更新

Mac 安装包按芯片分成两份：

```bash
npm run dist
```

发给别人的是 `release/v版本号/LM-Pet-版本号-arm64.dmg`（Apple 芯片）和 `LM-Pet-版本号-x64.dmg`（Intel）。打开后把 LM-Pet 拖进「应用程序」。没有苹果开发者签名。`.blockmap` 不用发。Intel 那一份不能从访达拖文件喂食。

Windows 安装包必须在 Windows 上打，命令是 `npm run dist:win`，得到 `release` 里的 Setup exe。拷过去时带上 `assets`、`custom`、`settings.json`、`bin`、源码和 `package.json` / `package-lock.json`。可以不带 `animation`、`release`、`.git`、`node_modules`、`Obsidian_example`。`node_modules` 到 Windows 上重新 `npm install`。

从 0.1.2 起，覆盖安装会把内置角色并进原来的设置，喂食次数、窗口位置、人物大小和说话间隔留着。不用再删：

`~/Library/Application Support/LM-Pet/settings.json`

---

## 素材别搞混

| 用途 | 路径 |
|---|---|
| 软件图标 | `assets/logo.png` |
| 内置双人缩略图 | `assets/lumu-thumb.png` |
| 2025不心动挑战 | `assets/An_pet/idle-2025sport.webp` |
| 牵手待机 | `assets/An_pet/idle-handhold.webp` |
| 真爱降临 | `assets/An_pet/idle-zhenai.webp` |
| 牵手逛逛视频 | `assets/pair-stroll.mp4` |

`hand_hold.png` 以前叫 `牵手.png`，为了拷到 Windows 不乱码才改名。桌宠运行不读这个原画。`animation/` 是动画工程，运行和打包都不用。

菜单栏图标大小看 `main.cjs` 里的 `TRAY_CROP`，不要靠改 PNG 的宽高。

---

## 主要文件

| 文件 | 做什么 |
|---|---|
| `main.cjs` | 窗口、托盘、设置读写、废纸篓、打包后禁止改角色 |
| `preload.cjs` | 页面和主进程之间的接口 |
| `index.html` | 人物、对话、拖动、穿透、喂食动画 |
| `settings.html` | 设置页。安装包里会藏起上传和改对话 |
| `bin/lm-pet-dragwatch` | 只有 Mac 用，帮着接住访达拖放。Windows 上不会跑 |
