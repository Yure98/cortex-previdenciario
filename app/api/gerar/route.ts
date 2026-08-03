import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { TrackedAnthropicClient } from "@/lib/engine/anthropic";
import { CnisDiagnosticClient } from "@/lib/engine/diagnostico-client";
import { EngineError, normalizeEngineError } from "@/lib/engine/errors";
import { runGenerationPipeline } from "@/lib/engine/pipeline";
import { ThesisRagService } from "@/lib/engine/rag";
import { EngineRepository, type ExistingGeneration } from "@/lib/engine/repository";
import { generationRequestSchema } from "@/lib/engine/schemas";
import { SupabaseUsageLedger } from "@/lib/engine/usage-ledger";
import { DeidentifiedVoyageClient } from "@/lib/engine/voyage";
import { getEngineEnvironment } from "@/lib/env/server";
import { generateDeliveryDocx } from "@/lib/docx/generator";
import { preflightTemplate } from "@/lib/docx/preflight";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const idempotencyKeySchema = z.string().uuid();

function jsonNoStore(body: unknown, init?: ResponseInit): NextResponse {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store, max-age=0");
  headers.set("x-content-type-options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

async function existingResponse(
  generation: ExistingGeneration,
  repository: EngineRepository,
  escritorioId: string,
  signedUrlTtlSeconds: number,
): Promise<NextResponse> {
  if (generation.status === "concluida") {
    const delivery = await repository.getDeliveryByGeneration(generation.id, escritorioId);
    const access = await repository.createSignedDeliveryUrl(
      delivery.arquivo_path,
      signedUrlTtlSeconds,
    );
    return jsonNoStore({
      geracao_id: generation.id,
      caso_id: generation.caso_id,
      status: "qa",
      custo_usd: generation.custo_usd,
      custo_brl: generation.custo_brl,
      teses: generation.teses_aplicadas,
      revisao: generation.revisao,
      arquivo_url: access.signedUrl,
      arquivo_nome: delivery.nome_arquivo,
      arquivo_expira_em: access.expiresAt,
      idempotente: true,
    });
  }

  if (generation.status === "falhou") {
    return jsonNoStore(
      {
        erro: {
          codigo: generation.erro_codigo ?? "ERRO_INTERNO",
          mensagem: "Esta tentativa de geração falhou. Use uma nova chave para tentar novamente.",
          retryable: true,
        },
        geracao_id: generation.id,
        idempotente: true,
      },
      { status: 409 },
    );
  }

  return jsonNoStore(
    {
      geracao_id: generation.id,
      caso_id: generation.caso_id,
      status: generation.status,
      etapa: generation.etapa_atual,
      idempotente: true,
    },
    { status: 202 },
  );
}

async function authenticatedOfficeId(): Promise<string> {
  const client = createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();

  if (authError || !user) {
    throw new EngineError("NAO_AUTENTICADO", "Autenticação obrigatória.");
  }

  const { data: profile, error: profileError } = await client
    .from("usuarios")
    .select("escritorio_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    throw new EngineError("ACESSO_NEGADO", "Usuário sem escritório válido.");
  }

  return z.object({ escritorio_id: z.string().uuid() }).parse(profile).escritorio_id;
}

export async function POST(request: Request): Promise<NextResponse> {
  let geracaoId: string | null = null;
  let repository: EngineRepository | null = null;

  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > 16 * 1024) {
      throw new EngineError("REQUISICAO_INVALIDA", "O corpo da requisição excede 16 KB.");
    }
    const body = generationRequestSchema.parse(await request.json());
    const escritorioId = await authenticatedOfficeId();

    if (body.escritorio_id && body.escritorio_id !== escritorioId) {
      throw new EngineError("ACESSO_NEGADO", "O escritório informado não pertence ao usuário.");
    }

    const idempotencyHeader = request.headers.get("idempotency-key");
    const requestId = idempotencyHeader
      ? idempotencyKeySchema.parse(idempotencyHeader)
      : randomUUID();
    const environment = getEngineEnvironment();
    const admin = createSupabaseAdminClient();
    repository = new EngineRepository(admin);

    const existing = await repository.findByRequestId(requestId, escritorioId);
    if (existing) {
      if (existing.caso_id !== body.caso_id) {
        throw new EngineError(
          "CONFLITO_GERACAO",
          "A chave de idempotência já pertence a outro caso.",
        );
      }
      return existingResponse(
        existing,
        repository,
        escritorioId,
        environment.ENTREGA_SIGNED_URL_TTL_SECONDS,
      );
    }

    const caso = await repository.loadCase(body.caso_id, escritorioId);
    const escritorio = await repository.loadOfficeDocumentConfig(escritorioId);
    const templateBuffer = await repository.downloadOfficeTemplate(escritorio);
    if (templateBuffer) {
      // Falha antes de reservar franquia ou gastar tokens se o template não for utilizável.
      await preflightTemplate(templateBuffer);
    }
    const pieceLimitUsd = environment.LIMITE_CUSTO_PECA_BRL / environment.COTACAO_USD_BRL;

    // Pré-checagem sem reserva: impede iniciar parsing quando o teto já acabou.
    await repository.precheckSpendCap(
      escritorioId,
      body.caso_id,
      environment.LIMITE_GASTO_MENSAL_USD,
      pieceLimitUsd,
    );

    geracaoId = await repository.createGeneration({
      escritorioId,
      casoId: body.caso_id,
      requestId,
      tipoOperacao: body.tipo_operacao,
    });

    // Lock transacional por escritório/competência cobre franquia, excedente e inadimplência.
    await repository.authorizeCommercial(escritorioId, body.caso_id, geracaoId);
    const signedCnisUrl = await repository.createSignedCnisUrl(body.caso_id, escritorioId);

    const ledger = new SupabaseUsageLedger({
      admin,
      escritorioId,
      casoId: body.caso_id,
      requestId,
      globalLimitUsd: environment.LIMITE_GASTO_MENSAL_USD,
      pieceLimitUsd,
      usdBrlRate: environment.COTACAO_USD_BRL,
    });
    const anthropic = new TrackedAnthropicClient(
      {
        apiKey: environment.ANTHROPIC_API_KEY,
        haiku: {
          id: environment.MODELO_HAIKU,
          pricing: {
            inputUsdPerMillion: environment.PRECO_HAIKU_INPUT_USD_MTOK,
            outputUsdPerMillion: environment.PRECO_HAIKU_OUTPUT_USD_MTOK,
          },
        },
        sonnet: {
          id: environment.MODELO_SONNET,
          pricing: {
            inputUsdPerMillion: environment.PRECO_SONNET_INPUT_USD_MTOK,
            outputUsdPerMillion: environment.PRECO_SONNET_OUTPUT_USD_MTOK,
          },
        },
      },
      ledger,
    );
    const voyage = new DeidentifiedVoyageClient(
      {
        apiKey: environment.VOYAGE_API_KEY,
        model: environment.MODELO_EMBEDDING,
        inputUsdPerMillion: environment.PRECO_VOYAGE_INPUT_USD_MTOK,
      },
      ledger,
    );

    const result = await runGenerationPipeline(
      {
        caso,
        tipoOperacao: body.tipo_operacao,
        signedCnisUrl,
      },
      {
        anthropic,
        diagnostic: new CnisDiagnosticClient({
          endpoint: environment.PYTHON_DIAGNOSTICO_URL,
          internalToken: environment.INTERNAL_PYTHON_TOKEN,
        }),
        rag: new ThesisRagService(admin, voyage, escritorioId, body.caso_id),
        onProgress: (stage, data) => repository!.saveProgress(geracaoId!, stage, data),
      },
    );

    const delivery = await generateDeliveryDocx(
      {
        caso,
        resultado: result,
        escritorio,
        geracaoId,
      },
      templateBuffer,
    );
    const costs = await repository.calculateCosts(requestId, environment.COTACAO_USD_BRL);
    await repository.publishDelivery(geracaoId, delivery, costs);
    const access = await repository.createSignedDeliveryUrl(
      delivery.storagePath,
      environment.ENTREGA_SIGNED_URL_TTL_SECONDS,
    );

    return jsonNoStore({
      geracao_id: geracaoId,
      caso_id: body.caso_id,
      status: "qa",
      custo_usd: costs.usd,
      custo_brl: costs.brl,
      dentro_teto_peca: costs.brl <= environment.LIMITE_CUSTO_PECA_BRL,
      arquivo_url: access.signedUrl,
      arquivo_nome: delivery.fileName,
      arquivo_expira_em: access.expiresAt,
      timbrado_aplicado: delivery.usedTemplate,
      avisos_timbrado: delivery.preflight?.warnings ?? [],
      teses: result.teses.map(({ id, slug, titulo, similaridade }) => ({
        id,
        slug,
        titulo,
        similaridade,
      })),
      revisao: {
        status: result.revisao.status,
        ciclo: result.revisao.ciclo,
        campos_preencher: result.revisao.campos_preencher,
      },
      aviso: "Minuta assistida por IA; revisão humana obrigatória antes do protocolo.",
    });
  } catch (error) {
    const normalized =
      error instanceof z.ZodError
        ? new EngineError("REQUISICAO_INVALIDA", "Requisição inválida.", { cause: error })
        : normalizeEngineError(error);

    if (repository && geracaoId) {
      await repository.fail(geracaoId, normalized.code, normalized.message);
    }

    return jsonNoStore(
      {
        erro: {
          codigo: normalized.code,
          mensagem: normalized.message,
          retryable: normalized.retryable,
        },
        geracao_id: geracaoId,
      },
      { status: normalized.status },
    );
  }
}
