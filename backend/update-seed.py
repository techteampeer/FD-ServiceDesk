import os
import csv
import requests
from urllib.parse import quote

API_URL = os.environ.get("GLPI_BASE_URL", "https://glpi.peer-consulting.com/apirest.php")
APP_TOKEN = os.environ.get("GLPI_APP_TOKEN", "k9SxfgHTaJWOeMQBH3aafZWqChD3hhxhlxDMpz0z")
USER_TOKEN = os.environ.get("GLPI_USER_TOKEN", "trIh7RWOuYC7p7dWZy4MaDe8I6HAm6qsTvwq3wAC")
ENTITY_ID = 1 

DATA_DIR = os.path.join(os.path.dirname(__file__), "data", "glpi")
USERS_CSV = os.path.join(DATA_DIR, "users.csv")
LOCATIONS_CSV = os.path.join(DATA_DIR, "locations.csv")
ASSETS_CSV = os.path.join(DATA_DIR, "assets.csv")

def get_id_by_name(endpoint, name, headers):
    """Busca un registro probando el campo 14 (name) y el 1 (completename)."""
    safe_name = quote(name)
    for field in [14, 1, 20]:
        url = f"{API_URL}/search/{endpoint}?criteria[0][field]={field}&criteria[0][searchtype]=contains&criteria[0][value]={safe_name}&forcedisplay[0]=2"
        res = requests.get(url, headers=headers).json()
        if isinstance(res, dict) and res.get("data"):
            return res["data"][0]["2"]
    return None

def get_or_create_dropdown(endpoint, name, headers):
    """Busca o crea un valor manejando los errores de GLPI de forma segura."""
    existing_id = get_id_by_name(endpoint, name, headers)
    if existing_id:
        return existing_id

    # Los estados suelen ser globales, evitamos forzar entities_id
    payload = {"input": {"name": name}}
    if endpoint != "State":
        payload["input"]["entities_id"] = ENTITY_ID

    create_res = requests.post(f"{API_URL}/{endpoint}", headers=headers, json=payload)
    res_json = create_res.json()

    if isinstance(res_json, dict):
        return res_json.get("id")
    else:
        print(f" [!] Advertencia: No se pudo crear '{name}' en {endpoint}. Respuesta: {res_json}")
        return None

def main():
    print("1. Authenticating with GLPI for Updates...")
    auth_headers = {"App-Token": APP_TOKEN, "Authorization": f"user_token {USER_TOKEN}"}
    session_token = requests.get(f"{API_URL}/initSession", headers=auth_headers).json()["session_token"]
    
    headers = {
        "App-Token": APP_TOKEN,
        "Session-Token": session_token,
        "Content-Type": "application/json"
    }

    glpi_users = {}
    glpi_locations = {}

    print("\n2. Updating Users (Assigning to FDNY & Profiles)...")
    with open(USERS_CSV, mode='r', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            user_id = get_id_by_name("User", row["badge"], headers)
            if user_id:
                glpi_users[row["badge"]] = user_id
                requests.put(f"{API_URL}/User/{user_id}", headers=headers, json={"input": {"id": user_id, "entities_id": ENTITY_ID}})
                requests.post(f"{API_URL}/Profile_User", headers=headers, json={"input": {"users_id": user_id, "profiles_id": 1, "entities_id": ENTITY_ID, "is_recursive": 1}})
                print(f" -> User {row['badge']} updated")

    print("\n3. Mapping Existing Locations...")
    with open(LOCATIONS_CSV, mode='r', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            loc_id = get_id_by_name("Location", row["name"], headers)
            if loc_id:
                glpi_locations[row["name"]] = loc_id
                requests.put(f"{API_URL}/Location/{loc_id}", headers=headers, json={"input": {"id": loc_id, "entities_id": ENTITY_ID}})

    print("\n4. Updating Assets (Phones & Computers)...")
    state_id = get_or_create_dropdown("State", "In use", headers)
    
    with open(ASSETS_CSV, mode='r', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            user_id = glpi_users.get(row["assigned_user"])
            loc_id = glpi_locations.get(row["location"])
            if not user_id or not loc_id: 
                continue

            is_phone = "CEL" in row["tag"]
            endpoint = "Phone" if is_phone else "Computer"
            
            asset_id = get_id_by_name(endpoint, row["tag"], headers)
            if asset_id:
                type_name = "Smartphone" if is_phone else "Tablet"
                type_endpoint = "PhoneType" if is_phone else "ComputerType"
                model_endpoint = "PhoneModel" if is_phone else "ComputerModel"
                
                type_id = get_or_create_dropdown(type_endpoint, type_name, headers)
                model_id = get_or_create_dropdown(model_endpoint, row["type"], headers)
                
                update_payload = {
                    "input": {
                        "id": asset_id,
                        "users_id": user_id,
                        "locations_id": loc_id,
                        "entities_id": ENTITY_ID
                    }
                }
                
                if state_id:
                    update_payload["input"]["states_id"] = state_id
                
                if is_phone:
                    if type_id: update_payload["input"]["phonetypes_id"] = type_id
                    if model_id: update_payload["input"]["phonemodels_id"] = model_id
                else:
                    if type_id: update_payload["input"]["computertypes_id"] = type_id
                    if model_id: update_payload["input"]["computermodels_id"] = model_id
                    
                res = requests.put(f"{API_URL}/{endpoint}/{asset_id}", headers=headers, json=update_payload)
                if res.status_code == 200:
                    print(f" -> {endpoint} {row['tag']} updated.")
                else:
                    print(f" [!] Failed to update {row['tag']}: {res.text}")

    print("\nSuccess! Existing records have been patched.")

if __name__ == "__main__":
    main()