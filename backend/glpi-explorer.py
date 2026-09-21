import os
import requests
import json

API_URL = os.environ.get("GLPI_BASE_URL", "https://glpi.peer-consulting.com/apirest.php")
APP_TOKEN = os.environ.get("GLPI_APP_TOKEN", "k9SxfgHTaJWOeMQBH3aafZWqChD3hhxhlxDMpz0z")
USER_TOKEN = os.environ.get("GLPI_USER_TOKEN", "trIh7RWOuYC7p7dWZy4MaDe8I6HAm6qsTvwq3wAC")

def main():
    print("1. Autenticando con GLPI...")
    auth_headers = {
        "App-Token": APP_TOKEN,
        "Authorization": f"user_token {USER_TOKEN}"
    }
    session_token = requests.get(f"{API_URL}/initSession", headers=auth_headers).json()["session_token"]
    
    headers = {
        "App-Token": APP_TOKEN,
        "Session-Token": session_token,
        "Content-Type": "application/json"
    }

    print("\n2. Buscando campos de Entidad en los diccionarios de GLPI:")
    for endpoint in ["User", "Computer", "Phone", "Entity"]:
        res = requests.get(f"{API_URL}/listSearchOptions/{endpoint}", headers=headers)
        if res.status_code == 200:
            print(f"\n--- Tabla: {endpoint} ---")
            options = res.json()
            for k, v in options.items():
                if isinstance(v, dict) and 'field' in v:
                    # Filtramos solo los campos que tengan "entit" o "profile" en su nombre
                    field_name = str(v.get('field', '')).lower()
                    ui_name = str(v.get('name', '')).lower()
                    if 'entit' in field_name or 'entit' in ui_name or 'profile' in field_name or 'profile' in ui_name:
                        print(f"ID Búsqueda: {k:<4} | Campo BD: {v['field']:<20} | Nombre UI: {v.get('name')}")

    print("\n3. Extrayendo la estructura de la Entidad FDNY:")
    search_url = f"{API_URL}/search/Entity?criteria[0][field]=1&criteria[0][searchtype]=contains&criteria[0][value]=Fire Department&forcedisplay[0]=2"
    search_res = requests.get(search_url, headers=headers).json()
    
    if search_res.get("data"):
        entity_id = search_res["data"][0]["2"]
        print(f" -> Encontrado Entity ID: {entity_id}")
        entity_data = requests.get(f"{API_URL}/Entity/{entity_id}", headers=headers).json()
        print("\nEstructura JSON de la Entidad FDNY:")
        print(json.dumps({k: v for k, v in entity_data.items() if k in ['id', 'name', 'entities_id', 'level']}, indent=2))
    else:
        print("No se encontró la entidad FDNY.")

    print("\n4. Analizando el Usuario 10101 creado recientemente:")
    user_search = requests.get(f"{API_URL}/search/User?criteria[0][field]=1&criteria[0][searchtype]=equals&criteria[0][value]=10101&forcedisplay[0]=2", headers=headers).json()
    if user_search.get("data"):
        user_id = user_search["data"][0]["2"]
        user_data = requests.get(f"{API_URL}/User/{user_id}", headers=headers).json()
        print("\nCampos de Entidad/Perfil crudos en la tabla User:")
        print(json.dumps({k: v for k, v in user_data.items() if k in ['id', 'name', 'entities_id', 'is_recursive', 'profiles_id']}, indent=2))
        
        # En GLPI, la relación real Usuario-Entidad suele estar en Profile_User
        print("\nTabla de relación Profile_User para este usuario:")
        prof_res = requests.get(f"{API_URL}/User/{user_id}/Profile_User", headers=headers).json()
        print(json.dumps(prof_res, indent=2))
    else:
        print("No se encontró el usuario 10101.")

if __name__ == "__main__":
    main()