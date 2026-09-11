# Incidente 10/09/2026 — el worker de comunicación quedó colgado 23 horas

**Servicio:** `echegaray-comunicacion-worker.service` (PID 391401)
**Ventana:** 10/09 17:59:07 → 11/09 16:42:02 (**28 h 43 min** de reloj; 23 h de silencio hasta que
el dueño lo notó). Reiniciado a mano.
**Impacto medido:** el evento 139 de `comunicacion.inbox` —comprobantes del dueño, publicados a las
16:38 del 11/09— quedó en `pendiente`. Plata sin registrar, sin un solo control en rojo.

## Lo que se vio

```
Sep 10 17:59:07 comunicacion-worker[391401]: {"nivel":"error",
  "mensaje":"vencer sesiones de asistencia falló (se reintenta al próximo intervalo)",
  "error":"terminating connection due to administrator command"}
   … y después NADA durante 23 horas.
Sep 11 16:41:42 systemd: Stopping …                          ← SIGTERM
Sep 11 16:42:02 systemd: State 'stop-sigterm' timed out. Killing.   ← hubo que SIGKILL
```

`systemctl` lo veía **`active`**. CPU 0. RSS 824 KB. `Restart=always` ya estaba puesto y no sirvió
de nada: **el proceso nunca murió.** Ni siquiera atendió el SIGTERM, porque el `while` del bucle no
volvió a mirar la bandera de parada.

## Causa raíz

Supabase reinició del lado del servidor (57P01, `admin_shutdown`). Tres defectos encadenados:

1. **`orquestador/lib/db.mjs` creaba el pool sin un solo límite de tiempo.** `pg` trae
   `connectionTimeoutMillis: 0` (infinito) y `query_timeout: undefined` por defecto. Sobre un socket
   medio abierto, `pool.connect()` y `client.query()` devuelven una promesa que **no se cumple ni se
   rechaza nunca**. Un `await` así no se puede atrapar con `try/catch`: no lanza, no vuelve.
2. **El error del POOL no tenía listener.** `pg` emite `'error'` en el pool cuando se muere un
   cliente *ocioso* — nadie lo está esperando, así que no aparece en ningún `await`.
3. **No había latido.** El bucle (`worker-comunicacion.mjs`) tenía `try/catch` alrededor del tick y
   nada que notara la ausencia de ticks. El único testigo del silencio era una persona.

El barrido de sesiones tragó el primer 57P01 por diseño (`crearVencedorPeriodico` no propaga: un
recordatorio roto no debe voltear el canal). Eso no es el defecto: es lo que dejó la única línea de
log. El defecto es la espera infinita del `await` siguiente.

El consumidor WS (PID 391278) sobrevivió al mismo corte y siguió escribiendo el inbox: es
event-driven y su camino volvió a pedir conexión. El worker, con el bucle detenido, no volvió nunca.

## La regla

**No hay reconexión mágica ni reintento infinito: ante una conexión perdida se LOGUEA y se SALE con
código ≠ 0.** Morir y renacer es el diseño (12-factor): todo el estado vive en la base con leases, y
un reinicio no pierde nada. Salida **75** (`EX_TEMPFAIL`), distinta de 1 (mala configuración), para
que el journal distinga un reinicio por red de algo que reiniciar no arregla.

**Y encima de la regla, el latido:** si pasan N intervalos sin completar un tick, el proceso sale
igual, sin clasificar nada. Ninguna lista de errores es completa; el silencio sí se puede medir.

## Lo que quedó en el código

| Archivo | Qué hace |
|---|---|
| `orquestador/lib/conexion-perdida.mjs` | `esConexionPerdida()` (SQLSTATE 57P0x/08xxx/53300, errno de socket, las frases de `pg`) y `crearLatido()`. Puro: no importa `pg`, no abre sockets. |
| `orquestador/lib/db.mjs` | pool con `connectionTimeoutMillis` 15 s, `query_timeout` 5 min, `keepAlive`, y `pool.on('error')` → `alPerderLaConexion()`. |
| `orquestador/comunicacion/worker-comunicacion.mjs` | bucle extraído a `correrBucle()` (testeable), latido a 5 × `vencer_sesiones_ms` (mín. 3 min), salida 75 ante corte, y guarda de import para que importarlo no arranque el worker. |
| `orquestador/comunicacion/mattermost-ws-consumer.mjs` · `servidor-entrante.mjs` | comparten el pool ⇒ salida 75 ante corte del pool. **Sin latido por tiempo**: en estos dos el silencio es legítimo (un día sin mensajes, un servidor HTTP ocioso) y un latido daría falsos positivos. |
| `orquestador/comunicacion/conexion-perdida.test.mjs` | 12 tests. El primero **reproduce el cuelgue**: copia literal del bucle viejo + un pool falso que devuelve 57P01 y después cuelga ⇒ nunca termina. Si ese test dejara de colgarse, perdió su objeto. |

Los límites son generosos a propósito: no están para cortar una consulta lenta (hay scripts de este
repo que tardan minutos) sino para que **ninguna espera sea infinita**. Se pueden mover con
`ORQ_DB_CONNECT_TIMEOUT_MS`, `ORQ_DB_QUERY_TIMEOUT_MS`, `COMM_WORKER_LATIDO_MS`.

## Lo que NO cubre

- Las unidades systemd ya tenían `Restart=always` + `RestartSec=5`: **no hace falta tocarlas.**
- Un cuelgue con el **event loop bloqueado** (CPU al 100%) no lo caza el latido, porque el `setInterval`
  tampoco correría. Para eso haría falta `WatchdogSec` en la unidad + `sd_notify`, que no se hizo.
- Nada vigila que el inbox **avance**: un worker que tickea sano pero deja eventos `pendiente` por
  otra razón sigue siendo invisible. Falta una sonda de antigüedad máxima de `comunicacion.inbox`.
- Lo que reinicia es systemd. Si el que se muere es systemd o la VM, esto no dice nada.
