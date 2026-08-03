export type EngineErrorCode =
  | "NAO_AUTENTICADO"
  | "ACESSO_NEGADO"
  | "REQUISICAO_INVALIDA"
  | "CASO_NAO_ENCONTRADO"
  | "CNIS_NAO_ENCONTRADO"
  | "CNIS_INVALIDO"
  | "DADOS_INSUFICIENTES"
  | "INADIMPLENTE"
  | "EXCEDENTE_NAO_PAGO"
  | "TETO_ATINGIDO"
  | "RAG_SEM_TESES_ATIVAS"
  | "PROVEDOR_INDISPONIVEL"
  | "RESPOSTA_MODELO_INVALIDA"
  | "CONFLITO_GERACAO"
  | "ERRO_INTERNO";

const httpStatusByCode: Record<EngineErrorCode, number> = {
  NAO_AUTENTICADO: 401,
  ACESSO_NEGADO: 403,
  REQUISICAO_INVALIDA: 400,
  CASO_NAO_ENCONTRADO: 404,
  CNIS_NAO_ENCONTRADO: 422,
  CNIS_INVALIDO: 422,
  DADOS_INSUFICIENTES: 422,
  INADIMPLENTE: 402,
  EXCEDENTE_NAO_PAGO: 402,
  TETO_ATINGIDO: 429,
  RAG_SEM_TESES_ATIVAS: 409,
  PROVEDOR_INDISPONIVEL: 503,
  RESPOSTA_MODELO_INVALIDA: 502,
  CONFLITO_GERACAO: 409,
  ERRO_INTERNO: 500,
};

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: EngineErrorCode, message: string, options?: { retryable?: boolean; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "EngineError";
    this.code = code;
    this.status = httpStatusByCode[code];
    this.retryable = options?.retryable ?? false;
  }
}

export function normalizeEngineError(error: unknown): EngineError {
  if (error instanceof EngineError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("TETO_ATINGIDO")) {
    return new EngineError("TETO_ATINGIDO", "O teto de gasto foi atingido.", { cause: error });
  }
  if (message.includes("EXCEDENTE_NAO_PAGO")) {
    return new EngineError(
      "EXCEDENTE_NAO_PAGO",
      "A franquia terminou e não há peça excedente paga disponível.",
      { cause: error },
    );
  }
  if (message.includes("INADIMPLENTE")) {
    return new EngineError("INADIMPLENTE", "A geração está bloqueada por inadimplência.", {
      cause: error,
    });
  }
  if (message.includes("CASO_NAO_ENCONTRADO")) {
    return new EngineError("CASO_NAO_ENCONTRADO", "Caso não encontrado.", { cause: error });
  }
  if (message.includes("duplicate key") || message.includes("geracoes_request_id_key")) {
    return new EngineError("CONFLITO_GERACAO", "Já existe uma geração com esta chave.", {
      cause: error,
    });
  }

  return new EngineError("ERRO_INTERNO", "Não foi possível concluir a geração.", {
    cause: error,
  });
}
