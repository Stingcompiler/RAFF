"""Drop and recreate a throwaway test database (raff_e2e / raff_visual only)."""

from __future__ import annotations

import re
from typing import Any

import psycopg
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser
from psycopg import sql

ALLOWED = re.compile(r"^raff_(e2e|visual)$")


class Command(BaseCommand):
    help = "Recreate an empty raff_e2e or raff_visual database for browser tests."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--name", required=True)

    def handle(self, *args: Any, **options: Any) -> None:
        name = options["name"]
        if not ALLOWED.match(name):
            raise CommandError("Only raff_e2e or raff_visual can be reset")
        db = settings.DATABASES["default"]
        with psycopg.connect(
            dbname="postgres",
            user=str(db["USER"]),
            password=str(db["PASSWORD"]),
            host=str(db["HOST"]),
            port=str(db["PORT"]),
            autocommit=True,
        ) as conn:
            conn.execute(
                sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(name))
            )
            conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
        self.stdout.write(f"{name} recreated")
