# 部署到 Vercel（GitHub 自動部署）

程式碼已在 GitHub：https://github.com/dcdanny945/splitplay
所有環境變數的「值」都在你本機的 `.env.local`（此檔不在 repo 裡）。

> ⚠️ 這份檔案在公開 repo 裡，所以**不放任何 key**。需要值時請打開本機的 `.env.local` 複製。

---

## 階段 1 — 匯入並第一次部署

1. 開 https://vercel.com/new → 用 **GitHub** 登入（dcdanny945）
2. 找到 **splitplay** → **Import**
3. Framework 自動偵測 **Next.js**，其餘設定不用改
4. 展開 **Environment Variables**，把下列變數逐一加入（值從 `.env.local` 複製）：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY`
   - `STRIPE_SECRET_KEY`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - `RESEND_API_KEY`
   - `EMAIL_FROM`
   - `ADMIN_PASSWORD`
   - `ADMIN_SESSION_SECRET`
   - `CRON_SECRET`
   - （這個階段先**不要**加 `STRIPE_WEBHOOK_SECRET` 和 `NEXT_PUBLIC_URL`）
5. 按 **Deploy**，等 1–2 分鐘
6. 記下部署網址，例如 `https://splitplay-xxxx.vercel.app`

---

## 階段 2 — 設定正式 Stripe Webhook

1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**
2. Endpoint URL：`https://<你的vercel網址>/api/webhook`
3. 勾選事件：`checkout.session.completed`
4. 建立後複製 **Signing secret**（`whsec_...`）

---

## 階段 3 — 補上兩個環境變數並重新部署

Vercel → 專案 → **Settings → Environment Variables**，新增：

- `STRIPE_WEBHOOK_SECRET` = 階段 2 拿到的 `whsec_...`
- `NEXT_PUBLIC_URL` = `https://<你的vercel網址>`（結尾不要加 `/`）

然後 **Deployments → 最新一筆 → ⋯ → Redeploy**（讓新變數生效）。

---

## 階段 4 — 在正式網站測一筆

1. 開 `https://<你的vercel網址>`
2. 後台 `/admin` 用 `ADMIN_PASSWORD` 登入，建一個活動
3. 用測試卡付款：`4242 4242 4242 4242`、未來到期日、任意 CVC
4. 確認：名單出現該人並標 PAID、Stripe Dashboard 看得到付款

---

## 自動結算（Cron）

`vercel.json` 已設定每 5 分鐘呼叫 `/api/cron/settle`。Vercel 會自動帶
`Authorization: Bearer $CRON_SECRET`，所以 `CRON_SECRET` 一定要在 Vercel 環境變數裡。
Split 模式的活動到結算時間就會自動扣款。

---

## 正式上線前（從測試 → 真實收款）

目前用的是 **Stripe 測試金鑰**（`sk_test` / `pk_test`），不會真的收錢。要收真實款項時：

1. Stripe 切換到 **Live mode**，拿 `sk_live_` / `pk_live_`，更新 Vercel 變數
2. 在 Live mode 重新建立一次 webhook，更新 `STRIPE_WEBHOOK_SECRET`
3. **Email**：Resend 沙盒寄件人（`onboarding@resend.dev`）只能寄給你自己。要寄給所有報名者，需在 resend.com 驗證一個自己的網域，並把 `EMAIL_FROM` 改成該網域信箱

---

## 之後改程式怎麼更新？

直接 `git push`，Vercel 會自動重新部署。本機改完後：

```bash
git add -A
git commit -m "你的修改說明"
git push
```
