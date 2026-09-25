-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CINCO VISTAS DE OBRA QUE SÓLO SE LEEN: fuera los grants de escritura que les dejó el default
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Re-verificación independiente del 25/09/2026: `authenticated` tenía INSERT, UPDATE y DELETE sobre
-- `actividad_partes_resumen`, `obra_avance_ponderado`, `obra_dias_habiles`, `obra_historia_peso` y
-- `parte_tarea`. Son vistas `security_invoker` y no actualizables (agregan o unen), así que hoy
-- ninguna escritura prospera; pero el grant es una promesa que nadie quiso hacer, y si mañana una se
-- simplifica y se vuelve actualizable, el grant la abre. Se revoca todo menos SELECT.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.
do $$
declare
  v text;
begin
  foreach v in array array['actividad_partes_resumen', 'obra_avance_ponderado', 'obra_dias_habiles',
                           'obra_historia_peso', 'parte_tarea'] loop
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from authenticated, anon, public', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
end $$;
