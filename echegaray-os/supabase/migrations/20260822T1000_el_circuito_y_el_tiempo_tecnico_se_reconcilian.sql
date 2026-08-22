-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL CIRCUITO PRODUCTIVO Y EL TIEMPO TÉCNICO SE RECONCILIAN — dos frentes tocaron los mismos dos
-- objetos y ninguno de los dos lo sabía
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Mientras se escribía el circuito (4000–4900), otro frente integró `20260821T5450`. Los dos tocan
-- **los mismos dos objetos** y, como 5450 ordena DESPUÉS, aplicarlas en secuencia produce esto:
--
--   1 · `obra_actividad_control` — 5450 la reescribe agregando `tiempo_tecnico`, sin las tres
--       columnas que agregó la 4500 (`hh_improductivas`, `hh_productivas`, `n_incidencias`).
--       Postgres NO lo deja pasar: `create or replace view` no puede quitar columnas, así que 5450
--       **aborta** con «cannot drop columns from view». Verificado aplicando las once en orden real.
--       Es el modo de falla bueno —ruidoso— pero deja el juego de migraciones sin poder aplicarse.
--
--   2 · `convertir_partida_a_plan` — 5450 la reescribe desde la versión ANTERIOR a la 4600, para
--       agregarle una línea (`tiempo_tecnico` en el INSERT del paso). Acá no hay error: la última
--       gana, y se llevaría puestas las fechas encadenadas, la dotación, el tope y toda la rama del
--       paquete subcontratado. **Este sí es un pisado silencioso**, y es el peligroso de los dos.
--
--   3 · el backfill de 5450 (`tiempo_tecnico = true where fuente='conversion_presupuesto' and
--       dias_plan > 0`) se apoya en una premisa que la 4600 vuelve falsa: antes SÓLO el paso técnico
--       recibía `dias_plan`; ahora TODOS los pasos lo reciben, porque la conversión calcula la
--       duración de cada uno. Con las dos aplicadas, cada actividad convertida quedaría marcada como
--       tiempo técnico y la pantalla 08 dejaría de comprimir el frente entero.
--
-- Ninguno de los dos frentes hizo nada mal: los dos tenían razón sobre su objeto. Lo que faltaba era
-- el paso que los pone juntos. Esta migración es ese paso y va FUERA de las dos bandas (4xxx del
-- circuito, 5xxx de seguridad y obra) para no chocar con un tercer frente que todavía no integró.
--
-- No aporta ninguna decisión nueva: publica la UNIÓN de lo que las dos ya decidieron.

-- ── 1 · la vista publica el tiempo técnico Y la partición de las horas ────────────────────────
create or replace view public.obra_actividad_control with (security_invoker = true) as
 SELECT a.id AS actividad_id,
    a.id,
    a.obra_id,
    a.codigo,
    a.codigo_padre,
    a.nombre,
    a.tipo,
    a.orden,
    a.seccion,
    a.archivada,
    a.clave,
    a.dias_plan,
    a.dias_real,
    a.editado_a_mano,
    a.fuente_pestana,
    a.creada_en_web,
    a.cuadrilla,
    ( SELECT p.nombre
           FROM obra_actividad p
          WHERE p.obra_id = a.obra_id AND p.codigo = a.codigo_padre AND p.tipo = 'resumen'::text
          ORDER BY p.orden
         LIMIT 1) AS rubro,
    a.estado,
    a.unidad,
    a.cantidad_objetivo,
    a.metodo_avance,
    a.inicio_plan,
    a.fin_plan,
    a.inicio_base,
    a.fin_base,
    a.sellada_en,
    a.inicio_real,
    a.fin_real,
    a.hh_plan,
    a.responsable_id,
    a.cuadrilla_id,
    ( SELECT c.nombre
           FROM cuadrilla c
          WHERE c.id = a.cuadrilla_id) AS cuadrilla_prevista,
    a.comentario,
    a.partida_codigo,
    a.partida_cantidad,
    a.pct,
    a.pct AS avance_declarado,
    e.cantidad_ejecutada,
    e.avance_partes,
    e.n_partes,
    e.ultimo_parte,
    h.hh_real,
    h.hh_extra,
    COALESCE(h.n_imputaciones, 0::bigint)::integer AS n_imputaciones,
    COALESCE(imp.abiertos, 0) AS impedimentos_abiertos,
        CASE a.metodo_avance
            WHEN 'cantidad'::text THEN
            CASE
                WHEN a.cantidad_objetivo > 0::numeric THEN LEAST(100::numeric, round(COALESCE(e.cantidad_ejecutada, 0::numeric) / a.cantidad_objetivo * 100::numeric, 1))
                ELSE NULL::numeric
            END
            WHEN 'partes'::text THEN LEAST(100::numeric, round(COALESCE(e.avance_partes, 0::numeric), 1))
            WHEN 'pasos'::text THEN
            CASE
                WHEN ps.peso_total > 0::numeric THEN round(COALESCE(ps.peso_hecho, 0::numeric) / ps.peso_total * 100::numeric, 1)
                ELSE NULL::numeric
            END
            ELSE a.pct
        END AS avance_pct,
        CASE a.metodo_avance
            WHEN 'cantidad'::text THEN 'cantidad'::text
            WHEN 'partes'::text THEN 'partes'::text
            WHEN 'pasos'::text THEN 'pasos'::text
            ELSE
            CASE
                WHEN a.pct IS NOT NULL THEN 'declarado'::text
                ELSE NULL::text
            END
        END AS origen_avance,
        CASE
            WHEN COALESCE(imp.abiertos, 0) > 0 THEN 'bloqueada'::text
            ELSE a.estado
        END AS estado_operativo,
        -- LA DE LA 4500: sobre las horas PRODUCTIVAS. Dividir por el total hacía que una espera de
        -- equipo bajara el rendimiento de la tarea como si la cuadrilla hubiera trabajado peor.
        CASE
            WHEN e.cantidad_ejecutada > 0::numeric AND ah.hh_productivas > 0::numeric
            THEN round(e.cantidad_ejecutada / ah.hh_productivas, 3)
            ELSE NULL::numeric
        END AS productividad,
        CASE
            WHEN a.hh_plan > 0::numeric AND h.hh_real IS NOT NULL THEN round(h.hh_real / a.hh_plan * 100::numeric, 1)
            ELSE NULL::numeric
        END AS consumo_hh_pct,
    a.actividad_padre_id,
    COALESCE(t.n_tareas, 0) AS n_tareas,
    COALESCE(t.n_tareas_hechas, 0) AS n_tareas_hechas,
    COALESCE(ped.n_pedidos, 0) AS n_pedidos,
    COALESCE(nt.n_notas, 0) AS n_notas,
    COALESCE(doc.n_documentos, 0) AS n_documentos,
    COALESCE(eq.n_equipos, 0) AS n_equipos,
    COALESCE(ps.n_pasos, 0) AS n_pasos,
    COALESCE(ps.n_pasos_hechos, 0) AS n_pasos_hechos,
    ps.peso_total AS peso_pasos,
    a.rol_estructura,
    a.tope_frente,
    a.dotacion_prevista,
    a.analisis_id,
    a.tarea_tipo_id,
    a.cotizacion_partida_id,
    a.tiempo_tecnico,
    ah.hh_improductivas,
    ah.hh_productivas,
    ah.n_incidencias
   FROM obra_actividad a
     JOIN actividad_horas ah ON ah.actividad_id = a.id
     LEFT JOIN LATERAL ( SELECT sum(x.cantidad) AS cantidad_ejecutada,
            sum(x.avance_pct) AS avance_partes,
            count(*)::integer AS n_partes,
            max(x.fecha) AS ultimo_parte
           FROM obra_ejecucion x
          WHERE x.actividad_id = a.id) e ON true
     LEFT JOIN LATERAL ( SELECT sum(r.horas) FILTER (WHERE r.tipo_hora = ANY (ARRAY['normal'::text, 'extra_50'::text, 'extra_100'::text])) AS hh_real,
            sum(r.horas) FILTER (WHERE r.tipo_hora = ANY (ARRAY['extra_50'::text, 'extra_100'::text])) AS hh_extra,
            count(*) FILTER (WHERE r.tipo_hora = ANY (ARRAY['normal'::text, 'extra_50'::text, 'extra_100'::text])) AS n_imputaciones
           FROM registros_hh r
          WHERE r.actividad_id = a.id) h ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS abiertos
           FROM obra_restriccion x
          WHERE x.actividad_id = a.id AND x.fecha_liberacion IS NULL) imp ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS n_tareas,
            count(*) FILTER (WHERE x.estado = 'hecha'::text)::integer AS n_tareas_hechas
           FROM obra_actividad x
          WHERE x.actividad_padre_id = a.id AND NOT x.archivada) t ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS n_pedidos
           FROM pedidos_materiales x
          WHERE x.actividad_id = a.id) ped ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS n_notas
           FROM obra_actividad_nota x
          WHERE x.actividad_id = a.id) nt ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS n_documentos
           FROM obra_documento x
          WHERE x.actividad_id = a.id) doc ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS n_pasos,
            count(*) FILTER (WHERE x.hecho_en IS NOT NULL)::integer AS n_pasos_hechos,
            sum(x.peso) AS peso_total,
            sum(x.peso) FILTER (WHERE x.hecho_en IS NOT NULL) AS peso_hecho
           FROM obra_actividad_paso x
          WHERE x.actividad_id = a.id) ps ON true
     LEFT JOIN LATERAL ( SELECT count(DISTINCT x.equipo)::integer AS n_equipos
           FROM obra_ejecucion_equipo x
             JOIN obra_ejecucion p ON p.id = x.ejecucion_id
          WHERE p.actividad_id = a.id) eq ON true;

comment on view public.obra_actividad_control is
  'El control de una actividad, con lo que decidieron los DOS frentes: `tiempo_tecnico` (5450) para '
  'que la pantalla 08 no comprima un curado, y la partición de las horas (4500) para que la '
  'productividad se mida sobre las que produjeron. hh_real sigue siendo EL TOTAL: es lo que se pagó.';

grant select on public.obra_actividad_control to authenticated;
grant select on public.obra_actividad_control to service_role;

-- ── 2 · la conversión, con fechas, paquete Y tiempo técnico persistido ────────────────────────
-- Es la de la 4600 con la única línea que agregaba la 5450: `tiempo_tecnico` en el INSERT del paso.
-- Las dos ramas de actividad única no la escriben porque nunca son un tiempo técnico: son la
-- partida entera, no un paso de la secuencia.
create or replace function public.convertir_partida_a_plan(
  p_partida_id   uuid,
  p_obra_id      text,
  -- [{"nombre":"Eje 1-4","cantidad":1.08,"inicio":"2026-09-01","dotacion":4,"tope":6}, ...]
  p_frentes      jsonb,
  p_plantilla_id uuid default null,
  p_metodo       text default null
) returns jsonb language plpgsql security invoker as $$
declare
  v_part        record;
  v_hs_un       numeric;
  v_suma        numeric;
  v_rubro_id    uuid;
  v_frente_id   uuid;
  v_prev_id     uuid;
  v_act_id      uuid;
  v_peso_tot    numeric;
  v_frente      jsonb;
  v_paso        record;
  v_metodo      text;
  v_n_act       int := 0;
  v_n_frentes   int := 0;
  v_orden       int;
  v_hh_partida  numeric;
  v_hh_paso     numeric;
  v_jornada     numeric;
  v_inicio      date;
  v_dot         int;
  v_tope        int;
  v_cursor      date;
  v_fin         date;
  v_ultimo_fin  date;
  v_dur         numeric;
  v_act_ids     uuid[] := '{}';
  v_sub_id      uuid;
  v_precio_ok   boolean := false;
  v_sin_dot     boolean := false;
  v_min_inicio  date;
  v_max_fin     date;
begin
  if not public.es_administracion() then
    raise exception 'convertir un presupuesto en plan de obra exige permiso de administración';
  end if;

  select p.*, coalesce(p.hs_unitarias, ac.hs_unitarias) as hs_efectivas into v_part
    from public.cotizacion_partida p
    left join public.analisis_costo ac on ac.analisis_id = p.analisis_id
   where p.id = p_partida_id;
  if not found then raise exception 'la partida % no existe', p_partida_id; end if;

  if exists (select 1 from public.obra_actividad where cotizacion_partida_id = p_partida_id) then
    raise exception 'la partida % ya se convirtió. Para agregar frentes se amplía, no se convierte de nuevo', p_partida_id;
  end if;

  -- REGLA 2 · la cantidad se conserva o no genera
  select sum((f->>'cantidad')::numeric) into v_suma from jsonb_array_elements(p_frentes) f;
  if v_part.cantidad is not null and round(coalesce(v_suma, 0), 4) <> round(v_part.cantidad, 4) then
    raise exception 'los frentes suman % y la partida tiene %: la cantidad no se conserva, no se genera nada',
      coalesce(v_suma, 0), v_part.cantidad;
  end if;

  select coalesce(jornada_horas, 8) into v_jornada from public.obra_canonica where id = p_obra_id;
  v_jornada := coalesce(v_jornada, 8);

  if v_part.subcontratada then
    v_hs_un  := null;
    v_metodo := 'cantidad';
  else
    v_hs_un  := v_part.hs_efectivas;
    v_metodo := coalesce(p_metodo, v_part.metodo_medicion,
                         case when p_plantilla_id is not null then 'pasos' else 'cantidad' end);
  end if;

  select id into v_rubro_id from public.obra_actividad
   where obra_id = p_obra_id and tipo = 'resumen' and actividad_padre_id is null
     and nombre = coalesce(v_part.rubro, 'Sin rubro') limit 1;
  if v_rubro_id is null then
    select coalesce(max(orden), 0) + 1 into v_orden from public.obra_actividad where obra_id = p_obra_id;
    insert into public.obra_actividad (obra_id, nombre, tipo, rol_estructura, orden, clave, fuente, creada_en_web)
    values (p_obra_id, coalesce(v_part.rubro, 'Sin rubro'), 'resumen', 'rubro', v_orden,
            'conv:' || p_partida_id || ':rubro', 'conversion_presupuesto', true)
    returning id into v_rubro_id;
  end if;

  select coalesce(sum(peso), 0) into v_peso_tot from public.plantilla_paso where plantilla_id = p_plantilla_id;

  for v_frente in select * from jsonb_array_elements(p_frentes) loop
    v_n_frentes := v_n_frentes + 1;

    v_inicio := nullif(v_frente->>'inicio', '')::date;
    if v_inicio is null then
      raise exception 'el frente «%» no tiene fecha de inicio: sin fecha se crearían actividades que parecen planificadas y no lo están',
        coalesce(v_frente->>'nombre', 'sin nombre');
    end if;
    v_dot  := nullif(v_frente->>'dotacion', '')::int;
    v_tope := nullif(v_frente->>'tope', '')::int;
    if v_dot is not null and v_dot <= 0 then
      raise exception 'el frente «%» declara % personas: una dotación de cero no es una dotación',
        coalesce(v_frente->>'nombre', 'sin nombre'), v_dot;
    end if;
    if v_tope is not null and v_dot is not null and v_dot > v_tope then
      raise exception 'el frente «%» pone % personas sobre un tope de %: arriba del tope, más gente no acorta nada',
        coalesce(v_frente->>'nombre', 'sin nombre'), v_dot, v_tope;
    end if;
    if v_dot is null then v_sin_dot := true; end if;
    v_min_inicio := least(coalesce(v_min_inicio, v_inicio), v_inicio);

    v_hh_partida := case when v_hs_un is null then null
                         else (v_frente->>'cantidad')::numeric * v_hs_un end;

    -- REGLA 1 · obra chica sin burocracia: un frente y sin plantilla → una sola actividad
    if p_plantilla_id is null and jsonb_array_length(p_frentes) = 1 then
      v_dur := case when v_part.subcontratada or v_hh_partida is null or v_dot is null then null
                    else public.duracion_dias(v_hh_partida, v_dot, v_jornada, 0) end;
      v_fin := case when v_dur is null then null
                    else public.sumar_dias_habiles(p_obra_id, v_inicio, v_dur) end;
      select coalesce(max(orden), 0) + 1 into v_orden from public.obra_actividad where obra_id = p_obra_id;
      insert into public.obra_actividad
        (obra_id, nombre, tipo, orden, actividad_padre_id, unidad, cantidad_objetivo, hh_plan,
         metodo_avance, analisis_id, tarea_tipo_id, cotizacion_partida_id, partida_codigo,
         partida_cantidad, inicio_plan, fin_plan, dias_plan, dotacion_prevista, tope_frente,
         clave, fuente, creada_en_web)
      values (p_obra_id, v_part.descripcion, 'tarea', v_orden, v_rubro_id, v_part.unidad,
              (v_frente->>'cantidad')::numeric, v_hh_partida, v_metodo, v_part.analisis_id,
              v_part.tarea_tipo_id, p_partida_id, v_part.codigo, v_part.cantidad,
              v_inicio, v_fin, v_dur, v_dot, v_tope,
              'conv:' || p_partida_id || ':unica', 'conversion_presupuesto', true)
      returning id into v_act_id;
      v_n_act   := v_n_act + 1;
      v_act_ids := v_act_ids || v_act_id;
      v_max_fin := greatest(coalesce(v_max_fin, v_fin), v_fin);
      continue;
    end if;

    select coalesce(max(orden), 0) + 1 into v_orden from public.obra_actividad where obra_id = p_obra_id;
    insert into public.obra_actividad
      (obra_id, nombre, tipo, rol_estructura, orden, actividad_padre_id, unidad, cantidad_objetivo,
       cotizacion_partida_id, partida_codigo, inicio_plan, dotacion_prevista, tope_frente,
       clave, fuente, creada_en_web)
    values (p_obra_id, v_frente->>'nombre', 'resumen', 'frente', v_orden, v_rubro_id, v_part.unidad,
            (v_frente->>'cantidad')::numeric, p_partida_id, v_part.codigo, v_inicio, v_dot, v_tope,
            'conv:' || p_partida_id || ':' || (v_frente->>'nombre'), 'conversion_presupuesto', true)
    returning id into v_frente_id;

    v_prev_id    := null;
    v_cursor     := v_inicio;
    v_ultimo_fin := null;

    if p_plantilla_id is null then
      v_dur := case when v_part.subcontratada or v_hh_partida is null or v_dot is null then null
                    else public.duracion_dias(v_hh_partida, v_dot, v_jornada, 0) end;
      v_fin := case when v_dur is null then null
                    else public.sumar_dias_habiles(p_obra_id, v_inicio, v_dur) end;
      select coalesce(max(orden), 0) + 1 into v_orden from public.obra_actividad where obra_id = p_obra_id;
      insert into public.obra_actividad
        (obra_id, nombre, tipo, orden, actividad_padre_id, unidad, cantidad_objetivo, hh_plan,
         metodo_avance, analisis_id, tarea_tipo_id, cotizacion_partida_id, partida_codigo,
         partida_cantidad, inicio_plan, fin_plan, dias_plan, clave, fuente, creada_en_web)
      values (p_obra_id, v_part.descripcion, 'tarea', v_orden, v_frente_id, v_part.unidad,
              (v_frente->>'cantidad')::numeric, v_hh_partida, v_metodo, v_part.analisis_id,
              v_part.tarea_tipo_id, p_partida_id, v_part.codigo, v_part.cantidad,
              v_inicio, v_fin, v_dur,
              'conv:' || p_partida_id || ':' || (v_frente->>'nombre') || ':act', 'conversion_presupuesto', true)
      returning id into v_act_id;
      v_n_act      := v_n_act + 1;
      v_act_ids    := v_act_ids || v_act_id;
      v_ultimo_fin := v_fin;
    else
      for v_paso in select * from public.plantilla_paso where plantilla_id = p_plantilla_id order by orden loop
        v_hh_paso := case when v_hh_partida is null or v_peso_tot = 0 then null
                          else v_hh_partida * v_paso.peso / v_peso_tot end;

        if v_part.subcontratada then
          v_dur := case when v_paso.tiempo_tecnico then v_paso.dias_tecnicos else null end;
          v_fin := null;
        elsif v_paso.tiempo_tecnico then
          -- DÍAS DE CALENDARIO: curar siete días son siete días, incluidos sábado y domingo.
          v_dur := coalesce(v_paso.dias_tecnicos, 0);
          v_fin := case when v_cursor is null or v_dur < 1 then v_cursor
                        else v_cursor + (ceil(v_dur)::int - 1) end;
        else
          v_dur := case when v_hh_paso is null or v_dot is null then null
                        else public.duracion_dias(v_hh_paso, v_dot, v_jornada, 0) end;
          v_fin := case when v_cursor is null or v_dur is null then null
                        else public.sumar_dias_habiles(p_obra_id, v_cursor, v_dur) end;
        end if;

        select coalesce(max(orden), 0) + 1 into v_orden from public.obra_actividad where obra_id = p_obra_id;
        insert into public.obra_actividad
          (obra_id, nombre, tipo, orden, actividad_padre_id, unidad, cantidad_objetivo, hh_plan,
           metodo_avance, analisis_id, tarea_tipo_id, cotizacion_partida_id, partida_codigo,
           partida_cantidad, dias_plan, tiempo_tecnico, inicio_plan, fin_plan, clave, fuente, creada_en_web)
        values (p_obra_id, v_paso.nombre, 'tarea', v_orden, v_frente_id, v_part.unidad,
                (v_frente->>'cantidad')::numeric,
                v_hh_paso,
                case when v_paso.tiempo_tecnico then 'manual' else v_metodo end,
                v_part.analisis_id, v_part.tarea_tipo_id, p_partida_id, v_part.codigo, v_part.cantidad,
                v_dur,
                -- LO DE LA 5450: el dato ya estaba en la mano y se tiraba. Persistirlo es lo que
                -- permite que la pantalla 08 no comprima un curado al poner más gente.
                v_paso.tiempo_tecnico,
                v_cursor, v_fin,
                'conv:' || p_partida_id || ':' || (v_frente->>'nombre') || ':' || v_paso.orden,
                'conversion_presupuesto', true)
        returning id into v_act_id;
        v_n_act   := v_n_act + 1;
        v_act_ids := v_act_ids || v_act_id;

        if v_prev_id is not null and v_paso.depende_del_anterior then
          insert into public.obra_dependencia (obra_id, origen_id, destino_id, tipo, lag_dias)
          values (p_obra_id, v_prev_id, v_act_id, 'FS', 0);
        end if;
        v_prev_id := v_act_id;

        if v_part.subcontratada then
          v_cursor := v_inicio;
        elsif v_fin is null then
          v_cursor := null;
        else
          v_cursor     := public.sumar_dias_habiles(p_obra_id, v_fin + 1, 1);
          v_ultimo_fin := v_fin;
        end if;
      end loop;
    end if;

    if v_ultimo_fin is not null then
      update public.obra_actividad set fin_plan = v_ultimo_fin where id = v_frente_id;
      v_max_fin := greatest(coalesce(v_max_fin, v_ultimo_fin), v_ultimo_fin);
    end if;
  end loop;

  if v_part.subcontratada then
    insert into public.subcontrato
      (obra_id, nombre, alcance, cantidad, unidad, estado, fecha_inicio_plan, fecha_fin_plan, notas)
    values (p_obra_id, v_part.descripcion, v_part.descripcion, v_part.cantidad, v_part.unidad,
            'previsto', v_min_inicio, v_max_fin,
            'Nació de la conversión de la partida ' || coalesce(v_part.codigo, v_part.descripcion))
    returning id into v_sub_id;

    insert into public.subcontrato_alcance (subcontrato_id, actividad_id, cantidad, unidad)
    select v_sub_id, a.id, a.cantidad_objetivo, a.unidad
      from public.obra_actividad a
     where a.id = any (v_act_ids);

    if v_part.precio_subcontrato is not null and public.ve_economia() then
      perform public.subcontrato_fijar_precio(v_sub_id, v_part.precio_subcontrato);
      v_precio_ok := true;
    end if;
  end if;

  return jsonb_build_object(
    'frentes',      v_n_frentes,
    'actividades',  v_n_act,
    'hh_total',     case when v_hs_un is null then null else round(v_part.cantidad * v_hs_un, 2) end,
    'sin_analisis', (v_hs_un is null and not v_part.subcontratada),
    'metodo',       v_metodo,
    'subcontratada', v_part.subcontratada,
    'subcontrato_id', v_sub_id,
    'paquete_sin_precio', case when v_part.subcontratada then not v_precio_ok end,
    'sin_dotacion', v_sin_dot,
    'fechas',       case
                      when v_part.subcontratada
                        then 'del frente: el plazo del paquete lo fija el contrato, no nuestras HH'
                      when v_sin_dot
                        then 'parciales: sin dotación declarada no hay duración de los pasos de trabajo'
                      else 'completas' end,
    'desde',        v_min_inicio,
    'hasta',        v_max_fin);
end $$;

comment on function public.convertir_partida_a_plan(uuid, text, jsonb, uuid, text) is
  'Convierte una partida del presupuesto en actividades ejecutables CON FECHAS, con la rama del '
  'paquete subcontratado (4600) y persistiendo `tiempo_tecnico` en cada paso (5450). Los dos frentes '
  'reescribían esta función y la última en aplicarse se llevaba puesta a la otra en silencio.';

grant execute on function public.convertir_partida_a_plan(uuid, text, jsonb, uuid, text) to authenticated;

-- ── 3 · el backfill de la 5450, acotado a lo que de verdad es tiempo técnico ──────────────────
-- Su premisa era «dentro de lo que escribe la conversión, SÓLO el paso técnico recibe dias_plan», y
-- la 4600 la vuelve falsa: ahora TODOS los pasos reciben duración porque se calcula la de cada uno.
-- El discriminante que sigue siendo exacto es el método: la conversión pone `manual` únicamente en
-- los pasos técnicos. Sin esto, cada actividad convertida quedaría marcada como no comprimible y la
-- pantalla 08 dejaría de acortar el frente al agregar gente.
update public.obra_actividad
   set tiempo_tecnico = false
 where fuente = 'conversion_presupuesto'
   and tiempo_tecnico
   and metodo_avance is distinct from 'manual';
