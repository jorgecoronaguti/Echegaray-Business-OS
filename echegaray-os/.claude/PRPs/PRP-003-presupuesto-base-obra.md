# PRP-003: Presupuesto Base de Obra

> **Estado**: EN PROGRESO
> **Fecha**: 2026-07-06
> **Proyecto**: Echegaray Business OS

---

## Objetivo

Registrar la representación mínima del presupuesto aprobado/contratado de una obra (monto, costo directo/indirecto, margen esperado, partidas principales, versión, estado, fuente) para habilitar Control Económico futuro — sin reconstruir el motor de cotización (`Planilla para Cotizar.xlsm` sigue siendo la fuente de cálculo) y sin comparar todavía contra costo real.

## Verificación puntual de estructura (antes de modelar, no discovery general)

Se inspeccionó `Planilla para Cotizar.xlsm` (pestañas y `sharedStrings.xml`, mismo método que discoveries previos) para confirmar que la distinción costo directo/indirecto/margen que pide esta capacidad ya existe en la fuente real, y no se está inventando una estructura:

- Pestañas confirmadas: `Presupuesto`, `OFERTA` (+ variantes por cliente recurrente `OFERTA ARCOR`, `OFERTA SG`), `Recursos`, `Análisis`, `DIAGRAMACION` (oculta).
- Strings confirmados: `COSTOS DIRECTOS (Sin IVA)`, `COSTOS INDIRECTOS (Sin IVA)`, `Gastos Indirectos de Produccion`, `Gastos Generales de Obra`, `Gastos Generales de la Empresa`, `BENEFICIO`, `PRESUPUESTO GENERAL`, `IMPUESTO A LAS GANANCIAS TEORICO`.

Esto confirma (evidencia real, no supuesto): la Planilla ya calcula costo directo, costo indirecto (como suma de 3 categorías) y beneficio/margen como líneas separadas del total — el modelo de esta capacidad transcribe esos resultados, no inventa una fórmula nueva. `margen_esperado` se registra como dato transcripto, no se recalcula por resta (la Planilla puede ajustar por impuesto a las ganancias teórico u otros factores no modelados acá).

## Análisis de arquitectura

**Dos tablas nuevas — justificadas, no evitables esta vez** (a diferencia de Capacidad 2, que no necesitó tablas nuevas):

| Entidad | Por qué existe | Por qué no reutiliza algo existente |
|---|---|---|
| `presupuestos` | Representa una *versión* del presupuesto de una obra (monto, costos, margen, estado, fuente, fecha). Habilita Control Económico (compara contra esto) y Adicionales (se compara contra el presupuesto *original*, que debe quedar identificable). | No es lo mismo que `obras.monto_contratado` (un solo valor, sin versión ni desglose) — esta tabla existe precisamente porque el monto contratado puede tener varias versiones de presupuesto detrás, y `obras` no debe cargar ese historial. |
| `partidas_presupuesto` | "Partidas presupuestarias simples" — las líneas principales que componen un presupuesto (ej. códigos T de la Planilla). Habilita Costos/Compras futuros a anclarse a una partida, no solo a una obra entera. | No reutiliza `movimientos_caja` (eso es dinero que se movió, esto es dinero que se planeó) ni crea una jerarquía más profunda (sin insumos, sin HH — excluido explícitamente). |

Reglas de versión (evita mezclar presupuesto original con adicionales, y responde "qué versión está aprobada"):
- `unique (obra_id, version)` — no se pisan números de versión.
- Índice único parcial: **como máximo un presupuesto en estado `aprobado` por obra** — responde sin ambigüedad "cuál es la versión vigente".
- Al aprobar una versión nueva, la capa de servicio primero pasa la `aprobada` anterior a `reemplazada`, después inserta la nueva — dos pasos secuenciales, no una transacción SQL explícita (aceptable para este alcance; ver Gotchas).

**Descartado explícitamente:**
- Desglose de partida en insumos/HH — excluido por alcance ("no calculo detallado de materiales, no HH detalladas").
- Comparación contra costo real — es Control Económico, capacidad futura.
- Relación con Adicionales — esta tabla es solo el presupuesto *base*; Adicionales (futuro) se modela aparte para no mezclar ambos conceptos, tal como pide la regla de negocio.
- Tocar `Planilla para Cotizar.xlsm` o cualquier archivo de Drive — cero escritura, solo lectura puntual para confirmar estructura.

---

## Modelo de datos

```sql
create table presupuestos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  estado text not null default 'borrador' check (estado in ('borrador', 'aprobado', 'reemplazado')),
  monto_presupuestado numeric(14,2) not null check (monto_presupuestado > 0),
  costo_directo_presupuestado numeric(14,2) not null check (costo_directo_presupuestado > 0),
  costo_indirecto_presupuestado numeric(14,2) not null default 0 check (costo_indirecto_presupuestado >= 0),
  margen_esperado numeric(14,2) not null,
  fuente_legacy text not null,
  fecha_presupuesto date not null,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (obra_id, version)
);

create unique index presupuestos_un_aprobado_por_obra
  on presupuestos(obra_id) where estado = 'aprobado';

create table partidas_presupuesto (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references presupuestos(id) on delete cascade,
  codigo text,
  descripcion text not null,
  monto numeric(14,2) not null check (monto > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

RLS/GRANT: mismo patrón que todas las tablas anteriores (`authenticated_full_access`, GRANT explícito desde el inicio — no repetir el bug de Fundación).

---

## Blueprint (fase única) ✅ CERRADA (2026-07-06)

**Objetivo**: `presupuestos` y `partidas_presupuesto` aplicadas y verificadas contra Supabase real; UI en `/obras/[id]` (nueva sección "Presupuesto": alta de versión, listado de versiones, alta y listado de partidas de la versión más reciente).
**Validación**: migración vía MCP; constraints de monto/version/estado/único-aprobado probados con datos reales válidos e inválidos (6 casos, todos correctos); GRANT incluido desde el inicio; caso real obra+presupuesto+partidas respondió las 10 preguntas del objetivo funcional en una sola query; lógica de versionado ("aprobar reemplaza a la anterior") verificada contra Supabase real reproduciendo exactamente los dos pasos que ejecuta la capa de servicio; `tsc`/`build`/`lint`/14 tests de Playwright en verde.

---

## Gotchas
- [x] "Aprobar reemplaza a la anterior" se implementa como dos llamadas secuenciales en la capa de servicio (UPDATE viejo → INSERT nuevo), no como una transacción SQL atómica. Verificado que el resultado es correcto (v1→reemplazado, v2→aprobado). Riesgo aceptado para este alcance (sin usuarios concurrentes reales todavía); si en el futuro hay uso concurrente, mover esto a una función de Postgres.
- [x] Las partidas se agregan siempre contra la versión de mayor `version` de la obra, sin selector explícito — simplificación deliberada (evita un selector de presupuesto en el form).
- [ ] La sección de Presupuesto en `/obras/[id]` solo se renderiza si `obra.data` existe — sin una sesión autenticada real (JWT), no se puede probar con Playwright la visibilidad de `PresupuestoForm`/`PartidaPresupuestoForm` end-to-end (mismo límite de entorno que el resto del proyecto, ver PRP-001). Repetir cuando exista login real.

## Anti-patrones
- NO desglosar partidas en insumos o HH.
- NO comparar contra costo real todavía.
- NO mezclar presupuesto base con adicionales en esta misma tabla.
- NO escribir en `Planilla para Cotizar.xlsm` ni en ningún archivo de Drive.

---

*Capacidad 3 (Presupuesto Base de Obra): CERRADA y validada contra Supabase real.*
