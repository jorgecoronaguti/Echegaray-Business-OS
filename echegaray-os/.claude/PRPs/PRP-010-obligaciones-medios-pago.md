# PRP-010: Obligaciones y Medios de Pago

> **Estado**: CERRADA
> **Fecha**: 2026-07-07
> **Proyecto**: Echegaray Business OS

---

## Objetivo

Construir la capa de compromisos financieros futuros que falta entre Compra/Costo/Gasto → **Obligación** → Vencimiento → Medio/Instrumento de pago → Pago real → Caja. Responder qué debe pagar Echegaray, a quién, por qué concepto, cuándo vence, cuánto ya se pagó y cuánto queda pendiente — sin mezclar Obligación con Costo Real ni con Caja, y sin fabricar historia legacy, dejando el modelo listo para recibir saldos de apertura cuando llegue la puesta en marcha.

## Verificación puntual de fuentes reales (antes de modelar, no discovery general)

- **"Flujo de Caja - Cash Flow" > pestaña "Compras"** (más completa y activa que `CONTROL DE GASTOS.xlsx`, verificado en PRP-004): ya distingue `Total o Parcial`, `Monto Pagado`, `Monto Parcial`, `Tipo pago` (Transferencia, Efectivo — sí poblado acá) y `Fecha pago real Total` — **pagos parciales son una práctica real confirmada**, no una necesidad hipotética.
- **"Flujo de Caja - Cash Flow" > pestaña "RESUMEN"**: tabla `PROVEEDOR/DEUDAS` (cuentas por pagar agregadas por proveedor) y una mini-tabla **"CHEQUES EMITIDOS"** (columnas: fecha de pago, proveedor, monto) — cheques se registran hoy de forma simple, **sin número de cheque, sin fecha de emisión ni vencimiento como campos separados** de la fecha de pago.
- **Echeq**: búsqueda específica sin resultados — no existe ninguna práctica de registro hoy (confirmado, no solo inferido).
- **Tarjeta**: sin evidencia real de uso como medio de pago de compras (resultados encontrados son irrelevantes o de un trámite IERIC no relacionado con pagos).
- **Obligaciones generales sin proveedor/obra**: confirmadas — "ARCA" (AFIP), "SINDICATOS", "Sueldos" aparecen como categorías de pago proyectado en la pestaña PROYECTADO, sin ser un Proveedor de la tabla `proveedores` ni estar vinculadas a una Obra.

## Distinción conceptual aplicada

| Concepto | Definición aplicada | Tabla |
|---|---|---|
| Compra | Proceso comercial/operativo | `compras` (PRP-009), sin cambios |
| Costo Real | Impacto económico/devengado | `costos_reales` (PRP-004), sin cambios |
| **Obligación** | Compromiso financiero exigible, total o parcialmente pendiente | **`obligaciones` (nueva)** |
| Medio de pago | Cómo se cancela | `movimientos_caja.medio_pago` (columna nueva) |
| Instrumento con vida propia (cheque/echeq) | Compromiso con fecha relevante propia | **No es tabla nueva** — ya es `movimientos_caja.estado` (proyectado/real) |
| Movimiento de Caja | Impacto financiero percibido | `movimientos_caja` (PRP-001), extendido |

## Análisis de arquitectura

### Decisión 1: `obligaciones` sirve también como unidad de cuota/vencimiento — no hace falta tabla "cuotas"

Una obligación en 3 cuotas se modela como **3 filas de `obligaciones`** compartiendo `compra_id` (o `costo_real_id`), cada una con su propio `monto_total` y `fecha_vencimiento`. Verificado con datos reales (Escenario 3). Esto evita una cuarta entidad: la "cuota" no es conceptualmente distinta de una obligación con su propio vencimiento — es la misma entidad usada varias veces.

### Decisión 2 (la más importante de la capacidad): `aplicaciones_pago` es la única relación genuinamente muchos-a-muchos

Un pago puede saldar **varias** obligaciones (pago agrupado a un proveedor) y una obligación puede recibir **varios** pagos (parciales). A diferencia del patrón "FK del lado de muchos" usado en Compras (PRP-009, donde un pago pertenece a exactamente una compra), acá un mismo pago puede repartirse entre distintas obligaciones — eso exige una tabla de unión real con su propio `monto_aplicado` (la porción de ese pago que corresponde a esa obligación).

Se implementaron dos garantías estructurales, **con trigger** (no CHECK, porque hay que sumar filas hermanas y consultar otra tabla):
- Nunca aplicar más de lo que debe una obligación (`sum(monto_aplicado) <= obligaciones.monto_total`).
- Nunca aplicar de un pago más de lo que ese pago realmente vale (`sum(monto_aplicado) <= movimientos_caja.monto`).
- El movimiento vinculado siempre debe ser de tipo `pago` (nunca `cobro`).

Más un `unique(obligacion_id, movimiento_caja_id)` que impide insertar dos veces el mismo vínculo exacto (doble aplicación literal).

### Decisión 3: NO se crea una tabla `instrumentos_pago`

El ciclo emisión → vencimiento → débito real de un cheque/echeq **ya es exactamente** lo que `movimientos_caja.estado` (`proyectado`/`real`) representa desde PRP-001: un cheque emitido hoy con impacto futuro es un movimiento `proyectado` con `fecha_esperada` = vencimiento estimado; el día que se acredita/debita realmente, pasa a `real` con `fecha_real`. Construir una tabla nueva habría duplicado ese ciclo. Solo se agregaron dos columnas a `movimientos_caja`:
- `medio_pago` (enum: efectivo, transferencia, débito, tarjeta, cheque, echeq, otro) — clasificación simple.
- `referencia_instrumento` (texto libre) — para número de cheque/echeq/comprobante, lo único que la evidencia real (Flujo de Caja) sostiene hoy.

Tarjeta se mantiene como una opción del enum (para no bloquear el futuro) pero **no se construyó un modelo de "resumen de tarjeta"** (consumo → resumen → vencimiento → pago) por falta de evidencia real de uso — documentado como brecha a resolver si se confirma la práctica.

### Decisión 4: `obra_id` y `proveedor_id` nullable en `obligaciones`

Igual que en Compras (PRP-009): existen obligaciones generales de empresa (impuestos, sueldos, sindicatos) sin Obra, y podrían existir sin Proveedor formal. Si fueran `NOT NULL`, esos casos reales no podrían representarse.

**Descartado explícitamente:**
- Tabla `cuotas`/`vencimientos` separada — resuelto reutilizando `obligaciones` (Decisión 1).
- Tabla `instrumentos_pago` — resuelto extendiendo `movimientos_caja` (Decisión 3).
- Modelo de "resumen de tarjeta" — sin evidencia real que lo sostenga.
- Alerta de "posible doble pago o doble aplicación" — no se implementa como alerta, porque queda **estructuralmente imposible** por el trigger + `unique` (no hay nada que detectar, ya no puede ocurrir).
- Umbral automático de vencimiento de cheque — igual que `certificados.fecha_vencimiento` (PRP-007), solo se completa si el dato real existe.

---

## Modelo de datos

```sql
create table obligaciones (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid references obras(id) on delete restrict,
  proveedor_id uuid references proveedores(id) on delete restrict,
  compra_id uuid references compras(id) on delete set null,
  costo_real_id uuid references costos_reales(id) on delete set null,
  concepto text not null,
  monto_total numeric(14,2) not null check (monto_total > 0),
  fecha_origen date not null,
  fecha_vencimiento date,
  fuente_legacy text not null,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table aplicaciones_pago (
  id uuid primary key default gen_random_uuid(),
  obligacion_id uuid not null references obligaciones(id) on delete restrict,
  movimiento_caja_id uuid not null references movimientos_caja(id) on delete restrict,
  monto_aplicado numeric(14,2) not null check (monto_aplicado > 0),
  notas text,
  created_at timestamptz not null default now(),
  unique (obligacion_id, movimiento_caja_id)
);
-- Trigger aplicaciones_pago_valida_montos: exige tipo='pago' + no sobreaplicación
-- contra la obligación ni contra el movimiento.

alter table movimientos_caja add column medio_pago text
  check (medio_pago is null or medio_pago in ('efectivo','transferencia','debito','tarjeta','cheque','echeq','otro'));
alter table movimientos_caja add column referencia_instrumento text;

create view obligacion_resumen with (security_invoker = true) as
select o.*, coalesce(ap.monto_pagado,0) as monto_pagado,
  (o.monto_total - coalesce(ap.monto_pagado,0)) as saldo_pendiente,
  coalesce(ap.cantidad_aplicaciones,0) as cantidad_aplicaciones
from obligaciones o
left join lateral (select sum(monto_aplicado) as monto_pagado, count(*) as cantidad_aplicaciones
  from aplicaciones_pago where aplicaciones_pago.obligacion_id = o.id) ap on true;
```

RLS/GRANT: mismo patrón que todas las tablas anteriores; vista con GRANT propio + `security_invoker = true`.

---

## Blueprint (fase única) ✅ CERRADA (2026-07-07)

**Objetivo**: `obligaciones` + `aplicaciones_pago` + columnas nuevas en `movimientos_caja` + vista `obligacion_resumen` aplicadas y verificadas contra Supabase real; UI en `/obras/[id]` (obligaciones de esa obra) y nueva página `/obligaciones` (todas, incluidas las sin obra, con resumen general y alerta de tensión de liquidez).

**Validación — los 11 escenarios pedidos, todos con datos reales**:
1. Obligación simple → pago total: `saldo_pendiente = 0`. ✅
2. Obligación → 2 pagos parciales (12.000+8.000): `saldo_pendiente = 0`, `cantidad_aplicaciones = 2`. ✅
3. Obligación en 2 cuotas (mismo `compra_id`, vencimientos distintos). ✅
4-5. Cheque emitido (`estado='proyectado'`, `medio_pago='cheque'`, `referencia_instrumento='CHQ-00123'`, `fecha_esperada` futura, sin `fecha_real`) — no impacta caja todavía. ✅
6. Pago real que cancela obligación e impacta caja: cubierto en el escenario 1. ✅
7. Obligación legacy (`fecha_origen` en el pasado, `fuente_legacy='saldo_inicial_legacy'`) con pago parcial ya aplicado antes del corte: `saldo_pendiente = 30.000` de `50.000`. ✅
8. Obligación general sin obra (`obra_id = null`, concepto "ARCA - IIBB"). ✅
9. Obligación vinculada a una Compra (mismo caso que el escenario 3). ✅
10. Intento de aplicar $5.001 contra una obligación de $5.000 → rechazado por el trigger. ✅
11. Un mismo pago de $5.000 repartido entre dos obligaciones de $4.000 c/u: la segunda aplicación de $2.000 (que llevaría el total aplicado del pago a $6.000) fue rechazada; el remanente correcto de $1.000 sí se aplicó. Duplicado exacto del mismo vínculo (obligación, movimiento) rechazado por el `unique constraint` en un caso aislado. ✅

Además: vínculo a un movimiento tipo `cobro` rechazado por el trigger; `monto_total <= 0` rechazado; RLS/GRANT verificado con `SET LOCAL ROLE` en ambas tablas y la vista; `get_advisors(security)` sin hallazgos nuevos; `tsc`/`build`/`lint`/22 tests de Playwright en verde; datos `SMOKE TEST%` eliminados después de verificar.

---

## Gotchas
- [x] "Posible doble pago o doble aplicación" no es una alerta — es estructuralmente imposible por el trigger + `unique`. Documentado para que una futura sesión no intente "agregar" esa alerta (no hace falta).
- [ ] No existe todavía un modelo de "resumen de tarjeta" (consumo → resumen → vencimiento → pago) — sin evidencia real de uso, se pospone hasta confirmar la práctica.
- [ ] "Tensión de liquidez" solo compara la ventana de próximos `UMBRAL_DIAS_PROXIMO_VENCIMIENTO` días contra cobros proyectados en esa misma ventana — no es una proyección completa de caja (no incorpora saldo inicial de cuentas). Documentado como simplificación.
- [ ] Los umbrales (`UMBRAL_DIAS_PROXIMO_VENCIMIENTO=7`, `UMBRAL_CONCENTRACION_VENCIMIENTOS=3`, en `features/obligaciones/types/index.ts`) son propuestas no validadas con el usuario.
- [ ] Sin JWT real, no se pudo probar con Playwright la visibilidad de las alertas ni los formularios end-to-end (mismo límite de entorno de siempre, ver PRP-001).

## Anti-patrones
- NO crear una tabla `instrumentos_pago` que duplique el ciclo proyectado/real de `movimientos_caja`.
- NO crear una tabla `cuotas` separada — se resuelve con filas de `obligaciones` compartiendo origen.
- NO fabricar una fecha de vencimiento cuando no se conoce.
- NO fabricar historia legacy — el modelo soporta saldos de apertura (escenario 7) sin necesitar reconstruir movimientos históricos.
- NO construir todavía el Dashboard consolidado (la página `/obligaciones` es una lista/feature page, no un dashboard ejecutivo).

---

*Capacidad 10 (Obligaciones y Medios de Pago): CERRADA y validada contra Supabase real.*
