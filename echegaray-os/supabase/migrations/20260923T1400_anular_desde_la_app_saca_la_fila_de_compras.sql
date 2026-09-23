-- ANULAR DESDE LA APP SACA LA FILA DE COMPRAS (dueño, 23/09/2026)
--
-- «Voy a hacer muchas pruebas del módulo efectivo por todos lados, quiero que me permita borrar/anular y
-- que se quite de pestañas Compras y Caja». Y después: «tenés que sacarlas si pongo anular desde
-- app.ecsas.com.ar».
--
-- Hasta hoy `anular_entrega_efectivo` y `borrar_entrega_de_prueba` se negaban si la entrega tenía una
-- rendición imputada («vaciá esas filas en el Sheet y volvé»), y `descartar_comprobante_rendicion` se
-- negaba si el ticket ya estaba en Compras. Eso deja al dueño limpiando a mano lo que el bot escribió
-- solo. Ahora la anulación ENCOLA un cambio por fila rendida en `compra_obra_cambio` (tipo `anular`) y el
-- worker de la cola —el único que escribe el Sheet— pone «Estado = Cancelado» en esa fila, con la misma
-- huella que usa para la obra y el pago: la fila tiene que seguir siendo la misma compra.
--
-- La web sigue sin escribir Compras: acá sólo se encola. La evidencia del efecto es la fila releída por
-- el worker (`leido_de_vuelta`), y el espejo `compra_sheet` la trae `anulada` en el próximo sync.
--
-- La fila NO se vacía: `_MOVIMIENTOS` indexa Compras por posición y correr las de abajo cambia el
-- estado de otras compras. «Cancelado» es el texto que la pestaña ya usa para una fila anulada.

set local lock_timeout = '5s';

alter table public.compra_obra_cambio drop constraint if exists compra_obra_cambio_tipo_chk;
alter table public.compra_obra_cambio add constraint compra_obra_cambio_tipo_chk
  check (tipo in ('obra', 'pago', 'anular'));
comment on column public.compra_obra_cambio.tipo is
  'obra = la celda Obra de la fila. pago = varias celdas de los tramos de pago (celdas). anular = la celda Estado ← Cancelado de una fila que escribió una rendición de efectivo.';

-- ═══ LA PIEZA COMÚN: encolar la cancelación de cada fila rendida y soltar el vínculo ═══
--
-- Devuelve cuántas filas encoló. Una rendición cuya fila no está en el espejo todavía (el sync corre
-- cada tanto) frena la anulación con un mensaje claro: encolar sin número de fila sería escribir a ciegas.
create or replace function public._efectivo_cancelar_filas_rendidas(p_entrega uuid, p_motivo text, p_usr uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  s record;
  v_n integer := 0;
  v_nombre text;
begin
  select nombre into v_nombre from public.perfiles where id = p_usr;
  for r in select * from public.efectivo_rendicion where entrega_id = p_entrega loop
    select fila, sheet_id, estado, anulada into s from public.compra_sheet where clave = r.compra_clave limit 1;
    if s.fila is null then
      raise exception 'la fila de Compras del comprobante % todavía no está en el espejo: esperá el próximo sync y volvé a anular', r.compra_clave
        using errcode = 'P0001';
    end if;
    if not coalesce(s.anulada, false) then
      insert into public.compra_obra_cambio
        (fila, clave, sheet_id, pestana, tipo, valor_anterior, valor_nuevo, origen, pedido_por, pedido_por_nombre)
      values
        (s.fila, r.compra_clave, s.sheet_id, 'Compras', 'anular', s.estado, 'Cancelado', 'app', p_usr, v_nombre);
      v_n := v_n + 1;
    end if;
    -- El ticket queda descartado con el motivo: la fila que produjo se cancela, y el vínculo se suelta.
    update public.efectivo_comprobante
       set descartado_en = coalesce(descartado_en, now()),
           descartado_motivo = coalesce(descartado_motivo, 'se canceló su fila de Compras: ' || trim(p_motivo))
     where id = r.comprobante_id;
    delete from public.efectivo_rendicion where id = r.id;
  end loop;
  return v_n;
end $$;
revoke all on function public._efectivo_cancelar_filas_rendidas(uuid, text, uuid) from public, anon, authenticated;

-- ═══ ANULAR: ya no se niega con rendiciones ═══
create or replace function public.anular_entrega_efectivo(p_entrega uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._efectivo_exigir_administracion();
  e efectivo_entrega;
begin
  if nullif(trim(p_motivo), '') is null then raise exception 'anular pide el motivo' using errcode = 'P0001'; end if;
  select * into e from efectivo_entrega where id = p_entrega for update;
  if e.id is null then raise exception 'la entrega no existe' using errcode = 'P0001'; end if;
  if e.anulada_en is not null then return; end if;
  perform public._efectivo_cancelar_filas_rendidas(p_entrega, p_motivo, v_usr);
  delete from efectivo_devolucion where entrega_id = p_entrega;
  update efectivo_comprobante
     set descartado_en = now(),
         descartado_motivo = 'la entrega se anuló: ' || trim(p_motivo)
   where entrega_id = p_entrega and descartado_en is null;
  update efectivo_entrega
     set anulada_en = now(), anulada_por = v_usr, anulada_motivo = trim(p_motivo)
   where id = p_entrega;
end $$;
comment on function public.anular_entrega_efectivo(uuid, text) is
  'Anula una entrega de efectivo. Borra su devolución, descarta sus tickets y encola la cancelación '
  '(Estado = Cancelado) de cada fila de Compras que sus rendiciones escribieron; el worker de la cola la aplica.';

-- ═══ BORRAR UNA PRUEBA: tampoco se niega ═══
create or replace function public.borrar_entrega_de_prueba(p_entrega uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._efectivo_exigir_administracion();
  e efectivo_entrega;
begin
  select * into e from public.efectivo_entrega where id = p_entrega for update;
  if e.id is null then raise exception 'la entrega no existe' using errcode = 'P0001'; end if;
  if not e.es_prueba then
    raise exception '% no está declarada prueba: se anula, no se borra.', e.codigo using errcode = 'P0001';
  end if;
  perform public._efectivo_cancelar_filas_rendidas(p_entrega, 'prueba borrada ' || e.codigo, v_usr);
  delete from public.efectivo_devolucion  where entrega_id = p_entrega;
  delete from public.efectivo_comprobante where entrega_id = p_entrega;
  delete from public.efectivo_entrega     where id = p_entrega;
  return e.codigo;
end $$;

-- ═══ DESCARTAR UN TICKET YA CARGADO: cancela su fila ═══
create or replace function public.descartar_comprobante_rendicion(p_comprobante uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._efectivo_exigir_administracion();
  r record;
  s record;
  v_nombre text;
begin
  if nullif(trim(p_motivo), '') is null then raise exception 'descartar pide el motivo' using errcode = 'P0001'; end if;
  select * into r from efectivo_rendicion where comprobante_id = p_comprobante;
  if r.id is not null then
    select fila, sheet_id, estado, anulada into s from public.compra_sheet where clave = r.compra_clave limit 1;
    if s.fila is null then
      raise exception 'la fila de Compras del comprobante % todavía no está en el espejo: esperá el próximo sync', r.compra_clave
        using errcode = 'P0001';
    end if;
    select nombre into v_nombre from public.perfiles where id = v_usr;
    if not coalesce(s.anulada, false) then
      insert into public.compra_obra_cambio
        (fila, clave, sheet_id, pestana, tipo, valor_anterior, valor_nuevo, origen, pedido_por, pedido_por_nombre)
      values
        (s.fila, r.compra_clave, s.sheet_id, 'Compras', 'anular', s.estado, 'Cancelado', 'app', v_usr, v_nombre);
    end if;
    delete from efectivo_rendicion where id = r.id;
  end if;
  update efectivo_comprobante set descartado_en = now(), descartado_motivo = trim(p_motivo) where id = p_comprobante;
  if not found then raise exception 'el comprobante no existe' using errcode = 'P0001'; end if;
end $$;
comment on function public.descartar_comprobante_rendicion(uuid, text) is
  'Descarta un ticket de rendición. Si ya estaba cargado en Compras, encola la cancelación de esa fila '
  '(Estado = Cancelado) y suelta el vínculo con la entrega; el worker de la cola escribe el Sheet.';
