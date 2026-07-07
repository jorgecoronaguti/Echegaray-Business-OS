# PRP-008: HH y Productividad de Obra

> **Estado**: CERRADA
> **Fecha**: 2026-07-07
> **Proyecto**: Echegaray Business OS

---

## Objetivo

Entender cuánto esfuerzo humano consume realmente una obra (HH reales) y compararlo, cuando exista una estimación válida, contra las HH previstas — sin construir RRHH, liquidación de sueldos ni control de asistencia. Detectar automáticamente obras con consumo de HH por encima de lo estimado, concentración anormal de HH en un período, obras activas sin registro reciente, y casos donde no hay información suficiente para calcular productividad de forma confiable.

## Verificación puntual de fuentes reales (antes de modelar, no discovery general)

### JORNALES (Google Sheet)

Confirmado (no inferido) inspeccionando el contenido real de la hoja:

- **Granularidad: semanal.** Cada bloque de filas corresponde a una semana (ej. "1/1 al 5/1"), con columnas de horas por día de semana (L, M, M, J, V) que suman un total semanal por trabajador.
- **Trabajador identificado por nombre libre** ("OBRERO": ej. "Carlos Rosales") — no por legajo. Confirma el gap ya documentado en `discovery-drive-echegaray`: no cruza automáticamente con ALTAS-BAJAS ni RESUMEN DE CUENTAS BANCARIAS (que usan Nº de legajo).
- **Obra identificada por texto libre, UNA sola por trabajador por semana** (columna "OBRA": valores como "S/O", "SAINT GOBAIN", incluso "VACACIONES" usado como si fuera una obra). No hay forma de que un trabajador reparta horas entre dos obras en la misma semana en esta fuente.
- **No existe columna de cuadrilla, frente ni especialidad.**
- La columna "Tarea del día" contiene números pequeños ambiguos en la muestra revisada, sin texto descriptivo de tarea real — **no se pudo confirmar como fuente confiable de desglose por tarea.**
- Existen columnas "$ HORA" / "JORNAL" — tarifas de pago reales, pero son el cálculo de sueldo semanal (percibido/nómina), no una valorización económica lista para "costo real" en el sentido de esta capacidad.

### Planilla para Cotizar.xlsm — HH estimadas

- Hoja **"Recursos"**: valoriza "OFICIAL"/"AYUDANTE" como insumos por hora (`$/hs`) — alimenta el costo de mano de obra de cada partida en la hoja "Presupuesto" (columna `COSTO MO`, en pesos), pero no expone una cantidad de HH visible a nivel de partida.
- Hoja **"DESCRIPCION DE TAREAS"**: sí contiene un desglose real de HH por tarea (columnas Ayudantes/Oficial/Horas), pero **la estructura cambia de layout dentro de la misma hoja** (dos formatos de columnas distintos en el mismo archivo) — confirma que la práctica de estimar HH por tarea existe, pero no de forma estandarizada ni parseable automáticamente.
- Hojas **"MO Lu-Vi 8 a 16"** y **"Costo MO"** (oculta): tablas de costo horario totalmente cargado (con cargas sociales) por categoría CCT UOCRA — confirman que existen **4 categorías reales y reutilizables**: Oficial Especializado, Oficial, Medio Oficial, Ayudante.

**Conclusión**: HH estimadas por tarea/frente/especialidad/cuadrilla **no se puede implementar de forma confiable** (dato ad-hoc, no estandarizado). HH estimada **a nivel de obra sí es razonable**, como un número transcripto manualmente — mismo criterio que el resto del presupuesto (PRP-003: "no se recalcula, se transcribe").

---

## Análisis de arquitectura

### Decisión 1: HH estimada se agrega a `presupuestos` (PRP-003), no una tabla nueva

`hh_estimada` es una dimensión más del mismo presupuesto **aprobado** versionado — no un hecho de negocio distinto. Agregar una tabla separada solo para relacionar "1 HH estimada : 1 presupuesto" sería una entidad sin razón de ser propia (la relación es 1:1 con el presupuesto, no con una versión distinta de la vida del dato). Se agregó como `ALTER TABLE presupuestos ADD COLUMN hh_estimada numeric(10,2)` nullable — reutiliza el modelo existente en vez de crear una entidad nueva, tal como pide la arquitectura de esta capacidad.

### Decisión 2: `registros_hh`, una tabla nueva, a granularidad SEMANAL

| Decisión | Por qué |
|---|---|
| Granularidad semanal (`fecha_inicio_semana`), no diaria | Es la unidad real que usa JORNALES hoy — la obra se asigna por semana, no por día, así que una granularidad diaria fabricaría precisión que la fuente no sostiene. |
| `trabajador_o_cuadrilla` texto libre, no FK a una entidad Persona | JORNALES identifica por nombre libre, sin legajo — no existe hoy una forma confiable de crear y mantener una entidad Persona/Legajo sin fabricar esa relación. Mismo criterio que `detectado_por` en Adicionales (PRP-006). |
| `categoria` opcional, enum de 4 valores (UOCRA) | Es una clasificación real y confirmada en 3 hojas distintas de la Planilla — se incluye porque existe, pero es opcional porque no todo registro tendrá la categoría identificada con certeza. |
| Sin columnas de tarea/frente/especialidad/cuadrilla como entidad separada | Explícitamente descartado — la fuente actual no sostiene esa granularidad de forma confiable (ver verificación puntual). |
| `costo_real_id` opcional, sin trigger de validación de tipo | Vínculo de reconciliación con `costos_reales` (ej. una fila "Sueldos Obra" que cubre a varios trabajadores de la semana). A diferencia de `movimientos_caja` (que distingue cobro/pago y necesita el trigger), `costos_reales` no tiene esa distinción — cualquier costo real de la obra es un vínculo válido, no hace falta trigger. |
| `unique(obra_id, trabajador_o_cuadrilla, fecha_inicio_semana)` | Evita cargar el mismo trabajador dos veces para la misma obra y semana — sin bloquear que dos trabajadores distintos tengan registros la misma semana, ni que el mismo trabajador tenga semanas distintas. |

### Decisión 3: vista `obra_hh_resumen`, no tabla ni función

Mismo criterio que `obra_resumen_economico` (PRP-005): el dato es 100% derivable de `obras` + `presupuestos.hh_estimada` (aprobado) + agregación de `registros_hh` en el momento de la consulta. `security_invoker = true` obligatorio (mismo gotcha ya documentado en el skill `supabase`).

### Relación con Costos Reales — explícitamente NO se fabrica

Se analizó explícitamente si HH × tarifa = costo real. **Decisión: no.** Existe una tarifa real en JORNALES (`$ HORA`) y en las hojas de costo CCT de la Planilla, pero:
- El costo de mano de obra **ya se puede registrar hoy** en `costos_reales` (concepto "Sueldos Obra", como confirma el AS-IS de `CONTROL DE GASTOS.xlsx`) sin necesitar HH.
- Multiplicar HH × una tarifa fabricaría un número que no reconcilia necesariamente con el costo real ya cargado (cargas sociales, ajustes, tiempos de pago distintos).

Por eso esta capacidad mantiene **productividad física (HH) y costo económico (costos_reales) separados**, y ofrece únicamente un vínculo opcional (`costo_real_id`) para quien quiera reconciliar manualmente, sin automatizar ni fabricar el cálculo.

**Descartado explícitamente:**
- Tabla de personas/legajos — no existe fuente confiable para sostenerla todavía.
- HH por tarea/frente/especialidad/cuadrilla — dato ad-hoc no estandarizado en la fuente real.
- Alerta "tendencia de HH incompatible con el avance disponible" — requeriría un dato de avance físico % que el OS no tiene todavía (Control Económico mide presupuesto vs. costo, no avance físico). No se fabrica.
- Costo de mano de obra calculado automáticamente desde HH.

---

## Modelo de datos

```sql
alter table presupuestos add column hh_estimada numeric(10,2);
alter table presupuestos add constraint presupuestos_hh_estimada_check check (hh_estimada is null or hh_estimada > 0);

create table registros_hh (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id) on delete restrict,
  trabajador_o_cuadrilla text not null,
  categoria text check (categoria is null or categoria in ('oficial_especializado', 'oficial', 'medio_oficial', 'ayudante')),
  fecha_inicio_semana date not null,
  horas numeric(6,2) not null check (horas > 0),
  costo_real_id uuid references costos_reales(id) on delete set null,
  fuente_legacy text not null,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (obra_id, trabajador_o_cuadrilla, fecha_inicio_semana)
);

create view obra_hh_resumen
with (security_invoker = true)
as
select
  o.id as obra_id, o.nombre as obra_nombre, o.estado as obra_estado,
  p.hh_estimada,
  coalesce(r.hh_real_acumulada, 0) as hh_real_acumulada,
  coalesce(r.cantidad_semanas_registradas, 0) as cantidad_semanas_registradas,
  r.ultima_fecha_registro,
  case when p.hh_estimada is null then null else coalesce(r.hh_real_acumulada, 0) - p.hh_estimada end as desvio_absoluto,
  case when p.hh_estimada is null or p.hh_estimada = 0 then null
    else round((coalesce(r.hh_real_acumulada, 0) - p.hh_estimada) / p.hh_estimada * 100, 2)
  end as desvio_porcentual
from obras o
left join presupuestos p on p.obra_id = o.id and p.estado = 'aprobado'
left join lateral (
  select sum(horas) as hh_real_acumulada, count(distinct fecha_inicio_semana) as cantidad_semanas_registradas,
    max(fecha_inicio_semana) as ultima_fecha_registro
  from registros_hh where registros_hh.obra_id = o.id
) r on true;
```

RLS/GRANT: mismo patrón que todas las tablas anteriores; vista con GRANT propio + `security_invoker = true`.

---

## Blueprint (fase única) ✅ CERRADA (2026-07-07)

**Objetivo**: `registros_hh` + `presupuestos.hh_estimada` + vista `obra_hh_resumen` aplicadas y verificadas contra Supabase real; UI en `/obras/[id]` (nueva sección "HH y productividad": resumen con alertas, evolución semanal, alta de registros).

**Validación**: migración vía MCP (`20260707114348_hh_productividad_obra.sql`); constraints probados (registro duplicado obra+trabajador+semana rechazado, horas ≤ 0 rechazado, categoría inválida rechazada, `hh_estimada` negativa rechazada); vínculo opcional a `costos_reales` verificado (sin trigger, cualquier costo real de la obra es válido); ciclo completo con datos reales (hh_estimada=500, 3 registros semanales sumando 127hs) dio exactamente `hh_real_acumulada=127`, `desvio_absoluto=-373`, `desvio_porcentual=-74.60`, `cantidad_semanas_registradas=2` — coincide con el cálculo manual esperado; RLS/GRANT verificado en tabla y vista; `get_advisors(security)` sin hallazgos nuevos; `tsc`/`build`/`lint`/19 tests de Playwright en verde; datos `SMOKE TEST%` eliminados después de verificar.

---

## Gotchas
- [ ] Los umbrales de alertas (`UMBRAL_DESVIO_HH_PORCENTAJE=15`, `UMBRAL_CONCENTRACION_MULTIPLICADOR=1.5`, `DIAS_SIN_REGISTRO_RECIENTE=14`, `MINIMO_SEMANAS_PARA_TENDENCIA=3`, en `features/hh-productividad/types/index.ts`) son propuestas no validadas con el usuario — mismo criterio que Control Económico (PRP-005).
- [ ] "Obra con tendencia de HH incompatible con el avance disponible" no se implementó — no existe todavía un dato de avance físico % en el OS para sostener esa comparación sin fabricarla.
- [ ] Sin JWT real, no se pudo probar con Playwright la visibilidad del formulario/resumen end-to-end (mismo límite de entorno de siempre, ver PRP-001).

## Anti-patrones
- NO calcular costo de mano de obra como HH × tarifa arbitraria.
- NO fabricar HH por tarea/frente/especialidad/cuadrilla sin fuente confiable.
- NO construir una entidad Persona/Legajo sin una fuente real que la sostenga.
- NO construir liquidación de sueldos, asistencia ni CRUD de trabajadores.
- NO modificar JORNALES ni ningún archivo de Drive.

---

*Capacidad 8 (HH y Productividad de Obra): CERRADA y validada contra Supabase real.*
