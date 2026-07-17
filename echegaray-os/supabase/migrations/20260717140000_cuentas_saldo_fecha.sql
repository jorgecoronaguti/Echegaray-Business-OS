-- Ancla temporal del saldo real de cada cuenta financiera.
-- saldo_inicial es el saldo REAL del ledger del Sheet "Flujo de Caja - Cash Flow" (pestaña Caja),
-- y saldo_fecha dice A QUÉ FECHA corresponde ese saldo. Así la posición de caja NO vuelve a sumar
-- los movimientos reales que ese saldo ya refleja (los dated <= saldo_fecha): se evita el doble
-- conteo sin borrar filas (los reales están referenciados por aplicaciones_pago / obligaciones)
-- y sin inventar un saldo_inicial "mágico" — el valor tiene origen y fecha, es trazable.
alter table public.cuentas_financieras add column if not exists saldo_fecha date;
comment on column public.cuentas_financieras.saldo_fecha is
  'Fecha del ledger (Sheet Flujo de Caja, pestaña Caja) a la que corresponde saldo_inicial. Los movimientos reales con fecha <= saldo_fecha ya estan dentro de saldo_inicial y no se recuentan.';
