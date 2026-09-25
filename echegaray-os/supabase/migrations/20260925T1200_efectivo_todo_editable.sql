-- EFECTIVO: TODO SE EDITA Y TODO SE BORRA DESDE LA APP (dueño, 25/09/2026)
--
-- «el módulo efectivo dejámelo todo habilitado 100% editable porque sino se guardan cosas mal y no me las
-- deja borrar, cambiar, editar en app.ecsas.com.ar».
--
-- Hasta hoy la base sólo sabía CREAR (entregar, devolver, rendir) y DESHACER a medias (anular, descartar).
-- Lo que no se podía, medido contra la base del 25/09:
--   · la entrega no tenía ninguna función para cambiar persona, importe, fecha, obra o concepto;
--   · una anulada o una cerrada no volvía a abrirse, y una real no se borraba («se anula, no se borra»);
--   · la rendición imputada no cambiaba de importe ni de entrega, y sólo se soltaba descartando el ticket;
--   · la devolución no se editaba ni se borraba (sólo se borraba anulando la entrega entera);
--   · la firma de conformidad no se podía borrar para repetirla («ya tiene la conformidad firmada»);
--   · los avisos en cola no se podían quitar ni corregir.
--
-- Todas las funciones nuevas son de Administración (`_efectivo_exigir_administracion` = `ve_economia()`),
-- como el resto de la gestión del efectivo. Ninguna tabla gana escritura directa: la app sigue escribiendo
-- sólo por funciones, que son las que PROPAGAN:
--
--   · Compras: una rendición que se borra encola «Estado = Cancelado» de su fila por la misma cola que ya usa
--     anular (`compra_obra_cambio`, tipo `anular`). Si la rendición es una compra reimputada a mano
--     (20260925T1000, otra rama), se le devuelve su Tipo pago con `_efectivo_soltar_reimputada`.
--   · CAJA: `_EFECTIVO_RAW` se reescribe entera desde `efectivo_movimiento_caja` en cada corrida del Flujo de
--     Caja. Editar el importe o borrar la entrega cambia la vista, y la réplica la sigue sola.
--   · vincular_rendiciones_pendientes: se corre ANTES de borrar, para que un ticket ya cargado en Compras y
--     todavía sin vínculo se cancele en vez de quedar huérfano; y el ticket borrado deja de existir o queda
--     descartado, así no se vuelve a vincular.
--   · Liquidación: un adelanto de sueldo rendido (20260925T1100) se suelta con `quitar_adelanto_rendido`, que
--     le saca el término a la celda «Pagado efectivo» de su quincena (una quincena cerrada lo frena, y lo dice).
--   · Avisos: lo que se borra se lleva sus avisos en cola (no sale un aviso de algo borrado). Cambiar la
--     persona borra la firma de la anterior y vuelve a pedirla a la nueva (`avisada_en = null`).
--
-- EL REGISTRO: `entidad_cambio` (20260821T5200, la bitácora del OS) con entidad = 'efectivo' y entidad_id =
-- la entrega. No bloquea nada, sólo registra quién cambió qué. Los importes van en claro, así que esas filas
-- sólo las lee `ve_economia()` (la política general deja leer la bitácora al jefe de obra).
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

set local lock_timeout = '5s';

-- ═══ 1 · LA BITÁCORA ═══════════════════════════════════════════════════════════════════════════════

drop policy if exists entidad_cambio_select on public.entidad_cambio;
create policy entidad_cambio_select on public.entidad_cambio for select to authenticated
  using ((select public.es_administracion()) and (entidad <> 'efectivo' or (select public.ve_economia())));

-- TG_ARGV: [0] la pieza (entrega, rendicion, devolucion, comprobante, aviso) · [1] los campos vigilados.
-- Las firmas no se copian (son SVG de decenas de KB): se registra «[firma]» o vacío.
create or replace function public._efectivo_bitacora() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pieza  text := tg_argv[0];
  v_campos text[] := string_to_array(tg_argv[1], ',');
  v_viejo  jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_nuevo  jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_firmas constant text[] := array['conformidad_trazo', 'firma_entrega', 'firma_recibe'];
  v_entrega text;
  v_campo text;
  v_antes text;
  v_despues text;
begin
  v_entrega := coalesce(v_viejo, v_nuevo) ->> case when v_pieza = 'entrega' then 'id' else 'entrega_id' end;
  if tg_op = 'DELETE' then
    insert into public.entidad_cambio (entidad, entidad_id, campo, antes, despues, autor)
    values ('efectivo', v_entrega, v_pieza || '.borrada',
            (v_viejo - v_firmas - 'texto' - 'conformidad_papel_url' - 'papel_url')::text, null, auth.uid());
    return old;
  end if;
  foreach v_campo in array v_campos loop
    v_antes := v_viejo ->> v_campo;
    v_despues := v_nuevo ->> v_campo;
    if v_antes is distinct from v_despues then
      if v_campo = any (v_firmas) then
        v_antes := case when v_antes is null then null else '[firma]' end;
        v_despues := case when v_despues is null then null else '[firma]' end;
      end if;
      insert into public.entidad_cambio (entidad, entidad_id, campo, antes, despues, autor)
      values ('efectivo', v_entrega, v_pieza || '.' || v_campo, v_antes, v_despues, auth.uid());
      -- Mover una pieza a otra entrega se ve también desde la entrega que la recibe.
      if v_campo = 'entrega_id' then
        insert into public.entidad_cambio (entidad, entidad_id, campo, antes, despues, autor)
        values ('efectivo', v_despues, v_pieza || '.entrega_id', v_antes, v_despues, auth.uid());
      end if;
    end if;
  end loop;
  return new;
end $$;
revoke all on function public._efectivo_bitacora() from public, anon, authenticated;

drop trigger if exists efectivo_entrega_bitacora on public.efectivo_entrega;
create trigger efectivo_entrega_bitacora after update or delete on public.efectivo_entrega
  for each row execute function public._efectivo_bitacora('entrega',
    'persona_id,obra_id,estructura,monto,para_que,fecha,conformidad_en,conformidad_trazo,conformidad_papel_url,cerrada_en,anulada_en,anulada_motivo,es_prueba');
drop trigger if exists efectivo_rendicion_bitacora on public.efectivo_rendicion;
create trigger efectivo_rendicion_bitacora after update or delete on public.efectivo_rendicion
  for each row execute function public._efectivo_bitacora('rendicion', 'entrega_id,monto,compra_clave');
drop trigger if exists efectivo_devolucion_bitacora on public.efectivo_devolucion;
create trigger efectivo_devolucion_bitacora after update or delete on public.efectivo_devolucion
  for each row execute function public._efectivo_bitacora('devolucion',
    'entrega_id,monto,fecha,recibida_por,nota,firma_entrega,firma_recibe,papel_url,confirmada_en');
drop trigger if exists efectivo_comprobante_bitacora on public.efectivo_comprobante;
create trigger efectivo_comprobante_bitacora after update or delete on public.efectivo_comprobante
  for each row execute function public._efectivo_bitacora('comprobante', 'entrega_id,descartado_en,descartado_motivo,observacion');
drop trigger if exists efectivo_aviso_bitacora on public.efectivo_aviso;
create trigger efectivo_aviso_bitacora after update or delete on public.efectivo_aviso
  for each row execute function public._efectivo_bitacora('aviso', 'entrega_id,texto');

-- ═══ 2 · LAS PIEZAS INTERNAS ═══════════════════════════════════════════════════════════════════════

-- SOLTAR UNA RENDICIÓN: su fila de Compras pasa a «Cancelado» (o, si fue una compra reimputada a mano, vuelve
-- a su Tipo pago), el ticket queda descartado para que `vincular_rendiciones_pendientes` no la vuelva a atar,
-- y el vínculo se borra. Es lo que `_efectivo_cancelar_filas_rendidas` hace con cada fila de una entrega,
-- para UNA sola. Se lee como jsonb para no depender de si `origen` (20260925T1000) ya existe.
create or replace function public._efectivo_soltar_rendicion(p_rendicion uuid, p_motivo text, p_usr uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  s record;
  v_nombre text;
begin
  select to_jsonb(x) into r from public.efectivo_rendicion x where x.id = p_rendicion for update;
  if r is null then return; end if;
  -- EL ADELANTO DE SUELDO no tiene fila de Compras: vive en Liquidación, y se saca de ahí.
  if r ->> 'adelanto_persona_id' is not null then
    perform public.quitar_adelanto_rendido(p_rendicion, p_motivo);
    return;
  end if;
  if coalesce(r ->> 'origen', 'ticket') <> 'ticket' then
    perform public._efectivo_soltar_reimputada(p_rendicion, p_usr, p_motivo);
    return;
  end if;
  select fila, sheet_id, estado, anulada into s from public.compra_sheet where clave = r ->> 'compra_clave' limit 1;
  if s.fila is null then
    raise exception 'la fila de Compras del comprobante % todavía no está en el espejo: esperá el próximo sync (minutos) y volvé a intentar', r ->> 'compra_clave'
      using errcode = 'P0001';
  end if;
  if not coalesce(s.anulada, false) then
    select nombre into v_nombre from public.perfiles where id = p_usr;
    insert into public.compra_obra_cambio
      (fila, clave, sheet_id, pestana, tipo, valor_anterior, valor_nuevo, origen, pedido_por, pedido_por_nombre)
    values
      (s.fila, r ->> 'compra_clave', s.sheet_id, 'Compras', 'anular', s.estado, 'Cancelado', 'app', p_usr, v_nombre);
  end if;
  update public.efectivo_comprobante
     set descartado_en = coalesce(descartado_en, now()),
         descartado_motivo = coalesce(descartado_motivo, 'se canceló su fila de Compras: ' || p_motivo)
   where id = (r ->> 'comprobante_id')::uuid;
  delete from public.efectivo_rendicion where id = p_rendicion;
end $$;
revoke all on function public._efectivo_soltar_rendicion(uuid, text, uuid) from public, anon, authenticated;

-- EL TICKET DE LA APP QUE TODAVÍA ESTÁ EN LA COLA DE LECTURA se rechaza: si no, el lector lo cargaría a Compras
-- como «A rendir» para una entrega que ya no lo tiene. Mismo cierre que `rehacer_foto_rendicion`.
create or replace function public._efectivo_sacar_de_la_cola(p_comprobante uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.comprobante_entrada ce join public.efectivo_comprobante c on c.entrada_id = ce.id
              where c.id = p_comprobante and ce.estado = 'procesando') then
    raise exception 'un ticket de esta entrega se está leyendo en este momento: probá de nuevo en un minuto' using errcode = 'P0001';
  end if;
  update public.comprobante_entrada ce
     set estado = 'rechazado', motivo = p_motivo, cerrado_at = now()
    from public.efectivo_comprobante c
   where c.id = p_comprobante and ce.id = c.entrada_id and ce.estado in ('pendiente', 'en_espera', 'error');
end $$;
revoke all on function public._efectivo_sacar_de_la_cola(uuid, text) from public, anon, authenticated;

-- LOS ADELANTOS DE SUELDO DE UNA ENTREGA SALEN DE LIQUIDACIÓN antes de anularla o borrarla: si no,
-- `anular_entrega_efectivo` (20260925T1100) frena pidiendo quitarlos a mano, y borrar dejaría la celda sumada.
create or replace function public._efectivo_quitar_adelantos(p_entrega uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select x.id from public.efectivo_rendicion x
            where x.entrega_id = p_entrega and to_jsonb(x) ->> 'adelanto_persona_id' is not null loop
    perform public.quitar_adelanto_rendido(r.id, p_motivo);
  end loop;
end $$;
revoke all on function public._efectivo_quitar_adelantos(uuid, text) from public, anon, authenticated;

-- MOVER UN TICKET A OTRA ENTREGA: el ticket, todas sus rendiciones y sus avisos viajan juntos.
create or replace function public._efectivo_mover_comprobante(p_comprobante uuid, p_entrega uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare d public.efectivo_entrega;
begin
  select * into d from public.efectivo_entrega where id = p_entrega;
  if d.id is null then raise exception 'la entrega de destino no existe' using errcode = 'P0001'; end if;
  if d.anulada_en is not null then
    raise exception '% está anulada: reabrila antes de pasarle un comprobante', d.codigo using errcode = 'P0001';
  end if;
  update public.efectivo_comprobante set entrega_id = p_entrega where id = p_comprobante and entrega_id <> p_entrega;
  update public.efectivo_rendicion  set entrega_id = p_entrega where comprobante_id = p_comprobante and entrega_id <> p_entrega;
  update public.efectivo_aviso      set entrega_id = p_entrega where comprobante_id = p_comprobante and entrega_id <> p_entrega;
end $$;
revoke all on function public._efectivo_mover_comprobante(uuid, uuid) from public, anon, authenticated;

-- ═══ 3 · LA ENTREGA ════════════════════════════════════════════════════════════════════════════════

create or replace function public.editar_entrega_efectivo(
  p_entrega uuid, p_persona uuid, p_obra text, p_estructura boolean, p_monto numeric, p_para_que text, p_fecha date
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._efectivo_exigir_administracion();
  e public.efectivo_entrega;
  v_obra text := nullif(btrim(coalesce(p_obra, '')), '');
  v_otra boolean;
  v_habia_firma boolean;
begin
  select * into e from public.efectivo_entrega where id = p_entrega for update;
  if e.id is null then raise exception 'la entrega no existe' using errcode = 'P0001'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'el importe tiene que ser mayor que cero' using errcode = 'P0001'; end if;
  if p_fecha is null then raise exception 'falta la fecha' using errcode = 'P0001'; end if;
  if (v_obra is not null) = coalesce(p_estructura, false) then
    raise exception 'la entrega va a una obra o a «Estructura»: una de las dos' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.personas where id = p_persona) then raise exception 'la persona no existe' using errcode = 'P0001'; end if;
  if v_obra is not null and not exists (select 1 from public.obra_canonica where id = v_obra) then
    raise exception 'la obra % no está en el índice de obras', v_obra using errcode = 'P0001';
  end if;
  -- OTRA PERSONA, OTRA FIRMA: la conformidad de la anterior no vale para la nueva, y la nueva recibe el
  -- pedido de firma (el drenador de la VM lo manda cuando `avisada_en` vuelve a null).
  v_otra := p_persona is distinct from e.persona_id;
  v_habia_firma := e.conformidad_en is not null or e.conformidad_papel_url is not null;
  update public.efectivo_entrega
     set persona_id = p_persona, obra_id = v_obra, estructura = coalesce(p_estructura, false),
         monto = round(p_monto, 2), para_que = nullif(btrim(coalesce(p_para_que, '')), ''), fecha = p_fecha,
         conformidad_en        = case when v_otra then null else conformidad_en end,
         conformidad_trazo     = case when v_otra then null else conformidad_trazo end,
         conformidad_papel_url = case when v_otra then null else conformidad_papel_url end,
         avisada_en            = case when v_otra then null else avisada_en end,
         aviso_post_id         = case when v_otra then null else aviso_post_id end
   where id = p_entrega;
  if v_otra then
    delete from public.efectivo_aviso where entrega_id = p_entrega and enviado_en is null and destino = 'persona';
  end if;
  return jsonb_build_object('codigo', e.codigo, 'firma_borrada', v_otra and v_habia_firma);
end $$;
comment on function public.editar_entrega_efectivo(uuid, uuid, text, boolean, numeric, text, date) is
  'Administración corrige una entrega en cualquier estado: persona, destino, importe, concepto y fecha. Cambiar '
  'la persona borra la firma de la anterior y vuelve a pedirla. CAJA la sigue por _EFECTIVO_RAW.';

create or replace function public.cambiar_estado_entrega_efectivo(p_entrega uuid, p_estado text, p_motivo text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._efectivo_exigir_administracion();
  e public.efectivo_entrega;
begin
  select * into e from public.efectivo_entrega where id = p_entrega for update;
  if e.id is null then raise exception 'la entrega no existe' using errcode = 'P0001'; end if;
  if p_estado = 'anulada' then
    perform public.vincular_rendiciones_pendientes();
    perform public._efectivo_quitar_adelantos(p_entrega, 'se anuló la entrega ' || e.codigo);
    perform public.anular_entrega_efectivo(p_entrega, coalesce(nullif(btrim(p_motivo), ''), 'anulada desde la ficha'));
    return;
  end if;
  if p_estado not in ('abierta', 'cerrada') then raise exception 'estado desconocido: %', p_estado using errcode = 'P0001'; end if;
  -- Reabrir una anulada: lo que la anulación canceló (filas de Compras, tickets, devolución) no vuelve solo;
  -- vuelve la entrega, con su importe, a CAJA. El aviso de anulación que no salió todavía ya no corresponde.
  update public.efectivo_entrega
     set anulada_en = null, anulada_por = null, anulada_motivo = null,
         cerrada_en = case when p_estado = 'cerrada' then coalesce(cerrada_en, now()) else null end
   where id = p_entrega;
  delete from public.efectivo_aviso where entrega_id = p_entrega and tipo = 'anulacion' and enviado_en is null;
end $$;
comment on function public.cambiar_estado_entrega_efectivo(uuid, text, text) is
  'Administración pone una entrega abierta, cerrada (sin exigir el cero) o anulada (anular_entrega_efectivo).';

create or replace function public.borrar_entrega_efectivo(p_entrega uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._efectivo_exigir_administracion();
  e public.efectivo_entrega;
  c record;
begin
  select * into e from public.efectivo_entrega where id = p_entrega for update;
  if e.id is null then raise exception 'la entrega no existe' using errcode = 'P0001'; end if;
  -- Un ticket ya cargado en Compras y todavía sin vínculo quedaría huérfano: se ata primero y se cancela.
  perform public.vincular_rendiciones_pendientes();
  perform public._efectivo_quitar_adelantos(p_entrega, 'se borró la entrega ' || e.codigo);
  perform public._efectivo_cancelar_filas_rendidas(p_entrega, 'se borró la entrega ' || e.codigo, v_usr);
  for c in select id from public.efectivo_comprobante where entrega_id = p_entrega loop
    perform public._efectivo_sacar_de_la_cola(c.id, 'se borró la entrega ' || e.codigo);
  end loop;
  delete from public.efectivo_aviso
   where entrega_id = p_entrega
      or comprobante_id in (select id from public.efectivo_comprobante where entrega_id = p_entrega);
  delete from public.efectivo_rendicion
   where entrega_id = p_entrega
      or comprobante_id in (select id from public.efectivo_comprobante where entrega_id = p_entrega);
  delete from public.efectivo_devolucion  where entrega_id = p_entrega;
  delete from public.efectivo_comprobante where entrega_id = p_entrega;
  delete from public.efectivo_entrega     where id = p_entrega;
  return e.codigo;
end $$;
comment on function public.borrar_entrega_efectivo(uuid) is
  'Administración borra una entrega en cualquier estado: cancela sus filas de Compras por la cola, saca sus '
  'tickets de la cola de lectura y borra avisos, rendiciones, devoluciones y tickets. Queda en entidad_cambio.';

-- LA FIRMA DE CONFORMIDAD SE BORRA PARA REPETIRLA: con `p_repedir` la persona vuelve a recibir el enlace.
create or replace function public.borrar_firma_entrega_efectivo(p_entrega uuid, p_repedir boolean default true)
returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._efectivo_exigir_administracion();
begin
  update public.efectivo_entrega
     set conformidad_en = null, conformidad_trazo = null, conformidad_papel_url = null,
         avisada_en    = case when coalesce(p_repedir, true) then null else avisada_en end,
         aviso_post_id = case when coalesce(p_repedir, true) then null else aviso_post_id end
   where id = p_entrega;
  if not found then raise exception 'la entrega no existe' using errcode = 'P0001'; end if;
end $$;

-- ═══ 4 · LA RENDICIÓN Y EL TICKET ══════════════════════════════════════════════════════════════════

create or replace function public.editar_rendicion_efectivo(p_rendicion uuid, p_monto numeric, p_entrega uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._efectivo_exigir_administracion();
  r public.efectivo_rendicion;
begin
  select * into r from public.efectivo_rendicion where id = p_rendicion for update;
  if r.id is null then raise exception 'esa rendición ya no existe' using errcode = 'P0001'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'el importe tiene que ser mayor que cero' using errcode = 'P0001'; end if;
  if to_jsonb(r) ->> 'adelanto_persona_id' is not null
     and (round(p_monto, 2) <> r.monto or (p_entrega is not null and p_entrega <> r.entrega_id)) then
    raise exception 'un adelanto de sueldo está sumado en Liquidación: se corrige quitándolo («Quitar») y cargándolo de nuevo' using errcode = 'P0001';
  end if;
  if p_entrega is not null and p_entrega <> r.entrega_id then
    if r.comprobante_id is not null then
      perform public._efectivo_mover_comprobante(r.comprobante_id, p_entrega);
    else
      if not exists (select 1 from public.efectivo_entrega where id = p_entrega and anulada_en is null) then
        raise exception 'la entrega de destino no existe o está anulada' using errcode = 'P0001';
      end if;
      update public.efectivo_rendicion set entrega_id = p_entrega where id = p_rendicion;
    end if;
  end if;
  update public.efectivo_rendicion set monto = round(p_monto, 2) where id = p_rendicion;
end $$;
comment on function public.editar_rendicion_efectivo(uuid, numeric, uuid) is
  'Administración corrige cuánto rinde una fila de Compras y a qué entrega. La fila de Compras no cambia.';

create or replace function public.borrar_rendicion_efectivo(p_rendicion uuid, p_motivo text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._efectivo_exigir_administracion();
begin
  if not exists (select 1 from public.efectivo_rendicion where id = p_rendicion) then
    raise exception 'esa rendición ya no existe' using errcode = 'P0001';
  end if;
  perform public._efectivo_soltar_rendicion(p_rendicion, coalesce(nullif(btrim(p_motivo), ''), 'borrada desde Efectivo'), v_usr);
end $$;
comment on function public.borrar_rendicion_efectivo(uuid, text) is
  'Administración borra una rendición: su fila de Compras pasa a Cancelado por la cola (o vuelve a su Tipo pago si fue reimputada).';

create or replace function public.mover_comprobante_efectivo(p_comprobante uuid, p_entrega uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._efectivo_exigir_administracion();
begin
  if not exists (select 1 from public.efectivo_comprobante where id = p_comprobante) then
    raise exception 'el comprobante no existe' using errcode = 'P0001';
  end if;
  perform public._efectivo_mover_comprobante(p_comprobante, p_entrega);
end $$;

create or replace function public.borrar_comprobante_efectivo(p_comprobante uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._efectivo_exigir_administracion();
  r record;
begin
  if not exists (select 1 from public.efectivo_comprobante where id = p_comprobante) then
    raise exception 'el comprobante no existe' using errcode = 'P0001';
  end if;
  perform public.vincular_rendiciones_pendientes();
  for r in select id from public.efectivo_rendicion where comprobante_id = p_comprobante loop
    perform public._efectivo_soltar_rendicion(r.id, 'se borró el comprobante', v_usr);
  end loop;
  perform public._efectivo_sacar_de_la_cola(p_comprobante, 'se borró el ticket desde Efectivo');
  delete from public.efectivo_aviso where comprobante_id = p_comprobante;
  delete from public.efectivo_comprobante where id = p_comprobante;
end $$;
comment on function public.borrar_comprobante_efectivo(uuid) is
  'Administración borra un ticket: cancela la fila de Compras que haya escrito, lo saca de la cola de lectura y borra sus avisos.';

-- ═══ 5 · LA DEVOLUCIÓN ═════════════════════════════════════════════════════════════════════════════

create or replace function public.editar_devolucion_efectivo(
  p_devolucion uuid, p_monto numeric, p_fecha date, p_recibida_por uuid, p_nota text,
  p_firma_recibe text default null, p_borrar_firma_entrega boolean default false, p_borrar_firma_recibe boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._efectivo_exigir_administracion();
  v_firma text := nullif(btrim(coalesce(p_firma_recibe, '')), '');
begin
  if p_monto is null or p_monto <= 0 then raise exception 'el importe tiene que ser mayor que cero' using errcode = 'P0001'; end if;
  if p_fecha is null then raise exception 'falta la fecha' using errcode = 'P0001'; end if;
  if p_recibida_por is not null and not exists (select 1 from public.personas where id = p_recibida_por) then
    raise exception 'la persona que recibió no existe' using errcode = 'P0001';
  end if;
  update public.efectivo_devolucion
     set monto = round(p_monto, 2), fecha = p_fecha, recibida_por = p_recibida_por,
         nota = nullif(btrim(coalesce(p_nota, '')), ''),
         firma_recibe    = case when v_firma is not null then v_firma when p_borrar_firma_recibe then null else firma_recibe end,
         firma_recibe_en = case when v_firma is not null then now() when p_borrar_firma_recibe then null else firma_recibe_en end,
         firma_entrega    = case when p_borrar_firma_entrega then null else firma_entrega end,
         firma_entrega_en = case when p_borrar_firma_entrega then null else firma_entrega_en end
   where id = p_devolucion;
  if not found then raise exception 'la devolución no existe' using errcode = 'P0001'; end if;
end $$;

create or replace function public.borrar_devolucion_efectivo(p_devolucion uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._efectivo_exigir_administracion();
begin
  delete from public.efectivo_devolucion where id = p_devolucion;
  if not found then raise exception 'la devolución no existe' using errcode = 'P0001'; end if;
end $$;

-- ═══ 6 · LOS AVISOS ════════════════════════════════════════════════════════════════════════════════

-- Sólo el que no salió: el post de Mattermost ya publicado no se cambia desde la base. Corregirlo lo vuelve
-- a intentar desde cero (un aviso que falló cinco veces sale de nuevo).
create or replace function public.editar_aviso_efectivo(p_aviso uuid, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._efectivo_exigir_administracion(); a public.efectivo_aviso;
begin
  if nullif(btrim(coalesce(p_texto, '')), '') is null then raise exception 'el aviso no puede quedar vacío' using errcode = 'P0001'; end if;
  select * into a from public.efectivo_aviso where id = p_aviso for update;
  if a.id is null then raise exception 'el aviso no existe' using errcode = 'P0001'; end if;
  if a.enviado_en is not null then
    raise exception 'ese aviso ya salió por Mattermost: se puede borrar de acá, pero el mensaje publicado no cambia' using errcode = 'P0001';
  end if;
  update public.efectivo_aviso set texto = btrim(p_texto), intentos = 0, ultimo_error = null where id = p_aviso;
end $$;

create or replace function public.borrar_aviso_efectivo(p_aviso uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._efectivo_exigir_administracion();
begin
  delete from public.efectivo_aviso where id = p_aviso;
  if not found then raise exception 'el aviso no existe' using errcode = 'P0001'; end if;
end $$;

-- ═══ 7 · PERMISOS ═════════════════════════════════════════════════════════════════════════════════

revoke all on function
  public.editar_entrega_efectivo(uuid, uuid, text, boolean, numeric, text, date),
  public.cambiar_estado_entrega_efectivo(uuid, text, text),
  public.borrar_entrega_efectivo(uuid),
  public.borrar_firma_entrega_efectivo(uuid, boolean),
  public.editar_rendicion_efectivo(uuid, numeric, uuid),
  public.borrar_rendicion_efectivo(uuid, text),
  public.mover_comprobante_efectivo(uuid, uuid),
  public.borrar_comprobante_efectivo(uuid),
  public.editar_devolucion_efectivo(uuid, numeric, date, uuid, text, text, boolean, boolean),
  public.borrar_devolucion_efectivo(uuid),
  public.editar_aviso_efectivo(uuid, text),
  public.borrar_aviso_efectivo(uuid)
from public, anon;
grant execute on function
  public.editar_entrega_efectivo(uuid, uuid, text, boolean, numeric, text, date),
  public.cambiar_estado_entrega_efectivo(uuid, text, text),
  public.borrar_entrega_efectivo(uuid),
  public.borrar_firma_entrega_efectivo(uuid, boolean),
  public.editar_rendicion_efectivo(uuid, numeric, uuid),
  public.borrar_rendicion_efectivo(uuid, text),
  public.mover_comprobante_efectivo(uuid, uuid),
  public.borrar_comprobante_efectivo(uuid),
  public.editar_devolucion_efectivo(uuid, numeric, date, uuid, text, text, boolean, boolean),
  public.borrar_devolucion_efectivo(uuid),
  public.editar_aviso_efectivo(uuid, text),
  public.borrar_aviso_efectivo(uuid)
to authenticated;

notify pgrst, 'reload schema';
