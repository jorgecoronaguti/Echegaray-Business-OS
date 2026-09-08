-- LA PRESENCIA DECLARADA POR EL JEFE ES UN HECHO PROPIO — no una lectura de las horas.
--
-- El dueño, 08/09/2026, textual: *«una cosa es asistir y otra la carga de horas»* y *«la versión
-- mobile de carga de asistencia no tiene que referenciar horas de trabajo sino si está o no la
-- persona»*.
--
-- ═══ POR QUÉ UNA TABLA NUEVA Y NO UNA COLUMNA EN `registros_hh` ═══
--
-- Hoy la presencia se INFIERE de `registros_hh`: hay horas ⇒ estuvo; hay una fila con
-- `tipo_hora='ausencia'` ⇒ no vino; no hay nada ⇒ no se sabe. Eso obliga a que decir «Juan está»
-- cueste inventar un número de horas, y es exactamente lo que el dueño pidió separar. Al revés
-- también falla: un día sin horas cargadas no puede afirmar nada sobre si la persona vino.
--
-- Son TRES hechos con TRES fuentes y ninguno se deriva de otro (docs/engineering/UX_ASISTENCIA_VS_HORAS.md):
--
--   FICHAJE   → `asistencia_marca`  · lo marca la PERSONA con su teléfono, con hora y lugar.
--   PRESENCIA → `asistencia_dia`    · la DECLARA el jefe: está / no vino / licencia. ESTA TABLA.
--   HORAS     → `registros_hh`      · cuántas horas se imputan a qué obra. Es costo.
--
-- Una columna dentro de `registros_hh` habría atado la presencia a la existencia de una fila de
-- horas —el acoplamiento que se está deshaciendo— y habría hecho imposible declarar presencia sin
-- imputar costo a una obra.
--
-- ═══ UNA FILA POR PERSONA Y DÍA, NO UN EVENTO ═══
--
-- A diferencia de `asistencia_marca` (un evento con hora: entrada, salida, incidencia), la
-- presencia declarada es el ESTADO del día: no tiene hora, se corrige, y sólo puede haber uno.
-- De ahí el `unique (persona_id, fecha)` y el upsert: reabrir el día y corregir «no vino» por
-- «está» es el caso normal, no una excepción.
--
-- ADITIVA Y REVERSIBLE. No toca ninguna tabla existente. Para revertir:
--   drop table public.asistencia_dia;  drop function public.asistencia_dia_sella_quien();

-- ── 1 · LA TABLA ────────────────────────────────────────────────────────────────────────────────
--
-- `obra_canonica_id` es TEXT porque `obra_canonica.id` es text (mismo tipo que `asistencia_marca.obra_id`).
-- Es NULLABLE a propósito: la presencia es de la persona, no de la obra. Se anota la obra en la
-- que el jefe la declaró —que es el dato operativo que sirve— pero una presencia sin obra sigue
-- siendo una presencia, y forzar una obra obligaría a inventarla.
create table if not exists public.asistencia_dia (
  id                uuid primary key default gen_random_uuid(),
  persona_id        uuid not null references public.personas(id) on delete cascade,
  fecha             date not null,
  obra_canonica_id  text references public.obra_canonica(id),
  estado            text not null check (estado in ('presente', 'ausente', 'licencia')),
  -- La CLAVE del catálogo de `orquestador/lib/asistencia-motivos.mjs`, no texto libre. La lista NO
  -- se copia acá dentro de un CHECK: sería una segunda definición del catálogo que discreparía con
  -- la del bot de Mattermost el día que alguien agregue un motivo. La valida `esMotivo()` en la
  -- acción, contra la única lista que existe.
  motivo            text,
  marcado_por       uuid,
  marcado_en        timestamptz not null default now(),
  -- UN ESTADO POR PERSONA Y DÍA. Es lo que hace que el upsert sea idempotente: guardar dos veces
  -- el mismo día deja una fila, no dos verdades.
  unique (persona_id, fecha),
  -- UNA PRESENCIA NO TIENE MOTIVO. «Está» y además «por lluvia» son dos afirmaciones que se
  -- contradicen, y sin este check una corrección de «no vino» a «está» dejaría el motivo viejo
  -- pegado a la fila y los conteos por causa mentirían para siempre.
  constraint asistencia_dia_presente_sin_motivo
    check (estado <> 'presente' or motivo is null)
);

comment on table public.asistencia_dia is
  'PRESENCIA DECLARADA por el jefe de obra o Administración: si la persona está, no vino o está de '
  'licencia ese día. NO son horas (eso es registros_hh, y es costo) ni el fichaje de la propia '
  'persona (eso es asistencia_marca, y tiene hora). Los tres son hechos distintos y ninguno se '
  'deriva de otro. Decisión del dueño del 08/09/2026.';

comment on column public.asistencia_dia.motivo is
  'Clave del catálogo de orquestador/lib/asistencia-motivos.mjs (falta, lluvia, enfermedad, …). '
  'Sólo cuando el estado es ausente o licencia.';

comment on column public.asistencia_dia.obra_canonica_id is
  'La obra en la que se declaró la presencia. Nullable: la presencia es de la persona, no de la obra.';

-- La lectura de la pantalla es «una obra, un día»; la de la ficha es «una persona, un rango».
create index if not exists asistencia_dia_fecha_obra
  on public.asistencia_dia (fecha, obra_canonica_id);
create index if not exists asistencia_dia_persona_fecha
  on public.asistencia_dia (persona_id, fecha desc);

-- ── 2 · QUIÉN MARCÓ ES UN HECHO, NO UNA DECLARACIÓN ─────────────────────────────────────────────
--
-- `marcado_por` y `marcado_en` los escribe la base, no el cliente. Un `default auth.uid()` no
-- alcanza: en un upsert el default NO se vuelve a aplicar en la rama UPDATE, así que corregir el
-- día dejaría el autor del primer toque. Y si el cliente pudiera mandarlos, «quién dijo que Juan
-- estaba» pasaría a ser lo que el cliente quiera decir — que es justo lo que no sirve cuando hay
-- que preguntarle a alguien por qué marcó lo que marcó.
create or replace function public.asistencia_dia_sella_quien()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  new.marcado_por := auth.uid();
  new.marcado_en  := now();
  return new;
end;
$function$;

comment on function public.asistencia_dia_sella_quien() is
  'Sella quién declaró la presencia y cuándo. La base lo escribe en cada insert y en cada update: '
  'un default no se re-aplica en la rama UPDATE de un upsert.';

drop trigger if exists asistencia_dia_sella on public.asistencia_dia;
create trigger asistencia_dia_sella
  before insert or update on public.asistencia_dia
  for each row execute function public.asistencia_dia_sella_quien();

-- ── 3 · RLS ─────────────────────────────────────────────────────────────────────────────────────
alter table public.asistencia_dia enable row level security;

-- LEE: Dirección, Administración y jefe de obra —los tres están dentro de `es_administracion()`
-- desde el 19/08/2026—. `campo` lee LO SUYO: el patrón de `asistencia_marca_select`, no uno nuevo.
-- Sin persona vinculada, `mi_persona_id()` es NULL y la comparación falla cerrada.
drop policy if exists asistencia_dia_select on public.asistencia_dia;
create policy asistencia_dia_select on public.asistencia_dia for select to authenticated
  using (public.es_administracion() or persona_id = public.mi_persona_id());

-- ESCRIBE: sólo quien administra. Un operario que pudiera declararse presente estaría fabricando
-- el hecho que el jefe tiene que constatar — y esta declaración es la que después explica por qué
-- una obra no produjo un día.
drop policy if exists asistencia_dia_insert on public.asistencia_dia;
create policy asistencia_dia_insert on public.asistencia_dia for insert to authenticated
  with check (public.es_administracion());

drop policy if exists asistencia_dia_update on public.asistencia_dia;
create policy asistencia_dia_update on public.asistencia_dia for update to authenticated
  using (public.es_administracion()) with check (public.es_administracion());

-- SIN DELETE, ni para Administración: mismo criterio que `asistencia_marca`. Un error se corrige
-- cambiando el estado, no borrando el día — borrar deja «no se sabe» donde había una declaración.

-- ── 4 · GRANT POR COLUMNA (la trampa que ya mordió dos veces) ───────────────────────────────────
--
-- Una policy sin GRANT devuelve «permission denied»: son dos permisos distintos y la policy no
-- implica el privilegio (ver 20260907T1900 y 20260908T1530, las dos veces que esto rompió una
-- pantalla en producción). Y el GRANT se escribe POR COLUMNA a propósito: `marcado_por` y
-- `marcado_en` NO se pueden escribir desde el cliente, así que nadie puede firmar una presencia con
-- el nombre de otro aunque llame a PostgREST a mano. Los sella el trigger.
--
-- `persona_id` y `fecha` van también en el UPDATE porque PostgREST, en un upsert, incluye TODAS
-- las columnas del payload en el `on conflict do update set` — incluida la clave del conflicto.
grant select on public.asistencia_dia to authenticated;
grant insert (persona_id, fecha, obra_canonica_id, estado, motivo) on public.asistencia_dia to authenticated;
grant update (persona_id, fecha, obra_canonica_id, estado, motivo) on public.asistencia_dia to authenticated;
