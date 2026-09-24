-- BORRAR UNA ENTREGA DE PRUEBA FALLABA SI YA HABÍA AVISADO (24/09/2026, al borrar las pruebas por pedido
-- del dueño: «sí, borrá todo lo de prueba»). `borrar_entrega_de_prueba` borraba devoluciones,
-- comprobantes y la entrega, pero no `efectivo_aviso` ni `efectivo_rendicion`, que también apuntan a la
-- entrega (y al comprobante) sin cascada: toda entrega que ya había mandado su link de firma chocaba con
-- la FK y no se podía borrar. Se borran en orden de dependencia. Las filas rendidas en Compras las
-- sigue cancelando `_efectivo_cancelar_filas_rendidas`, antes de tocar nada.
create or replace function public.borrar_entrega_de_prueba(p_entrega uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
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
end $function$;
