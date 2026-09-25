-- ERP OBRAS · EL COEFICIENTE DE AJUSTE DE LA PARTIDA (25/09/2026).
--
-- La planilla de cotización de Echegaray multiplica cada partida por su «COEF. AJUSTE» (hoja Presupuesto,
-- col. G): SUBTOTAL = costo unitario × cantidad × coeficiente, y la MO, las cargas sociales y las horas de la
-- partida también lo llevan. `cotizacion_partida` no lo guardaba, y la conversión «desde el presupuesto»
-- (C02) calculaba el costo de MO de la historia sin él: en Quattropani el bobcat con martillo (coef. 1450)
-- daba $ 272 en vez de $ 394.400, y la instalación sanitaria (coef. 3) y la eléctrica (coef. 2) quedaban
-- subvaluadas, con los pesos de toda la obra corridos.
--
-- 1 es el valor neutro: las partidas existentes —y las congeladas, que no se reescriben— conservan el
-- cálculo que ya tenían. El permiso de la tabla es a nivel tabla: la columna nace legible y escribible
-- para quien ya podía leer y escribir la partida.

alter table public.cotizacion_partida
  add column if not exists coef_ajuste numeric not null default 1;
alter table public.cotizacion_partida drop constraint if exists cotizacion_partida_coef_ajuste_positivo;
alter table public.cotizacion_partida
  add constraint cotizacion_partida_coef_ajuste_positivo check (coef_ajuste > 0);
comment on column public.cotizacion_partida.coef_ajuste is
  'Coeficiente de ajuste de la partida (planilla de cotización, Presupuesto col. G «COEF. AJUSTE»). Multiplica costo, MO, cargas sociales y HH de la partida. 1 = sin ajuste.';
