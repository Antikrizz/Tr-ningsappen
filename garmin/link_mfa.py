# Koppla ett Garmin-konto MED tvåfaktorsautentisering (MFA) till träningsappen.
# Skriptet frågar efter engångskoden som Garmin mejlar vid inloggning.
#
#   cd garmin
#   py -m pip install garth requests
#   py link_mfa.py
#
# Precis som link.mjs: lösenordet skickas bara till Garmin, det som sparas i
# Supabase är tokens (giltiga ~1 år). Kör om skriptet när de gått ut.

import dataclasses
import getpass
import json
import os
import sys
from datetime import datetime
from pathlib import Path

try:
    import garth
    import requests
except ImportError:
    print("Saknar bibliotek. Kör först:  py -m pip install garth requests")
    sys.exit(1)


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip("\"'")
        if key and value and key not in os.environ:
            os.environ[key] = value


HERE = Path(__file__).parent
load_dotenv(HERE / ".env")
load_dotenv(HERE.parent / ".env")

SUPABASE_URL = os.environ.get("SUPABASE_URL") or input("Supabase-URL (https://xxx.supabase.co): ").strip()
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or getpass.getpass("Supabase service role key: ").strip()

app_email = input("E-post i träningsappen (kontot som ska kopplas): ").strip().lower()
garmin_email = input("Garmin-e-post: ").strip()
garmin_password = getpass.getpass("Garmin-lösenord (syns inte när du skriver): ")

print("\nLoggar in mot Garmin Connect… (koden som mejlas frågas efter strax)")
try:
    garth.login(garmin_email, garmin_password)  # frågar själv efter MFA-koden vid behov
except Exception as err:
    print(f"\n❌ Garmin-inloggningen misslyckades: {err}")
    sys.exit(1)

oauth1 = dataclasses.asdict(garth.client.oauth1_token)
oauth2 = dataclasses.asdict(garth.client.oauth2_token)
# datetime-fält (t.ex. mfa_expiration_timestamp) måste bli strängar i JSON
oauth1 = json.loads(json.dumps(oauth1, default=str))
oauth2 = json.loads(json.dumps(oauth2, default=str))
print("✅ Garmin-inloggning OK")

headers = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

print("Letar upp kontot i appen…")
resp = requests.get(f"{SUPABASE_URL}/auth/v1/admin/users", headers=headers, params={"per_page": 1000})
if resp.status_code != 200:
    print(f"❌ Kunde inte lista användare (fel service role key?): {resp.status_code} {resp.text[:200]}")
    sys.exit(1)
users = resp.json().get("users", [])
user = next((u for u in users if (u.get("email") or "").lower() == app_email), None)
if not user:
    print(f"❌ Hittar ingen användare med e-post {app_email}. Skapa kontot i appen först.")
    sys.exit(1)

print("Sparar tokens…")
resp = requests.post(
    f"{SUPABASE_URL}/rest/v1/garmin_tokens",
    headers={**headers, "Prefer": "resolution=merge-duplicates"},
    json={
        "user_id": user["id"],
        "token_data": {"oauth1": oauth1, "oauth2": oauth2},
        "updated_at": datetime.utcnow().isoformat() + "Z",
    },
)
if resp.status_code not in (200, 201, 204):
    print(f"❌ Kunde inte spara tokens: {resp.status_code} {resp.text[:200]}")
    sys.exit(1)

resp = requests.post(
    f"{SUPABASE_URL}/rest/v1/profiles",
    headers={**headers, "Prefer": "resolution=merge-duplicates"},
    json={"id": user["id"], "garmin_linked": True},
)
if resp.status_code not in (200, 201, 204):
    print(f"⚠️ Tokens sparade, men kunde inte flagga profilen: {resp.status_code} {resp.text[:200]}")

print("\n🎉 Klart! Garmin är kopplat. Öppna appen — styrkepassen hämtas automatiskt.")
