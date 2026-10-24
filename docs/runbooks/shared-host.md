# تثبيت «رَفّ» على خادم يعمل عليه خادم ويب آخر

للخادم الذي فيه Caddy (أو Nginx) يملك المنفذين 80 و443 ويخدم مواقع أخرى. يبقى كل شيء كما في `install.md` عدا أن وكيل رَفّ الداخلي يستمع على loopback، ويضيف الخادم الأمامي موقعاً يمرّر إليه ويتولى الشهادة.

## 1. التثبيت

```bash
sudo git clone https://github.com/Stingcompiler/RAFF.git /opt/raff && cd /opt/raff
sudo mkdir -p infra/prod && sudo install -m 600 infra/prod/.env.example infra/prod/.env
```

عدّل `infra/prod/.env` قبل التشغيل (أو أنشئه بـ`install.sh` ثم عدّل وأعد تشغيل `docker compose up -d`):

```
SITE_ADDRESS=:80
SITE_HOST=raff.example.com
SITE_ORIGIN=https://raff.example.com
RAFF_BIND=127.0.0.1
RAFF_HTTP_PORT=8400
RAFF_HTTPS_PORT=8443
RAFF_TRUSTED_PROXIES=172.16.0.0/12
```

- `SITE_ADDRESS=:80`: وكيل رَفّ الداخلي بلا TLS، لأن الخادم الأمامي هو الذي يخدم HTTPS.
- `SITE_ORIGIN` و`SITE_HOST` بعنوان الموقع العام (https) حتى تعمل ملفات تعريف الارتباط الآمنة وCSRF.
- اختر منفذاً حراً (`ss -tln`).

ثم `sudo infra/install.sh --domain raff.example.com ...` كما في `install.md`؛ يحافظ `.env` الموجود على القيم أعلاه.

## 2. الخادم الأمامي (Caddy)

```
raff.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8400
}
```

انسخ الملف الحالي أولاً، ثم `caddy validate --config /etc/caddy/Caddyfile` ثم `systemctl reload caddy`. تأكد أن سجل DNS للنطاق يشير إلى الخادم قبل الإعادة لتصدر الشهادة.

## 3. التحقق

```bash
curl -fsS https://raff.example.com/api/v1/health/
```
