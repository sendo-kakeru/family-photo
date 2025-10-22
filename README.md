Googleドライブの課金が高いので自前で安く済ませるアプリケーションです。

## 想定コスト
- エグレスは無料:
  - Backblaze B2とCloudflareの提携により、Cloudflare経由のダウンロード配信は無料
  - https://www.backblaze.com/docs/cloud-storage-deliver-public-backblaze-b2-content-through-cloudflare-cdn
- 保存容量: 10GBは無料それ以上に対して費用がかかる

### Backblaze B2
- 100GB: $0.54 / 月（記述現在約82円）
  - 100GB − 10GB = 90GB
  - 90 × $0.006
- 200GB: $1.14 / 月（記述現在約173円）
  - 200GB − 10GB = 190GB
  - 190 × $0.006

### Googleドライブ
  - 100GB: 290円 / 月
  - 200GB: 440円 / 月

## 機能
- 一括アップロード
- ギャラリー表示
- 詳細表示
- 動画再生
- 特定のGoogleアカウントのみ利用許可（身内のみの利用想定）

## 概要
- オブジェクトストレージ: Backblaze B2
  - Backblaze B2 → cloudflare 配信は無料
- DBなし
- 認証:
  - Auth.js(Google認証)
  - 特定のGoogleアカウントのみ許可(2~6個のアカウント数想定)
- CDN:
  - Hono(cloudflare workers)
  - 配信のみ
- フロント：
  - Next.js(Vercel)
  - tailwind css
  - shadcn ui
  - UI/UX
    - ギャラリー
      - 無限スクロール
      - 全部でx枚中、y枚部分へジャンプ機能
      - 横4枚がベースで6、8枚にも変更可能
      - ギャラリーでは正方形で表示
    - 詳細
      - 画像は一枚表示、動画は再生可能
      - 削除、共有など、アクションは不要
    - 一括アップロード
      - 万単位の一括アップロードが予想される