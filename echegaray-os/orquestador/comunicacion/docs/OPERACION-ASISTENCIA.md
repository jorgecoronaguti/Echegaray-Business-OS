# Skill `personal.registrar_asistencia` — runbook

Los jefes de obra cargan la asistencia diaria desde Mattermost, y cualquiera consulta lo
cargado. El dato se escribe y se lee en el Sheet **JORNALES**, que es la única fuente de
verdad: no hay tabla de asistencia en Supabase, y no la va a haber.

---

## 1. Qué hace exactamente

```
@os asistencia
   → lee JORNALES, encuentra el bloque de la quincena que contiene HOY (tz San Juan)
   → lista las obras de ESE bloque y la jornada completa del día
obra 2
   → lista la cuadrilla que JORNALES declara para esa obra y esa fecha,
     con lo que la celda ya tenga cargado, YA DESGLOSADO en normal + extra
todos presentes           # marca la cuadrilla entera
3 ausente                 # corrige sólo la excepción
3 tarde 7                 # llegó tarde: 7 horas normales trabajadas
5 parcial 5,5             # jornada parcial en horas
1 extra 2                 # 2 horas extra (se suman a las normales)
5 parcial 5,5 extra 2     # todo junto
revisar                   # preview: normal/extra/total, nuevas, modificadas, bloqueadas
confirmar                 # escribe (una sola operación batch) y verifica
```

Otros: `volver`, `cancelar`, `asistencia 29/07`,
`confirmar sobrescribir`, `confirmar formula`, `confirmar todo`.

### Quién puede usarlo

**Cualquier usuario autenticado de Mattermost.** El MVP corre en modo ABIERTO: sin roles,
sin aprobaciones, sin user_ids configurados. Lo único que se exige es tener identidad de
Mattermost — sin eso no hay a quién auditar, y la operación queda a nombre de quien la
hizo. Para endurecerlo más adelante: `ORQ_ASISTENCIA_PERMISOS=estricto` + el script de
permisos, sin desplegar código.

Todo se responde **por mensaje directo del bot**, nunca en un canal compartido.

### Lo que NO hace, por diseño

- No crea columnas de fecha. Si la quincena no está preparada en JORNALES, lo dice.
- No toca fórmulas, formato, totales, tarifas, nombres, obras, ni otras fechas/pestañas.
- No escribe letras (`P`, `X`, `Sí`): escribe **horas numéricas**, y `0` para ausente.
- No usa IA. Qué fila, qué columna y qué número se escriben lo decide código.
- No convierte `9+2` en un `11` opaco: si hay horas extra, preserva la separación.

---

## 2. Instalación

### 2.1 Mattermost — nada nuevo que exponer

El skill viaja por el bot `@os` que ya existe (PR-4.2, WebSocket saliente). **No requiere
endpoint entrante, ni ruta nueva en Caddy, ni slash command.** Reutiliza:

| Variable | De dónde sale |
|---|---|
| `MM_BASE_URL`, `MM_WS_URL` | `~/.config/echegaray-orq/comunicacion.env` |
| `MM_BOT_TOKEN`, `MM_BOT_USER_ID`, `MM_BOT_USERNAME` | idem |

Único requisito operativo: **el bot `@os` tiene que poder mandar DM** a quien lo use (en
Team Edition alcanza con que estén en el mismo equipo).

> **Slash command `/asistencia`**: soportado en el código pero **no activado**. Necesita
> publicar el endpoint HTTP entrante (`servidor-entrante.mjs`) y configurar la integración
> en Mattermost — infraestructura nueva y decisión de Nivel E. Cuando se habilite, la
> ingesta ya reúne comando + argumentos y el flujo funciona sin cambios de código.

### 2.2 Google Sheets

Usa la **misma credencial con la que el OS ya lee y escribe los Sheets de la empresa**
(OAuth de la operadora, `ORQ_GOOGLE_IMPERSONATE` / `orq.google_tokens`). No hace falta
una service account nueva ni permisos nuevos: JORNALES ya está compartido con el OS.

Verificar acceso (sólo lectura, no escribe nada):

```bash
set -a && . ~/.config/echegaray-orq/worker.env && set +a
node orquestador/scripts/asistencia-dry-run.mjs --estructura
```

Tiene que listar los 14 bloques de `Obreros 26`. Si dice `pestana_no_encontrada`,
revisar `GOOGLE_JORNALES_PESTANA_PREFIJO`.

### 2.3 Migración

```bash
psql "$DATABASE_URL" -f supabase/migrations/20260730130000_asistencia_mattermost.sql
# rollback:
psql "$DATABASE_URL" -f orquestador/db/rollback/20260730130000_asistencia_mattermost_down.sql
```

Aditiva y aislada en el schema `comunicacion` (ya existente). Crea sólo permisos, estado
de formulario y una vista de auditoría. **No crea ninguna tabla de asistencia.**

### 2.4 Secreto de firma — opcional, no protege el flujo actual

```bash
# en el EnvironmentFile de systemd, chmod 600, NUNCA en git
ORQ_ASISTENCIA_SECRET=$(openssl rand -hex 32)
```

**No hace falta configurarlo para poner el skill en producción.** La firma HMAC
(`firmarAccion`/`verificarAccion`) es código reservado: hoy no la llama ningún borde del
flujo, y su ausencia no degrada nada. Con o sin secreto, el bot por DM se comporta igual.

El motivo es que no hay nada que firmar. El bot entra por WebSocket **saliente**, la
interfaz es texto (sin botones ni diálogos), el `sesionId` nunca viaja al cliente — el
servidor resuelve la sesión desde el usuario autenticado — y lo que la persona manda es un
número de fila que se traduce contra la planilla recién leída. No existe un payload
controlado por el cliente que pueda alterarse.

**Lo que sí protege una confirmación hoy:** el TTL de 20 min, la propiedad de la sesión
(sólo quien la abrió puede operarla o confirmarla, con la identidad tomada del evento
autenticado de Mattermost) y la idempotencia de un solo uso.

**Qué activaría la firma:** pasar a botones o diálogos interactivos. Eso obliga a publicar
un endpoint HTTP entrante con su ruta en Caddy, y recién ahí aparece un `context` que va y
vuelve por el cliente. Es infraestructura nueva y una decisión de Nivel E.

---

## 3. Permisos

**En el MVP no hay nada que configurar.** Modo ABIERTO: cualquier usuario autenticado de
Mattermost registra y consulta, y cada operación queda auditada con su identidad real.
`comunicacion.permisos_skill` queda creada y vacía; en modo abierto ni se consulta.

Para endurecer más adelante, sin desplegar código:

```bash
# 1. pasar a modo estricto (EnvironmentFile de systemd + restart del worker)
ORQ_ASISTENCIA_PERMISOS=estricto

# 2. averiguar el user_id y otorgar
node orquestador/scripts/asistencia-permiso.mjs quien <username>
node orquestador/scripts/asistencia-permiso.mjs otorgar <user_id> "Nombre — jefe de obra"

# 3. verificar (dice en qué modo está corriendo)
node orquestador/scripts/asistencia-permiso.mjs listar
```

En modo estricto, sin nadie autorizado el skill queda **efectivamente apagado**: cualquiera
recibe "no tenés permiso" y queda auditado en `personal.asistencia.denied`.

---

## 3bis. Consultar (sólo lectura)

Se responde leyendo JORNALES; no abre formulario y no escribe nada. También por DM: la
asistencia del personal no sale en un canal compartido ni cuando se consulta.

```
asistencia de hoy                        quién trabajó hoy
asistencia del 29/07                     asistencia del 29 de julio
asistencia de la obra Messinas           asistencia en Taller
asistencia de Aguero                     cuánto trabajó Aguero Cristian
asistencia de Aguero del 16/07 al 30/07  entre el 16/7 y el 30/7
horas extra de hoy                       horas extra del 29/07
horas extra de Messinas                  horas extra de Aguero
horas extra de julio                     horas extra del 16/7 al 31/7
```

Toda respuesta distingue **horas normales · horas extra · total**, y las cargas que no se
pueden separar en normal/extra se cuentan aparte en vez de mentir el desglose.

### El ruteo entre cargar y consultar

Las dos cosas empiezan con la misma palabra, así que hay una regla explícita:

| Escribís | Va a |
|---|---|
| `asistencia` (sola) | **cargar** |
| `cargar/registrar/corregir asistencia [del 29/07]` | **cargar** |
| `obra 2`, `3 ausente`, `1 extra 2`, `revisar`, `confirmar`… | **cargar** (paso del formulario) |
| `asistencia de hoy`, `asistencia del 29/07`, `horas extra de…` | **consultar** |

Es decir: para cargar OTRA fecha se escribe `cargar asistencia del 29/07`, porque
`asistencia del 29/07` a secas es la consulta de ese día.

### Límites conocidos de las consultas

- Sin fecha ni período (`cuánto trabajó Aguero`) responde **sólo el día de hoy**, no la
  quincena. No se inventa una ventana por defecto.
- Máximo **62 días** por consulta (`ORQ_CONSULTA_MAX_DIAS`). Más que eso es una exportación.
- No entiende todavía "esta quincena", "esta semana", "el mes pasado".
- `horas extra 29/07` (fecha sin preposición) no se toma como consulta, para no pisar el
  comando de carga con fecha.
- Un rango que cruza el 1 de enero necesita la pestaña del otro año; si no existe se
  informa, no se adivina.

---

## 4. Operación diaria

### Corregir una carga

Volver a correr el flujo para la misma fecha y obra. El preview muestra
`Celdas que se modifican` y los valores actuales; hay que escribir
**`confirmar sobrescribir`** para pisar un valor existente. Un `confirmar` simple nunca
sobrescribe.

### Identificar conflictos

Si alguien editó la planilla entre el `revisar` y el `confirmar`, **no se escribe nada** y
el bot muestra celda por celda qué había cuando empezaste y qué hay ahora. No se
reintenta solo: es un conflicto funcional, lo resuelve la persona.

### Formularios abandonados

Un formulario a medio llenar vive **20 min** (`ORQ_ASISTENCIA_TTL_MIN`) y sólo puede haber
**uno abierto por persona**. Si el jefe abre uno y no vuelve, el worker de comunicación lo
cierra solo: barre las sesiones vencidas dentro de su loop, con intervalo propio.

```bash
COMM_WORKER_VENCER_MS=60000   # default 60 s; en el EnvironmentFile + restart del worker
```

Es un `UPDATE` contra la base (`comunicacion.vencer_sesiones_asistencia()`), sin red extra
ni llamadas a Anthropic. Sólo escribe en el log cuando cerró algo:

```json
{"level":"info","msg":"sesiones de asistencia vencidas","vencidas":2}
```

No hace falta tocarlo. Si el worker está caído, las sesiones igual vencen en cuanto su
dueño vuelve a escribir (verificación perezosa) — el barrido cubre justamente al que **no**
vuelve. Nada de esto afecta lo ya escrito en JORNALES: la sesión es estado del formulario,
no la asistencia.

### Celdas bloqueadas

El preview las lista con el motivo. Se resuelven **a mano en la planilla**:

| Motivo | Qué pasó |
|---|---|
| `texto_no_numerico` | alguien escribió texto en la columna del día. Nunca se pisa. |
| `jornada_requiere_manual` | día sin jornada de referencia: cargar horas con `parcial`. |
| `trabajador_no_en_bloque` | no figura en esa obra para esa fecha en JORNALES. |
| `ausente_con_extras` | un ausente no puede tener horas extra. |
| `faltan_horas_normales` | `tarde` y `parcial` necesitan las horas trabajadas. |
| `negativo` / `no_numerico` / `total_mayor_al_maximo` | validación de horas. |

Una celda con fórmula **ya no está bloqueada por tener una fórmula** (ver la sección de
horas extra). Sólo pide una confirmación aparte si la fórmula no se puede descomponer.

---

## 4bis. Horas extra

La empresa registra las horas extra en la propia celda diaria, con una fórmula que conserva
la jornada normal. Censo de las 3.415 celdas diarias de `Obreros 26` + 268 de `Oficina 26`
(30/07/2026): 2.851 escritas, **27 con fórmula**:

```
=4+2*1,5 ×7   =4+3*1,5 ×4   =9+4*1,3 ×4   =8+10 ×4   =9+2*1,3 ×2
=8+6 ×1   =8+4*1,5 ×1   =4 ×1   =14+3 ×1   =8+4,5 ×1   =9-2,5+2 ×1
```

De ahí las tres formas que el OS entiende:

| Forma | Significado |
|---|---|
| `=N` o `N` | jornada normal N, sin extras |
| `=N+E` | normal N, extras E (ya en horas) |
| `=N+Q*C` | normal N, Q horas extra al coeficiente C (1,5 = 50%; 1,3 = 30%) |

**Verificado contra el archivo real: 26 de 27 fórmulas interpretadas con el total
coincidiendo con el que calcula el Sheet, 0 discrepancias.**

La que queda afuera es `=9-2,5+2` (9, menos 2,5 por retirarse antes, más 2 extra): **no se
descompone de forma inequívoca**. El OS lee su total (8,5 h), lo muestra, y exige
`confirmar formula` para reemplazarla. No inventa una descomposición.

**Cómo se escribe:**
- sin extras → un **número** puro (así están 2.824 de las 2.851 celdas escritas);
- con extras → una **fórmula** `=9+2`;
- si venía como `=4+3*1,5` y no cambiaste las extras, se **preserva** `=4+3*1,5`: no se
  destruye la información de que eran 3 horas al 1,5.

La fórmula se compone sólo con números validados en servidor. No hay forma de inyectar una
fórmula desde el chat: cualquier cosa que no sea un número se rechaza antes.

### Consultar la auditoría

La auditoría cubre también las consultas (`operacion: 'consulta'`), así que queda registro
de quién preguntó qué y cuándo.

```sql
select ocurrido_at, evento, mattermost_username, fecha_operativa, obra_normalizada,
       cantidad_presentes, cantidad_ausentes, cantidad_tarde,
       horas_normales, horas_extra, horas_total, modo_permisos, celdas_modificadas
  from comunicacion.v_asistencia_auditoria
 order by ocurrido_at desc limit 50;
```

Cada celda tocada guarda `old_value`, `old_formula`, `old_effective_value`,
`old_normal_hours`, `old_extra_hours`, `new_normal_hours`, `new_extra_hours`,
`new_total_hours` y `new_formula`. Sin ese desglose, la auditoría de una carga con extras
decía "de 11 a 12" y era imposible saber si cambió la jornada o las horas extra.

Sale de `orq.events` (append-only, no se puede editar ni borrar). Guarda `old_value` y
`new_value` por celda **como evidencia del cambio**. Para saber quién trabajó un día, la
respuesta se lee de JORNALES — no de acá.

### Desactivar temporalmente

En modo ABIERTO (el del MVP) no hay a quién revocar: para cortar el skill se detiene el
worker de comunicación, o se pasa a modo estricto sin otorgar grants:

```bash
ORQ_ASISTENCIA_PERMISOS=estricto   # en el EnvironmentFile + restart del worker
node orquestador/scripts/asistencia-permiso.mjs listar   # dice en qué modo está corriendo
```

En modo estricto se otorga y revoca por persona, con efecto inmediato y sin desplegar. La
fila revocada queda con `activo=false`: la traza de que existió no se borra.

### Rotar secretos

`ORQ_ASISTENCIA_SECRET` se puede rotar en cualquier momento y **no tiene ningún efecto
observable** mientras la interfaz sea texto por DM: hoy nada lo verifica (ver 2.4). No
invalida los formularios a medio llenar — esos vencen por TTL a los 20 min, no por firma.
`MM_BOT_TOKEN` se rota con el procedimiento del bot (`OPERACION-BOT-WEBSOCKET.md`) y ése
sí corta el bot.

---

## 5. La jornada completa NO es una constante

Medido sobre los 14 bloques de `Obreros 26` (30/07/2026):

| Día | Horas | Evidencia |
|---|---|---|
| lunes a jueves | **9** | moda del bloque (23–31 muestras) |
| viernes | **8** | 27 de 31 cargas |
| sábado | manual **en ese bloque** | sin moda: conviven 4 / 5,5 / 6 / 8 |
| domingo | manual | sin carga ordinaria |

Ojo: la calibración es **por bloque**, no global. En el bloque de enero el sábado SÍ tiene
moda clara (5,5 h, 32 muestras — coincide con la nota del propio dueño en la planilla,
"5,5 es el dia sabado"), y ahí el OS la sugiere. En el bloque de julio no la tiene, y ahí
pide las horas. Es el mismo mecanismo dando respuestas distintas porque la evidencia es
distinta.

Es la semana de 44 h (9×4 + 8). **En enero el mismo archivo usaba 8 todos los días** y en
abril pasó a 9 — por eso la regla no está escrita a mano: se **calibra leyendo el bloque
en el que se va a escribir**, y el bot muestra de dónde sale el número
("según 31 cargas del mismo bloque"). Si el bloque no tiene evidencia suficiente, declara
que está usando el piso de referencia (`jornada-politica.mjs`) en vez de la evidencia.

Escribir 8 un martes habría metido un error de una hora por persona por día, silencioso,
que la planilla arrastra a horas → importe → total de quincena → línea de jornales del
cash flow.

---

## 6. Prueba controlada de escritura (pendiente de tu autorización)

Todavía **no se escribió nunca** en JORNALES desde este skill. La prueba real:

```bash
# 1. dry-run del día — muestra celda, valor actual y propuesto. NO escribe.
set -a && . ~/.config/echegaray-orq/worker.env && set +a
node orquestador/scripts/asistencia-dry-run.mjs

# 2. (en modo ABIERTO no hace falta autorizar a nadie)

# 3. desde Mattermost, por DM al bot:
#      @os asistencia
#      obra <n>            ← elegí una obra de UNA sola persona
#      1 parcial 9         ← el mismo valor que ya tendría, o el real del día
#      (opcional) 1 extra 2  ← para probar la escritura de fórmula =9+2
#      revisar             ← mirá el preview
#      confirmar
#
# 4. verificar en la planilla que la celda es la que decía el preview
```

Recomendación: hacerla sobre **una obra de una sola persona** (hoy `Taller · Trabajos
Internos`) y en el día real, con el valor real. El skill ya releé y verifica lo persistido,
pero la primera escritura conviene mirarla con los ojos.
