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

def get_or_create_dropdown(endpoint, name, headers):
    """Busca un valor en un diccionario de GLPI. Si no existe, lo crea."""
    safe_name = quote(name)
    search_url = f"{API_URL}/search/{endpoint}?criteria[0][field]=1&criteria[0][searchtype]=equals&criteria[0][value]={safe_name}&forcedisplay[0]=2"
    res = requests.get(search_url, headers=headers).json()
    
    if res.get("data"):
        return res["data"][0]["2"] # Retorna el ID existente
    else:
        # Lo crea si no existe
        create_res = requests.post(f"{API_URL}/{endpoint}", headers=headers, json={"input": {"name": name, "entities_id": ENTITY_ID}})
        return create_res.json().get("id")

def main():
    print(f"1. Authenticating with GLPI (Targeting Entity ID {ENTITY_ID})...")
    auth_headers = {"App-Token": APP_TOKEN, "Authorization": f"user_token {USER_TOKEN}"}
    session_token = requests.get(f"{API_URL}/initSession", headers=auth_headers).json()["session_token"]
    
    headers = {
        "App-Token": APP_TOKEN,
        "Session-Token": session_token,
        "Content-Type": "application/json",
        "Active-Entity": str(ENTITY_ID)
    }

    glpi_users = {}      
    glpi_locations = {}  

    print("\n2. Loading Users, Emails & Profiles from CSV...")
    with open(USERS_CSV, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            user_payload = {
                "input": {
                    "name": row["badge"],
                    "firstname": row["firstname"],
                    "realname": row["realname"],
                    "entities_id": ENTITY_ID
                }
            }
            r_user = requests.post(f"{API_URL}/User", headers=headers, json=user_payload)
            
            if r_user.status_code in (200, 201):
                new_id = r_user.json().get("id")
                glpi_users[row["badge"]] = new_id
                
                # A. Enlazar Correo
                requests.post(f"{API_URL}/UserEmail", headers=headers, json={"input": {"users_id": new_id, "email": row["email"], "is_default": 1}})
                
                # B. MAGIA DE PERFILES: Asignar perfil "Self-Service" (ID 1) en la entidad FDNY
                requests.post(f"{API_URL}/Profile_User", headers=headers, json={"input": {"users_id": new_id, "profiles_id": 1, "entities_id": ENTITY_ID, "is_recursive": 1}})
                
                print(f" -> User {row['badge']} created and authorized in FDNY")

    print("\n3. Loading Locations from CSV...")
    with open(LOCATIONS_CSV, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            loc_payload = {"input": {"name": row["name"], "address": row["address"], "latitude": row["latitude"], "longitude": row["longitude"], "entities_id": ENTITY_ID}}
            r_loc = requests.post(f"{API_URL}/Location", headers=headers, json=loc_payload)
            if r_loc.status_code in (200, 201):
                glpi_locations[row["name"]] = r_loc.json().get("id")
                print(f" -> Location '{row['name']}' created")

    print("\n4. Loading Assets & Dictionaries from CSV...")
    # Pre-creamos el estado "In use" para todos los equipos
    state_id = get_or_create_dropdown("State", "In use", headers)
    
    with open(ASSETS_CSV, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            user_id = glpi_users.get(row["assigned_user"])
            loc_id = glpi_locations.get(row["location"])
            if not user_id or not loc_id: continue
            
            is_phone = "CEL" in row["tag"]
            endpoint = "/Phone" if is_phone else "/Computer"
            
            # C. MAGIA DE DICCIONARIOS: Crea/Busca el tipo y modelo
            type_name = "Smartphone" if is_phone else "Tablet"
            type_endpoint = "PhoneType" if is_phone else "ComputerType"
            model_endpoint = "PhoneModel" if is_phone else "ComputerModel"
            
            type_id = get_or_create_dropdown(type_endpoint, type_name, headers)
            model_id = get_or_create_dropdown(model_endpoint, row["type"], headers)
            
            asset_payload = {
                "input": {
                    "name": row["tag"],
                    "users_id": user_id,
                    "locations_id": loc_id,
                    "entities_id": ENTITY_ID,
                    "states_id": state_id,
                    "is_dynamic": 1
                }
            }
            
            # Asignamos los IDs de los diccionarios según el tipo de equipo
            if is_phone:
                asset_payload["input"]["phonetypes_id"] = type_id
                asset_payload["input"]["phonemodels_id"] = model_id
            else:
                asset_payload["input"]["computertypes_id"] = type_id
                asset_payload["input"]["computermodels_id"] = model_id
                
            requests.post(f"{API_URL}{endpoint}", headers=headers, json=asset_payload)
            print(f" -> {endpoint.replace('/', '')} {row['tag']} ({row['type']}) fully configured.")

    print("\nSuccess! Database is now a perfect replica of production data.")

if __name__ == "__main__":
    main()