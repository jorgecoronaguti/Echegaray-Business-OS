-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA CONVERSIÓN: UNA PARTIDA ECONÓMICA SE VUELVE UN PLAN QUE SE PUEDE EJECUTAR
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- «El presupuesto NO es el plan de obra.» Son dos estructuras conectadas y ninguna manda sobre la
-- otra: la económica ordena por contabilidad (rubro → partida → análisis) y la operativa por
-- secuencia constructiva (obra → frente → actividad → paso). **El ID de la partida no ordena la
-- obra.** Lo único que las une es que cada actividad guarda de qué partida y de qué análisis salió,
-- y por eso el avance físico y el costo consumido son la misma verdad leída de dos maneras.
--
-- La conversión pasa UNA VEZ, al adjudicar, y tiene cuatro reglas que son del modelo y no del
-- formulario:
--
--   1. **Obra chica sin burocracia.** Un frente y sin plantilla → la partida queda como UNA
--      actividad. Nadie está obligado a desglosar 80 m³ en veinte pasos si no le sirve.
--   2. **La cantidad se conserva o no genera.** Σ frentes tiene que dar la cantidad de la partida.
--      Es un control de la función, no un aviso de pantalla: la misma llamada entra por la web y
--      mañana por el chat.
--   3. **Ampliable.** Se agregan frentes después; lo ya ejecutado no se toca, se reparte el resto.
--   4. **Partida sin análisis se convierte igual**, sin HH y sin plazo, marcada como deuda de
--      carga. `hh_plan` queda en NULL, que es «sin cargar» — **nunca 0**, porque 0 HH previstas
--      significa que la tarea no lleva trabajo y eso es mentira.
--
-- Las plantillas de secuencia NO son universales: cada tipología define la suya. Arrancan tres,
-- las del contrato, y se editan como datos.

-- ── 1 · las plantillas de secuencia ───────────────────────────────────────────────────────────
create table if not exists public.plantilla_secuencia (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null unique,
  descripcion  text,
  se_repite_por text[],
  activa       boolean not null default true,
  creado_en    timestamptz not null default now()
);

create table if not exists public.plantilla_paso (
  id             uuid primary key default gen_random_uuid(),
  plantilla_id   uuid not null references public.plantilla_secuencia (id) on delete cascade,
  orden          int  not null,
  nombre         text not null,
  peso           numeric not null check (peso > 0),
  tiempo_tecnico boolean not null default false,
  dias_tecnicos  numeric check (dias_tecnicos is null or dias_tecnicos >= 0),
  depende_del_anterior boolean not null default true,
  constraint plantilla_paso_orden_unico unique (plantilla_id, orden)
);

comment on column public.plantilla_paso.depende_del_anterior is
  'Al convertir se siembra una dependencia fin-comienzo con el paso anterior DEL MISMO FRENTE. '
  'Entre frentes no se siembra nada: ahí la superposición es real y es justamente lo que permite '
  'que el frente B esté en armadura mientras el A está en curado.';

insert into public.plantilla_secuencia (nombre, descripcion, se_repite_por) values
  ('Hormigón vertical',   'Columnas, tabiques y muros de hormigón armado', array['Eje','Sector','Planta','Tramo','Frente','Elemento']),
  ('Hormigón horizontal', 'Losas, vigas y platea',                          array['Sector','Planta','Tramo','Frente','Elemento']),
  ('Mampostería',         'Muros de ladrillo o bloque',                     array['Sector','Planta','Frente','Elemento'])
on conflict (nombre) do nothing;

insert into public.plantilla_paso (plantilla_id, orden, nombre, peso, tiempo_tecnico, dias_tecnicos)
select p.id, v.orden, v.nombre, v.peso, v.tec, v.dias
  from public.plantilla_secuencia p
  join (values
    ('Hormigón vertical', 1, 'Replanteo',    10, false, null::numeric),
    ('Hormigón vertical', 2, 'Armadura',     30, false, null),
    ('Hormigón vertical', 3, 'Encofrado',    25, false, null),
    ('Hormigón vertical', 4, 'Hormigonado',  25, false, null),
    ('Hormigón vertical', 5, 'Curado y desencofrado', 10, true, 7),
    ('Hormigón horizontal', 1, 'Replanteo',   8, false, null),
    ('Hormigón horizontal', 2, 'Encofrado',  30, false, null),
    ('Hormigón horizontal', 3, 'Armadura',   27, false, null),
    ('Hormigón horizontal', 4, 'Hormigonado',25, false, null),
    ('Hormigón horizontal', 5, 'Curado y desencofrado', 10, true, 7),
    ('Mampostería', 1, 'Replanteo y arranque', 15, false, null),
    ('Mampostería', 2, 'Elevación',            70, false, null),
    ('Mampostería', 3, 'Encadenado y remate',  15, false, null)
  ) as v(plantilla, orden, nombre, peso, tec, dias) on v.plantilla = p.nombre
on conflict (plantilla_id, orden) do nothing;

-- ── 2 · cuánto dura de verdad ─────────────────────────────────────────────────────────────────
create or replace function public.duracion_dias(
  p_hh numeric, p_capacidad numeric, p_jornada numeric default 8, p_dias_tecnicos numeric default 0)
returns numeric language sql immutable as $$
  select case
           when p_hh is null then null
           when coalesce(p_capacidad, 0) <= 0 then null
           else ceil(p_hh / (p_capacidad * coalesce(nullif(p_jornada, 0), 8))) + coalesce(p_dias_tecnicos, 0)
         end;
$$;

comment on function public.duracion_dias(numeric, numeric, numeric, numeric) is
  'HH ÷ (capacidad ponderada × jornada), más los días técnicos que no se comprimen. Devuelve NULL '
  'si no hay HH o no hay nadie asignado: «sin plan», nunca 0 días. Los días técnicos se SUMAN '
  'aparte a propósito — curar siete días son siete días haya una persona o veinte.';

create or replace function public.dotacion_necesaria(
  p_hh numeric, p_dias numeric, p_jornada numeric default 8, p_tope int default null)
returns numeric language sql immutable as $$
  select case
           when p_hh is null or coalesce(p_dias, 0) <= 0 then null
           when p_tope is not null and ceil(p_hh / (p_dias * coalesce(nullif(p_jornada, 0), 8))) > p_tope then null
           else ceil(p_hh / (p_dias * coalesce(nullif(p_jornada, 0), 8)))
         end;
$$;

comment on function public.dotacion_necesaria(numeric, numeric, numeric, int) is
  'El cálculo al revés: cuánta capacidad hace falta para terminar en N días. Devuelve NULL cuando '
  'la respuesta es «no alcanza» por el tope del frente — y NULL se dibuja como «no alcanza», no '
  'como cero personas. Prometer una fecha que el tope impide es peor que decir que no se puede.';

-- ── 3 · la conversión ─────────────────────────────────────────────────────────────────────────
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
           partida_cantidad, dias_plan, clave, fuente, creada_en_web)
        values (p_obra_id, v_paso.nombre, 'tarea', v_orden, v_frente_id, v_part.unidad,
                (v_frente->>'cantidad')::numeric,
                -- SIN redondear: repartir 3,24 HH en pasos de 10/30/25/25/10 y redondear cada uno a
                -- dos decimales perdía 0,02 HH por frente. Poco, y por eso peor: una fuga que no
                -- grita. El número se redondea al mostrarlo, no al guardarlo.
                case when v_hh_partida is null or v_peso_tot = 0 then null
                     else v_hh_partida * v_paso.peso / v_peso_tot end,
                case when v_paso.tiempo_tecnico then 'manual' else v_metodo end,
                v_part.analisis_id, v_part.tarea_tipo_id, p_partida_id, v_part.codigo, v_part.cantidad,
                v_paso.dias_tecnicos,
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
  'acá y no en el formulario porque la misma llamada entra por la web y por el chat.';

grant execute on function public.convertir_partida_a_plan(uuid, text, jsonb, uuid, text) to authenticated;
grant execute on function public.duracion_dias(numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.dotacion_necesaria(numeric, numeric, numeric, int) to authenticated;

-- ── 4 · el aprendizaje vuelve a la base maestra ───────────────────────────────────────────────
create table if not exists public.rendimiento_historico (
  id               uuid primary key default gen_random_uuid(),
  tarea_tipo_id    uuid references public.tarea_tipo (id) on delete set null,
  analisis_id      uuid references public.analisis (id) on delete set null,
  obra_id          text references public.obra_canonica (id) on delete set null,
  actividad_id     uuid references public.obra_actividad (id) on delete set null,
  unidad           text,
  cantidad         numeric not null check (cantidad > 0),
  hh_reales        numeric not null check (hh_reales >= 0),
  hs_unitarias     numeric generated always as (hh_reales / nullif(cantidad, 0)) stored,
  cuadrilla_id     uuid references public.cuadrilla (id) on delete set null,
  composicion      jsonb,
  condiciones      text,
  fecha_desde      date,
  fecha_hasta      date,
  fuente           text not null default 'obra',
  creado_en        timestamptz not null default now(),
  creado_por       uuid default auth.uid()
);

create index if not exists rendimiento_historico_tarea_idx on public.rendimiento_historico (tarea_tipo_id);

comment on column public.rendimiento_historico.hs_unitarias is
  'El rendimiento observado, calculado y no tipeado. Es lo que se compara contra el hs/unidad del '
  'análisis para saber si cotizamos bien.';

create or replace view public.rendimiento_recomendado with (security_invoker = true) as
select t.id                                          as tarea_tipo_id,
       t.codigo, t.nombre, t.unidad,
       ac.hs_unitarias                               as hs_analisis,
       count(r.id)::int                              as muestra,
       count(distinct r.obra_id)::int                as obras,
       round(avg(r.hs_unitarias), 3)                 as hs_observado_promedio,
       round(percentile_cont(0.5) within group (order by r.hs_unitarias)::numeric, 3) as hs_observado_mediana,
       round(stddev_samp(r.hs_unitarias), 3)         as dispersion,
       case
         when count(distinct r.obra_id) < 2 then null
         else round(percentile_cont(0.5) within group (order by r.hs_unitarias)::numeric, 3)
       end                                           as hs_recomendado,
       case
         when count(r.id) = 0                  then 'sin dato'
         when count(distinct r.obra_id) < 2    then 'muestra chica: es un dato, no una recomendación'
         else 'con evidencia de ' || count(distinct r.obra_id) || ' obras'
       end                                           as lectura
  from public.tarea_tipo t
  left join public.analisis a  on a.tarea_tipo_id = t.id and a.vigente
  left join public.analisis_costo ac on ac.analisis_id = a.id
  left join public.rendimiento_historico r on r.tarea_tipo_id = t.id
 group by t.id, t.codigo, t.nombre, t.unidad, ac.hs_unitarias;

comment on view public.rendimiento_recomendado is
  'Teórico → real → recomendado. Con UNA sola obra medida NO hay recomendación: hay un dato, y se '
  'dice así. La recomendación no se aplica sola nunca — se acepta a mano y crea una versión nueva '
  'del análisis, con autor, fecha y muestra.';

alter table public.rendimiento_historico enable row level security;
drop policy if exists rendimiento_lee on public.rendimiento_historico;
create policy rendimiento_lee on public.rendimiento_historico for select to authenticated using (true);
drop policy if exists rendimiento_escribe on public.rendimiento_historico;
create policy rendimiento_escribe on public.rendimiento_historico for all to authenticated
  using (public.es_administracion()) with check (public.es_administracion());

alter table public.plantilla_secuencia enable row level security;
alter table public.plantilla_paso      enable row level security;
drop policy if exists plantilla_lee on public.plantilla_secuencia;
create policy plantilla_lee on public.plantilla_secuencia for select to authenticated using (true);
drop policy if exists plantilla_escribe on public.plantilla_secuencia;
create policy plantilla_escribe on public.plantilla_secuencia for all to authenticated
  using (public.es_administracion()) with check (public.es_administracion());
drop policy if exists plantilla_paso_lee on public.plantilla_paso;
create policy plantilla_paso_lee on public.plantilla_paso for select to authenticated using (true);
drop policy if exists plantilla_paso_escribe on public.plantilla_paso;
create policy plantilla_paso_escribe on public.plantilla_paso for all to authenticated
  using (public.es_administracion()) with check (public.es_administracion());

grant select, insert, update, delete on public.plantilla_secuencia, public.plantilla_paso,
      public.rendimiento_historico to authenticated;
grant all on public.plantilla_secuencia, public.plantilla_paso, public.rendimiento_historico to service_role;
grant select on public.rendimiento_recomendado to authenticated;
grant select on public.rendimiento_recomendado to service_role;
