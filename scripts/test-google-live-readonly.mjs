// Smoke controlado de Google Classroom e Forms, exclusivamente leitura.
// Requer OAuth refresh token de conta docente FICTICIA, com os escopos apropriados.
// Nunca imprime segredos, tokens, títulos de turma ou respostas de alunos.
const requirements = [
  "GOOGLE_TEST_CLIENT_ID",
  "GOOGLE_TEST_CLIENT_SECRET",
  "GOOGLE_TEST_REFRESH_TOKEN",
  "GOOGLE_TEST_FORM_ID",
];
const missing = requirements.filter((key) => !process.env[key]?.trim());
if (missing.length) {
  console.error(`BLOQUEADO: credenciais de homologacao ausentes: ${missing.join(", ")}`);
  process.exitCode = 2;
} else {
  try {
    const body = new URLSearchParams({
      client_id: process.env.GOOGLE_TEST_CLIENT_ID,
      client_secret: process.env.GOOGLE_TEST_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_TEST_REFRESH_TOKEN,
      grant_type: "refresh_token",
    });
    const auth = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(15000),
    });
    if (!auth.ok) throw new Error(`OAuth refresh failed: HTTP ${auth.status}`);
    const json = await auth.json();
    const accessToken = json.access_token;
    if (!accessToken) throw new Error("OAuth refresh did not return access token");
    const headers = { Authorization: `Bearer ${accessToken}` };

    const classroom = await fetch(
      "https://classroom.googleapis.com/v1/courses?pageSize=1",
      { headers, signal: AbortSignal.timeout(15000) },
    );
    if (!classroom.ok) throw new Error(`Classroom read-only API: HTTP ${classroom.status}`);
    console.log("APROVADO: autenticacao Google e listagem Classroom somente leitura.");

    const form = await fetch(
      `https://forms.googleapis.com/v1/forms/${encodeURIComponent(process.env.GOOGLE_TEST_FORM_ID)}`,
      { headers, signal: AbortSignal.timeout(15000) },
    );
    if (!form.ok) throw new Error(`Forms read-only API: HTTP ${form.status}`);
    console.log("APROVADO: consulta Google Forms somente leitura.");
  } catch (error) {
    console.error("FALHA: " + (error instanceof Error ? error.message : "erro desconhecido"));
    process.exitCode = 1;
  }
}
