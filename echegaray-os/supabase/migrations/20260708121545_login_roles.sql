-- PR5: Login y roles reales (Dirección / Administración / Jefe de Obra).
--
-- Alcance de esta primera versión de RLS por rol (documentado, no exhaustivo):
-- LECTURA sigue abierta a cualquier usuario autenticado en TODAS las tablas -- decisión
-- deliberada dado el tamaño actual del equipo (Jorge + administración + jefe de obra),
-- donde restringir lectura agrega fricción sin beneficio real de seguridad. Lo que sí
-- se diferencia por rol es la ESCRITURA en las tablas donde "mínimo privilegio"
-- importa de verdad: financieras (evitar que un jefe de obra modifique caja/obligaciones
-- por error) y operacionales (actividad semanal / HH, dominio propio del jefe de obra).
--
-- Tablas SIN diferenciar todavía (siguen con authenticated_full_access, mismo criterio
-- que antes): clientes, proveedores, obras, presupuestos, partidas_presupuesto,
-- costos_reales, adicionales, certificados, compras, post_mortems. Es un gap conocido,
-- declarado -- no se fabrica una restricción sin haber definido con Jorge qué rol
-- necesita qué nivel de acceso ahí (ver auditoría de cobertura integral, sección L).
--
-- No existe todavía una asignación de "jefe de obra -> obra específica" en el modelo
-- (responsable en actividades_semanales/obras es texto libre, no una FK a un usuario) --
-- por eso jefe_obra puede escribir actividad semanal/HH de CUALQUIER obra, no solo la
-- suya. Gap declarado, no resuelto en este incremento.

create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol text not null check (rol in ('direccion', 'administracion', 'jefe_obra')),
  nombre text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table perfiles enable row level security;

-- Un usuario puede leer su propio perfil (para saber su rol en la UI) y el de otros
-- (útil para mostrar nombres de responsables) -- no hay dato sensible acá.
create policy "authenticated_read_perfiles" on perfiles
  for select to authenticated using (true);

-- Nadie se auto-asigna un rol vía la app -- el alta de perfil se hace por Jorge
-- directamente en Supabase (fuera del flujo de signup), evitando que cualquiera que
-- se registre se dé a sí mismo el rol 'direccion'.
grant select on public.perfiles to authenticated;

create trigger perfiles_set_updated_at before update on perfiles
  for each row execute function set_updated_at();

-- Helper: rol del usuario autenticado actual. security definer para poder leer
-- perfiles aunque la policy de perfiles no lo permitiera directamente en otro contexto.
create or replace function current_rol()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select rol from perfiles where id = auth.uid()
$$;

-- ===== Tablas financieras: escritura solo direccion/administracion =====
drop policy if exists "authenticated_full_access" on movimientos_caja;
create policy "lectura_autenticados" on movimientos_caja for select to authenticated using (true);
create policy "escritura_finanzas" on movimientos_caja for insert to authenticated with check (current_rol() in ('direccion', 'administracion'));
create policy "actualizacion_finanzas" on movimientos_caja for update to authenticated using (current_rol() in ('direccion', 'administracion'));
create policy "borrado_finanzas" on movimientos_caja for delete to authenticated using (current_rol() in ('direccion', 'administracion'));

drop policy if exists "authenticated_full_access" on obligaciones;
create policy "lectura_autenticados" on obligaciones for select to authenticated using (true);
create policy "escritura_finanzas" on obligaciones for insert to authenticated with check (current_rol() in ('direccion', 'administracion'));
create policy "actualizacion_finanzas" on obligaciones for update to authenticated using (current_rol() in ('direccion', 'administracion'));
create policy "borrado_finanzas" on obligaciones for delete to authenticated using (current_rol() in ('direccion', 'administracion'));

drop policy if exists "authenticated_full_access" on aplicaciones_pago;
create policy "lectura_autenticados" on aplicaciones_pago for select to authenticated using (true);
create policy "escritura_finanzas" on aplicaciones_pago for insert to authenticated with check (current_rol() in ('direccion', 'administracion'));
create policy "actualizacion_finanzas" on aplicaciones_pago for update to authenticated using (current_rol() in ('direccion', 'administracion'));
create policy "borrado_finanzas" on aplicaciones_pago for delete to authenticated using (current_rol() in ('direccion', 'administracion'));

drop policy if exists "authenticated_full_access" on cuentas_financieras;
create policy "lectura_autenticados" on cuentas_financieras for select to authenticated using (true);
create policy "escritura_finanzas" on cuentas_financieras for insert to authenticated with check (current_rol() in ('direccion', 'administracion'));
create policy "actualizacion_finanzas" on cuentas_financieras for update to authenticated using (current_rol() in ('direccion', 'administracion'));
create policy "borrado_finanzas" on cuentas_financieras for delete to authenticated using (current_rol() in ('direccion', 'administracion'));

-- ===== Tablas operacionales: escritura direccion/administracion/jefe_obra =====
drop policy if exists "authenticated_full_access" on actividades_semanales;
create policy "lectura_autenticados" on actividades_semanales for select to authenticated using (true);
create policy "escritura_operacion" on actividades_semanales for insert to authenticated with check (current_rol() in ('direccion', 'administracion', 'jefe_obra'));
create policy "actualizacion_operacion" on actividades_semanales for update to authenticated using (current_rol() in ('direccion', 'administracion', 'jefe_obra'));
create policy "borrado_operacion" on actividades_semanales for delete to authenticated using (current_rol() in ('direccion', 'administracion'));

drop policy if exists "authenticated_full_access" on registros_hh;
create policy "lectura_autenticados" on registros_hh for select to authenticated using (true);
create policy "escritura_operacion" on registros_hh for insert to authenticated with check (current_rol() in ('direccion', 'administracion', 'jefe_obra'));
create policy "actualizacion_operacion" on registros_hh for update to authenticated using (current_rol() in ('direccion', 'administracion', 'jefe_obra'));
create policy "borrado_operacion" on registros_hh for delete to authenticated using (current_rol() in ('direccion', 'administracion'));

-- ===== Centro de Acción: lectura + creación para todos, resolución para direccion/administracion =====
-- (no existe todavía un vínculo "acción -> usuario responsable" real, solo texto libre,
-- así que no se puede limitar la resolución a "solo mi propia acción" -- se limita a
-- los roles con responsabilidad de seguimiento, direccion y administracion).
drop policy if exists "authenticated_full_access" on acciones;
create policy "lectura_autenticados" on acciones for select to authenticated using (true);
create policy "creacion_autenticados" on acciones for insert to authenticated with check (true);
create policy "actualizacion_acciones" on acciones for update to authenticated using (current_rol() in ('direccion', 'administracion'));
