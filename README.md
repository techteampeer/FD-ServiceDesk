# IT SERVICE DESK — Demo IA (React + Node + Gemini + GLPI)

Demo de mesa de ayuda con dos vistas lado a lado:

- **Usuario** abre un ticket conversando con el asistente (Gemini clasifica y crea el ticket en Jira).
- **Técnico** ve el ticket, una **propuesta de solución** y **casos similares** (retrieval sobre `corpus_es.json`), y decide **cerrar** o **escalar** (comentario + transición en Jira).

> Pensado para una sola ruta de demo (impresión de boletas/comandas). Datos sintéticos. Sin login.

## Requisitos
- Node.js 18 o superior.

## 1) Correr en modo MOCK (sin credenciales) — recomendado primero
Verifica todo el flujo sin Vertex ni Jira (respuestas simuladas).

**Terminal A — backend**
```
cd backend
npm install
copy .env.example .env
npm start
```
(El `.env` ya viene con `MOCK=true`.)

**Terminal B — frontend**
```
cd frontend
npm install
npm run dev
```
Abre http://localhost:5173

Flujo: escribe un problema en la izquierda → responde la pregunta → se crea el ticket → la derecha carga la propuesta y los casos → **Cerrar** o **Escalar**.

## 2) Conectar Vertex (Gemini) y Jira reales
Edita `backend/.env`:
1. `MOCK=false`
2. **Vertex:** `GCP_PROJECT`, `GCP_LOCATION` y autentícate con
   `gcloud auth application-default login` (o `GOOGLE_APPLICATION_CREDENTIALS`).
3. **Jira:** `JIRA_EMAIL` y `JIRA_API_TOKEN` (token de https://id.atlassian.com/manage-profile/security/api-tokens).
4. **IDs de transición:** crea un ticket de prueba y consulta
   `GET http://localhost:8787/api/jira/transitions/SUP-XX`
   Copia el `id` de "Done"/cerrar y el de escalar a
   `JIRA_TRANSITION_CLOSE_ID` y `JIRA_TRANSITION_ESCALATE_ID`.
   (Si los dejas vacíos, igual crea el ticket y comenta, solo no cambia de estado.)

## Endpoints del backend
- `GET  /api/health`
- `POST /api/intake` — conversación de intake; al estar listo crea el ticket en Jira
- `GET  /api/case/:key` — ticket + casos similares + propuesta de solución
- `POST /api/case/:key/ask` — consulta del técnico al asistente
- `POST /api/case/:key/resolve` — comenta y transiciona (cerrar/escalar)
- `GET  /api/jira/transitions/:key` — ayuda para descubrir IDs de transición

## Notas
- **Seguridad:** el token de Jira vive solo en `backend/.env` (nunca en el frontend ni en el repo). El frontend solo habla con el backend.
- **Marca del demo:** usa una marca y sede ficticias (ej. "Sazón Peruano — Sede Centro"). No uses marcas ni locales reales.
- **Inglés:** la app está lista para i18n. Para la versión en inglés: traduce `corpus_es.json` y los textos de prompts/etiquetas.
- **Cloud Run (opcional):** conteneriza el backend (Node 18, `npm start`) y sirve el `dist/` del frontend (`npm run build`) detrás del mismo origen o como sitio estático.

## Estructura
```
backend/   Express + Vertex(Gemini) + Jira + retrieval
frontend/  React (Vite), vista usuario + consola técnico
```
