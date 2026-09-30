-- liquidacion_presentismo_restitucion: LA RESTITUCIÓN MANUAL DEL PRESENTISMO, PERSISTENTE.
--
-- Dueño 30/09/2026: en Liquidación, el «perdido 24/09» de la columna Presentismo tiene que ser un botón que
-- vuelve a considerar el presentismo a esa persona. Es una DECISIÓN de Administración/Dirección sobre lo que
-- calculó el OS (tardanza cargada por el jefe), así que vive en la base —por persona y quincena, con quién y
-- cuándo— y no en estado de pantalla: si se recarga, o lo mira otro, tiene que seguir dicha.
--
-- POR QUÉ UNA TABLA Y NO UNA COLUMNA EN liquidacion_linea: la línea sólo existe una vez que alguien editó algo de
-- esa persona (y su lectura degrada por columnas según la migración aplicada); la restitución tiene que poder
-- anotarse sobre una quincena abierta que todavía no tiene línea. La clave es (persona, desde, hasta): la misma
-- ventana con la que el resto de la pantalla busca la cabecera.
--
-- `fechas` ES LO QUE SE PERDONÓ, NO UN «SIEMPRE»: guarda las fechas de las causas que había cuando se restituyó.
-- Una tardanza cargada DESPUÉS, con otra fecha, no está cubierta y vuelve a hacer perder el presentismo: perdonar
-- no es una licencia abierta para el resto de la quincena.
--
-- La quincena CERRADA no se toca: es la foto de lo que se pagó. Lo hace cumplir la policy (no la pantalla).
-- Sólo `liquida_sueldos()` (dirección y administración); jefe de obra no entra.

create table if not exists public.liquidacion_presentismo_restitucion (
  id                    uuid primary key default gen_random_uuid(),
  persona_id            uuid not null references public.personas(id) on delete restrict,
  desde                 date not null,
  hasta                 date not null,
  fechas                date[] not null,
  motivo                text check (motivo is null or char_length(motivo) <= 300),
  restituido_por        uuid not null,
  restituido_por_nombre text not null,
  restituido_en         timestamptz not null default now(),
  -- DESHACER NO BORRA (nunca sobrescribir lo anotado): sella quién y cuándo. La fila queda como historia.
  deshecho_en           timestamptz,
  deshecho_por          uuid,
  deshecho_por_nombre   text,
  constraint liquidacion_presentismo_restitucion_ventana check (hasta >= desde),
  constraint liquidacion_presentismo_restitucion_con_fechas check (cardinality(fechas) > 0),
  constraint liquidacion_presentismo_restitucion_deshecho_completo check ((deshecho_en is null) = (deshecho_por is null))
);

-- UNA VIGENTE POR PERSONA Y QUINCENA; las deshechas se acumulan como historia y permiten restituir de nuevo.
create unique index if not exists liquidacion_presentismo_restitucion_vigente
  on public.liquidacion_presentismo_restitucion (persona_id, desde, hasta) where deshecho_en is null;

comment on table public.liquidacion_presentismo_restitucion is
  'Presentismo devuelto a mano a una persona en una quincena (dueño 30/09/2026). Cubre sólo las fechas de `fechas`; '
  'el cálculo (presentismo.ts) lo trata como «cumple» → 0425 en el blanco. No existe para quincenas cerradas.';

alter table public.liquidacion_presentismo_restitucion enable row level security;

-- LA QUINCENA CERRADA NO SE TOCA, y la policy mira la cabecera, no la memoria de la pantalla. Es una función
-- SECURITY DEFINER porque `liquidacion_quincena` tiene su propia RLS y la policy no debe depender de ella. Mira el
-- cuadro `obreros`: el presentismo es del convenio de obreros y cada grupo cierra por separado.
create or replace function public.quincena_de_liquidacion_abierta(p_desde date, p_hasta date)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select not exists (
    select 1 from public.liquidacion_quincena q
    where q.desde = p_desde and q.hasta = p_hasta and q.grupo = 'obreros' and q.estado = 'cerrada')
$function$;

create policy liquidacion_presentismo_restitucion_lee on public.liquidacion_presentismo_restitucion
  for select to authenticated using (public.liquida_sueldos());
create policy liquidacion_presentismo_restitucion_inserta on public.liquidacion_presentismo_restitucion
  for insert to authenticated
  with check (public.liquida_sueldos() and restituido_por = (select auth.uid())
    and public.quincena_de_liquidacion_abierta(desde, hasta));
-- Deshacer es un UPDATE que sólo puede sellar las columnas deshecho_* (grant por columna, abajo); no hay DELETE.
create policy liquidacion_presentismo_restitucion_actualiza on public.liquidacion_presentismo_restitucion
  for update to authenticated
  using (public.liquida_sueldos() and public.quincena_de_liquidacion_abierta(desde, hasta))
  with check (public.liquida_sueldos() and deshecho_por = (select auth.uid())
    and public.quincena_de_liquidacion_abierta(desde, hasta));

revoke all on public.liquidacion_presentismo_restitucion from authenticated;
grant select, insert on public.liquidacion_presentismo_restitucion to authenticated;
grant update (deshecho_en, deshecho_por, deshecho_por_nombre) on public.liquidacion_presentismo_restitucion to authenticated;
grant select, insert, update on public.liquidacion_presentismo_restitucion to service_role;
revoke all on function public.quincena_de_liquidacion_abierta(date, date) from public, anon;
grant execute on function public.quincena_de_liquidacion_abierta(date, date) to authenticated, service_role;
