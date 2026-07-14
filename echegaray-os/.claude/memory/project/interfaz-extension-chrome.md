---
name: interfaz-extension-chrome
description: El OS se usa desde el navegador — motor interactivo en la VM + extensión de Chrome descargable desde la web de Vercel. Cerebro en la VM, descarga en producción.
metadata:
  type: project
---

Fecha: 2026-07-14. Primera interfaz para USAR el OS desde donde trabaja Jorge (no sólo la web de Dirección).

## Arquitectura (todo el compute en la VM, descarga en Vercel)
- **Motor interactivo** `orquestador/interactive-server.mjs`: responde una directiva en SEGUNDOS (un agente, modelo haiku, con lectura de Drive real + memoria acumulada del cerebro). `POST /ask {directive, fileId?, fast?}`. NO ejecuta Nivel E. Servicio systemd durable `echegaray-orq-interactive.service`, escucha **0.0.0.0:8790** en la VM (IP pública **64.176.22.159**). Sirve también `GET /` (página de descarga) y `GET /extension.zip`. Auth por token `ORQ_INTERACTIVE_TOKEN` en `worker.env` (token actual: `44c81dd36549fb781be99058b5fe4269`).
- **Extensión de Chrome** `extension/` (MV3, panel lateral): detecta el file_id del Sheet/Doc abierto, manda la directiva al frente fijo **`https://echegaray-business-os.vercel.app/api/os`** (`/health`, `/ask`), muestra la respuesta. Config (dirección + llave) en el ⚙, guardada en chrome.storage. **Ojo**: si Jorge tenía una dirección vieja guardada en ⚙, override — hay que cambiarla al frente de Vercel (o borrarla para que tome el DEFAULT_ADDR).
- **Descarga desde la web de producción**: `src/app/(main)/extension/page.tsx` + `public/echegaray-os-extension.zip` → **https://echegaray-business-os.vercel.app/extension**. Se instala "descomprimida" (dev mode), no por Chrome Store.

## Canal permanente extensión→OS (2026-07-14, resuelto)
Problema original: la extensión pegaba a `http://IP:8790` → Chrome lo bloquea desde un contexto seguro (mixed content) → "Failed to fetch". Y **confirmado: el firewall de la VM NO acepta entrante salvo SSH** (sondas externas dan timeout 522). El único camino hacia adentro es un **túnel SALIENTE**. Sin sudo en la VM, sin dominio propio.
Solución con infra existente (Vercel + Supabase + systemd de usuario):
- **Túnel** `cloudflared` como servicio systemd de usuario **`echegaray-os-tunnel.service`** (arranca al bootear, se auto-reinicia). Wrapper `orquestador/scripts/os-tunnel.sh`. La URL trycloudflare cambia en cada arranque → se auto-publica.
- **Registro** `orquestador/scripts/os-endpoint.mjs`: escribe la URL viva del túnel en Supabase tabla **`os_runtime`** (key `interactive_endpoint`, lectura pública anon — GRANT + policy RLS).
- **Frente fijo** `src/app/api/os/[...path]/route.ts` en Vercel: lee la URL viva de `os_runtime` y reenvía la directiva (CORS `*`, maxDuration 60, forwardea Authorization). La extensión apunta SIEMPRE a `/api/os/*`, resista lo que resista el túnel = **auto-reparable**.
Verificado en vivo: `GET /api/os/health` → `{"ok":true,"ready":true}`, `POST /api/os/ask` sin token → 401 del OS. Corta además la fuga del Bearer token (antes HTTP plano).

## Deploy
Deploy por **`git push origin HEAD:main`** (fast-forward, sin cambiar de rama en la VM para no cortar los servicios). Vercel prod = `main`. Commit del canal: `dd79a82`. La rama de trabajo sigue siendo `infra/anthropic-api-engine`.

## Canal de ACCIÓN — PRP-015 (2026-07-14, implementado y verificado en vivo)
La extensión pasó de "ve y aconseja" a "actúa con tu aprobación". 4 fases sobre la infra de PRP-014 (`orq.pending_operations`, policy, ledger) — ver `.claude/PRPs/PRP-015-canal-accion-extension-os.md`:
- **F1 escritura+gate**: tools `drive_update/append/create` (capability drive.write=E→requires_approval) en `lib/tools/drive-write.mjs`; `lib/google.mjs` ganó WRITE_SCOPES + métodos de escritura; `lib/pending-ops.mjs` (enqueue/list/decide, DRY desde specialist); `handlers/operation_execute.mjs` ejecuta lo aprobado idempotentemente (dedupe `opexec:<id>`, re-chequea policy). Endpoints motor `GET /pending`, `POST /operation`. Extensión: pestaña **Pendientes** (Aprobar/Rechazar). Aprobar va por el MOTOR (Bearer token), no por el RPC (que exige auth.uid).
- **F2 multimedia**: la extensión adjunta foto/PDF (📎), reduce la imagen en canvas (límite Vercel ~4.5MB), el motor la pasa como visión/documento. Caso factura → asiento propuesto (pendiente).
- **F3 especialistas**: `lib/classify-directive.mjs` (haiku) rutea la directiva a una capability e inyecta las skills del especialista (skill-map), no el generalista.
- **F4 agenda**: `orq.schedules` (única tabla nueva) + timer `echegaray-os-schedules.timer` (5 min) + `handlers/scheduled_directive.mjs` (corre la directiva por el propio /ask). Endpoints `POST /schedule`, `GET /schedules`. Extensión: pestaña **Agenda**. computeNextRun en hora AR (UTC-3).
- Servicios systemd nuevos versionados en `orquestador/systemd/` (tunnel + schedules), instala `install.sh`.

## Pendiente / caveat
- **Auto-follow-up deferido**: el agente NO se auto-programa desde un hallazgo todavía (falta darle una tool de scheduling). La programación explícita del dueño sí anda.
- **"Avisame" sin push**: hoy el resultado de una recurrencia queda en la Agenda (last_result) y las acciones en Pendientes; el envío por WhatsApp/email es pieza aparte (skill `reportes-automaticos-y-comunicaciones`).
- **Gotcha Service Account**: la escritura sobre un Sheet de negocio existente exige que ese archivo esté COMPARTIDO con edición a la SA (el Cash Flow `1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8` ya lo está, canEdit=true). La SA NO tiene almacenamiento propio → **no puede crear archivos sueltos** (drive_create de doc/sheet da storageQuotaExceeded; sí crea carpetas). Para "crear" algo nuevo: el dueño crea el archivo vacío, lo comparte, y el OS lo llena.
- **Gotcha escritura segura (verificado en vivo, 2026-07-14)**: `drive_append` con rango abierto ("A:M") en una pestaña con TÍTULO en las primeras filas se ancla al título e INSERTA en la fila 2, desplazando datos y recalculando fórmulas (ej. columna ID = fórmula por posición). FIX aplicado: para agregar un registro el modelo usa `drive_tabs` → headers → `drive_last_row` (next_empty_row) → `drive_update` en la fila vacía siguiente (no inserta, no desplaza), y deja vacías las columnas-fórmula. Directivas con intención de escribir van a sonnet (haiku era muy tímido y preguntaba en vez de actuar).
- **Límite de duración**: el motor responde en SEGUNDOS. Vercel (maxDuration 60) y el túnel (~100s) cortan directivas muy largas; por eso la escritura real es diferida al worker.
- **Permanencia URL túnel**: trycloudflare (gratis, se recrea sola vía `os_runtime`). Más sólido: dominio propio + túnel nombrado, o sudo para Caddy+443.

Ver [[preferencia-os-agentes-completo]] y [[conducir-autonomo-sin-preguntar-y-rapido]].
