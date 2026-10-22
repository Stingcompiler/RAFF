# الخلفية (Django + DRF)

```bash
uv sync                                   # من هذا المجلد
export POSTGRES_PASSWORD=… DJANGO_SECRET_KEY=…   # أو شغّل `make dev` من الجذر ليُنشأ infra/compose/.env
uv run python manage.py migrate
uv run python manage.py runserver         # http://localhost:8000/api/v1/health/
uv run pytest                             # على PostgreSQL حقيقي (POSTGRES_HOST/PORT/DB/USER/PASSWORD)
uv run ruff check . && uv run mypy .
uv run python manage.py spectacular --file openapi/schema.yaml --validate   # أو `make openapi`
```

- الإعدادات في `config/settings/{base,dev,test,prod}.py`، والأسرار من متغيرات البيئة فقط.
- `apps/tenancy`: `Organization`، و`OrgContextMiddleware` (يقرأ `SINGLE_ORG_ID`)، و`OrgScopedModel` و`OrgScopedQuerySet`، و`EXEMPT.md`. `tests/test_tenancy_guard.py` يُفشل البناء عند أي نموذج بلا `organization_id`.
- المؤسسة والمستخدم الأول: `create_organization --name …` يطبع المعرّف لـ`SINGLE_ORG_ID`، ثم `RAFF_OWNER_PASSWORD=… create_owner --username … --name-ar … --name-en …`. بيانات العينة للتطوير فقط: `RAFF_DEMO_PASSWORD=… seed_demo`.
- الترخيص: `LICENSE.json` موقّع بـEd25519 (المسار `RAFF_LICENSE_FILE`، والمفتاح العام `RAFF_LICENSE_PUBLIC_KEY`). يُقرأ عند الإقلاع ويُعرض في الإعدادات، ولا يوقف البيع أبداً.
