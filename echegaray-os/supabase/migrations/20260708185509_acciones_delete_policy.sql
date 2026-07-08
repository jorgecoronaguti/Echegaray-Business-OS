-- Gap real de RLS encontrado auditando por qué el cleanup de tests dejaba residuo
-- (2026-07-08): `acciones` tenía policies de SELECT/INSERT/UPDATE pero ninguna de
-- DELETE -- ni siquiera direccion/administracion podían borrar una acción mal creada
-- a través de la app (RLS deniega por defecto sin policy explícita, sin error visible
-- en el cliente, solo 0 filas afectadas). Mismo criterio que la policy de UPDATE ya
-- existente (actualizacion_acciones).
create policy eliminacion_acciones on acciones
  for delete to authenticated
  using (current_rol() in ('direccion', 'administracion'));
