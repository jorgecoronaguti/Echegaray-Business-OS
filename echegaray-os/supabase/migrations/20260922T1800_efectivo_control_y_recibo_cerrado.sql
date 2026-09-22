-- EFECTIVO A RENDIR Y RECIBOS — lo que marcó la auditoría de cierre del 22/09/2026.
--
-- 1 · UNA SOLA VERDAD DE «RENDIDO», Y UN CONTROL QUE LO MIRA.
-- Lo rendido vive en dos lados: la fila de Compras con Tipo pago «A rendir» (el Sheet la usa para el
-- Cash Flow y CAJA) y el vínculo `efectivo_rendicion` (la base lo usa para el saldo de la persona). Si
-- alguien escribe «A rendir» en una fila que no salió de ninguna entrega, el gasto queda en neto cero en
-- el Cash Flow, fuera del cajón y sin bajar el saldo de nadie: plata que sale sin rastro. Esta vista
-- lista esas filas; la pantalla de Efectivo a rendir y la campanita las muestran.
--
-- 2 · `recibo_pago_desactualizado` ERA UN ORÁCULO DE SUELDOS.
-- Es security definer y la podía ejecutar cualquier usuario logueado con un registro inventado: con el
-- id de una línea ajena devolvía si los importes coincidían. La vista que la usa corre como su dueño
-- (security_invoker = false), así que a los usuarios no les hace falta el permiso.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

create or replace view public.efectivo_a_rendir_sin_entrega with (security_invoker = true) as
  select cs.fila, cs.clave, cs.fecha, cs.proveedor, cs.obra_texto, cs.total, cs.monto_pagado, cs.estado
    from public.compra_sheet cs
   where lower(trim(coalesce(cs.tipo_pago, ''))) = 'a rendir'
     and not coalesce(cs.anulada, false)
     and not exists (select 1 from public.efectivo_rendicion r where r.compra_clave = cs.clave);
comment on view public.efectivo_a_rendir_sin_entrega is
  'Filas de Compras con Tipo pago «A rendir» que NO están vinculadas a ninguna entrega: gasto que la '
  'caja no restó y que nadie rindió. Tiene que estar vacía.';
revoke all on public.efectivo_a_rendir_sin_entrega from anon, public;
grant select on public.efectivo_a_rendir_sin_entrega to authenticated;

revoke all on function public.recibo_pago_desactualizado(public.recibo_pago) from public, anon, authenticated;

notify pgrst, 'reload schema';
