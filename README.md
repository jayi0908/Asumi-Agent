<div align="center">
  <div style="width:200px">
    <a href="https://vndb.org/c87839">
      <img src="src-tauri/icons/icon.ico" alt="asumi">
    </a>
  </div>

<h1>Asumi Agent</h1>

<p align="center">English | <a href="./README.zh_CN.md">中文</a> | <a href="./README.ja_JP.md">日本語</a></p>

![Status](https://img.shields.io/badge/status-active-brightgreen) ![Stage](https://img.shields.io/badge/stage-pre--alpha-red) ![Build Status](https://github.com/huoshen80/ReinaManager/actions/workflows/build.yml/badge.svg)

</div>

> 男性は少し苦手です。先輩からは、いやらしさを感じなかったので……。

A desktop AI Agent tool inspired by the character [錦 あすみ (Asumi Nishiki)](https://madosoft.net/hamidashi/character#asumi) from Madosoft's *Hamidashi Creative*, designed to assist and accompany users in their daily workflow.

## Features

The project is in early development, starting from macOS, with the following planned features:

- [x] **Menu Bar**: Display an Asumi-themed icon in the menu bar with contextual actions.
- [x] **Multi-Model Support**: Connect to various LLM providers (cloud API / local models) for flexible conversation and interactions.
- [ ] **Desktop Pet**: Show Asumi's character on the desktop with text-based interaction.
- [ ] **Voice Output**: TTS-powered voice synthesis in Asumi's character voice for immersive interaction.
- [ ] **Transparent Companion**: Two modes — persistent (always on screen) and transparent (appears only under certain conditions).
- [ ] **Screen Understanding**: Periodically capture screen content, analyze it via multimodal LLM, and let Asumi react to what you're doing.
- [ ] **Quick Command Execution**: Define shortcuts or scripts for Asumi to execute, providing practical utility.
- [ ] **Audio Playback**: Built-in audio clips related to Asumi for atmosphere.
- [x] **Quick Launch**: Summon a mini chat window via global hotkey for rapid interaction.
- [ ] **Information Retrieval**: Let Asumi periodically fetch and summarize information from specified sources (websites/social media) to keep you updated.
- [ ] **File Processing**: Drag-and-drop files for Asumi to process — write scripts or skills for automated file organization.
- [x] **Asumi Skill**: Allow users to specify Asumi's tone and style for output formatting.
- [ ] **Third Party Skill**: Allow users to integrate third-party skills to extend Asumi's capabilities.

## Tech Stack

- **Desktop Framework**: Tauri 2
- **Frontend**: React + TypeScript + TailwindCSS
- **Backend Language**: Rust

## Acknowledgements

- [ハミダシクリエイティブ (Hamidashi Creative)](https://madosoft.net/hamidashi) — Inspiration for Asumi's character design and personality.
- [Cherry Studio](https://github.com/CherryHQ/cherry-studio) — Design inspiration for overlapping features.

## License

This project is open source under the [GPL-2.0](./LICENSE) License.
