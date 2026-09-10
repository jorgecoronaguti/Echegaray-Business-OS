-- UN DEPÓSITO QUE EL BANCO LISTA Y TODAVÍA NO ACREDITA NO ES SALDO (10/09/2026).
--
-- EL DEFECTO. El extracto del Santander trae los "Movimientos del Día" sin saldo corrido, y el
-- importador lo reconstruía con la identidad saldo(n)=saldo(n−1)+importe(n). Ese día la cadena llegó
-- a $42.157.467,50 y el banco declaraba al pie $3.584.941,27. La diferencia, $38.572.526,23, es
-- exactamente la suma de dos filas:
--
--     Deposito e-cheq 48hs presencia bsr    $ 6.567.841,01
--     Deposito e-cheq int ots plazas        $32.004.685,22
--
-- Depósitos de eCheq retenidos 48 hs: el banco los LISTA y no los acredita. La identidad contesta
-- "cuánto se movió" y CAJA pregunta "cuánto HAY" — de ese número cuelgan la disponibilidad, el piso
-- proyectado y las decisiones de pago.
--
-- QUÉ AGREGA. La marca que separa las dos preguntas. Un movimiento marcado no entra a la cadena de
-- saldos y su `saldo_despues` queda NULL hasta que un extracto posterior lo traiga acreditado: ahí el
-- saldo se COPIA del banco (nunca se recalcula) y la marca se apaga sola.
--
-- PERMISOS: `banco_movimientos` no tiene GRANT para `authenticated` ni `anon` —sólo la escribe y la
-- lee el service_role del importador—, así que la columna nueva no necesita un GRANT propio. Si algún
-- día se le da lectura a la web, va por columna y explícito (ver la memoria "columna nueva nace sin
-- permiso").

alter table public.banco_movimientos
  add column if not exists acreditacion_pendiente boolean not null default false;

comment on column public.banco_movimientos.acreditacion_pendiente is
  'El banco listó este depósito y todavía NO lo acreditó (retención de 48 hs de un eCheq). Mientras esté en true la fila no entra a la cadena de saldos y saldo_despues es NULL: no es plata disponible. Se apaga cuando un extracto posterior trae el movimiento con su saldo corrido. Ver orquestador/lib/banco-acreditacion.mjs.';

-- Los pendientes son pocos y se consultan por cuenta y fecha al cerrar el día: índice parcial, que no
-- pesa sobre el resto de la tabla.
create index if not exists banco_movimientos_pendientes
  on public.banco_movimientos (cuenta, fecha)
  where acreditacion_pendiente;
