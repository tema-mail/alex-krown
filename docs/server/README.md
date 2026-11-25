# Заказ без входа (стенд, 25.11.2026)
- API: `guest-orders.ts.txt` → `app/apps/api/src/routes/guest-orders.ts`; регистрация в server.ts, `GUEST_COOKIE` в payments.ts (start и status). Перенести в shop-modules, иначе следующая выкладка API вернёт старое.
- Сайт: `scripts/stand-guest-checkout.py` – правки бандлов Order/OrderPaid на стенде (akfix2) + стиль `#ak-thanks` в checkout и checkout-paid. В Order.tsx / OrderPaid.tsx пока НЕ перенесено.
