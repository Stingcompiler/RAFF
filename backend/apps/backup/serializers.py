from __future__ import annotations

from typing import Any

from rest_framework import serializers


class BackupRunSerializer(serializers.Serializer[Any]):
    at = serializers.DateTimeField()
    file = serializers.CharField()
    size_bytes = serializers.IntegerField()
    offsite = serializers.BooleanField()
    detail = serializers.CharField()


class BackupStatusSerializer(serializers.Serializer[Any]):
    last_ok = BackupRunSerializer(allow_null=True)
    last_failed = BackupRunSerializer(allow_null=True)
    last_restore_test = BackupRunSerializer(allow_null=True)
    failing = serializers.BooleanField()
    last_offsite_ok = BackupRunSerializer(allow_null=True)
    last_offsite_failed = BackupRunSerializer(allow_null=True)
    offsite_failing = serializers.BooleanField()
