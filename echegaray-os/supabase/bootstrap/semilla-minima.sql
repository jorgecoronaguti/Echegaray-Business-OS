-- ═══ SEMILLA MÍNIMA PARA ENTORNOS DE PRUEBA ═══
--
-- Lo único que una base reconstruida necesita para que el circuito crítico sea EJERCITABLE:
-- una identidad por rol. En producción estos son usuarios reales creados por Auth; acá son
-- cuentas de prueba con UUID fijo (mismo criterio que tests/util/identidades.ts).
-- NUNCA se aplica a producción: la aplica el runner sólo con --con-semilla.

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'direccion@prueba.local'),
  ('00000000-0000-4000-8000-000000000002', 'administracion@prueba.local'),
  ('00000000-0000-4000-8000-000000000003', 'jefe@prueba.local'),
  ('00000000-0000-4000-8000-000000000004', 'campo@prueba.local')
on conflict (id) do nothing;

insert into public.perfiles (id, nombre, rol) values
  ('00000000-0000-4000-8000-000000000001', 'Dirección (prueba)', 'direccion'),
  ('00000000-0000-4000-8000-000000000002', 'Administración (prueba)', 'administracion'),
  ('00000000-0000-4000-8000-000000000003', 'Jefe de obra (prueba)', 'jefe_obra'),
  ('00000000-0000-4000-8000-000000000004', 'Campo (prueba)', 'campo')
on conflict (id) do nothing;

-- Una persona (los registros de HH la exigen) y una tarea con su análisis vigente (la Base
-- Maestra mínima): sin esto, el circuito no tiene sobre qué girar en una base sin historia.
insert into public.personas (id, nombre_completo) values
  ('00000000-0000-4000-8000-000000000101', 'Operario (prueba)')
on conflict (id) do nothing;

-- El código NO usa el prefijo ZZ-: ése es el espacio de nombres que los tests reservan para
-- crear y limpiar lo suyo — una semilla ZZ- se contaría como resto de test.
insert into public.tarea_tipo (id, codigo, nombre, unidad) values
  ('00000000-0000-4000-8000-000000000201', 'SEMILLA-001', 'Tarea de prueba (semilla)', 'm2')
on conflict (id) do nothing;

insert into public.analisis (id, tarea_tipo_id, version, vigente)
values ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', 1, true)
on conflict (id) do nothing;

-- Con al menos UNA línea de mano de obra con precio: sin líneas, congelar un presupuesto no
-- escribe respaldo (composición vacía) y el circuito pierde la mitad de lo que hay que probar.
insert into public.recurso (id, codigo, nombre, unidad, tipo) values
  ('00000000-0000-4000-8000-000000000401', 'SEMILLA-MO', 'Oficial (semilla)', 'h', 'mano_obra')
on conflict (id) do nothing;
insert into public.recurso_precio (id, recurso_id, costo, vigente)
values ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000401', 5000, true)
on conflict (id) do nothing;
insert into public.analisis_linea (id, analisis_id, recurso_id, cantidad, orden)
values ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000301',
        '00000000-0000-4000-8000-000000000401', 1.5, 1)
on conflict (id) do nothing;
