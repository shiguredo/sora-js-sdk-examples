# Sora JavaScript SDK サンプル

![Static Badge](https://img.shields.io/badge/Checked_with-Biome-60a5fa?style=flat&logo=biome)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

[Sora JavaScript SDK](https://github.com/shiguredo/sora-js-sdk) のサンプルです。

## About Shiguredo's open source software

We will not respond to PRs or issues that have not been discussed on Discord. Also, Discord is only available in Japanese.

Please read <https://github.com/shiguredo/oss> before use.

## 時雨堂のオープンソースソフトウェアについて

利用前に <https://github.com/shiguredo/oss> をお読みください。

## 注意

このサンプルは Sora JavaScript SDK の利用サンプルであり、
Sora の機能を確認したりする場合は [Sora DevTools](https://github.com/shiguredo/sora-devtools/) をご利用ください。

## 使い方

```bash
$ git clone git@github.com:shiguredo/sora-js-sdk-examples.git
$ cd sora-js-sdk-examples
# .env.local を作成して適切な値を設定してください
$ cp .env.template .env.local
$ pnpm install
$ pnpm dev
```

### Sora を利用する場合の .env.local の設定

```bash
# Sora の Signaling URL を指定してください
VITE_SORA_SIGNALING_URL=wss://sora.example.com/signaling
# 好きな文字列を指定してください
VITE_SORA_CHANNEL_ID=example
# VITE_SORA_CHANNEL_ID_PREFIX=
# VITE_SORA_CHANNEL_ID_SUFFIX=
# VITE_SECRET_KEY=
```

### Sora Labo を利用する場合の .env.local の設定

```bash
# Sora Labo の Signaling URL を指定してください
VITE_SORA_SIGNALING_URL=wss://sora.sora-labo.shiguredo.app/signaling
# 好きな文字列を指定してください
VITE_SORA_CHANNEL_ID=example
# Sora Labo にログインした GitHub ログイン名と GitHub ID を指定してください
# {GitHubLoginName}_{GitHubID}_ の用に指定してください
VITE_SORA_CHANNEL_ID_PREFIX={github_login_name}_{github_id}_
# VITE_SORA_CHANNEL_ID_SUFFIX=
# Sora Labo の Secret Key を指定してください
VITE_SECRET_KEY={secret_key}
```

### Sora Cloud を利用する場合の .env.local の設定

```bash
# Sora Cloud の Signaling URL を指定してください
VITE_SORA_SIGNALING_URL=wss://sora.sora-cloud.shiguredo.app/signaling
# 好きな文字列を指定してください
VITE_SORA_CHANNEL_ID=example
# VITE_SORA_CHANNEL_ID_PREFIX=
# Sora Cloud の @ + プロジェクト ID を指定してください
VITE_SORA_CHANNEL_ID_SUFFIX=@{project_id}
# Sora Cloud の API Key を指定してください
VITE_SECRET_KEY={api_key}
```

## ライセンス

Apache License 2.0

```text
Copyright 2025-2025, Shiguredo Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
