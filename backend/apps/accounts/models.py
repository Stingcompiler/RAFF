from __future__ import annotations

import uuid
from typing import Any, ClassVar

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.postgres.fields import ArrayField
from django.db import models

from apps.tenancy.models import Branch, OrgScopedModel
from apps.tenancy.querysets import OrgScopedQuerySet

from .permissions import ALL


class UserManager(BaseUserManager["User"]):
    """Org-scoped user manager (reads filtered to the organization in context)."""

    def get_queryset(self) -> OrgScopedQuerySet[User]:
        return OrgScopedQuerySet(self.model, using=self._db).for_current_org()

    def create_user(self, username: str, password: str | None, **fields: Any) -> User:
        if "organization" in fields or "organization_id" in fields:
            raise ValueError("organization comes from OrgContext, not from caller data")
        user = self.model(username=username.strip().lower(), **fields)
        user.set_password(password)
        user.save(using=self._db)
        return user


class User(AbstractBaseUser, OrgScopedModel):
    """A person who signs in. Usernames are unique within the organization."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = models.CharField(max_length=60)
    display_name_ar = models.CharField(max_length=120)
    display_name_en = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects: ClassVar[UserManager] = UserManager()  # type: ignore[assignment]

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS: ClassVar[list[str]] = ["display_name_ar", "display_name_en"]

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "username"], name="username_per_org"),
        ]
        ordering = ["username"]

    def __str__(self) -> str:
        return self.username

    def permissions_for(self, branch: Branch | None) -> frozenset[str]:
        """Permission codes from roles granted org-wide or for this branch."""
        codes: set[str] = set()
        for assignment in self.role_assignments.select_related("role"):
            if assignment.branch_id is None or (branch and assignment.branch_id == branch.id):
                codes.update(assignment.role.permissions)
        return frozenset(codes & ALL)

    def primary_role(self, branch: Branch | None) -> Role | None:
        """The role shown next to the user's name: branch role first, else org-wide."""
        assignments = list(self.role_assignments.select_related("role"))
        for a in assignments:
            if branch is not None and a.branch_id == branch.id:
                return a.role
        for a in assignments:
            if a.branch_id is None:
                return a.role
        return None

    def branches(self) -> models.QuerySet[Branch]:
        """Branches this user may work in (org-wide roles grant all branches)."""
        qs: models.QuerySet[Branch] = Branch.objects.filter(is_active=True)
        if self.role_assignments.filter(branch__isnull=True).exists():
            return qs
        return qs.filter(role_assignments__user=self).distinct()


class Role(OrgScopedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=40)
    name_ar = models.CharField(max_length=80)
    name_en = models.CharField(max_length=80)
    permissions = ArrayField(models.CharField(max_length=40), default=list)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "code"], name="role_code_per_org"),
        ]
        ordering = ["code"]

    def __str__(self) -> str:
        return self.code


class RoleAssignment(OrgScopedModel):
    """A role for a user, either org-wide (branch empty) or for one branch."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="role_assignments")
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name="assignments")
    branch = models.ForeignKey(
        Branch, null=True, blank=True, on_delete=models.CASCADE, related_name="role_assignments"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "user", "role", "branch"],
                name="role_assignment_unique",
                nulls_distinct=False,
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.role_id}"
