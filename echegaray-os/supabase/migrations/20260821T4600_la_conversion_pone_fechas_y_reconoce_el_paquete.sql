-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA CONVERSIÓN PONE FECHAS Y RECONOCE EL PAQUETE — la isla del cálculo de duración se conecta
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `convertir_partida_a_plan` genera hoy un plan **sin una sola fecha**: `inicio_plan`, `fin_plan`,
-- `inicio_base` y `fin_base` quedan en NULL en todas las actividades que crea. El efecto medido es
-- peor que la ausencia: `obra_avance` sólo cuenta las actividades con `inicio_plan`, así que una
-- obra recién convertida publica «sin actividades medidas» teniendo el plan entero cargado. Se
-- crearon actividades que PARECEN planificadas y no tienen dimensión temporal.
--
-- Y `public.duracion_dias(hh, capacidad, jornada, dias_técnicos)` —la función que convierte HH en
-- plazo, escrita en la misma migración 2600— **no la llama nadie**. Ninguna función, ninguna vista.
-- Es una isla. Acá se conecta: es la conversión la que la usa, con la jornada DE LA OBRA.
--
-- ═══ SIN FECHA DE INICIO NO SE GENERA ═══
--
-- El inicio de cada frente pasa a ser OBLIGATORIO. No hay default razonable: `current_date` haría
-- que un presupuesto adjudicado en marzo y convertido en agosto naciera con cinco meses de atraso
-- inventado, y NULL es lo que estamos corrigiendo. La dotación y el tope siguen siendo opcionales
-- —hay obras que se planifican antes de saber con cuánta gente— y cuando falta la dotación el plan
-- sale CON inicio y SIN fin, y el retorno lo dice con todas las letras. Un plan parcial declarado
-- es un plan; un plan parcial silencioso es una promesa falsa.
--
-- ═══ DÍAS HÁBILES PARA EL TRABAJO, DÍAS DE CALENDARIO PARA EL TIEMPO TÉCNICO ═══
--
-- Curar siete días son siete días: el hormigón no sabe que es sábado. Encofrar cuatro jornadas son
-- cuatro días HÁBILES de esa obra, respetando su semana laboral y el calendario de feriados que ya
-- existe en `calendario_no_laborable` y que hasta hoy sólo consultaba `dias_habiles()` para contar
-- hacia atrás. Son dos aritméticas distintas y mezclarlas corre la fecha de fin de toda la obra.
--
-- ═══ UNA PARTIDA SUBCONTRATADA NO ES TRABAJO PROPIO ═══
--
-- Hasta hoy NINGUNA rama de la conversión miraba `subcontratada`: un paquete de $5.000.000 se
-- convertía en actividades con HH propias repartidas por peso —HH que nadie va a trabajar y que
-- inflaban el plan— y no creaba ni el paquete ni su alcance. Ahora: `hh_plan` en NULL (no es
-- ejecución nuestra), medición por cantidad, y nace el `subcontrato` con su `subcontrato_alcance`
-- sobre las actividades creadas. El precio entra por `subcontrato_fijar_precio`, que es la única
-- puerta que existe desde la 3400/5400 — y si el que convierte no ve economía, el paquete queda sin
-- precio y el retorno lo avisa en vez de dejar un cero.

-- ── 1 · avanzar N días hábiles desde una fecha ────────────────────────────────────────────────
-- `dias_habiles(obra, desde, hasta)` cuenta hacia atrás: dadas dos fechas, cuántas se trabajan.
-- Falta la operación inversa, que es la que necesita un cronograma: dada una fecha y una duración,
-- en qué fecha termina. Se apoya en la primera para no tener dos definiciones de «día hábil».
create or replace function public.sumar_dias_habiles(p_obra_id text, p_desde date, p_dias numeric)
returns date language plpgsql stable as $$
declare d date := p_desde; restantes int; guarda int := 0;
begin
  if p_desde is null or p_dias is null then return null; end if;
  -- El primer día hábil CUENTA: una tarea de un día empieza y termina el mismo día.
  restantes := greatest(ceil(p_dias)::int, 1);
  loop
    guarda := guarda + 1;
    if guarda > 3650 then
      raise exception 'una duración de % días no cierra en diez años desde % en la obra %: revisá el calendario de la obra',
        p_dias, p_desde, p_obra_id;
    end if;
    if public.dias_habiles(p_obra_id, d, d) = 1 then
      restantes := restantes - 1;
      exit when restantes = 0;
    end if;
    d := d + 1;
  end loop;
  return d;
end $$;

comment on function public.sumar_dias_habiles(text, date, numeric) is
  'La inversa de dias_habiles(): dada una fecha y una duración en días de trabajo, en qué fecha '
  'termina, respetando la semana laboral de la obra y el calendario de no laborables. Se apoya en '
  'dias_habiles() a propósito: dos definiciones distintas de «día hábil» darían dos cronogramas.';

grant execute on function public.sumar_dias_habiles(text, date, numeric) to authenticated;

-- ── 2 · un paquete PREVISTO todavía no tiene contratista ──────────────────────────────────────
-- El CHECK original exigía proveedor desde el minuto cero. Un paquete que nace de la conversión del
-- presupuesto todavía no se adjudicó: exigirle un proveedor obligaría a tipear «a definir», que es
-- fabricar un dato. La exigencia se corre al momento en que sí es cierta: contratado en adelante.
alter table public.subcontrato drop constraint if exists subcontrato_proveedor_dicho;
alter table public.subcontrato add constraint subcontrato_proveedor_dicho
  check (estado = 'previsto' or proveedor_id is not null or proveedor_texto is not null);

comment on constraint subcontrato_proveedor_dicho on public.subcontrato is
  'El contratista es obligatorio desde `contratado` en adelante. En `previsto` no: un paquete que '
  'nace de la conversión del presupuesto todavía no se adjudicó, y forzar un «a definir» sería '
  'inventar un proveedor para que cierre una regla.';

-- ── 3 · la conversión, con fechas y con el paquete ────────────────────────────────────────────
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

  -- `p.*` ya trae una columna `hs_unitarias` (la congelada). Si acá se seleccionara `ac.hs_unitarias`
  -- con el mismo nombre, el record se quedaría con la PRIMERA y el rendimiento del análisis nunca
  -- llegaría. Por eso el alias, y por eso la congelada gana: si el presupuesto salió, manda lo
  -- que se cotizó.
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

  -- UN PAQUETE NO CONSUME HORAS NUESTRAS. Cero HH sería tan falso como repartir las del análisis:
  -- NULL es «no aplica», que es lo que corresponde.
  if v_part.subcontratada then
    v_hs_un  := null;
    v_metodo := 'cantidad';
  else
    v_hs_un  := v_part.hs_efectivas;
    v_metodo := coalesce(p_metodo, v_part.metodo_medicion,
                         case when p_plantilla_id is not null then 'pasos' else 'cantidad' end);
  end if;

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

    -- SIN FECHA NO SE GENERA. Es la regla que impide crear actividades que parecen planificadas.
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

    -- el frente es un contenedor, y es DEL FRENTE la dotación y el tope
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
      -- varios frentes, sin plantilla: una actividad por frente
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
        -- SIN redondear: repartir 3,24 HH en pasos de 10/30/25/25/10 y redondear cada uno a dos
        -- decimales perdía 0,02 HH por frente. Poco, y por eso peor: una fuga que no grita.
        v_hh_paso := case when v_hh_partida is null or v_peso_tot = 0 then null
                          else v_hh_partida * v_paso.peso / v_peso_tot end;

        if v_part.subcontratada then
          -- El plazo del paquete lo fija el contrato, no nuestras HH. Todas sus actividades
          -- arrancan con el frente y no se les inventa un fin.
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
           partida_cantidad, dias_plan, inicio_plan, fin_plan, clave, fuente, creada_en_web)
        values (p_obra_id, v_paso.nombre, 'tarea', v_orden, v_frente_id, v_part.unidad,
                (v_frente->>'cantidad')::numeric,
                v_hh_paso,
                case when v_paso.tiempo_tecnico then 'manual' else v_metodo end,
                v_part.analisis_id, v_part.tarea_tipo_id, p_partida_id, v_part.codigo, v_part.cantidad,
                v_dur, v_cursor, v_fin,
                'conv:' || p_partida_id || ':' || (v_frente->>'nombre') || ':' || v_paso.orden,
                'conversion_presupuesto', true)
        returning id into v_act_id;
        v_n_act   := v_n_act + 1;
        v_act_ids := v_act_ids || v_act_id;

        -- REGLA · dentro del frente la secuencia es estricta; entre frentes no se siembra nada
        if v_prev_id is not null and v_paso.depende_del_anterior then
          insert into public.obra_dependencia (obra_id, origen_id, destino_id, tipo, lag_dias)
          values (p_obra_id, v_prev_id, v_act_id, 'FS', 0);
        end if;
        v_prev_id := v_act_id;

        -- El cursor avanza al siguiente día HÁBIL después del fin. Si el paso no tiene fin —sin
        -- dotación no hay duración— la cadena se corta ahí y los pasos que siguen quedan sin fecha:
        -- inventarles una sería exactamente lo que esta migración vino a arreglar.
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

  -- ── el paquete subcontratado ────────────────────────────────────────────────────────────────
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

    -- EL PRECIO ENTRA POR LA ÚNICA PUERTA QUE HAY. `precio_contratado` está revocado por GRANT de
    -- columna desde la 3400: un INSERT directo fallaría, y a propósito.
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
  'Convierte una partida del presupuesto en actividades ejecutables CON FECHAS. Cada frente exige '
  'inicio; la dotación y el tope son opcionales y sin dotación el plan sale con inicio y sin fin, '
  'declarado en el retorno. El trabajo se mide en días hábiles de la obra y el tiempo técnico en '
  'días de calendario — curar siete días son siete días. Una partida subcontratada crea el paquete '
  'y su alcance, con hh_plan en NULL: no es ejecución nuestra.';

grant execute on function public.convertir_partida_a_plan(uuid, text, jsonb, uuid, text) to authenticated;
