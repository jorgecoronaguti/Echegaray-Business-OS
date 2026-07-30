# Módulo Asistencia — documentación definitiva

> Estado: **CERRADO** en `main` (tag `asistencia-v1.0`). En producción desde el 30/07/2026.
> Este documento reemplaza a cualquier descripción anterior del módulo. Los documentos
> `PR-4.1-*`, `PR-4.2-*` y `PR-4-ARQUITECTURA.md` son **histórico de construcción**: describen
> cómo se llegó acá, no cómo funciona hoy.
> El runbook operativo del día a día (comandos, permisos, corregir una carga) vive en
> [`OPERACION-ASISTENCIA.md`](./OPERACION-ASISTENCIA.md) y sigue vigente.

---

## 1. Qué resuelve

El jefe de obra anota la asistencia en papel; alguien de administración la vuelca a la planilla
JORNALES; los errores aparecen en la quincena. El módulo permite que la asistencia se cargue y
se consulte **desde el celular, escribiendo en castellano**, con la escritura en la planilla real
hecha por código determinístico y auditada celda por celda.

Contribución a la misión: menos trabajo humano de recarga, el dato de HH llega antes y con
trazabilidad, y la línea de jornales del cash flow deja de depender de un volcado manual.

## 2. Principio de diseño — dónde está permitida la IA y dónde no

Es la regla que gobierna todo el módulo y la razón de su arquitectura:

| Decisión | Quién la toma |
|---|---|
| Qué especialista atiende el mensaje | **Director** (determinístico primero, modelo sólo si hay ambigüedad) |
| Qué significa `3 ausente` | Gramática del especialista — **código** |
| Qué fila corresponde al trabajador | **Código** (identidad estructural sobre la planilla releída) |
| Qué columna corresponde a la fecha | **Código** (`jornales-estructura.mjs`) |
| Cuántas horas se guardan | **Código** (`horas-extra.mjs`, normalización + validación) |
| Cómo se conserva una fórmula | **Código** (fingerprint de celda + fórmula preservada) |
| Cómo se resuelve una colisión | **Código** (concurrencia optimista, re-lectura + re-resolución) |
| Cómo se aplica la idempotencia | **Código** (clave estable SHA-256 de un solo uso) |

**Ningún modelo se interpone entre una marca del jefe y la modificación de una celda.** El modelo,
cuando interviene, sólo elige destinatario dentro de una lista cerrada de especialistas
registrados; si no hay motor disponible no adivina, responde el catálogo.

---

## 3. Arquitectura

```
  Jefe de obra
      │  mensaje en #asistencia (canal privado) o DM a @os
      ▼
┌──────────────────────────────────────────────────────────────────┐
│ TRANSPORTE — mattermost-ws-consumer.mjs        (systemd: …-ws)   │
│ WebSocket SALIENTE. Sin endpoint HTTP publicado. CERO Anthropic. │
└──────────────────────────────────────────────────────────────────┘
      │  mapearAPayload()
      ▼
┌──────────────────────────────────────────────────────────────────┐
│ COMMUNICATION SERVICE — conector.mjs                             │
│ dedup, identidad, comunicacion.inbox, orq.emit_event,            │
│ orq.enqueue_task(lane 'comunicacion')                            │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│ WORK FABRIC — worker-comunicacion.mjs          (systemd: …-worker)│
│ claim_task(queue='comunicacion') → handlers/comunicacion.mjs     │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│ DIRECTOR — director.mjs      (genérico: no nombra ningún dominio)│
│ 1 reclamo del especialista · 2 área del canal · 3 modelo · 4 cat.│
└──────────────────────────────────────────────────────────────────┘
      │  especialistas/personal.mjs   (área `personas`, agente `rrhh`)
      ▼
┌──────────────────────────────────────────────────────────────────┐
│ SKILL — asistencia-flujo.mjs (máquina de estados, determinística)│
│  asistencia-sesion · asistencia-ui · asistencia-permisos ·       │
│  asistencia-auditoria · asistencia-consultas                     │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│ ADAPTADOR JORNALES — lib/tools/jornales-asistencia.mjs           │
│ + lib/jornales-estructura.mjs (grilla) + lib/horas-extra.mjs     │
└──────────────────────────────────────────────────────────────────┘
      │  Google Sheets API v4 · batchUpdateValues atómico
      ▼
   Planilla JORNALES  ──▶  auditoría (orq events + v_asistencia_auditoria)
      │
      ▼
   comunicacion.outbox ──▶ respuesta EN EL MISMO CANAL, en el hilo del post
```

### Por qué el Director no sabe de asistencia

Asistencia es **el primer especialista registrado**, no un caso privilegiado. El registro
(`registro-especialistas.mjs`) descubre `especialistas/*.mjs` leyendo el directorio: agregar
Compras es agregar un archivo, sin tocar el Director ni el handler. Dos tests leen el código
fuente del Director y del handler y **fallan si vuelven a nombrar un dominio** o si aparece un
`switch`.

---

## 4. Flujo completo de un mensaje

### 4.1 Registrar asistencia (escritura)

| # | Escribe el jefe | Hace el OS |
|---|---|---|
| 1 | `asistencia` | Abre sesión (TTL). Lista las **obras del día**, releídas de la planilla |
| 2 | `obra 3` | Lista la **cuadrilla de esa obra**, releída, numerada |
| 3 | `1 presente` · `2 ausente` · `3 parcial 6` · `1 extra 2` | Registra la marca **en la sesión**, no en la planilla |
| 4 | `revisar` | Preview: celda, valor actual, valor propuesto, cuántas se crean / modifican / no cambian |
| 5 | `confirmar` | Re-lee, re-resuelve por identidad estructural, escribe **todo o nada**, audita y responde |

Comandos auxiliares: `ayuda`, `cancelar`, `deshacer` (quita una marca de la sesión).

Salvaguardas en el paso 5: fingerprint de cada celda contra lo leído; si cambió, se aborta sin
escribir. Fórmula con `#ERROR!` → celda protegida. Nombre ambiguo sin referencia → se rechaza en
vez de elegir fila. Nada escribible → no-op declarado. Falla la escritura → la sesión se cierra
como `fallida` y la clave de idempotencia se libera.

### 4.2 Consultar (sólo lectura)

`asistencia de hoy` · `asistencia de ayer` · `asistencia del 17/01` · `quién trabajó ayer` ·
`quién faltó ayer` · `asistencia de la obra Messinas` · `asistencia de Quiroga Sebastian` ·
`horas extra del 17/01`.

No abren sesión ni tocan la planilla. Fecha imposible → lo dice (`No entendí la fecha «32/13»`).
Persona inexistente → lista los trabajadores reales, no inventa.

---

## 5. Componentes

### Communication Layer (genérico — no es del módulo)

| Archivo | Responsabilidad |
|---|---|
| `mattermost-ws-consumer.mjs` | Transporte WebSocket saliente. Cero Anthropic |
| `conector.mjs` | Dedup, identidad, inbox, alta de tarea en el lane |
| `worker-comunicacion.mjs` | Worker 24×7 del lane `comunicacion` |
| `handlers/comunicacion.mjs` | Handler genérico: Director → especialista → outbox |
| `director.mjs` | Única autoridad de ruteo. No nombra dominios |
| `registro-especialistas.mjs` | Descubrimiento por directorio + validación de contrato |
| `razonar-ruteo.mjs` | Elección por modelo dentro de lista cerrada (Haiku, 24 tokens) |
| `scripts-canales.mjs` | Instalador idempotente de canal + binding + mensaje fijado |

### Especialista Personal/RRHH (el módulo)

| Archivo | Responsabilidad |
|---|---|
| `especialistas/personal.mjs` | Contrato: `slug personal`, `agentSlug rrhh`, `area personas`. Gramática y despacho |
| `asistencia-flujo.mjs` | Máquina de estados del registro |
| `asistencia-sesion.mjs` | Sesiones en Postgres, TTL, una abierta por persona, idempotencia |
| `asistencia-ui.mjs` | Parsing de comandos y render de las respuestas |
| `asistencia-consultas.mjs` | Consultas de sólo lectura (gramática + render) |
| `asistencia-permisos.mjs` | Modo abierto/estricto, `PERMISO_ASISTENCIA_WRITE` |
| `asistencia-auditoria.mjs` | Eventos, payload de confirmación, sanitización de errores |

### Adaptador a JORNALES

| Archivo | Responsabilidad |
|---|---|
| `lib/tools/jornales-asistencia.mjs` | Contexto, listados, `planificarAsistencia`, `registrarAsistencia` |
| `lib/jornales-estructura.mjs` | Grilla real: bloques, filas, columnas por fecha, `ref` estructural |
| `lib/horas-extra.mjs` | Normalización de horas, estados, fórmula `=9+2` |
| `lib/espejo-jornales.mjs` | Espejo de la planilla en Postgres (lectura rápida) |

---

## 6. Integración con Mattermost

- Bot **`@os`**, un solo bot general para todo el OS. No hay un bot de asistencia.
- Transporte **WebSocket saliente**: no hay endpoint HTTP entrante publicado para este flujo.
- Canal operativo: **`#asistencia`**, privado (`type P`).
  - `channel_id` `md5677yrtidztd7453rj6hxxmc` · `team_id` `51cbwfboatbudgk36cqdug8oor`.
  - **El `channel_id` no está en el código.** Vive en `comunicacion.canales_area`, atado al área
    `personas`. Hay un test que falla si aparece un literal con forma de id de Mattermost.
- La respuesta se publica **en el mismo canal, en el hilo del post original**. Un dato reservado
  sólo se desvía a DM cuando el canal no es el canal operativo de esa área.
- Instalación / reinstalación idempotente del canal: `scripts-canales.mjs`.

## 7. Integración con Work Fabric

- Lane dedicado `comunicacion` (`orq.route_task_queue` + `orq.claim_task(queue)`): el worker de
  comunicación no roba tareas de finanzas y el worker general no roba las de comunicación.
  Probado con dos workers concurrentes.
- Tipo de tarea `comunicacion.responder`. Trazabilidad por `correlation_id` de punta a punta:
  inbox → evento → tarea → outbox → `platform_ref` (post real de Mattermost).
- El especialista declara `agentSlug` contra `orq.agents` y `skillDe(intencion)` contra
  `orq.capabilities` (`personal.consultar_asistencia`, `personal.registrar_asistencia`).

## 8. Integración con Google Sheets

- Cliente `makeGoogleClient`; OAuth con `refresh_token` en `orq.google_tokens`. Refrescarlo
  necesita `GOOGLE_OAUTH_CLIENT_ID/SECRET`, que están en `worker.env` — por eso el worker lo carga.
- Escritura **atómica**: un solo `batchUpdateValues` con todas las celdas del plan. Todo o nada.
- Se preserva la fórmula existente cuando corresponde; nunca se pisa una celda con `#ERROR!`.
- **Regla 0 / candado de pestaña**: si la pestaña está tomada por `sheet_pestanas_bloqueadas`, la
  escritura se rechaza con el motivo visible. El módulo no desactiva la protección.

## 9. JORNALES

- Estructura por bloques (obra) × filas (trabajador) × columnas (fecha). La resolución es
  **estructural**, no posicional: se re-lee y se re-resuelve antes de escribir, así un rango
  desplazado o una fila insertada no corren la celda.
- Homónimos en la misma obra van a filas distintas; un nombre ambiguo sin referencia se rechaza.
- La jornada completa **no es una constante**: se toma de la planilla (ver §5 de
  `OPERACION-ASISTENCIA.md`).
- Horas extra: se escriben como fórmula (`=9+2`), y el plan **declara** cuántas extras se borran.

## 10. Base de datos

| Objeto | Migración |
|---|---|
| lane `comunicacion`, `route_task_queue`, `claim_task(queue)` | `20260729180000_orq_comunicacion_lane.sql` |
| `comunicacion.permisos_skill` | `20260730130000_asistencia_mattermost.sql` |
| `comunicacion.asistencia_sesiones` (+ una-abierta, idempotencia) | idem |
| `comunicacion.vencer_sesiones_asistencia()` | idem |
| `comunicacion.v_asistencia_auditoria` | idem |
| `comunicacion.canales_area` (FK → `public.area_canonica`) | `20260730160000_comunicacion_canales_area.sql` |

Las tres son **aditivas**. Cada una tiene su rollback en `orquestador/db/rollback/`.

## 11. Despliegue

Corre como **user-units de systemd** (sin sudo), sobre un worktree de despliegue dedicado —
nunca sobre el árbol de trabajo:

```
WorkingDirectory=/home/jorge/echegaray-os/app/.claude/worktrees/deploy-comunicacion/echegaray-os
```

| Unit | Proceso | Anthropic |
|---|---|---|
| `echegaray-comunicacion-ws.service` | consumidor WebSocket | **NO** (verificado en `/proc/<pid>/environ`) |
| `echegaray-comunicacion-worker.service` | worker del lane | Sí, sólo para el ruteo del Director |

```bash
# desplegar una versión nueva
git -C .claude/worktrees/deploy-comunicacion/echegaray-os fetch origin && \
git -C .claude/worktrees/deploy-comunicacion/echegaray-os checkout <sha>
systemctl --user daemon-reload
systemctl --user restart echegaray-comunicacion-worker echegaray-comunicacion-ws
systemctl --user status echegaray-comunicacion-ws --no-pager | head -5
```

Secretos en `~/.config/echegaray-orq/*.env`, `chmod 600`, **nunca en git**.

## 12. Rollback

Por orden de reversibilidad, del más barato al más caro:

1. **Apagar el módulo sin tocar nada más** — desactivar el binding del canal:
   `update comunicacion.canales_area set activo = false where channel_id = '…';`
   El canal deja de rutear a personal; el resto del OS sigue igual.
2. **Volver a la versión anterior** — `git checkout <sha_anterior>` en el worktree de despliegue
   + `restart` de las dos units. El tag `asistencia-v1.0` marca esta versión exacta.
3. **Apagar la conversación entera** — `systemctl --user stop echegaray-comunicacion-ws`. Deja de
   entrar tráfico; nada se pierde (el inbox no recibe).
4. **Revertir el esquema** — scripts en `orquestador/db/rollback/`, en orden inverso.
   ⚠️ El rollback de asistencia **también dropea `comunicacion.permisos_skill`**, que es
   compartida. Ver §14.

Las escrituras ya hechas en JORNALES **no se revierten solas**: se corrigen desde la planilla o
volviendo a cargar el valor correcto (el módulo escribe el valor final, no un delta).

## 13. Troubleshooting

| Síntoma | Dónde mirar | Causa habitual |
|---|---|---|
| El bot no responde nada | `journalctl --user -u echegaray-comunicacion-ws -n 50` | WS caído o sin `hello` de autenticación |
| Entra pero no contesta | `select * from orq.tasks where queue='comunicacion' order by id desc` | Worker parado, o tarea en `failed` |
| `Invalid RootId parameter` en outbox | `comunicacion.outbox`, `last_error` | Se respondió en el hilo de un post que no existe |
| Responde el catálogo en vez de atender | tabla `comunicacion.canales_area` | Binding del canal inactivo o ausente |
| `⚠️ La pestaña … está tomada` | `sheet_pestanas_bloqueadas` | Candado de la Regla 0. **No desactivarlo**: sellar la firma por el mecanismo oficial |
| Escribe pero no aparece | `comunicacion.v_asistencia_auditoria` | Mirar `old_value`/`new_value` y la celda exacta |
| "Ya hay una carga abierta" | `comunicacion.asistencia_sesiones` | Sesión previa sin cerrar; expira sola por TTL o `cancelar` |
| Ruteo raro en DM | — | Sin binding de canal, decide el modelo; si no hay crédito, catálogo |

Diagnóstico sin tocar producción: `node orquestador/scripts/asistencia-dry-run.mjs` (no escribe).

## 14. Límites conocidos

Son deliberados y están medidos. Ninguno bloquea hoy; los tres primeros bloquean **al segundo
especialista operativo**.

1. **Sesiones con nombre de asistencia.** `comunicacion.asistencia_sesiones` es del módulo, no
   genérica. El índice "una sesión abierta por persona" es **global**: dos especialistas con
   formulario simultáneo chocarían. Falta `comunicacion.sesiones` con `agent_slug`.
2. **Permisos con nombre de asistencia.** `ORQ_ASISTENCIA_PERMISOS` y `PERMISO_ASISTENCIA_WRITE`
   deberían ser permisos por *capability* (`ORQ_COMM_PERMISOS_MODO`).
3. **Respuesta síncrona.** El handler responde dentro de la tarea. Un especialista lento
   necesitaría respuesta diferida encadenando `orq.tasks`.
4. **Rollback acoplado**: el down-script de asistencia dropea `permisos_skill`, compartida.
5. **Auditoría con vista propia** (`v_asistencia_auditoria`) en vez de una genérica por skill.
6. **Las tools no están expuestas a la web ni a Claude Code**: hoy sólo las consume el flujo
   conversacional. Falta el `asistenciaTools(google)` compartido.
7. **En `#asistencia`, un mensaje que nadie reclama va a personal** (por área del canal). Es
   correcto ahí, pero significa que `hola` abre el formulario.
8. **Miembros del canal pendientes de definición humana**: hoy están `@os` y `jorge`. No se
   agregaron jefes de obra porque no hay fuente confiable de identidades
   (`comunicacion.identidades` vacía). Inventarlos habría sido peor.
9. **`asistencia-consultas.mjs` tiene 553 líneas**, por encima del límite de 500 del CLAUDE.md.
   Partirlo es un refactor con riesgo de comportamiento; queda registrado, no forzado.

## 15. Mantenimiento

**Rutina**

- Semanal: revisar `comunicacion.outbox` en estado `dead` y el DLQ del lane.
- Semanal: `select * from comunicacion.v_asistencia_auditoria order by ts desc limit 50` — que
  cada escritura tenga `old_value`/`new_value` y celda.
- Mensual: verificar que las sesiones expiradas se estén venciendo
  (`comunicacion.vencer_sesiones_asistencia()`).

**Cuando cambia la planilla**

Si JORNALES cambia de estructura (columnas, bloques, encabezados), lo primero que se rompe es
`jornales-estructura.mjs`. Correr `orquestador/scripts/asistencia-dry-run.mjs`: si la celda
propuesta no es la esperada, la estructura cambió — **no ajustar a mano el offset**, corregir el
resolvedor estructural y su test.

**Cuando se agrega un especialista nuevo**

No se toca este módulo ni el Director. Se agrega `especialistas/<nuevo>.mjs` cumpliendo el
contrato, se le crea su canal con `scripts-canales.mjs`, y se resuelven antes los límites 1–3.

**Tests**

```bash
node --test orquestador/comunicacion/*.test.mjs orquestador/lib/asistencia-*.test.mjs \
     orquestador/lib/jornales*.test.mjs orquestador/lib/tools/jornales-asistencia.test.mjs
node orquestador/comunicacion/test-pr4.mjs   # integración, Postgres efímero en Docker
```
