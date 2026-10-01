-- 20261001T0600 · LA ESCALA DE SEPTIEMBRE 2026, CON EL VALOR QUE EL ESTUDIO LIQUIDÓ
--
-- `convenio_escala` terminaba en 2026-08-01 (Oficial Especializado 7.420) y los recibos reales de la 1ª quincena de
-- septiembre (`recibo_sueldo_linea`, periodo Q1-09/2026) pagan 7.561 (+1,9 %). La tarjeta «Recibo / Plataforma» de
-- Liquidación leía el $/h del recibo de una tabla y el de plataforma de la otra, y la misma categoría salía con dos
-- números. Desde el cambio de código los dos renglones leen de ESTA tabla; para que digan el valor real de septiembre
-- la escala necesita su tramo.
--
-- QUÉ NO ENTRA: Medio Oficial. No hay recibo de esa categoría en Q1-09/2026 y un valor inventado sería un piso falso
-- (la regla de la tabla: sin fila, «sin piso»). La pantalla muestra su última fila (desde 2026-08-01) con la fecha.
--
-- Idempotente: `on conflict (convenio, categoria, desde) do nothing` (restricción convenio_escala_una_por_dia).

set local lock_timeout = '5s';

insert into public.convenio_escala (convenio, categoria, desde, valor_hora, fuente)
select c.convenio, v.categoria, date '2026-09-01', v.valor_hora, 'valor hora liquidado por el estudio en los recibos Q1-09/2026'
from (values ('0076/75 UOCRA'), ('UOCRA — Ley 22.250 (construcción)')) as c(convenio)
cross join (values
  ('Ayudante', 5502::numeric),
  ('Oficial', 6468::numeric),
  ('Oficial Especializado', 7561::numeric)
) as v(categoria, valor_hora)
on conflict (convenio, categoria, desde) do nothing;
