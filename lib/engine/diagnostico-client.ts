import "server-only";

import { EngineError } from "@/lib/engine/errors";
import { cnisDiagnosticSchema, type CnisDiagnostic } from "@/lib/engine/schemas";

interface DiagnosticClientConfiguration {
  endpoint: string;
  internalToken: string;
}

export class CnisDiagnosticClient {
  constructor(private readonly configuration: DiagnosticClientConfiguration) {}

  async run(signedCnisUrl: string): Promise<CnisDiagnostic> {
    try {
      const response = await fetch(this.configuration.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cortex-internal-token": this.configuration.internalToken,
        },
        body: JSON.stringify({ arquivo_url: signedCnisUrl }),
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok) {
        const code = response.status === 422 ? "CNIS_INVALIDO" : "PROVEDOR_INDISPONIVEL";
        throw new EngineError(code, "O diagnóstico determinístico do CNIS falhou.", {
          retryable: response.status >= 500,
        });
      }

      return cnisDiagnosticSchema.parse(await response.json());
    } catch (error) {
      if (error instanceof EngineError) {
        throw error;
      }
      throw new EngineError("CNIS_INVALIDO", "Não foi possível interpretar o CNIS.", {
        cause: error,
      });
    }
  }
}
