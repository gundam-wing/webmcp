export type LogSource = "tool" | "page";

export type LogEntry = {
  id: number;
  at: string;
  source: LogSource;
  label: string;
  detail: string;
  ok: boolean;
};

export function appendLog(
  entries: readonly LogEntry[],
  entry: Omit<LogEntry, "id">,
): LogEntry[] {
  const id = (entries.at(-1)?.id ?? 0) + 1;
  return [...entries, { ...entry, id }];
}
