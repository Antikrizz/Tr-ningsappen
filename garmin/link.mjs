// Koppla ett Garmin-konto till träningsappen. Körs EN gång per användare, lokalt:
//
//   cd garmin && npm install && node link.mjs
//
// Skriptet loggar in mot Garmin (lösenordet skickas bara till Garmin, sparas aldrig),
// och lägger de resulterande tokens i Supabase-tabellen garmin_tokens. Därefter hämtar
// appen styrkepass automatiskt. Tokens gäller ungefär ett år — kör om skriptet då.
//
// Kräver SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY i miljön eller i garmin/.env.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import garminPkg from "garmin-connect";
const { GarminConnect } = garminPkg;
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// enkel .env-läsare (ingen extra dependency)
function loadDotenv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadDotenv(path.join(__dirname, ".env"));
loadDotenv(path.join(__dirname, "..", ".env"));

function ask(question, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  if (hidden) {
    rl._writeToOutput = (str) =>
      rl.output.write(str.includes("\n") ? str : str.replace(/./g, "*"));
  }
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    })
  );
}

const SUPABASE_URL = process.env.SUPABASE_URL || (await ask("Supabase-URL (https://xxx.supabase.co): "));
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || (await ask("Supabase service role key: ", { hidden: true }));

const appEmail = (await ask("Din e-post i träningsappen: ")).toLowerCase();
const garminEmail = await ask("Garmin-e-post: ");
const garminPassword = await ask("Garmin-lösenord: ", { hidden: true });

console.log("\nLoggar in mot Garmin Connect…");
const gc = new GarminConnect({ username: garminEmail, password: garminPassword });
try {
  await gc.login();
} catch (err) {
  console.error("\n❌ Garmin-inloggningen misslyckades:", err.message ?? err);
  console.error(
    "\nTips:\n" +
      " - Kontrollera e-post/lösenord.\n" +
      " - Har kontot tvåfaktorsautentisering (MFA)? Biblioteket klarar inte MFA-prompten —\n" +
      "   stäng av MFA tillfälligt i Garmin-kontot, kör skriptet, slå på MFA igen\n" +
      "   (tokens fortsätter fungera), eller använd Python-alternativet garth (se README)."
  );
  process.exit(1);
}

const oauth1 = gc.client?.oauth1Token;
const oauth2 = gc.client?.oauth2Token;
if (!oauth1 || !oauth2) {
  console.error("❌ Inloggningen lyckades men inga tokens hittades — bibliotekversionen kan ha ändrats.");
  process.exit(1);
}
console.log("✅ Garmin-inloggning OK");

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

console.log("Letar upp ditt konto i appen…");
const { data: usersPage, error: listErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listErr) {
  console.error("❌ Kunde inte lista användare (fel service role key?):", listErr.message);
  process.exit(1);
}
const user = usersPage.users.find((u) => (u.email ?? "").toLowerCase() === appEmail);
if (!user) {
  console.error(`❌ Hittar ingen användare med e-post ${appEmail}. Skapa kontot i appen först.`);
  process.exit(1);
}

const { error: tokErr } = await sb.from("garmin_tokens").upsert({
  user_id: user.id,
  token_data: { oauth1, oauth2 },
  updated_at: new Date().toISOString()
});
if (tokErr) {
  console.error("❌ Kunde inte spara tokens:", tokErr.message);
  process.exit(1);
}

const { error: profErr } = await sb
  .from("profiles")
  .upsert({ id: user.id, garmin_linked: true }, { onConflict: "id" });
if (profErr) console.warn("⚠️ Tokens sparade, men kunde inte flagga profilen:", profErr.message);

console.log("\n🎉 Klart! Garmin är kopplat. Öppna appen — dina styrkepass hämtas automatiskt.");
