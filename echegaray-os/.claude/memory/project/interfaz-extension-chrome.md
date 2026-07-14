---
name: interfaz-extension-chrome
description: El OS se usa desde el navegador — motor interactivo en la VM + extensión de Chrome descargable desde la web de Vercel. Cerebro en la VM, descarga en producción.
metadata:
  type: project
---

Fecha: 2026-07-14. Primera interfaz para USAR el OS desde donde trabaja Jorge (no sólo la web de Dirección).

## Arquitectura (todo el compute en la VM, descarga en Vercel)
- **Motor interactivo** `orquestador/interactive-server.mjs`: responde una directiva en SEGUNDOS (un agente, modelo haiku, con lectura de Drive real + memoria acumulada del cerebro). `POST /ask {directive, fileId?, fast?}`. NO ejecuta Nivel E. Servicio systemd durable `echegaray-orq-interactive.service`, escucha **0.0.0.0:8790** en la VM (IP pública **64.176.22.159**). Sirve también `GET /` (página de descarga) y `GET /extension.zip`. Auth por token `ORQ_INTERACTIVE_TOKEN` en `worker.env` (token actual: `44c81dd36549fb781be99058b5fe4269`).
- **Extensión de Chrome** `extension/` (MV3, panel lateral): detecta el file_id del Sheet/Doc abierto, manda la directiva a `http://64.176.22.159:8790/ask`, muestra la respuesta. Config (dirección + llave) en el ⚙, guardada en chrome.storage.
- **Descarga desde la web de producción**: `src/app/(main)/extension/page.tsx` + `public/echegaray-os-extension.zip` → **https://echegaray-business-os.vercel.app/extension**. Verificado en vivo: el .zip responde 200 en producción. Se instala "descomprimida" (dev mode), no por Chrome Store.

## Deploy
Se hizo **fast-forward de `infra/anthropic-api-engine` a `main`** (37 commits) y push → deploy productivo Vercel OK. `main` = `a3af39e`. La rama de trabajo sigue siendo `infra/anthropic-api-engine`.

## Pendiente / caveat
- **Firewall del proveedor (Vultr)**: falta confirmar que el puerto **8790** esté abierto al exterior. Test: abrir `http://64.176.22.159:8790/` desde el navegador de Jorge; si no carga, abrir 8790 en el panel de Vultr. Es lo único que no se puede hacer desde la VM.
- **Sin TLS/dominio**: la extensión habla HTTP a la IP con token. Para producción real: dominio + TLS (Caddy/nginx) y auth ligada al login de Supabase.
- **Siguiente**: que la extensión no sólo conteste sino que ACTÚE sobre el archivo (completar/ordenar/corregir) con aprobación.

Ver [[preferencia-os-agentes-completo]] y [[conducir-autonomo-sin-preguntar-y-rapido]].
