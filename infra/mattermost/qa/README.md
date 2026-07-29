# QA de despliegue — Mattermost PR-2 (Path B: Caddy)

Aparato de **QA, seguridad y operación** del despliegue de Mattermost. Todo acá es
**read-only y reproducible**: verifica, nunca muta infraestructura.

> **Arquitectura (Path B, elegida por el dueño):** Mattermost se publica por un **reverse
> proxy Caddy** (`echegaray-mm-caddy`, contenedor del compose) que escucha en **80/443** y
> termina TLS con **Let's Encrypt / ZeroSSL** (ACME automático), y hace `reverse_proxy` a
> `mattermost:8065` por la red interna. **NO se usa Cloudflare Tunnel.** Mattermost sigue
> publicando sólo `127.0.0.1:8065` en el host; Postgres sigue sin publicar puertos.

## Qué hay en esta carpeta

| Archivo | Para qué |
|---|---|
| `pruebas.sh` | Script de pruebas automatizadas read-only (DNS, HTTPS/SSL por Caddy, redirección 80→443, WebSocket, health, aislamiento de red, recursos, logs, OS vivo). Distingue **roto** de **pendiente**. |
| `CHECKLIST-PRODUCCION.md` | Criterio de cierre del PR-2, ítem por ítem, con el **cómo** verificar cada uno (comando o paso). Mezcla lo automatizable con lo que sólo puede hacer el dueño. |
| `rollback-test.md` | Cómo **probar** el rollback de forma segura (verifica que al parar Caddy, 80/443 dejan de responder, MM queda en loopback, y el OS intacto). Referencia `infra/mattermost/ROLLBACK.md`, no lo duplica. |

El instructivo de **activación paso a paso** (Nivel E, acción del dueño) vive un nivel más
arriba: `infra/mattermost/ACTIVACION-NIVEL-E.md`.

## Regla de oro

Este aparato **no muta infraestructura**: no levanta/reinicia contenedores, no toca Caddy, no
abre/cierra puertos, no corre el bootstrap, no saca ni renueva certificados. Sólo **lee y
consulta**. La única acción mutante que aparece (parar/levantar Caddy, en `rollback-test.md`)
la ejecuta **el dueño** y es reversible.

## Orden de uso

1. **Correr el script** (en la VM, donde viven los contenedores):
   ```bash
   bash infra/mattermost/qa/pruebas.sh        # resumen
   bash infra/mattermost/qa/pruebas.sh -v     # con detalle (issuer del cert, líneas de log, etc.)
   ```
2. **Leer el resultado** (ver "Cómo interpretar" abajo).
3. **Completar el checklist** `CHECKLIST-PRODUCCION.md`: los ítems `(script §N)` los cubre
   el paso 1; los ítems **(manual)** los ejecuta el dueño (ver `ACTIVACION-NIVEL-E.md`).
4. **Probar el rollback** con `rollback-test.md` una vez que Caddy esté activo.

## Cómo interpretar el script

El script clasifica cada verificación y **sólo falla (exit 1) por regresiones reales**:

| Marca | Significado | ¿Afecta exit code? |
|---|---|---|
| `[ OK ]` | Algo que debía andar, anda. | no |
| `[PEND]` | Algo que **aún no fue activado** (Caddy sin levantar, A record sin propagar, cert provisionando, app móvil). No es un fallo. | no |
| `[WARN]` | Señal blanda (memoria alta, log ruidoso, herramienta faltante, DNS a IP inesperada). | no |
| `[FAIL]` | Algo que **YA debería andar está roto** (regresión). | **sí → exit 1** |

- **exit 0** = sano. Puede haber `PEND` (Caddy todavía no se levantó / DNS sin propagar): es esperado.
- **exit 1** = hay una regresión: MM caído, puerto expuesto (5432 o 8065 en 0.0.0.0), OS
  inalcanzable, o Caddy activo pero sirviendo mal (SSL self-signed/vencido, WS roto, 80 caído).

Clave de diseño: **roto ≠ pendiente**. Mientras Caddy no se levante y el dueño no cargue el
A record, la sección §6 queda en `PEND` y el script **no** falla por eso. El script distingue
tres motivos de PENDIENTE en §6: (a) Caddy no desplegado, (b) A record sin propagar, (c) Caddy
arriba pero el cert de Let's Encrypt/ZeroSSL todavía provisionando.

### Qué valida cada sección

- **§1 Salud local** — contenedores healthy, ping loopback 200, `mmctl --local` OK, WebSocket local 101 (MM exige WS para tiempo real).
- **§2 Aislamiento de red** — Postgres 5432 **no** expuesto al host; MM sólo en `127.0.0.1:8065`, nunca `0.0.0.0`. (80/443 sí se abren, los publica Caddy — se verifican en §6.)
- **§3 Recursos** — `docker stats` de MM, DB y Caddy (si existe); avisa si la memoria supera el umbral (`MEM_WARN_PCT`, def. 90%).
- **§4 Logs** — errores/critical/fatal en las últimas 200 líneas de MM, DB y Caddy, **excluyendo** ruido benigno pre-activación (MM: `Failed to get system bot`; Caddy: reintentos de ACME mientras no hay DNS/cert).
- **§5 Business OS** — `app.ecsas.com.ar` sigue respondiendo (independiente del aparato de comunicación).
- **§6 Exposición pública por Caddy** — contenedor Caddy running, 80/443 publicados, DNS del `chat` a la IP de la VM, HTTPS 200, cert válido (cadena confiable, no self-signed, no vencido), redirección 80→443, y WebSocket público 101. **PENDIENTE** hasta que Caddy publique; a partir de ahí, un fallo es real.

### Endpoints y comportamiento verificados

- Health de Mattermost: `GET /api/v4/system/ping` → `{"status":"OK"}` (HTTP 200).
- Tiempo real: `GET /api/v4/websocket` con headers de upgrade → `101 Switching Protocols` (Caddy pasa el `Upgrade` transparente vía `reverse_proxy`).
- Estado interno: `mmctl --local system status` (socket local del contenedor, no expuesto).
- TLS de Caddy: **Let's Encrypt / ZeroSSL** (las dos CAs por defecto de Caddy; si una falla, prueba la otra). Caddy redirige 80→443 y resuelve el reto **ACME HTTP-01** en el puerto 80.

### Parámetros (variables de entorno, con defaults reales)

`MM_CHAT_HOST` (`chat.ecsas.com.ar`) · `MM_EXPECTED_IP` (`64.176.22.159`) ·
`OS_HOST` (`app.ecsas.com.ar`) · `MM_LOOPBACK_HOST`/`MM_LOOPBACK_PORT` (`127.0.0.1`/`8065`) ·
`MM_APP_CTR`/`MM_DB_CTR`/`MM_CADDY_CTR` (`echegaray-mm-app`/`echegaray-mm-db`/`echegaray-mm-caddy`) ·
`MEM_WARN_PCT` (`90`) · `CURL_TIMEOUT` (`12`) · `WS_TIMEOUT` (`6`).

Ejemplo: `MEM_WARN_PCT=80 bash infra/mattermost/qa/pruebas.sh`.

### Dónde correrlo

**En la VM** (esta máquina, IP `64.176.22.159`): ahí están los contenedores y el loopback.
Las secciones que usan `docker`/`ss`/loopback necesitan estar en el host; las de red pública
(§5, §6) también funcionan desde afuera, pero el aislamiento (§2) y la señal local de Caddy
(contenedor running, 80/443 en el host) sólo se ven desde la VM.

Requiere: `docker`, `curl` (imprescindibles); `dig`, `openssl`, `ss` (recomendados — si
faltan, esas verificaciones se omiten con `WARN`, no rompen el script).

## Qué necesita el dueño para cerrar el checklist

Acciones que **ningún script puede hacer** (las marca `(manual)` el checklist; el instructivo
copy-paste está en `infra/mattermost/ACTIVACION-NIVEL-E.md`):

1. **Abrir 80/443 entrantes** en el firewall de la VM (Vultr).
2. **Alta del A record** `chat.ecsas.com.ar` → `64.176.22.159`, en el panel DNS de **DonWeb**.
3. **Levantar Caddy** (`docker compose up -d caddy`) — Caddy saca el cert de Let's Encrypt solo.
4. **Prueba con la app móvil oficial** de Mattermost en Android y iPhone (login real + mensaje en vivo + push).
5. **Ventana para el reboot de la VM** (prueba de que MM + Caddy vuelven solos).
6. **Confirmar `/comunicacion` en `app.ecsas.com.ar`** (lo produce el worktree del OS).

## Estado al día de hoy (última corrida, en la VM)

Con Caddy **aún no desplegado** y sin A record: **exit 0**, **13 OK / 7 PENDIENTE / 0 FAIL**.
- OK: contenedores healthy, ping loopback, mmctl, WebSocket local, aislamiento de Postgres,
  MM sólo en loopback, recursos, logs (ruido benigno pre-activación), OS respondiendo.
- PENDIENTE: Caddy no desplegado, DNS del `chat`, HTTPS público, SSL, redirección 80→443,
  WebSocket público, app móvil.

Cuando el dueño active Path B (firewall 80/443 + A record + `docker compose up -d caddy`), la
§6 debe pasar a OK; cualquier `FAIL` ahí será un problema real de SSL/WS/Caddy a resolver
antes de cerrar el PR.
