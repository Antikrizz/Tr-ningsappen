# Träningslogg 🏋️

Mobilanpassad PWA för att logga styrketräning och följa progress. Två användare (eller fler),
data i Supabase, automatisk import av styrkepass från Garmin-klocka.

**Stack:** React + Vite (klient) · Supabase (databas, auth, Edge Function) · GitHub Pages (hosting) · GitHub Actions (deploy + keepalive)

## Kom igång

### 1. Supabase

1. Öppna ditt Supabase-projekt → **SQL Editor** → klistra in innehållet i
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) och kör.
2. (Rekommenderat för familjebruk) **Authentication → Sign In / Up →** stäng av *Confirm email*
   så ni slipper bekräftelsemejl.
3. Anteckna från **Settings → API**: projekt-URL, `anon`-nyckeln och `service_role`-nyckeln.

### 2. Kör lokalt

```bash
cd client
cp .env.example .env      # fyll i VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev               # öppna http://localhost:5173
```

Skapa ett konto i appen och logga ett pass — allt utom Garmin-synken funkar nu.

### 3. Deploy till GitHub Pages

1. Skapa ett **publikt** GitHub-repo och pusha koden.
2. Repo → **Settings → Pages** → Source: *GitHub Actions*.
3. Repo → **Settings → Secrets and variables → Actions → Variables** → lägg till
   `SUPABASE_URL` och `SUPABASE_ANON_KEY`.
4. Pusha till `main` — appen byggs och publiceras automatiskt på
   `https://<användarnamn>.github.io/<repo>/`.
5. Öppna URL:en i mobilen → dela-menyn → **Lägg till på hemskärmen**. Klart — den beter sig som en app.

> Anon-nyckeln är gjord för att vara publik; all säkerhet ligger i Row Level Security-policyerna i databasen.

### 4. Koppla Garmin (valfritt, en gång per användare)

```bash
cd garmin
npm install
node link.mjs
```

Skriptet frågar efter Supabase-uppgifterna (eller läser `garmin/.env`), din e-post i appen samt
Garmin-inloggningen. Lösenordet skickas bara till Garmin — det som sparas är tokens (giltiga ~1 år).
Deploya sedan Edge Function-en (kräver [Supabase CLI](https://supabase.com/docs/guides/cli)):

```bash
supabase functions deploy garmin-sync --project-ref <ditt-projekt-ref>
```

Därefter hämtas nya styrkepass automatiskt varje gång appen öppnas, plus via knappen
**Mer → Hämta nya pass**. Okända övningsnamn från Garmin mappas en gång under **Mer** och kommer ihåg.

**Om Garmin-kontot har tvåfaktor (MFA):** biblioteket klarar inte MFA-prompten. Stäng av MFA
tillfälligt, kör `link.mjs`, slå på MFA igen (tokens fortsätter gälla). Alternativ: logga in med
Python-biblioteket [garth](https://github.com/matin/garth) (`garth.login()` hanterar MFA) och lägg
tokens i tabellen `garmin_tokens` i formatet `{"oauth1": ..., "oauth2": ...}`.

## Bra att veta

- **Keepalive:** `.github/workflows/keepalive.yml` pingar Supabase var tredje dag så
  gratisprojektet inte pausas vid inaktivitet.
- **Garmin är inofficiellt:** synken bygger på Garmins interna API via
  [garmin-connect](https://www.npmjs.com/package/garmin-connect). Slutar den funka är det oftast
  ett biblioteksuppdatering bort — appen fungerar fullt ut med manuell loggning under tiden.
- **Export:** Mer → Export laddar ner all din data som CSV eller JSON.
- **Dubblettskydd:** samma Garmin-pass kan aldrig importeras två gånger
  (unik `garmin_activity_id`), och appen varnar om du manuellt loggar på en dag som redan
  har ett importerat pass.

## Steg 2-idéer (i prioordning)

1. Förslag på nästa vikt (progressiv överbelastning) när repmålet klarats
2. Delad vy — se varandras senaste pass
3. Vilotimer mellan set
4. Träningsprogram/rutiner (t.ex. Push/Pull/Legs-mallar)
5. Kroppsviktslogg med graf
6. Offline-kö för loggning utan täckning
