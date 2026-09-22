-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- HERRAMIENTAS · VERIFICACIÓN DE USO DE RODADOS Y EQUIPOS (M10 · M13 del diseño)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Antes de salir con un rodado o de arrancar un equipo, el que lo maneja u opera carga el km (u horas)
-- y cuatro respuestas Bien/Mal. Queda una fila en `activo_lectura_uso` y, si algo está «Mal», un
-- reporte en `activo_incidencia` por la MISMA puerta que usa «Reportar un problema»
-- (`reportar_problema_activo`): no hay una segunda forma de cambiar el estado.
--
--   · Un «Mal» en un ítem CRÍTICO deja el activo fuera de servicio (reporte tipo `no_anda`).
--       rodado: frenos y dirección · luces y alarma de retroceso
--       equipo: guardas y protecciones · corte de emergencia · alarma de retroceso
--   · Un «Mal» en un ítem no crítico sólo reporta (tipo `fallando`): no lo saca de servicio.
--   · Si el km u horómetro es MENOR que la última lectura, se rechaza: el odómetro no vuelve atrás.
--     Un salto hacia arriba demasiado grande no se rechaza acá: lo avisa la pantalla y el que carga
--     confirma (la base no puede saber si el camión viajó a Buenos Aires).
--   · Un activo en baja no se verifica. Las herramientas de mano tampoco: sólo rodado y equipo.
--
-- ═══ BASE NORMATIVA: SIN VERIFICAR ═══
-- El diseño cita el Dec. 911/96 (art. 71) y la Res. SRT 960/15 como base de este checklist. Nadie lo
-- verificó contra el texto vigente: el checklist es OPERATIVO DE LA EMPRESA y ninguna pantalla dice que
-- cumple una norma. Tampoco existen en la base la habilitación del operador ni la licencia E.2: no se
-- modelan acá ni se muestran.
--
-- ═══ UNA CORRECCIÓN A `reportar_problema_activo` ═══
-- Hasta hoy un reporte «anda pero falla» sobre un activo FUERA DE SERVICIO lo pasaba a «requiere
-- mantenimiento»: un reporte lo mejoraba. Con la verificación eso sería grave —el chofer marca
-- «Mal» en cubiertas sobre una camioneta que no sale por frenos y la camioneta vuelve a figurar
-- utilizable—, así que un reporte ya no mejora el estado: `fallando` sobre `fuera_servicio` lo deja
-- fuera de servicio. Es el único cambio a esa función; firma, permisos y el resto quedan iguales.
--
-- Mismo contrato que 20260921T2100: RLS con SELECT para `authenticated`, NINGUNA policy de escritura;
-- escribe sólo la función `security definer` con `search_path` fijo. Sin extensiones nuevas.
--
-- NO SE APLICA DESDE UN AGENTE. La aplica el dueño (aplicar-migracion.mjs la envuelve en su transacción).

-- ── LECTURA DE USO ──────────────────────────────────────────────────────────────────────────────
create table public.activo_lectura_uso (
  id                  uuid primary key default gen_random_uuid(),
  activo_id           uuid not null references public.activo(id),
  -- km para un rodado, horas para un equipo. La fija la función según la clase.
  unidad              text not null check (unidad in ('km', 'h')),
  -- null = no se cargó (sin odómetro u horómetro que funcione). Vacío no es cero.
  lectura             numeric(10, 1) check (lectura is null or (lectura >= 0 and lectura < 10000000)),
  -- {"frenos_direccion": "bien", ...}: exactamente los cuatro ítems de la clase, cada uno bien|mal.
  checklist           jsonb not null check (jsonb_typeof(checklist) = 'object'),
  criticos_mal        text[] not null default '{}',
  observacion         text check (observacion is null or length(observacion) <= 400),
  -- Quién lo maneja u opera. null = el mismo usuario que registra.
  operador_persona_id uuid references public.personas(id),
  usuario_id          uuid not null references auth.users(id),
  fecha_hora          timestamptz not null default now(),
  -- El reporte que generó un «Mal» (si hubo) y el estado en que quedó el activo.
  incidencia_id       uuid references public.activo_incidencia(id),
  estado_resultante   text not null
);
create index activo_lectura_uso_activo_idx on public.activo_lectura_uso (activo_id, fecha_hora desc);
create index activo_lectura_uso_fecha_idx on public.activo_lectura_uso (fecha_hora desc);
comment on table public.activo_lectura_uso is
  'Verificación de uso de rodados (km) y equipos (horas): lectura, checklist Bien/Mal y quién opera. Sólo escribe registrar_verificacion_uso(). Checklist operativo de la empresa; base normativa sin verificar.';

alter table public.activo_lectura_uso enable row level security;
create policy activo_lectura_uso_select on public.activo_lectura_uso for select to authenticated using (true);
revoke all on public.activo_lectura_uso from anon, public;
grant select on public.activo_lectura_uso to authenticated;

-- ── LOS ÍTEMS DEL CHECKLIST ─────────────────────────────────────────────────────────────────────
-- Una sola definición en la base. `src/features/herramientas/logica/verificacion.ts` tiene la misma
-- lista para la pantalla y su test lee ESTE bloque para comprobar que no se separen.
create function public._verificacion_items(p_clase text) returns jsonb
language sql immutable set search_path = public as $$
  select case p_clase
    -- ITEMS-VERIFICACION:inicio
    when 'rodado' then '[
      {"clave": "frenos_direccion",           "rotulo": "frenos y dirección",            "critico": true},
      {"clave": "luces_alarma",               "rotulo": "luces y alarma de retroceso",   "critico": true},
      {"clave": "cubiertas_fluidos",          "rotulo": "cubiertas y fluidos",           "critico": false},
      {"clave": "matafuego_auxilio_botiquin", "rotulo": "matafuego, auxilio y botiquín", "critico": false}
    ]'::jsonb
    when 'equipo' then '[
      {"clave": "guardas",              "rotulo": "guardas y protecciones", "critico": true},
      {"clave": "corte_emergencia",     "rotulo": "corte de emergencia",    "critico": true},
      {"clave": "alarma_retroceso",     "rotulo": "alarma de retroceso",    "critico": true},
      {"clave": "combustible_perdidas", "rotulo": "combustible y pérdidas", "critico": false}
    ]'::jsonb
    -- ITEMS-VERIFICACION:fin
    else null end
$$;

-- 148220 → «148.220»; 412.5 → «412,5». Sin depender de lc_numeric del servidor.
create function public._verificacion_numero(p numeric) returns text
language sql immutable set search_path = public as $$
  select replace(to_char(trunc(p), 'FM999,999,990'), ',', '.')
         || case when p <> trunc(p) then ',' || ((p - trunc(p)) * 10)::int::text else '' end
$$;

-- ── UN REPORTE YA NO MEJORA EL ESTADO (ver cabecera) ────────────────────────────────────────────
create or replace function public.reportar_problema_activo(
  p_activo uuid, p_tipo text, p_texto text default null, p_foto_url text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._activo_usuario(); v_act activo%rowtype; v_estado text; v_id uuid;
begin
  select * into v_act from activo where id = p_activo for update;
  if not found then raise exception 'el activo no existe'; end if;
  if v_act.estado = 'baja' then raise exception '% está dado de baja', v_act.codigo; end if;
  v_estado := (case p_tipo
    when 'fallando' then 'requiere_mantenimiento'
    when 'no_anda' then 'fuera_servicio'
    when 'no_encontrada' then v_act.estado
    else null end);
  if v_estado is null then raise exception 'tipo de problema desconocido: %', p_tipo; end if;
  -- Un activo en reparación externa no vuelve a «requiere mantenimiento» porque alguien lo reporte.
  if v_act.estado = 'reparacion_externa' then v_estado := v_act.estado; end if;
  -- Ni uno fuera de servicio: «anda pero falla» no lo vuelve utilizable (20260922T1200).
  if v_act.estado = 'fuera_servicio' then v_estado := v_act.estado; end if;

  insert into activo_incidencia (activo_id, tipo, texto, foto_url, ubicacion_id, estado_resultante, usuario_id)
  values (p_activo, p_tipo, nullif(btrim(p_texto), ''), p_foto_url, v_act.ubicacion_id, v_estado, v_usr)
  returning id into v_id;
  if v_estado <> v_act.estado then
    update activo set estado = v_estado, estado_nota = nullif(btrim(p_texto), ''), estado_desde = now(),
                      estado_por = v_usr, estado_asumido = false
     where id = p_activo;
  end if;
  return v_id;
end $$;

-- ── REGISTRAR UNA VERIFICACIÓN ──────────────────────────────────────────────────────────────────
-- Devuelve {id, incidencia_id, estado_resultante, criticos_mal, no_criticos_mal}.
create function public.registrar_verificacion_uso(
  p_activo uuid, p_lectura numeric, p_checklist jsonb, p_observacion text default null, p_operador uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_usr     uuid := public._activo_usuario();
  v_act     activo%rowtype;
  v_items   jsonb;
  v_claves  text[];
  v_unidad  text;
  v_ult     record;
  v_crit    text[];
  v_otros   text[];
  v_rot_mal text;
  v_obs     text := nullif(btrim(p_observacion), '');
  v_texto   text;
  v_inc     uuid;
  v_estado  text;
  v_id      uuid;
begin
  select * into v_act from activo where id = p_activo for update;
  if not found then raise exception 'el activo no existe'; end if;
  if v_act.estado = 'baja' then raise exception '% está dado de baja: no se verifica', v_act.codigo; end if;
  v_items := public._verificacion_items(v_act.clase);
  if v_items is null then
    raise exception '% es una herramienta: la verificación de uso es para rodados y equipos', v_act.codigo;
  end if;
  v_unidad := case v_act.clase when 'rodado' then 'km' else 'h' end;

  -- El checklist: exactamente los cuatro ítems de la clase, cada uno «bien» o «mal».
  select array_agg(i->>'clave' order by i->>'clave') into v_claves from jsonb_array_elements(v_items) i;
  if p_checklist is null or jsonb_typeof(p_checklist) <> 'object'
     or (select coalesce(array_agg(k order by k), '{}') from jsonb_object_keys(p_checklist) k) <> v_claves then
    raise exception 'faltan respuestas del checklist: son % ítems, cada uno Bien o Mal', array_length(v_claves, 1);
  end if;
  if exists (select 1 from jsonb_each(p_checklist) e where e.value not in ('"bien"'::jsonb, '"mal"'::jsonb)) then
    raise exception 'cada ítem del checklist es Bien o Mal';
  end if;

  if p_lectura is not null and (p_lectura < 0 or p_lectura >= 10000000) then
    raise exception 'la lectura % no es válida', p_lectura;
  end if;
  if p_operador is not null and not exists (select 1 from personas where id = p_operador) then
    raise exception 'la persona que opera no está en el padrón';
  end if;

  -- El odómetro no vuelve atrás. Se compara contra la última lectura cargada (bajo el candado del activo).
  if p_lectura is not null then
    select lectura, fecha_hora into v_ult
      from activo_lectura_uso
     where activo_id = p_activo and lectura is not null
     order by fecha_hora desc limit 1;
    if found and p_lectura < v_ult.lectura then
      raise exception 'el % (%) es menor que la última lectura (% del %): revisá el número',
        case v_unidad when 'km' then 'kilometraje' else 'horómetro' end,
        public._verificacion_numero(p_lectura), public._verificacion_numero(v_ult.lectura),
        to_char(v_ult.fecha_hora at time zone 'America/Argentina/San_Juan', 'DD/MM/YYYY');
    end if;
  end if;

  select coalesce(array_agg(i->>'clave') filter (where (i->>'critico')::boolean), '{}'),
         coalesce(array_agg(i->>'clave') filter (where not (i->>'critico')::boolean), '{}'),
         string_agg(i->>'rotulo', ', ')
    into v_crit, v_otros, v_rot_mal
    from jsonb_array_elements(v_items) i
   where p_checklist->>(i->>'clave') = 'mal';

  -- Un «Mal» se reporta por la misma puerta que «Reportar un problema».
  if v_rot_mal is not null then
    v_texto := left('Verificación de uso: mal en ' || v_rot_mal || coalesce(' · ' || v_obs, ''), 400);
    v_inc := public.reportar_problema_activo(
      p_activo, case when cardinality(v_crit) > 0 then 'no_anda' else 'fallando' end, v_texto, null);
  end if;

  select estado into v_estado from activo where id = p_activo;
  insert into activo_lectura_uso (activo_id, unidad, lectura, checklist, criticos_mal, observacion,
                                  operador_persona_id, usuario_id, incidencia_id, estado_resultante)
  values (p_activo, v_unidad, p_lectura, p_checklist, v_crit, v_obs, p_operador, v_usr, v_inc, v_estado)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'incidencia_id', v_inc, 'estado_resultante', v_estado,
                            'criticos_mal', to_jsonb(v_crit), 'no_criticos_mal', to_jsonb(v_otros));
end $$;

revoke all on function public._verificacion_items(text), public._verificacion_numero(numeric),
  public.registrar_verificacion_uso(uuid, numeric, jsonb, text, uuid) from public, anon;
grant execute on function public.registrar_verificacion_uso(uuid, numeric, jsonb, text, uuid) to authenticated;
-- `reportar_problema_activo` conserva sus permisos: `create or replace` no los toca.

-- ── TIEMPO REAL: la verificación hecha en el teléfono aparece en la oficina sin recargar ─────────
do $do$
declare
  t text;
begin
  foreach t in array array[
    -- TABLAS-CON-AVISO:inicio
    'activo_lectura_uso'
    -- TABLAS-CON-AVISO:fin
  ]
  loop
    execute format('drop trigger if exists zz_avisar_insert on public.%I', t);
    execute format('drop trigger if exists zz_avisar_update on public.%I', t);
    execute format('drop trigger if exists zz_avisar_delete on public.%I', t);
    execute format(
      'create trigger zz_avisar_insert after insert on public.%I referencing new table as nuevas '
      'for each statement execute function public.avisar_cambio_de_tabla()', t);
    execute format(
      'create trigger zz_avisar_update after update on public.%I referencing old table as viejas new table as nuevas '
      'for each statement execute function public.avisar_cambio_de_tabla()', t);
    execute format(
      'create trigger zz_avisar_delete after delete on public.%I referencing old table as viejas '
      'for each statement execute function public.avisar_cambio_de_tabla()', t);
  end loop;
end;
$do$;

notify pgrst, 'reload schema';
