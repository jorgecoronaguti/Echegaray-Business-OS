-- PR0-B — Carga de línea base real en Supabase (producción)
-- Ejecutado: 2026-07-07, vía mcp__supabase__execute_sql, no como migración de esquema.
-- Este archivo es un registro de auditoría de lo que se cargó — no se vuelve a ejecutar
-- automáticamente (no es un archivo de supabase/migrations).

insert into public.clientes (nombre) values
  ('ARCOR'),
  ('La Estrella (Alimentos del Sur SAS)'),
  ('San Francisco (IMOTOR / Javier Sánchez)'),
  ('Messinas');

insert into public.proveedores (nombre) values
  ('Alumetal'),
  ('Const-Sek'),
  ('Corralon Progreso'),
  ('DUPEC'),
  ('Gerson Castro'),
  ('Mariana SA');

insert into public.cuentas_financieras (nombre, tipo, saldo_inicial) values
  ('Banco', 'banco', 3473742.75),
  ('Caja / Efectivo', 'caja', 2739600);

insert into public.obras (cliente_id, nombre, estado, monto_contratado, fecha_inicio, fecha_fin_objetivo)
select id, 'Cambio de Pisos - RRHH', 'pausada', 9400000, '2026-06-22', '2026-07-03'
from public.clientes where nombre = 'ARCOR';

insert into public.obras (cliente_id, nombre, estado, monto_contratado, fecha_inicio, fecha_fin_objetivo)
select id, 'Galpón 9', 'pausada', 49737708.99, '2026-07-06', '2026-08-07'
from public.clientes where nombre = 'La Estrella (Alimentos del Sur SAS)';

insert into public.obras (cliente_id, nombre, estado, monto_contratado, fecha_inicio, fecha_fin_objetivo)
select id, 'Pisos', 'pausada', 47590271.50, '2026-06-22', '2026-08-21'
from public.clientes where nombre = 'San Francisco (IMOTOR / Javier Sánchez)';

insert into public.obligaciones (proveedor_id, concepto, monto_total, fecha_origen, fecha_vencimiento, fuente_legacy)
select id, 'Deuda comercial acumulada (RESUMEN Flujo de Caja al corte)', 20837210, '2026-07-01'::date, null::date, 'flujo_caja_sheet' from public.proveedores where nombre = 'Alumetal'
union all
select id, 'Deuda comercial acumulada (RESUMEN Flujo de Caja al corte)', 1747170, '2026-07-01'::date, null::date, 'flujo_caja_sheet' from public.proveedores where nombre = 'Const-Sek'
union all
select id, 'Deuda comercial acumulada (RESUMEN Flujo de Caja al corte)', 4351121.5, '2026-07-01'::date, null::date, 'flujo_caja_sheet' from public.proveedores where nombre = 'Corralon Progreso'
union all
select id, 'Deuda comercial acumulada (RESUMEN Flujo de Caja al corte)', 524810, '2026-07-01'::date, null::date, 'flujo_caja_sheet' from public.proveedores where nombre = 'DUPEC'
union all
select id, 'Deuda comercial acumulada (RESUMEN Flujo de Caja al corte)', 250000, '2026-07-01'::date, null::date, 'flujo_caja_sheet' from public.proveedores where nombre = 'Gerson Castro'
union all
select id, 'Deuda comercial acumulada (RESUMEN Flujo de Caja al corte)', 763365, '2026-07-01'::date, null::date, 'flujo_caja_sheet' from public.proveedores where nombre = 'Mariana SA';

insert into public.obligaciones (concepto, monto_total, fecha_origen, fecha_vencimiento, fuente_legacy, notas) values
  ('Deuda impositiva (ARCA)', 1982466, '2026-07-01'::date, null::date, 'flujo_caja_sheet', 'Categoría "ARCA" del resumen de Flujo de Caja — confirmado deuda impositiva, no proveedor comercial. Sin fecha de vencimiento exacta encontrada.'),
  ('Deuda financiera (Banco)', 2550633, '2026-07-01'::date, null::date, 'flujo_caja_sheet', 'Categoría "Banco" del resumen de Flujo de Caja — confirmado deuda financiera, no proveedor comercial. Sin fecha de vencimiento exacta encontrada.'),
  ('Fondo de Cese Laboral / UOCRA / IERIC - Proyección 931 (junio 2026)', 2700000, '2025-10-28'::date, '2026-07-10'::date, 'control_gastos', null),
  ('Alquileres (junio 2026)', 2000000, '2025-10-28'::date, '2026-06-10'::date, 'control_gastos', 'Vencimiento ya pasado al corte (01/07/2026) y todavía marcado "A PAGAR" en la fuente — la columna Estado de esta planilla también mostraba "A PAGAR" en mayo sin marcarse pagado después, posible desactualización de esa columna. Confianza media.');

insert into public.acciones (origen, titulo, causa, area, severidad, obra_id, estado)
select 'manual', 'Verificar fecha de inicio real de la obra', 'fecha_inicio cargada desde ficha de control (Ingresos y Egresos - P&L), muy cercana a la fecha de lectura del archivo — posible fórmula HOY() no fijada, no confirmada como fecha histórica real', 'obras_produccion', 'media', id, 'pendiente'
from public.obras where nombre = 'Galpón 9';

insert into public.acciones (origen, titulo, causa, area, severidad, obra_id, estado)
select 'manual', 'Verificar fecha de inicio real de la obra', 'fecha_inicio cargada desde ficha de control (Ingresos y Egresos - P&L), muy cercana a la fecha de lectura del archivo — posible fórmula HOY() no fijada, no confirmada como fecha histórica real', 'obras_produccion', 'media', id, 'pendiente'
from public.obras where nombre = 'Cambio de Pisos - RRHH';

-- Nota: fecha_inicio de "Pisos" (San Francisco) se cargó como 2026-06-22, NO como el
-- 2026-07-06 que mostraba la misma ficha de control — se resolvió el conflicto con el
-- tracker Gantt real (avance_obra.xlsx → San Francisco), que muestra tareas ya
-- "Completado" desde esa fecha. Por eso San Francisco NO tiene acción de verificación:
-- su fecha ya está corroborada por evidencia independiente.

-- GAP DE ESQUEMA (2026-07-07) resuelto en PR0-C — ver migración
-- relajar_contraparte_movimientos_caja (supabase/migrations). Jorge eligió relajar el
-- constraint en vez de fabricar un proveedor/obra placeholder. Tras la migración se
-- cargaron los siguientes movimientos_caja que antes estaban bloqueados:

insert into public.movimientos_caja (tipo, estado, monto, cuenta_financiera_id, fecha_esperada, fecha_real, concepto, origen, categoria_pago, notas)
select 'pago', 'real', 9393250, id, '2026-06-30', '2026-06-30',
  'Nómina obreros - semana que cierra 30/06/2026', 'manual', 'nomina',
  'Fuente: JORNALES (Obreros 26), TOTAL SEMANA. Desglose origen: Caja $9.270.000 + diferencia $123.250 sin reconciliar en la planilla (posible ajuste). No se usó la línea "JORNALES OBRAS" de CONTROL DE GASTOS ($3.500.000) por ser un valor repetido sin variar entre mayo y junio.'
from public.cuentas_financieras where tipo = 'caja';

insert into public.movimientos_caja (tipo, estado, monto, cuenta_financiera_id, fecha_esperada, cliente_id, obra_id, concepto, origen, referencia_externa, notas)
select 'cobro', 'proyectado', 14999999.99, cf.id, '2026-07-02',
  cl.id, ob.id,
  'Echeq pendiente - Oficinas y Fábrica de Palitos (FA 01-00000208)', 'flujo_caja_sheet', '01-00000208',
  'CF_COB fila 22: categoría B (con factura), estado Pendiente, ya vencido a la fecha de lectura (07/07/2026). vencimiento original 02/07/2026.'
from public.cuentas_financieras cf, public.clientes cl
left join public.obras ob on ob.cliente_id = cl.id and ob.nombre = 'Galpón 9'
where cf.tipo = 'banco' and cl.nombre = 'La Estrella (Alimentos del Sur SAS)';

insert into public.movimientos_caja (tipo, estado, monto, cuenta_financiera_id, fecha_esperada, cliente_id, obra_id, concepto, origen, referencia_externa, notas)
select 'cobro', 'proyectado', 10000000, cf.id, '2026-07-15',
  cl.id, ob.id,
  'Echeq pendiente - Galpón 9 (FA 01_00000213)', 'flujo_caja_sheet', '01_00000213',
  'CF_COB fila 29: categoría B (con factura), estado Pendiente, vence 15/07/2026.'
from public.cuentas_financieras cf, public.clientes cl
left join public.obras ob on ob.cliente_id = cl.id and ob.nombre = 'Galpón 9'
where cf.tipo = 'banco' and cl.nombre = 'La Estrella (Alimentos del Sur SAS)';

-- TODAVÍA NO CARGADO (próximo incremento, ya no bloqueado por esquema):
-- 1) Adicionales P/FACTURAR (Alquiler Puntales - Macro Construcciones, $38.720 y
--    $58.080) — ahora cargable como cobro sin obra_id, cliente "Macro Construcciones"
--    todavía no creado.
-- 2) Resto de CF_COB (~1.470 de ~1.500 filas sin inspeccionar) — cobertura de CxC
--    sigue parcial.
-- 3) Detalle de cheques individuales (997 filas en Flujo de Caja → Cheques) — se
--    cargaron los saldos agregados (obligaciones), no el instrumento por instrumento.
