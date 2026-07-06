# PRP-002: Obra como Unidad Económica

> **Estado**: EN PROGRESO
> **Fecha**: 2026-07-06
> **Proyecto**: Echegaray Business OS

---

## Objetivo

Convertir `obras` (creada en PRP-001/Fundación como identidad mínima) en la unidad económica central del negocio: capaz de responder quién es el cliente, cuánto se contrató, cuándo arranca, cuándo debería terminar, en qué estado está, y qué movimientos de caja/cuenta/proveedor le pertenecen — sin calcular todavía margen, costos, HH ni KPIs.

## Por qué

Todas las capacidades futuras (Presupuesto, Costos, Compras, HH, Adicionales, Facturación, Control Económico, Dashboard, Post Mortem) necesitan anclarse a una Obra que ya sepa: cuánto vale el contrato, en qué ventana de tiempo corre, y en qué fase de su ciclo económico está. Construir esto ahora evita que cada capacidad futura tenga que agregarle estos campos por separado o duplicar el concepto de "obra vigente".

## Análisis de arquitectura (antes de implementar)

**Decisión: extender `obras` (ninguna tabla nueva).**

Entidades consideradas y descartadas:

| Entidad candidata | Por qué se descarta |
|---|---|
| `contratos` (tabla separada para el monto contratado) | Hoy es 1:1 con Obra, sin necesidad de versionar cambios de monto todavía (eso es Adicionales, capacidad futura). Crearla ahora duplicaría `obra_id`+monto+fechas sin agregar valor. Revisar cuando Adicionales necesite historizar el monto contratado. |
| Tabla/vista de resumen económico por obra (movimientos agregados) | "No calcular margen/resultados todavía" es una restricción explícita — cualquier agregación sería o bien scaffolding vacío o una violación de esa regla. Las preguntas de trazabilidad (qué movimientos, qué cuenta, qué proveedor) se responden con una query/join sobre `movimientos_caja`, no con una entidad nueva. |
| Historial de cambios de estado (`obra_estado_historial`) | Útil para Post Mortem más adelante, pero no la pide el objetivo funcional de esta capacidad (solo pide el estado *actual*). Se puede agregar después sin romper nada (aditivo). No se construye ahora. |

**Único cambio de modelo: extender `obras`** con `monto_contratado`, `fecha_inicio`, `fecha_fin_objetivo`, y ampliar `estado` para incluir `'contratada'` (momento de la contratación, antes de que arranque la ejecución física — el AS-IS distingue Contratación de Ejecución como etapas separadas).

Justificación por entidad (no hay entidades nuevas, solo esta extensión):
- **Por qué existe**: `obras` ya es la unidad central (Blueprint TO-BE, AS-IS Gap #4). No agregar campos nuevos forzaría a cada capacidad futura a inventar su propia noción de "monto contratado" o "vigencia".
- **Qué decisión permite tomar**: si una obra está dentro de su ventana de tiempo contratada, si está atrasada, cuánto se contrató originalmente (base de comparación para Presupuesto/Adicionales).
- **Qué capacidad futura depende de ella**: todas las listadas en el objetivo — Presupuesto compara contra `monto_contratado`; Costos/Compras/HH acumulan dentro de `fecha_inicio`→`fecha_fin_objetivo`; Control Económico compara fecha objetivo vs. real de cierre; Post Mortem lee el estado final.
- **Reutiliza entidad existente**: sí — es la misma tabla de Fundación, no una nueva.

**No hay relaciones nuevas.** `movimientos_caja.obra_id` ya existía desde Capacidad 1 (Caja Operativa) — esta capacidad no agrega FKs nuevas, solo enriquece la entidad `Obra` misma.

**Refactor de código (no de datos)**: `Obra` se muda de `features/fundacion/` a `features/obras/` propio, porque ahora es una capacidad de negocio en sí misma (Blueprint: "el centro del Business OS será la Obra"), no un dato de referencia simple como Cliente/Proveedor/Cuenta financiera. `Cliente`, `Proveedor`, `CuentaFinanciera` quedan en `fundacion/`.

---

## Modelo de datos

```sql
alter table obras
  add column monto_contratado numeric(14,2),
  add column fecha_inicio date,
  add column fecha_fin_objetivo date;

alter table obras
  alter column monto_contratado set not null,
  alter column fecha_inicio set not null,
  alter column fecha_fin_objetivo set not null;

alter table obras add constraint obras_monto_contratado_check check (monto_contratado > 0);
alter table obras add constraint obras_fechas_check check (fecha_fin_objetivo >= fecha_inicio);

alter table obras drop constraint obras_estado_check;
alter table obras add constraint obras_estado_check
  check (estado in ('contratada', 'activa', 'pausada', 'cerrada'));
alter table obras alter column estado set default 'contratada';
```

Sin backfill necesario: no había filas reales en `obras` al momento de esta migración (verificado con `execute_sql` antes de aplicar).

---

## Blueprint (fases)

### Fase única — Obra como Unidad Económica
**Objetivo**: `obras` extendida y verificada contra Supabase real; UI en `/obras` (listado + alta) y `/obras/[id]` (detalle: datos económicos + movimientos de caja vinculados); `Obra` migrado a su propio feature.
**Validación**: migración aplicada vía MCP; constraints de monto/fechas/estado probados con datos válidos e inválidos; GRANT y RLS ya heredados de Fundación (no requieren cambio); `tsc`/`build`/`lint`/Playwright en verde; un caso real de obra + movimiento de caja demuestra que `/obras/[id]` responde las preguntas del objetivo funcional.

---

## Gotchas
- [x] `obras_estado_check` es el nombre real del constraint autogenerado por Postgres (confirmado con `pg_constraint` antes de hacer `DROP CONSTRAINT` — no asumir el nombre en futuras migraciones que alteren constraints existentes).
- [x] Mover `Obra` de `fundacion/` a `obras/` implicó actualizar el import en `flujo-caja/components/MovimientoCajaForm.tsx` y `app/(main)/caja/page.tsx` — hecho y verificado con `tsc`.

## Anti-patrones
- NO crear una tabla `contratos` separada todavía (ver análisis de arquitectura).
- NO calcular margen, costos, HH, compras, resultados ni KPIs en esta capacidad.
- NO construir dashboard — la pantalla de detalle de obra es un listado/join, no una agregación.

## Validación realizada (2026-07-06)

Migración aplicada vía MCP contra Supabase real. Constraints probados con datos reales: monto_contratado > 0, fecha_fin_objetivo >= fecha_inicio, estado dentro del enum ampliado — los tres rechazan correctamente valores inválidos. RLS/GRANT heredados de Fundación sin cambios (ya cubrían la tabla completa, no por columna). Verificación end-to-end vía `execute_sql`: una Obra real + un Cliente + una Cuenta financiera + un movimiento de caja `cobro` respondieron correctamente las 9 preguntas del objetivo funcional en una sola query (cliente, obra, monto contratado, fechas, estado, tipo de movimiento, monto, cuenta financiera, proveedor). `tsc`/`build`/`lint`/13 tests de Playwright en verde.

---

*Capacidad 2 (Obra como Unidad Económica): CERRADA y validada contra Supabase real.*
