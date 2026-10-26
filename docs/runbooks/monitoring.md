# مراقبة رَفّ على الخادم المشترك

الخادم `ovh-prod` فيه مراقب عام `host-watch` (كل 10 دقائق: الذاكرة المتاحة < 12%، الـswap > 70%، القرص > 85%، حاويات غير سليمة، وحدات فاشلة) ومراقبات لكل مشروع. `host-watch` يكتب في السجل ويرسل إلى Telegram **فقط إن وُضعت** `TELEGRAM_BOT_TOKEN` و`TELEGRAM_CHAT_ID` في `/etc/host-watch.env` (هما فارغتان الآن، فلا يصل شيء إلى هاتفك).

## 1. تفعيل التنبيه إلى Telegram (لمرة واحدة)

أنشئ بوتاً من BotFather وخذ رقم محادثتك، ثم على الخادم:

```bash
sudo nano /etc/host-watch.env   # TELEGRAM_BOT_TOKEN=...  TELEGRAM_CHAT_ID=...
```

لا تلصق الرمز في أي محادثة. يستعمله `host-watch` ومراقب رَفّ أدناه.

## 2. مراقب رَفّ (`infra/monitoring/`)

يفحص كل 5 دقائق: `/api/v1/health/` على العنوان العام، وحاويات `raff-*` (سليمة، وأربع منها شغّالة)، وعمر أحدث نسخة احتياطية (≤ 30 ساعة). يرسل عند التحوّل فقط (فشل ثم تعافٍ) ويكرّر التنبيه كل 6 ساعات إن استمر الفشل.

```bash
cd /opt/raff && sudo git pull --ff-only origin main
sudo install -m 755 infra/monitoring/raff-healthcheck /usr/local/sbin/raff-healthcheck
sudo install -m 644 infra/monitoring/raff-healthcheck.service infra/monitoring/raff-healthcheck.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now raff-healthcheck.timer
sudo /usr/local/sbin/raff-healthcheck; echo "exit $?"      # صامت وخروج 0 إن كان كل شيء سليماً
```

اختبار مسار الفشل دون إرسال: `sudo RAFF_HEALTH_URL=http://127.0.0.1:1/ RAFF_MONITOR_STATE=/tmp/rm RAFF_ALERT_DRY=1 /usr/local/sbin/raff-healthcheck`.

السجل: `journalctl -t raff-healthcheck`. الإيقاف: `sudo systemctl disable --now raff-healthcheck.timer`.
