-- EFECTIVO A RENDIR: CERRAR UNA ENTREGA RENDIDA ENTERA (22/09/2026).
--
-- Defecto encontrado al construir D06: la única forma de poner `cerrada_en` era una devolución, que
-- exige monto > 0. Una entrega rendida al peso (en su poder = 0) quedaba para siempre «lista para
-- cerrar». Se cierra sólo si de verdad no queda nada: ni plata en su poder, ni un ticket todavía
-- leyéndose u observado (cerrar con un ticket en camino dejaría ese gasto sin entrega a la que rendir).
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.
create or replace function public.cerrar_entrega_efectivo(p_entrega uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._efectivo_exigir_administracion(); e efectivo_entrega; v_poder numeric;
begin
  select * into e from efectivo_entrega where id = p_entrega for update;
  if e.id is null then raise exception 'la entrega no existe' using errcode = 'P0001'; end if;
  if e.anulada_en is not null then raise exception '% está anulada', e.codigo using errcode = 'P0001'; end if;
  if e.cerrada_en is not null then return; end if;
  select en_su_poder into v_poder from efectivo_entrega_saldo where id = p_entrega;
  if v_poder <> 0 then
    raise exception '% tiene % en su poder: se cierra con la devolución', e.codigo, v_poder using errcode = 'P0001';
  end if;
  if exists (select 1 from efectivo_comprobante_estado
              where entrega_id = p_entrega and estado in ('leyendo', 'observado', 'respondido', 'error')) then
    raise exception '% tiene tickets todavía en camino: se cierra cuando estén en Compras o descartados', e.codigo using errcode = 'P0001';
  end if;
  update efectivo_entrega set cerrada_en = now() where id = p_entrega;
end $$;
revoke all on function public.cerrar_entrega_efectivo(uuid) from public, anon;
grant execute on function public.cerrar_entrega_efectivo(uuid) to authenticated;
notify pgrst, 'reload schema';
