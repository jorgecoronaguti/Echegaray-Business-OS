-- PRUEBA DE LA RLS DE `registros_hh` PARA UNA AUSENCIA SIN OBRA, EJECUTANDO DE VERDAD COMO CADA
-- USUARIO. Cada caso ABORTA el script si el resultado no es el esperado.
\set ON_ERROR_STOP on
create or replace function public.assert(cond boolean, que text) returns void language plpgsql as $$
begin if not cond then raise exception 'FALLÓ: %', que; end if; end $$;

-- ── 1 · ADMINISTRACIÓN DECLARA UNA AUSENCIA SIN OBRA ─────────────────────
-- Es la regla del dueño (08/09): la ausencia es de la persona y no se le carga a ninguna obra.
-- Antes de esta migración la fila NO entraba: `hh_insert_por_obra` exigía obra.
set role authenticated;
set test.uid = '11111111-1111-1111-1111-111111111111';
insert into public.registros_hh (obra_canonica_id, persona_id, fecha, fecha_inicio_semana, horas, tipo_hora, notas)
  values (null, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', current_date, current_date, 9, 'ausencia', 'parte médico');
select public.assert(
  (select count(*) from public.registros_hh where obra_canonica_id is null and tipo_hora = 'ausencia') = 1,
  'Dirección tiene que poder declarar una ausencia SIN obra, de cualquiera del plantel');
\echo '  OK 1 · dirección declara una ausencia sin obra'

-- ── 2 · EL JEFE MARCA AUSENTE A SU GENTE ─────────────────────────────────
-- Gonzalez Tobares tiene asignación vigente a una obra que el jefe ve.
set test.uid = '22222222-2222-2222-2222-222222222222';
insert into public.registros_hh (obra_canonica_id, persona_id, fecha, fecha_inicio_semana, horas, tipo_hora, notas)
  values (null, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date, current_date, 9, 'ausencia', 'no vino');
select public.assert(
  (select count(*) from public.registros_hh
    where persona_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and obra_canonica_id is null) = 1,
  'el jefe de obra tiene que poder marcar ausente a alguien de su obra, sin obra en la fila');
\echo '  OK 2 · el jefe marca ausente a su gente'

-- ── 3 · EL JEFE NO MARCA AUSENTE A QUIEN NO ESTÁ ASIGNADO ────────────────
-- Éste es el caso que hace que la regla NO sea una constante. `es_administracion()` incluye a
-- jefe_obra y `ve_obra()` le da todas las obras: si la policy sin obra se hubiera escrito con
-- cualquiera de las dos, el jefe marcaría ausente a toda la empresa y este caso pasaría igual.
do $$ begin
  insert into public.registros_hh (obra_canonica_id, persona_id, fecha, fecha_inicio_semana, horas, tipo_hora)
    values (null, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', current_date - 1, current_date - 1, 9, 'ausencia');
  raise exception 'FALLÓ: el jefe pudo marcar ausente a alguien sin asignación vigente';
exception when insufficient_privilege then null; end $$;
\echo '  OK 3 · el jefe no alcanza a quien no está asignado a ninguna obra suya'

-- ── 4 · LA VIGENCIA SE MIDE A LA FECHA DEL REGISTRO, NO A HOY ────────────
-- Una ausencia se corrige días después. Con `asignacion_vigente()` —que mira current_date— el jefe
-- no podría corregir el día de alguien cuya asignación cerró ayer.
select public.assert(
  public.marca_ausencia_de('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', current_date - 350),
  'el jefe tiene que alcanzar el día en que esa persona SÍ estaba asignada a la obra');
\echo '  OK 4 · la cota mira la fecha del registro'

-- ── 5 · UNA FILA `normal` SIN OBRA NO ENTRA, POR LAS DOS PUERTAS ─────────
-- Unas horas trabajadas sin obra no tienen a quién imputarle el costo. Hay DOS barreras y se
-- prueban las dos por separado, porque se pisan: la policy se evalúa antes que el check de tabla,
-- así que por PostgREST el error es de permisos y el CHECK nunca se llega a ver. Si mañana alguien
-- afloja la policy, el segundo caso —que corre como dueño de la tabla, sin RLS— sigue rojo.
do $$ begin
  insert into public.registros_hh (obra_canonica_id, persona_id, fecha, fecha_inicio_semana, horas, tipo_hora)
    values (null, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date, current_date, 9, 'normal');
  raise exception 'FALLÓ: entraron horas trabajadas sin obra';
exception when insufficient_privilege then null; end $$;
reset role;
do $$ begin
  insert into public.registros_hh (obra_canonica_id, persona_id, fecha, fecha_inicio_semana, horas, tipo_hora)
    values (null, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date, current_date, 9, 'normal');
  raise exception 'FALLÓ: el CHECK dejó entrar horas trabajadas sin obra';
exception when check_violation then null; end $$;
set role authenticated;
\echo '  OK 5 · sin obra sólo se puede estar ausente o de licencia (policy y CHECK)'

-- ── 6 · CAMPO NO ESCRIBE SU PROPIA AUSENCIA ──────────────────────────────
-- El portón de rol se conserva: declararse ausente uno mismo sería declarar su propia licencia.
set test.uid = '33333333-3333-3333-3333-333333333333';
do $$ begin
  insert into public.registros_hh (obra_canonica_id, persona_id, fecha, fecha_inicio_semana, horas, tipo_hora)
    values (null, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date - 2, current_date - 2, 9, 'ausencia');
  raise exception 'FALLÓ: el rol campo pudo escribir una ausencia';
exception when insufficient_privilege then null; end $$;
-- Pero SÍ la lee: es suya. `hh_select_por_obra` no mira la obra, así que una fila sin obra no queda
-- invisible para su dueño — que es el agujero que describía `20260819T2900`.
select public.assert((select count(*) from public.registros_hh) = 1,
  'la persona tiene que ver SU ausencia sin obra, y sólo la suya');
\echo '  OK 6 · campo no escribe su ausencia, pero la ve'

-- ── 7 · LA AUSENCIA SIN OBRA NO SE MUDA A UNA OBRA CON UN `update` ───────
-- El `with check` mira la fila NUEVA. Sin él, la ausencia entraría sin obra y después se le
-- imputaría a la obra que fuera, que es justo lo que el dueño rechazó.
set test.uid = '22222222-2222-2222-2222-222222222222';
do $$ begin
  update public.registros_hh set tipo_hora = 'normal'
    where persona_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and obra_canonica_id is null;
  raise exception 'FALLÓ: una ausencia sin obra se pudo convertir en horas trabajadas sin obra';
exception when insufficient_privilege then null; end $$;
reset role;
do $$ begin
  update public.registros_hh set tipo_hora = 'normal'
    where persona_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and obra_canonica_id is null;
  raise exception 'FALLÓ: el CHECK dejó convertir la ausencia sin obra en trabajo';
exception when check_violation then null; end $$;
set role authenticated;
\echo '  OK 7 · el update no puede convertir la ausencia sin obra en trabajo'

-- ── 8 · LAS 19 FILAS LEGACY SIGUEN AHÍ ───────────────────────────────────
-- El CHECK nace `not valid` a propósito: hay 19 filas históricas sin obra y `normal` en la base
-- real (medido el 08/09/2026). Validarlo abortaría la migración; borrarlas sería perder historia.
reset role;
select public.assert(
  (select count(*) from public.registros_hh where tipo_hora = 'normal' and obra_canonica_id is null) = 1,
  'la fila legacy sin obra tiene que seguir existiendo: el check no valida lo viejo');
\echo '  OK 8 · el check not valid deja la historia en paz'

-- ── 9 · QUIEN DECLARA LA AUSENCIA PUEDE SACARLA ──────────────────────────
-- Marcar ausente a alguien que sí vino tiene que ser corregible por quien lo marcó.
set role authenticated;
set test.uid = '22222222-2222-2222-2222-222222222222';
delete from public.registros_hh
  where persona_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and obra_canonica_id is null;
select public.assert(
  (select count(*) from public.registros_hh where persona_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 0,
  'el jefe tiene que poder borrar la ausencia sin obra que él mismo declaró');
\echo '  OK 9 · el jefe puede sacar la ausencia que cargó'

-- ── 10 · LOS GRANTS NO CAMBIARON ─────────────────────────────────────────
-- RLS no es GRANT. Si alguien "arregla" un 404 aflojando un grant de columna, esto se pone rojo.
reset role;
select public.assert(
  (select array_agg(privilege_type::text order by privilege_type)
     from information_schema.role_table_grants
    where table_name = 'registros_hh' and grantee = 'authenticated')
  = array['DELETE','INSERT','SELECT','UPDATE'],
  'authenticated tiene que conservar exactamente select/insert/update/delete de tabla');
\echo '  OK 10 · los cuatro grants de tabla, ninguno por columna'
