-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- BITÁCORA (`entidad_cambio`): EL PRECIO DE LA OBRA Y EL SUELDO SÓLO LOS LEE ADMINISTRACIÓN
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Auditoría por nivel del 25/09/2026 (regla de oro del dueño: «cada vez que haya implementaciones…
-- revisar por nivel de usuario»). Con la sesión real de un jefe de obra, PostgREST devolvía de
-- `entidad_cambio` 71 filas `obra_canonica.monto_contratado` (el precio de venta de cada obra, con su
-- valor antes y después) y `personas.retribucion_pactada` (el sueldo pactado). El jefe no ve precio
-- ni sueldos: la pantalla ya se lo esconde (`obra_panel.monto_contratado` le llega null, Retribución
-- dice «sin permiso»), pero la bitácora era más ancha que la pantalla.
--
-- La policy de 20260925T1200 ya cerraba `entidad = 'efectivo'` a `ve_economia()`. Se suman los dos
-- campos de plata con la misma regla. El resto de la bitácora de personas (categoría, egreso, datos del
-- legajo) sigue igual para el jefe, que administra legajos.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

drop policy if exists entidad_cambio_select on public.entidad_cambio;
create policy entidad_cambio_select on public.entidad_cambio for select to authenticated
  using (
    (select public.es_administracion())
    and (
      (select public.ve_economia())
      or (
        entidad <> 'efectivo'
        and not (entidad = 'obra_canonica' and campo = 'monto_contratado')
        and not (entidad = 'personas' and campo = 'retribucion_pactada')
      )
    )
  );
