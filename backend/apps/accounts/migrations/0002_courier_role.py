"""The courier role for organizations created before home delivery (D-R0023)."""

from django.db import migrations

PERMS = ["deliveries.handle"]


def add_role(apps, schema_editor):
    Role = apps.get_model("accounts", "Role")
    Organization = apps.get_model("tenancy", "Organization")
    for org in Organization.objects.all():
        Role.objects.get_or_create(
            organization_id=org.pk,
            code="courier",
            defaults={"name_ar": "موظف توصيل", "name_en": "Courier", "permissions": PERMS},
        )


class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial"), ("tenancy", "0002_branch_device")]
    operations = [migrations.RunPython(add_role, migrations.RunPython.noop)]
