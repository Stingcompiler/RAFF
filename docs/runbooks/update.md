# التحديث

حدّث **بعد إغلاق ورديات الكاونترات**: التحديث يعيد تشغيل الخدمات لدقيقة أو اثنتين.

```bash
cd /opt/raff
sudo git pull            # أو: sudo infra/update.sh v1.1.0  لإصدار محدد
sudo infra/update.sh
```

ما يحدث:

1. نسخة احتياطية كاملة أولاً — إذا فشلت لا يتغير شيء.
2. حفظ الصور العاملة باسم `rollback`.
3. بناء الإصدار الجديد وتشغيله (تُطبَّق ترحيلات قاعدة البيانات تلقائياً).
4. فحص الصحة. **إذا فشل:** يرجع تلقائياً إلى الإصدار السابق ويستعيد قاعدة البيانات من نسخة الخطوة 1، ثم يخرج برسالة «Rolled back».

الإصدار العامل يظهر في `https://pharmacy.example.com/api/v1/health/` (حقل `version`).

## إذا فشل الرجوع نفسه

نادر. الخطوات:

```bash
docker compose -p raff -f infra/prod/compose.yaml --env-file infra/prod/.env logs --tail 200
sudo infra/restore.sh /var/backups/raff/<آخر نسخة قبل التحديث>.tar.enc --key infra/prod/backup.key
```

ثم راسل المطوّر بالسجل.
