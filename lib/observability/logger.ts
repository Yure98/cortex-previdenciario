import "server-only";

export type SafeLogContext = {
  event: string;
  route?: string;
  request_id?: string;
  caso_id?: string;
  escritorio_id?: string;
  geracao_id?: string;
  entrega_id?: string;
  code?: string;
  status?: number;
  duration_ms?: number;
  result?: string;
  provider_event_type?: string;
  cost_usd?: number;
  spend_ratio?: number;
  retry_after_seconds?: number;
  error_type?: string;
};

function write(level: "info" | "warn" | "error", context: SafeLogContext): void {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    service: "cortex-previdenciario",
    ...context,
  };
  const output = JSON.stringify(record);
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.info(output);
}

export const logInfo = (context: SafeLogContext) => write("info", context);
export const logWarn = (context: SafeLogContext) => write("warn", context);
export const logError = (context: SafeLogContext) => write("error", context);
