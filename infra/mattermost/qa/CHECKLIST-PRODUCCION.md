# Checklist de cierre — PR-2 (Exposición pública estable de Mattermost)

Criterio de cierre del PR-2. **No se da por cerrado el PR hasta que todos los ítems
NO opcionales estén en `[x]`.** Cada ítem dice **cómo** verificarlo (comando o paso concreto).

Convención de estado:
- `[ ]` pendiente · `[x]` verificado · `[~]` en curso · `[-]` no aplica

Lo automatizable se verifica de una con el script: `bash infra/mattermost/qa/pruebas.sh`.
Los ítems marcados **(manual)** requieren una acción del dueño que ningún script puede hacer
(login OAuth, app móvil real, alta de DNS en el panel de DonWeb).

> Regla de oro de este PR: **Mattermost nunca expone puertos entrantes.** Se publica
> exclusivamente por el túnel saliente de Cloudflare. Si en algún momento aparece
> `0.0.0.0:8065` o `0.0.0.0:5432` en la VM, el PR está mal y no cierra.

---

## A. Base local sana (heredado de PR-1, no debe romperse)

- [ ] **Contenedores healthy** — `docker inspect --format '{{.State.Health.Status}}' echegaray-mm-app echegaray-mm-db` → ambos `healthy`. *(script §1)*
- [ ] **MM responde en loopback** — `curl -f http://127.0.0.1:8065/api/v4/system/ping` → `{"status":"OK"}`. *(script §1)*
- [ ] **mmctl interno OK** — `docker exec echegaray-mm-app /mattermost/bin/mmctl --local system status` → `Server status: OK`, `Database Status: OK`, `Filestore Status: OK`. *(script §1)*
- [ ] **WebSocket local funciona** — MM exige WS para tiempo real. Upgrade sobre `http://127.0.0.1:8065/api/v4/websocket` → `101 Switching Protocols`. *(script §1)*

## B. Aislamiento y superficie de red (lo central de seguridad del PR)

- [ ] **Postgres NO expuesto al host** — `ss -ltn | grep 5432` → **sin resultado** (la base sólo vive en la red interna del compose). *(script §2)*
- [ ] **MM escucha SÓLO en loopback** — `ss -ltn | grep 8065` → `127.0.0.1:8065`, **nunca** `0.0.0.0:8065`. La entrada pública llega por el túnel, no por un puerto abierto. *(script §2)*
- [ ] **No se abrieron puertos entrantes nuevos** — comparar la superficie de escucha antes/después de levantar el túnel: `ss -ltnp`. El túnel de Cloudflare es una **conexión saliente**; no debe aparecer ningún listener nuevo hacia el exterior.
- [ ] **(manual)** **Firewall/red del proveedor** — confirmar que no se abrió 8065/5432 en el panel de la VM/proveedor. El único tráfico entrante legítimo a la VM es el del agente `cloudflared` hacia Cloudflare (saliente).

## C. Exposición pública por Cloudflare Tunnel (WT1)

- [ ] **(manual)** **CNAME en DonWeb** — `chat.ecsas.com.ar` apunta al túnel (`<UUID>.cfargotunnel.com`). Alta hecha en el panel DNS de DonWeb por el dueño.
- [ ] **DNS resuelve** — `dig +short chat.ecsas.com.ar` devuelve respuesta. *(script §6)*
- [ ] **chat.ecsas.com.ar accesible** — `curl -I https://chat.ecsas.com.ar/api/v4/system/ping` → `HTTP/2 200`. *(script §6)*
- [ ] **Túnel con reinicio automático** — el `cloudflared` corre como servicio administrado (systemd), no como proceso suelto de una terminal. Verificar: `systemctl is-enabled cloudflared` → `enabled`, `systemctl is-active cloudflared` → `active`. *(lo instala/documenta WT1)*

## D. HTTPS válido de punta a punta

- [ ] **Certificado válido y de cadena confiable** — `echo | openssl s_client -connect chat.ecsas.com.ar:443 -servername chat.ecsas.com.ar 2>/dev/null | grep 'Verify return code'` → `0 (ok)`. *(script §6)*
- [ ] **No self-signed** — en el mismo output, `subject` ≠ `issuer` (emisor es una CA real: Cloudflare / Google Trust Services, no el propio host). *(script §6)*
- [ ] **Certificado no vencido / con margen** — `... | openssl x509 -noout -enddate` y confirmar > 7 días de vigencia. *(script §6)*

## E. WebSocket en tiempo real por el túnel

- [ ] **WS público hace upgrade** — MM no funciona en tiempo real sin WebSocket a través del túnel. Upgrade sobre `https://chat.ecsas.com.ar/api/v4/websocket` → `101`. Si el túnel corta el `Upgrade`, el chat carga pero no actualiza en vivo. *(script §6)*
- [ ] **SiteURL coherente** — `MM_SITE_URL` (en `.env`) = `https://chat.ecsas.com.ar`. Con una SiteURL incorrecta, MM rechaza el origin del WebSocket. Verificar en la config efectiva: `docker exec echegaray-mm-app /mattermost/bin/mmctl --local config get ServiceSettings.SiteURL`.

## F. App móvil oficial (validación de uso real)

- [ ] **(manual)** **App móvil conecta** — en la app oficial *Mattermost* (iOS/Android), servidor `https://chat.ecsas.com.ar`, iniciar sesión con una cuenta real. Debe conectar, cargar canales y **recibir mensajes en vivo** (prueba directa de que el WebSocket llega hasta el móvil).
- [ ] **(manual)** **Notificaciones push** — enviar un mensaje desde otro dispositivo y confirmar que llega la notificación (si PR-2 incluye push; si queda para un PR posterior, marcar `[-]` y anotarlo).

## G. Bootstrap reproducible y contenido esperado (WT2 — se VALIDA acá, no se ejecuta)

- [ ] **Bootstrap reproducible** — el script de WT2 se puede volver a correr sin romper estado (idempotente). Revisar su README y correrlo en seco si expone `--dry-run`. *(NO lo corre este worktree)*
- [ ] **Equipo y canales creados** — `docker exec echegaray-mm-app /mattermost/bin/mmctl --local team list` y `... channel list <team>` muestran el equipo y los canales que define WT2.
- [ ] **Admin existe** — `... mmctl --local user list` incluye al menos un system admin (esto además apaga el ruido benigno `List of admins is empty` de los logs).

## H. El Business OS no se ve afectado

- [ ] **OS sigue respondiendo** — `curl -I https://app.ecsas.com.ar/` → responde (2xx/3xx). El aparato de comunicación es independiente; nada de PR-2 debe degradar el OS. *(script §5)*
- [ ] **(manual)** **/comunicacion disponible en app.ecsas.com.ar** — la sección/enlace de comunicación del OS abre y apunta a `https://chat.ecsas.com.ar`. *(la produce el worktree de OS; acá se valida que exista y enlace bien)*
- [ ] **Supabase/Drive intactos** — PR-2 no toca la base del OS (Supabase Cloud) ni Drive. Confirmar que no hubo cambios de esas integraciones en el diff del PR.

## I. Resiliencia y operación

- [ ] **Reinicio automático de contenedores** — política `unless-stopped` activa: `docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' echegaray-mm-app echegaray-mm-db` → `unless-stopped`.
- [ ] **(manual)** **Supervivencia a reinicio de la VM** — tras un reboot planificado de la VM, MM y el túnel vuelven solos: contenedores `healthy` + `systemctl is-active cloudflared` → `active` + `curl -I https://chat.ecsas.com.ar/api/v4/system/ping` → 200. *(prueba de humo; coordinar ventana con el dueño)*
- [ ] **Consumo dentro de límites** — `docker stats --no-stream` muestra memoria por debajo de los límites del compose (MM 1536M, DB 512M). *(script §3)*
- [ ] **Logs sin errores inesperados** — `docker logs --tail 200 echegaray-mm-app` sin `error/critical/fatal` fuera del ruido benigno pre-bootstrap. *(script §4)*

## J. Rollback probado

- [ ] **Procedimiento de rollback existe** — `ROLLBACK.md` producido por WT1 (Cloudflare Tunnel), documentado y ubicado junto a la config del túnel. *(no se duplica acá)*
- [ ] **Rollback verificado en seguro** — seguir `infra/mattermost/qa/rollback-test.md`: al bajar el túnel, MM queda **sólo en loopback**, no quedan puertos abiertos, y el OS sigue intacto. *(verificación read-only + una acción reversible del dueño)*

---

## Cómo se llena este checklist

1. Correr `bash infra/mattermost/qa/pruebas.sh` → cubre automáticamente los ítems marcados *(script §N)*.
2. Los ítems **(manual)** los ejecuta/confirma el dueño (login, app móvil, DNS, reboot).
3. El PR-2 cierra cuando: **A, B, C, D, E, H, I, J** están en `[x]`; **F y G** validados (o anotados si algún subítem se difiere a otro PR).
