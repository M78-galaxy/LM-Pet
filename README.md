# LM-Pet

独立桌面宠物，不依赖 Obsidian。不要改 `/Users/galaxym78/Obsidian-pet`，那边的插件已经冻结。

本机开发：`npm start`。改了 `main.cjs` 或 `preload.cjs` 之后，先从菜单栏图标退出，再重新 `npm start`。

更细的进度见 [HANDOFF.md](HANDOFF.md)。

## 0.1.2

2026-10-27。说明见 [release-notes/v0.1.2.md](release-notes/v0.1.2.md)。

Mac 用 `npm run dist`。产物是两份：`LM-Pet-0.1.2-arm64.dmg`（Apple 芯片）和 `LM-Pet-0.1.2-x64.dmg`（Intel）。装过旧版的人不用删设置，喂食次数和窗口位置会留着。

## 0.1.1

2026-10-25。说明见 [release-notes/v0.1.1.md](release-notes/v0.1.1.md)。

那一版 Mac 是一份通用包。装过更早版本的人要删掉 `~/Library/Application Support/LM-Pet/settings.json` 才能看到新角色。

安装包在本机的 `release/`，不进这个仓库。牵手的待机动画大约 130MB，超过 GitHub 单文件限制，也留在本机。
