# تثبيت «رَفّ» على خادم يعمل عليه خادم ويب آخر

للخادم الذي فيه Caddy (أو Nginx) يملك المنفذين 80 و443 ويخدم مواقع أخرى. يبقى كل شيء كما في `install.md` عدا أن وكيل رَفّ الداخلي يستمع على loopback، ويضيف الخادم الأمامي موقعاً يمرّر إليه ويتولى الشهادة.

## 1. التثبيت

```bash
sudo git clone https://github.com/Stingcompiler/RAFF.git /opt/raff && cd /opt/raff
sudo infra/install.sh --behind-proxy raff.example.com --http-port 8400 --https-port 8443 \
  --email owner@example.com --org "صيدلية الشفاء" --branch-code KRT \
  --branch-ar "فرع الخرطوم" --branch-en "Khartoum" --owner admin --owner-ar "المالك" --owner-en "Owner"
```

`--behind-proxy` يكتب في `infra/prod/.env` ما يلزم الخادم المشترك (`SITE_ADDRESS=:80`، `SITE_HOST` و`SITE_ORIGIN` بعنوان https، `RAFF_BIND=127.0.0.1`، المنفذين، و`RAFF_TRUSTED_PROXIES=172.16.0.0/12` أو `--trusted-proxies`)، **ويولّد معها الأسرار ومعرّف المؤسسة**. لا تنسخ `.env.example` يدوياً: `install.sh` و`update.sh` يرفضان بيئة فيها `change-me` أو معرّف مؤسسة فارغ.

- `SITE_ADDRESS=:80`: وكيل رَفّ الداخلي بلا TLS، لأن الخادم الأمامي هو الذي يخدم HTTPS.
- اختر منفذاً حراً (`ss -tln`).
- `RAFF_ROOT=marketing` يجعل `/` صفحة المنتج (رَفّ) ويحوّل متجر الصيدلية إلى `/shop`؛ القيمة الافتراضية `store` تُبقي المتجر في `/`. أضفه إلى `.env` ثم `sudo infra/update.sh origin/main`.

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
