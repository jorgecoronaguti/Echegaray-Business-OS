-- LA REFERENCIA SOLA NO IDENTIFICA UN MOVIMIENTO: EL BANCO LA REPITE PARA LA OPERACIÓN Y SU PERCEPCIÓN.
--
-- ═══ POR QUÉ (31/07) ═══
--
-- La migración de ayer declaró `(cuenta, referencia)` como clave única, con un razonamiento correcto —el
-- saldo corrido cambia entre descargas y por eso dejó entrar 62 duplicados, la referencia no cambia—.
-- Pero al conciliar el extracto 01/07→31/07 el índice rechazó una fila legítima:
--
--   01/07  ref 00114824  Cod. 2145  Compra en el exterior - Google workspace     $-37.926,00
--   01/07  ref 00114824  Cod. 3769  Percep perc rg 5617 30% o suj - Google w.    $-11.203,92
--
-- Son DOS movimientos reales de la cuenta: el consumo y la percepción que lo acompaña. El banco los
-- numera con la misma referencia porque pertenecen a la misma operación, y los distingue por el Código
-- Operativo —una columna que el parser no captura y que una captura de pantalla no trae—. Con la clave
-- de ayer, cargar el extracto significaba PERDER la percepción: 0 errores visibles y un impuesto menos.
--
-- ═══ LA CLAVE CORRECTA: (cuenta, referencia, importe) ═══
--
-- Sigue impidiendo lo que tenía que impedir —la MISMA fila de otra descarga, que repite referencia e
-- importe— y deja pasar lo que nunca debió bloquear: dos movimientos distintos de la misma operación.
-- El importe es parte de la identidad del movimiento y, al contrario del saldo, no depende de la ventana
-- de la descarga: es el dato que el banco reporta igual siempre.
--
-- Lo que NO se toca: el índice viejo por (cuenta, fecha, concepto, importe, saldo) sigue protegiendo las
-- filas sin referencia (las que entran por captura de pantalla). Esta migración sólo corrige la clave
-- fuerte, y es idempotente.

drop index if exists public.banco_movimientos_ref_unico;

create unique index if not exists banco_movimientos_ref_importe_unico
  on public.banco_movimientos (cuenta, referencia, importe)
  where referencia is not null;

comment on column public.banco_movimientos.referencia is
  'Referencia del banco (columna Referencia del CSV). Identifica el movimiento y NO cambia entre descargas, a diferencia del saldo corrido. Para los cheques ES el número de cheque, lo que permite cruzar por identidad. NO es única por sí sola: el banco repite la referencia para una operación y su percepción (compra en el exterior + RG 5617), así que la clave es (cuenta, referencia, importe). Nula cuando el movimiento entró por captura de pantalla.';
