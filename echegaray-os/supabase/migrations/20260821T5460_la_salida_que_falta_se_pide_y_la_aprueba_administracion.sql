-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- M05 · LA SALIDA QUE FALTA SE PIDE, Y LA APRUEBA ADMINISTRACIÓN
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- La pantalla de asistencia del empleado ya DETECTA el día sin salida —`mi_asistencia_dia` lo
-- publica como `falta_salida` desde la 20260820T6000— y no ofrece absolutamente nada para
-- resolverlo. El texto de la pantalla decía «queda marcado hasta que Administración lo corrija», y
-- el único camino real era avisarle a alguien por teléfono. El diseño (M05) lo cierra: «Falta tu
-- salida del 15/08 · Pedí la corrección y la aprueba Administración».
--
-- ═══ POR QUÉ UNA SOLICITUD Y NO UN UPDATE ═══
--
-- `asistencia_marca_update` ya existe y ya es de Administración sola, a propósito: *«si el empleado
-- pudiera editar su propia hora de entrada, la marca dejaría de ser un hecho y pasaría a ser una
-- declaración editable»*. Esta migración NO afloja esa regla. Lo que agrega es la otra mitad que
-- faltaba: el canal por donde el empleado PIDE, sin poder escribir el hecho.
--
-- Dos entidades distintas y se mantienen distintas:
--
--   `asistencia_marca`                     el HECHO — a qué hora se salió.
--   `solicitud_correccion_asistencia`      el PEDIDO — a qué hora dice el empleado que salió, quién
--                                          lo resolvió y cuándo.
--
-- Aprobar es lo que las junta, y las junta EN UNA SOLA TRANSACCIÓN (ver `aprobar_correccion_
-- asistencia`): una solicitud marcada aprobada sin la marca escrita sería una pantalla diciendo
-- «corregido» sobre un día que sigue sin salida.
--
-- ═══ RLS NO ES GRANT ═══
--
-- Cada objeto lleva su grant pegado a su definición. Una policy sin grant da «permission denied» y
-- Next lo muestra como un 404.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1 · LA SOLICITUD ────────────────────────────────────────────────────────────────────────────
--
-- `hora_propuesta` es un `time` y no un `timestamptz`: lo que la persona sabe es «salí seis y
-- veinte», no un instante UTC. El instante lo arma la aprobación, una sola vez y en un solo lugar.
create table if not exists public.solicitud_correccion_asistencia (
  id             uuid primary key default gen_random_uuid(),
  persona_id     uuid not null references public.personas(id) on delete cascade,
  -- El día que se corrige. NO es el día en que se pide: alguien puede pedir el lunes la corrección
  -- del viernes, y confundir las dos fechas corrige el día equivocado.
  fecha          date not null,
  tipo           text not null default 'salida' check (tipo in ('entrada', 'salida')),
  hora_propuesta time not null,
  motivo         text not null check (length(btrim(motivo)) >= 3),
  estado         text not null default 'pendiente'
                   check (estado in ('pendiente', 'aprobada', 'rechazada')),
  -- LA RESOLUCIÓN, CON NOMBRE Y FECHA. Una corrección de asistencia mueve horas que después se
  -- liquidan: quién la aprobó no es metadato, es parte del hecho.
  resuelto_por   uuid references auth.users(id) on delete set null,
  resuelta_en    timestamptz,
  nota_resolucion text,
  -- LA PRUEBA DEL EFECTO. Apunta a la marca que la aprobación escribió de verdad. Si esta columna
  -- está vacía en una solicitud aprobada, la aprobación no llegó a la asistencia — y eso se puede
  -- consultar, no hay que creerle al estado.
  marca_id       uuid references public.asistencia_marca(id) on delete set null,
  creado_por     uuid default auth.uid(),
  creado_en      timestamptz not null default now()
);

-- UNA SOLA PENDIENTE POR DÍA Y TIPO. Sin esto, tocar el botón tres veces con mala señal deja tres
-- pedidos idénticos en la bandeja de Administración y aprobar el segundo después del primero
-- reescribiría una marca ya corregida. Las resueltas NO entran en el único: el historial se guarda,
-- y un pedido rechazado tiene que poder volver a hacerse con otra hora.
create unique index if not exists solicitud_correccion_una_pendiente
  on public.solicitud_correccion_asistencia (persona_id, fecha, tipo)
  where estado = 'pendiente';

create index if not exists solicitud_correccion_persona
  on public.solicitud_correccion_asistencia (persona_id, fecha desc);

-- La bandeja de Administración lee exactamente esto y nada más.
create index if not exists solicitud_correccion_pendientes
  on public.solicitud_correccion_asistencia (creado_en)
  where estado = 'pendiente';

comment on table public.solicitud_correccion_asistencia is
  'El PEDIDO de corregir una marca de asistencia. No es el hecho: el hecho vive en asistencia_marca y sólo lo escribe la aprobación. El empleado pide, Administración resuelve, y marca_id es la prueba de que la aprobación llegó a la asistencia.';

alter table public.solicitud_correccion_asistencia enable row level security;

-- LEE: cada uno lo suyo. Administración, todo — es quien resuelve.
drop policy if exists solicitud_correccion_select on public.solicitud_correccion_asistencia;
create policy solicitud_correccion_select on public.solicitud_correccion_asistencia
  for select to authenticated
  using (public.es_administracion() or persona_id = public.mi_persona_id());

-- PIDE a nombre propio y SIEMPRE pendiente. El `estado = 'pendiente'` del check es lo que impide
-- autoaprobarse mandando el campo a mano por PostgREST —la pantalla no lo ofrece, pero la pantalla
-- no es la cerradura— y `resuelto_por is null` + `marca_id is null` cierran la otra mitad: sin ellos
-- se podría nacer aprobada apuntando a la marca de cualquiera.
--
-- Es el mismo patrón exacto de `documento_presentacion_insert` (20260820T6000). No es uno nuevo.
drop policy if exists solicitud_correccion_insert on public.solicitud_correccion_asistencia;
create policy solicitud_correccion_insert on public.solicitud_correccion_asistencia
  for insert to authenticated
  with check (
    estado = 'pendiente'
    and resuelto_por is null
    and marca_id is null
    and (
      public.es_administracion()
      or (persona_id = public.mi_persona_id() and persona_id is not null)
    )
  );

-- RESUELVE sólo Administración. El empleado no puede ni siquiera retirar su propio pedido: el
-- rastro de que lo hizo es parte de lo que Administración necesita para entender el mes.
drop policy if exists solicitud_correccion_update on public.solicitud_correccion_asistencia;
create policy solicitud_correccion_update on public.solicitud_correccion_asistencia
  for update to authenticated
  using (public.es_administracion()) with check (public.es_administracion());

-- Sin DELETE, ni para Administración: mismo criterio que `asistencia_marca`. Un pedido equivocado se
-- rechaza, no se borra — si desapareciera, nadie podría explicar por qué el día quedó sin corregir.
grant select, insert, update on public.solicitud_correccion_asistencia to authenticated;

-- ── 2 · LO MÍO, PARA LA PANTALLA DEL EMPLEADO ───────────────────────────────────────────────────
--
-- Mismo patrón que el resto de las `mi_*`: `security_invoker = false` con el portero horneado. La
-- RLS de la tabla ya alcanza para el empleado, pero NO para un usuario de Administración mirando su
-- propia pantalla de asistencia: la policy le devuelve las solicitudes del plantel entero y
-- «Mi información» le mostraría los pedidos de otros. El filtro tiene que ser de la vista.
create or replace view public.mi_correccion_asistencia
with (security_invoker = false) as
  select
    s.id,
    s.fecha,
    s.tipo,
    s.hora_propuesta,
    s.motivo,
    s.estado,
    s.nota_resolucion,
    s.resuelta_en,
    s.creado_en
  from public.solicitud_correccion_asistencia s
  where s.persona_id = public.mi_persona_id()
    -- REDUNDANTE A PROPÓSITO, igual que en `mi_impedimento`: si `mi_persona_id()` es NULL la
    -- comparación de arriba ya no devuelve nada, pero escribirlo deja la garantía a la vista de
    -- quien edite esta consulta mañana.
    and public.mi_persona_id() is not null;

comment on view public.mi_correccion_asistencia is
  'Mis pedidos de corrección de asistencia, con su estado. Lo que se pidió, no lo que se corrigió: el efecto se lee en mi_asistencia_dia.';
grant select on public.mi_correccion_asistencia to authenticated;

-- ── 3 · APROBAR ES ESCRIBIR LA MARCA, NO CAMBIAR UN ESTADO ──────────────────────────────────────
--
-- ═══ POR QUÉ ES UNA FUNCIÓN Y NO DOS ESCRITURAS DESDE LA APLICACIÓN ═══
--
-- Aprobar hace DOS cosas: insertar la salida en `asistencia_marca` y marcar la solicitud. Hechas
-- desde TypeScript son dos viajes que pueden separarse — la primera entra, la segunda falla, y queda
-- una marca escrita que ninguna solicitud explica; o al revés, una solicitud «aprobada» sobre un día
-- que sigue sin salida y una bandeja que dice que está resuelto. Acá las dos van en la misma
-- transacción: o pasan las dos, o no pasa ninguna.
--
-- `security definer` con `es_administracion()` comprobado ADENTRO. No es un atajo para saltear la
-- RLS: es lo que permite que la función escriba en `asistencia_marca` una fila a nombre de OTRA
-- persona —que es exactamente lo que hace Administración al corregir— sin tener que abrirle esa
-- puerta a nadie más. La primera línea del cuerpo es el portero, y si no pasa, la función levanta.
--
-- ═══ LA HORA SE INTERPRETA EN SAN JUAN ═══
--
-- `hora_propuesta` es un reloj de pared: «salí a las 18:20». El instante se arma convirtiendo desde
-- `America/Argentina/San_Juan`, que es donde se trabaja. La base corre en UTC, así que sin el `at
-- time zone` explícito una salida de las 18:20 quedaría guardada tres horas antes de lo que dijo la
-- persona — y esas tres horas se liquidan.
create or replace function public.aprobar_correccion_asistencia(
  p_solicitud uuid,
  p_nota text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.solicitud_correccion_asistencia;
  v_momento timestamptz;
  v_marca uuid;
begin
  if not public.es_administracion() then
    raise exception 'Sólo Administración puede aprobar una corrección de asistencia'
      using errcode = '42501';
  end if;

  -- `for update` porque dos personas de Administración pueden abrir la bandeja a la vez: sin el
  -- lock, las dos leen «pendiente» y las dos escriben la marca.
  select * into s from public.solicitud_correccion_asistencia
   where id = p_solicitud for update;

  if s.id is null then
    raise exception 'Esa solicitud de corrección no existe' using errcode = 'P0002';
  end if;
  if s.estado <> 'pendiente' then
    raise exception 'Esa solicitud ya estaba %', s.estado using errcode = '22023';
  end if;

  v_momento := (s.fecha + s.hora_propuesta) at time zone 'America/Argentina/San_Juan';

  -- SI LA MARCA YA EXISTE, SE CORRIGE — no se duplica ni se rompe. Entre el pedido y la aprobación
  -- alguien pudo haber cargado la salida a mano; en ese caso aprobar significa dejarla en la hora
  -- que Administración acaba de aceptar, que es lo que la decisión dice.
  insert into public.asistencia_marca (persona_id, fecha, tipo, momento, origen, nota)
  values (
    s.persona_id, s.fecha, s.tipo, v_momento, 'correccion_aprobada',
    'Corrección aprobada · pedido de la persona: ' || s.motivo
  )
  on conflict (persona_id, fecha, tipo) where tipo in ('entrada', 'salida')
  do update set momento = excluded.momento,
                origen  = excluded.origen,
                nota    = excluded.nota
  returning id into v_marca;

  update public.solicitud_correccion_asistencia
     set estado = 'aprobada',
         resuelto_por = auth.uid(),
         resuelta_en = now(),
         nota_resolucion = p_nota,
         marca_id = v_marca
   where id = p_solicitud;

  return v_marca;
end;
$$;

comment on function public.aprobar_correccion_asistencia(uuid, text) is
  'Aprueba una corrección ESCRIBIENDO la marca en asistencia_marca y marcando la solicitud, en una sola transacción. Devuelve el id de la marca: el efecto es el dato en la asistencia, no el estado del pedido.';

grant execute on function public.aprobar_correccion_asistencia(uuid, text) to authenticated;

-- ── 4 · RECHAZAR NO TOCA LA ASISTENCIA ──────────────────────────────────────────────────────────
--
-- Existe como función —pudiendo ser un simple UPDATE de la policy— por simetría: las dos
-- resoluciones se llaman igual desde la pantalla, y así ninguna de las dos puede escribirse "a mano"
-- de una forma distinta a la otra. Y deja explícito lo que importa: acá NO se escribe ninguna marca.
create or replace function public.rechazar_correccion_asistencia(
  p_solicitud uuid,
  p_nota text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if not public.es_administracion() then
    raise exception 'Sólo Administración puede rechazar una corrección de asistencia'
      using errcode = '42501';
  end if;

  select estado into v_estado from public.solicitud_correccion_asistencia
   where id = p_solicitud for update;

  if v_estado is null then
    raise exception 'Esa solicitud de corrección no existe' using errcode = 'P0002';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Esa solicitud ya estaba %', v_estado using errcode = '22023';
  end if;

  update public.solicitud_correccion_asistencia
     set estado = 'rechazada',
         resuelto_por = auth.uid(),
         resuelta_en = now(),
         nota_resolucion = p_nota
   where id = p_solicitud;
end;
$$;

comment on function public.rechazar_correccion_asistencia(uuid, text) is
  'Rechaza una corrección. NO escribe ninguna marca: el día queda como estaba y la nota explica por qué.';

grant execute on function public.rechazar_correccion_asistencia(uuid, text) to authenticated;

-- ── 5 · LA BANDEJA DE ADMINISTRACIÓN ────────────────────────────────────────────────────────────
--
-- Le pega el nombre de la persona al pedido. Sin él la bandeja mostraría uuids, y la policy de
-- `personas` ya decide quién puede leer el nombre: la vista es `security_invoker = true` justamente
-- para que ese portero siga siendo el que manda, y no el dueño de la vista.
--
-- ═══ NO SE SELECCIONA `legajo`, Y NO ES UN OLVIDO ═══
--
-- `personas` NO tiene grant de tabla para `authenticated`: tiene grant POR COLUMNA, y son ocho
-- (`id`, `nombre_completo`, `categoria`, `especialidad`, `puesto`, `fecha_ingreso`, `fecha_egreso`,
-- `en_la_empresa`). `legajo` no está entre ellas — el DNI, el CUIL y la retribución tampoco. Con
-- `security_invoker = true` la vista se ejecuta con los permisos de QUIEN CONSULTA, así que nombrar
-- una columna sin grant no la muestra: hace fallar la vista entera con «permission denied» para
-- todos, y Next lo publica como un 404. Agregar el grant sería abrir una columna del maestro de
-- personas para decorar una bandeja: no se hace desde acá.
create or replace view public.correccion_asistencia_bandeja
with (security_invoker = true) as
  select
    s.id,
    s.persona_id,
    p.nombre_completo,
    s.fecha,
    s.tipo,
    s.hora_propuesta,
    s.motivo,
    s.estado,
    s.nota_resolucion,
    s.resuelta_en,
    s.marca_id,
    s.creado_en,
    -- La otra punta del día, para poder juzgar el pedido sin abrir otra pantalla: una salida
    -- propuesta ANTES de la entrada no es una corrección, es un error de tipeo.
    (select min(m.momento) from public.asistencia_marca m
      where m.persona_id = s.persona_id and m.fecha = s.fecha and m.tipo = 'entrada') as entrada,
    (select min(m.momento) from public.asistencia_marca m
      where m.persona_id = s.persona_id and m.fecha = s.fecha and m.tipo = 'salida')  as salida
  from public.solicitud_correccion_asistencia s
  join public.personas p on p.id = s.persona_id;

comment on view public.correccion_asistencia_bandeja is
  'Los pedidos de corrección con nombre y con las dos puntas del día. security_invoker: quién ve qué lo sigue decidiendo la RLS de la tabla, no el dueño de la vista.';
grant select on public.correccion_asistencia_bandeja to authenticated;
