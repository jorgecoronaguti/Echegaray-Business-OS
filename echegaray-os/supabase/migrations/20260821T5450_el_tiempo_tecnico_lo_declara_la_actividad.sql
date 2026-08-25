-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL TIEMPO TÉCNICO LO DECLARA LA ACTIVIDAD — CURAR SIETE DÍAS SON SIETE DÍAS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `public.duracion_dias(hh, capacidad, jornada, dias_tecnicos)` suma los días técnicos aparte desde
-- el día uno, y el puerto de TypeScript también. Pero la pantalla 08 —la que contesta «con esta
-- gente, ¿cuándo termino?»— nunca tenía cómo saber CUÁL de las actividades del frente es un tiempo
-- técnico, así que las comprimía todas: ponerle el doble de gente a un frente de hormigón contestaba
-- que el curado también tardaba la mitad.
--
-- ═══ POR QUÉ UNA COLUMNA Y NO UNA DEDUCCIÓN ═══
--
-- El dato existe: `plantilla_paso.tiempo_tecnico` lo declara, y `convertir_partida_a_plan` lo LEE
-- —lo usa para elegir `metodo_avance`— y después lo tira. Persistirlo es recuperar información que
-- ya estaba en la mano, no inventarla.
--
-- La alternativa era deducirlo: «tiene dias_plan y se mide manual». Medido contra la base: `manual`
-- es el DEFAULT de la columna y las 344 actividades traídas del tracker tienen días de plan. Con esa
-- regla, los días de plan de la obra entera se habrían sumado como días que no se comprimen y todos
-- los frentes habrían quedado inflados — un defecto peor que el que se está arreglando.
--
-- ═══ EL BACKFILL ES EXACTO, NO UNA APROXIMACIÓN ═══
--
-- Dentro de lo que escribe la conversión, SÓLO el paso técnico recibe `dias_plan`: los demás pasos
-- se insertan con `v_paso.dias_tecnicos`, que es NULL para ellos. Por eso el update de abajo va
-- acotado a `fuente = 'conversion_presupuesto'` — fuera de ese origen la misma condición no
-- identificaría nada, y por eso no se aplica fuera.
--
-- `obra_actividad` concede permisos a nivel de TABLA (`modulo_01_grants`), así que la columna nueva
-- nace con SELECT y UPDATE. Lo que sí hace falta es publicarla en la vista de control: la web lee de
-- ahí, y una columna que la vista no publica llega vacía sin un solo error.

-- ── 1 · la columna ────────────────────────────────────────────────────────────────────────────
alter table public.obra_actividad
  add column if not exists tiempo_tecnico boolean not null default false;

comment on column public.obra_actividad.tiempo_tecnico is
  'Marca lo que NO se comprime con más gente: curado, fraguado, secado. Sus dias_plan son días '
  'fijos y no entran en la división HH ÷ capacidad — por eso la 08 los suma aparte en vez de '
  'repartirlos entre la cuadrilla. Lo declara la plantilla del paso; no se deduce de la fila.';

-- ── 2 · lo ya convertido ──────────────────────────────────────────────────────────────────────
update public.obra_actividad
   set tiempo_tecnico = true
 where fuente = 'conversion_presupuesto'
   and dias_plan is not null
   and dias_plan > 0
   and tiempo_tecnico = false;

-- ── 3 · la conversión deja de tirar el dato ───────────────────────────────────────────────────
create or replace function public.convertir_partida_a_plan(
  p_partida_id   uuid,
  p_obra_id      text,
  p_frentes      jsonb,                -- [{"nombre":"Eje 1-4","cantidad":1.08}, ...]
  p_plantilla_id uuid default null,
  p_metodo       text default null
) returns jsonb language plpgsql security invoker as $$
declare
  v_part      record;
  v_hs_un     numeric;
  v_suma      numeric;
  v_rubro_id  uuid;
  v_frente_id uuid;
  v_prev_id   uuid;
  v_act_id    uuid;
  v_peso_tot  numeric;
  v_frente    jsonb;
  v_paso      record;
  v_metodo    text;
  v_n_act     int := 0;
  v_n_frentes int := 0;
  v_orden     int;
  v_hh_partida numeric;
begin
  if not public.es_administracion() then
    raise exception 'convertir un presupuesto en plan de obra exige permiso de administración';
  end if;

  -- `p.*` ya trae una columna `hs_unitarias` (la congelada). Si acá se seleccionara `ac.hs_unitarias`
  -- con el mismo nombre, el record se quedaría con la PRIMERA y el rendimiento del análisis nunca
  -- llegaría: la conversión generaría todo sin HH y diría «sin análisis» teniendo uno. Por eso el
  -- alias, y por eso la congelada gana: si el presupuesto ya salió, manda lo que se cotizó.
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

  v_hs_un  := v_part.hs_efectivas;   -- NULL si la partida no tiene análisis: queda sin HH, no en 0
  v_metodo := coalesce(p_metodo, v_part.metodo_medicion,
                       case when p_plantilla_id is not null then 'pasos' else 'cantidad' end);

  -- el contenedor del rubro, reutilizado si ya existe
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
    v_hh_partida := case when v_hs_un is null then null
                         else (v_frente->>'cantidad')::numeric * v_hs_un end;

    -- REGLA 1 · obra chica sin burocracia: un frente y sin plantilla → una sola actividad
    if p_plantilla_id is null and jsonb_array_length(p_frentes) = 1 then
      select coalesce(max(orden), 0) + 1 into v_orden from public.obra_actividad where obra_id = p_obra_id;
      insert into public.obra_actividad
        (obra_id, nombre, tipo, orden, actividad_padre_id, unidad, cantidad_objetivo, hh_plan,
         metodo_avance, analisis_id, tarea_tipo_id, cotizacion_partida_id, partida_codigo,
         partida_cantidad, clave, fuente, creada_en_web)
      values (p_obra_id, v_part.descripcion, 'tarea', v_orden, v_rubro_id, v_part.unidad,
              (v_frente->>'cantidad')::numeric, v_hh_partida, v_metodo, v_part.analisis_id,
              v_part.tarea_tipo_id, p_partida_id, v_part.codigo, v_part.cantidad,
              'conv:' || p_partida_id || ':unica', 'conversion_presupuesto', true);
      v_n_act := v_n_act + 1;
      continue;
    end if;

    -- el frente es un contenedor
    select coalesce(max(orden), 0) + 1 into v_orden from public.obra_actividad where obra_id = p_obra_id;
    insert into public.obra_actividad
      (obra_id, nombre, tipo, rol_estructura, orden, actividad_padre_id, unidad, cantidad_objetivo,
       cotizacion_partida_id, partida_codigo, clave, fuente, creada_en_web)
    values (p_obra_id, v_frente->>'nombre', 'resumen', 'frente', v_orden, v_rubro_id, v_part.unidad,
            (v_frente->>'cantidad')::numeric, p_partida_id, v_part.codigo,
            'conv:' || p_partida_id || ':' || (v_frente->>'nombre'), 'conversion_presupuesto', true)
    returning id into v_frente_id;

    v_prev_id := null;

    if p_plantilla_id is null then
      -- varios frentes, sin plantilla: una actividad por frente
      select coalesce(max(orden), 0) + 1 into v_orden from public.obra_actividad where obra_id = p_obra_id;
      insert into public.obra_actividad
        (obra_id, nombre, tipo, orden, actividad_padre_id, unidad, cantidad_objetivo, hh_plan,
         metodo_avance, analisis_id, tarea_tipo_id, cotizacion_partida_id, partida_codigo,
         partida_cantidad, clave, fuente, creada_en_web)
      values (p_obra_id, v_part.descripcion, 'tarea', v_orden, v_frente_id, v_part.unidad,
              (v_frente->>'cantidad')::numeric, v_hh_partida, v_metodo, v_part.analisis_id,
              v_part.tarea_tipo_id, p_partida_id, v_part.codigo, v_part.cantidad,
              'conv:' || p_partida_id || ':' || (v_frente->>'nombre') || ':act', 'conversion_presupuesto', true);
      v_n_act := v_n_act + 1;
    else
      for v_paso in select * from public.plantilla_paso where plantilla_id = p_plantilla_id order by orden loop
        select coalesce(max(orden), 0) + 1 into v_orden from public.obra_actividad where obra_id = p_obra_id;
        insert into public.obra_actividad
          (obra_id, nombre, tipo, orden, actividad_padre_id, unidad, cantidad_objetivo, hh_plan,
           metodo_avance, analisis_id, tarea_tipo_id, cotizacion_partida_id, partida_codigo,
           partida_cantidad, dias_plan, tiempo_tecnico, clave, fuente, creada_en_web)
        values (p_obra_id, v_paso.nombre, 'tarea', v_orden, v_frente_id, v_part.unidad,
                (v_frente->>'cantidad')::numeric,
                -- SIN redondear: repartir 3,24 HH en pasos de 10/30/25/25/10 y redondear cada uno a
                -- dos decimales perdía 0,02 HH por frente. Poco, y por eso peor: una fuga que no
                -- grita. El número se redondea al mostrarlo, no al guardarlo.
                case when v_hh_partida is null or v_peso_tot = 0 then null
                     else v_hh_partida * v_paso.peso / v_peso_tot end,
                case when v_paso.tiempo_tecnico then 'manual' else v_metodo end,
                v_part.analisis_id, v_part.tarea_tipo_id, p_partida_id, v_part.codigo, v_part.cantidad,
                v_paso.dias_tecnicos, v_paso.tiempo_tecnico,
                'conv:' || p_partida_id || ':' || (v_frente->>'nombre') || ':' || v_paso.orden,
                'conversion_presupuesto', true)
        returning id into v_act_id;
        v_n_act := v_n_act + 1;

        -- REGLA · dentro del frente la secuencia es estricta; entre frentes no se siembra nada
        if v_prev_id is not null and v_paso.depende_del_anterior then
          insert into public.obra_dependencia (obra_id, origen_id, destino_id, tipo, lag_dias)
          values (p_obra_id, v_prev_id, v_act_id, 'FS', 0);
        end if;
        v_prev_id := v_act_id;
      end loop;
    end if;
  end loop;

  return jsonb_build_object(
    'frentes', v_n_frentes,
    'actividades', v_n_act,
    'hh_total', case when v_hs_un is null then null else round(v_part.cantidad * v_hs_un, 2) end,
    'sin_analisis', v_hs_un is null,
    'metodo', v_metodo);
end $$;

comment on function public.convertir_partida_a_plan(uuid, text, jsonb, uuid, text) is
  'Convierte una partida del presupuesto en actividades ejecutables. Si los frentes no suman la '
  'cantidad de la partida, no genera NADA y lo dice: es la regla «la cantidad se conserva», y vive '
  'acá y no en el formulario porque la misma llamada entra por la web y por el chat. El paso que la '
  'plantilla declara tiempo_tecnico queda marcado como tal en la actividad: sus días son fijos.';

-- ── 4 · la vista publica la columna nueva ─────────────────────────────────────────────────────
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
        CASE
            WHEN e.cantidad_ejecutada > 0::numeric AND h.hh_real > 0::numeric THEN round(e.cantidad_ejecutada / h.hh_real, 3)
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
    -- Al FINAL a propósito: CREATE OR REPLACE VIEW no puede insertar columnas en el medio
    -- (falló en vivo con «cannot change name of view column "dias_real" to "tiempo_tecnico"»).
    a.tiempo_tecnico
   FROM obra_actividad a
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

grant select on public.obra_actividad_control to authenticated;
grant select on public.obra_actividad_control to service_role;
