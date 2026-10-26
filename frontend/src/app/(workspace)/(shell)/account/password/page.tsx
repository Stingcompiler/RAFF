import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/shell/PageHeader";
import { ChangePasswordForm } from "@/features/account/ChangePasswordForm";
import { requireMe } from "@/lib/session";

/** Change your own password (the owner resets other people's in Settings › Users). */
export default async function ChangePasswordPage() {
  const t = await getTranslations("account");
  await requireMe();
  return (
    <>
      <PageHeader title={t("title")} />
      <ChangePasswordForm />
    </>
  );
}
