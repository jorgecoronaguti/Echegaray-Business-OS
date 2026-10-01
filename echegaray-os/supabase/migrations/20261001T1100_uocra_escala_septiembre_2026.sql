-- 20261001T1100 · LA ESCALA UOCRA DE SEPTIEMBRE 2026, DONDE LA LEE LA TIRA DE LIQUIDACIÓN
--
-- Dueño, 01/10/2026, literal: «dejala registrada en donde sale la escala uocra en liq hs». La tira «UOCRA 76/75 ·
-- <mes>» de Liquidación lee `public.uocra_escala` (`escalaUocraService.ts`), no `convenio_escala`: la T0600 dejó
-- septiembre en la segunda y la tira seguía diciendo agosto. `uocra_escala` era la réplica de `_UOCRA_RAW` del
-- Sheet, que perdió su IMPORTHTML el 18/08/2026 y desde entonces no se actualiza sola: terminaba en 2026-08-01.
--
-- LOS VALORES (Zona A, CCT 76/75, escalón +1,9 % del acuerdo de septiembre–noviembre 2026):
--   Ayudante 5.502 · Medio Oficial 5.977 · Oficial 6.468 · Oficial Especializado 7.561 por hora; Sereno 999.495 por mes.
-- DOS FUENTES INDEPENDIENTES, y coinciden:
--   · la escala publicada del acuerdo (consultada el 01/10/2026 en ignacioonline.com.ar y jorgevega.com.ar);
--   · los recibos que liquidó el estudio para la 1ª quincena de septiembre (`recibo_sueldo_linea`, Q1-09/2026:
--     6 de Ayudante a 5.502, 8 de Oficial a 6.468, 2 de Oficial Especializado a 7.561).
-- Medio Oficial y Sereno no tienen recibo propio con qué cotejar: valen por la escala publicada. Al momento de la
-- consulta las fuentes no confirmaban la homologación del acuerdo.
--
-- La tira muestra el juego de la vigencia más nueva: por eso van las CINCO categorías (con tres, Medio Oficial y
-- Sereno desaparecerían de la tira). Y `convenio_escala` recibe el Medio Oficial que la T0600 dejó afuera por no
-- tener recibo: con la escala publicada ya no es un valor inventado.
--
-- QUÉ NO ENTRA: octubre (+1,8 %) y noviembre (+1,7 %). La tira muestra lo que rige HOY: cargarlos haría que diga
-- octubre mientras se liquida la 2ª quincena de septiembre. Se cargan cuando el dueño lo pida.
--
-- Idempotente (`on conflict do nothing`). SIN `begin/commit` PROPIOS: los pone `aplicar-migracion.mjs`.

set local lock_timeout = '5s';

insert into public.uocra_escala (vigencia_desde, zona, categoria, basico_hora, no_remunerativo_mensual, mensual, cct, fuente)
select date '2026-09-01', 'A', v.categoria, v.basico_hora, null, v.mensual, '76/75',
       'Acuerdo septiembre-noviembre 2026 · escalón +1,9% · escala publicada, cotejada con los recibos Q1-09/2026'
from (values
  ('Ayudante', 5502::numeric, null::numeric),
  ('Medio Oficial', 5977::numeric, null::numeric),
  ('Oficial', 6468::numeric, null::numeric),
  ('Oficial Especializado', 7561::numeric, null::numeric),
  ('Sereno (mensual)', null::numeric, 999495::numeric)
) as v(categoria, basico_hora, mensual)
on conflict (vigencia_desde, zona, categoria) do nothing;

insert into public.convenio_escala (convenio, categoria, desde, valor_hora, fuente)
select c.convenio, 'Medio Oficial', date '2026-09-01', 5977::numeric,
       'escala publicada del acuerdo septiembre-noviembre 2026 (sin recibo de la categoría en Q1-09/2026)'
from (values ('0076/75 UOCRA'), ('UOCRA — Ley 22.250 (construcción)')) as c(convenio)
on conflict (convenio, categoria, desde) do nothing;
