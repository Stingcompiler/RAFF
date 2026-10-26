# Serializers validate shape only; business logic lives in services/.
from __future__ import annotations

from rest_framework import serializers

from apps.accounts.models import Role, User
from apps.tenancy.models import Branch, Device


class LoginSerializer(serializers.Serializer[None]):
    username = serializers.CharField(max_length=60)
    password = serializers.CharField(max_length=200, trim_whitespace=False)


class ContextSerializer(serializers.Serializer[None]):
    branch_id = serializers.UUIDField()
    device_id = serializers.UUIDField(required=False, allow_null=True)


class BranchSerializer(serializers.ModelSerializer[Branch]):
    class Meta:
        model = Branch
        fields = ["id", "code", "name_ar", "name_en", "city_ar", "city_en", "receipt_locale"]


class DeviceSerializer(serializers.ModelSerializer[Device]):
    class Meta:
        model = Device
        fields = ["id", "branch", "name_ar", "name_en", "registered_at", "is_active"]
        read_only_fields = ["registered_at", "is_active"]


class RoleSerializer(serializers.ModelSerializer[Role]):
    class Meta:
        model = Role
        fields = ["id", "code", "name_ar", "name_en", "permissions"]


class AssignmentSerializer(serializers.Serializer[None]):
    role_id = serializers.UUIDField()
    branch_id = serializers.UUIDField(allow_null=True, required=False)


class UserSerializer(serializers.ModelSerializer[User]):
    roles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "display_name_ar", "display_name_en", "is_active", "roles"]

    def get_roles(self, user: User) -> list[dict[str, str | None]]:
        return [
            {
                "role_id": str(a.role_id),
                "role_code": a.role.code,
                "branch_id": str(a.branch_id) if a.branch_id else None,
            }
            for a in user.role_assignments.select_related("role")
        ]


class UserCreateSerializer(serializers.Serializer[None]):
    username = serializers.RegexField(r"^[a-zA-Z0-9._-]{3,60}$")
    password = serializers.CharField(min_length=8, max_length=200, trim_whitespace=False)
    display_name_ar = serializers.CharField(max_length=120)
    display_name_en = serializers.CharField(max_length=120)
    assignments = AssignmentSerializer(many=True)


class UserUpdateSerializer(serializers.Serializer[None]):
    is_active = serializers.BooleanField(required=False)
    assignments = AssignmentSerializer(many=True, required=False)
    password = serializers.CharField(
        min_length=8, max_length=200, trim_whitespace=False, required=False
    )


class PasswordChangeSerializer(serializers.Serializer[None]):
    current_password = serializers.CharField(max_length=200, trim_whitespace=False)
    new_password = serializers.CharField(min_length=8, max_length=200, trim_whitespace=False)


class PasswordResetSerializer(serializers.Serializer[None]):
    """Leave `password` out to get a generated temporary one."""

    password = serializers.CharField(
        min_length=8, max_length=200, trim_whitespace=False, required=False
    )


class PasswordResetResultSerializer(serializers.Serializer[None]):
    # Only a generated password is returned (once); a typed one is never echoed.
    password = serializers.CharField(allow_null=True)
    generated = serializers.BooleanField()


class MeUserSerializer(serializers.Serializer[None]):
    id = serializers.UUIDField()
    username = serializers.CharField()
    display_name_ar = serializers.CharField()
    display_name_en = serializers.CharField()


class MeSerializer(serializers.Serializer[None]):
    user = MeUserSerializer()
    role = RoleSerializer(allow_null=True)
    counters = DeviceSerializer(many=True)
    permissions = serializers.ListField(child=serializers.CharField())
    branch = BranchSerializer(allow_null=True)
    device = DeviceSerializer(allow_null=True)
    branches = BranchSerializer(many=True)


class DeviceInfoSerializer(serializers.Serializer[None]):
    registered = serializers.BooleanField()
    device = DeviceSerializer(allow_null=True)
    branch = BranchSerializer(allow_null=True)
