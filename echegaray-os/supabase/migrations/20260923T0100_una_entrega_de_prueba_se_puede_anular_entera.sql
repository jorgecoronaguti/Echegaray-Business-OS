-- ANULAR UNA ENTREGA QUE YA TIENE UNA DEVOLUCIÓN O UN TICKET COLGANDO.
--
-- ═══ QUÉ ESTABA ROTO (dueño, 22/09/2026) ═══
--
-- Textual: *«se tiene q poder eliminar o anular lo de modulo efectivo siendo usuario admin, ahora no
-- puedo borrar nada de las pruebas»*. Medido en la base esa misma noche: ER-0005 tiene una devolución
-- y un ticket, y `anular_entrega_efectivo` corta con «ya tiene rendiciones o devoluciones: no se
-- anula, se cierra con devolución». La regla estaba pensada para una entrega REAL —una entrega con
-- plata que volvió a la caja no se borra, se cierra— y dejó sin salida al caso que más se repite
-- mientras un módulo nace: la prueba a medio hacer.
--
-- ═══ LO QUE SIGUE PROHIBIDO, Y POR QUÉ ═══
--
-- Una rendición IMPUTADA escribió una fila en la pestaña Compras del Sheet. Anular la entrega que la
-- respalda dejaría esa fila viva, con «A rendir» como medio de pago y sin ninguna entrega detrás:
-- plata gastada que ya no le pertenece a nadie. Eso se sigue negando, y el mensaje dice exactamente
-- qué hacer antes (descartar el comprobante, que es la puerta que SÍ sabe deshacer la fila).
--
-- Una DEVOLUCIÓN, en cambio, no salió del sistema: es una fila que dice «este vuelto volvió a la
-- caja». Si la entrega nunca debió existir, su vuelto tampoco: se borra con ella. Lo mismo el ticket
-- que todavía no llegó a Compras, que pasa a `descartado` con el motivo de la anulación —no se borra,
-- porque la foto y su lectura existieron y el rastro del archivo se conserva—.
--
-- ═══ LA ANULACIÓN DEJA DE SER UN DATO QUE ESTORBA ═══
--
-- `efectivo_entrega_saldo` ya nace sin las anuladas (20260922T1500, línea 121). Lo que faltaba es
-- decirlo en la ficha de la persona y en el listado: hasta hoy ER-0001, ER-0002 y ER-0004 seguían a
-- la vista, anuladas y sin forma de sacarlas. La pantalla las oculta salvo que se pidan; la vista
-- `efectivo_entrega_anulada` es de dónde salen cuando se piden.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

create or replace function public.anular_entrega_efectivo(p_entrega uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._efectivo_exigir_administracion();
  e efectivo_entrega;
  v_imputadas integer;
begin
  if nullif(trim(p_motivo), '') is null then raise exception 'anular pide el motivo' using errcode = 'P0001'; end if;
  select * into e from efectivo_entrega where id = p_entrega for update;
  if e.id is null then raise exception 'la entrega no existe' using errcode = 'P0001'; end if;
  if e.anulada_en is not null then return; end if;

  -- LO QUE YA ESTÁ EN COMPRAS NO SE DESHACE DESDE ACÁ.
  select count(*) into v_imputadas from efectivo_rendicion where entrega_id = p_entrega;
  if v_imputadas > 0 then
    raise exception '% tiene % comprobante(s) ya cargados en Compras. Descartalos primero desde la ficha (eso deshace la fila); después se anula.',
      e.codigo, v_imputadas using errcode = 'P0001';
  end if;

  -- EL VUELTO DE UNA ENTREGA QUE NO DEBIÓ EXISTIR TAMPOCO EXISTIÓ.
  delete from efectivo_devolucion where entrega_id = p_entrega;

  -- EL TICKET EN CAMINO QUEDA DESCARTADO, NO BORRADO: la foto se subió y se leyó de verdad.
  update efectivo_comprobante
     set descartado_en = now(),
         descartado_motivo = 'la entrega se anuló: ' || trim(p_motivo)
   where entrega_id = p_entrega and descartado_en is null;

  update efectivo_entrega
     set anulada_en = now(), anulada_por = v_usr, anulada_motivo = trim(p_motivo)
   where id = p_entrega;
end $$;

comment on function public.anular_entrega_efectivo(uuid, text) is
  'Anula una entrega de efectivo que NO tiene comprobantes cargados en Compras. Borra su devolución '
  '(el vuelto de una entrega que no existió tampoco existió) y descarta sus tickets en camino. Con '
  'una rendición imputada se niega y dice qué hacer antes.';

-- ── LAS ANULADAS, CUANDO SE PIDEN ────────────────────────────────────────────────────────────────
-- Misma forma que `efectivo_entrega_saldo` pero al revés: sólo las anuladas, con quién y por qué. La
-- pantalla no las mezcla con las vivas —un saldo anulado no es plata en la calle— y por eso es otra
-- vista y no un parámetro.
create or replace view public.efectivo_entrega_anulada with (security_invoker = true) as
  select e.id, e.codigo, e.persona_id, p.nombre_completo as persona, e.obra_id, o.nombre as obra,
         e.estructura, e.monto, e.para_que, e.fecha,
         e.anulada_en, e.anulada_motivo, e.anulada_por,
         pf.nombre as anulada_por_nombre
    from public.efectivo_entrega e
    left join public.personas p on p.id = e.persona_id
    left join public.obra_canonica o on o.id = e.obra_id
    -- Quién anuló es un USUARIO (`perfiles.id`), no una persona del plantel: el vínculo lo tiene
    -- `perfiles.persona_id`, y el nombre del perfil alcanza cuando no hay persona atrás.
    left join public.perfiles pf on pf.id = e.anulada_por
   where e.anulada_en is not null;

comment on view public.efectivo_entrega_anulada is
  'Las entregas anuladas, con motivo y autor. La ficha y el listado las esconden; esta vista es de '
  'dónde salen cuando alguien las pide.';

revoke all on public.efectivo_entrega_anulada from anon, public;
grant select on public.efectivo_entrega_anulada to authenticated;

notify pgrst, 'reload schema';
