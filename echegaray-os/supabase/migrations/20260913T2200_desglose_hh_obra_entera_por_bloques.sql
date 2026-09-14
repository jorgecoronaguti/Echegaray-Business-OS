-- EL DESGLOSE DE HH ES DE LA OBRA ENTERA, CORTADO POR LOS BLOQUES DE JORNALES.
--
-- «Está mal lo de Quattropani, te dije que consideraras quincenas anteriores desde Sheet JORNALES,
-- que veas el inicio de obra y cargaras bien las HH a obra a quien corresponde» (dueño, 13/09/2026).
-- Lo había pedido el 11/09: «un desglose de la OBRA ENTERA con las personas por día que participaron
-- de las HH».
--
-- Redefine SÓLO `hh_de_obra_en_vivo`, partiendo de la definición viva (20260913T1500, md5
-- 8c654f9bcd2eb0877f5d1d736351cfd8 leído el 13/09). El envoltorio `hh_de_obra` sirve la caché y no
-- cambia. Dos defectos, los dos medidos sobre Quattropani (378 h, Quiroga 191 + Reta 187):
--
--   1 · ABRÍA EN LA ÚLTIMA QUINCENA. La grilla mostraba 01/09–10/09 y el 17/08–31/08 —226 de las 378
--       horas, y el inicio real de la obra— quedaba en un link. Se leía como si la quincena anterior no
--       se hubiera traído. Ahora `p_desde` null = TODA la obra y `ventana` = null.
--   2 · LA QUINCENA ERA DE CALENDARIO (1–15 / 16–fin), y JORNALES no liquida así: sus bloques son
--       03/08–15/08, 17/08–31/08, 01/09–15/09. La quincena calendario partía el 16/08 de un bloque que
--       empieza el 17 y no coincidía con ningún número de la planilla.
--
-- ═══ A QUÉ BLOQUE PERTENECE UN DÍA ═══
--
-- Los bloques salen de `jornales_bloque_persona`. En 2026 hay fechas dentro de dos bloques (Oficina
-- tuvo rangos como 16/02–31/03 que pisan los de Obreros), así que se elige, en orden: el bloque DE ESA
-- PERSONA (es el renglón de la planilla del que salió la hora), el más CORTO (el que corta más fino),
-- y el más reciente. Sólo si ninguno contiene la fecha se cae a la quincena calendario, y se dice con
-- el `hasta` calculado igual que antes.

CREATE OR REPLACE FUNCTION public.hh_de_obra_en_vivo(p_obra text, p_desde date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with la_obra as (
    -- `obra_panel` es `security_invoker`: si el rol no puede ver la obra, acá no hay fila y la
    -- función devuelve `null`. El permiso no se resuelve con un `if` en la aplicación.
    select o.obra_id, o.nombre, o.cliente_id, o.cliente_slug, o.estado, o.fecha_inicio_plan
      from public.obra_panel o where o.obra_id = p_obra
  ),
  filas as (
    select r.fecha, r.persona_id, r.horas, r.tipo_hora,
           r.tipo_hora in ('normal', 'extra_50', 'extra_100') as es_trabajo,
           -- EL BLOQUE DE JORNALES QUE CONTIENE EL DÍA; la quincena calendario sólo si no hay ninguno.
           coalesce(b.desde,
             case when extract(day from r.fecha) <= 15
                  then date_trunc('month', r.fecha)::date
                  else (date_trunc('month', r.fecha) + interval '15 days')::date end) as quincena,
           coalesce(b.hasta,
             case when extract(day from r.fecha) <= 15
                  then (date_trunc('month', r.fecha) + interval '14 days')::date
                  else (date_trunc('month', r.fecha) + interval '1 month - 1 day')::date end) as quincena_hasta
      from public.registros_hh r
      left join lateral (
        select bp.quincena_desde as desde, bp.quincena_hasta as hasta
          from public.jornales_bloque_persona bp
         where r.fecha between bp.quincena_desde and bp.quincena_hasta
         order by (bp.persona_id is not distinct from r.persona_id) desc,
                  bp.quincena_hasta - bp.quincena_desde,
                  bp.quincena_desde desc
         limit 1
      ) b on true
     where r.obra_canonica_id = p_obra
       -- SÓLO LA PLANILLA (dueño, 13/09/2026): HH, personas, inicio, quincenas y celdas son las de
       -- JORNALES. Lo cargado en la app sale aparte, en `sin_respaldo`.
       and r.fuente_legacy = 'sheet:jornales'
  ),
  celda as (
    -- SIN `p_desde` SE DIBUJA LA OBRA ENTERA: todos los días con algo cargado, del primero al último.
    -- Con `p_desde`, sólo el bloque que empieza ese día.
    select f.persona_id, f.fecha,
           sum(f.horas) filter (where f.es_trabajo)                 as horas,
           count(*) filter (where f.tipo_hora = 'ausencia') > 0     as ausencia,
           count(*) filter (where f.tipo_hora = 'licencia') > 0     as licencia
      from filas f
     where p_desde is null or f.quincena = p_desde
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
      -- `null` = la grilla es la obra entera.
      'ventana', p_desde,

      -- LO QUE LA APP CARGÓ Y JORNALES NO TIENE, por persona y con sus días. No suma a nada de lo
      -- de arriba; se publica para que no desaparezca en silencio.
      'sin_respaldo', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'persona_id', s.persona_id, 'nombre', s.nombre, 'horas', s.horas, 'dias', s.dias)
                 order by s.horas desc), '[]'::jsonb)
          from (select x.persona_id,
                       (select pe.nombre_completo from public.personas pe where pe.id = x.persona_id) as nombre,
                       sum(x.horas) as horas,
                       to_jsonb(array_agg(distinct x.fecha order by x.fecha)) as dias
                  from public.registros_hh x
                 where x.obra_canonica_id = p_obra
                   and x.tipo_hora in ('normal', 'extra_50', 'extra_100')
                   and x.fuente_legacy is distinct from 'sheet:jornales'
                 group by x.persona_id) s
      ),

      -- LOS BLOQUES DE JORNALES CON SU TOTAL: el índice del desglose, con su `hasta` real. Un bloque
      -- vacío de trabajo pero con ausencias también aparece —tiene algo que contar— con `hh` en null.
      'periodos', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'desde', p.quincena, 'hasta', p.quincena_hasta, 'hh', p.hh, 'dias', p.dias,
                 'registros', p.n)
                 order by p.quincena, p.quincena_hasta), '[]'::jsonb)
          from (select f.quincena, f.quincena_hasta,
                       sum(f.horas) filter (where f.es_trabajo)              as hh,
                       count(distinct f.fecha) filter (where f.es_trabajo)    as dias,
                       count(*) filter (where f.es_trabajo)                   as n
                  from filas f group by f.quincena, f.quincena_hasta) p
      ),

      -- EL ACUMULADO POR PERSONA DE TODA LA OBRA: es la respuesta a «quién puso las horas de esta
      -- obra». `nombre` en null = la fila no tiene persona (las filas legacy de JORNALES), y eso se
      -- dice, no se esconde.
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

      -- LAS CELDAS: una por persona y día, con las horas trabajadas y la marca de lo que no es
      -- trabajo. Un día con 0 h y una ausencia NO es un día de 0 horas trabajadas: es un día que la
      -- persona no estuvo, y la celda lo dice con una letra.
      'celdas', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'persona_id', c.persona_id, 'fecha', c.fecha, 'horas', c.horas,
                 'ausencia', c.ausencia, 'licencia', c.licencia)), '[]'::jsonb)
          from celda c
      )
    )
  end
$function$;

revoke all on function public.hh_de_obra_en_vivo(text, date) from public, anon;
grant execute on function public.hh_de_obra_en_vivo(text, date) to authenticated;

comment on function public.hh_de_obra_en_vivo(text, date) is
  'EL DESGLOSE DE HORAS DE UNA OBRA, sin caché (20260913T2200): sin `p_desde` la obra entera; los '
  'períodos son los bloques de JORNALES. Lo llaman `hh_de_obra` y `refrescar_ficha_cliente_cache`.';

-- La caché guardó el desglose con la forma vieja (ventana = última quincena calendario).
delete from public.ficha_cliente_cache where rpc = 'hh_de_obra';
