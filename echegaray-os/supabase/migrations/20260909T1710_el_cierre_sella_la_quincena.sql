-- 20260909T1710 · R6 · CERRAR SELLA, Y REABRIR DEJA FIRMA
--
-- `liquidacion_linea` ya guarda `valor_hora`, pero nada dice que ese número esté CONGELADO: la
-- pantalla lo reescribe en cada recálculo. Y la categoría y el convenio con los que se liquidó no
-- están en ningún lado — viven en `personas`, que cambia. Handoff v2 R6: al cerrar quedan sellados
-- las horas, el valor hora, la categoría y el convenio.
--
-- ═══ POR QUÉ COLUMNAS SELLADAS Y NO «MIRAR personas» ═══
--
-- Porque `personas.categoria` de hoy no es la de la quincena que se pagó en marzo. La pantalla 11
-- promete exactamente eso: «$/h hoy: cambió / igual». Sin el valor sellado no hay contra qué
-- comparar y la comparación se convierte en «igual» siempre, que es la peor de las dos respuestas.

alter table public.liquidacion_linea
  add column if not exists categoria_sellada text,
  add column if not exists convenio_sellado  text,
  add column if not exists sellado_en        timestamptz;

comment on column public.liquidacion_linea.categoria_sellada is
  'La categoría con la que se liquidó, copiada al cerrar. NULL mientras la quincena está abierta: no es «sin categoría», es «todavía no se selló».';
comment on column public.liquidacion_linea.convenio_sellado is
  'El convenio con el que se liquidó (UOCRA Ley 22.250 o 0076/75), copiado al cerrar.';

-- SELLADO SIN FECHA ES UNA AFIRMACIÓN SIN EVIDENCIA, el mismo criterio que el cierre de la
-- cabecera: si hay valores congelados, tiene que constar cuándo se congelaron.
alter table public.liquidacion_linea
  drop constraint if exists liquidacion_linea_sellado_coherente;
alter table public.liquidacion_linea
  add constraint liquidacion_linea_sellado_coherente check (
    sellado_en is not null
    or (categoria_sellada is null and convenio_sellado is null)
  );

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- REABRIR PIDE MOTIVO, Y EL MOTIVO NO ES OPCIONAL
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Reabrir una quincena cerrada cambia lo que se pagó. Sin motivo escrito, autor y fecha, la
-- diferencia aparece en la caja y nadie puede decir de dónde salió.

create table if not exists public.liquidacion_reapertura (
  id             uuid primary key default gen_random_uuid(),
  liquidacion_id uuid not null references public.liquidacion_quincena(id) on delete cascade,
  motivo         text not null,
  autor          uuid,
  reabierta_en   timestamptz not null default now(),

  constraint liquidacion_reapertura_con_motivo check (length(btrim(motivo)) >= 10)
);

create index if not exists liquidacion_reapertura_liquidacion
  on public.liquidacion_reapertura (liquidacion_id, reabierta_en desc);

comment on table public.liquidacion_reapertura is
  'Cada vez que una quincena cerrada se vuelve a abrir: motivo escrito, autor y fecha. Es un historial, no un estado: reabrir dos veces deja dos filas.';

alter table public.liquidacion_reapertura enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='liquidacion_reapertura' and policyname='liquidacion_reapertura_lee_admin') then
    create policy liquidacion_reapertura_lee_admin on public.liquidacion_reapertura
      for select to authenticated using (public.liquida_sueldos());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='liquidacion_reapertura' and policyname='liquidacion_reapertura_escribe_admin') then
    create policy liquidacion_reapertura_escribe_admin on public.liquidacion_reapertura
      for insert to authenticated with check (public.liquida_sueldos());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='liquidacion_reapertura' and policyname='liquidacion_reapertura_srv') then
    create policy liquidacion_reapertura_srv on public.liquidacion_reapertura
      for all to service_role using (true) with check (true);
  end if;
end $$;

grant select, insert on public.liquidacion_reapertura to authenticated;
grant all on public.liquidacion_reapertura to service_role;
-- UN HISTORIAL QUE SE PUEDE BORRAR NO ES UN HISTORIAL.
revoke update, delete on public.liquidacion_reapertura from authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- LAS TRES TABLAS DEL 1200 PASAN A LA PUERTA DEL MÓDULO
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Nacieron con `ve_economia()`, que hoy da el mismo conjunto. Se reapuntan a `liquida_sueldos()`
-- por la decisión del dueño del 09/09/2026: el módulo tiene su propia puerta y no se abre sola.

drop policy if exists persona_tarifa_lee_economia on public.persona_tarifa;
create policy persona_tarifa_lee_admin on public.persona_tarifa
  for select to authenticated using (public.liquida_sueldos());

drop policy if exists liquidacion_quincena_lee_economia   on public.liquidacion_quincena;
drop policy if exists liquidacion_quincena_escribe_economia on public.liquidacion_quincena;
drop policy if exists liquidacion_quincena_cierra_economia  on public.liquidacion_quincena;
create policy liquidacion_quincena_lee_admin on public.liquidacion_quincena
  for select to authenticated using (public.liquida_sueldos());
create policy liquidacion_quincena_escribe_admin on public.liquidacion_quincena
  for insert to authenticated with check (public.liquida_sueldos());
create policy liquidacion_quincena_cierra_admin on public.liquidacion_quincena
  for update to authenticated using (public.liquida_sueldos()) with check (public.liquida_sueldos());

drop policy if exists liquidacion_linea_lee_economia     on public.liquidacion_linea;
drop policy if exists liquidacion_linea_escribe_economia on public.liquidacion_linea;
drop policy if exists liquidacion_linea_edita_abierta    on public.liquidacion_linea;
create policy liquidacion_linea_lee_admin on public.liquidacion_linea
  for select to authenticated using (public.liquida_sueldos());
create policy liquidacion_linea_escribe_admin on public.liquidacion_linea
  for insert to authenticated with check (public.liquida_sueldos());
-- LA QUINCENA CERRADA NO SE TOCA: la policy mira el estado de la cabecera, no la buena memoria de
-- la pantalla. Se recrea porque cambia la función de la puerta, no la condición.
create policy liquidacion_linea_edita_abierta on public.liquidacion_linea
  for update to authenticated
  using (public.liquida_sueldos() and exists (
    select 1 from public.liquidacion_quincena q
    where q.id = liquidacion_linea.liquidacion_id and q.estado = 'abierta'))
  with check (public.liquida_sueldos() and exists (
    select 1 from public.liquidacion_quincena q
    where q.id = liquidacion_linea.liquidacion_id and q.estado = 'abierta'));

-- LAS COLUMNAS NUEVAS NACEN SIN PERMISO. El sellado lo escribe el servidor al cerrar, así que a
-- `authenticated` sólo se le amplía la LECTURA (`grant select` es de tabla, ya lo cubre) y NO el
-- update: el grant por columna de `efectivo_redondeado` sigue siendo el único que puede escribir.
