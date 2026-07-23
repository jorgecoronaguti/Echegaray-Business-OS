-- EL SALDO QUE EL BANCO DECLARA AL CIERRE DEL DÍA — EL DATO QUE NO TENÍA DÓNDE VIVIR.
--
-- POR QUÉ (23/07). El extracto trae dos cosas distintas y hasta hoy la base sólo guardaba una:
--
--   1. el DETALLE, movimiento por movimiento, con su saldo corrido → public.banco_movimientos;
--   2. la línea final "Saldo al 23/07/2026  4.813.461,54".
--
-- La segunda no es un movimiento y no entra en la tabla de movimientos, pero es el ÚNICO dato que
-- dice cuánta plata hay HOY. Los movimientos del día llegan sin saldo corrido —el banco todavía los
-- está liquidando— así que el detalle termina en el último saldo confirmado, que es el de AYER.
--
-- EL COSTO DE NO TENERLO. CAJA sacaba la disponibilidad de la última celda no vacía de la columna de
-- saldos de _BANCO_RAW y mostraba $4.982.191,63 cuando el banco declaraba $4.813.461,54: los
-- $168.730,09 de la compra con débito del día ya habían salido de la cuenta y ninguna celda lo
-- reflejaba. Un dueño que mira $4,98M y tiene $4,81M decide con plata que no existe.
--
-- Y ES EL DATO QUE CIERRA LA PREGUNTA DEL CLEARING. El mismo 23/07 entró un depósito de e-cheq de
-- otras plazas por $3.940.000 que el banco NO acreditó todavía (48 hs). El saldo declarado lo dice
-- solo: confirmado − la compra = declarado, y el depósito queda afuera. Sin este número habría que
-- SUPONER cuál de los dos movimientos del día impactó, y suponer sobre plata es lo que no se hace.
--
-- UNO POR CUENTA Y POR FECHA. El extracto se baja hasta dos veces por día: la segunda descarga del
-- mismo día trae el saldo actualizado y tiene que PISAR al anterior, no acumularse al lado.

create table if not exists public.banco_saldo_declarado (
  cuenta       text          not null default '179-091383/6',
  fecha        date          not null,
  saldo        numeric(16,2) not null,
  -- De dónde salió. La regla de oro pide fórmula o celda con origen trazable; un extracto importado
  -- es lo segundo, y sin esto no se sabe si el saldo es de hoy o de hace tres semanas.
  origen       text          not null,
  importado_en timestamptz   not null default now(),
  primary key (cuenta, fecha)
);

alter table public.banco_saldo_declarado enable row level security;

drop policy if exists banco_saldo_declarado_lectura on public.banco_saldo_declarado;
create policy banco_saldo_declarado_lectura on public.banco_saldo_declarado
  for select using (auth.role() = 'authenticated');

drop policy if exists banco_saldo_declarado_escritura on public.banco_saldo_declarado;
create policy banco_saldo_declarado_escritura on public.banco_saldo_declarado
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

comment on table public.banco_saldo_declarado is
  'La línea "Saldo al DD/MM/AAAA" del extracto del Santander: cuánta plata declara el banco a esa fecha, incluidos los movimientos del día que el detalle todavía lista sin saldo corrido. Lo consume _BANCO_RAW (rangos con nombre SALDO_BANCO_DECLARADO / SALDO_BANCO_FECHA) y de ahí la disponibilidad de CAJA.';
