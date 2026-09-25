-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- HERRAMIENTAS · FACTURA SERSOLIN A 00002-00000897: GUANTES Y ANTEOJOS DEL PRESUPUESTO 2233 AL TALLER
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Dueño, 25/09/2026: confirmó que la factura A 00002-00000897 del 09/09/2026 ($423.074,56; neto
-- $349.648,40; en ARCA, sin PDF) son los guantes y anteojos del presupuesto X 00002233 sin el chaleco.
-- Entra como compra real al Taller, fechada el 09/09, con la factura como origen del movimiento. El
-- precio de referencia del presupuesto pasa a ser el precio de compra (y deja de ser «referencia»).
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

do $$
declare
  v_f897 uuid := 'b35ebb82-be9f-4867-8108-efde08b0f719';
  v_taller uuid;
  v_nota text := 'compra · Factura A 00002-00000897 SERSOLIN (09/09/2026; confirmada por el dueño el 25/09 = presupuesto 2233 sin el chaleco)';
  r record; v_id uuid; v_neto numeric := 0;
begin
  select id into v_taller from ubicacion where tipo = 'taller' and not archivada;
  if not exists (select 1 from comprobantes_arca where id = v_f897 and numero = '897' and emisor_cuit = '30718320514' and neto_gravado = 349648.40) then
    raise exception 'la factura 897 no está en ARCA como se espera';
  end if;
  if exists (select 1 from activo_movimiento where comprobante_id = v_f897) then raise exception 'la factura 897 ya está cargada'; end if;
  for r in select * from (values
    ('GUA-004', 50, 2812.50), ('GUA-005', 50, 1087.50), ('GUA-001', 10, 5125.00),
    ('ANT-002', 50, 1477.12), ('ANT-001', 20, 1477.12)
  ) v(codigo, unidades, precio) loop
    select id into v_id from activo where codigo = r.codigo and compra_proveedor_id = '10adbd84-1791-4aa7-9b35-e9fc246d09e0' and precio_referencia = r.precio;
    if v_id is null then raise exception '% no es el producto SERSOLIN esperado', r.codigo; end if;
    update activo set compra_precio = r.precio, compra_fecha = date '2026-09-09', precio_referencia = null, precio_referencia_de = null where id = v_id;
    insert into activo_movimiento (activo_id, origen_id, destino_id, fecha_hora, usuario_id, usuario_texto, nota, cantidad, comprobante_id)
    values (v_id, null, v_taller, '2026-09-09 12:00:00-03', null, 'Factura SERSOLIN 897', v_nota, r.unidades, v_f897);
    insert into activo_existencia (activo_id, ubicacion_id, cantidad) values (v_id, v_taller, r.unidades)
    on conflict (activo_id, ubicacion_id) do update set cantidad = activo_existencia.cantidad + excluded.cantidad;
    perform public._activo_recalcular(v_id);
    v_neto := v_neto + r.unidades * r.precio;
  end loop;
  if v_neto <> 349648.40 then raise exception 'el neto no cierra: % ≠ 349.648,40', v_neto; end if;
  raise notice 'factura 897: 180 unidades al Taller, neto % (= ARCA)', v_neto;
end $$;
