# Skill `personal.registrar_asistencia` — runbook

Los dos jefes de obra cargan la asistencia diaria desde Mattermost. El dato se escribe en
el Sheet **JORNALES**, que sigue siendo la única fuente de verdad: no hay tabla de
asistencia en Supabase, y no la va a haber.

---

## 1. Qué hace exactamente

```
@os asistencia
   → lee JORNALES, encuentra el bloque de la quincena que contiene HOY (tz San Juan)
   → lista las obras de ESE bloque y la jornada completa del día
obra 2
   → lista la cuadrilla que JORNALES declara para esa obra y esa fecha,
     con lo que la celda ya tenga cargado
todos presentes           # marca la cuadrilla entera
3 ausente                 # corrige sólo la excepción
5 parcial 5,5             # jornada parcial en horas
revisar                   # preview: nuevas, modificadas, bloqueadas
confirmar                 # escribe (una sola operación batch) y verifica
```

Otros: `volver`, `cancelar`, `confirmar sobrescribir`, `asistencia 29/07`.

Todo se responde **por mensaje directo del bot**, nunca en un canal compartido.

### Lo que NO hace, por diseño

- No crea columnas de fecha. Si la quincena no está preparada en JORNALES, lo dice.
- No toca fórmulas, formato, totales, tarifas, nombres, obras, ni otras fechas/pestañas.
- No escribe letras (`P`, `X`, `Sí`): escribe **horas numéricas**, y `0` para ausente.
- No usa IA. Qué fila, qué columna y qué número se escriben lo decide código.

---

## 2. Instalación

### 2.1 Mattermost — nada nuevo que exponer

El skill viaja por el bot `@os` que ya existe (PR-4.2, WebSocket saliente). **No requiere
endpoint entrante, ni ruta nueva en Caddy, ni slash command.** Reutiliza:

| Variable | De dónde sale |
|---|---|
| `MM_BASE_URL`, `MM_WS_URL` | `~/.config/echegaray-orq/comunicacion.env` |
| `MM_BOT_TOKEN`, `MM_BOT_USER_ID`, `MM_BOT_USERNAME` | idem |

Único requisito operativo: **el bot `@os` tiene que poder mandar DM** a los dos jefes
(en Team Edition alcanza con que estén en el mismo equipo).

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
psql "$DATABASE_URL" -f supabase/migrations/20260730120000_asistencia_mattermost.sql
# rollback:
psql "$DATABASE_URL" -f orquestador/db/rollback/20260730120000_asistencia_mattermost_down.sql
```

Aditiva y aislada en el schema `comunicacion` (ya existente). Crea sólo permisos, estado
de formulario y una vista de auditoría. **No crea ninguna tabla de asistencia.**

### 2.4 Secreto de firma

```bash
# en el EnvironmentFile de systemd, chmod 600, NUNCA en git
ORQ_ASISTENCIA_SECRET=$(openssl rand -hex 32)
```

Sin este valor (y sin `MM_INCOMING_SECRET`) las acciones firmadas se rechazan —
fail-closed. El flujo de texto funciona igual; la firma protege el front-end de botones.

---

## 3. Autorizar a los dos jefes

Los user_ids **no están en el código ni en la migración**. Se otorgan acá:

```bash
# 1. averiguar el user_id de cada jefe
node orquestador/scripts/asistencia-permiso.mjs quien rodrigo

# 2. otorgar
node orquestador/scripts/asistencia-permiso.mjs otorgar <user_id> "Rodrigo — jefe de obra"

# 3. verificar (avisa si hay más de 2 activos)
node orquestador/scripts/asistencia-permiso.mjs listar
```

Sin nadie autorizado, el skill está **efectivamente apagado**: cualquiera recibe
"no tenés permiso" y queda auditado en `personal.asistencia.denied`.

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

### Celdas bloqueadas

El preview las lista con el motivo. Se resuelven **a mano en la planilla**:

| Motivo | Qué pasó |
|---|---|
| `celda_con_formula` | tiene horas extra calculadas (`=8+6`). Pisarla rompería el cálculo. |
| `texto_no_numerico` | alguien escribió texto en la columna del día (`NO SE TOCA HASTA JUL`). |
| `jornada_requiere_manual` | sábado/domingo: no hay jornada completa de referencia, cargar con `parcial`. |
| `trabajador_no_en_bloque` | no figura en esa obra para esa fecha en JORNALES. |

### Consultar la auditoría

```sql
select ocurrido_at, evento, mattermost_username, fecha_operativa, obra_normalizada,
       cantidad_presentes, cantidad_ausentes, celdas_modificadas
  from comunicacion.v_asistencia_auditoria
 order by ocurrido_at desc limit 50;
```

Sale de `orq.events` (append-only, no se puede editar ni borrar). Guarda `old_value` y
`new_value` por celda **como evidencia del cambio**. Para saber quién trabajó un día, la
respuesta se lee de JORNALES — no de acá.

### Desactivar temporalmente

```bash
node orquestador/scripts/asistencia-permiso.mjs revocar <user_id>   # por persona
```

Efecto inmediato, sin desplegar. Revocar a los dos apaga el skill entero. La fila queda
con `activo=false`: la traza de que existió no se borra.

### Rotar secretos

`ORQ_ASISTENCIA_SECRET` se puede rotar en cualquier momento: invalida los formularios a
medio llenar (vencen igual a los 20 min) y no afecta nada persistido. `MM_BOT_TOKEN` se
rota con el procedimiento del bot (`OPERACION-BOT-WEBSOCKET.md`).

---

## 5. La jornada completa NO es una constante

Medido sobre los 14 bloques de `Obreros 26` (30/07/2026):

| Día | Horas | Evidencia |
|---|---|---|
| lunes a jueves | **9** | moda del bloque (23–31 muestras) |
| viernes | **8** | 27 de 31 cargas |
| sábado | manual | sin moda: conviven 4 / 5,5 / 6 / 8 |
| domingo | manual | sin carga ordinaria |

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

# 2. autorizarte a vos mismo para probar
node orquestador/scripts/asistencia-permiso.mjs otorgar <tu_user_id> "Jorge — prueba"

# 3. desde Mattermost, por DM al bot:
#      @os asistencia
#      obra <n>            ← elegí una obra de UNA sola persona
#      1 parcial 9         ← el mismo valor que ya tendría, o el real del día
#      revisar             ← mirá el preview
#      confirmar
#
# 4. verificar en la planilla que la celda es la que decía el preview
# 5. revocar el permiso de prueba si corresponde
```

Recomendación: hacerla sobre **una obra de una sola persona** (hoy `Taller · Trabajos
Internos`) y en el día real, con el valor real. El skill ya releé y verifica lo persistido,
pero la primera escritura conviene mirarla con los ojos.
