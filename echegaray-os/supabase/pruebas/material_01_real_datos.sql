-- Datos mínimos sobre el esquema REAL (material_00): un usuario de dirección, un jefe, un obrero de campo
-- con UNA obra asignada, dos obras activas y el Taller (en producción lo siembra la migración de Herramientas).
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222'), ('33333333-3333-3333-3333-333333333333');
insert into public.perfiles (id, nombre, rol) values
  ('11111111-1111-1111-1111-111111111111', 'Jorge (direccion)', 'direccion'),
  ('22222222-2222-2222-2222-222222222222', 'Jefe Prueba', 'jefe_obra'),
  ('33333333-3333-3333-3333-333333333333', 'Campo Prueba', 'campo');
insert into public.obra_canonica (id, codigo, nombre, estado) values
  ('ob-activa', 'OB-0011', 'SF - PISOS INDUSTRIALES', 'activa'),
  ('ob-otra',   'OB-0010', 'SF - ENTREPISO Y ESCALERA', 'activa');
insert into public.usuario_obra (usuario_id, obra_canonica_id) values ('33333333-3333-3333-3333-333333333333', 'ob-activa');
insert into public.ubicacion (tipo, nombre) values ('taller', 'Taller');
