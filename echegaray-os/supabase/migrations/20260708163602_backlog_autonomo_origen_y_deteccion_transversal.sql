-- Línea B (rutinas críticas de negocio): primera rutina autónoma que va más allá de
-- continuidad de datos y llega hasta OBSERVACIÓN -> BACKLOG real, sin duplicar lógica
-- de negocio en TypeScript (acciones vencidas y fuentes críticas atrasadas son
-- comparaciones simples de fecha/estado, no un forecast -- a diferencia de la
-- posición de caja, que sigue viviendo solo en TypeScript por esa razón).
--
-- origen_tabla/origen_id: mismo principio que acciones.alerta_origen_id (referencia
-- polimórfica sin FK tipada, ya usado en el proyecto) -- permite que la detección sea
-- idempotente: no crea un ítem de backlog duplicado si ya existe uno abierto para el
-- mismo origen.
alter table backlog_autonomo
  add column origen_tabla text,
  add column origen_id uuid;

create index backlog_autonomo_origen_idx on backlog_autonomo (origen_tabla, origen_id);

create or replace function detectar_acciones_vencidas()
returns void
language sql
set search_path = public
as $$
  insert into backlog_autonomo (
    tipo, titulo, evidencia, fuente, confianza, impacto, urgencia, esfuerzo,
    recomendacion, nivel_autonomia_permitido, estado, origen_tabla, origen_id
  )
  select
    'riesgo',
    'Acción vencida: ' || a.titulo,
    'Fecha límite ' || a.fecha_limite || ', responsable ' || coalesce(a.responsable, 'sin asignar')
      || ', estado actual: ' || a.estado || '.',
    'acciones (detección automática, pg_cron)',
    'confirmado',
    case a.severidad when 'critica' then 'alta' when 'alta' then 'alta' else 'media' end,
    'alta',
    'bajo',
    'Revisar con ' || coalesce(a.responsable, 'el responsable asignado')
      || ' por qué no se resolvió antes de ' || a.fecha_limite || '. Reasignar fecha o escalar si corresponde.',
    'C',
    'abierto',
    'acciones',
    a.id
  from acciones a
  where a.estado in ('pendiente', 'en_curso')
    and a.fecha_limite is not null
    and a.fecha_limite < current_date
    and not exists (
      select 1 from backlog_autonomo b
      where b.origen_tabla = 'acciones' and b.origen_id = a.id and b.estado in ('abierto', 'en_curso')
    );
$$;

create or replace function detectar_fuentes_criticas_atrasadas()
returns void
language sql
set search_path = public
as $$
  insert into backlog_autonomo (
    tipo, titulo, evidencia, fuente, confianza, impacto, urgencia, esfuerzo,
    recomendacion, nivel_autonomia_permitido, estado, origen_tabla, origen_id
  )
  select
    'gap_dato',
    'Fuente crítica atrasada: ' || f.nombre,
    'Estado: ' || f.estado || '. Última sincronización exitosa: '
      || coalesce(f.ultima_sincronizacion_exitosa::text, 'nunca') || '. Frecuencia esperada: '
      || f.frecuencia_actualizacion || '.',
    'fuentes_datos (detección automática, pg_cron)',
    'confirmado',
    'alta',
    'media',
    'bajo',
    'Actualizar o resincronizar ' || f.nombre || ' (' || coalesce(f.responsable_probable, 'responsable no identificado')
      || ') antes de que afecte una decisión que dependa de esta fuente.',
    'C',
    'abierto',
    'fuentes_datos',
    f.id
  from fuentes_datos f
  where f.criticidad = 'alta'
    and f.estado in ('atrasado', 'error')
    and not exists (
      select 1 from backlog_autonomo b
      where b.origen_tabla = 'fuentes_datos' and b.origen_id = f.id and b.estado in ('abierto', 'en_curso')
    );
$$;

create or replace function detectar_senales_criticas_transversales()
returns void
language sql
set search_path = public
as $$
  select detectar_acciones_vencidas();
  select detectar_fuentes_criticas_atrasadas();
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'detectar_senales_criticas_diario') then
    perform cron.unschedule('detectar_senales_criticas_diario');
  end if;
end $$;

select cron.schedule(
  'detectar_senales_criticas_diario',
  '10 11 * * *',
  $$select detectar_senales_criticas_transversales();$$
);
