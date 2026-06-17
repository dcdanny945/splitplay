# SplitPlay 設定與啟動指南

照著下面的步驟做，每一步都標明「你要做什麼」。專案根目錄是這個資料夾（`Code/splitplay/`）。

---

## 架構速覽

- **前端 / 後端**：Next.js 16（App Router），都在這個專案裡
- **資料庫**：Supabase（PostgreSQL）
- **金流**：Stripe
  - Split 模式 → 報名時用 Checkout「setup」存卡，不收費；結算時自動扣款
  - Pay-now 模式 → 報名當下用 Checkout「payment」直接收費
- **寄信**：Resend（扣款成功寄 confirmation email）
- **自動結算**：Vercel Cron 每 5 分鐘檢查到期活動

---

## Step 1 — 填好 `.env.local`

我已經幫你建好 `.env.local`，並產生了 `ADMIN_SESSION_SECRET` 和 `CRON_SECRET`。
你只需要把**四個外部服務**的 key 填進去（對照開場白裡你那份 keys 清單）：

| 變數 | 從哪裡拿 |
|------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 同上 → anon public key |
| `SUPABASE_SERVICE_KEY` | 同上 → service_role key（保密） |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → Secret key（`sk_test_...`） |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | 同上 → Publishable key（`pk_test_...`） |
| `RESEND_API_KEY` | resend.com → API Keys（`re_...`） |
| `ADMIN_PASSWORD` | 自己設一組後台密碼 |

`STRIPE_WEBHOOK_SECRET` 先留空，**Step 4** 才會拿到。

> 也可以把這些 key 直接貼給我，我幫你填。

---

## Step 2 — 在 Supabase 建立資料表

1. 打開 Supabase → 你的專案 → 左邊 **SQL Editor** → **New query**
2. 把這個專案裡 `schema.sql` 的**全部內容**貼進去
3. 按 **Run**

跑完你會有 `events`、`participants` 兩張表，加上候補自動遞補的 trigger。
（這份 SQL 可重複執行，不會壞資料。）

---

## Step 3 — 本機啟動

```bash
npm run dev
```

打開 http://localhost:3000

- 首頁 `/` → 使用者報名頁
- `/admin` → 後台（用你在 `.env.local` 設的 `ADMIN_PASSWORD` 登入）

先去 `/admin` 建一個活動，再回首頁測報名。
（報名會跳轉到 Stripe 的付款頁，但 webhook 還沒設好之前，付完不會寫入資料庫 → 接著做 Step 4。）

---

## Step 4 — 設定 Stripe Webhook（本機測試）

報名完成後「寫進資料庫 / 扣款 / 寄信」都靠 webhook，所以一定要設。

**本機測試用 Stripe CLI（最簡單）：**

```bash
brew install stripe/stripe-cli/stripe   # 只需裝一次
stripe login                            # 會開瀏覽器授權
stripe listen --forward-to localhost:3000/api/webhook
```

`stripe listen` 會印出一行 `whsec_...`，把它貼到 `.env.local` 的 `STRIPE_WEBHOOK_SECRET`，
然後**重啟** `npm run dev`。

之後保持 `stripe listen` 這個視窗開著，報名→付款→就會自動完成。

---

## Step 5 — 設定 Resend（寄信）

1. 到 resend.com 註冊 → API Keys → 建一組，貼到 `RESEND_API_KEY`
2. 測試階段寄件人先用內建的 `onboarding@resend.dev`（已是預設值）
3. 要用自己的網域寄信，之後在 Resend 驗證網域，再把 `EMAIL_FROM` 改成你的網域信箱

> 沒填 `RESEND_API_KEY` 也不會讓付款失敗，只是不寄信而已。

---

## Step 6 — 測試金流（Stripe 測試卡）

| 情境 | 卡號 | 結果 |
|------|------|------|
| 成功 | 4242 4242 4242 4242 | 永遠成功 |
| 失敗 | 4000 0000 0000 0002 | 永遠被拒 |
| 3D 驗證 | 4000 0027 6000 3184 | 需要驗證 |

到期日填任何未來日期、CVC 任意 3 碼、郵遞區號任意。

**驗收清單：**
- [ ] Pay-now 活動：報名→付款→首頁名單出現該人（PAID）、收到 email
- [ ] Split 活動：報名→存卡→名單出現（PENDING）
- [ ] 後台對 Split 活動按「Force Settle」→ 大家被扣款、變 PAID、收到 email
- [ ] 後台改人數上限 / 總金額 → 每人金額即時重算
- [ ] 人數滿了再報名 → 進候補；移除一位 confirmed → 候補自動遞補

---

## Step 7 — 部署到 Vercel（正式上線）

```bash
npm install -g vercel
vercel
```

1. 部署後到 **Vercel → 專案 → Settings → Environment Variables**，把 `.env.local` 裡所有變數都加進去
   （`NEXT_PUBLIC_URL` 改成你的正式網址，例如 `https://splitplay.vercel.app`）
2. 到 **Stripe → Developers → Webhooks → Add endpoint**：
   - URL：`https://你的網址/api/webhook`
   - 事件：勾 `checkout.session.completed`
   - 複製這裡的 `whsec_...`，更新 Vercel 上的 `STRIPE_WEBHOOK_SECRET`，重新部署
3. `vercel.json` 已設定 Cron：每 5 分鐘打一次 `/api/cron/settle`，到結算時間的 Split 活動會自動扣款
   （Vercel 會自動帶上 `Authorization: Bearer $CRON_SECRET`，所以 `CRON_SECRET` 也要加到 Vercel 環境變數）

---

## 費用計算（澳洲 Stripe：1.7% + A$0.30）

每人扣款金額 = `(每人分擔 + 0.30) / (1 - 0.017)`，手續費由參加者吸收，主辦方實收 = 活動總金額。

範例：$60、12 人 → 每人分擔 $5.00 → 實扣 $5.39 → Stripe 收走 $0.39 → 你收到 $5.00 × 12 = $60。

---

## 已知簡化（之後可加強）

- **後台登入**用單一 `ADMIN_PASSWORD` + 簽章 cookie（適合單一主辦者）。要多組管理員再換 Supabase Auth。
- **使用者自助退出**：因為沒有使用者帳號系統，前台名單只顯示、不開放自助退出；移除參加者由後台操作。
- **扣款失敗**：標記為 `failed`，後台名單會顯示 FAILED 標籤，可聯絡對方換卡後再處理。
