# البنية التحتية

```bash
make dev    # ينشئ infra/compose/.env بأسرار عشوائية إن لم يوجد، ثم يرفع postgres وbackend وfrontend وينتظر جاهزيتها
make down   # يوقف الحاويات (البيانات تبقى في volume pgdata)
```

بعد `make dev`: الواجهة على http://localhost:3000/ والواجهة البرمجية على http://localhost:8000/api/v1/health/، والمنافذ مربوطة على `127.0.0.1` فقط.

- `compose/compose.yaml`: بيئة التطوير، بصور مثبتة الإصدار وفحوص جاهزية ومجلدات بيانات.
- `compose/.env.example`: قائمة المتغيرات. الملف الفعلي `.env` خارج Git.
- `caddy/` و`backup/` و`install.sh` و`restore.sh` و`update.sh`: تُبنى في WO-10.
