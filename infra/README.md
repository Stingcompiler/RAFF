# البنية التحتية

## الإنتاج (خادم الصيدلية)

| الملف | الغرض |
|---|---|
| `install.sh` | تثبيت على خادم Ubuntu فيه Docker: أسرار، بناء، تشغيل، المؤسسة والفرع والمالك، جدولة النسخ |
| `backup/backup.sh` | نسخة مشفّرة (قاعدة البيانات + الصور) مع نسخة خارجية اختيارية |
| `restore.sh` | استعادة على هذا الخادم أو على خادم بديل نظيف بأمر واحد، و`--verify-latest` لاختبار الاستعادة |
| `update.sh` | تحديث بنسخة احتياطية أولاً ورجوع آلي عند الفشل |
| `prod/compose.yaml` | Postgres + Django (Gunicorn) + Next (standalone) + Caddy (HTTPS تلقائي) |
| `prod/Caddyfile` | توجيه `/api` و`/media` والواجهة، ورؤوس الأمان |
| `prod/.env.example` | المتغيرات؛ الملف الفعلي `.env` يكتبه `install.sh` (خارج Git) |

الأدلة التشغيلية بالتفصيل في `docs/runbooks/` (التثبيت، النسخ والاستعادة، التحديث). يجرّب CI هذه السكربتات كاملة في وظيفة `deploy-drill`.

## التطوير

```bash
make dev    # ينشئ infra/compose/.env بأسرار عشوائية إن لم يوجد، ثم يرفع postgres وbackend وfrontend
make demo   # بيانات العينة: فرعان، كاونترات، والمستخدمون admin/mazin/salma/huda (كلمة المرور RAFF_DEMO_PASSWORD)
make down   # يوقف الحاويات (البيانات تبقى في volume pgdata)
```

بعد `make dev`: الواجهة على http://localhost:3000/ والواجهة البرمجية على http://localhost:8000/api/v1/health/.
