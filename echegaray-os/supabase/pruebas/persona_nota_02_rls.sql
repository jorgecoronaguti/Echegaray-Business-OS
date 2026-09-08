-- PRUEBA DE LA RLS DE persona_nota, EJECUTANDO DE VERDAD COMO CADA USUARIO.
-- Cada caso ABORTA el script si el resultado no es el esperado.
\set ON_ERROR_STOP on
create or replace function public.assert(cond boolean, que text) returns void language plpgsql as $$
begin if not cond then raise exception 'FALLÓ: %', que; end if; end $$;

-- ── 1 · DIRECCIÓN ANOTA, Y LA FIRMA LA PONE LA BASE ───────────────────────
set role authenticated;
set test.uid = '11111111-1111-1111-1111-111111111111';
insert into public.persona_nota (persona_id, texto)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Pidió adelanto de quincena');
select public.assert(
  (select creado_por from public.persona_nota) = '11111111-1111-1111-1111-111111111111',
  'la anotación tiene que quedar firmada por auth.uid() sin que el formulario mande nada');
\echo '  OK 1 · dirección anota y la base pone la firma'

-- ── 2 · EL JEFE DE OBRA LEE Y TAMBIÉN ANOTA ──────────────────────────────
-- Es lo que pidió el dueño y lo que dice es_administracion() desde el 19/08. Si mañana alguien
-- vuelve la policy a ve_economia(), este caso se pone rojo antes de que el jefe pierda la función.
set test.uid = '22222222-2222-2222-2222-222222222222';
select public.assert((select count(*) from public.persona_nota) = 1,
  'el jefe de obra tiene que PODER LEER las anotaciones de la ficha');
insert into public.persona_nota (persona_id, texto)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Llegó tarde tres días seguidos');
select public.assert((select count(*) from public.persona_nota) = 2,
  'el jefe de obra tiene que poder anotar: es quien lo ve trabajar');
\echo '  OK 2 · el jefe de obra lee y anota'

-- ── 3 · EL ROL `campo` NO VE NADA Y NO ESCRIBE ───────────────────────────
-- Es la ficha del EMPLEADOR sobre el empleado. Que la persona misma la lea sería peor que no
-- tenerla. `campo` no está en es_administracion(), así que la RLS le devuelve CERO filas.
set test.uid = '33333333-3333-3333-3333-333333333333';
select public.assert((select count(*) from public.persona_nota) = 0,
  'el rol campo NO puede ver ninguna anotación');
do $$ begin
  insert into public.persona_nota (persona_id, texto)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'me porté bien');
  raise exception 'FALLÓ: el rol campo pudo anotar en su propio legajo';
exception when insufficient_privilege then null; end $$;
\echo '  OK 3 · el rol campo no lee ni escribe'

-- ── 4 · LA FIRMA NO ES FALSIFICABLE ──────────────────────────────────────
-- Dos cerraduras, y se prueban las dos: el grant de INSERT es sólo sobre (persona_id, texto), así
-- que mencionar `creado_por` ya lo corta el privilegio de columna. Aunque ese grant se aflojara,
-- el `with check` de la policy exige que sea el propio uid.
set test.uid = '11111111-1111-1111-1111-111111111111';
do $$ begin
  insert into public.persona_nota (persona_id, texto, creado_por)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'firmada por otro',
            '22222222-2222-2222-2222-222222222222');
  raise exception 'FALLÓ: se pudo firmar una anotación con el nombre de otro';
exception when insufficient_privilege then null; end $$;
\echo '  OK 4 · nadie firma con el id de otro (grant de columna + with check)'

-- ── 5 · UNA ANOTACIÓN EN BLANCO NO ENTRA NI POR LA PUERTA DE ATRÁS ───────
do $$ begin
  insert into public.persona_nota (persona_id, texto)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '    ');
  raise exception 'FALLÓ: entró una anotación en blanco';
exception when check_violation then null; end $$;
\echo '  OK 5 · el check de la base rechaza el texto en blanco (no sólo Zod)'

-- ── 6 · LO ESCRITO NO SE REESCRIBE NI SE BORRA — NI EL PROPIO AUTOR ──────
-- Decisión del dueño: la anotación queda; para corregir se agrega otra. No hay policy de update ni
-- de delete, y tampoco grant. Este caso es el que se pone rojo si alguien "agrega la que faltaba".
do $$ begin
  update public.persona_nota set texto = 'pisada';
  raise exception 'FALLÓ: se pudo reescribir una anotación';
exception when insufficient_privilege then null; end $$;
do $$ begin
  delete from public.persona_nota;
  raise exception 'FALLÓ: se pudo borrar una anotación';
exception when insufficient_privilege then null; end $$;
select public.assert((select count(*) from public.persona_nota) = 2,
  'las dos anotaciones tienen que seguir ahí, con su texto original');
select public.assert(
  (select texto from public.persona_nota order by creado_en limit 1) = 'Pidió adelanto de quincena',
  'la primera anotación no puede haber cambiado de texto');
\echo '  OK 6 · ni update ni delete, tampoco para el autor'

-- ── 7 · LOS GRANTS EXISTEN Y SON EXACTAMENTE DOS ─────────────────────────
-- RLS no es GRANT: una policy sin grant es `permission denied`, y Next lo muestra como un 404.
-- Y al revés: un grant de más (update/delete) haría decorativa la ausencia de policies el día que
-- alguien agregue una.
reset role;
select public.assert(
  (select count(*) from information_schema.role_table_grants
    where table_name = 'persona_nota' and grantee = 'authenticated') = 1,
  'authenticated tiene que tener SELECT de tabla, y nada más a nivel tabla');
select public.assert(
  (select privilege_type::text from information_schema.role_table_grants
    where table_name = 'persona_nota' and grantee = 'authenticated') = 'SELECT',
  'el único grant de tabla para authenticated tiene que ser SELECT');
select public.assert(
  (select array_agg(column_name::text order by column_name)
     from information_schema.column_privileges
    where table_name = 'persona_nota' and grantee = 'authenticated'
      and privilege_type = 'INSERT') = array['persona_id','texto'],
  'el INSERT de authenticated tiene que ser sólo sobre persona_id y texto');
\echo '  OK 7 · SELECT de tabla + INSERT sólo de (persona_id, texto)'

-- ── 8 · BORRAR LA PERSONA SE LLEVA SUS ANOTACIONES ───────────────────────
delete from public.personas where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select public.assert((select count(*) from public.persona_nota) = 0,
  'las anotaciones tienen que irse con la persona: on delete cascade');
\echo '  OK 8 · el cascade de la persona se lleva sus anotaciones'
