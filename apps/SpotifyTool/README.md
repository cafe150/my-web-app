# 🎵 SpotifyTool (GitHub Pages 対応版)

Spotify Web APIを活用し、ユーザーの再生状態、プロフィール、トップ項目（楽曲・アーティスト）、ライブラリ、プレイリストを1画面に網羅してリアルタイムに可視化するモダンかつプレミアムな音楽ダッシュボードWebアプリケーションです。

静的ファイル（HTML / CSS / JS）のみで完結しており、**サーバー不要でGitHub Pagesなどの静的ホスティングにフォルダ・ファイルをアップロードするだけでそのまま公開・動作**します。

---

## 📁 構成ファイル一覧

```text
SpotifyTool/
├── index.html        # ダッシュボード本体（HTML）
├── css/
│   └── style.css     # プレミアムダークテーマ & スタイルシート
├── js/
│   ├── app.js        # アプリケーション全体の制御・イベントリスナー・状態管理
│   ├── auth.js       # PKCE認可フロー (ブラウザ完結) & トークン管理
│   ├── api.js        # Spotify Web API クライアント (429/401自動リトライ・データ補完)
│   ├── ui.js         # DOMレンダラー (イコライザー、シークバー等)
│   └── mockData.js   # デモモード用モックデータ
└── README.md
```

---

## 🚀 GitHub Pages への公開手順（超シンプル）

1. **GitHubにリポジトリを作成してプッシュ**
   このフォルダ内のファイル群（`index.html`, `css/`, `js/` など）をそのままGitHubリポジトリのルートにプッシュします。

2. **GitHub Pages を有効化**
   - GitHubリポジトリの **Settings** > **Pages** を開きます。
   - **Build and deployment** の Source で **Deploy from a branch** を選択。
   - Branch を `main`（または `master`）、フォルダを `/ (root)` に設定して **Save** をクリックします。
   - 数十秒〜1分ほどで公開URL（`https://<ユーザー名>.github.io/<リポジトリ名>/`）が発行されます。

---

## 🔑 Spotify 本番アカウントとの連携手順

1. [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) にアクセスしてログインします。
2. **「Create app」** をクリックし、アプリ名（例: `SpotifyTool`）を作成します。
3. 作成したアプリの設定（Settings）を開き、**Redirect URIs** に公開されたGitHub PagesのURLを登録して保存します：
   ```text
   https://<あなたのユーザー名>.github.io/<リポジトリ名>/
   ```
   *(※ローカル開発時 `http://127.0.0.1:5500/` や `http://localhost:3000/` などもRedirect URIsに追加登録できます。画面右上の「⚙ 設定」モーダル内に、お使いの環境用のRedirect URIが自動表示され、ワンクリックでコピーできます)*
4. Dashboardの「Basic Information」から **Client ID** をコピーします。
5. 公開したダッシュボード画面右上の **「⚙ 設定」** を開き、**Client ID** を貼り付けて「保存」をクリックします。
6. 右上の **「Spotifyでログイン」** を押せば、OAuth 2.0 PKCEフローによりブラウザ単体で安全に連携が完了し、あなたのアカウントの実データが読み込まれます！

> **Client ID未登録でも安心:**
> 画面上部の **「デモモード」** をクリックすれば、Spotifyアプリ登録前でもフル機能・リッチUIの動作をいつでもお試しいただけます。
