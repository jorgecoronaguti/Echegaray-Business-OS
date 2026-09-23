-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- HERRAMIENTAS · RECUENTO FÍSICO DEL LUGAR COMPLETO — M05/D04 «Control físico» (etapa 2)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Dueño, 23/09/2026: «ok» al recuento físico del lugar completo.
--
-- ═══ QUÉ ES ═══
--
-- Alguien parado en una obra (o en el Taller) cuenta lo que hay y lo compara con lo que la base dice
-- que hay. Un recuento es UN acto sobre UN lugar: congela lo esperado de `activo_existencia` al
-- abrirse, recibe lo contado por activo, y se cierra de una de dos formas:
--   · `aplicar = true`  → cada línea con diferencia corrige la existencia por `ajustar_existencia`
--                          (motivo 'recuento', detalle con el id del recuento): el inventario queda a lo
--                          contado y cada corrección es una fila de `activo_ajuste`, como siempre.
--   · `aplicar = false` → el recuento queda cerrado como evidencia; el inventario no se toca.
--
-- ═══ LO QUE NO HACE ═══
--
--   · No deja un lugar en 0. `ajustar_existencia` (20260922T1300) ya lo rechaza: quedar en 0 es una
--     baja (robada, perdida, descartada, vendida) o un movimiento. Una línea contada en 0 queda en el
--     recuento como evidencia y el cierre la devuelve en `sin_ajustar` para que la pantalla lo diga.
--   · No agrega lo que apareció y no estaba: eso es un alta o un movimiento, con su propia pantalla.
--   · No es la verificación de USO de rodados y máquinas (`activo_lectura_uso`, 20260922T1200).
--
-- ═══ QUIÉN ESCRIBE ═══
--
-- Sólo las tres funciones `security definer` (`_activo_usuario`, como el resto del módulo). Las tablas no
-- tienen policy de escritura. Leer, cualquiera autenticado; permisos iguales para todos (dueño, 21/09).
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

create table public.activo_recuento (
  id            uuid primary key default gen_random_uuid(),
  ubicacion_id  uuid not null references public.ubicacion(id),
  iniciado_en   timestamptz not null default now(),
  cerrado_en    timestamptz,
  -- Null mientras está abierto; al cerrar dice si corrigió el inventario o quedó como evidencia.
  aplicado      boolean,
  hecho_por     uuid references auth.users(id),
  cerrado_por   uuid references auth.users(id),
  observaciones text check (observaciones is null or length(observaciones) <= 1000),
  constraint activo_recuento_cierre_chk check ((cerrado_en is null) = (aplicado is null))
);
create index activo_recuento_ubicacion_idx on public.activo_recuento (ubicacion_id, iniciado_en desc);
-- Un solo recuento abierto por lugar: abrir de nuevo devuelve el que está en curso.
create unique index activo_recuento_abierto_uidx on public.activo_recuento (ubicacion_id) where cerrado_en is null;
comment on table public.activo_recuento is
  'Un recuento físico de un lugar: lo esperado se congela al abrir, lo contado entra por línea, y el '
  'cierre corrige el inventario (aplicado) o queda como evidencia. Escriben sólo abrir/contar_en/cerrar_recuento.';

alter table public.activo_recuento enable row level security;
revoke all on public.activo_recuento from anon, public;
revoke insert, update, delete on public.activo_recuento from authenticated;
grant select on public.activo_recuento to authenticated;
create policy activo_recuento_select on public.activo_recuento for select to authenticated using (true);

create table public.activo_recuento_linea (
  recuento_id uuid not null references public.activo_recuento(id) on delete cascade,
  activo_id   uuid not null references public.activo(id),
  -- Lo que `activo_existencia` decía en ese lugar cuando se abrió el recuento.
  esperado    int  not null check (esperado >= 0),
  -- Null = todavía no se contó. Vacío no es cero.
  contado     int  check (contado is null or contado >= 0),
  diferencia  int  generated always as (contado - esperado) stored,
  nota        text check (nota is null or length(nota) <= 400),
  contado_en  timestamptz,
  primary key (recuento_id, activo_id)
);
create index activo_recuento_linea_activo_idx on public.activo_recuento_linea (activo_id);
comment on table public.activo_recuento_linea is
  'Una línea del recuento: qué se esperaba y qué se contó de un activo en el lugar. diferencia = contado - esperado (null hasta contar).';

alter table public.activo_recuento_linea enable row level security;
revoke all on public.activo_recuento_linea from anon, public;
revoke insert, update, delete on public.activo_recuento_linea from authenticated;
grant select on public.activo_recuento_linea to authenticated;
create policy activo_recuento_linea_select on public.activo_recuento_linea for select to authenticated using (true);

-- ── ABRIR: congela lo esperado del lugar. Si ya hay uno abierto ahí, es ése ─────────────────────
create function public.abrir_recuento(p_ubicacion uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._activo_usuario(); v_ubic ubicacion%rowtype; v_id uuid; v_n int;
begin
  select * into v_ubic from ubicacion where id = p_ubicacion for update;
  if not found then raise exception 'el lugar no existe'; end if;
  if v_ubic.archivada then raise exception 'el lugar está archivado: no se cuenta'; end if;
  select id into v_id from activo_recuento where ubicacion_id = p_ubicacion and cerrado_en is null;
  if v_id is not null then return v_id; end if;
  select count(*) into v_n from activo_existencia e join activo a on a.id = e.activo_id
   where e.ubicacion_id = p_ubicacion and a.estado <> 'baja';
  if v_n = 0 then raise exception 'no hay nada registrado en ese lugar: no hay qué contar'; end if;
  insert into activo_recuento (ubicacion_id, hecho_por) values (p_ubicacion, v_usr) returning id into v_id;
  insert into activo_recuento_linea (recuento_id, activo_id, esperado)
  select v_id, e.activo_id, e.cantidad from activo_existencia e join activo a on a.id = e.activo_id
   where e.ubicacion_id = p_ubicacion and a.estado <> 'baja';
  return v_id;
end $$;

-- ── CONTAR: lo contado de un activo del recuento abierto. Se puede volver a contar ──────────────
create function public.contar_en_recuento(p_recuento uuid, p_activo uuid, p_contado int, p_nota text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_rec activo_recuento%rowtype;
begin
  perform public._activo_usuario();
  select * into v_rec from activo_recuento where id = p_recuento for update;
  if not found then raise exception 'el recuento no existe'; end if;
  if v_rec.cerrado_en is not null then raise exception 'el recuento ya está cerrado'; end if;
  if p_contado is null or p_contado < 0 then raise exception 'lo contado es 0 o más'; end if;
  update activo_recuento_linea set contado = p_contado, nota = nullif(btrim(p_nota), ''), contado_en = now()
   where recuento_id = p_recuento and activo_id = p_activo;
  if not found then raise exception 'ese activo no está en el recuento: lo que apareció y no estaba es un alta o un movimiento'; end if;
end $$;

-- ── CERRAR: con aplicar, el inventario queda a lo contado; sin aplicar, queda la evidencia ──────
-- Devuelve el resumen: contados, con_diferencia, ajustadas y `sin_ajustar` (los códigos contados en 0,
-- que no se corrigen porque dejar un lugar en 0 es una baja o un movimiento).
-- Si con `aplicar` la existencia actual ya no es la esperada (alguien movió unidades mientras se
-- contaba), se rechaza: el recuento comparó contra un número que ya no vale.
create function public.cerrar_recuento(p_recuento uuid, p_aplicar boolean, p_observaciones text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._activo_usuario(); v_rec activo_recuento%rowtype; r record; v_hay int;
  v_contados int := 0; v_con_dif int := 0; v_ajustadas int := 0; v_sin_ajustar text[] := '{}';
begin
  select * into v_rec from activo_recuento where id = p_recuento for update;
  if not found then raise exception 'el recuento no existe'; end if;
  if v_rec.cerrado_en is not null then raise exception 'el recuento ya está cerrado'; end if;
  if p_aplicar is null then raise exception 'hay que decir si se ajusta el inventario o no'; end if;
  select count(*) filter (where contado is not null), count(*) filter (where diferencia <> 0)
    into v_contados, v_con_dif from activo_recuento_linea where recuento_id = p_recuento;
  if v_contados = 0 then raise exception 'no se contó nada: el recuento no se cierra vacío'; end if;
  if p_aplicar then
    for r in select l.activo_id, l.esperado, l.contado, a.codigo from activo_recuento_linea l join activo a on a.id = l.activo_id
              where l.recuento_id = p_recuento and l.diferencia <> 0 order by a.codigo loop
      select cantidad into v_hay from activo_existencia where activo_id = r.activo_id and ubicacion_id = v_rec.ubicacion_id;
      if coalesce(v_hay, 0) <> r.esperado then
        raise exception '%: había % cuando se abrió el recuento y ahora hay %: se movió mientras se contaba. Guardá sin ajustar o contá de nuevo', r.codigo, r.esperado, coalesce(v_hay, 0);
      end if;
      if r.contado = 0 then
        v_sin_ajustar := v_sin_ajustar || r.codigo;
        continue;
      end if;
      perform public.ajustar_existencia(r.activo_id, v_rec.ubicacion_id, r.contado, 'recuento ' || p_recuento::text);
      v_ajustadas := v_ajustadas + 1;
    end loop;
  end if;
  update activo_recuento set cerrado_en = now(), cerrado_por = v_usr, aplicado = p_aplicar,
                             observaciones = nullif(btrim(p_observaciones), '')
   where id = p_recuento;
  return jsonb_build_object(
    'contados', v_contados, 'con_diferencia', v_con_dif, 'ajustadas', v_ajustadas,
    'sin_ajustar', to_jsonb(v_sin_ajustar)
  );
end $$;

revoke all on function public.abrir_recuento(uuid), public.contar_en_recuento(uuid, uuid, int, text),
  public.cerrar_recuento(uuid, boolean, text) from public, anon;
grant execute on function public.abrir_recuento(uuid), public.contar_en_recuento(uuid, uuid, int, text),
  public.cerrar_recuento(uuid, boolean, text) to authenticated;
