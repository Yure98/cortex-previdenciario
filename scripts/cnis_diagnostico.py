"""Extração estrutural e aritmética determinística de extratos CNIS.

Este módulo não decide teses nem aplica regras jurídicas. Ele converte texto do PDF em
períodos, competências e indicadores, executando apenas aritmética de datas. CPF, NIT,
nome e texto bruto são deliberadamente excluídos da saída.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from io import BytesIO
from typing import Any

DATE_PATTERN = re.compile(r"\b(\d{2}/\d{2}/\d{4})\b")
COMPETENCE_PATTERN = re.compile(r"\b(0[1-9]|1[0-2])/(\d{4})\b")
MONEY_PATTERN = re.compile(r"(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})")
INDICATOR_PATTERN = re.compile(
    r"\b(?:PEXT|PREC(?:-[A-Z0-9]+)*|IREC(?:-[A-Z0-9]+)*|IEAN|AEXT(?:-[A-Z0-9]+)*|"
    r"IEXT|PRPPS|PADM-EMPR|PSC-MEN-SM-EC103|IGFIP-INF|ACNISVR)\b",
    re.IGNORECASE,
)
EC_103_DATE = date(2019, 11, 13)


def _iso(value: date) -> str:
    return value.isoformat()


def _parse_date(value: str) -> date:
    return datetime.strptime(value, "%d/%m/%Y").date()


def _parse_money_to_cents(value: str) -> int:
    normalized = value.replace(".", "").replace(",", ".")
    return int(round(float(normalized) * 100))


def _clean_employer(value: str) -> str | None:
    cleaned = re.sub(r"\s+", " ", value).strip(" |-:;")
    cleaned = re.sub(r"^\d+\s+", "", cleaned)
    if len(cleaned) < 2:
        return None
    return cleaned[:240]


def _indicators(value: str) -> list[str]:
    return sorted({match.upper() for match in INDICATOR_PATTERN.findall(value)})


@dataclass(frozen=True)
class Interval:
    start: date
    end: date


def _merge_intervals(intervals: list[Interval]) -> tuple[list[Interval], int]:
    if not intervals:
        return [], 0

    ordered = sorted(intervals, key=lambda item: (item.start, item.end))
    merged = [ordered[0]]
    concurrent = 0

    for interval in ordered[1:]:
        current = merged[-1]
        if interval.start <= current.end + timedelta(days=1):
            if interval.start <= current.end:
                concurrent += 1
            merged[-1] = Interval(current.start, max(current.end, interval.end))
        else:
            merged.append(interval)

    return merged, concurrent


def _inclusive_days(interval: Interval) -> int:
    return (interval.end - interval.start).days + 1


def _calculate_periods(vinculos: list[dict[str, Any]], remuneracoes: list[dict[str, Any]]) -> dict[str, Any]:
    intervals = [
        Interval(date.fromisoformat(item["inicio"]), date.fromisoformat(item["fim"]))
        for item in vinculos
        if item["fim"] is not None
    ]
    merged, concurrent = _merge_intervals(intervals)

    total_days = sum(_inclusive_days(item) for item in merged)
    until_reform = 0
    for interval in merged:
        if interval.start > EC_103_DATE:
            continue
        until_reform += _inclusive_days(Interval(interval.start, min(interval.end, EC_103_DATE)))

    gaps: list[dict[str, Any]] = []
    for previous, following in zip(merged, merged[1:]):
        gap_start = previous.end + timedelta(days=1)
        gap_end = following.start - timedelta(days=1)
        gap_days = (gap_end - gap_start).days + 1
        if gap_days > 30:
            gaps.append(
                {"inicio": _iso(gap_start), "fim": _iso(gap_end), "dias": gap_days}
            )

    competences = {item["competencia"] for item in remuneracoes}
    return {
        "dias_contribuicao_sem_sobreposicao": total_days,
        "dias_contribuicao_ate_ec_103": until_reform,
        "competencias_carencia": len(competences),
        "periodos_concomitantes": concurrent,
        "lacunas_superiores_30_dias": gaps,
    }


def _extract_personal_minimum(text: str) -> dict[str, str | None]:
    birth_match = re.search(
        r"(?:data\s+de\s+nascimento|nascimento)\s*[:\-]?\s*(\d{2}/\d{2}/\d{4})",
        text,
        re.IGNORECASE,
    )
    sex_match = re.search(r"\bsexo\s*[:\-]?\s*(masculino|feminino|m|f)\b", text, re.IGNORECASE)

    birth = None
    if birth_match:
        try:
            birth = _iso(_parse_date(birth_match.group(1)))
        except ValueError:
            birth = None

    sex = None
    if sex_match:
        value = sex_match.group(1).upper()
        sex = "M" if value in {"M", "MASCULINO"} else "F"

    return {"nascimento": birth, "sexo": sex}


def _extract_links(lines: list[str]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    seen: set[tuple[str, str | None, str | None]] = set()

    for line in lines:
        dates = DATE_PATTERN.findall(line)
        if not dates:
            continue
        if re.search(r"nascimento|emiss[aã]o|impress[aã]o", line, re.IGNORECASE):
            continue

        try:
            start = _parse_date(dates[0])
            end = _parse_date(dates[1]) if len(dates) > 1 else None
        except ValueError:
            continue

        if start.year < 1930 or start > date.today() + timedelta(days=1):
            continue
        if end is not None and (end < start or end > date.today() + timedelta(days=366)):
            continue

        first_date_position = line.find(dates[0])
        employer = _clean_employer(line[:first_date_position])
        key = (_iso(start), _iso(end) if end else None, employer)
        if key in seen:
            continue
        seen.add(key)

        result.append(
            {
                "empregador": employer,
                "inicio": _iso(start),
                "fim": _iso(end) if end else None,
                "dias_no_intervalo": _inclusive_days(Interval(start, end)) if end else None,
                "indicadores": _indicators(line),
            }
        )

    return result


def _extract_remunerations(lines: list[str]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    seen: set[tuple[str, int]] = set()

    for line in lines:
        competences = [match.group(0) for match in COMPETENCE_PATTERN.finditer(line)]
        values = [match.group(1) for match in MONEY_PATTERN.finditer(line)]
        if not competences or not values:
            continue

        for competence, value in zip(competences, values):
            month, year = competence.split("/")
            cents = _parse_money_to_cents(value)
            normalized = f"{year}-{month}"
            key = (normalized, cents)
            if key in seen:
                continue
            seen.add(key)
            result.append(
                {
                    "competencia": normalized,
                    "valor_centavos": cents,
                    "indicadores": _indicators(line),
                }
            )

    return sorted(result, key=lambda item: item["competencia"])


def diagnose_text(text: str, pages: int = 1) -> dict[str, Any]:
    normalized_text = text.replace("\x00", " ")
    lines = [re.sub(r"\s+", " ", line).strip() for line in normalized_text.splitlines()]
    lines = [line for line in lines if line]

    links = _extract_links(lines)
    remunerations = _extract_remunerations(lines)
    indicators = sorted({item for line in lines for item in _indicators(line)})
    personal = _extract_personal_minimum(normalized_text)

    alerts: list[str] = []
    confirmations: list[str] = []
    if not links:
        alerts.append("Nenhum vínculo pôde ser extraído automaticamente.")
        confirmations.append("Confirmar manualmente todos os vínculos do CNIS.")
    if not remunerations:
        alerts.append("Nenhuma remuneração pôde ser extraída automaticamente.")
        confirmations.append("Confirmar competências e salários de contribuição.")
    if any(item["fim"] is None for item in links):
        confirmations.append("Confirmar a data final dos vínculos em aberto.")
    if personal["nascimento"] is None:
        confirmations.append("Informar e confirmar a data de nascimento.")
    if personal["sexo"] is None:
        confirmations.append("Informar e confirmar o sexo para as regras que o utilizam.")
    if indicators:
        alerts.append("Há indicadores CNIS que exigem conferência documental.")

    if links and remunerations:
        quality = "alta"
    elif links or remunerations:
        quality = "media"
    else:
        quality = "baixa"

    return {
        "versao": "cnis-estrutural-v1",
        "qualidade_extracao": quality,
        "paginas": pages,
        "dados_pessoais": personal,
        "vinculos": links,
        "remuneracoes": remunerations,
        "indicadores": indicators,
        "calculos": _calculate_periods(links, remunerations),
        "alertas": alerts,
        "confirmacoes_necessarias": sorted(set(confirmations)),
    }


def diagnose_pdf(pdf_bytes: bytes) -> dict[str, Any]:
    from pypdf import PdfReader

    reader = PdfReader(BytesIO(pdf_bytes), strict=False)
    pages_text: list[str] = []
    for page in reader.pages:
        pages_text.append(page.extract_text() or "")

    combined = "\n".join(pages_text).strip()
    if not combined:
        raise ValueError("PDF_SEM_TEXTO")

    return diagnose_text(combined, pages=len(reader.pages))
