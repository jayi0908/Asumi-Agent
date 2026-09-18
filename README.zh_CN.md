<div align="center">
  <div style="width:200px">
    <a href="https://vndb.org/c87839">
      <img src="src-tauri/icons/icon.ico" alt="asumi">
    </a>
  </div>

<h1>Asumi Agent</h1>

<p align="center"><a href="./README.md">English</a> | 中文 | <a href="./README.ja_JP.md">日本語</a></p>

![Status](https://img.shields.io/badge/status-active-brightgreen) ![Stage](https://img.shields.io/badge/stage-pre--alpha-red) ![Build Status](https://github.com/huoshen80/ReinaManager/actions/workflows/build.yml/badge.svg)

</div>

> 男性は少し苦手です。先輩からは、いやらしさを感じなかったので……。

一个融入 [锦亚澄 / 錦 あすみ](https://madosoft.net/hamidashi/character#asumi) 的形象与性格的 AI Agent 桌面工具，可在用户的日常操作中提供帮助和陪伴。

## 功能

目前项目处于构思阶段，从 macOS 开始设计，计划实现以下功能：

- [x] **Menu Bar**：在菜单栏显示与あすみ有关的图标，点击后提供相关功能。
- [x] **模型接入**：支持接入多种模型（API / 本地），以支持不同的对话和交互需求。
- [ ] **桌宠**：可在桌面上显示あすみ的形象，提供文本互动功能。
- [ ] **语音输出**：通过 TTS 技术实现あすみ的语音输出，增强互动体验。
- [ ] **透明陪伴**：支持常驻和透明两种模式，常驻模式下あすみ始终在屏幕上，透明模式下仅在特定条件下出现。
- [ ] **屏幕理解**：定时截取屏幕内容并上传给多模态模型，返回分析结果供あすみ进行反馈和互动。
- [ ] **快捷指令执行**：用户可设计快捷指令或脚本供あすみ执行，以提供实用功能。
- [ ] **音频播放**：内置一部分与あすみ相关的音频素材，用户可选择播放以增加氛围。
- [x] **快捷呼出**：用户可通过快捷键呼出一个小窗口与あすみ进行快速互动。
- [ ] **文件处理**：用户可拖拽文件给作为书记的あすみ进行处理，可以通过撰写脚本或 skill 来进行文件的分类操作，以提高效率。
- [ ] **信息获取**：用户可指定信息源，如网站/社交媒体等，让あすみ定期获取并总结相关信息，以便用户了解最新动态。
- [x] **Asumi Skill**：用户可指定あすみ输出的语气和风格来格式化输出。
- [ ] **Third Party Skill**：用户可引入第三方 skill 来扩展あすみ的功能。

## 技术栈

- **桌面宿主**：Tauri 2（Rust）——窗口、菜单栏、桌宠、托盘、桌面桥
- **Agent 引擎**：[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
  ——负责对话、工具调用、所有模型请求，并以 web client 形式提供 UI
- **能力**：`asumi-plugins/` 下的 DSH bundle（人设、桌面桥、工具）

Tauri 壳不含任何 Agent 逻辑：它只把 webview 指向引擎，并做插件做不到的系统集成。

> 本项目起点的 Cherry Studio（Electron → Tauri）移植代码只保留在 `migration-plan`
> 分支上供参考与迁移，不属于本应用。

## 从源码构建

### macOS

```bash
# 安装 Xcode 命令行工具（如果尚未安装）
xcode-select --install

# 安装 Homebrew（如果尚未安装）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 安装 Rust 依赖
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh # 安装过程中 Enter 选择默认选项，安装后重启终端或运行 source $HOME/.cargo/env

# 安装 node 和 pnpm
# node 可以使用 Homebrew 安装，也可以使用 nvm 安装
brew install node pnpm

# 克隆仓库
git clone https://github.com/jayi0908/Asumi-Agent.git
cd Asumi-Agent

# 安装依赖；postinstall 会链接仓库内插件要 import 的 DSH 宿主包
pnpm install

# 创建引擎 profile（仅首次；插件通过 link: 指向本仓库）
pnpm dsh --profile asumi --from-default-profile web

# 开发模式运行 —— 桌面壳自己启动引擎
pnpm dev

# 构建完全自带的 .app（内置引擎与 Node 运行时）
pnpm build
```

引擎状态保存在 `$DSH_HOME`（默认 `~/Library/Application Support/AsumiAgent`）。
想直接复用之前在 Cherry Studio 里配置的模型服务商，见
[`scripts/configure-asumi-model.mjs`](./scripts/configure-asumi-model.mjs)。

### 安装发布包

发布包是 ad-hoc 签名的，**没有公证**：公证需要付费的 Apple Developer Program，
因此 macOS 会隔离下载的 app。清一次隔离属性即可正常打开：

```bash
xattr -dr com.apple.quarantine "/Applications/Asumi Agent.app"
```

屏幕理解还需要授权（系统设置 → 隐私与安全性 → 屏幕录制 → 勾选 Asumi Agent）。

## 致谢

- [ハミダシクリエイティブ](https://madosoft.net/hamidashi) — あすみ的形象和性格设计灵感来源。
- [Cherry Studio](https://github.com/CherryHQ/cherry-studio) — 重合的部分功能设计和灵感来源。

## License

本项目基于 [GPL-2.0](./LICENSE) 许可证开源。
