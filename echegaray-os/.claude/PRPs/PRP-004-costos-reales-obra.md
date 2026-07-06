# PRP-004: Costos Reales de Obra

> **Estado**: CERRADA
> **Fecha**: 2026-07-06
> **Proyecto**: Echegaray Business OS

---

## Objetivo

Registrar el costo real (devengado/comprometido) de una obra — proveedor, concepto, monto, fecha, estado (comprometido/pendiente/pagado), fuente legacy y vínculo opcional con un movimiento de caja — sin construir todavía comparación contra presupuesto ni dashboard. Habilita el futuro Control Económico (presupuesto vs. real).

## Verificación puntual de estructura (antes de modelar, no discovery general)

Se inspeccionó `CONTROL DE GASTOS.xlsx` (vía `search_files`, ya identificado en discoveries previos) para confirmar si ya existe un registro de costo con estado comprometido/pendiente/pagado que esta capacidad pudiera reutilizar:

- Columnas confirmadas: OBS, Factura, Fecha, Descripción, Forma de pago, Categoría, Comercio, Retirada(-), Depósito(+), Saldo acumulado, impuestos varios.
- Es un **ledger de caja** (percibido): cada fila es un movimiento de dinero ya ocurrido, no una obligación con estado propio. La columna "OBS" a veces referencia una obra (texto libre, sin ID), pero no existe un concepto de "comprometido pero todavía no pagado".

**Conclusión (evidencia real, no supuesto)**: Costos Reales con estado comprometido/pendiente/pagado es territorio nuevo del OS — no se está migrando ni duplicando un sistema existente, se está construyendo una capacidad que hoy no existe en ningún lado (consistente con el AS-IS: "Compras y costos: sin sistema, Control de Gastos como ledger" era inferido, ahora confirmado).

## Análisis de arquitectura

**Una tabla nueva, `costos_reales`** — justificada porque no es lo mismo que `movimientos_caja` (eso es dinero que efectivamente se movió, percibido) ni que `partidas_presupuesto` (eso es dinero planeado). `costos_reales` representa el costo devengado/comprometido, que puede existir antes de que exista un movimiento de caja real.

| Decisión | Por qué |
|---|---|
| `proveedor_id` nullable | Hay costos sin proveedor identificado todavía (ej. categorías generales tipo "Gastos Obra"), igual que en `movimientos_caja`. |
| `estado` en `('comprometido', 'pendiente', 'pagado')` | Responde la pregunta central de la capacidad: ¿qué parte impactó caja y cuál no? `comprometido`/`pendiente` = todavía no impacta caja como real; `pagado` = ya lo hizo (o debería tener un movimiento vinculado). |
| `movimiento_caja_id` nullable, FK a `movimientos_caja` | Vínculo opcional pedido explícitamente. Nullable porque comprometido/pendiente no tienen movimiento real todavía. |
| Trigger `costos_reales_valida_movimiento_pago` | Un CHECK no puede validar una columna de otra tabla. Sin este trigger, nada impediría vincular un costo a un `cobro` por error — se fuerza a nivel de base que el vínculo sea siempre a un `pago`. |
| Índice único parcial en `movimiento_caja_id` | Evita que dos costos reales reclamen el mismo movimiento de caja como su pago — la misma lógica anti-doble-conteo que pide `cash-flow-operativo`, aplicada del lado de costos. |
| No hay tabla de "compras" ni "materiales" | Explícitamente fuera de alcance — un costo real es una línea, no un desglose de insumos. |

**Descartado explícitamente:**
- Comparación contra presupuesto (`presupuestos`/`partidas_presupuesto`) — es Control Económico, capacidad futura.
- Compras detalladas, materiales, HH — fuera de alcance.
- Reemplazar `CONTROL DE GASTOS.xlsx` — sigue siendo el ledger de caja real hasta que se decida lo contrario.
- Requerir `movimiento_caja_id` cuando `estado = 'pagado'` — no se fuerza por CHECK: un costo legacy puede llegar marcado como pagado sin que exista todavía el movimiento correspondiente cargado en el OS. Ver Gotchas.

---

## Modelo de datos

```sql
create table costos_reales (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id) on delete restrict,
  proveedor_id uuid references proveedores(id) on delete restrict,
  concepto text not null,
  monto numeric(14,2) not null check (monto > 0),
  fecha date not null,
  estado text not null default 'pendiente' check (estado in ('comprometido', 'pendiente', 'pagado')),
  movimiento_caja_id uuid references movimientos_caja(id) on delete set null,
  fuente_legacy text not null,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index costos_reales_movimiento_caja_unico
  on costos_reales(movimiento_caja_id) where movimiento_caja_id is not null;

-- Trigger: movimiento_caja_id, si se indica, debe ser un movimiento de tipo 'pago'.
create trigger costos_reales_valida_movimiento_pago before insert or update on costos_reales
  for each row execute function costos_reales_valida_movimiento_pago();
```

RLS/GRANT: mismo patrón que todas las tablas anteriores (`authenticated_full_access` + GRANT explícito desde el inicio).

---

## Blueprint (fase única) ✅ CERRADA (2026-07-06)

**Objetivo**: `costos_reales` aplicada y verificada contra Supabase real; UI en `/obras/[id]` (nueva sección "Costos reales": alta y listado, con selector opcional de proveedor y de movimiento de caja tipo pago de la misma obra).

**Validación**:
- Migración vía MCP (`20260706195537_costos_reales_obra.sql`).
- 7 casos de constraint probados contra Supabase real: monto ≤ 0 rechazado, estado inválido rechazado, `obra_id` inexistente rechazado (FK), vínculo a un movimiento tipo `cobro` rechazado por el trigger, vínculo válido a un movimiento tipo `pago` aceptado, doble reclamo del mismo `movimiento_caja_id` rechazado (índice único parcial). Todos correctos.
- RLS/GRANT verificado con `SET LOCAL ROLE`: `anon` bloqueado (`permission denied`), `authenticated` con acceso completo.
- Query end-to-end (obra + costo real + proveedor + movimiento de caja vinculado) respondió las 9 preguntas del objetivo funcional en una sola consulta.
- `tsc`/`build`/`lint`/15 tests de Playwright en verde (incluye el nuevo `tests/costos-reales.spec.ts`).
- Todos los datos de prueba (`SMOKE TEST%`) fueron eliminados después de verificar.

---

## Gotchas
- [ ] No se fuerza por constraint que `estado = 'pagado'` implique `movimiento_caja_id is not null` — un costo marcado pagado puede llegar de una fuente legacy sin el movimiento correspondiente cargado todavía en el OS. Si en el futuro se necesita esa garantía estricta, agregar el CHECK explícitamente (haría falta cargar primero todos los movimientos históricos).
- [ ] La sección de Costos Reales en `/obras/[id]` solo se renderiza si `obra.data` existe — sin sesión autenticada real (JWT) no se pudo probar con Playwright la visibilidad del formulario end-to-end (mismo límite de entorno que el resto del proyecto, ver PRP-001).
- [ ] El selector de "movimiento de caja vinculado" en el formulario solo lista movimientos de tipo `pago` de la misma obra — no filtra además por `estado = 'real'`, así que técnicamente se podría vincular a un pago todavía proyectado. No se restringió más porque el trigger de base ya cubre la regla de negocio explícita (tipo pago); una restricción adicional (solo pagos reales) queda como refinamiento futuro si se comprueba que es un problema real.

## Anti-patrones
- NO comparar contra presupuesto todavía (eso es Control Económico).
- NO desglosar en compras/materiales/HH.
- NO modificar `CONTROL DE GASTOS.xlsx` ni ningún archivo de Drive.
- NO asumir que todo costo real ya tiene un movimiento de caja — el vínculo es opcional por diseño.

---

*Capacidad 4 (Costos Reales de Obra): CERRADA y validada contra Supabase real.*
