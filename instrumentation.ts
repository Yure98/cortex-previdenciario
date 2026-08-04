import type { Instrumentation } from "next";

import { logError } from "@/lib/observability/logger";

export function register(): void {
  // Hook estável do Next.js 15. O provedor externo é configurado na Vercel sem alterar o contrato.
}

export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
  const errorRecord = error instanceof Error ? error : new Error("Unknown server error");
  const digest =
    typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : undefined;

  logError({
    event: "unhandled_server_error",
    route: context.routePath,
    code: digest || "UNHANDLED",
    error_type: errorRecord.name,
    status: 500,
  });
};
