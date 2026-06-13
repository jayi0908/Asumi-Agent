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

- [ ] **Menu Bar**：在菜单栏显示与あすみ有关的图标，点击后提供相关功能。
- [ ] **模型接入**：支持接入多种模型（API / 本地），以支持不同的对话和交互需求。
- [ ] **桌宠**：可在桌面上显示あすみ的形象，提供文本互动功能。
- [ ] **语音输出**：通过 TTS 技术实现あすみ的语音输出，增强互动体验。
- [ ] **透明陪伴**：支持常驻和透明两种模式，常驻模式下あすみ始终在屏幕上，透明模式下仅在特定条件下出现。
- [ ] **屏幕理解**：定时截取屏幕内容并上传给多模态模型，返回分析结果供あすみ进行反馈和互动。
- [ ] **快捷指令执行**：用户可设计快捷指令或脚本供あすみ执行，以提供实用功能。
- [ ] **音频播放**：内置一部分与あすみ相关的音频素材，用户可选择播放以增加氛围。
- [ ] **快捷呼出**：用户可通过快捷键呼出一个小窗口与あすみ进行快速互动。
- [ ] **文件处理**：用户可拖拽文件给作为书记的あすみ进行处理，可以通过撰写脚本或 skill 来进行文件的分类操作，以提高效率。
- [ ] **Asumi Skill**：（待定）用户可引入之前使用过的 skill，并指定あすみ输出的语气和风格来格式化输出。

## 技术栈

- **桌面框架**：Tauri 2
- **前端**：React + TypeScript + TailwindCSS
- **后端语言**：Rust

## 致谢

- [ハミダシクリエイティブ](https://madosoft.net/hamidashi) — あすみ的形象和性格设计灵感来源。
- [Cherry Studio](https://github.com/CherryHQ/cherry-studio) — 重合的部分功能设计和灵感来源。

## License

本项目基于 [GPL-2.0](./LICENSE) 许可证开源。
