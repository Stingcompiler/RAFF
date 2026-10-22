# Models exempt from `organization_id`

`tests/test_tenancy_guard.py` reads this file. Every installed model must either
carry an indexed `organization` FK (included in every UNIQUE constraint) or be
listed below as `` `app_label.ModelName` `` with a reason. Nothing else grants an
exemption.

| Model | Reason |
|---|---|
| `tenancy.Organization` | It is the tenant itself. |
| `contenttypes.ContentType` | Django framework metadata, global by design. |
| `auth.Permission` | Django framework metadata, global by design. |
| `auth.Group` | Django default; unused. Roles arrive org-scoped in `accounts` (WO-02). |
| `auth.User` | Django default; replaced by an org-scoped `accounts.User` in WO-02. |
| `sessions.Session` | Framework session store; rows are keyed by random session key and hold no business data. |
