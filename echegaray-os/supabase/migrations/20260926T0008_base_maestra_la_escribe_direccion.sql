-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA BASE MAESTRA (análisis, recursos, tareas, plantillas, rendimientos) LA ESCRIBE DIRECCIÓN
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Auditoría de accesos del 25/09/2026: las policies de escritura de la base maestra exigían
-- `es_administracion()`, que incluye al jefe de obra. El jefe podía crear, versionar y dar de baja
-- análisis de precios, recursos y tareas tipo — la base con la que se cotiza. Decisión: escribe sólo
-- Dirección. El jefe sigue LEYENDO (las pantallas de su obra muestran tareas tipo, plantillas de pasos
-- y el análisis vinculado a una tarea; los precios ya estaban cerrados en `recurso_precio`).
--
-- Policy RESTRICTIVA de escritura por tabla (insert, update y delete; el select no se toca). Las
-- funciones SECURITY DEFINER (conversión de presupuesto, recomendaciones con `ve_economia`) no pasan por RLS.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.
do $$
declare
  t text;
  c text;
begin
  foreach t in array array['analisis', 'analisis_linea', 'analisis_cuadrilla', 'recurso', 'tarea_tipo',
                           'plantilla_paso', 'plantilla_secuencia', 'rendimiento_historico', 'base_maestra_relacion'] loop
    foreach c in array array['insert', 'update', 'delete'] loop
      execute format('drop policy if exists escribe_direccion_%s on public.%I', c, t);
    end loop;
    execute format('create policy escribe_direccion_insert on public.%I as restrictive for insert to authenticated '
                   'with check ((select public.current_rol()) = ''direccion'')', t);
    execute format('create policy escribe_direccion_update on public.%I as restrictive for update to authenticated '
                   'using ((select public.current_rol()) = ''direccion'') with check ((select public.current_rol()) = ''direccion'')', t);
    execute format('create policy escribe_direccion_delete on public.%I as restrictive for delete to authenticated '
                   'using ((select public.current_rol()) = ''direccion'')', t);
  end loop;
end $$;
