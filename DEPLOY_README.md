# Sprint Sales Platform — VM Deploy

**IP:** `34.45.196.175`
**Dashboard:** `http://34.45.196.175:8080`
**Bot:** `@mytest11235bot`

---

## SSH Access

```bash
ssh -i ~/.ssh/gcp_sprintsales_key hp@34.45.196.175
```

## Project Path

```
/home/hp/sprintsales/
├── server.js              # Main application (378KB, ESM)
├── package.json
├── .env                   # PORT=8080, NODE_ENV=production
├── data/
│   └── platform.json      # All state (DB)
├── public/
│   └── index.html         # Dashboard SPA
├── src/services/ai/
│   ├── deepseek.js        # DeepSeek text extraction
│   └── provider-resolver.js
├── test-ai-providers.mjs  # 49 tests
└── seed-demo.mjs          # Seed script (run once)
```

## Start / Restart

```bash
pm2 restart sprintsales          # Restart server
pm2 start server.js --name sprintsales   # First-time start
pm2 list                        # Confirm running
```

## View Logs

```bash
pm2 logs sprintsales            # Live tail
pm2 logs sprintsales --lines 50 # Last 50 lines
pm2 logs sprintsales --nostream # One-shot dump
```

## Backup

```bash
# Full project backup
cp -r ~/sprintsales ~/sprintsales_backup_$(date +%Y%m%d_%H%M%S)

# Database-only backup
cp ~/sprintsales/data/platform.json ~/sprintsales_backup_$(date +%Y%m%d)/platform.json
```

## Seed Demo Data

```bash
cd ~/sprintsales && node seed-demo.mjs
pm2 restart sprintsales
```

---

## Dashboard Login

| Role   | Email                     | Password       |
|--------|---------------------------|----------------|
| Admin  | admin@sprintsales.net     | ChangeMe123!   |
| Client | demo@sprintsales.net      | demo12345      |

---

## Where to Configure

### 🔑 Telegram Bot Token
1. Login as **Admin** at `http://34.45.196.175:8080`
2. Click **Clients → Demo Retail Shop → Edit**
3. Paste the bot token from BotFather into the **Bot Token** field
4. Click **Save** — the bot starts automatically

### 👤 Owner Chat ID (Telegram)
1. Open Telegram, message `@userinfobot` → get your numeric chat ID
2. Dashboard → **Clients → Demo Retail Shop → Edit**
3. Paste into **Owner Telegram Chat ID** field
4. Enable notifications under **Notifications** section → Save

### 🤖 DeepSeek API Key (for fuzzy matching)
1. Dashboard → **Admin → AI Providers → select Demo Retail Shop**
2. Find **DeepSeek** card → paste your `sk-...` key → **Save**
3. The key is masked after saving (shows `configured`)
4. *Client-level:* Dashboard → **My AI Keys** → DeepSeek → save

### Verify.et Payment Verification Key
Set the verifier key only in the server environment. Never paste it into frontend files or commit it to Git.

```bash
VERIFY_ET_API_KEY=VERIFY_BANK_ET_your_key_here
```

Automatic payment approval is available only for Pro clients that choose **Payment Settings → Automatic verification**. If the transaction reference, amount, or receiver checks are unclear, the system falls back to the existing manual owner review.

### 🚚 Delivery Settings
1. Dashboard → **Clients → Demo Retail Shop → Delivery** card
2. Configure:
   - **Delivery Mode:** `Fixed Addis (free inside, fee outside)`
   - **Addis Delivery Fee:** 300 ETB (default)
   - **Shop Address:** Bole, Addis Ababa
   - **Coordinates:** Optional (lat/lng)
3. Click **Save**

### Demo Products (pre-seeded)
| Name | Code | Price | Sizes | Colors |
|------|------|-------|-------|--------|
| Wireless Bluetooth Earbuds | WH-100 | Br 2,500 | — | Black, White |
| Smart Fitness Watch | SW-200 | Br 4,500 | — | Black, Silver, Blue |
| Premium Phone Case | PC-300 | Br 350 | S, M, L | Red, Blue, Black, Green |

---

## Testing the Bot

1. Open Telegram → start `@mytest11235bot`
2. The bot greets you and shows the catalog
3. Start ordering:
   - "I want the wireless earbuds"
   - "Black color"
   - Send your phone number
   - "Deliver to Bole, Addis Ababa"
4. Try fuzzy features (if DeepSeek key configured):
   - "I want the **slver** one" → matches Silver
   - "Send to **mexco**" → normalizes to Mexico, Addis Ababa
5. Send a Telegram 📍 location pin → stored with order, owner notified
6. Say "deliver to Bahir Dar" → owner gets delivery review notification

---

## Quick Reference

```bash
# Tail logs
pm2 logs sprintsales

# Restart
pm2 restart sprintsales

# Check status
pm2 list
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/

# Re-seed (resets all data)
node seed-demo.mjs && pm2 restart sprintsales

# Run tests
node test-ai-providers.mjs
```
