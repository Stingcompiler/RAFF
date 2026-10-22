import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/PageHeader";
import { UsersPanel } from "@/features/users/UsersPanel";
import { serverGet } from "@/lib/api/server";
import type { Branch, Role, User } from "@/lib/api/types";
import { requireMe } from "@/lib/session";

export default async function SettingsPage() {
  const t = await getTranslations();
  const me = await requireMe();
  const canManage = me.permissions.includes("users.manage");
  const [users, roles, branches] = canManage
    ? await Promise.all([
        serverGet<User[]>("/users/"),
        serverGet<Role[]>("/roles/"),
        serverGet<Branch[]>("/branches/"),
      ])
    : [null, null, null];
  return (
    <>
      <PageHeader title={t("nav.settings")} />
      {users && roles && branches ? (
        <UsersPanel users={users} roles={roles} branches={branches} meId={me.user.id} />
      ) : (
        <p className="m-0 text-muted">{t("users.noAccess")}</p>
      )}
    </>
  );
}
