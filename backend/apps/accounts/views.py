# Views authorize and delegate to services/.
from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.drf import requires
from apps.accounts.models import Role, User
from apps.accounts.serializers import (
    BranchSerializer,
    ContextSerializer,
    DeviceInfoSerializer,
    DeviceSerializer,
    LoginSerializer,
    MeSerializer,
    RoleSerializer,
    UserCreateSerializer,
    UserSerializer,
    UserUpdateSerializer,
)
from apps.accounts.services import session, users
from apps.tenancy.models import Branch, Device
from apps.tenancy.services.devices import device_for_token


def me_payload(request: Request, user: User) -> dict[str, Any]:
    ctx = session.current_context(request._request, user)
    role = user.primary_role(ctx.branch)
    branches = user.branches()
    return {
        "user": {
            "id": str(user.pk),
            "username": user.username,
            "display_name_ar": user.display_name_ar,
            "display_name_en": user.display_name_en,
        },
        "role": RoleSerializer(role).data if role else None,
        "counters": DeviceSerializer(
            Device.objects.filter(branch__in=branches, is_active=True), many=True
        ).data,
        "permissions": sorted(user.permissions_for(ctx.branch)),
        "branch": BranchSerializer(ctx.branch).data if ctx.branch else None,
        "device": DeviceSerializer(ctx.device).data if ctx.device else None,
        "branches": BranchSerializer(branches, many=True).data,
    }


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    """Sets the csrftoken cookie; call before the first state-changing request."""

    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(operation_id="auth_csrf", responses={204: None})
    def get(self, request: Request) -> Response:
        return Response(status=status.HTTP_204_NO_CONTENT)


class DeviceInfoView(APIView):
    """Which counter this browser is registered as (from the HttpOnly device cookie)."""

    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(operation_id="auth_device", responses=DeviceInfoSerializer)
    def get(self, request: Request) -> Response:
        device = device_for_token(request.COOKIES.get(settings.DEVICE_COOKIE_NAME))
        return Response(
            {
                "registered": device is not None,
                "device": DeviceSerializer(device).data if device else None,
                "branch": BranchSerializer(device.branch).data if device else None,
            }
        )


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(operation_id="auth_login", request=LoginSerializer, responses=MeSerializer)
    def post(self, request: Request) -> Response:
        data = LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            user = session.sign_in(request._request, **data.validated_data)
        except session.InvalidCredentials:
            raise ValidationError({"detail": "invalid_credentials"}) from None
        session.default_context(
            request._request,
            user,
            device_for_token(request.COOKIES.get(settings.DEVICE_COOKIE_NAME)),
        )
        return Response(me_payload(request, user))


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(operation_id="auth_logout", request=None, responses={204: None})
    def post(self, request: Request) -> Response:
        session.sign_out(request._request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(operation_id="auth_me", responses=MeSerializer)
    def get(self, request: Request) -> Response:
        assert isinstance(request.user, User)
        return Response(me_payload(request, request.user))


class ContextView(APIView):
    """Choose the branch and counter this session works in."""

    permission_classes = [IsAuthenticated]

    @extend_schema(operation_id="auth_context", request=ContextSerializer, responses=MeSerializer)
    def post(self, request: Request) -> Response:
        assert isinstance(request.user, User)
        data = ContextSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            session.choose_context(
                request._request,
                request.user,
                data.validated_data["branch_id"],
                data.validated_data.get("device_id"),
            )
        except session.ContextNotAllowed as exc:
            raise PermissionDenied(f"not_allowed_{exc}") from None
        return Response(me_payload(request, request.user))


class BranchListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(operation_id="branches_list", responses=BranchSerializer(many=True))
    def get(self, request: Request) -> Response:
        return Response(BranchSerializer(Branch.objects.filter(is_active=True), many=True).data)


class BranchDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(operation_id="branches_retrieve", responses=BranchSerializer)
    def get(self, request: Request, pk: str) -> Response:
        branch = Branch.objects.filter(pk=pk).first()  # other organizations: 404, never 403
        if branch is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(BranchSerializer(branch).data)


class RoleListView(APIView):
    permission_classes = [requires("users.manage")]

    @extend_schema(operation_id="roles_list", responses=RoleSerializer(many=True))
    def get(self, request: Request) -> Response:
        return Response(RoleSerializer(Role.objects.all(), many=True).data)


def _pairs(items: list[dict[str, Any]]) -> list[tuple[Any, Any]]:
    return [(a["role_id"], a.get("branch_id")) for a in items]


class UserListView(APIView):
    permission_classes = [requires("users.manage")]

    @extend_schema(operation_id="users_list", responses=UserSerializer(many=True))
    def get(self, request: Request) -> Response:
        qs = User.objects.prefetch_related("role_assignments__role")
        return Response(UserSerializer(qs, many=True).data)

    @extend_schema(
        operation_id="users_create", request=UserCreateSerializer, responses={201: UserSerializer}
    )
    def post(self, request: Request) -> Response:
        data = UserCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        try:
            user = users.create_user(
                username=v["username"],
                password=v["password"],
                display_name_ar=v["display_name_ar"],
                display_name_en=v["display_name_en"],
                assignments=_pairs(v["assignments"]),
            )
        except users.UserError as exc:
            raise ValidationError({"detail": exc.code}) from None
        except DjangoValidationError as exc:
            raise ValidationError({"password": exc.messages}) from None
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class UserDetailView(APIView):
    permission_classes = [requires("users.manage")]

    @extend_schema(
        operation_id="users_update", request=UserUpdateSerializer, responses=UserSerializer
    )
    def patch(self, request: Request, pk: str) -> Response:
        user = User.objects.filter(pk=pk).first()
        if user is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        assert isinstance(request.user, User)
        data = UserUpdateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        try:
            if "is_active" in v:
                users.set_active(user, v["is_active"], acting=request.user)
            if "assignments" in v:
                users.set_assignments(user, _pairs(v["assignments"]))
            if "password" in v:
                users.set_password(user, v["password"])
        except users.UserError as exc:
            raise ValidationError({"detail": exc.code}) from None
        except DjangoValidationError as exc:
            raise ValidationError({"password": exc.messages}) from None
        return Response(UserSerializer(user).data)
