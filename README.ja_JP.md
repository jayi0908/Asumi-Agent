<div align="center">
  <div style="width:200px">
    <a href="https://vndb.org/c87839">
      <img src="public/icon.png" alt="asumi">
    </a>
  </div>

<h1>Asumi Agent</h1>

<p align="center"><a href="./README.md">English</a> | <a href="./README.zh_CN.md">中文</a> | 日本語</p>

![Status](https://img.shields.io/badge/status-active-brightgreen) ![Stage](https://img.shields.io/badge/stage-pre--alpha-red) ![Build Status](https://github.com/huoshen80/ReinaManager/actions/workflows/build.yml/badge.svg)

</div>

> 男性は少し苦手です。先輩からは、いやらしさを感じなかったので……。

[錦 あすみ](https://madosoft.net/hamidashi/character#asumi)（まどそふと『ハミダシクリエイティブ』）のイメージと性格を取り入れた AI Agent デスクトップツールです。日常の操作をサポートし、寄り添う存在を目指しています。

## 機能

現在は初期開発段階で、macOS をターゲットに以下の機能を計画しています：

- [ ] **Menu Bar**：メニューバーにあすみに関連したアイコンを表示し、クリックで機能を提供。
- [ ] **マルチモデル対応**：複数のモデル（API / ローカル）に対応し、さまざまな対話・インタラクションに対応。
- [ ] **デスクトップペット**：デスクトップにあすみのキャラクターを表示し、テキストでのふれあいが可能。
- [ ] **音声出力**：TTS 技術によるあすみの音声出力で、没入感のある体験を提供。
- [ ] **透過コンパニオン**：常駐モード（常時表示）と透過モード（特定条件下のみ表示）の2種類に対応。
- [ ] **画面理解**：定期的にスクリーンショットを取得し、マルチモーダルモデルで解析。あすみがユーザーの作業内容に合わせてリアクション。
- [ ] **クイックコマンド**：ユーザーが定義したショートカットやスクリプトをあすみが実行。
- [ ] **オーディオ再生**：あすみに関連する音声素材を内蔵し、雰囲気に合わせて再生可能。
- [ ] **クイック起動**：グローバルホットキーでミニウィンドウを呼び出し、あすみと素早く対話。
- [ ] **ファイル処理**：ファイルをドラッグ＆ドロップで書記あすみに渡し、スクリプトやスキルで自動仕分け。
- [ ] **Asumi Skill**：（未定）既存のスキルをあすみの口調やスタイルでフォーマットして出力。

## 技術スタック

- **デスクトップフレームワーク**：Tauri 2
- **フロントエンド**：React + TypeScript + TailwindCSS
- **バックエンド言語**：Rust

## 謝辞

- [ハミダシクリエイティブ](https://madosoft.net/hamidashi) — あすみのキャラクターデザインと性格のインスピレーション。
- [Cherry Studio](https://github.com/CherryHQ/cherry-studio) — 共通機能のデザイン参考。

## ライセンス

本プロジェクトは [GPL-2.0](./LICENSE) ライセンスの下で公開されています。
