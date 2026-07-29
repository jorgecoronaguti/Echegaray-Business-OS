# Checklist de cierre — PR-2 (Exposición pública estable de Mattermost · Path B: Caddy)

Criterio de cierre del PR-2. **No se da por cerrado el PR hasta que todos los ítems
NO opcionales estén en `[x]`.** Cada ítem dice **cómo** verificarlo (comando o paso concreto).

Convención de estado:
- `[ ]` pendiente · `[x]` verificado · `[~]` en curso · `[-]` no aplica

Lo automatizable se verifica de una con el script: `bash infra/mattermost/qa/pruebas.sh`.
Los ítems marcados **(manual)** requieren una acción del dueño que ningún script puede hacer
(alta de DNS en DonWeb, abrir 80/443 en el firewall del proveedor, app móvil real, reboot de la VM).

> **Arquitectura de este PR (Path B, elegida por el dueño):** Mattermost se publica por un
> **reverse proxy Caddy** (`echegaray-mm-caddy`, contenedor del compose) que escucha en
> **80/443** y termina TLS con **Let's Encrypt / ZeroSSL** (ACME automático), y hace
> `reverse_proxy` a `mattermost:8065` por la red interna. **NO se usa Cloudflare Tunnel.**
>
> **Regla de oro de este PR:** los únicos puertos entrantes que se abren son **80 y 443
> (Caddy)**. Mattermost sigue **sólo en `127.0.0.1:8065`** y Postgres **sin ningún puerto
> publicado**. Si aparece `0.0.0.0:8065` o `0.0.0.0:5432` en la VM, el PR está mal y no cierra.

---

## A. Base local sana (heredado de PR-1, no debe romperse)

- [ ] **Contenedores healthy** — `docker inspect --format '{{.State.Health.Status}}' echegaray-mm-app echegaray-mm-db` → ambos `healthy`. *(script §1)*
- [ ] **MM responde en loopback** — `curl -f http://127.0.0.1:8065/api/v4/system/ping` → `{"status":"OK"}`. *(script §1)*
- [ ] **mmctl interno OK** — `docker exec echegaray-mm-app /mattermost/bin/mmctl --local system status` → `Server status: OK`, `Database Status: OK`, `Filestore Status: OK`. *(script §1)*
- [ ] **WebSocket local funciona** — MM exige WS para tiempo real. Upgrade sobre `http://127.0.0.1:8065/api/v4/websocket` → `101 Switching Protocols`. *(script §1)*

## B. Aislamiento y superficie de red (lo central de seguridad del PR)

- [ ] **Postgres NO expuesto al host** — `ss -ltn | grep 5432` → **sin resultado** (la base sólo vive en la red interna del compose). *(script §2)*
- [ ] **MM escucha SÓLO en loopback** — `ss -ltn | grep 8065` → `127.0.0.1:8065`, **nunca** `0.0.0.0:8065`. Caddy lo alcanza por la red interna (`mattermost:8065`), no por un puerto del host. *(script §2)*
- [ ] **Los únicos puertos entrantes nuevos son 80 y 443 (Caddy)** — `ss -ltn | grep -E ':(80|443)$'` → aparecen 80 y 443 (los publica Caddy). **Ningún otro** puerto entrante nuevo (ni 8065 ni 5432 al exterior). *(script §2 y §6)*
- [ ] **(manual)** **Firewall/red del proveedor** — en el panel de la VM (Vultr) el tráfico entrante permitido es **sólo 80/443** (Caddy/ACME) y el SSH de administración. 8065 y 5432 **nunca** se abren al exterior.

## C. Exposición pública por Caddy (reverse proxy)

- [ ] **(manual)** **A record en DonWeb** — `chat.ecsas.com.ar` → **A** `64.176.22.159` (IP pública de la VM), TTL 3600. Alta hecha en el panel DNS de DonWeb por el dueño. **No** se tocan MX/SPF/DKIM/DMARC.
- [ ] **DNS resuelve a la IP de la VM** — `dig +short chat.ecsas.com.ar A` → `64.176.22.159`. *(script §6)*
- [ ] **Contenedor Caddy corriendo** — `docker inspect --format '{{.State.Status}}' echegaray-mm-caddy` → `running`. Corre dentro del compose con `restart: unless-stopped` (vuelve solo tras reboot). *(script §6)*
- [ ] **chat.ecsas.com.ar accesible por HTTPS** — `curl -I https://chat.ecsas.com.ar/api/v4/system/ping` → `HTTP/2 200`. *(script §6)*

## D. HTTPS válido de punta a punta (Let's Encrypt / ZeroSSL vía ACME)

- [ ] **Certificado válido y de cadena confiable** — `echo | openssl s_client -connect chat.ecsas.com.ar:443 -servername chat.ecsas.com.ar 2>/dev/null | grep 'Verify return code'` → `0 (ok)`. *(script §6)*
- [ ] **No self-signed** — en el mismo output, `subject` ≠ `issuer`. El emisor es una CA pública real: **Let's Encrypt** o **ZeroSSL** (las dos CAs por defecto de Caddy), **no** el certificado interno de Caddy. *(script §6)*
- [ ] **Certificado no vencido / con margen** — `... | openssl x509 -noout -enddate` y confirmar > 7 días de vigencia. Caddy renueva solo. *(script §6)*
- [ ] **Redirección HTTP → HTTPS** — `curl -I http://chat.ecsas.com.ar/` → `3xx` a `https://` (Caddy redirige 80→443 por defecto y sirve el reto ACME en 80). *(script §6)*

## E. WebSocket en tiempo real por Caddy

- [ ] **WS público hace upgrade** — MM no funciona en tiempo real sin WebSocket. Caddy pasa el `Upgrade` de forma transparente (`reverse_proxy`). Upgrade sobre `https://chat.ecsas.com.ar/api/v4/websocket` → `101`. *(script §6)*
- [ ] **SiteURL coherente** — `MM_SITE_URL` (en `.env`) = `https://chat.ecsas.com.ar`. Con una SiteURL incorrecta, MM rechaza el origin del WebSocket. Verificar en la config efectiva: `docker exec echegaray-mm-app /mattermost/bin/mmctl --local config get ServiceSettings.SiteURL`.

## F. App móvil oficial (validación de uso real)

- [ ] **(manual)** **App móvil conecta (Android)** — en la app oficial *Mattermost*, servidor `https://chat.ecsas.com.ar`, iniciar sesión con una cuenta real. Debe conectar, cargar canales y **recibir mensajes en vivo** (prueba directa de que el WebSocket llega hasta el móvil).
- [ ] **(manual)** **App móvil conecta (iPhone)** — idem en iOS.
- [ ] **(manual)** **Notificaciones push** — enviar un mensaje desde otro dispositivo y confirmar que llega la notificación (TPNS de Mattermost). Si queda para un PR posterior, marcar `[-]` y anotarlo.

## G. Bootstrap reproducible y contenido esperado (WT2 — se VALIDA acá, no se ejecuta)

- [ ] **Bootstrap reproducible** — el script de bootstrap se puede volver a correr sin romper estado (idempotente). Revisar su README y correrlo en seco si expone `--dry-run`. *(NO lo corre este worktree)*
- [ ] **Equipo y canales creados** — `docker exec echegaray-mm-app /mattermost/bin/mmctl --local team list` y `... channel list <team>` muestran el equipo y los canales que define el bootstrap.
- [ ] **Admin existe** — `... mmctl --local user list` incluye al menos un system admin (esto además apaga el ruido benigno `List of admins is empty` de los logs).

## H. El Business OS no se ve afectado

- [ ] **OS sigue respondiendo** — `curl -I https://app.ecsas.com.ar/` → responde (2xx/3xx). El aparato de comunicación es independiente; nada de PR-2 debe degradar el OS. *(script §5)*
- [ ] **(manual)** **/comunicacion disponible en app.ecsas.com.ar** — la sección/enlace de comunicación del OS abre y apunta a `https://chat.ecsas.com.ar`. *(la produce el worktree de OS; acá se valida que exista y enlace bien)*
- [ ] **Supabase/Drive intactos** — PR-2 no toca la base del OS (Supabase Cloud) ni Drive. Confirmar que no hubo cambios de esas integraciones en el diff del PR.

## I. Resiliencia y operación

- [ ] **Reinicio automático de contenedores** — política `unless-stopped` activa en MM, DB **y Caddy**: `docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' echegaray-mm-app echegaray-mm-db echegaray-mm-caddy` → `unless-stopped`.
- [ ] **(manual)** **Supervivencia a reinicio de la VM** — tras un reboot planificado, MM + DB + Caddy vuelven solos: contenedores `healthy`/`running` + `curl -I https://chat.ecsas.com.ar/api/v4/system/ping` → 200. Caddy reusa el cert de sus volúmenes (`caddy_data`), no re-emite. *(prueba de humo; coordinar ventana con el dueño)*
- [ ] **Persistencia del certificado** — el cert y la cuenta ACME viven en volúmenes con nombre (`caddy_data`/`caddy_config`), así un reinicio de Caddy no re-tramita el cert (evita rate limits de Let's Encrypt). `docker volume ls | grep caddy`.
- [ ] **Consumo dentro de límites** — `docker stats --no-stream` muestra memoria por debajo de los límites del compose (MM 1536M, DB 512M, Caddy liviano). *(script §3)*
- [ ] **Logs sin errores inesperados** — `docker logs --tail 200 echegaray-mm-app` (y `echegaray-mm-caddy`) sin `error/critical/fatal` fuera del ruido benigno pre-activación. *(script §4)*

## J. Rollback probado

- [ ] **Procedimiento de rollback existe** — `infra/mattermost/ROLLBACK.md` documenta cómo revertir la exposición pública (bajar Caddy + quitar el A record). *(no se duplica acá)*
- [ ] **Rollback verificado en seguro** — seguir `infra/mattermost/qa/rollback-test.md`: al parar Caddy, 443/80 dejan de responder desde afuera, MM queda **sólo en loopback**, Postgres sigue sin listener, y el OS sigue intacto. *(verificación read-only + una acción reversible del dueño)*

---

## Cómo se llena este checklist

1. Correr `bash infra/mattermost/qa/pruebas.sh` → cubre automáticamente los ítems marcados *(script §N)*.
2. Los ítems **(manual)** los ejecuta/confirma el dueño (A record, firewall, app móvil, reboot). El instructivo paso a paso está en `infra/mattermost/ACTIVACION-NIVEL-E.md`.
3. El PR-2 cierra cuando: **A, B, C, D, E, H, I, J** están en `[x]`; **F y G** validados (o anotados si algún subítem se difiere a otro PR).
