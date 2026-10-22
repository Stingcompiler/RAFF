# Serializers validate shape only; business logic lives in services/.
from __future__ import annotations

from rest_framework import serializers


class DeviceCreateSerializer(serializers.Serializer[None]):
    branch_id = serializers.UUIDField()
    name_ar = serializers.CharField(max_length=80)
    name_en = serializers.CharField(max_length=80)
