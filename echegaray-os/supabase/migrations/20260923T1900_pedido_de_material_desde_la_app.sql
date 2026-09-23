-- PEDIR MATERIAL DESDE LA APP — un solo módulo «Material» en las dos caras (dueño, 23/09/2026).
--
-- Textual: «no hay módulo Material hecho en experiencia de computadora, te dije que estás mezclando
-- cosas y estás haciendo cosas distintas en mobile que en computadora». Hasta hoy la tarjeta
-- «Material» del teléfono abría la pantalla de escritorio de Integraciones, que era el espejo del
-- AppSheet y se cargaba en el AppSheet. Desde hoy el pedido se carga ACÁ, en `pedidos_materiales`,
-- con `origen = 'app'`, y se lee igual en `/campo/material` (teléfono) y `/herramientas/material`
-- (computadora).
--
-- ═══ LA MISMA TABLA, NO UNA SEGUNDA ═══
--
-- `pedidos_materiales` ya es el espejo del Sheet (`origen = 'appsheet_sheet'`) y lo que se decidió en el
-- OS (`origen = 'os'`). Un pedido de la app es una tercera procedencia de la MISMA cosa: separarlo en
-- otra tabla haría que la solapa Pedidos de la obra y la señal de `/campo` tuvieran que leer dos
-- fuentes y sumar. Lo que falta se agrega como columnas:
--
--   · `obra_canonica_id`  la obra por su id del índice (`obra_canonica`), sin pasar por el diccionario
--                         de alias. El Sheet sólo trae `obra_texto`; la app conoce la obra.
--   · `pedido_grupo`      un «Pedir material» con varios ítems es UN pedido: cada ítem es una fila
--                         (igual que el Sheet, una fila por material) y el grupo las junta.
--   · `unidad`, `urgencia`, `nota`  lo que el formulario pregunta y el Sheet no tenía.
--
-- ═══ EL SYNC DEL SHEET NO TOCA LO QUE NO ES SUYO ═══
--
-- `sync-pedidos-materiales.mjs` hace `insert … on conflict (id_pedido) do update … where origen =
-- 'appsheet_sheet'` y no borra nada. Un pedido de la app lleva `id_pedido = 'APP-…'` (el Sheet usa
-- números y hashes cortos) y `origen = 'app'`: ni colisiona ni lo pisa. El test
-- `orquestador/lib/pedidos-materiales-sync.test.mjs` afirma las dos cosas sobre el SQL del sync.
--
-- ═══ QUIÉN PUEDE ═══
--
-- Pedir: quien VE la obra (`ve_obra`): jefe de obra, Administración, Dirección, y el empleado asignado
-- a ella hoy —el pie de `/campo` ya le ofrecía «Pedir material». Cambiar el estado: Administración
-- (`es_administracion()`, que incluye al jefe de obra: «Jefe = Administración»). Las políticas de
-- lectura y escritura pasan a aceptar la obra por su id además de por el texto.

alter table public.pedidos_materiales
  add column if not exists obra_canonica_id text references public.obra_canonica(id),
  add column if not exists pedido_grupo uuid,
  add column if not exists unidad text,
  add column if not exists urgencia text,
  add column if not exists nota text;

alter table public.pedidos_materiales drop constraint if exists pedidos_materiales_urgencia_check;
alter table public.pedidos_materiales add constraint pedidos_materiales_urgencia_check
  check (urgencia is null or urgencia in ('hoy', 'semana', 'cuando_se_pueda'));

alter table public.pedidos_materiales drop constraint if exists pedidos_materiales_origen_check;
alter table public.pedidos_materiales add constraint pedidos_materiales_origen_check
  check (origen in ('appsheet_sheet', 'os', 'app'));

create index if not exists pedidos_materiales_obra_canonica on public.pedidos_materiales (obra_canonica_id);
create index if not exists pedidos_materiales_grupo on public.pedidos_materiales (pedido_grupo);

comment on column public.pedidos_materiales.obra_canonica_id is
  'La obra del índice (obra_canonica). La escribe la app; el Sheet sólo trae obra_texto, que se resuelve por obra_alias.';
comment on column public.pedidos_materiales.pedido_grupo is
  'Un «Pedir material» con varios ítems: una fila por ítem, el mismo grupo. Nulo en lo que viene del Sheet.';
comment on column public.pedidos_materiales.urgencia is 'hoy · semana · cuando_se_pueda. Lo elige quien pide.';

-- ── LAS POLÍTICAS: LA OBRA POR SU ID TAMBIÉN CUENTA ─────────────────────────────────────────────
--
-- `ve_obra_texto(obra_texto)` sigue siendo la puerta de lo que viene del Sheet. Para lo que viene de
-- la app, el texto es el nombre de la obra y no siempre está en el diccionario de alias; la puerta es
-- `ve_obra(obra_canonica_id)`, el mismo portero que usa `obra_canonica`.
create or replace function public.ve_pedido_material(p_obra_texto text, p_obra_canonica_id text)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_administracion()
      or (p_obra_canonica_id is not null and public.ve_obra(p_obra_canonica_id))
      or public.ve_obra_texto(p_obra_texto)
$$;
revoke all on function public.ve_pedido_material(text, text) from public, anon;
grant execute on function public.ve_pedido_material(text, text) to authenticated;

drop policy if exists pedidos_materiales_select on public.pedidos_materiales;
create policy pedidos_materiales_select on public.pedidos_materiales
  for select to authenticated using (public.ve_pedido_material(obra_texto, obra_canonica_id));

drop policy if exists pedidos_materiales_insert on public.pedidos_materiales;
create policy pedidos_materiales_insert on public.pedidos_materiales
  for insert to authenticated with check (public.ve_pedido_material(obra_texto, obra_canonica_id));

drop policy if exists pedidos_materiales_update on public.pedidos_materiales;
create policy pedidos_materiales_update on public.pedidos_materiales
  for update to authenticated
  using (public.ve_pedido_material(obra_texto, obra_canonica_id))
  with check (public.ve_pedido_material(obra_texto, obra_canonica_id));

drop policy if exists pedidos_materiales_delete on public.pedidos_materiales;
create policy pedidos_materiales_delete on public.pedidos_materiales
  for delete to authenticated using (public.ve_pedido_material(obra_texto, obra_canonica_id));

-- RLS no es GRANT: los grants ya estaban (20260716200000). Se dejan explícitos con las columnas nuevas.
alter table public.pedidos_materiales enable row level security;
grant select, insert, update, delete on public.pedidos_materiales to authenticated;

-- ── PEDIR: UN GRUPO, UNA FILA POR ÍTEM ───────────────────────────────────────────────────────────
--
-- `p_items` es un arreglo JSON: [{"material":"Cemento","cantidad":10,"unidad":"bolsa"}, …]. Se valida
-- acá, no sólo en la pantalla: el formulario no es el guarda. Devuelve el id del grupo.
create or replace function public.pedir_material(
  p_obra text, p_items jsonb, p_urgencia text default 'semana', p_nota text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := auth.uid();
  v_grupo uuid := gen_random_uuid();
  v_obra_nombre text;
  v_hoy date := (now() at time zone 'America/Argentina/San_Juan')::date;
  v_item jsonb;
  v_n int := 0;
  v_material text;
  v_cantidad numeric;
begin
  if v_usr is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  select nombre into v_obra_nombre from obra_canonica where id = p_obra;
  if v_obra_nombre is null then
    raise exception 'la obra % no está en el índice de obras', coalesce(p_obra, '(vacía)') using errcode = 'P0001';
  end if;
  if not public.ve_obra(p_obra) then
    raise exception 'no ves la obra %', v_obra_nombre using errcode = '42501';
  end if;
  if p_urgencia is null or p_urgencia not in ('hoy', 'semana', 'cuando_se_pueda') then
    raise exception 'la urgencia es hoy, semana o cuando_se_pueda' using errcode = 'P0001';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'un pedido lleva al menos un material' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_n := v_n + 1;
    v_material := nullif(btrim(v_item ->> 'material'), '');
    if v_material is null then
      raise exception 'el ítem % no dice qué material', v_n using errcode = 'P0001';
    end if;
    begin
      v_cantidad := (v_item ->> 'cantidad')::numeric;
    exception when others then
      raise exception 'la cantidad de «%» no es un número', v_material using errcode = 'P0001';
    end;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'la cantidad de «%» tiene que ser mayor que cero', v_material using errcode = 'P0001';
    end if;
    insert into pedidos_materiales (
      id_pedido, obra_texto, obra_canonica_id, fecha, material, cantidad, unidad, estado, origen,
      urgencia, nota, pedido_grupo, creado_por, sincronizado_en
    ) values (
      'APP-' || replace(v_grupo::text, '-', '') || '-' || v_n,
      v_obra_nombre, p_obra, v_hoy, left(v_material, 160), round(v_cantidad, 3),
      nullif(left(btrim(v_item ->> 'unidad'), 24), ''), 'PEDIDO', 'app',
      p_urgencia, nullif(left(btrim(p_nota), 500), ''), v_grupo, v_usr, now()
    );
  end loop;
  return v_grupo;
end $$;

-- ── EL ESTADO LO MUEVE ADMINISTRACIÓN ────────────────────────────────────────────────────────────
--
-- pedido → visto → comprado → entregado. Un pedido del Sheet que se toca acá pasa a `origen = 'os'`
-- para que el sync no lo vuelva atrás (la regla de siempre); uno de la app sigue siendo de la app.
create or replace function public.cambiar_estado_pedido_material(p_id_pedido text, p_estado text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_estado text := upper(btrim(p_estado)); v_n int;
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  if not public.es_administracion() then
    raise exception 'el estado de un pedido lo cambia Administración o el jefe de obra' using errcode = '42501';
  end if;
  if v_estado not in ('PEDIDO', 'VISTO', 'COMPRADO', 'ENTREGADO') then
    raise exception 'el estado es pedido, visto, comprado o entregado' using errcode = 'P0001';
  end if;
  update pedidos_materiales
     set estado = v_estado,
         origen = case when origen = 'appsheet_sheet' then 'os' else origen end,
         updated_at = now()
   where id_pedido = p_id_pedido;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'el pedido % no existe', p_id_pedido using errcode = 'P0001'; end if;
end $$;

revoke all on function public.pedir_material(text, jsonb, text, text),
  public.cambiar_estado_pedido_material(text, text) from public, anon;
grant execute on function public.pedir_material(text, jsonb, text, text),
  public.cambiar_estado_pedido_material(text, text) to authenticated;
