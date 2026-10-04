# 話し相手（音声パートナー）

話しかけると声で答えてくれる、自分専用のパートナーアプリです。
ブラウザの音声認識・読み上げと、Claude API を組み合わせています。

## しくみ

```
あなたの声 → ブラウザの音声認識 → /api/chat（Vercel） → Claude API
                                                         ↓
あなたの耳 ← ブラウザの読み上げ ← 返事（少しずつ届く）  ←
```

- `index.html` … 画面（スマホのホーム画面にも追加できます）
- `api/chat.js` … Claude API への中継。API キーはここだけで使い、ブラウザには渡しません
- `manifest.webmanifest` / `sw.js` / `icons/` … アプリのように使うための設定

## 公開の手順（Vercel）

1. **Claude API のキーを作る**
   https://platform.claude.com/ の Console でアカウントを作り、支払い方法を登録して API キーを発行します。
   （claude.ai のプランとは別の、使った分だけの料金です）
2. **GitHub にこのフォルダを置く**
   新しいリポジトリ（非公開でOK）を作り、このフォルダの中身をアップロードします。
3. **Vercel で読み込む**
   https://vercel.com/ に GitHub でログイン →「Add New → Project」→ 作ったリポジトリを選ぶ。
   Framework Preset は「Other」のまま、ビルド設定は空のままで構いません。
4. **環境変数を設定する**（Deploy の前の画面、または Settings → Environment Variables）
   | 名前 | 値 |
   |---|---|
   | `ANTHROPIC_API_KEY` | 1 で作った API キー |
   | `APP_PASSCODE` | 自分で決める合言葉（他人に推測されにくいもの） |
   | `MODEL`（任意） | 使うモデル。省略時は `claude-haiku-4-5-20251001` |
5. **Deploy** を押すと `https://〇〇.vercel.app` が発行されます。開いて合言葉を入れれば使えます。

環境変数を後から変えたときは、Vercel の「Deployments」から Redeploy してください。

## スマホのホーム画面に追加

- **iPhone（Safari）**：共有ボタン →「ホーム画面に追加」
- **Android（Chrome）**：メニュー →「ホーム画面に追加」または「アプリをインストール」

## 注意

- API キーは絶対に `index.html` や GitHub に書かないでください（環境変数だけに入れる）。
- 料金の上限は Claude Console の「Limits」で設定しておくと安心です。
- 会話の記録・設定・合言葉は、使っている端末のブラウザ内に保存されます。
- 音声の聞き取りはブラウザの機能です。Chrome では音声が Google のサーバーで文字に変換されます。
- iPhone でホーム画面から開いたときに聞き取りがうまく動かない場合は、Safari で直接開いてください。
