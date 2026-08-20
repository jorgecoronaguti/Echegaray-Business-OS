-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- MI CUENTA · CADA UNO VE LO SUYO, Y SÓLO LO SUYO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ EL AGUJERO QUE ESTA MIGRACIÓN LLENA ═══
--
-- `/mi-cuenta` le promete a cada persona su legajo, sus horas y sus documentos. Antes de escribir
-- una línea de pantalla se fue a ver cómo se vincula hoy un usuario con su persona, y la respuesta
-- es que NO SE VINCULA:
--
--   · `perfiles` (id = auth.users.id, rol, nombre) no tiene una sola columna que apunte a `personas`.
--   · `personas` sólo la lee `es_administracion()`, con grant por columna que le niega dni/cuil a
--     `authenticated` (20260819T2300).
--   · `documentacion_legajo` sólo la lee `es_administracion()`.
--   · `registros_hh` la lee Administración o quien ve la obra (`hh_select_por_obra`).
--
-- O sea: hoy un oficial albañil no puede ver sus propias horas, y la única forma de dárselas sin
-- esta migración sería sacarlas con la service key desde el servidor — que es exactamente la puerta
-- trasera que convierte a la RLS en decorativa. Se hace en la base o no se hace.
--
-- ═══ EL PATRÓN ES EL DE `persona_legajo`, NO UNO NUEVO ═══
--
-- Vistas `security_invoker = false` con EL PORTERO ADENTRO. La vista puede leer lo que el grant le
-- niega al invocante, y lo que la contiene es el `where … = public.mi_persona_id()` que lleva
-- horneado. Es el mismo mecanismo que ya sostiene `persona_legajo` y `persona_plantel`, con la
-- diferencia de que acá el portero no es un ROL: es la IDENTIDAD de quien pregunta.
--
-- FALLA CERRADO POR CONSTRUCCIÓN. Si el usuario no tiene persona vinculada, `mi_persona_id()`
-- devuelve NULL, `x = NULL` es NULL, y una vista con un `where` que nunca es verdadero devuelve cero
-- filas. No hay un default que publique el legajo de otro.
--
-- ═══ Y LA TRAMPA QUE YA SE PAGÓ: RLS NO ES GRANT ═══
--
-- Una policy sin su `grant` da «permission denied for table …», y Next lo muestra como un 404 — se
-- perdió medio día buscando una ruta rota que era un permiso faltante. Cada objeto de acá abajo
-- lleva su `grant select` pegado a su definición, no en un bloque al final donde uno se olvida.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1 · EL VÍNCULO: UN USUARIO ES —A LO SUMO— UNA PERSONA ───────────────────────────────────────
--
-- PERSONA ≠ USUARIO, y por eso el vínculo es una columna opcional y no una fusión de las dos
-- tablas. Hay personas del plantel que no tienen cuenta (la mayoría), y hay cuentas que no son una
-- persona del plantel (el estudio contable, una casilla de sistema). Lo que no puede haber es una
-- persona con dos cuentas: sería la misma gente cobrando dos legajos.
alter table public.perfiles add column if not exists persona_id uuid references public.personas(id) on delete set null;

-- ÚNICO PARCIAL. Un `unique` a secas sobre una columna que acepta NULL no restringe nada entre los
-- NULL —ya vivió un índice único sobre 206 NULLs sin quejarse una sola vez—; lo que hay que impedir
-- es que la MISMA persona quede colgada de dos usuarios, y eso sólo aplica a las filas vinculadas.
create unique index if not exists perfiles_una_persona_por_usuario
  on public.perfiles (persona_id) where persona_id is not null;

comment on column public.perfiles.persona_id is
  'La persona del plantel que ES este usuario. NULL = la cuenta no está vinculada a un legajo. Lo vincula Administración desde Usuarios; nadie se autovincula (el grant de update no incluye esta columna).';

-- ── 2 · LOS DATOS DE CONTACTO QUE SON DEL USUARIO, NO DEL LEGAJO ────────────────────────────────
--
-- El teléfono del legajo es DATO LABORAL —vive en `personas` y lo administra Administración—. El
-- que se pone en Mi cuenta es el de la cuenta: a dónde llega un aviso del OS. Son dos cosas y se
-- guardan por separado a propósito: si fueran la misma, cambiar el teléfono en Mi cuenta editaría
-- el legajo, y el legajo no lo edita el empleado.
alter table public.perfiles add column if not exists telefono text;
alter table public.perfiles add column if not exists avatar_url text;

comment on column public.perfiles.telefono is
  'Teléfono DE LA CUENTA, no del legajo. El del legajo es personas.telefono y lo administra Administración.';
comment on column public.perfiles.avatar_url is
  'Dirección pública de la foto de perfil en Storage. NULL = sin foto: la interfaz dibuja las iniciales, nunca un avatar genérico que parezca una persona que no es.';

-- ── 3 · CADA UNO EDITA SU PROPIA FILA, Y NO SU ROL ──────────────────────────────────────────────
--
-- ═══ LA POLICY SOLA SERÍA UNA ESCALADA DE PRIVILEGIOS ═══
--
-- `using (id = auth.uid())` deja que cada quien actualice SU fila… incluida la columna `rol`. Un
-- usuario de campo se escribiría `rol = 'direccion'` con una llamada a PostgREST y se abriría la
-- economía entera. La cerradura real es el GRANT POR COLUMNA: Postgres rechaza el UPDATE de una
-- columna no concedida antes de mirar una sola policy.
--
-- Por eso el grant enumera TRES columnas y ninguna más. `rol`, `persona_id` e `id` quedan fuera y
-- siguen siendo de `service_role`, que es por donde Administración da de alta y asigna.
drop policy if exists perfiles_update_propio on public.perfiles;
create policy perfiles_update_propio on public.perfiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

grant update (nombre, telefono, avatar_url) on public.perfiles to authenticated;

-- ── 4 · QUIÉN SOY, EN UNA SOLA FUNCIÓN ──────────────────────────────────────────────────────────
--
-- `security definer` porque tiene que poder leer `perfiles` sin depender de la policy del invocante,
-- igual que `current_rol()`. `stable` para que el planificador la evalúe una vez por consulta y no
-- una vez por fila: es el portero de vistas que recorren miles de registros de horas.
create or replace function public.mi_persona_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select persona_id from public.perfiles where id = auth.uid()
$$;

comment on function public.mi_persona_id() is
  'La persona del plantel que es el usuario de la sesión, o NULL si su cuenta no está vinculada. Es EL portero de todas las vistas mi_*: con NULL, todas devuelven cero filas.';

grant execute on function public.mi_persona_id() to authenticated;

-- ── 5 · MI LEGAJO ───────────────────────────────────────────────────────────────────────────────
--
-- ═══ POR QUÉ NO PUBLICA MI PROPIO DNI NI MI PROPIO SUELDO ═══
--
-- Podría: es mío. No lo hace porque NINGUNA pantalla de Mi cuenta los muestra —el handoff pide
-- categoría, cuadrilla, obra actual, alta, asignación vigente e historial— y una columna que nadie
-- dibuja pero que igual viaja al navegador es una fuga sin beneficio. `retribucion_pactada` además
-- no sale de la base por ninguna vista de la web, y esto no va a ser la primera.
--
-- La lista de columnas es FIJA a propósito: agregarle una es una decisión, no un descuido.
create or replace view public.mi_legajo
with (security_invoker = false) as
select
  p.id,
  p.nombre_completo,
  p.categoria,
  p.especialidad,
  p.puesto,
  p.convenio_colectivo,
  p.fecha_ingreso,
  p.fecha_egreso,
  p.en_la_empresa,
  p.legajo
from public.personas p
where p.id = public.mi_persona_id();

comment on view public.mi_legajo is
  'El legajo PROPIO, en sólo lectura. Sin dni, cuil, domicilio ni retribución: ninguna pantalla los muestra. Devuelve cero filas si la cuenta no está vinculada a una persona.';

grant select on public.mi_legajo to authenticated;

-- ── 6 · MIS ASIGNACIONES ────────────────────────────────────────────────────────────────────────
--
-- La obra actual NO se guarda: se deriva de la asignación vigente, que es el criterio que ya
-- gobierna las cuadrillas (*"NO guardes 'obra actual' como segunda verdad si se deriva de la
-- asignación vigente"*). `vigente` se calcula acá, una vez, para que la pantalla no vuelva a
-- inventar qué significa vigente.
create or replace view public.mi_asignacion
with (security_invoker = false) as
select
  a.id,
  a.obra_id,
  o.nombre as obra,
  a.rol,
  a.cuadrilla,
  a.desde,
  a.hasta,
  -- Sin `desde` la asignación no se puede fechar: se la trata como vigente si tampoco tiene fin,
  -- que es como la cargó quien no se acordaba del día pero sabe que esa persona está ahí.
  (coalesce(a.desde, '-infinity'::date) <= current_date
   and (a.hasta is null or a.hasta >= current_date)) as vigente
from public.obra_asignacion a
left join public.obra_canonica o on o.id = a.obra_id
where a.persona_id = public.mi_persona_id();

comment on view public.mi_asignacion is
  'A qué obras estoy —o estuve— asignado, con la vigencia ya resuelta. La obra actual se DERIVA de acá: no hay una columna «obra actual» que pueda quedar desactualizada.';

grant select on public.mi_asignacion to authenticated;

-- ── 7 · MIS HORAS ───────────────────────────────────────────────────────────────────────────────
--
-- El grano es el mismo que el de `persona_hh_dia` —día · obra · actividad · tipo— porque es el
-- mismo hecho: son las horas que la obra imputó a mi nombre, no un segundo registro paralelo. Si
-- esta vista sumara o filtrara distinto, mi total y el de la obra dejarían de coincidir y nadie
-- sabría cuál de los dos está mal.
--
-- Las 19 filas legacy sin `persona_id` no pueden aparecer acá: no se sabe de quién son, y
-- atribuirlas por parecido de nombre sería inventarle horas a alguien.
create or replace view public.mi_hh_dia
with (security_invoker = false) as
select
  h.id,
  h.fecha,
  h.fecha_inicio_semana,
  h.obra_canonica_id as obra_id,
  o.nombre as obra,
  h.actividad_id,
  a.nombre as actividad,
  h.tipo_hora,
  h.horas,
  h.notas
from public.registros_hh h
left join public.obra_canonica o on o.id = h.obra_canonica_id
left join public.obra_actividad a on a.id = h.actividad_id
where h.persona_id is not null
  and h.persona_id = public.mi_persona_id();

comment on view public.mi_hh_dia is
  'Mis horas imputadas, al mismo grano que persona_hh_dia. SÓLO LECTURA: corregir una imputación se hace en la obra, que es donde se cargó.';

grant select on public.mi_hh_dia to authenticated;

-- ── 8 · MIS DOCUMENTOS, Y LA COLUMNA QUE LES FALTABA ────────────────────────────────────────────
--
-- ═══ SIN VENCIMIENTO NO HAY CONTROL DE VENCIMIENTOS ═══
--
-- El handoff pide la columna «Vencimiento» con vencido en `neg` y por vencer en `warn`, y
-- `documentacion_legajo` no tiene dónde guardarla: tiene `fecha_documento`, que es cuándo se emitió.
-- Un apto médico vencido y una libreta del IERIC vencida son riesgo laboral real, no un adorno de
-- interfaz, así que la columna se agrega: `null` = «sin vencimiento» (el DNI no vence) y NUNCA se
-- deriva de la fecha de emisión sumándole un plazo inventado.
alter table public.documentacion_legajo add column if not exists fecha_vencimiento date;

comment on column public.documentacion_legajo.fecha_vencimiento is
  'Cuándo deja de valer el documento. NULL = no vence o no se declaró: no se deduce sumándole un plazo a fecha_documento.';

create or replace view public.mi_documento_legajo
with (security_invoker = false) as
select
  d.id,
  d.tipo_documento,
  d.nombre,
  d.presente,
  d.drive_file_id,
  d.fecha_documento,
  d.fecha_vencimiento
from public.documentacion_legajo d
where d.persona_id = public.mi_persona_id();

comment on view public.mi_documento_legajo is
  'Los papeles de MI legajo, con su vínculo a Drive. El archivo no se copia: sigue viviendo en Drive con sus permisos.';

grant select on public.mi_documento_legajo to authenticated;

-- ── 9 · LA FOTO DE PERFIL ───────────────────────────────────────────────────────────────────────
--
-- Bucket público, igual que el de herramientas: la foto se muestra en el header, en los partes y en
-- las cuadrillas, o sea en todas las pantallas y para todos. Lo que NO es público es escribirla.
--
-- LA CARPETA ES EL ID DEL USUARIO. `storage.foldername(name)[1] = auth.uid()::text` es lo que impide
-- que alguien suba una foto encima de la de otro: sin esa condición, «cambiar mi foto» sería
-- «cambiarle la foto a quien yo quiera».
insert into storage.buckets (id, name, public)
values ('avatares', 'avatares', true)
on conflict (id) do nothing;

drop policy if exists "avatares_read" on storage.objects;
create policy "avatares_read" on storage.objects
  for select to public using (bucket_id = 'avatares');

drop policy if exists "avatares_insert_propio" on storage.objects;
create policy "avatares_insert_propio" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatares_update_propio" on storage.objects;
create policy "avatares_update_propio" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatares_delete_propio" on storage.objects;
create policy "avatares_delete_propio" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
