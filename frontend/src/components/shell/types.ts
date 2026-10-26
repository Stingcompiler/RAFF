import type { ConnectionStatus } from "@/components/ui/ConnectionIndicator";

/** What the shell shows around every workspace screen. */
export type ShellContext = {
  /** e.g. "Khartoum branch" */
  branchLine: string;
  connection: { status: ConnectionStatus; text: string };
  user: { name: string; role: string | null; username: string; initial: string };
  /** "Device registered as: …" */
  deviceLine: string;
  /** Count badges on nav items (new store orders). */
  badges?: Partial<Record<import("./nav").NavKey, number>>;
};
