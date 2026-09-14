-- ASIGNAR A UNA OBRA EN UNA SOLA TRANSACCIÓN, SIN BORRAR NUNCA (auditoría, 14/09/2026).
--
-- La app escribía `obra_asignacion` con llamadas sueltas de PostgREST: cerrar la anterior, borrar un
-- pase futuro, abrir la nueva. Si el alta rebotaba, lo cerrado o borrado ya estaba escrito, y un alta
-- con fecha pasada podía borrar tres filas cargadas por personas sin dejar rastro.
--
-- Esta función hace todo o nada:
--   · `p_cerrar`   [{id, hasta}]  pone `hasta`;
--   · `p_anular`   [{id}]         marca «ANULADA por cronología» en `notas` (la lectura la ignora);
--   · `p_recortar` [{id, desde}]  corre `desde`;
--   · `p_altas`    [{obra_id, rol, desde, hasta, cuadrilla_id, actividad_id, notas}] inserta.
-- Toda fila tocada recibe `p_nota` («ajustada por <usuario> al asignar …»). No hay `delete`.
--
-- SECURITY INVOKER: corre con los permisos de quien llama, así que la RLS de `obra_asignacion` sigue
-- decidiendo quién toca qué. Cada fila tiene que ser de `p_persona` y afectar exactamente una: si la
-- policy la esconde o alguien la cambió, se aborta con excepción y no queda nada escrito.
--
-- Quién decide QUÉ se cierra, anula o recorta es `orquestador/lib/cronologia-asignaciones.mjs` en la
-- app; lo que no es un cierre automático sólo llega acá después de que una persona confirmó.

create or replace function public.asignar_obra_con_cronologia(
  p_persona uuid,
  p_cerrar jsonb,
  p_anular jsonb,
  p_recortar jsonb,
  p_altas jsonb,
  p_nota text
) returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $fn$
declare
  x jsonb;
  n int;
  nuevo uuid;
  ids uuid[] := '{}';
begin
  if p_persona is null then
    raise exception 'asignar_obra_con_cronologia: falta la persona' using errcode = '22023';
  end if;
  if p_nota is null or btrim(p_nota) = '' then
    raise exception 'asignar_obra_con_cronologia: toda fila tocada lleva nota' using errcode = '22023';
  end if;

  for x in select value from jsonb_array_elements(coalesce(p_cerrar, '[]'::jsonb)) loop
    update obra_asignacion
       set hasta = (x->>'hasta')::date,
           notas = case when coalesce(notas, '') = '' then p_nota else notas || ' · ' || p_nota end
     where id = (x->>'id')::uuid and persona_id = p_persona;
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'no pude cerrar la asignación % (% filas): no se escribió nada', x->>'id', n using errcode = 'P0002';
    end if;
  end loop;

  for x in select value from jsonb_array_elements(coalesce(p_anular, '[]'::jsonb)) loop
    update obra_asignacion
       set notas = case when coalesce(notas, '') = '' then '' else notas || ' · ' end
                   || 'ANULADA por cronología: ' || p_nota
     where id = (x->>'id')::uuid and persona_id = p_persona;
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'no pude anular la asignación % (% filas): no se escribió nada', x->>'id', n using errcode = 'P0002';
    end if;
  end loop;

  for x in select value from jsonb_array_elements(coalesce(p_recortar, '[]'::jsonb)) loop
    update obra_asignacion
       set desde = (x->>'desde')::date,
           notas = case when coalesce(notas, '') = '' then p_nota else notas || ' · ' || p_nota end
     where id = (x->>'id')::uuid and persona_id = p_persona
       and (hasta is null or hasta >= (x->>'desde')::date);
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'no pude recortar la asignación % (% filas): no se escribió nada', x->>'id', n using errcode = 'P0002';
    end if;
  end loop;

  for x in select value from jsonb_array_elements(coalesce(p_altas, '[]'::jsonb)) loop
    insert into obra_asignacion (obra_id, persona_id, rol, cuadrilla_id, actividad_id, desde, hasta, notas)
    values (
      x->>'obra_id', p_persona, coalesce(nullif(x->>'rol', ''), 'integrante'),
      nullif(x->>'cuadrilla_id', '')::uuid, nullif(x->>'actividad_id', '')::uuid,
      (x->>'desde')::date, nullif(x->>'hasta', '')::date, nullif(x->>'notas', '')
    )
    returning id into nuevo;
    ids := ids || nuevo;
  end loop;

  return jsonb_build_object('altas', to_jsonb(ids));
end
$fn$;

comment on function public.asignar_obra_con_cronologia(uuid, jsonb, jsonb, jsonb, jsonb, text) is
  'Asigna a una persona a una obra respetando su cronología: cierra, anula (marca en notas), recorta y '
  'da de alta en una sola transacción. Nunca borra. SECURITY INVOKER: manda la RLS de obra_asignacion.';

revoke all on function public.asignar_obra_con_cronologia(uuid, jsonb, jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.asignar_obra_con_cronologia(uuid, jsonb, jsonb, jsonb, jsonb, text) to authenticated;


-- ═══ UNA SOLA DEFINICIÓN DE «ASIGNACIÓN VIGENTE»: LA QUE NO ESTÁ ANULADA (auditoría, 14/09/2026) ═══
--
-- Una fila anulada no se borra: lleva «ANULADA por cronología» en `notas`. Si cada lector la filtrara a su
-- manera, alguno la seguiría contando —la grilla mostraría a Reta en Messina con la fila anulada—.
-- Por eso hay UNA vista, y todo lector de la app, del orquestador y de la base lee por ella. La marca
-- es la misma constante que `MARCA_ANULADA` en `orquestador/lib/cronologia-asignaciones.mjs`; un test
-- lo verifica.
--
-- SECURITY INVOKER: la RLS de `obra_asignacion` sigue decidiendo qué filas ve cada uno.

create or replace view public.obra_asignacion_vigente with (security_invoker = true) as
  select a.* from public.obra_asignacion a
   where coalesce(a.notas, '') not like '%ANULADA por cronología%';

comment on view public.obra_asignacion_vigente is
  'obra_asignacion sin las filas anuladas (marca en notas). Es la única lectura de asignaciones: la app, el orquestador y las vistas y funciones de la base leen por acá.';

grant select on public.obra_asignacion_vigente to authenticated, service_role;

-- EL ÍNDICE DE «UNA VIGENTE» TAMPOCO CUENTA LAS ANULADAS: una anulada abierta impedía volver a asignar
-- a la persona a esa obra. Se crea el nuevo antes de soltar el viejo, así nunca queda sin restricción.
create unique index if not exists obra_asignacion_una_vigente_sin_anuladas
  on public.obra_asignacion (obra_id, persona_id, coalesce(actividad_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where hasta is null and coalesce(notas, '') not like '%ANULADA por cronología%';
drop index if exists public.obra_asignacion_una_vigente;
alter index public.obra_asignacion_una_vigente_sin_anuladas rename to obra_asignacion_una_vigente;

-- ═══ LOS LECTORES DE LA BASE, LEÍDOS DE LA BASE VIVA EL 14/09/2026 (pg_depend, pg_proc, pg_policies) ═══
--
-- Cada definición es la vigente en producción con `obra_asignacion` cambiado por `obra_asignacion_vigente`.
-- Las vistas conservan su `security_invoker`: un CREATE OR REPLACE sin la opción la pierde.
-- `ve_obra`, `mis_obras` y `marca_ausencia_de` son SECURITY DEFINER: leen como su dueño, igual que antes.
-- `ve_obra` y `personas_select` son RLS: leer por la vista NO las debilita, las ESTRECHA — una fila
-- anulada deja de dar acceso a la obra o a la persona.

-- lector: cuadrilla_panel
create or replace view public.cuadrilla_panel with (security_invoker = true) as
SELECT c.id,
    c.nombre,
    c.activa,
    c.notas,
    c.responsable_id,
    r.nombre_completo AS responsable,
    ( SELECT count(*)::integer AS count
           FROM cuadrilla_integrante ci
          WHERE ci.cuadrilla_id = c.id AND ci.hasta IS NULL) AS integrantes,
    ( SELECT string_agg(DISTINCT oa.obra_id, ', '::text ORDER BY oa.obra_id) AS string_agg
           FROM obra_asignacion_vigente oa
          WHERE oa.cuadrilla_id = c.id AND asignacion_vigente(oa.desde, oa.hasta)) AS obras_actuales
   FROM cuadrilla c
     LEFT JOIN personas r ON r.id = c.responsable_id;
-- fin lector: cuadrilla_panel

-- lector: mi_asignacion
create or replace view public.mi_asignacion with (security_invoker = false) as
SELECT a.id,
    a.obra_id,
    o.nombre AS obra,
    a.rol,
    a.cuadrilla,
    a.desde,
    a.hasta,
    COALESCE(a.desde, '-infinity'::date) <= CURRENT_DATE AND (a.hasta IS NULL OR a.hasta >= CURRENT_DATE) AS vigente
   FROM obra_asignacion_vigente a
     LEFT JOIN obra_canonica o ON o.id = a.obra_id
  WHERE a.persona_id = mi_persona_id();
-- fin lector: mi_asignacion

-- lector: mi_obra
create or replace view public.mi_obra with (security_invoker = false) as
SELECT o.id,
    o.nombre,
    o.ubicacion,
    o.etapa,
    o.estado,
    o.jefe_obra,
    a.rol,
    a.cuadrilla,
    a.desde,
    a.hasta,
    a.actividad_id
   FROM obra_asignacion_vigente a
     JOIN obra_canonica o ON o.id = a.obra_id
  WHERE a.persona_id = mi_persona_id() AND asignacion_vigente(a.desde, a.hasta);
-- fin lector: mi_obra

-- lector: mi_tarea
create or replace view public.mi_tarea with (security_invoker = false) as
SELECT DISTINCT t.id,
    t.obra_id,
    o.nombre AS obra,
    t.codigo,
    t.nombre,
    t.seccion,
    t.estado,
    av.avance_pct AS pct,
    t.inicio_plan,
    t.fin_plan,
    t.unidad,
    t.cantidad_objetivo,
    t.metodo_avance,
    t.comentario,
    (( SELECT count(*) AS count
           FROM obra_restriccion r
          WHERE r.actividad_id = t.id AND r.estado = 'abierta'::text))::integer AS impedimentos,
    av.origen_avance,
    av.cantidad_ejecutada,
    av.n_pasos,
    av.n_pasos_hechos
   FROM obra_actividad t
     JOIN obra_canonica o ON o.id = t.obra_id
     LEFT JOIN actividad_avance av ON av.actividad_id = t.id
  WHERE t.archivada IS NOT TRUE AND mi_persona_id() IS NOT NULL AND (t.responsable_id = mi_persona_id() OR (EXISTS ( SELECT 1
           FROM cuadrilla_integrante ci
          WHERE ci.persona_id = mi_persona_id() AND ci.hasta IS NULL AND ci.cuadrilla_id = t.cuadrilla_id)) OR (EXISTS ( SELECT 1
           FROM obra_asignacion_vigente a
          WHERE a.persona_id = mi_persona_id() AND a.actividad_id = t.id AND asignacion_vigente(a.desde, a.hasta))));
-- fin lector: mi_tarea

-- lector: persona_directorio
create or replace view public.persona_directorio with (security_invoker = true) as
SELECT p.id,
    p.nombre_completo,
    p.categoria,
    p.especialidad,
    p.puesto,
    p.fecha_ingreso,
    p.fecha_egreso,
    ci.cuadrilla_id,
    cu.nombre AS cuadrilla,
    a.obra_id AS obra_actual_id,
    oc.nombre AS obra_actual,
    a.rol AS rol_en_obra,
    a.desde AS asignada_desde,
    p.en_la_empresa,
    p.legajo
   FROM personas p
     LEFT JOIN cuadrilla_integrante ci ON ci.persona_id = p.id AND ci.hasta IS NULL
     LEFT JOIN cuadrilla cu ON cu.id = ci.cuadrilla_id
     LEFT JOIN LATERAL ( SELECT oa.obra_id,
            oa.rol,
            oa.desde
           FROM obra_asignacion_vigente oa
          WHERE oa.persona_id = p.id AND asignacion_vigente(oa.desde, oa.hasta)
          ORDER BY oa.desde DESC NULLS LAST, oa.creado_en DESC
         LIMIT 1) a ON true
     LEFT JOIN obra_canonica oc ON oc.id = a.obra_id
  WHERE p.es_prueba IS NOT TRUE OR ( SELECT sesion_es_de_prueba() AS sesion_es_de_prueba);
-- fin lector: persona_directorio

-- lector: xsas_actividad
create or replace view public.xsas_actividad with (security_invoker = true) as
SELECT c.actividad_id,
    c.obra_id,
    o.nombre AS obra,
    COALESCE(cl.nombre_comercial, cl.razon_social, o.cliente_texto) AS cliente,
    o.cliente_id,
    o.estado AS obra_estado,
    o.contrato_monto,
    o.contrato_moneda,
    c.codigo,
    c.nombre AS actividad,
    c.estado AS actividad_estado,
    c.estado_operativo,
    c.unidad,
    c.tarea_tipo_id,
    tt.codigo AS tarea_codigo,
    tt.nombre AS tarea,
    c.analisis_id,
    c.cotizacion_partida_id,
    c.cantidad_objetivo AS plan_cantidad,
    c.hh_plan AS plan_hh,
    c.dias_plan AS plan_dias,
    c.dotacion_prevista AS plan_dotacion,
    c.inicio_plan,
    c.fin_plan,
    cp.hs_unitarias AS presupuesto_hs_unitarias,
    cp.costo_unitario AS presupuesto_costo_unitario,
    cp.cantidad AS presupuesto_cantidad,
    c.cantidad_ejecutada AS cantidad_real,
    c.avance_pct,
    c.origen_avance,
    c.estado_fecha = 'terminada'::text AS terminada,
    c.metodo_avance = 'manual'::text AND c.pct IS NOT NULL AND c.avance_partes IS NOT NULL AS avance_sumado,
    c.estado_fecha,
    c.n_partes,
    c.ultimo_parte,
    c.hh_real,
    c.hh_improductivas,
    c.hh_productivas,
    c.n_imputaciones,
    c.inicio_real,
    c.fin_real,
    c.origen_inicio_real,
    c.origen_fin_real,
        CASE
            WHEN c.inicio_real IS NOT NULL AND c.fin_real IS NOT NULL THEN c.fin_real - c.inicio_real + 1
            ELSE NULL::integer
        END AS dias_real,
    dot.dotacion_real,
    cau.causas,
    c.cuadrilla_id,
    comp.composicion,
    ac.seccion,
    ac.tipo IS DISTINCT FROM 'hito'::text AND NOT (EXISTS ( SELECT 1
           FROM obra_actividad h
          WHERE h.actividad_padre_id = c.actividad_id)) AS es_trabajo,
    per.personas_con_hh AS dotacion_por_hh
   FROM obra_actividad_control c
     LEFT JOIN obra_actividad ac ON ac.id = c.actividad_id
     LEFT JOIN obra_canonica o ON o.id = c.obra_id
     LEFT JOIN clientes cl ON cl.id = o.cliente_id
     LEFT JOIN tarea_tipo tt ON tt.id = c.tarea_tipo_id
     LEFT JOIN cotizacion_partida cp ON cp.id = c.cotizacion_partida_id
     LEFT JOIN LATERAL ( SELECT count(DISTINCT h.persona_id)::integer AS personas_con_hh
           FROM registros_hh h
          WHERE h.actividad_id = c.actividad_id AND (h.tipo_hora = ANY (ARRAY['normal'::text, 'extra_50'::text, 'extra_100'::text]))) per ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(NULLIF(per.personas_con_hh, 0), ( SELECT count(DISTINCT s.persona_id)::integer AS count
                   FROM obra_asignacion_vigente s
                  WHERE s.actividad_id = c.actividad_id AND (s.hasta IS NULL OR s.hasta >= CURRENT_DATE))) AS dotacion_real) dot ON true
     LEFT JOIN LATERAL ( SELECT jsonb_object_agg(x.causa, x.n) AS causas
           FROM ( SELECT registros_hh.causa_desvio AS causa,
                    count(*)::integer AS n
                   FROM registros_hh
                  WHERE registros_hh.actividad_id = c.actividad_id AND registros_hh.causa_desvio IS NOT NULL
                  GROUP BY registros_hh.causa_desvio
                UNION ALL
                 SELECT obra_ejecucion.causa_desvio,
                    count(*)::integer AS count
                   FROM obra_ejecucion
                  WHERE obra_ejecucion.actividad_id = c.actividad_id AND obra_ejecucion.causa_desvio IS NOT NULL
                  GROUP BY obra_ejecucion.causa_desvio) x
          WHERE x.causa IS NOT NULL) cau ON true
     LEFT JOIN LATERAL ( SELECT jsonb_object_agg(y.categoria, y.n) AS composicion
           FROM ( SELECT COALESCE(p.categoria, 'sin categoría'::text) AS categoria,
                    count(*)::integer AS n
                   FROM cuadrilla_integrante ci
                     JOIN personas p ON p.id = ci.persona_id
                  WHERE ci.cuadrilla_id = c.cuadrilla_id AND (ci.hasta IS NULL OR ci.hasta >= COALESCE(c.fin_real, CURRENT_DATE))
                  GROUP BY (COALESCE(p.categoria, 'sin categoría'::text))) y) comp ON true
  WHERE c.archivada IS NOT TRUE;
-- fin lector: xsas_actividad

-- lector: ve_obra
CREATE OR REPLACE FUNCTION public.ve_obra(p_obra text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.es_administracion()
      -- El jefe de obra opera TODAS las obras. Lo económico no pasa por acá.
      or public.current_rol() = 'jefe_obra'
      or exists (
        select 1 from public.usuario_obra uo
        where uo.usuario_id = auth.uid()
          and uo.obra_canonica_id = p_obra
      )
      -- La obra donde mi PERSONA está asignada hoy. Un eje, no dos.
      or exists (
        select 1 from public.obra_asignacion_vigente a
        where a.persona_id = public.mi_persona_id()
          and a.obra_id = p_obra
          and public.asignacion_vigente(a.desde, a.hasta)
      )
$function$;
-- fin lector: ve_obra

-- lector: mis_obras
CREATE OR REPLACE FUNCTION public.mis_obras()
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select uo.obra_canonica_id
    from public.usuario_obra uo
   where uo.usuario_id = auth.uid()
  union
  select a.obra_id
    from public.obra_asignacion_vigente a
   where a.persona_id = public.mi_persona_id()
     and public.asignacion_vigente(a.desde, a.hasta)
$function$;
-- fin lector: mis_obras

-- lector: marca_ausencia_de
CREATE OR REPLACE FUNCTION public.marca_ausencia_de(p_persona uuid, p_fecha date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Dirección y Administración, cualquiera del plantel: son quienes autorizan una licencia.
  --
  -- NO se usa `es_administracion()` acá, y es a propósito: esa función incluye a `jefe_obra` desde
  -- el 19/08, así que usarla dejaría al jefe marcando ausente a CUALQUIERA de la empresa y haría
  -- decorativa la segunda rama. El jefe entra por la de abajo, que es la que lo acota.
  select public.current_rol() in ('direccion', 'administracion')
      or (
        public.current_rol() = 'jefe_obra'
        and exists (
          select 1 from public.obra_asignacion_vigente a
          where a.persona_id = p_persona
            and (a.desde is null or a.desde <= coalesce(p_fecha, current_date))
            and (a.hasta is null or a.hasta >= coalesce(p_fecha, current_date))
            and public.ve_obra(a.obra_id)
        )
      )
$function$;
-- fin lector: marca_ausencia_de

-- lector: personas_select
alter policy personas_select on public.personas
  using ((( SELECT es_administracion() AS es_administracion) OR (EXISTS ( SELECT 1
   FROM obra_asignacion_vigente oa
  WHERE ((oa.persona_id = personas.id) AND (( SELECT es_administracion() AS es_administracion) OR (( SELECT current_rol() AS current_rol) = 'jefe_obra'::text) OR ve_obra(oa.obra_id))))) OR (EXISTS ( SELECT 1
   FROM registros_hh h
  WHERE ((h.persona_id = personas.id) AND (h.obra_canonica_id IS NOT NULL) AND (( SELECT es_administracion() AS es_administracion) OR (( SELECT current_rol() AS current_rol) = 'jefe_obra'::text) OR ve_obra(h.obra_canonica_id)))))));
-- fin lector: personas_select
