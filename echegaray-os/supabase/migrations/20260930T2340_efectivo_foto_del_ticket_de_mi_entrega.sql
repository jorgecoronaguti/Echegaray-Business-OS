-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EFECTIVO: LA PERSONA VE LA FOTO DE UN TICKET DE SU ENTREGA AUNQUE LA HAYA SUBIDO ADMINISTRACIÓN
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Complemento de 20260930T2330. Cuando Dirección/Administración rinde por otro (20260930T2200) la
-- foto queda en la carpeta `<uid del admin>/rendicion/…` y `comprobantes_lee_rendicion` sólo deja
-- leer la carpeta propia: el jefe veía el ticket leído pero no su foto. Se lee la foto cuya entrada
-- cuelga de un comprobante de una entrega de mi persona.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

drop policy if exists comprobantes_lee_rendicion_de_mi_entrega on storage.objects;
create policy comprobantes_lee_rendicion_de_mi_entrega on storage.objects for select to authenticated
  using (
    bucket_id = 'comprobantes'
    and (storage.foldername(name))[2] = 'rendicion'
    and exists (select 1 from public.comprobante_entrada ce
                  join public.efectivo_comprobante c on c.entrada_id = ce.id
                  join public.efectivo_entrega e on e.id = c.entrega_id
                 where ce.storage_path = storage.objects.name
                   and e.persona_id = (select public.mi_persona_id()))
  );
