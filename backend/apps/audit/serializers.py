from __future__ import annotations

from rest_framework import serializers

from apps.audit.models import AuditEvent


class AuditEventSerializer(serializers.ModelSerializer[AuditEvent]):
    actor_name_ar = serializers.SerializerMethodField()
    actor_name_en = serializers.SerializerMethodField()
    branch_code = serializers.CharField(source="branch.code", allow_null=True, read_only=True)

    class Meta:
        model = AuditEvent
        fields = [
            "id",
            "created_at",
            "action",
            "object_type",
            "object_id",
            "branch_code",
            "actor_name_ar",
            "actor_name_en",
            "data",
        ]

    def get_actor_name_ar(self, obj: AuditEvent) -> str:
        return obj.actor.display_name_ar if obj.actor else ""

    def get_actor_name_en(self, obj: AuditEvent) -> str:
        return obj.actor.display_name_en if obj.actor else ""
