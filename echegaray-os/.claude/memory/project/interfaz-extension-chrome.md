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

## Pendiente / caveat
- **Límite de duración**: el motor está pensado para respuestas en SEGUNDOS. Vercel (maxDuration 60) y el túnel cloudflared (~100s) cortan directivas muy largas. Si una directiva pesada (leer Drive grande + razonar) supera eso → timeout. Si molesta: pasar a async (job id + polling).
- **Permanencia real de la URL de túnel**: hoy es trycloudflare (gratis, se recrea sola vía registro). Más sólido aún: dominio propio + túnel nombrado de Cloudflare, o sudo para Caddy+443 en la VM.
- **Siguiente**: que la extensión no sólo conteste sino que ACTÚE sobre el archivo (completar/ordenar/corregir) con aprobación.

Ver [[preferencia-os-agentes-completo]] y [[conducir-autonomo-sin-preguntar-y-rapido]].
