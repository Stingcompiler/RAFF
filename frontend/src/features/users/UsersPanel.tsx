"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { BadgeCell, TableHead, TableRow, TextCell, type Column } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { apiSend } from "@/lib/api/browser";
import type { Branch, Role, User } from "@/lib/api/types";

type Props = { users: User[]; roles: Role[]; branches: Branch[]; meId: string };

const ERRORS: Record<string, "usernameTaken" | "cannotDeactivateSelf"> = {
  username_taken: "usernameTaken",
  cannot_deactivate_self: "cannotDeactivateSelf",
};

/** Users & roles (Settings › 7.11). */
export function UsersPanel({ users, roles, branches, meId }: Props) {
  const t = useTranslations("users");
  const ar = useLocale() === "ar";
  const router = useRouter();
  const toast = useToast();
  const pick = (o: { name_ar: string; name_en: string }) => (ar ? o.name_ar : o.name_en);
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const branchById = new Map(branches.map((b) => [b.id, b]));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columns: Column[] = [
    { header: t("user"), width: "1fr" },
    { header: t("role"), width: "120px" },
    { header: t("branch"), width: "140px" },
    { header: t("status"), width: "100px" },
    { header: t("actions"), width: "110px" },
  ];

  function message(err: Record<string, unknown> | null) {
    const code = typeof err?.detail === "string" ? err.detail : null;
    const key = code ? ERRORS[code] : undefined;
    if (key) return t(key);
    if (err && "password" in err) return t("weakPassword");
    return t("failed");
  }

  async function toggle(user: User) {
    const res = await apiSend<User>("PATCH", `/users/${user.id}/`, { is_active: !user.is_active });
    if (!res.ok) toast.push("danger", message(res.error));
    router.refresh();
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const branch = String(form.get("branch") ?? "");
    setBusy(true);
    setError(null);
    const res = await apiSend<User>("POST", "/users/", {
      username: form.get("username"),
      password: form.get("password"),
      display_name_ar: form.get("name_ar"),
      display_name_en: form.get("name_en"),
      assignments: [{ role_id: form.get("role"), branch_id: branch || null }],
    });
    setBusy(false);
    if (!res.ok) {
      setError(message(res.error));
      return;
    }
    setOpen(false);
    toast.push("success", t("created"));
    router.refresh();
  }

  return (
    <>
      <Panel
        title={t("title")}
        note={
          <Button variant="outline" onClick={() => setOpen(true)}>
            {t("newUser")}
          </Button>
        }
      >
        <div role="table" aria-label={t("title")}>
          <TableHead columns={columns} />
          {users.map((u) => {
            const assignment = u.roles[0];
            const role = assignment ? roleById.get(String(assignment.role_id)) : undefined;
            const branch = assignment?.branch_id
              ? branchById.get(String(assignment.branch_id))
              : undefined;
            return (
              <TableRow key={u.id} columns={columns}>
                <TextCell>{ar ? u.display_name_ar : u.display_name_en}</TextCell>
                <TextCell>{role ? pick(role) : ""}</TextCell>
                <TextCell>{branch ? pick(branch) : t("allBranches")}</TextCell>
                <BadgeCell tone={u.is_active ? "success" : "danger"}>
                  {u.is_active ? t("active") : t("inactive")}
                </BadgeCell>
                <span role="cell">
                  {u.id !== meId && (
                    <Button variant="quiet" className="h-[32px] px-[8px]" onClick={() => toggle(u)}>
                      {u.is_active ? t("deactivate") : t("activate")}
                    </Button>
                  )}
                </span>
              </TableRow>
            );
          })}
        </div>
      </Panel>
      <Dialog
        open={open}
        onClose={busy ? undefined : () => setOpen(false)}
        labelledBy="new-user-title"
      >
        <form onSubmit={create} className="grid gap-[12px]">
          <div id="new-user-title" className="text-lead font-medium">
            {t("newUser")}
          </div>
          <Field label={t("username")}>
            {({ id }) => (
              <TextInput
                className="num"
                id={id}
                name="username"
                dir="ltr"
                required
                autoComplete="off"
              />
            )}
          </Field>
          <Field label={t("password")} help={t("passwordHelp")}>
            {({ id, describedBy }) => (
              <TextInput
                className="num"
                id={id}
                name="password"
                type="password"
                dir="ltr"
                required
                minLength={8}
                autoComplete="new-password"
                aria-describedby={describedBy}
              />
            )}
          </Field>
          <Field label={t("nameAr")}>
            {({ id }) => <TextInput id={id} name="name_ar" dir="rtl" required />}
          </Field>
          <Field label={t("nameEn")}>
            {({ id }) => <TextInput className="num" id={id} name="name_en" dir="ltr" required />}
          </Field>
          <Field label={t("role")}>
            {({ id }) => (
              <Select id={id} name="role" required>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {pick(r)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("branch")}>
            {({ id }) => (
              <Select id={id} name="branch">
                <option value="">{t("allBranches")}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {pick(b)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {error && (
            <div role="alert" className="text-label font-medium text-danger-text">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-[8px]">
            <Button variant="outline" size="lg" disabled={busy} onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? t("creating") : t("create")}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
