const required = ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "OPS_ALERT_EMAIL"];
const missing = required.filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.log(`CI alert skipped: variáveis ausentes (${missing.join(", ")}).`);
  process.exit(0);
}

const runUrl = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
const response = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    from: process.env.RESEND_FROM_EMAIL,
    to: [process.env.OPS_ALERT_EMAIL],
    subject: "[Córtex] Falha no job database da CI",
    text: `O job database falhou. Execução: ${runUrl}`,
    tags: [{ name: "event", value: "alert_ci_database_failed" }],
  }),
  signal: AbortSignal.timeout(10_000),
});

if (!response.ok) throw new Error(`RESEND_ALERT_HTTP_${response.status}`);
console.log("CI database failure alert sent through Resend.");
