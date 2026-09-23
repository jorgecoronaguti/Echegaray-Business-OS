-- BORRAR UN PEDIDO DE MATERIAL DESDE LA APP (dueño, 23/09/2026: «lo que has hecho en la sección
-- materiales no sirve, porque no me permite borrar nada»).
--
-- ═══ POR QUÉ ES UN BORRADO LÓGICO ═══
--
-- La tabla tiene tres procedencias y una de ellas es el espejo del Sheet (`appsheet_sheet`): el sync
-- hace `insert … on conflict do update` (`orquestador/lib/pedidos-materiales-sync.mjs`). Si la fila se
-- borrara físicamente, la próxima corrida la volvería a INSERTAR desde el Sheet y el pedido
-- «reviviría» solo. Con `borrado_en` la fila queda, el sync no la toca (su `update` sólo pisa las
-- filas que siguen siendo `appsheet_sheet`, y acá pasa a `os`, igual que un cambio de estado) y la
-- app no la ve: la policy de lectura excluye lo borrado, así que TODAS las pantallas que leen la
-- tabla (Material en las dos caras, Operación de la obra, Pedidos de Fuentes) lo dejan de mostrar
-- sin que cada una tenga que acordarse.
--
-- Quién borra: el mismo que cambia el estado (`es_administracion()`: Dirección, Administración y el
-- jefe de obra). El operario puede pedir, no borrar.

alter table public.pedidos_materiales
  add column if not exists borrado_en timestamptz,
  add column if not exists borrado_por uuid;

comment on column public.pedidos_materiales.borrado_en is
  'Borrado lógico desde la app (23/09/2026). NULL = vivo. La policy de lectura lo excluye; el sync del Sheet no lo revive.';

-- LA LECTURA EXCLUYE LO BORRADO. Misma puerta que antes, más la condición.
drop policy if exists pedidos_materiales_select on public.pedidos_materiales;
create policy pedidos_materiales_select on public.pedidos_materiales
  for select to authenticated
  using (borrado_en is null and public.ve_pedido_material(obra_texto, obra_canonica_id));

create or replace function public.borrar_pedido_material(p_ids text[])
returns integer
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  if not public.es_administracion() then
    raise exception 'un pedido lo borra Administración o el jefe de obra' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'no se dijo qué pedido borrar' using errcode = 'P0001';
  end if;
  update pedidos_materiales
     set borrado_en = now(),
         borrado_por = auth.uid(),
         origen = case when origen = 'appsheet_sheet' then 'os' else origen end,
         updated_at = now()
   where id_pedido = any(p_ids)
     and borrado_en is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'ese pedido ya no existe' using errcode = 'P0001'; end if;
  return v_n;
end $$;

revoke all on function public.borrar_pedido_material(text[]) from public, anon;
grant execute on function public.borrar_pedido_material(text[]) to authenticated;
