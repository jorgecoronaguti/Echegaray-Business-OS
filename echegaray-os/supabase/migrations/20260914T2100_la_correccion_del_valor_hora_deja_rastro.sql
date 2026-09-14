-- LA CORRECCIÓN DEL VALOR HORA DE UNA QUINCENA ABIERTA DEJA RASTRO: quién, cuándo y qué había.
--
-- Dueño, 14/09/2026, sobre cómo corregir un $/h mal tecleado: «Editar la misma quincena». Mientras la
-- quincena está abierta, la fila de `persona_tarifa` con `desde` = inicio de la quincena se puede
-- volver a escribir. Hasta hoy la tabla decía «Un aumento es una fila nueva, nunca un UPDATE», y esa
-- regla sigue valiendo para los AUMENTOS: lo que se corrige acá es el valor de ESA quincena, no el
-- de la anterior. Sin este rastro, un UPDATE borraría el valor que había y nadie podría explicar
-- después por qué la quincena cobró lo que cobró.
--
-- Mismo patrón que `registro_hh_correccion` (20260909T1730): una fila por corrección, el valor de
-- antes y el de después, y un CHECK que rechaza la corrección que no cambia nada.
--
-- ═══ QUIÉN LEE Y QUIÉN ESCRIBE ═══
--
-- Lee quien liquida sueldos (`liquida_sueldos()`), la misma puerta que `persona_tarifa`: acá hay
-- plata. Escribe SÓLO la clave de servicio, desde la acción `escribirTarifaDeLaQuincena`, que pregunta
-- el rol antes de tomarla. `authenticated` no tiene INSERT, UPDATE ni DELETE: un rastro que la
-- persona corregida puede editar no es un rastro.
--
-- Sin esta tabla la acción NO corrige (falla cerrada y lo dice): corregir sin rastro es peor que no
-- poder corregir.

create table if not exists public.persona_tarifa_correccion (
  id                    uuid primary key default gen_random_uuid(),
  persona_id            uuid not null references public.personas(id) on delete cascade,
  desde                 date not null,
  valor_hora_antes      numeric,
  neto_mensual_antes    numeric,
  valor_hora_despues    numeric,
  neto_mensual_despues  numeric,
  autor                 uuid,
  corregido_en          timestamptz not null default now(),
  constraint persona_tarifa_correccion_cambia_algo check (
    valor_hora_antes is distinct from valor_hora_despues
    or neto_mensual_antes is distinct from neto_mensual_despues
  )
);

create index if not exists persona_tarifa_correccion_persona
  on public.persona_tarifa_correccion (persona_id, desde, corregido_en desc);

comment on table public.persona_tarifa_correccion is
  'Cada corrección del $/h o del neto mensual de una quincena abierta: qué había, qué quedó, quién y cuándo. Un aumento sigue siendo una fila nueva de persona_tarifa; esto rastrea la corrección de la fila de la quincena.';

alter table public.persona_tarifa_correccion enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'persona_tarifa_correccion' and policyname = 'persona_tarifa_correccion_lee_admin') then
    create policy persona_tarifa_correccion_lee_admin on public.persona_tarifa_correccion
      for select to authenticated using ((select public.liquida_sueldos()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'persona_tarifa_correccion' and policyname = 'persona_tarifa_correccion_srv') then
    create policy persona_tarifa_correccion_srv on public.persona_tarifa_correccion
      for all to service_role using (true) with check (true);
  end if;
end $$;

grant select on public.persona_tarifa_correccion to authenticated;
grant all on public.persona_tarifa_correccion to service_role;
revoke insert, update, delete on public.persona_tarifa_correccion from authenticated;
