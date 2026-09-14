-- LA CLAVE DE UN MOVIMIENTO DEL BANCO LLEVA LA FECHA.
--
-- ═══ EL DEFECTO, MEDIDO EL 14/09/2026 ═══
--
-- El echeq 308 (NEUMAGOM, $317.000) se debitó el 10/09 («Echeq canje interno recibido 24hs», ref
-- 000000308), el banco lo rechazó el mismo día («Rechazo echeq falla tec. no libra - Dia no laborable»,
-- +$317.000) y lo VOLVIÓ A DEBITAR el 11/09 con la MISMA referencia y el MISMO importe. La clave única
-- (cuenta, referencia, importe) rechazó el segundo débito como duplicado del primero: la base quedó
-- $317.000 por encima del saldo que declara el banco y `auditar-saldo-banco.mjs` dio «NO CIERRA».
--
-- La referencia del banco identifica la OPERACIÓN (para un cheque, el número de cheque), no el
-- movimiento: un cheque rechazado y re-presentado repite referencia e importe en otro día. La fecha
-- de un movimiento no cambia entre descargas (lo que cambia es el saldo corrido), así que agregarla
-- no reabre el problema de las ventanas superpuestas.
--
-- Va junto con `claveReferencia` de `orquestador/lib/banco-importar.mjs`: la clave del código y la de
-- la base tienen que ser la misma o el conteo del importador miente.

drop index if exists public.banco_movimientos_ref_importe_unico;

create unique index if not exists banco_movimientos_ref_importe_fecha_unico
  on public.banco_movimientos (cuenta, referencia, importe, fecha)
  where referencia is not null;

comment on column public.banco_movimientos.referencia is
  'Referencia del banco (columna Referencia del CSV). Identifica la OPERACIÓN y no cambia entre descargas, a diferencia del saldo corrido. Para los cheques ES el número de cheque. NO es única por sí sola: el banco la repite para una operación y su percepción (distinto importe) y para un cheque rechazado y vuelto a debitar (distinta fecha, 14/09/2026). La clave es (cuenta, referencia, importe, fecha). Nula cuando el movimiento entró por captura de pantalla.';
