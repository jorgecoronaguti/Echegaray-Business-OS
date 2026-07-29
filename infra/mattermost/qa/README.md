# QA de despliegue — Mattermost PR-2

Aparato de **QA, seguridad y operación** del despliegue de Mattermost. Todo acá es
**read-only y reproducible**: verifica, nunca muta infraestructura.

## Qué hay en esta carpeta

| Archivo | Para qué |
|---|---|
| `pruebas.sh` | Script de pruebas automatizadas read-only (DNS, SSL, WebSocket, health, aislamiento de red, recursos, logs, OS vivo). Distingue **roto** de **pendiente**. |
| `CHECKLIST-PRODUCCION.md` | Criterio de cierre del PR-2, ítem por ítem, con el **cómo** verificar cada uno (comando o paso). Mezcla lo automatizable con lo que sólo puede hacer el dueño. |
| `rollback-test.md` | Cómo **probar** el rollback de forma segura (verifica que al bajar el túnel MM queda en loopback, sin puertos abiertos, y el OS intacto). Referencia el `ROLLBACK.md` de WT1, no lo duplica. |

## Regla de oro

Este aparato **no muta infraestructura**: no reinicia contenedores, no toca el túnel, no
abre/cierra puertos, no corre el bootstrap. Sólo **lee y consulta**. La única acción mutante
que aparece (bajar/levantar el túnel, en `rollback-test.md`) la ejecuta **el dueño** y es
reversible.

## Orden de uso

1. **Correr el script** (en la VM, donde viven los contenedores):
   ```bash
   bash infra/mattermost/qa/pruebas.sh        # resumen
   bash infra/mattermost/qa/pruebas.sh -v     # con detalle (issuer del cert, líneas de log, etc.)
   ```
2. **Leer el resultado** (ver "Cómo interpretar" abajo).
3. **Completar el checklist** `CHECKLIST-PRODUCCION.md`: los ítems `(script §N)` los cubre
   el paso 1; los ítems **(manual)** los ejecuta el dueño.
4. **Probar el rollback** con `rollback-test.md` una vez que el túnel esté activo.

## Cómo interpretar el script

El script clasifica cada verificación y **sólo falla (exit 1) por regresiones reales**:

| Marca | Significado | ¿Afecta exit code? |
|---|---|---|
| `[ OK ]` | Algo que debía andar, anda. | no |
| `[PEND]` | Algo que **aún no fue activado** (túnel/DNS/app móvil). No es un fallo. | no |
| `[WARN]` | Señal blanda (memoria alta, log ruidoso, herramienta faltante). | no |
| `[FAIL]` | Algo que **YA debería andar está roto** (regresión). | **sí → exit 1** |

- **exit 0** = sano. Puede haber `PEND` (el túnel todavía no se levantó): es esperado.
- **exit 1** = hay una regresión: MM caído, puerto expuesto, OS inalcanzable, o el túnel
  activo pero sirviendo mal (SSL/WS roto).

Clave de diseño: **roto ≠ pendiente**. Mientras WT1 no active el túnel y el dueño no cargue
el CNAME, la sección §6 queda en `PEND` y el script **no** falla por eso.

### Qué valida cada sección

- **§1 Salud local** — contenedores healthy, ping loopback 200, `mmctl --local` OK, WebSocket local 101 (MM exige WS para tiempo real).
- **§2 Aislamiento de red** — Postgres 5432 **no** expuesto al host; MM sólo en `127.0.0.1:8065`, nunca `0.0.0.0`.
- **§3 Recursos** — `docker stats`; avisa si la memoria supera el umbral (`MEM_WARN_PCT`, def. 90%).
- **§4 Logs** — errores/critical/fatal en las últimas 200 líneas, **excluyendo** ruido benigno pre-bootstrap.
- **§5 Business OS** — `app.ecsas.com.ar` sigue respondiendo (independiente del aparato de comunicación).
- **§6 Exposición pública** — DNS, HTTPS (cert válido, no self-signed, no vencido) y WebSocket por el túnel. **PENDIENTE** hasta que el túnel esté activo; a partir de ahí, un fallo es real.

### Endpoints usados (oficiales de Mattermost)

- Health: `GET /api/v4/system/ping` → `{"status":"OK"}` (HTTP 200).
- Tiempo real: `GET /api/v4/websocket` con headers de upgrade → `101 Switching Protocols`.
- Estado interno: `mmctl --local system status` (socket local del contenedor, no expuesto).

### Parámetros (variables de entorno, con defaults reales)

`MM_CHAT_HOST` (`chat.ecsas.com.ar`) · `OS_HOST` (`app.ecsas.com.ar`) ·
`MM_LOOPBACK_HOST`/`MM_LOOPBACK_PORT` (`127.0.0.1`/`8065`) ·
`MM_APP_CTR`/`MM_DB_CTR` (`echegaray-mm-app`/`echegaray-mm-db`) ·
`MEM_WARN_PCT` (`90`) · `CURL_TIMEOUT` (`12`) · `WS_TIMEOUT` (`6`).

Ejemplo: `MEM_WARN_PCT=80 bash infra/mattermost/qa/pruebas.sh`.

### Dónde correrlo

**En la VM** (esta máquina): ahí están los contenedores y el loopback. Las secciones que
usan `docker`/`ss`/loopback necesitan estar en el host; las de red pública (§5, §6) también
funcionan desde afuera, pero el aislamiento (§2) sólo se ve desde la VM.

Requiere: `docker`, `curl` (imprescindibles); `dig`, `openssl`, `ss` (recomendados — si
faltan, esas verificaciones se omiten con `WARN`, no rompen el script).

## Qué necesita el dueño para cerrar el checklist

Acciones que **ningún script puede hacer** (las marca `(manual)` el checklist):

1. **Alta del CNAME** `chat.ecsas.com.ar` → túnel, en el panel DNS de **DonWeb**.
2. **Login/activación del túnel** de Cloudflare (paso OAuth de Cloudflare, sólo el dueño).
3. **Prueba con la app móvil oficial** de Mattermost (login real + mensaje en vivo).
4. **Ventana para el reboot de la VM** (prueba de que MM + túnel vuelven solos).
5. **Confirmar `/comunicacion` en `app.ecsas.com.ar`** (lo produce el worktree del OS).

## Estado al día de hoy (última corrida)

Con el túnel **aún no activado**: **exit 0**, 13 OK / 5 PENDIENTE / 0 FAIL.
- OK: contenedores healthy, ping loopback, mmctl, WebSocket local, aislamiento de Postgres,
  MM sólo en loopback, recursos, logs (ruido benigno pre-bootstrap), OS respondiendo.
- PENDIENTE: DNS de `chat`, túnel público, SSL, WebSocket público, app móvil.

Cuando WT1 active el túnel y el dueño cargue el CNAME, la §6 debe pasar a OK; cualquier
`FAIL` ahí será un problema real de SSL/WS/túnel a resolver antes de cerrar el PR.
