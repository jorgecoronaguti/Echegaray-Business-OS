-- LA REFERENCIA DEL BANCO: LA ÚNICA CLAVE QUE IDENTIFICA UN MOVIMIENTO.
--
-- ═══ POR QUÉ (30/07) — EL ÍNDICE ÚNICO NO ALCANZÓ, Y EL MOTIVO ESTÁ ESCRITO EN SU PROPIA MIGRACIÓN ═══
--
-- La tabla se creó con la clave (cuenta, fecha, concepto, importe, coalesce(saldo_despues,0)), y el
-- comentario de esa migración razonaba —con buen criterio— que el SALDO tenía que formar parte de la
-- clave: dos transferencias iguales el mismo día a la misma persona son dos movimientos reales, y lo
-- único que las distingue es el saldo corrido.
--
-- El razonamiento tiene un agujero que los datos destaparon hoy: DOS DESCARGAS DEL MISMO MOVIMIENTO
-- REPORTAN SALDOS DISTINTOS. El echeq 306 de $317.000 del 07/07 quedó con saldo -3.397.612,85 en la
-- descarga del 22/07 y con -3.541.112,85 en el CSV del 30/07 — el saldo corrido depende de la ventana
-- y del orden con que el banco arma la descarga, no es una propiedad del movimiento. Con el saldo en
-- la clave, el mismo movimiento entra de nuevo en cada descarga que se superpone: exactamente la
-- duplicación que el índice venía a impedir. Resultado medido: 62 movimientos duplicados, ~$46,8M de
-- volumen contado dos veces. No dio ningún error — un duplicado no grita, sólo infla las sumas.
--
-- ═══ LA CLAVE CORRECTA YA VENÍA EN EL ARCHIVO, Y EL PARSER LA TIRABA ═══
--
-- El CSV del Santander trae una columna `Referencia`: 000008691, 16862006, 000000315… Es el
-- identificador del movimiento en el banco y no cambia entre descargas. El parser la descartaba porque
-- sólo mapeaba fecha/concepto/importe/saldo.
--
-- Y trae un regalo: PARA LOS CHEQUES, LA REFERENCIA ES EL NÚMERO DE CHEQUE.
--   0133;000000315;Cheque debitado          → cheque físico 315
--   3043;000000299;Echeq clearing recibido  → echeq 299
-- Con eso, cruzar un cheque contra el extracto deja de ser una heurística por importe —que confunde
-- cuatro débitos de $383.175 del mismo día— y pasa a ser una identidad.
--
-- ═══ POR QUÉ EL ÍNDICE VIEJO SE CONSERVA ═══
--
-- No todo movimiento tiene referencia: cuando el dueño pega una captura de pantalla en vez de bajar el
-- CSV, no hay columna Referencia. Para esas filas la única clave posible sigue siendo la vieja. Por eso
-- el índice nuevo es PARCIAL (sólo donde hay referencia) y el viejo queda para el resto. Un movimiento
-- con referencia nunca se duplica; uno sin referencia sigue tan protegido como antes, no menos.

alter table public.banco_movimientos
  add column if not exists referencia text;

comment on column public.banco_movimientos.referencia is
  'Referencia del banco (columna Referencia del CSV). Identifica el movimiento y NO cambia entre descargas, a diferencia del saldo corrido. Para los cheques ES el número de cheque, lo que permite cruzar por identidad en vez de por importe. Nula cuando el movimiento entró por captura de pantalla.';

-- LA CLAVE FUERTE, donde el dato la permite. Parcial: las filas sin referencia no compiten por este
-- índice y siguen deduplicándose por el viejo.
-- CORREGIDO 03/08/2026: este índice era (cuenta, referencia) y NO SE PUEDE CREAR sobre los datos
-- reales — el banco REPITE la referencia para una operación y su percepción. Verificado en la base
-- viva: la referencia 114824 es la compra de Google Workspace (-37.926,00) y su percepción RG 5617
-- (-11.203,92), las dos legítimas y las dos con el mismo número.
--
-- La migración siguiente (20260731130000) ya lo arreglaba agregando el importe, pero ésta corre
-- primero y abortaba con "could not create unique index", así que la cadena entera quedaba sin
-- aplicar y el importador nunca llegaba a escribir. Se crea directo en la forma final: mismo estado
-- final, sin el paso que falla.
create unique index if not exists banco_movimientos_ref_importe_unico
  on public.banco_movimientos (cuenta, referencia, importe)
  where referencia is not null;

-- Para cruzar cheques por identidad sin escanear la tabla entera.
create index if not exists banco_movimientos_referencia
  on public.banco_movimientos (referencia)
  where referencia is not null;
