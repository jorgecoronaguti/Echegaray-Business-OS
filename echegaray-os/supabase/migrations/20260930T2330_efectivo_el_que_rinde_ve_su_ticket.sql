-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EFECTIVO: EL QUE RINDE VE LA LECTURA DE SU TICKET (y Administración puede subir la foto por otro)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- El 26/09 (20260926T0001) se cerró `comprobante_entrada` a Administración con una policy
-- restrictiva `solo_administracion` = ve_economia(). Correcto para la cola de Compras, pero la vista
-- `efectivo_comprobante_estado` hace LEFT JOIN a esa tabla para saber si el ticket ya se leyó: al
-- jefe de obra la RLS le escondía SU entrada y la vista caía en «leyendo» para siempre. Maldonado
-- 30/09 (ticket 6f8e93ef, leído a las 18:12 y «clavado en leyendo» en tres renders del servidor) y
-- el de Nievas del 25/09 (a5997eef) que nadie pudo confirmar desde el teléfono.
--
-- Cura: la restrictiva deja pasar, además de Administración, la entrada de ORIGEN rendición cuando
-- la subió el mismo usuario o pertenece a una entrega de su persona (Dirección/Administración rinde
-- por otro desde 20260930T2200: el ticket lo sube Jorge y lo tiene que ver Maldonado). Escribir
-- sigue siendo sólo de Administración (los RPC de rendición son SECURITY DEFINER).
--
-- Storage: la policy `comprobantes_sube_rendicion` exigía una entrega abierta PROPIA; Administración
-- rindiendo por otro no la tiene. ve_economia() también sube a su carpeta `<uid>/rendicion/…`.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

drop policy if exists solo_administracion on public.comprobante_entrada;
create policy solo_administracion on public.comprobante_entrada as restrictive for all to authenticated
  using ((select public.ve_economia())
     or (origen = 'rendicion' and (subido_por = (select auth.uid())
         or exists (select 1 from public.efectivo_comprobante c
                      join public.efectivo_entrega e on e.id = c.entrega_id
                     where c.entrada_id = comprobante_entrada.id
                       and e.persona_id = (select public.mi_persona_id())))))
  with check ((select public.ve_economia()));

drop policy if exists comprobante_entrada_select_rendicion on public.comprobante_entrada;
create policy comprobante_entrada_select_rendicion on public.comprobante_entrada for select to authenticated
  using (origen = 'rendicion' and (subido_por = (select auth.uid())
         or exists (select 1 from public.efectivo_comprobante c
                      join public.efectivo_entrega e on e.id = c.entrega_id
                     where c.entrada_id = comprobante_entrada.id
                       and e.persona_id = (select public.mi_persona_id()))));

drop policy if exists comprobantes_sube_rendicion on storage.objects;
create policy comprobantes_sube_rendicion on storage.objects for insert to authenticated
  with check (
    bucket_id = 'comprobantes'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and (storage.foldername(name))[2] = 'rendicion'
    and ((select public.ve_economia())
         or exists (select 1 from public.efectivo_entrega e
                     where e.persona_id = (select public.mi_persona_id()) and e.anulada_en is null and e.cerrada_en is null))
  );
