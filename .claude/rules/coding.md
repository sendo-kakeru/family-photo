---
paths: ["**/*.{ts,tsx}"]
---

## コーディング規約

- ページは default export、それ以外は named export
- ログ、エラーは日本語で統一
- 関数の返り値はできるだけ型を明示する。コールバック関数は任意。
- 関数の引数は分割代入し、引数内で型定義
- forEach は使わず、for of を使用
- any、as、Non-Null Assertion Operator による型の誤魔化しは最小にし、できるだけ適切に型付けする。as const の使用は問題ない。
- 関数の引数が複数あるものは基本的にオブジェクトで渡す。
- 型定義は interface ではなく type
- 型定義はなるべくモデルのフィールドを参照する。（特に id）
