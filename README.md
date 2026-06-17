# SplitPlay

活動報名 + 自動分攤收款。Next.js 16 + Supabase + Stripe + Resend。

**第一次設定請看 [SETUP.md](./SETUP.md)** — 裡面有逐步操作（填 key、建資料表、設 webhook、部署）。

## 快速開始

```bash
npm run dev      # 本機開發 http://localhost:3000
npm run build    # 正式建置
```

## 主要檔案

| 路徑 | 說明 |
|------|------|
| `schema.sql` | Supabase 資料表 SQL（貼到 SQL Editor 跑） |
| `.env.local` | 環境變數（已 gitignore；密鑰已產生，外部 key 待填） |
| `vercel.json` | Vercel Cron 設定（每 5 分鐘自動結算） |
| `lib/` | pricing 計算、Supabase/Stripe/Resend client、admin 驗證、結算邏輯 |
| `app/api/` | 後端 API（events / register / webhook / withdraw / cron / admin） |
| `app/page.tsx` | 使用者報名頁 |
| `app/admin/` | 後台 |
| `app/components/ui.tsx` | 共用 UI 元件 |

## 兩種收費模式

- **Split**：報名存卡不收費，到結算時間（或後台手動）自動依人數均分扣款。
- **Pay-now**：報名當下直接付款（總額 ÷ 人數上限），不需結算。

每個活動可由後台自由切換。
