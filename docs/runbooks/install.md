# تثبيت «رَفّ» على خادم الصيدلية

دليل لفني يثبّت النظام على خادم Ubuntu (22.04 أو 24.04). كل الأوامر من مجلد المستودع على الخادم.

## 1. المتطلبات

- خادم بذاكرة 4GB على الأقل وقرص 40GB، ومنفذا 80 و443 مفتوحان.
- نطاق (domain) يشير إلى عنوان الخادم إذا أردت HTTPS (مثل `pharmacy.example.com`).
- Docker وDocker Compose v2. ثبّتهما من الدليل الرسمي: <https://docs.docker.com/engine/install/ubuntu/>، ثم تحقق:

```bash
docker compose version
```

## 2. نسخ المستودع

```bash
sudo git clone https://github.com/Stingcompiler/RAFF.git /opt/raff
cd /opt/raff
```

## 3. التثبيت

```bash
sudo RAFF_OWNER_PASSWORD='كلمة-مرور-قوية' infra/install.sh \
  --domain pharmacy.example.com --email owner@example.com \
  --org "صيدلية الشفاء" \
  --branch-code KRT --branch-ar "فرع الخرطوم" --branch-en "Khartoum" \
  --owner admin --owner-ar "المالك" --owner-en "Owner"
```

- بدون `RAFF_OWNER_PASSWORD` تُولَّد كلمة مرور وتُطبع **مرة واحدة**؛ غيّرها بعد الدخول.
- لترخيص موقَّع أضف `--license /path/LICENSE.json`.
- للتجربة على جهاز اختبار بلا نطاق استعمل `--http` بدل `--domain`.

يكتب البرنامج `infra/prod/.env` (أسرار عشوائية) و`infra/prod/backup.key` (مفتاح تشفير النسخ)، ويبني الصور ويشغّلها، وينشئ المؤسسة والفرع والمالك، ويجدول النسخ الليلي واختبار الاستعادة الأسبوعي في `/etc/cron.d/raff`.

> **مهم:** انسخ `infra/prod/backup.key` إلى مكان آمن **خارج الخادم** (USB أو مدير كلمات مرور). بدونه لا يمكن استعادة أي نسخة.

## 4. بعد التثبيت

1. افتح `https://pharmacy.example.com/login` وادخل بحساب المالك.
2. الإعدادات › المستخدمون: أضف الكاشير والصيدلي.
3. الإعدادات › الكاونترات: سجّل كل جهاز كاونتر من متصفحه («تسجيل هذا الجهاز»).
4. الأصناف › استيراد: حمّل ملف الأصناف، ثم استلم أول فاتورة مشتريات.

## 5. التحقق

```bash
curl -fsS https://pharmacy.example.com/api/v1/health/
```

يجب أن يعيد `"status": "ok"` ورقم الإصدار. سجلات الخدمات:

```bash
docker compose -p raff -f infra/prod/compose.yaml --env-file infra/prod/.env logs --tail 100
```

إعادة تشغيل `install.sh` آمنة: لا تغيّر الأسرار ولا البيانات ولا المستخدمين الموجودين.
