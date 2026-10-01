set local lock_timeout = '5s';

-- 20261001T0300 · LAS CUENTAS DEL LEGAJO: SUELDO Y FONDO DE CESE
--
-- El dueño, 01/10/2026: *«necesito tener control sobre las cuentas de los empleados en los legajos…
-- que quede registro de los números de cuenta bancaria de cada uno y los números de cuenta de FCL,
-- necesito saber quiénes tienen todo creado y en regla»*.
--
-- Hoy esa respuesta no existe en ningún lado: `personas.cbu` (20260909T1730) está vacío en todas las
-- filas y del Fondo de Cese (Ley 22.250; en Santander, la cuenta AFON) no hay nada. Sin el número de
-- FCL el depósito del fondo se arma a mano cada mes, y sin la cuenta sueldo el lote de haberes se
-- concilia por nombre.
--
-- ═══ EL CBU DE LA CUENTA SUELDO ES `personas.cbu`, NO UNA COLUMNA NUEVA ═══
--
-- Ya existe, tiene su CHECK de 22 dígitos y su titular. Una `cuenta_sueldo_cbu` al lado sería el
-- mismo dato en dos lugares, y el día que difieran nadie sabría a cuál depositar.
--
-- ═══ EL ESTADO NULL NO ES «SIN PEDIR» ═══
--
-- `sin_pedir` es un hecho relevado (se miró y no se pidió). NULL es que nadie lo miró todavía. El
-- control trata a los dos igual —ninguno tiene cuenta—, pero la ficha no los escribe igual.

alter table public.personas
  add column if not exists cuenta_sueldo_banco  text,
  add column if not exists cuenta_sueldo_numero text,
  add column if not exists cuenta_sueldo_estado text,
  add column if not exists fcl_cuenta           text,
  add column if not exists fcl_cbu              text,
  add column if not exists fcl_estado           text,
  add column if not exists cuentas_fuente       text,
  add column if not exists cuentas_relevadas_en date;

alter table public.personas drop constraint if exists personas_cuenta_sueldo_estado_valido;
alter table public.personas add constraint personas_cuenta_sueldo_estado_valido
  check (cuenta_sueldo_estado is null or cuenta_sueldo_estado in ('sin_pedir', 'pedida', 'creada'));
alter table public.personas drop constraint if exists personas_fcl_estado_valido;
alter table public.personas add constraint personas_fcl_estado_valido
  check (fcl_estado is null or fcl_estado in ('sin_pedir', 'pedida', 'creada'));
-- El mismo criterio que `personas_cbu_valido`: 22 dígitos o nada.
alter table public.personas drop constraint if exists personas_fcl_cbu_valido;
alter table public.personas add constraint personas_fcl_cbu_valido
  check (fcl_cbu is null or fcl_cbu ~ '^[0-9]{22}$');

comment on column public.personas.cuenta_sueldo_estado is
  'sin_pedir · pedida · creada. NULL = nadie lo relevó todavía (no es lo mismo que sin_pedir). El CBU de esta cuenta es personas.cbu.';
comment on column public.personas.fcl_cuenta is
  'Número de la cuenta del Fondo de Cese Laboral (Ley 22.250; AFON en Santander).';
comment on column public.personas.cuentas_fuente is
  'De qué documento salieron los números de cuenta (constancia del banco, alta AFON, recibo). Sin fuente el número es declarado, no relevado.';

-- ═══ LAS COLUMNAS NACEN CERRADAS, Y SE DICE ═══
--
-- El grant de `personas` es POR COLUMNA desde 20260819T4900 (lectura) y 20260821T5000 (escritura):
-- una columna nueva no está en ninguna lista, así que nace sin permiso. El revoke explícito no es
-- redundante: es lo que 20260909T1730 NO hizo —su comentario decía «no se abre a authenticated» y
-- la sentencia de abajo lo abría— y lo que 20260912T1600 tuvo que cerrar después. Acá el SQL dice
-- lo mismo que el comentario. La lista blanca `PERSONAS_ABIERTAS` de
-- `columnas-comerciales-cerradas.test.mjs` no cambia: ninguna de estas columnas entra.
--
-- RLS NO ES GRANT: la policy de filas de `personas` deja pasar al jefe de obra (es_administracion()),
-- y con un grant de columna leería la cuenta bancaria de cada compañero. La lectura y la escritura
-- legítimas van por las dos funciones de abajo, con el portero adentro.
revoke select (cbu, cbu_titular, cbu_verificado_en,
               cuenta_sueldo_banco, cuenta_sueldo_numero, cuenta_sueldo_estado, fcl_cuenta, fcl_cbu,
               fcl_estado, cuentas_fuente, cuentas_relevadas_en),
       insert (cuenta_sueldo_banco, cuenta_sueldo_numero, cuenta_sueldo_estado, fcl_cuenta, fcl_cbu,
               fcl_estado, cuentas_fuente, cuentas_relevadas_en),
       update (cuenta_sueldo_banco, cuenta_sueldo_numero, cuenta_sueldo_estado, fcl_cuenta, fcl_cbu,
               fcl_estado, cuentas_fuente, cuentas_relevadas_en)
  on public.personas from authenticated, anon;

-- ═══ LECTURA: QUIÉN TIENE TODO Y A QUIÉN LE FALTA QUÉ ═══
--
-- Función y no vista: una vista `security_invoker` chocaría con el revoke de arriba («permission
-- denied for table personas») y una vista sin invoker apagaría la RLS de la tabla entera — el error
-- que ya se pagó con `persona_directorio` el 07/09. `security definer` con el portero en la primera
-- línea es el patrón de `fijar_retribucion()`.
--
-- EL PORTERO ES `liquida_sueldos()` Y NO `ve_economia()`: las cuentas sirven para PAGAR sueldos y el
-- FCL, son del módulo de Liquidación. Hoy las dos dicen lo mismo (Dirección y Administración); el día
-- que la economía de obra se abra a otro rol, las cuentas bancarias del plantel no se abren con ella.
-- Jefe de obra NO, empleado NO. Sin permiso es un 42501, no cero filas: «no puedo ver» no se
-- disfraza de «no hay».
--
-- `control`: completo = sueldo creada con CBU + FCL creada con número (o FCL no exigible). El FCL se
-- exige a convenio UOCRA / Ley 22.250 / CCT 76/75, y TAMBIÉN a quien no tiene convenio cargado: no
-- se afirma «no le corresponde» sobre un dato que nadie miró. El espejo en TS es
-- `src/features/administracion/services/cuentasDelLegajo.ts` y su test ata el patrón.
--
-- Sin argumento: el plantel vigente (en_la_empresa, sin registros de prueba). Con `p_persona_id`: esa
-- persona aunque haya egresado — su ficha sigue abriéndose y sus cuentas siguen siendo suyas.

create or replace function public.cuentas_del_plantel(p_persona_id uuid default null)
returns table (
  persona_id           uuid,
  nombre               text,
  legajo               text,
  convenio_colectivo   text,
  en_la_empresa        boolean,
  cuenta_sueldo_banco  text,
  cuenta_sueldo_numero text,
  cbu                  text,
  cuenta_sueldo_estado text,
  fcl_cuenta           text,
  fcl_cbu              text,
  fcl_estado           text,
  fcl_exigible         boolean,
  cuentas_fuente       text,
  cuentas_relevadas_en date,
  control              text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
#variable_conflict use_column
begin
  if not public.liquida_sueldos() then
    raise exception 'Las cuentas del plantel las ven Dirección y Administración' using errcode = '42501';
  end if;
  return query
  with c as (
    select p.*,
           (p.convenio_colectivo is null or btrim(p.convenio_colectivo) = ''
             or p.convenio_colectivo ~* '(uocra|22\.?250|76/75)') as exige,
           coalesce(p.cuenta_sueldo_estado = 'creada' and p.cbu is not null, false) as sueldo_ok,
           coalesce(p.fcl_estado = 'creada' and (p.fcl_cuenta is not null or p.fcl_cbu is not null), false) as fcl_creada
      from public.personas p
     where (p_persona_id is null and p.en_la_empresa and not coalesce(p.es_prueba, false))
        or p.id = p_persona_id
  )
  select c.id, c.nombre_completo, c.legajo, c.convenio_colectivo, c.en_la_empresa,
         c.cuenta_sueldo_banco, c.cuenta_sueldo_numero, c.cbu, c.cuenta_sueldo_estado,
         c.fcl_cuenta, c.fcl_cbu, c.fcl_estado, c.exige,
         c.cuentas_fuente, c.cuentas_relevadas_en,
         case
           when c.sueldo_ok and (c.fcl_creada or not c.exige) then 'completo'
           when c.sueldo_ok then 'falta_fcl'
           when c.fcl_creada or not c.exige then 'falta_sueldo'
           else 'falta_todo'
         end
    from c
   order by c.nombre_completo;
end;
$$;

comment on function public.cuentas_del_plantel(uuid) is
  'Cuentas sueldo y FCL por persona con su control (completo · falta_sueldo · falta_fcl · falta_todo). '
  'Portero liquida_sueldos(): Dirección y Administración. Sin argumento = plantel vigente.';

-- ═══ ESCRITURA: UNA SOLA PUERTA, CON PORTERO Y CON AUTOR ═══
--
-- Mismo patrón que `fijar_retribucion()`: el sin-sesión NO pasa — una cuenta bancaria cambiada sin
-- autor es la forma clásica de desviar un sueldo, y el orquestador tiene `service_role` si alguna
-- vez la carga en lote. Devuelve `actualizado_en` leído del RETURNING: quien llama verifica el
-- efecto releyendo, no confiando en un 204.
--
-- CAMBIAR EL CBU BORRA `cbu_verificado_en`: la verificación era del número viejo. Dejarla puesta
-- diría «verificado» sobre una cuenta que nadie comprobó.

create or replace function public.fijar_cuentas_de_persona(
  p_persona_id           uuid,
  p_cuenta_sueldo_banco  text,
  p_cuenta_sueldo_numero text,
  p_cbu                  text,
  p_cuenta_sueldo_estado text,
  p_fcl_cuenta           text,
  p_fcl_cbu              text,
  p_fcl_estado           text,
  p_cuentas_fuente       text,
  p_cuentas_relevadas_en date
)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cbu     text := nullif(btrim(p_cbu), '');
  v_fcl_cbu text := nullif(btrim(p_fcl_cbu), '');
  v_numero  text := nullif(btrim(p_cuenta_sueldo_numero), '');
  v_fcl     text := nullif(btrim(p_fcl_cuenta), '');
  v_en      timestamptz;
begin
  if not public.liquida_sueldos() then
    raise exception 'Las cuentas del plantel las cargan Dirección y Administración' using errcode = '42501';
  end if;
  if v_cbu is not null and v_cbu !~ '^[0-9]{22}$' then
    raise exception 'El CBU de la cuenta sueldo tiene 22 dígitos' using errcode = '22023';
  end if;
  if v_fcl_cbu is not null and v_fcl_cbu !~ '^[0-9]{22}$' then
    raise exception 'El CBU de la cuenta FCL tiene 22 dígitos' using errcode = '22023';
  end if;
  if coalesce(p_cuenta_sueldo_estado, 'creada') not in ('sin_pedir', 'pedida', 'creada')
     or coalesce(p_fcl_estado, 'creada') not in ('sin_pedir', 'pedida', 'creada') then
    raise exception 'El estado de una cuenta es sin_pedir, pedida o creada' using errcode = '22023';
  end if;
  -- «CREADA» SIN NÚMERO NO ES UN REGISTRO: es una afirmación que nadie puede comprobar.
  if p_cuenta_sueldo_estado = 'creada' and v_numero is null and v_cbu is null then
    raise exception 'Cuenta sueldo «creada» necesita el número o el CBU' using errcode = '22023';
  end if;
  if p_fcl_estado = 'creada' and v_fcl is null and v_fcl_cbu is null then
    raise exception 'Cuenta FCL «creada» necesita el número o el CBU' using errcode = '22023';
  end if;

  update public.personas p
     set cuenta_sueldo_banco  = nullif(btrim(p_cuenta_sueldo_banco), ''),
         cuenta_sueldo_numero = v_numero,
         cbu_verificado_en    = case when p.cbu is distinct from v_cbu then null else p.cbu_verificado_en end,
         cbu                  = v_cbu,
         cuenta_sueldo_estado = p_cuenta_sueldo_estado,
         fcl_cuenta           = v_fcl,
         fcl_cbu              = v_fcl_cbu,
         fcl_estado           = p_fcl_estado,
         cuentas_fuente       = nullif(btrim(p_cuentas_fuente), ''),
         cuentas_relevadas_en = p_cuentas_relevadas_en,
         actualizado_por      = auth.uid(),
         actualizado_en       = now()
   where p.id = p_persona_id
  returning p.actualizado_en into v_en;
  if not found then
    raise exception 'No existe esa persona' using errcode = 'P0002';
  end if;
  return v_en;
end;
$$;

comment on function public.fijar_cuentas_de_persona(uuid, text, text, text, text, text, text, text, text, date) is
  'Única vía de escritura de las cuentas sueldo y FCL desde la web. Portero liquida_sueldos(). '
  'Deja actualizado_por/actualizado_en; cambiar el CBU borra cbu_verificado_en.';

-- UNA FUNCIÓN `security definer` CON EXECUTE A PUBLIC ES UNA FUGA: PostgreSQL lo concede por defecto
-- al crearla, y `anon` lo hereda. Se revoca primero y se abre sólo a quien tiene sesión; el portero
-- de adentro decide entre los que la tienen.
revoke execute on function public.cuentas_del_plantel(uuid) from public, anon;
revoke execute on function public.fijar_cuentas_de_persona(uuid, text, text, text, text, text, text, text, text, date) from public, anon;
grant execute on function public.cuentas_del_plantel(uuid) to authenticated;
grant execute on function public.fijar_cuentas_de_persona(uuid, text, text, text, text, text, text, text, text, date) to authenticated;

-- ═══ LA BITÁCORA MIRA LAS CUENTAS, CON EL NÚMERO TAPADO ═══
--
-- `actualizado_por` guarda sólo el último cambio; quién cambió un CBU y cuándo tiene que sobrevivir
-- al siguiente. Se rehace el trigger de 20260821T5200 con su MISMA lista (es la única migración que
-- lo define) más las cuentas. Los números van tapados con •••: `entidad_cambio` la lee más gente que
-- Liquidación, y la bitácora dice QUE cambió, no a qué.
drop trigger if exists personas_auditar on public.personas;
create trigger personas_auditar
  after update on public.personas
  for each row execute function public.auditar_cambio(
    'personas',
    'nombre_completo,dni,cuil,fecha_nacimiento,legajo,fecha_ingreso,fecha_egreso,en_la_empresa,'
    'categoria,especialidad,puesto,convenio_colectivo,modalidad_liquidacion,retribucion_pactada,'
    'cbu,cuenta_sueldo_numero,cuenta_sueldo_estado,fcl_cuenta,fcl_cbu,fcl_estado',
    'retribucion_pactada,cbu,cuenta_sueldo_numero,fcl_cuenta,fcl_cbu');

notify pgrst, 'reload schema';
