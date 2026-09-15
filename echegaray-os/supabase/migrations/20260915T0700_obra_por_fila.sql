-- LA OBRA VIAJA PEGADA A LA FILA: columna Obra, por encabezado (Compras L / Cobranzas H).
--
-- ═══ POR QUÉ (dueño, 14/09/2026) ═══
--
-- «ok a todo, pero además tenés que tener en cuenta el cargador automático de comprobantes». La obra
-- de cada compra se inferÍa del texto de la columna K (213 filas de 2026 quedaban «probables») y la
-- de cada cobro del concepto o la OC. Desde ahora la fila puede traer la decisión escrita en una
-- columna con desplegable: «OB-0021 · ME - PLAYÓN DE AZUFRE», «ES-ADM · Estructura – Administración»,
-- «ES-TAL · Estructura – Taller» o «Sin obra – <cliente>». La regla de lectura vive en
-- `orquestador/lib/obra-destino.mjs`; esta migración sólo da dónde guardarla.
--
-- ═══ QUÉ AGREGA ═══
--
--   1. `compra_sheet`: destino, obra_id, obra_celda (el texto tal cual) y obra_inconsistencia (la
--      celda no se entendió, o contradice la Unidad de Negocio — se marca, no se corrige).
--   2. `costos_obra`: destino y obra_id (dueño: «compra_sheet y costos_obra guardan el destino»).
--   3. `cobranzas`: destino, obra_id, obra_celda.
--   4. `compra_obra_asignada`: dos vías nuevas, `obra_de_la_fila` y `estructura_de_la_fila`. Una fila de
--      estructura NO tiene obra NI cliente: así `costo_de_obras_a_la_fecha` (por obra_id) y
--      `compras_sin_obra_de_clientes` (via = 'sin_obra') no la suman, sin tocar esas funciones.
--   5. `compra_obra_cambio`: la cola por la que la app (y la respuesta del chat) escribe la columna Obra, por encabezado (Compras L / Cobranzas H) en el Sheet.
--      Hoy la app NO escribe Compras: el camino es el mismo que ya usa Cobranzas (`cobranza_cambio` →
--      worker con `confirmacion` de quien pidió → relectura).
--   6. `compra_obra_asignar(fila, valor, esperado)`: la ÚNICA puerta de escritura de la app. Valida el
--      rol, que la celda no haya cambiado desde que se miró (`esperado`), guarda y encola.
--
-- IMP/FIN no existen como destino: el dueño ordenó que impuestos, cargas y financieros salgan de
-- Compras a sus pestañas (14/09/2026).
--
-- ═══ RLS ═══
-- Ninguna policy existente se toca. La cola nace con RLS y sólo SELECT para administración; nadie la
-- inserta directo: la RPC es `security definer` y chequea `es_administracion()` adentro.
--
-- ORDEN: esta migración ANTES del deploy del sync nuevo. El sync nuevo detecta si las columnas existen
-- y, si no, se comporta como el de hoy (no escribe una vía que el CHECK rechazaría).

set local lock_timeout = '5s';

-- ─── 1 · compra_sheet ────────────────────────────────────────────────────────────────────────────
alter table public.compra_sheet
  add column if not exists destino text,
  add column if not exists obra_id text references public.obra_canonica (id) on delete set null,
  add column if not exists obra_celda text,
  add column if not exists obra_inconsistencia text;
alter table public.compra_sheet drop constraint if exists compra_sheet_destino_chk;
alter table public.compra_sheet add constraint compra_sheet_destino_chk
  check (destino in ('obra', 'estructura_admin', 'estructura_taller'));
alter table public.compra_sheet drop constraint if exists compra_sheet_obra_con_destino_obra;
alter table public.compra_sheet add constraint compra_sheet_obra_con_destino_obra
  check (obra_id is null or destino = 'obra');
create index if not exists compra_sheet_obra_idx on public.compra_sheet (obra_id) where obra_id is not null;
-- La tabla tiene grant de SELECT a authenticated; se nombra por columna igual para que no dependa de él.
grant select (destino, obra_id, obra_celda, obra_inconsistencia) on public.compra_sheet to authenticated;

comment on column public.compra_sheet.obra_celda is
  'Texto de la columna Obra, por encabezado (Compras L / Cobranzas H) tal cual. Lo interpreta orquestador/lib/obra-destino.mjs.';
comment on column public.compra_sheet.obra_inconsistencia is
  'La celda Obra no se entendió o contradice la Unidad de Negocio. Se lista al dueño; no se corrige.';

-- ─── 2 · costos_obra ─────────────────────────────────────────────────────────────────────────────
alter table public.costos_obra
  add column if not exists destino text,
  add column if not exists obra_id text references public.obra_canonica (id) on delete set null;
alter table public.costos_obra drop constraint if exists costos_obra_destino_chk;
alter table public.costos_obra add constraint costos_obra_destino_chk
  check (destino in ('obra', 'estructura_admin', 'estructura_taller'));
alter table public.costos_obra drop constraint if exists costos_obra_obra_con_destino_obra;
alter table public.costos_obra add constraint costos_obra_obra_con_destino_obra
  check (obra_id is null or destino = 'obra');
grant select (destino, obra_id) on public.costos_obra to authenticated;

-- ─── 3 · cobranzas ───────────────────────────────────────────────────────────────────────────────
-- Sin grant a authenticated: la tabla sólo concede columnas puntuales y ninguna cara lee esto todavía.
alter table public.cobranzas
  add column if not exists destino text,
  add column if not exists obra_id text references public.obra_canonica (id) on delete set null,
  add column if not exists obra_celda text;
alter table public.cobranzas drop constraint if exists cobranzas_destino_chk;
alter table public.cobranzas add constraint cobranzas_destino_chk
  check (destino in ('obra', 'estructura_admin', 'estructura_taller'));
alter table public.cobranzas drop constraint if exists cobranzas_obra_con_destino_obra;
alter table public.cobranzas add constraint cobranzas_obra_con_destino_obra
  check (obra_id is null or destino = 'obra');

-- ─── 4 · compra_obra_asignada: las vías de la columna Obra ──────────────────────────────────────
alter table public.compra_obra_asignada drop constraint if exists compra_obra_asignada_via_check;
alter table public.compra_obra_asignada add constraint compra_obra_asignada_via_check check (via in (
  'obra_por_alias', 'obra_por_nombre', 'unica_obra_del_cliente', 'sin_obra', 'no_es_cliente',
  'obra_de_la_fila', 'estructura_de_la_fila'));
alter table public.compra_obra_asignada drop constraint if exists compra_obra_asignada_via_coherente;
alter table public.compra_obra_asignada add constraint compra_obra_asignada_via_coherente check (
  (obra_id is null) = (via in ('sin_obra', 'no_es_cliente', 'estructura_de_la_fila')));
alter table public.compra_obra_asignada drop constraint if exists compra_obra_asignada_cliente_coherente;
alter table public.compra_obra_asignada add constraint compra_obra_asignada_cliente_coherente check (
  (cliente is null) = (via in ('no_es_cliente', 'estructura_de_la_fila')));

-- ─── 5 · la cola app/chat → columna Obra, por encabezado (Compras L / Cobranzas H) ─────────────
create table if not exists public.compra_obra_cambio (
  id              uuid primary key default gen_random_uuid(),
  fila            integer not null,
  -- La clave del comprobante (`compra_sheet.clave`). El worker no escribe si la fila ya es otra compra.
  clave           text,
  sheet_id        integer,
  valor_anterior  text,
  valor_nuevo     text,
  origen          text not null check (origen in ('app', 'chat')),
  pedido_por      uuid references public.perfiles (id),
  -- El chat no tiene perfil: el nombre de quien contestó, para `confirmacion` del freno de mano.
  pedido_por_nombre text,
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente', 'procesando', 'aplicado', 'rechazado', 'error')),
  motivo          text,
  intentos        integer not null default 0,
  leido_de_vuelta text,
  creado_at       timestamptz not null default now(),
  tomado_at       timestamptz,
  aplicado_at     timestamptz,
  constraint compra_obra_cambio_actor check (pedido_por is not null or pedido_por_nombre is not null)
);
create index if not exists compra_obra_cambio_vivos_idx on public.compra_obra_cambio (creado_at)
  where estado in ('pendiente', 'procesando');

alter table public.compra_obra_cambio enable row level security;
drop policy if exists compra_obra_cambio_select on public.compra_obra_cambio;
create policy compra_obra_cambio_select on public.compra_obra_cambio for select
  to authenticated using ((select public.es_administracion()));
grant select on public.compra_obra_cambio to authenticated;
grant select, insert, update, delete on public.compra_obra_cambio to service_role;

-- ─── 6 · la puerta de la app ────────────────────────────────────────────────────────────────────
create or replace function public.compra_obra_asignar(p_fila integer, p_valor text, p_esperado text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila    record;
  v_valor   text := nullif(btrim(coalesce(p_valor, '')), '');
  v_destino text := null;
  v_obra    text := null;
  v_codigo  text;
begin
  if not public.es_administracion() then
    return jsonb_build_object('ok', false, 'error', 'sin permiso para imputar compras');
  end if;
  select fila, clave, sheet_id, obra_celda into v_fila from public.compra_sheet where fila = p_fila;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'esa fila ya no está en Compras');
  end if;
  -- Otro (o el Sheet) la cambió mientras la pantalla la mostraba: no se pisa a ciegas.
  if coalesce(v_fila.obra_celda, '') is distinct from coalesce(nullif(btrim(p_esperado), ''), '') then
    return jsonb_build_object('ok', false, 'error',
      format('la obra de la fila %s cambió mientras la mirabas: ahora dice «%s»', p_fila, coalesce(v_fila.obra_celda, 'vacía')));
  end if;
  if v_valor is not null then
    v_codigo := upper(substring(v_valor from '^\s*((?:[Oo][Bb]|[Zz][Zz])-[0-9]{4,})'));
    if v_codigo is not null then
      select coalesce(fusionada_en, id) into v_obra from public.obra_canonica where codigo = v_codigo;
      if v_obra is null then
        return jsonb_build_object('ok', false, 'error', format('%s no es el código de ninguna obra', v_codigo));
      end if;
      v_destino := 'obra';
    elsif v_valor ~* '^\s*ES-ADM' then v_destino := 'estructura_admin';
    elsif v_valor ~* '^\s*ES-TAL' then v_destino := 'estructura_taller';
    elsif v_valor ~* '^\s*sin\s+obra\s*[–—-]' then v_destino := 'obra';
    else
      return jsonb_build_object('ok', false, 'error', 'no es una opción del desplegable de Obra');
    end if;
  end if;

  update public.compra_sheet
     set destino = v_destino, obra_id = v_obra, obra_celda = v_valor, obra_inconsistencia = null
   where fila = p_fila;
  insert into public.compra_obra_cambio (fila, clave, sheet_id, valor_anterior, valor_nuevo, origen, pedido_por)
  values (p_fila, v_fila.clave, v_fila.sheet_id, v_fila.obra_celda, v_valor, 'app', (select auth.uid()));
  return jsonb_build_object('ok', true, 'destino', v_destino, 'obra_id', v_obra);
end;
$$;

revoke all on function public.compra_obra_asignar(integer, text, text) from public, anon;
grant execute on function public.compra_obra_asignar(integer, text, text) to authenticated;

comment on function public.compra_obra_asignar(integer, text, text) is
  'La app imputa la obra de una fila de Compras: guarda en compra_sheet y encola la escritura de la columna Obra, por encabezado (Compras L / Cobranzas H) '
  '(compra_obra_cambio). `p_esperado` = lo que la pantalla mostraba; si cambió, no se pisa.';
