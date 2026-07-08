---
name: prp-014-posicion-caja-consolidada-f1
description: F1 — Posición de Caja Consolidada y Proyectada (features/posicion-caja). Servicio único de forecast semanal/mensual, reemplaza el cálculo de cobros proyectados que antes vivía duplicado en el Dashboard, con alerta de déficit integrada al Centro de Acción.
metadata:
  type: project
---

Fecha: 2026-07-08. Construido sobre la línea base real cargada en PR0-B/PR0-C (ver [[pr0-linea-base-echegaray]]).

## Qué se construyó

`features/posicion-caja/` — 100% síntesis TypeScript, cero tablas o vistas SQL nuevas (mismo criterio que Dashboard, PRP-011): lee `cuentas_financieras`, `movimientos_caja`, `obligacion_resumen` y `aplicaciones_pago` (todas ya existentes) y calcula:

- **Saldo actual**: suma de `saldo_inicial` de cuentas + impacto acumulado de todo `movimientos_caja` con `estado='real'`.
- **Forecast semanal** (8 semanas) y **mensual** (6 meses), cada período con: saldo inicial, cobros ciertos (`estado='real'`), cobros estimados (`estado='proyectado'`), pagos comprometidos (`obligacion_resumen.saldo_pendiente` con vencimiento en el período), pagos proyectados sueltos (`movimientos_caja` pago proyectado sin obligación asociada), saldo final, y detalle trazable (array de ítems que componen cada cifra).
- **Anti-doble-conteo**: un `movimiento_caja` ya vinculado a una obligación (vía `aplicaciones_pago`) no se vuelve a sumar como "pago proyectado suelto" — se usa el `saldo_pendiente` de la obligación como única fuente para ese compromiso.
- **Alerta de déficit**: cualquier semana (de las primeras 4) con saldo final negativo — se integra al Dashboard (`mapPosicionCaja`, categoría `posicion_caja`) exactamente igual que las demás capacidades, y de ahí a Centro de Acción vía `accionDesdeAlerta` (sin mecanismo nuevo).

## Reemplazo de lógica duplicada (instrucción explícita del usuario)

`dashboardDataService.ts` calculaba inline "cobros proyectados en los próximos N días" para alimentar `calcularTensionLiquidez` (obligaciones, PRP-010). Esa lógica se extrajo a `cobrosProyectadosEnVentana()` dentro de `features/posicion-caja/types` — el Dashboard ahora importa y llama esa función en vez de reimplementarla. Cero tercer cálculo paralelo.

## Gap de esquema resuelto durante PR0-C, no antes

`movimientos_caja_contraparte_check` exigía `obra_id` en todo cobro y `proveedor_id` en todo pago — esto bloqueaba Mantenimiento (ARCOR, sin obra discreta) y nómina/cargas sociales/impuestos (sin proveedor real). Jorge eligió relajar el constraint (migración `relajar_contraparte_movimientos_caja`) en vez de fabricar un proveedor/obra placeholder: se agregó `categoria_pago` (nomina/cargas_sociales/impuestos) para pagos sin proveedor, y `obra_id` quedó opcional en cobros.

## Cobertura real al momento de construir F1 — parcial, declarada explícitamente

Con los datos hoy cargados (saldo real $6.213.342,75, nómina real -$9.393.250, 2 cobros proyectados de La Estrella, 10 obligaciones), **el saldo actual calculado da negativo (-$3.179.907,25)** — resultado real, no un error del cálculo, consistente con las alertas "🔴 CRÍTICO" ya vistas en el Flujo de Caja legacy. La UI (`/caja`) muestra explícitamente que la cobertura de CxC/cheques/gastos generales sigue parcial — no se presenta el número como si fuera una posición de caja completa.

## Qué falta para que la cobertura sea completa (no bloqueante para tener F1 funcionando)

- Cargar el resto de CF_COB (~1.470 de ~1.500 filas sin inspeccionar).
- Cargar el detalle de cheques individuales (997 filas en `Flujo de Caja` → Cheques) — hoy solo están como obligación agregada.
- Cargar los adicionales P/FACTURAR (Alquiler Puntales) — ya no bloqueado por el esquema, solo falta el cliente "Macro Construcciones" y la carga en sí.
- Resolver el gap de IIBB (vencimiento exacto, no solo devengado mensual).

## Relación con el resto del sistema

Reutiliza `calcularAlertasGeneralesObligaciones`/`calcularTensionLiquidez` de `obligaciones/types` sin reimplementarlos. Sigue exactamente el patrón `capacidad calcula sus propias alertas puras → Dashboard normaliza a AlertaDashboard → Centro de Acción convierte con accionDesdeAlerta` ya establecido en PRP-011/PRP-013 — cero mecanismo nuevo de alertas ni de conversión a acción.

## Pruebas

`npm run typecheck`, `npm run lint`, `npm run build` limpios. Playwright: 6/6 tests en `tests/caja.spec.ts` (incluye uno nuevo verificando que la sección de F1 no rompe el render sin sesión), + 8 tests de dashboard/obligaciones/áreas sin regresión — todo bajo el mismo patrón ya establecido de "sin login, RLS bloquea correctamente, no debe crashear" (este proyecto no tiene todavía un flujo de login para Playwright).
