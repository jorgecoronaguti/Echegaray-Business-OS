-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- HERRAMIENTAS · CATEGORÍAS CERRADAS Y CANTIDAD PROPIA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Dueño, 22/09/2026, textual: «al crear un activo no tengo opciones de categoria posibles, hay q
-- unificar todo eso» y «te habia pedido tema cantidades».
--
-- ═══ CATEGORÍAS ═══
-- Hasta hoy `activo.categoria` era texto libre y estaba vacío en los 184. Ahora es una lista cerrada
-- en `activo_categoria` (clave foránea): la pantalla sólo ofrece esas y la base no acepta otra. Cada
-- activo recibe la suya por su nombre (los nombres se unificaron el mismo día). Una categoría nueva
-- entra por migración, no tipeada en una pantalla.
--
-- ═══ CANTIDAD ═══
-- Los lotes decían su cantidad en el nombre («Balde de albañil (8 u.)»). Ahora es `activo.cantidad`
-- (1 por defecto) y el nombre queda «Balde de albañil · lote»: la cantidad se suma en los totales y se
-- muestra en su columna, sin leerla de un texto.

create table public.activo_categoria (
  nombre text primary key check (length(btrim(nombre)) between 2 and 60),
  orden  int not null unique
);
alter table public.activo_categoria enable row level security;
create policy activo_categoria_select on public.activo_categoria for select to authenticated using (true);
revoke all on public.activo_categoria from anon, public;
grant select on public.activo_categoria to authenticated;

insert into public.activo_categoria (nombre, orden) values
  ('Herramientas eléctricas', 1),
  ('Soldadura', 2),
  ('Herramientas de mano', 3),
  ('Excavación', 4),
  ('Albañilería', 5),
  ('Hormigón y mezcla', 6),
  ('Medición y nivelación', 7),
  ('Compresor y neumática', 8),
  ('Electricidad de obra', 9),
  ('Escaleras y andamios', 10),
  ('Transporte en obra', 11),
  ('Agua', 12),
  ('Seguridad (EPP)', 13),
  ('Rodados', 14),
  ('Otros', 15);

-- ── CANTIDAD ────────────────────────────────────────────────────────────────────────────────────
alter table public.activo add column cantidad int not null default 1 check (cantidad between 1 and 100000);
update public.activo
   set cantidad = (regexp_match(nombre, '\((\d+) u\.\)'))[1]::int,
       nombre   = btrim(regexp_replace(nombre, '\s*\(\d+ u\.\)', '')) || ' · lote'
 where nombre ~ '\(\d+ u\.\)';

-- ── CATEGORÍA DE CADA ACTIVO, POR SU NOMBRE ─────────────────────────────────────────────────────
-- El orden de los `when` importa: «Martillo demoledor» es eléctrica antes que «martillo» de mano,
-- «Pico de loro» es de mano antes que «pico» de excavación, «Pistola para pintar» es neumática.
update public.activo set categoria = (case
  when clase = 'rodado' then 'Rodados'
  when nombre ~* '^(soldadora|careta de soldar|pinza para soldar)' then 'Soldadura'
  when nombre ~* '^(amoladora|taladro|atornilladora|rotomartillo|sierra circular|lijadora|martillo demoledor|batidora|cargador de bater|batería)' then 'Herramientas eléctricas'
  when nombre ~* '^(hormigonera|mezcladora|caballete para hormigonera)' then 'Hormigón y mezcla'
  when nombre ~* '^(compresor|manguera de compresor|pistola para pintar|pico para inflar|calibre para inflar)' then 'Compresor y neumática'
  when nombre ~* '^(alargue|tablero)' then 'Electricidad de obra'
  when nombre ~* '^(casco|arnés|máscara)' then 'Seguridad (EPP)'
  when nombre ~* '^(cinta métrica|nivel|escuadra|plomada|manguera de nivel|regla)' then 'Medición y nivelación'
  when nombre ~* '^(escalera|puntal|rueda de andamio)' then 'Escaleras y andamios'
  when nombre ~* '^(carretilla|carro)' then 'Transporte en obra'
  when nombre ~* '^(pico de loro|martillo|maza|tenaza|alicate|destornillador|tijera|remachadora|serrucho|sargento|grifa|plancha para grifar|punta|mecha|pistola aplicadora|grasera)' then 'Herramientas de mano'
  when nombre ~* '^(pala|pico|anchada|barreta|hacha)' then 'Excavación'
  when nombre ~* '^(cuchara de albañil|balde de albañil|fratacho)' then 'Albañilería'
  when nombre ~* '^(bomba de agua|manguera 3/4)' then 'Agua'
  else 'Otros' end);

alter table public.activo
  add constraint activo_categoria_fk foreign key (categoria) references public.activo_categoria(nombre) on update cascade;

-- ── FUNCIONES: la cantidad entra por el alta y por editar; la categoría la valida la clave foránea ──
drop function public.dar_de_alta_activo(text, text, uuid, text, text, text, boolean, text);
create function public.dar_de_alta_activo(
  p_clase text, p_nombre text, p_ubicacion uuid default null, p_categoria text default null,
  p_codigo text default null, p_patente text default null, p_alta_desde_obra boolean default false,
  p_foto_url text default null, p_cantidad int default 1
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._activo_usuario(); v_codigo text; v_id uuid;
begin
  if p_clase not in ('herramienta', 'equipo', 'rodado') then raise exception 'clase no válida'; end if;
  if length(btrim(coalesce(p_nombre, ''))) < 2 then raise exception 'falta el nombre'; end if;
  if coalesce(p_cantidad, 1) < 1 then raise exception 'la cantidad es 1 o más'; end if;
  v_codigo := public._codigo_propuesto(p_codigo, p_nombre);
  insert into activo (codigo, clase, nombre, categoria, patente, alta_desde_obra, foto_url, creado_por, estado_por, cantidad)
  values (v_codigo, p_clase, btrim(p_nombre),
          coalesce(nullif(btrim(p_categoria), ''), case when p_clase = 'rodado' then 'Rodados' end),
          nullif(upper(btrim(p_patente)), ''), p_alta_desde_obra, p_foto_url, v_usr, v_usr, coalesce(p_cantidad, 1))
  returning id into v_id;
  if p_clase = 'rodado' then insert into ubicacion (tipo, activo_id) values ('rodado', v_id); end if;
  if p_ubicacion is not null then
    insert into activo_movimiento (activo_id, origen_id, destino_id, usuario_id, nota)
    values (v_id, null, p_ubicacion, v_usr, 'alta');
    update activo set ubicacion_id = p_ubicacion where id = v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.dar_de_alta_activo(text, text, uuid, text, text, text, boolean, text, int) from public, anon;
grant execute on function public.dar_de_alta_activo(text, text, uuid, text, text, text, boolean, text, int) to authenticated;

create or replace function public.editar_activo(p_activo uuid, p_datos jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._activo_usuario();
  update activo set
    nombre              = coalesce(nullif(btrim(p_datos->>'nombre'), ''), nombre),
    categoria           = case when p_datos ? 'categoria' then nullif(btrim(p_datos->>'categoria'), '') else categoria end,
    cantidad            = case when p_datos ? 'cantidad' then (p_datos->>'cantidad')::int else cantidad end,
    foto_url            = case when p_datos ? 'foto_url' then nullif(p_datos->>'foto_url', '') else foto_url end,
    numero_serie        = case when p_datos ? 'numero_serie' then nullif(btrim(p_datos->>'numero_serie'), '') else numero_serie end,
    compra_fecha        = case when p_datos ? 'compra_fecha' then nullif(p_datos->>'compra_fecha', '')::date else compra_fecha end,
    compra_precio       = case when p_datos ? 'compra_precio' then nullif(p_datos->>'compra_precio', '')::numeric else compra_precio end,
    compra_proveedor_id = case when p_datos ? 'compra_proveedor_id' then nullif(p_datos->>'compra_proveedor_id', '')::uuid else compra_proveedor_id end,
    patente             = case when p_datos ? 'patente' and clase = 'rodado' then nullif(upper(btrim(p_datos->>'patente')), '') else patente end,
    etiqueta_impresa_en = case when (p_datos->>'etiqueta_impresa')::boolean then now() else etiqueta_impresa_en end,
    alta_desde_obra     = case when (p_datos->>'revisada')::boolean then false else alta_desde_obra end
  where id = p_activo;
  if not found then raise exception 'el activo no existe'; end if;
end $$;

do $$
declare n_sin int; n_lotes int;
begin
  select count(*) into n_sin from public.activo where categoria is null;
  select count(*) into n_lotes from public.activo where cantidad > 1;
  if n_sin > 0 then raise exception '% activos quedaron sin categoría', n_sin; end if;
  raise notice 'categorías asignadas a todos; % lotes con cantidad', n_lotes;
end $$;
