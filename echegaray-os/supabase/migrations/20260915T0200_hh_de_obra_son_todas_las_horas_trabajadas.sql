-- LAS HH DE OBRA SON TODAS LAS HORAS TRABAJADAS DE `registros_hh`.
--
-- «insisto con q estan mal las hh de quattro en crm admin clientes porque no son las mismas hs q se
-- tienen q leer de la misma bd de supabase no estan siendo respetadas las tablas» (dueño, 14/09/2026).
-- Y el mismo día: los días completados por la app (`web:presencia-defecto`) CUENTAN, igual que en
-- Horas y en Liquidación.
--
-- ═══ EL DEFECTO, MEDIDO (14/09/2026) ═══
--
-- 20260913T2300 contaba JORNALES + el jefe de obra cargado en la app. Dejaba afuera
-- `web:presencia-defecto`, `web:obra`, `web:correccion-horas` y los obreros de `web:asistencia-obra`,
-- que Horas y Liquidación sí cuentan. Quattropani 2026, horas trabajadas, vista contra tabla:
--
--   Agüero 0/2 · González Tobares 0/9 · Petina 0/17 · Reta 187/204 · Rosales 62/79 · Zogbe 18/35
--   Total 565/644.
--
-- ═══ POR QUÉ SUMAR TODO NO DUPLICA ═══
--
-- Medido en toda la tabla, todos los años: 0 días en que una persona tiene a la vez una fila
-- `sheet:jornales` y una fila trabajada de otra fuente. Por eso se retira el `not exists` del jefe:
-- protegía contra un solape que no existe y era la razón de que la vista no fuera la tabla. Los días
-- con varias filas (dos obras el mismo día) se suman, como en Horas.
--
-- ═══ LA REGLA ═══
--
--   · TODA fila `sheet:jornales`, también ausencias y licencias: `hh_de_obra_en_vivo` las usa para
--     marcar la celda del desglose. Filtrar las de trabajo acá borraría esas marcas.
--   · TODA fila de otra fuente con `tipo_hora` normal / extra_50 / extra_100.
--   · `origen`: 'jornales' (sheet:jornales) · 'jefe_app' (puesto de jefe de obra, el mismo corte que
--     `esJefeDeObra()`) · 'app' (el resto). Las funciones que suman no miran el origen; `horas_app` y
--     `hh_jefe_app` filtran 'jefe_app' a propósito: marcan al jefe, no a toda la app.
--
-- ═══ QUÉ NO CAMBIA ═══
--
-- Columnas, orden y tipos: los de 20260913T2300. `security_invoker` y los GRANT se repiten explícitos
-- porque un `create or replace view` pelado ya perdió `security_invoker` tres veces en `obra_panel`.
-- Ninguna función se redefine: `pantalla_cliente_en_vivo`, `hh_de_obra_en_vivo` y
-- `costo_de_obras_a_la_fecha` leen esta vista y suman sin distinguir origen. `sin_respaldo` queda
-- vacío solo (ya no hay fila trabajada que la vista deje afuera).
--
-- NO se borra `ficha_cliente_cache` acá: se invalidan sólo los clientes afectados, a mano, después
-- de aplicar (un refresco masivo ya tumbó Postgres).

create or replace view public.hh_que_cuentan_en_obra
with (security_invoker = true) as
  select r.id, r.obra_canonica_id, r.persona_id, r.fecha, r.horas, r.tipo_hora, r.fuente_legacy,
         case
           when r.fuente_legacy = 'sheet:jornales' then 'jornales'
           when regexp_replace(lower(trim(p.puesto)), '[[:space:]_-]+', '_', 'g') in ('jefe_de_obra', 'jefe_obra')
             then 'jefe_app'
           else 'app'
         end::text as origen
    from public.registros_hh r
    left join public.personas p on p.id = r.persona_id
   where r.fuente_legacy = 'sheet:jornales'
      or r.tipo_hora in ('normal', 'extra_50', 'extra_100');

alter view public.hh_que_cuentan_en_obra set (security_invoker = true);

revoke all on public.hh_que_cuentan_en_obra from public, anon;
grant select on public.hh_que_cuentan_en_obra to authenticated, service_role;

comment on view public.hh_que_cuentan_en_obra is
  'Filas de registros_hh que cuentan como hora de obra: toda hora trabajada (normal/extra_50/extra_100) '
  'de cualquier fuente, más ausencias y licencias de sheet:jornales para el desglose. origen: '
  'jornales | jefe_app | app (20260915T0200). La leen pantalla_cliente_en_vivo, hh_de_obra_en_vivo y '
  'costo_de_obras_a_la_fecha.';

notify pgrst, 'reload schema';
