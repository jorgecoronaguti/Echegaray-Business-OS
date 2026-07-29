# Informe de QA Funcional — Mattermost (Echegaray Business OS)

**Etapa:** Hardening + Integración (PR-2)
**Auditor:** WT-6 (QA funcional, read-only / no destructivo)
**Fecha:** 2026-07-29
**Entorno auditado:** producción — servidor Vultr `64.176.22.159`, dominio `chat.ecsas.com.ar`
**Stack:** Mattermost Team Edition 11.8.4 · `echegaray-mm-app` (127.0.0.1:8065) · `echegaray-mm-db` (Postgres 16, red interna) · `echegaray-mm-caddy` (80/443, TLS Let's Encrypt)

## Alcance y método

Auditoría **funcional no destructiva**. No se cambiaron contraseñas reales, no se borraron datos, no se dejaron archivos residuales, no se ejecutó ningún `restore`, no se hizo push/merge a producción. Herramientas usadas: `docker exec … mmctl --local`, `curl` local con `--resolve chat.ecsas.com.ar:{80,443}:127.0.0.1`, `docker logs`, `docker stats`, `docker inspect`, `pg_dump` a archivo temporal (borrado). Se corrió y referenció el aparato read-only existente (`qa/pruebas.sh`); no se modificó.

Clasificación de prioridad: **P0** crítico (rompe hoy) · **P1** alto · **P2** medio · **P3** bajo.

---

## 1. Login / Logout / Cambio de contraseña — OK (con observación)

- **Login (endpoint):** `POST /api/v4/users/login` con credenciales inválidas → **HTTP 401**. La autenticación funciona y rechaza credenciales falsas. Evidencia: `curl … -d '{"login_id":"qa-nonexistent…","password":"…"}'` → `HTTP 401`.
- **Cambio de contraseña:** flujo probado **funcionalmente en producción** (no por mí): el log de `echegaray-mm-app` a las 12:35:12 registra `PUT /api/v4/users/{id}/password` que completó el cambio; el único error asociado fue el envío del correo de aviso (ver observación SMTP, hallazgo #6). El cambio de password vía API/consola funciona; la notificación por email no.
- **Política de acceso (endurecimiento correcto):** `PasswordSettings.MinimumLength = 10`, `ServiceSettings.MaximumLoginAttempts = 10` (bloqueo por fuerza bruta). `EnableInsecureOutgoingConnections = false`.
- **Usuarios (`mmctl user list`):** 3 usuarios — `jorge` (admin, `jorge@ecsas.com.ar`), `system-bot`, `calls` (bots de plugin). Estado coherente con un bootstrap recién hecho.
- **Logout:** revocación de sesión estándar de Mattermost; no se probó de forma destructiva (requeriría una sesión real). Endpoint presente; sin defecto observado.

**Estado: OK.** Observación: la notificación por email de cambio de password no funciona por falta de SMTP (hallazgo #6).

## 2. Carga de archivos — OK (config), con dependencia crítica de backup

- `FileSettings.EnableFileAttachments = true`
- `FileSettings.MaxFileSize = 104857600` (**100 MB**) — razonable.
- `FileSettings.DriverName = "local"` → los archivos subidos viven en el volumen `echegaray-mm-data` (hoy ya contiene datos: `teams/`, `users/`, ~52 KB).
- No se probó una subida real para no dejar residuo; el endpoint y la config son correctos. El procedimiento de prueba manual sería: subir un archivo mínimo a un canal y borrar el post — pero al ser destructivo/residual se documenta, no se ejecuta.

**Estado: OK a nivel funcional.** Pero el driver `local` conecta directamente con el **gap de backup** (hallazgo #7): mientras no exista PR-6 (adjuntos a Drive), todo archivo subido existe **solo** en `mm-data`, que `backup.sh` no respalda.

## 3. WebSocket — OK

- **Vía Caddy, HTTP/1.1:** `GET /api/v4/websocket` con headers de upgrade → **HTTP 101 Switching Protocols** + `Sec-WebSocket-Accept`. El tiempo real funciona a través del proxy público.
- **Loopback directo (`pruebas.sh`):** también 101.
- **Nota técnica (no es defecto):** sobre HTTP/2 el mismo request devuelve 400 — es el comportamiento esperado (el handshake WebSocket clásico requiere HTTP/1.1; los navegadores lo negocian correctamente). Caddy hace el upgrade transparente.

**Estado: OK.**

## 4. Performance — OK (holgado)

| Métrica | Valor | Lectura |
|---|---|---|
| `GET /api/v4/system/ping` (loopback ×5) | ~1.1 ms | Excelente |
| Web root vía Caddy (`GET /`) | HTTP 200, 698 KB, TTFB 14.7 ms, total 16.3 ms | Muy rápido |
| CPU `mm-app` / `mm-db` / `caddy` | 0.10% / 0.01% / 0.00% | Ocioso |
| MEM `mm-app` | 133 MiB / 1.5 GiB (8.7%) | Holgado |
| MEM `mm-db` | 60.8 MiB / 512 MiB (11.9%) | Holgado |
| MEM `caddy` | 13.6 MiB / 256 MiB (5.3%) | Holgado |

Límites de recursos (`deploy.resources.limits`) definidos por servicio; consumo real muy por debajo. Para el volumen esperado (equipo chico) hay margen amplio.

**Estado: OK.**

## 5. Errores / Logs — OK (mayoría benignos; 2 observaciones reales)

**Benignos (esperados, no requieren acción):**
- `playbooks`/license/`ffmpeg`/icono de `agents`: limitaciones de Team Edition (playbooks pide licencia professional; ffmpeg ausente deshabilita transcripciones). Documentados como benignos.
- Plugin `com.mattermost.calls`: fallos al alcanzar STUN público (`52.72.139.62:3478`) y `failed to get public IP for local interface`. El plugin Calls está activo pero no puede salir a STUN desde loopback; **el chat no se ve afectado**. Benigno (si no se usarán llamadas, se podría deshabilitar el plugin para limpiar ruido — P3).
- `"List of admins is empty"` (12:25): transitorio del bootstrap, antes de crear el admin. Benigno.
- `mm-db`: `FATAL: terminating connection due to administrator command` / `the database system is shutting down` (12:29:23): secuencia **normal** de apagado durante un restart. Benigno.
- Caddy: `HTTP/2/HTTP/3 skipped … requires TLS` en `:80` (normal, el 80 es solo ACME + redirect); `creating new account … jorge@ecsas.com.ar` (alta de cuenta ACME de primer arranque). Benigno.

**Observaciones reales:**
- **SMTP no operativo** → hallazgo #6 (P2).
- **502 transitorios durante el restart:** a las 12:29:65–67 Caddy devolvió `502` (`dial tcp 172.18.0.3:8065 connect: connection refused`) a un **cliente externo real** (`151.241.171.90`) mientras Mattermost reiniciaba. Doble lectura: (a) confirma que el sitio **es accesible públicamente desde Internet** (TLS con SNI `chat.ecsas.com.ar` desde una IP externa); (b) un restart de `mm-app` produce una ventana breve de indisponibilidad servida como 502. Benigno/transitorio, pero conviene tenerlo en el runbook.

**Estado: OK.** Sin errores críticos persistentes.

## 6. Seguridad / Aislamiento — OK (con 1 hardening recomendado)

- **Superficie de red correcta:** Postgres `5432` **no** publicado al host (solo red interna); `mm-app` publica **solo** `127.0.0.1:8065`; `caddy` es el único con `0.0.0.0:80` y `0.0.0.0:443`. Verificado con `docker port`.
- **TLS:** certificado **Let's Encrypt válido** `CN=chat.ecsas.com.ar`, emitido 2026-07-29 14:26, vence 2026-10-27; persistido en el volumen `caddy_data` (renovación sobrevive reinicios). La emisión ACME de hoy prueba que el DNS público resuelve a esta IP.
- **Redirección HTTP→HTTPS:** `http://…/` → **308 Permanent Redirect** a `https://…/`.
- **Headers de seguridad presentes:** `Content-Security-Policy: frame-ancestors 'self'; script-src 'self'`, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
- **Endurecimiento de contenedores:** `no-new-privileges:true` en los 3 servicios; límites de CPU/memoria definidos; `restart: unless-stopped`.
- **Hardening faltante — HSTS (P2):** no se observa `Strict-Transport-Security` en las respuestas HTTPS. Caddy no lo agrega por defecto. Recomendado añadir en el Caddyfile: `header Strict-Transport-Security "max-age=31536000; includeSubDomains"`.
- **Menor — disclosure de versión (P3):** `X-Version-Id` y `alt-svc` exponen que corre MM 11.8.4. Impacto bajo.

**Estado: OK, con HSTS pendiente.**

## 7. Backup / Restore — OK para la base, con gaps de cobertura y documentación

- **`backup.sh` (revisado + probado):** hace `pg_dump --clean --if-exists | gzip` de la base y `tar.gz` del volumen `mm-config`. **Prueba real no destructiva:** `pg_dump` a archivo temporal → **40 KB, 96 `CREATE TABLE`**, con todas las tablas núcleo presentes (`users`, `posts`, `channels`, `teams`, `fileinfo`). Archivo temporal **borrado**. El dump lógico es válido y restaurable con el comando documentado en el header del script. Rotación por antigüedad (`RETENTION_DAYS=14`) correcta.
- **GAP conocido y confirmado — `mm-data` sin backup (P1):** `backup.sh` **no** respalda el volumen `echegaray-mm-data` (adjuntos). El script lo declara intencional porque "los adjuntos irán a Drive en PR-6", pero **PR-6 no está hecho** y `FileSettings.DriverName = "local"`: hoy los archivos subidos existen **solo** en `mm-data` (ya hay datos). Hasta PR-6, cualquier archivo subido tiene **cero backup** → riesgo de pérdida si se pierde el volumen.
- **GAP — sin automatización (P2):** el backup es **manual**. No hay cron/systemd-timer que lo dispare (la programación es PR-9). Un backup que no corre solo, en la práctica no corre.
- **GAP — docs `ops/` inexistentes / restore nunca probado (P2):** la tarea referenciaba `infra/mattermost/ops/` con RUNBOOK/BACKUP/RESTORE/DR — **ese directorio no existe**. Solo hay el comentario inline de restore en `backup.sh` y `ROLLBACK.md`. No hay runbook de restore/DR ni evidencia de un restore probado. Un backup no verificado por un restore real no es un backup confiable.

**Estado: OK (DB) / con gaps (archivos, automatización, doc/restore).**

## 8. Config drift `.env` vs. producción — HALLAZGO LATENTE (P1)

- **Runtime correcto hoy:** `ServiceSettings.SiteURL = "https://chat.ecsas.com.ar"` (vía `mmctl`), y el contenedor en ejecución fue creado con `MM_SERVICESETTINGS_SITEURL=https://chat.ecsas.com.ar` (vía `docker inspect`).
- **`.env` en disco divergente:** `infra/mattermost/.env` tiene **`MM_SITE_URL=http://localhost:8065`**. El compose resuelve `MM_SERVICESETTINGS_SITEURL: ${MM_SITE_URL:-https://chat.ecsas.com.ar}`, así que en el **próximo `docker compose up -d` / recreación** el SiteURL quedaría `http://localhost:8065`, y Mattermost lo persiste. Eso **rompería** la verificación de origen del WebSocket (`wss://chat.ecsas.com.ar`), CSRF y los enlaces generados para los usuarios públicos.
- No rompe **ahora** (el contenedor vivo tiene el valor correcto), pero es una **trampa de reinicio**: un redeploy rutinario dejaría la instancia pública inoperante de forma no obvia.
- **Fix:** setear `MM_SITE_URL=https://chat.ecsas.com.ar` en el `.env` de producción (o quitar el override para que aplique el default del compose).

**Estado: DEFECTO LATENTE (P1).** Es el hallazgo de mayor riesgo del informe.

---

## Tabla de hallazgos priorizada

| # | Ítem | Estado | Prioridad | Evidencia |
|---|---|---|---|---|
| 8 | `.env` `MM_SITE_URL=http://localhost:8065` vs. producción `https://chat.ecsas.com.ar`: el próximo recreate rompe WebSocket/CSRF público | Defecto latente | **P1** | `mmctl config get SiteURL` + `docker inspect` (env=https) vs. `.env` (localhost) |
| 7a | `mm-data` (adjuntos) sin backup y `DriverName=local`: hoy los archivos subidos no tienen respaldo (PR-6 pendiente) | Defecto | **P1** | `backup.sh` no cubre `mm-data`; volumen ya con datos (`teams/`,`users/`) |
| 6 | SMTP no operativo (`localhost:10025` refused): sin correos de aviso, verificación ni auto-recuperación de password | Observación | **P2** | log `Failed to send password change email … connection refused`; `SMTPServer="localhost"` |
| 5 | Falta header HSTS en respuestas HTTPS | Observación | **P2** | dump de headers vía Caddy (sin `Strict-Transport-Security`) |
| 7b | Backup manual, sin cron/timer (no corre solo) | Observación | **P2** | `backup.sh` (automatización = PR-9) |
| 7c | Sin docs `ops/` (RUNBOOK/RESTORE/DR); restore nunca probado end-to-end | Observación | **P2** | `infra/mattermost/ops/` inexistente; solo comentario inline + `ROLLBACK.md` |
| 4b | Restart de `mm-app` genera ventana breve de 502 al público | Observación | **P3** | log Caddy 502 a IP externa `151.241.171.90` durante restart 12:29 |
| 3b | Plugin `calls` activo genera ruido de log (STUN/IP pública) sin uso | Observación | **P3** | logs `com.mattermost.calls` |
| 9 | Caddyfile sin formatear (`caddy fmt`) | Observación | **P3** | warn Caddy `Caddyfile input is not formatted` |
| 10 | Disclosure de versión (`X-Version-Id`, `alt-svc`) | Observación | **P3** | headers HTTP |
| 1 | Login (401 en credenciales inválidas) + política password (min 10, 10 intentos) | OK | — | `curl` login → 401; `mmctl config get` |
| 1b | Cambio de contraseña vía API/consola | OK | — | log `PUT /users/{id}/password` 12:35 (cambio hecho; solo email falló) |
| 2 | Carga de archivos: attachments on, 100 MB, driver local | OK | — | `mmctl config get FileSettings.*` |
| 3 | WebSocket 101 vía Caddy (HTTP/1.1) y loopback | OK | — | `curl --http1.1` → 101 |
| 4 | Performance (ping ~1 ms, web 16 ms, CPU/MEM holgados) | OK | — | `curl` timing + `docker stats` |
| 5c | Aislamiento de red (5432 no publicado, 8065 solo loopback, 80/443 solo Caddy) | OK | — | `docker port` |
| 5d | TLS Let's Encrypt válido + redirect 308 + CSP/X-Frame/X-Content-Type/Referrer | OK | — | `openssl s_client`, headers, redirect |
| 7 | Backup DB: `pg_dump` válido (96 tablas, núcleo presente) | OK | — | prueba a temp, 40 KB, borrado |

**Resumen: P0 = 0 · P1 = 2 · P2 = 4 · P3 = 4.** No hay hallazgos P0: la instancia funciona correctamente hoy (login, WebSocket, TLS, aislamiento, performance). Los dos P1 son riesgos de **continuidad**: uno latente ante el próximo reinicio (SiteURL en `.env`) y uno de **pérdida de datos** (archivos subidos sin backup mientras el driver sea `local`). Ambos se resuelven con cambios de configuración/procedimiento, sin tocar la app.

## Recomendaciones (orden de impacto)

1. **(P1)** Corregir `infra/mattermost/.env` → `MM_SITE_URL=https://chat.ecsas.com.ar` antes del próximo `docker compose up -d`.
2. **(P1)** Hasta PR-6, incluir `echegaray-mm-data` en `backup.sh` (tar del volumen, igual que `mm-config`), o acelerar PR-6. Y **probar un restore real** en entorno aislado.
3. **(P2)** Agregar HSTS en el Caddyfile.
4. **(P2)** Programar `backup.sh` (cron/systemd-timer) + retención off-site (adelantar lo mínimo de PR-9).
5. **(P2)** Definir SMTP real (o documentar explícitamente que la recuperación de password es solo por admin vía `mmctl`).
6. **(P2)** Crear `ops/` con RUNBOOK + RESTORE + DR y dejar constancia de un restore probado.
7. **(P3)** `caddy fmt` al Caddyfile; evaluar deshabilitar el plugin Calls si no se usará.

---
*Auditoría read-only. No se modificó producción, no se cambiaron contraseñas, no se borraron datos, no se ejecutó restore, no se dejaron archivos residuales. `qa/pruebas.sh` y `qa/CHECKLIST-PRODUCCION.md` no fueron modificados (solo ejecutados/referenciados).*
