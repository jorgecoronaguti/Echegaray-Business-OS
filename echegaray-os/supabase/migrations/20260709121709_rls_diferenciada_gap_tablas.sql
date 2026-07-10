-- RLS diferenciada por rol para las tablas que quedaron con acceso plano
-- (`authenticated_full_access`, using(true) para cualquier autenticado) en ciclos
-- anteriores. Verificado contra pg_policies: la mayoría de las tablas (acciones,
-- registros_hh, movimientos_caja, obligaciones, personas, equipos, documentacion_legajo,
-- aplicaciones_pago, cuentas_financieras, actividades_semanales, backlog_autonomo,
-- scorecard_dominios, fuentes_datos, preguntas_negocio) ya usaban `current_rol()` desde
-- PR5. Estas 11 quedaron atrás -- se corrigen siguiendo el mismo patrón, sin inventar
-- un modelo de permisos nuevo.

drop policy authenticated_full_access on compras;
create policy compras_select on compras for select to authenticated using (true);
create policy compras_write on compras for all to authenticated
  using (current_rol() = any(array['direccion','administracion']))
  with check (current_rol() = any(array['direccion','administracion']));

drop policy authenticated_full_access on costos_reales;
create policy costos_reales_select on costos_reales for select to authenticated using (true);
create policy costos_reales_write on costos_reales for all to authenticated
  using (current_rol() = any(array['direccion','administracion']))
  with check (current_rol() = any(array['direccion','administracion']));

drop policy authenticated_full_access on clasificaciones_costo_obra;
create policy clasificaciones_costo_obra_select on clasificaciones_costo_obra for select to authenticated using (true);
create policy clasificaciones_costo_obra_write on clasificaciones_costo_obra for all to authenticated
  using (current_rol() = any(array['direccion','administracion']))
  with check (current_rol() = any(array['direccion','administracion']));

drop policy authenticated_full_access on proveedores;
create policy proveedores_select on proveedores for select to authenticated using (true);
create policy proveedores_write on proveedores for all to authenticated
  using (current_rol() = any(array['direccion','administracion']))
  with check (current_rol() = any(array['direccion','administracion']));

drop policy authenticated_full_access on clientes;
create policy clientes_select on clientes for select to authenticated using (true);
create policy clientes_write on clientes for all to authenticated
  using (current_rol() = any(array['direccion','administracion']))
  with check (current_rol() = any(array['direccion','administracion']));

drop policy authenticated_full_access on certificados;
create policy certificados_select on certificados for select to authenticated using (true);
create policy certificados_write on certificados for all to authenticated
  using (current_rol() = any(array['direccion','administracion']))
  with check (current_rol() = any(array['direccion','administracion']));

drop policy authenticated_full_access on presupuestos;
create policy presupuestos_select on presupuestos for select to authenticated using (true);
create policy presupuestos_write on presupuestos for all to authenticated
  using (current_rol() = any(array['direccion','administracion']))
  with check (current_rol() = any(array['direccion','administracion']));

drop policy authenticated_full_access on partidas_presupuesto;
create policy partidas_presupuesto_select on partidas_presupuesto for select to authenticated using (true);
create policy partidas_presupuesto_write on partidas_presupuesto for all to authenticated
  using (current_rol() = any(array['direccion','administracion']))
  with check (current_rol() = any(array['direccion','administracion']));

drop policy authenticated_full_access on post_mortems;
create policy post_mortems_select on post_mortems for select to authenticated using (true);
create policy post_mortems_write on post_mortems for all to authenticated
  using (current_rol() = any(array['direccion','administracion']))
  with check (current_rol() = any(array['direccion','administracion']));

-- Obras: Operaciones (jefe_obra) gestiona la obra -- puede crear/actualizar, no eliminar.
drop policy authenticated_full_access on obras;
create policy obras_select on obras for select to authenticated using (true);
create policy obras_insert on obras for insert to authenticated
  with check (current_rol() = any(array['direccion','administracion','jefe_obra']));
create policy obras_update on obras for update to authenticated
  using (current_rol() = any(array['direccion','administracion','jefe_obra']));
create policy obras_delete on obras for delete to authenticated
  using (current_rol() = any(array['direccion','administracion']));

-- Adicionales: Operaciones detecta/registra (Sección "Adicionales" del CLAUDE.md raíz:
-- Detección->Registro->Evidencia->Valuación->Aprobación); aprobar/eliminar queda en
-- Dirección/Administración.
drop policy authenticated_full_access on adicionales;
create policy adicionales_select on adicionales for select to authenticated using (true);
create policy adicionales_insert on adicionales for insert to authenticated
  with check (current_rol() = any(array['direccion','administracion','jefe_obra']));
create policy adicionales_update on adicionales for update to authenticated
  using (current_rol() = any(array['direccion','administracion','jefe_obra']));
create policy adicionales_delete on adicionales for delete to authenticated
  using (current_rol() = any(array['direccion','administracion']));
