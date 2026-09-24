-- LAS RPC DE PANTALLA NOMBRAN A LA PERSONA POR SU NOMBRE PARA MOSTRAR (dueño, 24/09/2026: «sí» a
-- «Emiliano Maldonado» en vez de «Maldonado Batista Emiliano Miguel»). Sólo cambia el campo `nombre`
-- que se DIBUJA (costo de mano de obra por persona, horas de la obra, la ficha del cliente); el orden y
-- todo lo demás siguen iguales. Sin nombre para mostrar, el legajo, como antes.
-- `hh_por_periodo` NO se toca: su columna se llama `nombre_completo` y cambiarle el contenido la haría
-- mentir; la pantalla que la lee resuelve el nombre por el id.
CREATE OR REPLACE FUNCTION public.costo_de_obras_a_la_fecha(p_obras text[], p_desde date, p_hasta date, p_neto boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with
  filas as (
    select f.* from public.costo_de_obra_filas_iva(p_obras, null, p_neto) f
     where (p_desde is null or f.fecha >= p_desde)
       and (p_hasta is null or f.fecha <= p_hasta)
  ),
  materiales as (
    select f.obra_id,
           sum(f.a_la_fecha) filter (where not f.es_subcontrato)              as materiales,
           sum(f.a_la_fecha) filter (where f.es_subcontrato)                  as subcontratos,
           count(*)          filter (where not f.es_subcontrato)::int         as n_comprobantes,
           count(*)          filter (where f.es_subcontrato)::int             as n_subcontratos,
           max(f.fecha)      filter (where not f.es_subcontrato)              as ultimo_comprobante,
           count(*)          filter (where f.tomado_al_total)::int            as n_sin_iva_discriminado,
           nullif(sum(f.por_vencer) filter (where not f.es_subcontrato), 0)   as materiales_por_vencer,
           nullif(sum(f.por_vencer) filter (where f.es_subcontrato), 0)       as subcontratos_por_vencer,
           nullif(sum(f.por_vencer), 0)                                       as comprometido_futuro,
           jsonb_agg(jsonb_build_object(
                       'proveedor', f.proveedor, 'comprobante', f.comprobante, 'fecha', f.fecha,
                       'total', f.total, 'a_la_fecha', f.a_la_fecha, 'por_vencer', f.por_vencer,
                       'motivo', f.motivo_subcontrato)
                     order by f.a_la_fecha desc)
             filter (where f.es_subcontrato)                                  as subcontratos_detalle
      from filas f
     group by f.obra_id
  ),
  mano_obra as (
    select m.obra_canonica_id as obra_id,
           sum(m.costo_total) filter (where m.estado <> 'falta_dato') as mano_obra,
           sum(m.costo_total) filter (where m.estado = 'real')        as mano_obra_real,
           sum(m.costo_total) filter (where m.estado = 'estimado')    as mano_obra_estimada,
           sum(m.horas)       filter (where m.estado <> 'falta_dato') as horas_valorizadas,
           sum(m.horas)       filter (where m.estado = 'falta_dato')  as horas_sin_tarifa,
           count(distinct m.persona_id) filter (where m.estado = 'falta_dato')::int as personas_sin_tarifa,
           jsonb_agg(jsonb_build_object('persona_id', m.persona_id, 'nombre', coalesce(nullif(btrim(pe.nombre_para_mostrar), ''), pe.nombre_completo),
                                        'quincena', m.quincena_desde, 'horas', m.horas, 'origen', m.origen)
                     order by m.quincena_desde, pe.nombre_completo)
             filter (where m.estado = 'falta_dato') as falta_dato,
           max(m.quincena_hasta) filter (where m.sellado_en is not null) as sellado_hasta
      from public.costo_mo_de_obras(p_obras, p_desde, p_hasta) m
      left join public.personas pe on pe.id = m.persona_id
     group by m.obra_canonica_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'obra_id', o.obra_id,
           'materiales', k.materiales, 'subcontratos', k.subcontratos,
           'n_comprobantes', k.n_comprobantes, 'n_subcontratos', coalesce(k.n_subcontratos, 0),
           'subcontratos_detalle', coalesce(k.subcontratos_detalle, '[]'::jsonb),
           'ultimo_comprobante', k.ultimo_comprobante,
           'comprometido_futuro', k.comprometido_futuro,
           'materiales_por_vencer', k.materiales_por_vencer, 'subcontratos_por_vencer', k.subcontratos_por_vencer,
           'mano_obra', h.mano_obra, 'mano_obra_real', h.mano_obra_real,
           'mano_obra_estimada', h.mano_obra_estimada, 'horas_valorizadas', h.horas_valorizadas,
           'horas_sin_tarifa', h.horas_sin_tarifa, 'personas_sin_tarifa', coalesce(h.personas_sin_tarifa, 0),
           'falta_dato', coalesce(h.falta_dato, '[]'::jsonb), 'sellado_hasta', h.sellado_hasta,
           'puede_ver_tarifas', public.liquida_sueldos(),
           'corte', current_date)
           -- EL RANGO SÓLO VIAJA CUANDO LO HAY: sin él, la respuesta es idéntica a la de la firma vieja.
           || case when p_desde is null and p_hasta is null then '{}'::jsonb
                   else jsonb_build_object('desde', p_desde, 'hasta', p_hasta) end
           -- NETO SÓLO VIAJA CUANDO SE PIDE: sin él la respuesta es byte a byte la de antes.
           || case when p_neto then jsonb_build_object('neto_de_iva', true, 'n_sin_iva_discriminado', coalesce(k.n_sin_iva_discriminado, 0))
                   else '{}'::jsonb end), '[]'::jsonb)
    from (select distinct unnest(p_obras) as obra_id) o
    left join materiales k on k.obra_id = o.obra_id
    left join mano_obra h on h.obra_id = o.obra_id
   where k.obra_id is not null or h.obra_id is not null
$function$;

CREATE OR REPLACE FUNCTION public.costo_de_obras_a_la_fecha_rubros(p_obras text[], p_desde date, p_hasta date, p_neto boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with
  filas as (
    select f.*, public.rubro_de_compra(f.es_subcontrato, s.familia_material, s.sub_rubro, concat_ws(' ', f.concepto, f.detalle_obra), f.proveedor) as rubro
      from public.costo_de_obra_filas_iva(p_obras, null, p_neto) f
      left join public.compra_sheet s on coalesce(s.sheet_id::text, s.fila::text) = f.referencia
     where (p_desde is null or f.fecha >= p_desde)
       and (p_hasta is null or f.fecha <= p_hasta)
  ),
  materiales as (
    select f.obra_id,
           sum(f.a_la_fecha) filter (where f.rubro = 'materiales')                   as materiales,
           sum(f.a_la_fecha) filter (where f.rubro = 'subcontratistas')              as subcontratos,
           sum(f.a_la_fecha) filter (where f.rubro = 'otros')                        as otros,
           count(*)          filter (where f.rubro = 'materiales')::int              as n_comprobantes,
           count(*)          filter (where f.rubro = 'subcontratistas')::int         as n_subcontratos,
           count(*)          filter (where f.rubro = 'otros')::int                   as n_otros,
           max(f.fecha)      filter (where f.rubro <> 'subcontratistas')             as ultimo_comprobante,
           count(*)          filter (where f.tomado_al_total)::int                   as n_sin_iva_discriminado,
           nullif(sum(f.por_vencer) filter (where f.rubro = 'materiales'), 0)        as materiales_por_vencer,
           nullif(sum(f.por_vencer) filter (where f.rubro = 'subcontratistas'), 0)   as subcontratos_por_vencer,
           nullif(sum(f.por_vencer) filter (where f.rubro = 'otros'), 0)             as otros_por_vencer,
           nullif(sum(f.por_vencer), 0)                                              as comprometido_futuro,
           jsonb_agg(jsonb_build_object(
                       'proveedor', f.proveedor, 'comprobante', f.comprobante, 'fecha', f.fecha,
                       'total', f.total, 'a_la_fecha', f.a_la_fecha, 'por_vencer', f.por_vencer,
                       'motivo', coalesce(f.motivo_subcontrato, 'familia'))
                     order by f.a_la_fecha desc)
             filter (where f.rubro = 'subcontratistas')                              as subcontratos_detalle
      from filas f
     group by f.obra_id
  ),
  mano_obra as (
    select m.obra_canonica_id as obra_id,
           sum(m.costo_total) filter (where m.estado <> 'falta_dato') as mano_obra,
           sum(m.costo_total) filter (where m.estado = 'real')        as mano_obra_real,
           sum(m.costo_total) filter (where m.estado = 'estimado')    as mano_obra_estimada,
           sum(m.horas)       filter (where m.estado <> 'falta_dato') as horas_valorizadas,
           sum(m.horas)       filter (where m.estado = 'falta_dato')  as horas_sin_tarifa,
           count(distinct m.persona_id) filter (where m.estado = 'falta_dato')::int as personas_sin_tarifa,
           jsonb_agg(jsonb_build_object('persona_id', m.persona_id, 'nombre', coalesce(nullif(btrim(pe.nombre_para_mostrar), ''), pe.nombre_completo),
                                        'quincena', m.quincena_desde, 'horas', m.horas, 'origen', m.origen)
                     order by m.quincena_desde, pe.nombre_completo)
             filter (where m.estado = 'falta_dato') as falta_dato,
           max(m.quincena_hasta) filter (where m.sellado_en is not null) as sellado_hasta
      from public.costo_mo_de_obras(p_obras, p_desde, p_hasta) m
      left join public.personas pe on pe.id = m.persona_id
     group by m.obra_canonica_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'obra_id', o.obra_id,
           'materiales', k.materiales, 'subcontratos', k.subcontratos, 'otros', k.otros,
           'n_comprobantes', k.n_comprobantes, 'n_subcontratos', coalesce(k.n_subcontratos, 0), 'n_otros', coalesce(k.n_otros, 0),
           'subcontratos_detalle', coalesce(k.subcontratos_detalle, '[]'::jsonb),
           'ultimo_comprobante', k.ultimo_comprobante,
           'comprometido_futuro', k.comprometido_futuro,
           'materiales_por_vencer', k.materiales_por_vencer, 'subcontratos_por_vencer', k.subcontratos_por_vencer,
           'otros_por_vencer', k.otros_por_vencer,
           'mano_obra', h.mano_obra, 'mano_obra_real', h.mano_obra_real,
           'mano_obra_estimada', h.mano_obra_estimada, 'horas_valorizadas', h.horas_valorizadas,
           'horas_sin_tarifa', h.horas_sin_tarifa, 'personas_sin_tarifa', coalesce(h.personas_sin_tarifa, 0),
           'falta_dato', coalesce(h.falta_dato, '[]'::jsonb), 'sellado_hasta', h.sellado_hasta,
           'puede_ver_tarifas', public.liquida_sueldos(),
           'corte', current_date)
           -- EL RANGO SÓLO VIAJA CUANDO LO HAY: sin él, la respuesta es idéntica a la de la firma vieja.
           || case when p_desde is null and p_hasta is null then '{}'::jsonb
                   else jsonb_build_object('desde', p_desde, 'hasta', p_hasta) end
           -- NETO SÓLO VIAJA CUANDO SE PIDE: sin él la respuesta es byte a byte la de antes.
           || case when p_neto then jsonb_build_object('neto_de_iva', true, 'n_sin_iva_discriminado', coalesce(k.n_sin_iva_discriminado, 0))
                   else '{}'::jsonb end), '[]'::jsonb)
    from (select distinct unnest(p_obras) as obra_id) o
    left join materiales k on k.obra_id = o.obra_id
    left join mano_obra h on h.obra_id = o.obra_id
   where k.obra_id is not null or h.obra_id is not null
$function$;

CREATE OR REPLACE FUNCTION public.detalle_costo_de_obra(p_obra text, p_rubro text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when not public.es_administracion() then null::jsonb
    when p_rubro in ('materiales', 'subcontratos') then (
      select jsonb_build_object(
               'obra_id', p_obra, 'rubro', p_rubro, 'corte', current_date,
               'total', coalesce(sum(f.a_la_fecha), 0), 'por_vencer', coalesce(sum(f.por_vencer), 0),
               'n', count(*),
               'filas', coalesce(jsonb_agg(jsonb_build_object(
                          'referencia', f.referencia, 'sheet_id', f.sheet_id, 'fila', f.fila,
                          'fecha', f.fecha, 'fecha_prevista', f.fecha_prevista, 'estado', f.estado,
                          'proveedor', f.proveedor, 'comprobante', f.comprobante, 'concepto', f.concepto,
                          'total', f.total, 'a_la_fecha', f.a_la_fecha, 'por_vencer', f.por_vencer)
                        order by f.fecha desc nulls last, f.fila desc nulls last), '[]'::jsonb))
        from public.costo_de_obra_filas(array[p_obra]) f
       where f.es_subcontrato = (p_rubro = 'subcontratos'))
    when p_rubro = 'mano_obra' then (
      select jsonb_build_object(
               'obra_id', p_obra, 'rubro', 'mano_obra', 'corte', current_date,
               'total', sum(m.costo_total) filter (where m.estado <> 'falta_dato'),
               'n', count(*),
               'horas', sum(m.horas) filter (where m.estado <> 'falta_dato'),
               'horas_sin_tarifa', sum(m.horas) filter (where m.estado = 'falta_dato'),
               'puede_ver_tarifas', public.liquida_sueldos(),
               'filas', coalesce(jsonb_agg(jsonb_build_object(
                          'persona_id', m.persona_id, 'nombre', coalesce(nullif(btrim(pe.nombre_para_mostrar), ''), pe.nombre_completo),
                          'quincena_desde', m.quincena_desde, 'quincena_hasta', m.quincena_hasta,
                          'horas', m.horas, 'blanco', m.costo_blanco, 'negro', m.costo_negro, 'total', m.costo_total,
                          'estado', m.estado, 'origen', m.origen, 'sellado', m.sellado_en is not null)
                        order by m.quincena_desde, pe.nombre_completo nulls last), '[]'::jsonb))
        from public.costo_mo_de_obras(array[p_obra]) m
        left join public.personas pe on pe.id = m.persona_id)
    when p_rubro = 'hh' then (
      -- LAS HORAS POR PERSONA SON LAS DE `hh_de_obra` (la pantalla completa `?hh=`): ninguna suma nueva.
      -- Y SE DICE SI SON DE LA CACHÉ: `ficha_cliente_cache_leer` sirve hasta 10 minutos de antigüedad,
      -- mientras la columna HH de la tabla (`obra_plan_vs_real.hh_real`) se calcula en vivo. Con una
      -- carga de horas reciente los dos números difieren sin que nada esté mal, y el panel tiene que
      -- poder decir «esto es de hace 4 minutos» en vez de acusar un descuadre que no existe.
      select case when t.j is null then null::jsonb else jsonb_build_object(
               'obra_id', p_obra, 'rubro', 'hh', 'corte', current_date,
               'total', (select sum((x ->> 'hh')::numeric) from jsonb_array_elements(coalesce(t.j -> 'por_persona', '[]'::jsonb)) x),
               'n', jsonb_array_length(coalesce(t.j -> 'por_persona', '[]'::jsonb)),
               'desde', t.j -> 'desde', 'hasta', t.j -> 'hasta',
               'cache_calculado_en', t.j -> 'cache_calculado_en',
               'filas', coalesce(t.j -> 'por_persona', '[]'::jsonb)) end
        from (select public.hh_de_obra(p_obra, null) as j) t)
    else null::jsonb
  end
$function$;

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
    select r.fecha, r.persona_id, r.horas, r.tipo_hora, r.origen,
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
      from public.hh_que_cuentan_en_obra r
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
       -- LO QUE CUENTA COMO HORA DE OBRA sale de UNA definición (20260913T2300): JORNALES, más el
       -- jefe de obra cargado en la app los días que la planilla no lo tiene. Lo demás de la app
       -- sale aparte, en `sin_respaldo`.
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

      -- LO QUE LA APP CARGÓ Y NO CUENTA, por persona y con sus días. No suma a nada de lo de arriba;
      -- se publica para que no desaparezca en silencio. El jefe de obra tampoco: no cuenta por decisión (20260915T0840).
      'sin_respaldo', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'persona_id', s.persona_id, 'nombre', s.nombre, 'horas', s.horas, 'dias', s.dias)
                 order by s.horas desc), '[]'::jsonb)
          from (select x.persona_id,
                       (select coalesce(nullif(btrim(pe.nombre_para_mostrar), ''), pe.nombre_completo) from public.personas pe where pe.id = x.persona_id) as nombre,
                       sum(x.horas) as horas,
                       to_jsonb(array_agg(distinct x.fecha order by x.fecha)) as dias
                  from public.registros_hh x
                 where x.obra_canonica_id = p_obra
                   and x.tipo_hora in ('normal', 'extra_50', 'extra_100')
                   and not exists (select 1 from public.hh_que_cuentan_en_obra c where c.id = x.id)
                   -- EL JEFE DE OBRA NO CUENTA POR DECISIÓN (20260915T0840): no es «sin respaldo».
                   and not public.es_jefe_de_obra(x.persona_id)
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
                 'primera', t.primera, 'ultima', t.ultima,
                 -- LAS HORAS DEL JEFE QUE SALIERON DE LA APP: la grilla lo marca, sin advertencia.
                 'horas_app', t.horas_app) order by t.hh desc nulls last), '[]'::jsonb)
          from (select f.persona_id,
                       (select coalesce(nullif(btrim(p.nombre_para_mostrar), ''), p.nombre_completo) from public.personas p where p.id = f.persona_id) as nombre,
                       sum(f.horas) filter (where f.es_trabajo)            as hh,
                       count(distinct f.fecha) filter (where f.es_trabajo) as dias,
                       min(f.fecha) filter (where f.es_trabajo)            as primera,
                       max(f.fecha) filter (where f.es_trabajo)            as ultima,
                       sum(f.horas) filter (where f.es_trabajo and f.origen = 'jefe_app') as horas_app
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

CREATE OR REPLACE FUNCTION public.pantalla_cliente_en_vivo(p_slug text, p_solapa text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
begin
  return (
with elegido as (
    select c.cliente_id from public.cliente_panel c where c.slug = p_slug
  ),
  -- SUS OBRAS, UNA VEZ. Las usan tres claves: la lista de la ficha, la actividad y el recorte de
  -- los certificados. Sin el CTE, la misma vista se recorrería tres veces en el mismo viaje.
  sus_obras as (
    select o.* from public.obra_panel o
     where o.cliente_id = (select cliente_id from elegido)
  )
  select jsonb_build_object(

    -- LA FICHA. `null` = no existe o no la puedo ver; la pantalla ya distingue eso de un error.
    'cliente', (select to_jsonb(c) from public.cliente_panel c where c.slug = p_slug),

    'perfil', (
      select jsonb_build_object('id', p.id, 'rol', p.rol, 'nombre', p.nombre,
                                'created_at', p.created_at, 'updated_at', p.updated_at)
        from public.perfiles p
       where p.id = (select auth.uid())
    ),

    -- LOS RESPONSABLES POSIBLES, sin las identidades de prueba: nombrar responsable a una cuenta de
    -- QA es una decisión de negocio tomada por accidente. Se filtra por `es_prueba`, no por texto.
    'responsables', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'rol', p.rol)
                                order by p.nombre), '[]'::jsonb)
        from public.perfiles p where p.es_prueba = false
    ),

    'contactos', (
      select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb)
        from public.cliente_contacto k
       where k.cliente_id = (select cliente_id from elegido)
    ),

    'obras', (select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) from sus_obras o),

    -- LO QUE OBRAS PUBLICA POR OBRA. Sin recortar por cliente: la ficha usa el mapa completo, igual
    -- que la cartera, y recortarlo acá sería una regla nueva que nadie pidió.
    'economia_obras', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_canonica_id', e.obra_canonica_id, 'contratado', e.contratado,
                                  'obra_padre_id', e.obra_padre_id,
                                  -- EL CONTRATO EN SU MONEDA Y EL DÓLAR CON QUE SE VALUÓ: Quattropani
                                  -- se firmó en U$S y el peso equivalente cambia solo de un día para
                                  -- otro. Los dos viajan; la pantalla decide cuál muestra.
                                  'contratado_usd', e.contratado_usd, 'tipo_cambio', e.tipo_cambio,
                                  'origen', e.origen, 'referencia', e.referencia, 'nota', e.nota,
                                  -- LOS DOS TOTALES DE OC NO SE SUMAN: `ventana` es lo que el cliente
                                  -- emitió dentro del año que acota el contratado e `historico` lo de
                                  -- otros años, que en una obra fusionada son órdenes viejas.
                                  'oc_civa_ventana', e.oc_civa_ventana,
                                  'oc_civa_historico', e.oc_civa_historico,
                                  'oc_n_ventana', e.oc_n_ventana,
                                  'oc_n_historico', e.oc_n_historico,
                                  'contrato_total', e.contrato_total,
                                  'contrato_fuente', e.contrato_fuente,
                                  'contrato_fuente_drive_id', e.contrato_fuente_drive_id,
                                  'contrato_fuente_nombre', e.contrato_fuente_nombre,
                                  'contrato_cita', e.contrato_cita,
                                  'contrato_nota', e.contrato_nota)), '[]'::jsonb)
        from public.obra_economia_cartera e
    ),

    -- LO COBRADO POR TRABAJO — la MISMA vista y las MISMAS ocho columnas que `/clientes`. La ficha
    -- del CRM lo necesita para decir si un trabajo cobró; con una lectura propia, las dos pantallas
    -- del módulo volverían a poder decir números distintos sobre la misma obra.
    'cobrado_por_obra', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'obra_id', u.obra_id, 'cobrado_total', u.cobrado_total,
               'cobrado_neto', u.cobrado_neto, 'por_cobrar', u.por_cobrar, 'vencido', u.vencido,
               'proximo_cobro_fecha', u.proximo_cobro_fecha,
               'proximo_cobro_medio', u.proximo_cobro_medio,
               'imputacion', u.imputacion)), '[]'::jsonb)
        from public.obra_cuenta u
       where u.cliente_id = (select cliente_id from elegido)
    ),

    -- ═══ LAS HORAS DE CADA OBRA (dueño, 11/09/2026) ═══
    --
    -- `hh_real` y `hh_plan` NO se calculan acá: se leen de `obra_plan_vs_real`, la cara canónica de
    -- las HH por obra. Lo que se agrega es lo que ninguna vista publica —desde cuándo, cuántos
    -- registros, cuánta gente, hasta cuándo—, contando LAS MISMAS FILAS que la vista sumó.
    --
    -- Una obra sin horas ni plan NO viaja: la pantalla dibuja «—» por ausencia de fila, y mandar
    -- once filas de nulls sería peso para decir nada.
    'hh_obra', case
      when p_solapa is not null and p_solapa not in ('obras', 'actividad') then '[]'::jsonb
      -- LA GUARDA DE ROL: ver la cabecera. Media suma parece una suma.
      when not (select public.es_administracion()) then null::jsonb
      else (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'obra_id', v.obra_id, 'hh_real', v.hh_real, 'hh_plan', v.hh_plan,
                 'registros', v.registros, 'personas', v.personas,
                 'inicio_real', v.inicio_real, 'ultima_fecha', v.ultima_fecha,
                 -- CUÁNTO DE `hh_real` ES DEL JEFE CARGADO EN LA APP: el title lo dice.
                 'hh_jefe_app', v.hh_jefe_app,
                 -- LO CARGADO EN LA APP QUE NO CUENTA: no suma, se dice aparte.
                 'sin_respaldo', v.sin_respaldo)), '[]'::jsonb)
          from (
            -- ═══ LAS HH DE LA OBRA: JORNALES + EL JEFE DE OBRA (dueño, 13/09/2026) ═══
            --
            -- `hh_plan` se sigue leyendo de `obra_plan_vs_real`. `hh_real`, registros, personas,
            -- inicio y última carga salen de `hh_que_cuentan_en_obra` (20260913T2300): la vista
            -- `obra_plan_vs_real` suma TODO lo de la app y no se toca —la usa el módulo Obras—.
            select w.obra_id, r.hh_real, w.hh_plan,
                   r.registros, r.personas, r.inicio_real, r.ultima_fecha, r.hh_jefe_app, s.sin_respaldo
              from public.obra_plan_vs_real w
              left join lateral (
                select sum(x.horas)                         as hh_real,
                       count(*)::int                        as registros,
                       count(distinct x.persona_id)::int    as personas,
                       min(x.fecha)                         as inicio_real,
                       max(x.fecha)                         as ultima_fecha,
                       sum(x.horas) filter (where x.origen = 'jefe_app') as hh_jefe_app
                  from public.hh_que_cuentan_en_obra x
                 where x.obra_canonica_id = w.obra_id
                   and x.tipo_hora in ('normal', 'extra_50', 'extra_100')) r on true
              -- LO QUE LA APP CARGÓ Y NO CUENTA: persona, horas y días. Nunca se borra.
              left join lateral (
                select jsonb_agg(jsonb_build_object('persona_id', y.persona_id, 'nombre', y.nombre,
                                                    'horas', y.horas, 'dias', y.dias)
                                 order by y.horas desc) as sin_respaldo
                  from (select x.persona_id,
                               (select coalesce(nullif(btrim(pe.nombre_para_mostrar), ''), pe.nombre_completo) from public.personas pe where pe.id = x.persona_id) as nombre,
                               sum(x.horas) as horas,
                               to_jsonb(array_agg(distinct x.fecha order by x.fecha)) as dias
                          from public.registros_hh x
                         where x.obra_canonica_id = w.obra_id
                           and x.tipo_hora in ('normal', 'extra_50', 'extra_100')
                           and not exists (select 1 from public.hh_que_cuentan_en_obra c where c.id = x.id)
                           -- EL JEFE DE OBRA NO CUENTA POR DECISIÓN (20260915T0840): no es «sin respaldo».
                           and not public.es_jefe_de_obra(x.persona_id)
                         group by x.persona_id) y) s on true
             where w.obra_id in (select o.obra_id from sus_obras o)
               and (r.hh_real is not null or w.hh_plan is not null or s.sin_respaldo is not null)
          ) v
      )
    end,

    -- ═══ LO QUE LLEVA GASTADO CADA OBRA (dueño, 12/09/2026) ═══
    --
    -- Dos columnas: MATERIALES (lo comprado e imputado a la obra) y MANO DE OBRA (sus horas
    -- valorizadas). De dónde sale cada una, qué se excluye y por qué, en la cabecera de esta
    -- migración. Una obra sin comprobantes y sin horas NO viaja: la pantalla dibuja «—» por ausencia
    -- de fila, y mandar trece filas de nulls es peso para no decir nada.
    -- ═══ LO GASTADO A LA FECHA EN CADA OBRA (dueño, 12/09 y 13/09/2026) ═══
    --
    -- El cálculo salió a `costo_de_obras_a_la_fecha` (20260913T1550): la MISMA función que usa la
    -- cartera `/clientes`. Materiales = Compras ASIGNADAS a la obra por la columna K con fecha ≤ hoy;
    -- mano de obra = horas de la planilla a la fecha × tarifa × multiplicador. Una obra sin compras y
    -- sin horas no viaja: la pantalla dibuja «—» por ausencia de fila.
    'costo_obra', case
      when p_solapa is not null and p_solapa <> 'obras' then '[]'::jsonb
      -- LA GUARDA DE ROL: `null` = no puedo decirlo; `[]` = nadie gastó nada.
      when not (select public.es_administracion()) then null::jsonb
      else public.costo_de_obras_a_la_fecha(array(select o.obra_id from sus_obras o))
    end,

    -- ═══ LOS GASTOS DEL CLIENTE SIN OBRA ASIGNADA ═══
    --
    -- Lo que la columna K no atribuye con evidencia a una obra de este cliente. Una fila al pie, con
    -- su importe y sus detalles más grandes; NUNCA repartido. Σ obras + esto = Compras del cliente.
    'costo_sin_obra', case
      when p_solapa is not null and p_solapa <> 'obras' then '[]'::jsonb
      when not (select public.es_administracion()) then null::jsonb
      else public.compras_sin_obra_de_clientes(array(select cliente_id from elegido))
    end,

    -- LO CONTRATADO Y LO COBRADO DEL CLIENTE, sumado por la base. `null` cuando el rol no ve
    -- economía (`ve_economia()` adentro de la vista) o cuando el cliente no tiene fila.
    'economia_cliente', (
      select jsonb_build_object(
               'cliente_id', x.cliente_id, 'contratado', x.contratado,
               'contratado_en_curso', x.contratado_en_curso, 'n_obras_en_curso', x.n_obras_en_curso,
               'n_obras_cerradas', x.n_obras_cerradas, 'n_obras_con_precio', x.n_obras_con_precio,
               'n_obras_sin_precio', x.n_obras_sin_precio, 'costo_real', x.costo_real,
               'facturado_90d', x.facturado_90d, 'cobrado_90d', x.cobrado_90d,
               'cobrado_total', x.cobrado_total, 'cobrado_neto_total', x.cobrado_neto_total,
               'saldo', x.saldo, 'vencido', x.vencido, 'por_vencer', x.por_vencer,
               'pendiente_contractual', x.pendiente_contractual)
        from public.cliente_economia x
       where x.cliente_id = (select cliente_id from elegido)
    ),

    -- LOS PAPELES DEL CLIENTE, con `atribucion`: la ficha muestra CÓMO se ató cada uno a su obra.
    'papeles', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', r.id, 'obra_id', r.obra_id, 'tipo', r.tipo, 'numero', r.numero,
               'fecha', r.fecha, 'importe', r.importe, 'moneda', r.moneda, 'cita', r.cita,
               'nombre_archivo', r.nombre_archivo, 'atribucion', r.atribucion,
               'drive_file_id', r.drive_file_id)), '[]'::jsonb)
        from public.cliente_orden r
       where r.cliente_id = (select cliente_id from elegido)
         and r.eliminado_en is null
    ),

    -- CUÁNTOS VÍNCULOS A DRIVE TIENE, SIEMPRE. La barra de solapas escribe «Documentos · N» en
    -- las nueve caras, y sin esta cuenta recortar las filas convertiría ese N en un cero falso —
    -- que es peor que el peso que se ahorra. `count(` no fabrica un número de negocio: es el
    -- `.length` del mismo array, con el mismo `where`, hecho antes del cable.
    'n_documentos', (
      -- ═══ EL N DE LA SOLAPA CUENTA LO QUE LA CARA DIBUJA (dueño, 11/09/2026 17:50) ═══
      --
      -- «El CRM dice documentos de drive (0) y está pésimo eso.» Contaba `cliente_documento` —los
      -- vínculos hechos a mano— y San Francisco tenía CERO con 63 archivos abajo. Ahora cuenta las
      -- tres fuentes que la cara dibuja, SIN CONTAR DOS VECES el mismo archivo: un `union` de ids,
      -- que es exactamente la regla de `armarCaraDocumentos` («la clave es el drive_file_id, y el
      -- papel del OS le gana al de Drive») expresada del otro lado del cable.
      --
      -- LAS DOS IMPLEMENTACIONES SE COMPARAN: `orquestador/lib/cara-documentos.pg.test.mjs` mide
      -- este número contra el que arma TypeScript sobre el MISMO payload, para los clientes reales.
      -- Sin esa comparación, el N de arriba y las filas de abajo se separan en el primer cambio.
      --
      -- Las órdenes SIN PDF se cuentan por su número canónico y no por su fila: dos copias del mismo
      -- mail son UNA orden, que es lo que agrupa `agruparPapeles()` en TypeScript.
      select count(*) from (
        select z.drive_file_id id from public.obra_papel_drive z
         where z.obra_id in (select o.obra_id from sus_obras o)
        union
        select d.drive_file_id from public.cliente_documento d
         where d.cliente_id = (select cliente_id from elegido)
        union
        select coalesce(r.drive_file_id, 'os:' || upper(btrim(coalesce(r.numero, r.id::text))) || ':' || r.tipo)
          from public.cliente_orden r
         where r.cliente_id = (select cliente_id from elegido)
           and r.eliminado_en is null and r.tipo in ('orden_compra', 'orden_pago')
        union
        -- LA CUARTA FUENTE: lo que está en la carpeta del CLIENTE y ninguna obra reclama. La cara lo
        -- dibuja al final («Carpeta del cliente · sin obra asignada») y sin esta rama el número de
        -- arriba sería MENOR que las filas de abajo — el defecto original dado vuelta. Messina tiene
        -- 37 archivos así.
        select a.drive_file_id from public.drive_index a
         where not a.is_folder and coalesce(a.trashed, false) = false
           and coalesce(a.ausente_en_drive, false) = false
           and a.path like (
             select p.path || '/%' from public.drive_index p
              where p.drive_file_id = (select c.drive_carpeta_id from public.cliente_panel c
                                        where c.slug = p_slug))
      ) t
    ),

    -- LOS VÍNCULOS A DRIVE, y APARTE los archivos. No se cruzan acá: ver la cabecera.
    'documentos', case when p_solapa is null or p_solapa in ('documentos', 'actividad') then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'drive_file_id', d.drive_file_id, 'rol', d.rol, 'origen', d.origen,
               'creado_en', d.creado_en)), '[]'::jsonb)
        from public.cliente_documento d
       where d.cliente_id = (select cliente_id from elegido)
    ) else '[]'::jsonb end,
    -- LA TERCERA OLA QUE DEJA DE SER UNA OLA: esto esperaba a que volvieran los ids de arriba.
    'drive', case when p_solapa is null or p_solapa in ('documentos', 'actividad') then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'drive_file_id', a.drive_file_id, 'name', a.name, 'path', a.path,
               'mime_type', a.mime_type, 'modified_time', a.modified_time)), '[]'::jsonb)
        from public.drive_index a
       where a.drive_file_id in (
               select d.drive_file_id from public.cliente_documento d
                where d.cliente_id = (select cliente_id from elegido))
    ) else '[]'::jsonb end,

    -- LAS NOTAS Y SUS AUTORES, por separado: una nota cuyo perfil ya no está queda SIN FIRMA, que
    -- es la verdad, en lugar de perderse. Ese cruce lo hace TypeScript y sigue siendo uno solo.
    'notas', case when p_solapa is null or p_solapa in ('obras', 'actividad') then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', n.id, 'texto', n.texto, 'autor_id', n.autor_id, 'creado_en', n.creado_en)
               order by n.creado_en desc), '[]'::jsonb)
        from public.cliente_nota n
       where n.cliente_id = (select cliente_id from elegido)
    ) else '[]'::jsonb end,
    'autores', case when p_solapa is null or p_solapa in ('obras', 'actividad') then (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre)), '[]'::jsonb)
        from public.perfiles p
       where p.id in (
               select n.autor_id from public.cliente_nota n
                where n.cliente_id = (select cliente_id from elegido) and n.autor_id is not null)
    ) else '[]'::jsonb end,

    -- LAS FECHAS DEL CLIENTE PARA LA ACTIVIDAD salen de `clientes`, no de `cliente_panel`: la vista
    -- no las publica, y agregarlas ahí sería una migración para una solapa que no la necesita.
    'actividad_cliente', case when p_solapa is null or p_solapa in ('obras', 'actividad') then (
      select jsonb_build_object('nombre_comercial', c.nombre_comercial,
                                'created_at', c.created_at, 'updated_at', c.updated_at)
        from public.clientes c where c.id = (select cliente_id from elegido)
    ) else null::jsonb end,

    -- LOS CERTIFICADOS DE SUS OBRAS — la otra lectura que esperaba a la ola anterior.
    'certificados', case when p_solapa is null or p_solapa in ('obras', 'actividad') then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id, 'numero', t.numero, 'obra_canonica_id', t.obra_canonica_id,
               'fecha_certificacion', t.fecha_certificacion, 'monto_certificado', t.monto_certificado,
               'fecha_facturacion', t.fecha_facturacion, 'monto_facturado', t.monto_facturado,
               'fecha_cobranza', t.fecha_cobranza, 'monto_cobrado', t.monto_cobrado)), '[]'::jsonb)
        from public.certificados t
       where t.obra_canonica_id in (select o.obra_id from sus_obras o)
    ) else '[]'::jsonb end,

    -- ═══ LOS PAPELES QUE CONFORMARON CADA OBRA (dueño, 11/09/2026) ═══
    --
    -- «No encuentro las cotizaciones, los documentos, archivos y demás cuestiones que han conformado
    -- todas las obras.» Viajan SÓLO en la cara Documentos, que es la única que los dibuja: son 106
    -- filas en Messina y arrastrarlas por las otras ocho caras es el peso que 20260911T1200 acaba de
    -- sacar.
    'papeles_obra', case when p_solapa is null or p_solapa = 'documentos' then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'drive_file_id', z.drive_file_id, 'obra_id', z.obra_id, 'nombre', z.nombre,
               'ruta', z.ruta, 'mime_type', z.mime_type, 'size_bytes', z.size_bytes,
               'modified_time', z.modified_time, 'web_view_link', z.web_view_link,
               'via', z.via)), '[]'::jsonb)
        from public.obra_papel_drive z
       where z.obra_id in (select o.obra_id from sus_obras o)
    ) else '[]'::jsonb end,

    -- LAS CARPETAS VINCULADAS. Sin esto, «esta obra no tiene papeles» y «esta obra no tiene carpeta
    -- vinculada en Drive» se dibujan igual —una lista vacía— y son dos hechos opuestos: el primero
    -- es una obra sin documentar y el segundo, trabajo del OS que falta hacer.
    'carpetas_obra', case when p_solapa is null or p_solapa = 'documentos' then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'obra_id', y.obra_id, 'drive_folder_id', y.drive_folder_id, 'ruta', y.ruta,
               'fuente', y.fuente)), '[]'::jsonb)
        from public.obra_carpeta_drive y
       where y.obra_id in (select o.obra_id from sus_obras o)
    ) else '[]'::jsonb end,

    -- LOS PRESUPUESTOS DE ESTE CLIENTE. La aplicación traía TODA la cartera vigente y descartaba en
    -- memoria; el filtro es el mismo predicado (`cliente_id`), sólo que antes del cable.
    'presupuestos', (
      select coalesce(jsonb_agg(to_jsonb(z) order by z.fecha_cotizacion desc), '[]'::jsonb)
        from public.cotizacion_cascada z
       where z.vigente = true and z.cliente_id = (select cliente_id from elegido)
    )
  )
  );
end
$function$;

-- La ficha del cliente y las horas de la obra se sirven de una caché de 10 min: se vacía para que la
-- próxima lectura ya salga con los nombres nuevos (memoria «ficha: caché en la base»).
delete from public.ficha_cliente_cache;
