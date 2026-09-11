-- ═══ QUIÉN CARGÓ HORAS, QUÉ DÍA Y CUÁNTAS (dueño, 11/09/2026 18:38) ═════════════════════════════
--
-- «Que de ahí me lleve a un desglose de la obra entera con las personas por día que participaron de
-- las HH.» La columna HH de la ficha del cliente publica el acumulado; esta función publica de qué
-- está hecho: la grilla persona × día.
--
-- ═══ UNA SOLA CONSULTA, NO UNA POR PERSONA ═══
--
-- San Francisco tiene 1.707 registros, 192 días y 26 personas. Traer eso fila por fila —o una
-- consulta por día, que es a lo que invita una grilla— son cientos de viajes donde el costo
-- dominante es el arranque en frío por CONEXIÓN (~800 ms la primera vez que un backend ve las
-- vistas del OS). Acá viaja todo en un `jsonb`: el índice de quincenas, el acumulado por persona de
-- TODA la obra, y las celdas de UNA quincena.
--
-- ═══ POR QUÉ UNA QUINCENA Y NO LOS 192 DÍAS ═══
--
-- 26 personas × 192 días son 4.992 celdas: ninguna pantalla las dibuja y ningún ojo las lee. La
-- quincena es además la unidad con la que la empresa liquida jornales, así que es el corte con el
-- que el dueño ya piensa. El índice `periodos` trae TODAS las quincenas con su total, así que nunca
-- se esconde un período en silencio: se ve que existe y cuánto tiene.
--
-- ═══ EL TOTAL DE LA OBRA NO VIAJA ACÁ, Y ES A PROPÓSITO ═══
--
-- El acumulado que se muestra arriba del desglose es EL MISMO NÚMERO que el dueño acaba de clickear:
-- lo trae `hh_obra` de `pantalla_cliente`, leído de `public.obra_plan_vs_real`, y la pantalla lo pasa
-- hacia abajo. Esta función no lo lee de nuevo por dos razones que apuntan al mismo lado:
--
--   1 · UNA DEFINICIÓN. Si el desglose leyera su propio total, el día que las dos lecturas se
--       separen el dueño vería un número distinto del que clickeó y no sabría cuál creer.
--   2 · MEDIDO: leer `obra_plan_vs_real` acá costaba entre 200 ms y 18 SEGUNDOS según si el plan
--       estaba caliente (11/09/2026, VM con carga normal). Es la vista más anidada del OS y este
--       desglose no necesita ninguna de sus 30 columnas.
--
-- Lo que SÍ publica es el total de cada quincena (`periodos`), y que la suma de esas quincenas sea
-- exactamente el acumulado canónico lo prueba `orquestador/lib/hh-por-obra.pg.test.mjs`: si alguna
-- vez dejan de coincidir, es que hay horas que una de las dos caras no está viendo.
--
-- ═══ LAS AUSENCIAS SE VEN Y NO SUMAN ═══
--
-- `tipo_hora` tiene 211 filas de ausencia y 49 de licencia. No son trabajo y no entran en ninguna
-- suma —ésa es la definición canónica de HH real—, pero la celda del día las MUESTRA («A», «L»):
-- saber que ese día la persona no estuvo es la mitad de la explicación de por qué una quincena
-- rindió menos.
--
-- ═══ LA GUARDA DE ROL ═══
--
-- `registros_hh` tiene RLS: Administración (dirección, administración, jefe de obra) ve todo y el
-- resto SÓLO SUS PROPIAS horas. Sin la guarda, un rol de campo vería una grilla de una sola persona
-- presentada como la obra entera. `null` es «no puedo decirlo» y la pantalla lo dice con palabras.

create or replace function public.hh_de_obra(p_obra text, p_desde date default null)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with la_obra as (
    -- `obra_panel` es `security_invoker`: si el rol no puede ver la obra, acá no hay fila y la
    -- función devuelve `null`. El permiso no se resuelve con un `if` en la aplicación.
    select o.obra_id, o.nombre, o.cliente_id, o.cliente_slug, o.estado, o.fecha_inicio_plan
      from public.obra_panel o where o.obra_id = p_obra
  ),
  filas as (
    select r.fecha, r.persona_id, r.horas, r.tipo_hora,
           r.tipo_hora in ('normal', 'extra_50', 'extra_100') as es_trabajo,
           -- LA QUINCENA CALENDARIO (1–15 y 16–fin), que es con la que se liquidan los jornales.
           case when extract(day from r.fecha) <= 15
                then date_trunc('month', r.fecha)::date
                else (date_trunc('month', r.fecha) + interval '15 days')::date end as quincena
      from public.registros_hh r
     where r.obra_canonica_id = p_obra
  ),
  -- LA VENTANA QUE SE DIBUJA: la pedida, o la ÚLTIMA con trabajo cargado. Nunca la primera: lo que
  -- se quiere ver al abrir es qué pasó esta quincena.
  ventana as (
    select coalesce(p_desde, (select max(f.quincena) from filas f where f.es_trabajo)) as desde
  ),
  celda as (
    select f.persona_id, f.fecha,
           sum(f.horas) filter (where f.es_trabajo)                 as horas,
           count(*) filter (where f.tipo_hora = 'ausencia') > 0     as ausencia,
           count(*) filter (where f.tipo_hora = 'licencia') > 0     as licencia
      from filas f
     where f.quincena = (select desde from ventana)
     group by f.persona_id, f.fecha
  )
  select case
    -- Media grilla parece una grilla: ver la cabecera.
    when not (select public.es_administracion()) then null::jsonb
    when not exists (select 1 from la_obra) then null::jsonb
    else jsonb_build_object(
      'obra', (select to_jsonb(x) from la_obra x),

      'registros', (select count(*) from filas f where f.es_trabajo),
      'personas', (select count(distinct f.persona_id) from filas f where f.es_trabajo),
      'desde', (select min(f.fecha) from filas f where f.es_trabajo),
      'hasta', (select max(f.fecha) from filas f where f.es_trabajo),
      'ventana', (select desde from ventana),

      -- TODAS LAS QUINCENAS CON SU TOTAL: el índice del desglose. Una quincena vacía de trabajo
      -- pero con ausencias también aparece —tiene algo que contar— con `hh` en null.
      'periodos', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'desde', p.quincena, 'hh', p.hh, 'dias', p.dias, 'registros', p.n)
                 order by p.quincena), '[]'::jsonb)
          from (select f.quincena,
                       sum(f.horas) filter (where f.es_trabajo)              as hh,
                       count(distinct f.fecha) filter (where f.es_trabajo)    as dias,
                       count(*) filter (where f.es_trabajo)                   as n
                  from filas f group by f.quincena) p
      ),

      -- EL ACUMULADO POR PERSONA DE TODA LA OBRA, no de la quincena: es la respuesta a «quién puso
      -- las horas de esta obra». `nombre` en null = la fila no tiene persona (las 19 filas legacy de
      -- JORNALES), y eso se dice, no se esconde.
      'por_persona', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'persona_id', t.persona_id, 'nombre', t.nombre, 'hh', t.hh, 'dias', t.dias,
                 'primera', t.primera, 'ultima', t.ultima) order by t.hh desc nulls last), '[]'::jsonb)
          from (select f.persona_id,
                       (select p.nombre_completo from public.personas p where p.id = f.persona_id) as nombre,
                       sum(f.horas) filter (where f.es_trabajo)            as hh,
                       count(distinct f.fecha) filter (where f.es_trabajo) as dias,
                       min(f.fecha) filter (where f.es_trabajo)            as primera,
                       max(f.fecha) filter (where f.es_trabajo)            as ultima
                  from filas f group by f.persona_id) t
      ),

      -- LAS CELDAS DE LA VENTANA: una por persona y día, con las horas trabajadas y la marca de lo
      -- que no es trabajo. Un día con 0 h y una ausencia NO es un día de 0 horas trabajadas: es un
      -- día que la persona no estuvo, y la celda lo dice con una letra.
      'celdas', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'persona_id', c.persona_id, 'fecha', c.fecha, 'horas', c.horas,
                 'ausencia', c.ausencia, 'licencia', c.licencia)), '[]'::jsonb)
          from celda c
      )
    )
  end
$$;

comment on function public.hh_de_obra(text, date) is
  'EL DESGLOSE DE HORAS DE UNA OBRA: grilla persona × día de UNA quincena, el índice de todas sus '
  'quincenas con su total, y el acumulado por persona de la obra entera, en UN viaje. El acumulado '
  'de la obra NO viaja acá: es el mismo número que trae `hh_obra` de pantalla_cliente (leído de '
  'obra_plan_vs_real) y la pantalla lo pasa hacia abajo — una definición, y esta función no paga los '
  'hasta 18 s que cuesta esa vista con el plan frío. Devuelve null cuando quien pregunta no es '
  'Administración (la RLS de registros_hh le daría media grilla) o cuando no puede ver la obra.';

notify pgrst, 'reload schema';
