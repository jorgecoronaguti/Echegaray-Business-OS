-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- PARTE DICTADO: GUARDAR UNO NUEVO SIGUE ABIERTO; EDITAR Y BORRAR, SÓLO EN SU OBRA (ajuste de 0004)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- 20260926T0004 cerró TODO update de `parte_dictado` a la obra propia del jefe. Eso también frenaba
-- GUARDAR un parte dictado nuevo (listo → guardado), que es CARGAR, no editar — y la acción lo hace al
-- final, después de escribir asistencia y avance: el parte quedaba a medio guardar. El pedido del dueño
-- es editar y borrar. La policy mira la fila VIEJA:
--   · un dictado ya `guardado` (anularlo = borrar el parte)            → sólo en su obra;
--   · una corrección (`es_correccion`, «dictar corrección» = editar)    → sólo en su obra;
--   · un dictado nuevo que se guarda o se descarta                      → como antes (`ve_obra`).
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.
drop policy if exists parte_de_su_obra on public.parte_dictado;
create policy parte_de_su_obra on public.parte_dictado as restrictive for update to authenticated
  using ((estado <> 'guardado' and not es_correccion) or public.ve_obra_propia(obra_id))
  -- Sin `with check` explícito Postgres usa el USING también sobre la fila NUEVA, y «guardado» quedaría
  -- cerrado para un dictado nuevo. La fila nueva la sigue controlando la policy permisiva (`ve_obra`).
  with check (true);
