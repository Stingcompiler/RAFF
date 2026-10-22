import { LoginScreen } from "@/features/auth/LoginScreen";
import { serverGet } from "@/lib/api/server";
import type { DeviceInfo, Me } from "@/lib/api/types";

export const dynamic = "force-dynamic";

/** Only same-site paths are allowed as the post-login destination. */
function safeNext(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : undefined);
  const [device, me] = await Promise.all([
    serverGet<DeviceInfo>("/auth/device/"),
    serverGet<Me>("/auth/me/"),
  ]);
  return <LoginScreen device={device} initialMe={me} next={next} />;
}
