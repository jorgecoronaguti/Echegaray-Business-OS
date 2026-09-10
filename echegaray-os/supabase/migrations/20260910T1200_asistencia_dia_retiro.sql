-- QUITAR UNA MARCA DE PRESENCIA — 10/09/2026.
--
-- El dueño, con el Plantel abierto: *«si quiero sacarle el presente a alguien que lo tiene, no puedo
-- actualmente; está mal (…) te dije que asistencia es distinto a horas trabajadas»*.
--
-- ═══ LA CAUSA RAÍZ ERA ESTA POLICY, NO LA PANTALLA ═══
--
-- `20260908T2300` dejó el borrado acotado a `origen = 'horas'`, con este razonamiento: «borrar una
-- declaración deja "no se sabe" donde alguien había dicho algo». El razonamiento es correcto para
-- el borrado AUTOMÁTICO —el que arrastra la presencia cuando se borran las horas que la
-- produjeron— y es exactamente lo que hay que impedir ahí. Pero se aplicó a TODO borrado, y con eso
-- una marca puesta por error quedó sin forma de sacarse: ni desde la pantalla, ni desde PostgREST,
-- ni para el dueño. Un botón nuevo habría rebotado con «permission denied» sin decir por qué.
--
-- La distinción que faltaba: quitar a mano NO es «no se sabe» por descuido, es alguien mirando la
-- fila y revocando lo que otro afirmó. Vuelve a «sin marcar», que es el silencio y NUNCA una
-- ausencia (regla E del 08/09/2026: «sin registrar» no es ausente).
--
-- ═══ EL RASTRO NO SE LO PUEDE SALTEAR EL CLIENTE ═══
--
-- Borrar la fila se lleva puesto `marcado_por`/`marcado_en`: sin rastro, el día siguiente nadie
-- puede decir quién sacó la marca. El rastro lo escribe un TRIGGER `before delete`, no la acción:
-- PostgREST no da transacciones, y un rastro escrito desde el cliente se pierde justo cuando hace
-- falta (el proceso se cae entre las dos llamadas). Con el trigger, o se borra con rastro o no se
-- borra.
--
-- REVERSA:
--   drop trigger if exists asistencia_dia_rastro_retiro on public.asistencia_dia;
--   drop function if exists public.asistencia_dia_rastrear_retiro();
--   drop table if exists public.asistencia_dia_retiro;
--   create policy asistencia_dia_delete on public.asistencia_dia for delete to authenticated
--     using (public.es_administracion() and origen = 'horas');

-- ── 1 · EL RASTRO ───────────────────────────────────────────────────────────────────────────────
create table if not exists public.asistencia_dia_retiro (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null,
  fecha date not null,
  -- QUÉ SE SACÓ, no sólo que se sacó. Sin el estado anterior, el historial no distingue haber
  -- quitado un presente de haber quitado una licencia con parte médico.
  estado_antes text not null,
  motivo_antes text,
  obra_canonica_id uuid,
  origen_antes text,
  autor uuid,
  retirado_en timestamptz not null default now()
);

comment on table public.asistencia_dia_retiro is
  'Quién sacó una marca de asistencia_dia, cuándo, y qué decía la marca. Lo escribe el trigger '
  'asistencia_dia_rastro_retiro: la fila borrada se lleva marcado_por y marcado_en.';

create index if not exists asistencia_dia_retiro_persona_fecha
  on public.asistencia_dia_retiro (persona_id, fecha desc);

create or replace function public.asistencia_dia_rastrear_retiro()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.asistencia_dia_retiro (
    persona_id, fecha, estado_antes, motivo_antes, obra_canonica_id, origen_antes, autor
  ) values (
    old.persona_id, old.fecha, old.estado, old.motivo, old.obra_canonica_id, old.origen, auth.uid()
  );
  return old;
end;
$function$;

comment on function public.asistencia_dia_rastrear_retiro() is
  'Sella quién quitó la marca y qué decía, antes de que el delete se la lleve.';

drop trigger if exists asistencia_dia_rastro_retiro on public.asistencia_dia;
create trigger asistencia_dia_rastro_retiro
  before delete on public.asistencia_dia
  for each row execute function public.asistencia_dia_rastrear_retiro();

-- ── 2 · RLS DEL RASTRO ──────────────────────────────────────────────────────────────────────────
alter table public.asistencia_dia_retiro enable row level security;

-- LEE quien administra (Dirección, Administración y jefe de obra desde el 19/08) y la persona lo
-- suyo — el mismo alcance que `asistencia_dia_select`: un historial que se ve menos que el dato que
-- explica no explica nada.
drop policy if exists asistencia_dia_retiro_select on public.asistencia_dia_retiro;
create policy asistencia_dia_retiro_select on public.asistencia_dia_retiro for select to authenticated
  using (public.es_administracion() or persona_id = public.mi_persona_id());

-- NADIE ESCRIBE ESTA TABLA A MANO. Sin policy de insert, el único que puede escribirla es el
-- trigger, que corre como `security definer`: un rastro que el cliente puede fabricar o borrar no
-- es un rastro. Tampoco hay update ni delete, ni para Administración.
grant select on public.asistencia_dia_retiro to authenticated;

-- ── 3 · EL BORRADO A MANO, PARA QUIEN ADMINISTRA ────────────────────────────────────────────────
--
-- Se saca el `origen = 'horas'`. El alcance de quién sigue siendo el mismo que ya tenía la tabla
-- para escribir (`es_administracion()`): esto no le da permiso a nadie que no pudiera ya cambiar el
-- estado de esa misma fila — cambiar 'presente' por 'ausente' siempre estuvo permitido, y quitarla
-- afirma menos que eso.
drop policy if exists asistencia_dia_delete on public.asistencia_dia;
create policy asistencia_dia_delete on public.asistencia_dia for delete to authenticated
  using (public.es_administracion());

-- POLICY SIN GRANT = «permission denied»: dos permisos distintos (memoria: rls-no-es-grant).
grant delete on public.asistencia_dia to authenticated;
