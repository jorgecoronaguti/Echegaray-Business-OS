-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- UNA HORA IMPRODUCTIVA NO ES RENDIMIENTO — y sin causa no se puede corregir nada
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- El modelo sabe cuántas horas se imputaron a una actividad y NO SABE POR QUÉ se fueron. `tipo_hora`
-- distingue normal / extra 50 / extra 100 / ausencia / licencia — todas categorías de LIQUIDACIÓN,
-- ninguna de productividad. No hay una sola columna en toda la base que diga que la cuadrilla estuvo
-- cuatro horas esperando el camión de hormigón. (La única `causa_desvio` que existe vive en una tabla
-- legacy desconectada, sin lectores.)
--
-- Las consecuencias se pagan dos veces:
--
--   · **el desvío no se explica**. «Consumió 130 % de las HH» no dice si el análisis está mal, si la
--     cuadrilla es chica o si el frente no estaba liberado. Las tres tienen respuestas distintas y
--     dos de ellas ni siquiera son nuestras.
--   · **y el estándar aprende mal**. Si la obra tardó 2,9 HH/m² donde el análisis decía 2,4, pero
--     0,4 de esas horas fueron espera de equipo, el estándar REAL es 2,5 — y capturar 2,9 mete la
--     avería del camión en la próxima cotización, para siempre.
--
-- Por eso el total real NO se toca: `hh_real` sigue siendo el total, porque es lo que se pagó y es lo
-- que consume el presupuesto. Lo que se agrega es la PARTICIÓN: productivas e improductivas, con la
-- causa al lado, en `actividad_horas` — una sola definición que leen los tres consumidores.
--
-- La productividad de `obra_actividad_control` pasa a medirse sobre las productivas, pero eso NO se
-- hace acá: esa vista la reescribe también otro frente (`20260821T5450`) y dos `create or replace`
-- con listas de columnas distintas no pueden convivir. Las dos listas se juntan en `20260822T1000`.
--
-- ═══ LA CAUSA ES UN CATÁLOGO, NO UN TEXTO LIBRE ═══
--
-- Un campo de texto libre da diecinueve maneras de escribir «faltó material» y ninguna se puede
-- contar. El catálogo se puede ampliar —es una tabla— pero la fila nace con clave, y esa clave es la
-- que agrupa el análisis de causas de la obra y la que viaja al aprendizaje del estándar.
--
-- La UX sólo pide la causa cuando hay desvío; eso es de pantalla. Acá el modelo se limita a lo que
-- no puede ser falso: si una hora se declara improductiva, TIENE que decir por qué.

-- ── 1 · el catálogo de causas ─────────────────────────────────────────────────────────────────
create table if not exists public.causa_desvio (
  clave   text primary key,
  nombre  text not null,
  orden   int  not null default 0,
  activa  boolean not null default true,
  familia text
);

comment on table public.causa_desvio is
  'Por qué una hora no produjo o una actividad se desvió. Catálogo cerrado y ampliable: un texto '
  'libre da diecinueve formas de escribir «faltó material» y ninguna se puede contar. La `familia` '
  'separa lo que es nuestro de lo que no: un frente no liberado es del cliente y se reclama; una '
  'cuadrilla mal compuesta es nuestra y se corrige.';

insert into public.causa_desvio (clave, nombre, orden, familia) values
  ('falta_material',         'Falta de material',                    10, 'abastecimiento'),
  ('espera_equipo',          'Espera de equipo',                     20, 'equipos'),
  ('equipo_averiado',        'Equipo averiado',                      30, 'equipos'),
  ('equipo_incorrecto',      'Equipo inadecuado para la tarea',      40, 'equipos'),
  ('interferencia',          'Interferencia con otro frente o gremio', 50, 'coordinacion'),
  ('retrabajo',              'Retrabajo',                            60, 'calidad'),
  ('error_ejecucion',        'Error de ejecución',                   70, 'calidad'),
  ('error_plano',            'Error o falta de plano',               80, 'proyecto'),
  ('cambio_alcance',         'Cambio de alcance',                    90, 'proyecto'),
  ('clima',                  'Clima',                               100, 'externa'),
  ('acceso',                 'Acceso restringido o permiso pendiente', 110, 'externa'),
  ('frente_no_liberado',     'Frente no liberado por el cliente',   120, 'cliente'),
  ('cuadrilla_insuficiente', 'Cuadrilla insuficiente',              130, 'planificacion'),
  ('composicion_incorrecta', 'Composición de cuadrilla incorrecta', 140, 'planificacion'),
  ('baja_productividad',     'Baja productividad sin causa puntual',150, 'productividad'),
  ('curva_aprendizaje',      'Curva de aprendizaje',                160, 'productividad'),
  ('condicion_distinta',     'Condición de obra distinta a la prevista', 170, 'proyecto'),
  ('computo_incorrecto',     'Cómputo incorrecto',                  180, 'presupuesto'),
  ('otro',                   'Otra causa',                          999, null)
on conflict (clave) do nothing;

-- ── 2 · la hora dice si produjo, y por qué no ─────────────────────────────────────────────────
alter table public.registros_hh add column if not exists improductiva boolean not null default false;
alter table public.registros_hh add column if not exists causa_desvio text
  references public.causa_desvio (clave) on delete restrict;

alter table public.registros_hh drop constraint if exists registros_hh_improductiva_con_causa;
alter table public.registros_hh add constraint registros_hh_improductiva_con_causa
  check (not improductiva or causa_desvio is not null);

comment on column public.registros_hh.improductiva is
  'La hora se pagó y no produjo: espera, retrabajo, frente bloqueado. NO sale de hh_real —el total '
  'real es el total real y es lo que consume el presupuesto— pero sí sale del rendimiento, porque '
  'una avería del camión de hormigón no es el estándar de la tarea.';
comment on column public.registros_hh.causa_desvio is
  'Obligatorio cuando la hora es improductiva: una hora perdida sin causa no se puede corregir ni '
  'reclamar, y en el aprendizaje del estándar sería ruido puro.';

-- UN CAMPO EN LA CLAVE LO IMPONE EL MODELO, NO LA COSTUMBRE.
--
-- `registros_hh_persona_unico` era (obra, persona, fecha, actividad, tipo_hora) y existe para que
-- nadie impute dos veces el mismo día. Con la partición que introduce esta migración, ese día
-- LEGÍTIMAMENTE se parte: «8 h normales productivas + 2 h normales esperando el camión» son dos
-- filas con la misma quíntupla, y el índice las rechazaba — así que la única manera de cargarlas
-- habría sido no declarar la improductiva, que es justo el dato que vinimos a capturar.
--
-- La clave se extiende con `improductiva` y con la causa: dos causas distintas el mismo día (2 h de
-- espera y 1 h de retrabajo) también son dos hechos distintos. Sigue impidiendo el duplicado real,
-- que es la misma persona con la misma causa dos veces.
drop index if exists public.registros_hh_persona_unico;
create unique index if not exists registros_hh_persona_unico
  on public.registros_hh (obra_canonica_id, persona_id, fecha,
                          coalesce(actividad_id, '00000000-0000-0000-0000-000000000000'::uuid),
                          tipo_hora, improductiva, (coalesce(causa_desvio, '')))
  where persona_id is not null;

-- ── 3 · el parte de avance puede declarar la incidencia del día ───────────────────────────────
alter table public.obra_ejecucion add column if not exists causa_desvio text
  references public.causa_desvio (clave) on delete restrict;

comment on column public.obra_ejecucion.causa_desvio is
  'La incidencia de ESTE parte: qué pasó el día que se midió este avance. Opcional a propósito — la '
  'pantalla la pide sólo cuando el avance viene por debajo de lo previsto, y exigirla siempre haría '
  'que se cargue cualquier cosa para poder guardar.';

-- ── 4 · la partición de las horas, con UNA sola definición ────────────────────────────────────
--
-- Va en su propia vista y no dentro de `obra_actividad_control` por dos razones, y las dos importan:
--
--   · UNA CAPACIDAD, UNA FUENTE. La cuenta «cuáles de estas horas produjeron» la necesitan tres
--     consumidores —el control de la actividad, la captura de rendimiento y el forecast— y escrita
--     tres veces son tres definiciones que van a divergir el día que alguien agregue un tipo de hora.
--   · Y porque `obra_actividad_control` la reescribe también OTRO FRENTE (`20260821T5450`, que le
--     agrega `tiempo_tecnico`). Dos migraciones haciendo `create or replace` sobre la misma vista
--     con listas de columnas distintas no pueden convivir: la segunda aborta con «cannot drop
--     columns from view». Al vivir la cuenta acá, cada frente publica lo suyo y la reconciliación
--     —`20260822T1000`— junta las dos listas en un solo lugar y una sola vez.
create or replace view public.actividad_horas with (security_invoker = true) as
select a.id                                                    as actividad_id,
       a.obra_id,
       h.hh_real,
       coalesce(h.hh_improductivas, 0)                          as hh_improductivas,
       case when h.hh_real is null then null
            else h.hh_real - coalesce(h.hh_improductivas, 0) end as hh_productivas,
       h.hh_extra,
       coalesce(e.n_incidencias, 0)                             as n_incidencias
  from public.obra_actividad a
  left join lateral (
        select sum(r.horas) filter (where r.tipo_hora in ('normal','extra_50','extra_100'))              as hh_real,
               sum(r.horas) filter (where r.tipo_hora in ('extra_50','extra_100'))                       as hh_extra,
               sum(r.horas) filter (where r.tipo_hora in ('normal','extra_50','extra_100') and r.improductiva) as hh_improductivas
          from public.registros_hh r where r.actividad_id = a.id) h on true
  left join lateral (
        select count(*) filter (where x.causa_desvio is not null)::int as n_incidencias
          from public.obra_ejecucion x where x.actividad_id = a.id) e on true;

comment on view public.actividad_horas is
  'La única definición de «cuáles de las horas de esta actividad produjeron». hh_real es EL TOTAL '
  '—es lo que se pagó y lo que consume el presupuesto—, hh_improductivas la parte que no produjo y '
  'hh_productivas la diferencia. La leen el control de la actividad, la captura de rendimiento y el '
  'forecast: escrita tres veces serían tres definiciones que divergen el día que aparezca un tipo '
  'de hora nuevo.';

grant select on public.actividad_horas to authenticated;
grant select on public.actividad_horas to service_role;

-- ── 5 · las causas de una obra, contadas ──────────────────────────────────────────────────────
-- Una sola fuente para «¿por qué se nos fue el tiempo en esta obra?». Suma las dos puertas por las
-- que hoy entra una causa: las horas improductivas y las incidencias declaradas en el parte.
create or replace view public.obra_causa_desvio with (security_invoker = true) as
select x.obra_id,
       x.causa_desvio,
       cd.nombre                                as causa,
       cd.familia,
       sum(x.hh_improductivas)                  as hh_improductivas,
       sum(x.n_incidencias)::int                as n_incidencias,
       count(distinct x.actividad_id)::int      as n_actividades
  from (
        select a.obra_id, r.causa_desvio, a.id as actividad_id,
               sum(r.horas) filter (where r.tipo_hora in ('normal','extra_50','extra_100')) as hh_improductivas,
               0 as n_incidencias
          from public.registros_hh r
          join public.obra_actividad a on a.id = r.actividad_id
         where r.improductiva and r.causa_desvio is not null
         group by a.obra_id, r.causa_desvio, a.id
        union all
        select e.obra_id, e.causa_desvio, e.actividad_id, 0, count(*)::int
          from public.obra_ejecucion e
         where e.causa_desvio is not null
         group by e.obra_id, e.causa_desvio, e.actividad_id
       ) x
  join public.causa_desvio cd on cd.clave = x.causa_desvio
 group by x.obra_id, x.causa_desvio, cd.nombre, cd.familia;

comment on view public.obra_causa_desvio is
  '«¿Por qué se nos fue el tiempo en esta obra?», con una sola definición. Suma las dos puertas por '
  'las que entra una causa —la hora improductiva y la incidencia del parte— y las agrupa por '
  'familia, que es lo que separa lo reclamable al cliente de lo que tenemos que corregir nosotros.';

-- ── 6 · permisos ──────────────────────────────────────────────────────────────────────────────
-- El catálogo es OPERATIVO y lo lee cualquiera: sin poder leerlo, el selector de la pantalla de
-- carga queda vacío y nadie puede declarar una causa.
alter table public.causa_desvio enable row level security;

drop policy if exists causa_desvio_lee on public.causa_desvio;
create policy causa_desvio_lee on public.causa_desvio for select to authenticated using (true);
drop policy if exists causa_desvio_escribe on public.causa_desvio;
create policy causa_desvio_escribe on public.causa_desvio for all to authenticated
  using (public.es_administracion()) with check (public.es_administracion());

grant select, insert, update, delete on public.causa_desvio to authenticated;
grant all on public.causa_desvio to service_role;
grant select on public.obra_causa_desvio to authenticated;
grant select on public.obra_causa_desvio to service_role;
