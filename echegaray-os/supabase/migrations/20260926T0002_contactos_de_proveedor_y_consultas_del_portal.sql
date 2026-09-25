-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CONTACTOS DE PROVEEDOR Y CONSULTAS DEL PORTAL: SÓLO ADMINISTRACIÓN (complemento de 20260926T0001)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- La auditoría del 25/09 encontró dos tablas más que dejaban ESCRIBIR al jefe de obra por
-- `es_administracion()` (que lo incluye): los contactos de cada proveedor (sección de Compras) y las
-- consultas que el cliente deja en el portal (relación con el cliente). Misma cura que 0001: una
-- policy restrictiva `solo_administracion` con `ve_economia()` para todo comando. El portal escribe
-- sus consultas con la clave de servicio, que no pasa por RLS.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.
do $$
declare
  t text;
begin
  foreach t in array array['proveedor_contacto', 'consulta_portal'] loop
    execute format('drop policy if exists solo_administracion on public.%I', t);
    execute format(
      'create policy solo_administracion on public.%I as restrictive for all to authenticated '
      'using ((select public.ve_economia())) with check ((select public.ve_economia()))', t);
  end loop;
end $$;
