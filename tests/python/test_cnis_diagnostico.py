import json
import os
import unittest

from api.diagnostico import _validated_storage_url
from scripts.cnis_diagnostico import diagnose_text


class CnisDiagnosticoTest(unittest.TestCase):
    def test_extrai_estrutura_calcula_uniao_e_remove_identificadores(self):
        text = """
        Nome: Maria da Silva
        CPF: 123.456.789-00 NIT: 123.45678.90-1
        Data de nascimento: 01/01/1980 Sexo: F
        EMPRESA ALFA 01/01/2010 31/12/2010 PEXT
        EMPRESA BETA 01/07/2010 31/12/2011 IEAN
        01/2010 R$ 1.000,00 PEXT
        02/2010 R$ 1.100,00
        """

        result = diagnose_text(text, pages=2)

        self.assertEqual(result["qualidade_extracao"], "alta")
        self.assertEqual(len(result["vinculos"]), 2)
        self.assertEqual(result["calculos"]["dias_contribuicao_sem_sobreposicao"], 730)
        self.assertEqual(result["calculos"]["periodos_concomitantes"], 1)
        self.assertEqual(result["calculos"]["competencias_carencia"], 2)
        self.assertEqual(result["indicadores"], ["IEAN", "PEXT"])

        serialized = json.dumps(result, ensure_ascii=False)
        self.assertNotIn("Maria", serialized)
        self.assertNotIn("123.456.789-00", serialized)
        self.assertNotIn("123.45678.90-1", serialized)

    def test_sinaliza_dados_ausentes_sem_inventar(self):
        result = diagnose_text("Extrato sem tabela legível")
        self.assertEqual(result["qualidade_extracao"], "baixa")
        self.assertEqual(result["vinculos"], [])
        self.assertEqual(result["remuneracoes"], [])
        self.assertGreaterEqual(len(result["confirmacoes_necessarias"]), 4)

    def test_rejeita_ssrf_e_bucket_diferente_de_cnis(self):
        os.environ["SUPABASE_URL"] = "https://projeto.supabase.co"
        valid = (
            "https://projeto.supabase.co/storage/v1/object/sign/cnis/office/file.pdf?token=abc"
        )
        self.assertEqual(_validated_storage_url(valid), valid)

        with self.assertRaises(ValueError):
            _validated_storage_url(
                "https://evil.example/storage/v1/object/sign/cnis/office/file.pdf?token=abc"
            )
        with self.assertRaises(ValueError):
            _validated_storage_url(
                "https://projeto.supabase.co/storage/v1/object/sign/entregas/file.pdf?token=abc"
            )


if __name__ == "__main__":
    unittest.main()
