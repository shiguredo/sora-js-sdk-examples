import { resolve } from "node:path";
import { defineConfig } from "vite-plus";

export default defineConfig({
  root: resolve(import.meta.dirname),
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        sendrecv: resolve(import.meta.dirname, "sendrecv/index.html"),
        sendonly: resolve(import.meta.dirname, "sendonly/index.html"),
        recvonly: resolve(import.meta.dirname, "recvonly/index.html"),
        check_stereo: resolve(import.meta.dirname, "check_stereo/index.html"),
        check_stereo_multi: resolve(import.meta.dirname, "check_stereo_multi/index.html"),
        replace_track: resolve(import.meta.dirname, "replace_track/index.html"),
        simulcast: resolve(import.meta.dirname, "simulcast/index.html"),
        spotlight_sendrecv: resolve(import.meta.dirname, "spotlight_sendrecv/index.html"),
        messaging: resolve(import.meta.dirname, "messaging/index.html"),
      },
    },
  },
  // ===== oxlint =====
  lint: {
    // node_modules とビルド成果物、ローカルに落とした Playwright のブラウザを対象外にする
    ignorePatterns: ["node_modules/**", "dist/**", ".playwright-browsers/**"],
    options: {
      // 型情報を使う lint を有効化する
      typeAware: true,
      typeCheck: true,
      // 不要な lint ディレクティブが残ったらエラーにする
      reportUnusedDisableDirectives: "error",
    },
    plugins: ["typescript", "oxc", "unicorn", "import", "promise"],
    // カテゴリ単位の既定 (restriction のみ off にして個別 rule で制御)
    categories: {
      // 明らかに間違っているコード
      correctness: "error",
      // パフォーマンスに影響するコード
      perf: "error",
      // 疑わしいコード
      suspicious: "error",
      // 厳格なルール
      pedantic: "error",
      // 制限ルールは rules で個別に設定する
      restriction: "off",
      // スタイルルール
      style: "error",
    },
    rules: {
      // any 型の明示的使用を禁止
      "typescript/no-explicit-any": "error",
      // 非 null アサーション (!) を禁止
      "typescript/no-non-null-assertion": "error",
      // 未処理の Promise を禁止
      "typescript/no-floating-promises": "error",
      // import type を強制
      "typescript/consistent-type-imports": "error",
      // 厳密等価演算子を強制
      eqeqeq: "error",
      // var を禁止
      "no-var": "error",
      // debugger を禁止
      "no-debugger": "error",
      // eval を禁止
      "no-eval": "error",

      // ===== 日本語コメント・サンプルコードの事情による無効化 =====
      // 日本語コメントは先頭が小文字として誤検知されるため無効化
      "capitalized-comments": "off",
      // ボタンの状態表示、解像度、ポート番号などのリテラル値が多いため無効化
      "no-magic-numbers": "off",
      // タイムアウト値などをその場で記述して意図を読み取らせるため無効化
      // (変数に切り出すとサンプルとしての読みやすさが下がる)
      "one-var": "off",
      // i, id などの短い変数名はコールバック引数として一般的なため無効化
      "id-length": "off",
      // import の並び順は SDK の型とサンプル固有の型で論理的にまとめるため無効化
      "sort-imports": "off",
      // オブジェクトキーの並び順は論理的な順序を優先するため無効化
      "sort-keys": "off",
      // 三項演算子は可読性を損なわない範囲で使用するため無効化
      "no-ternary": "off",
      // 分割代入の強制は一部のプロパティ取得時に可読性を下げるため無効化
      "prefer-destructuring": "off",
      // イベントハンドラやコールバックは this を使わないことがあるため無効化
      "class-methods-use-this": "off",
      // WebRTC のシグナリング処理やイベントハンドリングは本質的に長いため無効化
      "max-lines-per-function": "off",
      // 引数の多い関数は SDK の API に対応するため無効化
      "max-params": "off",
      // SDK の接続クラスとサンプルの表示処理を 1 ファイルにまとめる構成のため無効化
      "max-classes-per-file": "off",
      // サンプルは 1 ページ 1 ファイルの構成で接続処理が長くなるため無効化
      "max-lines": "off",
      // イベントハンドラで async / await を使う書き方を維持するため無効化
      // (void 演算子の付与はサンプルの可読性を下げる)
      "typescript/no-misused-promises": "off",
      "typescript/strict-void-return": "off",
      // イベントハンドラ登録だけを行う initialize のように、await を含まない async 関数も許容する
      "require-await": "off",
      "typescript/require-await": "off",
      // イベントハンドラのエラー処理で catch を使う書き方を許容する
      "promise/prefer-await-to-then": "off",
      "promise/prefer-await-to-callbacks": "off",
      // 設定ファイルでは node: の組み込みモジュールを使うため無効化
      "import/no-nodejs-modules": "off",
      // 引数の型は呼び出し側の型で保証されているため無効化
      "typescript/prefer-readonly-parameter-types": "off",
      // SDK の型と値 (default export) を同じモジュールから取り込むため、import 文が 2 つに分かれる
      // 型のみの import は import type で明示する方針なので、重複 import の検出は無効化する
      "no-duplicate-imports": "off",
      // DOM / Web API が null しか受け付けない箇所 (srcObject, JSON.stringify の replacer 等) があるため無効化
      "unicorn/no-null": "off",
      // ページ初期化のイベントハンドラは処理を順に書くため無効化
      "max-statements": "off",
      // SDK の型と値 (default export) を同じ import 文にまとめる書き方を維持するため無効化
      "import/no-named-export": "off",
      "import/group-exports": "off",
      // ブラウザ API を扱うサンプルで window を明示する書き方を維持するため無効化
      "unicorn/prefer-global-this": "off",
    },
  },
});
