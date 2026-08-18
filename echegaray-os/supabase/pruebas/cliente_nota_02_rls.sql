-- PRUEBA DE LA RLS DE cliente_nota, EJECUTANDO DE VERDAD COMO CADA USUARIO.
-- Cada caso ABORTA el script si el resultado no es el esperado.
\set ON_ERROR_STOP on
create or replace function public.assert(cond boolean, que text) returns void language plpgsql as $$
begin if not cond then raise exception 'FALLÓ: %', que; end if; end $$;

-- ── 1 · ADMINISTRACIÓN ESCRIBE, Y LA FIRMA LA PONE LA BASE ────────────────
set role authenticated;
set test.uid = '11111111-1111-1111-1111-111111111111';
insert into public.cliente_nota (cliente_id, texto)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Llamé al arquitecto');
select public.assert(
  (select autor_id from public.cliente_nota) = '11111111-1111-1111-1111-111111111111',
  'la nota tiene que quedar firmada por auth.uid() sin que el formulario mande nada');
\echo '  OK 1 · administracion escribe y la base pone la firma'

-- ── 2 · UN JEFE DE OBRA LEE PERO NO ESCRIBE ───────────────────────────────
set test.uid = '22222222-2222-2222-2222-222222222222';
select public.assert((select count(*) from public.cliente_nota) = 1,
  'el jefe de obra tiene que PODER LEER la nota: consultar no es administrar');
\echo '  OK 2a · el jefe de obra lee'
do $$ begin
  insert into public.cliente_nota (cliente_id, texto)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'nota de un jefe de obra');
  raise exception 'FALLÓ: un jefe de obra pudo escribir una nota';
exception when insufficient_privilege then null; end $$;
\echo '  OK 2b · el jefe de obra NO escribe (RLS lo rechaza)'

-- ── 3 · LA FIRMA NO ES FALSIFICABLE ───────────────────────────────────────
set test.uid = '11111111-1111-1111-1111-111111111111';
do $$ begin
  insert into public.cliente_nota (cliente_id, texto, autor_id)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'firmada por otro',
            '22222222-2222-2222-2222-222222222222');
  raise exception 'FALLÓ: se pudo firmar una nota con el nombre de otro';
exception when insufficient_privilege then null; end $$;
\echo '  OK 3 · administracion NO puede firmar con el id de otro'

-- ── 4 · UNA NOTA VACÍA NO ENTRA NI POR LA PUERTA DE ATRÁS ────────────────
do $$ begin
  insert into public.cliente_nota (cliente_id, texto)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '    ');
  raise exception 'FALLÓ: entró una nota en blanco';
exception when check_violation then null; end $$;
\echo '  OK 4 · el check de la base rechaza la nota en blanco (no sólo Zod)'

-- ── 5 · NADIE REESCRIBE NI BORRA LO QUE DIJO OTRO ────────────────────────
set test.uid = '22222222-2222-2222-2222-222222222222';
select public.assert((select count(*) from public.cliente_nota) = 1, 'sigue habiendo una sola nota');
update public.cliente_nota set texto = 'pisada';
select public.assert((select texto from public.cliente_nota) = 'Llamé al arquitecto',
  'un jefe de obra no puede reescribir la nota de otro');
delete from public.cliente_nota;
select public.assert((select count(*) from public.cliente_nota) = 1,
  'un jefe de obra no puede borrar la nota de otro');
\echo '  OK 5 · el update y el delete ajenos no tocan ni una fila'

-- ── 6 · EL GRANT EXISTE. RLS NO ES GRANT ────────────────────────────────
reset role;
select public.assert(
  (select count(*) from information_schema.role_table_grants
    where table_name = 'cliente_nota' and grantee = 'authenticated'
      and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')) = 4,
  'faltan grants a authenticated: una policy sin grant es un 404 en la pantalla');
\echo '  OK 6 · authenticated tiene los cuatro grants'

-- ── 7 · BORRAR EL CLIENTE SE LLEVA SUS NOTAS ────────────────────────────
delete from public.clientes where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select public.assert((select count(*) from public.cliente_nota) = 0,
  'la nota tiene que irse con el cliente: on delete cascade');
\echo '  OK 7 · el cascade del cliente se lleva sus notas'
