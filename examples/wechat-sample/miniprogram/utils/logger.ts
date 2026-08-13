// ============================================================
// Shared logger with timestamp formatting
// ============================================================

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

function timestamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function logLifecycle(
  pageName: string,
  event: string,
  options?: Record<string, string | undefined>,
): void {
  if (options !== undefined) {
    console.log(`[${timestamp()}][${pageName}] ${event}`, options);
  } else {
    console.log(`[${timestamp()}][${pageName}] ${event}`);
  }
}
