-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- HERRAMIENTAS · CADA UNIDAD DE UN LOTE CON SU PROPIO CÓDIGO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Dueño, 23/09/2026, textual: «necesito identificar de manera individual cada herramienta, máquina,
-- rodado, así que lo que tiene cantidad tiene que ir generando códigos únicos cuando haga falta».
--
-- ═══ QUÉ ES UNA FILA ═══
--
-- UNA unidad física de UN lote. El lote sigue siendo UN activo (`activo`, `cantidad` = 7) con sus unidades
-- por lugar (`activo_existencia`): eso no cambia. Lo nuevo es que cada unidad puede recibir un código
-- propio, derivado del código del lote: `BAL-001/1`, `BAL-001/2`… El número es correlativo dentro del
-- lote y no se reutiliza: una unidad dada de baja conserva su fila y su número.
--
-- ═══ CUANDO HAGA FALTA, NO DE GOLPE ═══
--
-- PUN-004 tiene 580 puntales. Nadie va a etiquetar 580 puntales el día que se aplica esto. Los códigos se
-- generan A PEDIDO desde la ficha («Dar código a cada unidad», de a tantas como se pida), y nunca más
-- códigos que unidades tiene el lote: `individualizar_unidades` rechaza pasarse de `activo.cantidad`.
--
-- ═══ UN RODADO O UNA MÁQUINA ES UNA UNIDAD = UN CÓDIGO ═══
--
-- Un activo con `cantidad = 1` YA tiene su código individual: es el del activo. No se le crean unidades:
-- tendría dos códigos para la misma cosa. La función lo dice con esas palabras.
--
-- ═══ QUIÉN ESCRIBE ═══
--
-- Sólo `individualizar_unidades`, `security definer`, como el resto del módulo (`_activo_usuario`). La
-- tabla no tiene policy de escritura. Leer, cualquiera autenticado: permisos iguales para todos (dueño).
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

create table if not exists public.activo_unidad (
  id           uuid primary key default gen_random_uuid(),
  activo_id    uuid not null references public.activo(id),
  -- Correlativo dentro del lote: 1, 2, 3… No se reutiliza nunca.
  numero       int  not null check (numero between 1 and 100000),
  -- `<código del lote>/<número>`: BAL-001/3. Es lo que codifica el QR de la etiqueta de la unidad.
  codigo       text not null unique check (codigo ~ '^[A-Z]{3}-[0-9]{3,4}/[0-9]{1,6}$'),
  estado       text not null default 'operativo' check (estado in ('operativo', 'baja')),
  -- Dónde está ESTA unidad, si alguien lo cargó. null = se sabe por el reparto del lote, no por la unidad.
  ubicacion_id uuid references public.ubicacion(id),
  nota         text check (nota is null or length(nota) <= 400),
  creado_en    timestamptz not null default now(),
  creado_por   uuid references auth.users(id),
  unique (activo_id, numero)
);
create index if not exists activo_unidad_activo_idx on public.activo_unidad (activo_id, numero);
comment on table public.activo_unidad is
  'Una unidad física de un lote, con su código propio (BAL-001/3). Se crean a pedido con '
  'individualizar_unidades; nunca más que activo.cantidad. Un activo con cantidad 1 no tiene unidades: su código es el del activo.';

alter table public.activo_unidad enable row level security;
revoke all on public.activo_unidad from anon, public;
revoke insert, update, delete on public.activo_unidad from authenticated;
grant select on public.activo_unidad to authenticated;
drop policy if exists activo_unidad_select on public.activo_unidad;
create policy activo_unidad_select on public.activo_unidad for select to authenticated using (true);

-- ── DAR CÓDIGO A LAS UNIDADES ───────────────────────────────────────────────────────────────────
-- Genera `p_cuantas` códigos correlativos a partir del último que tenga el lote. Devuelve las filas
-- creadas. Bajo candado por activo: dos personas pidiendo a la vez no producen el mismo número.
create or replace function public.individualizar_unidades(p_activo uuid, p_cuantas int)
returns setof public.activo_unidad
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._activo_usuario();
  v_act activo%rowtype;
  v_desde int;
  v_hay int;
begin
  select * into v_act from activo where id = p_activo for update;
  if v_act.id is null then raise exception 'el activo no existe' using errcode = 'P0001'; end if;
  if v_act.estado = 'baja' then raise exception 'el activo está dado de baja: no se le dan códigos' using errcode = 'P0001'; end if;
  if v_act.cantidad = 1 then
    raise exception 'es una sola unidad: su código es %', v_act.codigo using errcode = 'P0001';
  end if;
  if p_cuantas is null or p_cuantas < 1 then raise exception 'la cantidad es 1 o más' using errcode = 'P0001'; end if;
  select count(*), coalesce(max(numero), 0) into v_hay, v_desde from activo_unidad where activo_id = p_activo;
  if v_hay + p_cuantas > v_act.cantidad then
    raise exception 'el lote tiene % unidades y % ya tienen código: se pueden dar % más, no %',
      v_act.cantidad, v_hay, v_act.cantidad - v_hay, p_cuantas using errcode = 'P0001';
  end if;
  return query
    insert into activo_unidad (activo_id, numero, codigo, creado_por)
    select p_activo, n, v_act.codigo || '/' || n, v_usr
      from generate_series(v_desde + 1, v_desde + p_cuantas) as n
    returning *;
end $$;
revoke all on function public.individualizar_unidades(uuid, int) from public, anon;
grant execute on function public.individualizar_unidades(uuid, int) to authenticated;

-- ── EL QR DE UNA UNIDAD ABRE LA FICHA DEL LOTE ──────────────────────────────────────────────────
-- `activo_por_codigo` ya resolvía el código de hoy y los anteriores; ahora también `BAL-001/3` → el lote.
-- La puerta `/h/<código>` no cambia: redirige a la ficha del activo, que muestra sus unidades.
create or replace function public.activo_por_codigo(p_codigo text) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select id from activo where codigo = upper(btrim(p_codigo))),
    (select activo_id from activo_codigo_anterior where codigo = upper(btrim(p_codigo))),
    (select activo_id from activo_unidad where codigo = upper(btrim(p_codigo))))
  where auth.uid() is not null
$$;

notify pgrst, 'reload schema';
