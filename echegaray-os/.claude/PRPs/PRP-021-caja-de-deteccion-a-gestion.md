# PRP-021: Caja — de detección a gestión

> **Estado**: PENDIENTE — 2026-07-15
> **Subordinado a**: PRINCIPIO DE REALIDAD ÚNICA (Cash Flow = percibido) y "proteger/generar caja" del `CLAUDE.md` raíz. La caja es la palanca #1 declarada.
> **Extiende**: PRP-018 F2 (watcher de caja, ya vivo) y PRP-001 (fundación Flujo de Caja).

---

## Objetivo

Que el OS pase de **detectar** cobranzas/pagos vencidos a **gestionarlos**: priorizar qué cobrar y qué pagar primero según impacto en caja, preparar los reclamos y comunicaciones (borradores), y sostener un tablero de vencimientos que responda "¿alcanza la caja esta semana y qué hago?".

## Por qué

| Problema | Solución |
|---|---|
| El OS ya ve $25M sin cobrar y $7,8M por pagar, pero solo los muestra | Priorización accionable: qué mover primero y por qué |
| Los reclamos de cobranza se hacen a mano, tarde | Borradores de reclamo listos (Gmail, con aprobación) por cobro vencido |
| No hay proyección de caja corta con lo comprometido | Tablero: entradas/salidas esperadas por semana, saldo proyectado, gap |

**Valor**: acelerar cobranza y proteger caja (capacidades 8 y "generar caja" del CLAUDE.md); es el mayor $ inmediato con el dato que ya existe.

## Estado real verificado (NO reconstruir)

- `movimientos_caja` (48): tipo `cobro`/`pago`, estado `proyectado`/`real`, `monto`, `fecha_esperada`, `fecha_real`, `obra_id`, `cliente_id`, `proveedor_id`, `concepto`.
- Ya vivo: `lib/caja-alertas.mjs` (`alertasCaja` → vencidos por tipo con detalle) inyectado en vigilancia y briefing.
- Cobranzas vencidas reales hoy: 2 por $25M (Echeq Oficinas $15M vencido 02/07; Galpón 9 $10M). Pagos vencidos: 13 por $7,8M.
- Sync del Flujo de Caja real (Sheet) cada 4h ya existe (`echegaray-sync.timer`, `flush-saldos`).
- **Gap**: no hay priorización, ni borradores de reclamo, ni proyección de caja corta, ni seguimiento del ciclo de cada cobro/pago.

## Fases

- **F1 — Priorización de cobros y pagos**: ranking determinístico (0 API) por impacto en caja: monto × días de atraso × criticidad (nómina, ARCA, aceleración bancaria). Responde "qué cobrar/pagar primero" con el porqué. Extiende `alertasCaja`.
- **F2 — Proyección de caja corta**: saldo actual + entradas/salidas esperadas por semana (de `movimientos_caja`) → saldo proyectado y gap. Marca dónde no alcanza. Cash Flow = percibido, nunca mezclar con devengado.
- **F3 — Reclamos de cobranza (borradores)**: por cobro vencido, generar un borrador de reclamo (a quién, monto, factura/echeq, antigüedad) — Gmail borrador (Nivel C). **Enviar = Nivel E con aprobación** (depende de PRP-024).
- **F4 — Seguimiento del ciclo**: cada cobro/pago pasa por estados (esperado → gestionado → prometido → cobrado/pagado) con fecha y responsable; el OS reabre el que se venció sin avanzar. Métrica: días promedio de cobranza, % vencido gestionado.
- **F5 — Conciliación**: cruzar `movimientos_caja` (OS) con el extracto/Sheet real y con Gmail (avisos de pago) para detectar cobros ya ingresados no marcados y discrepancias. Reusa el sync existente.

## Criterios de éxito
- [ ] El OS responde "qué cobro/pago primero esta semana y por qué" con números reales (0 API).
- [ ] Proyección de caja a 1–4 semanas con saldo proyectado y gap, criterio percibido.
- [ ] Un borrador de reclamo de cobranza queda listo para revisar (sin enviarse solo).
- [ ] Ningún pago/envío externo ocurre sin aprobación (Nivel E).

## Dependencias y acción del dueño
- F3/F5 (Gmail) dependen de **PRP-024**. F4 se beneficia de PRP-022 (responsable por persona).
- Acción del dueño: confirmar saldo bancario real y las 2 obligaciones vencidas de $37,7M (dato crítico que hoy es DESCONOCIDO) para que la proyección no parta de base falsa.

## Riesgos
- Nunca mezclar devengado con percibido (regla de oro). Priorizar es informar, no ejecutar: mover plata real es siempre Nivel E con aprobación.
