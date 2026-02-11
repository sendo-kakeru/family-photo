---
paths: ["packages/app/**/*.{ts,tsx}"]
---

## フロントエンド コーディング規約

- tailwind merge の使用は意図しないマージが起こるので使用禁止
- tailwind variants の slot は複雑になるので基本使用しない
- memo 化はなるべく React Compiler に任せる

### tailwind css

- `space-*`は使用せず、`gap-*`を使う
