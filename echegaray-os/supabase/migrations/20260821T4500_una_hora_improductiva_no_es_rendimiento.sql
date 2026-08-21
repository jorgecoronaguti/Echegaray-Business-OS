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
-- causa al lado. La productividad pasa a medirse sobre las productivas y la vista lo declara.
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

-- ── 4 · la vista parte las horas y lo dice ────────────────────────────────────────────────────
--
-- DESVÍO DECLARADO: `obra_actividad.tiempo_tecnico` EXISTE en la base viva (boolean not null default
-- false) y **ninguna migración de `main` la crea** — la publica `obra_actividad_control` en la
-- posición 68. Es deriva de otro frente que todavía no integró su migración. `create or replace
-- view` no puede renombrar columnas, así que esta vista tiene que reproducirla o aborta. Se declara
-- acá con `if not exists`, con la MISMA definición que tiene la base viva: en la base real es un
-- no-op y en cualquier otra hace que esta migración sea autosuficiente. Si el otro frente integra
-- su versión, la suya llega primero o la nuestra: son idénticas.
alter table public.obra_actividad add column if not exists tiempo_tecnico boolean not null default false;

create or replace view public.obra_actividad_control with (security_invoker = true) as
 SELECT a.id AS actividad_id,
    a.id,
    a.obra_id,
    a.codigo,
    a.codigo_padre,
    a.nombre,
    a.tipo,
    a.orden,
    a.seccion,
    a.archivada,
    a.clave,
    a.dias_plan,
    a.dias_real,
    a.editado_a_mano,
    a.fuente_pestana,
    a.creada_en_web,
    a.cuadrilla,
    ( SELECT p.nombre
           FROM obra_actividad p
          WHERE p.obra_id = a.obra_id AND p.codigo = a.codigo_padre AND p.tipo = 'resumen'::text
          ORDER BY p.orden
         LIMIT 1) AS rubro,
    a.estado,
    a.unidad,
    a.cantidad_objetivo,
    a.metodo_avance,
    a.inicio_plan,
    a.fin_plan,
    a.inicio_base,
    a.fin_base,
    a.sellada_en,
    a.inicio_real,
    a.fin_real,
    a.hh_plan,
    a.responsable_id,
    a.cuadrilla_id,
    ( SELECT c.nombre
           FROM cuadrilla c
          WHERE c.id = a.cuadrilla_id) AS cuadrilla_prevista,
    a.comentario,
    a.partida_codigo,
    a.partida_cantidad,
    a.pct,
    a.pct AS avance_declarado,
    e.cantidad_ejecutada,
    e.avance_partes,
    e.n_partes,
    e.ultimo_parte,
    h.hh_real,
    h.hh_extra,
    COALESCE(h.n_imputaciones, 0::bigint)::integer AS n_imputaciones,
    COALESCE(imp.abiertos, 0) AS impedimentos_abiertos,
        CASE a.metodo_avance
            WHEN 'cantidad'::text THEN
            CASE
                WHEN a.cantidad_objetivo > 0::numeric THEN LEAST(100::numeric, round(COALESCE(e.cantidad_ejecutada, 0::numeric) / a.cantidad_objetivo * 100::numeric, 1))
                ELSE NULL::numeric
            END
            WHEN 'partes'::text THEN LEAST(100::numeric, round(COALESCE(e.avance_partes, 0::numeric), 1))
            WHEN 'pasos'::text THEN
            CASE
                WHEN ps.peso_total > 0::numeric THEN round(COALESCE(ps.peso_hecho, 0::numeric) / ps.peso_total * 100::numeric, 1)
                ELSE NULL::numeric
            END
            ELSE a.pct
        END AS avance_pct,
        CASE a.metodo_avance
            WHEN 'cantidad'::text THEN 'cantidad'::text
            WHEN 'partes'::text THEN 'partes'::text
            WHEN 'pasos'::text THEN 'pasos'::text
            ELSE
            CASE
                WHEN a.pct IS NOT NULL THEN 'declarado'::text
                ELSE NULL::text
            END
        END AS origen_avance,
        CASE
            WHEN COALESCE(imp.abiertos, 0) > 0 THEN 'bloqueada'::text
            ELSE a.estado
        END AS estado_operativo,
        -- PRODUCTIVIDAD SOBRE LAS HORAS PRODUCTIVAS. Antes dividía por el total y una espera de
        -- equipo bajaba el rendimiento de la tarea como si la cuadrilla hubiera trabajado peor.
        -- El total no desaparece: sigue publicado en hh_real, que es lo que se pagó.
        CASE
            WHEN e.cantidad_ejecutada > 0::numeric
             AND (h.hh_real - COALESCE(h.hh_improductivas, 0::numeric)) > 0::numeric
            THEN round(e.cantidad_ejecutada / (h.hh_real - COALESCE(h.hh_improductivas, 0::numeric)), 3)
            ELSE NULL::numeric
        END AS productividad,
        CASE
            WHEN a.hh_plan > 0::numeric AND h.hh_real IS NOT NULL THEN round(h.hh_real / a.hh_plan * 100::numeric, 1)
            ELSE NULL::numeric
        END AS consumo_hh_pct,
    a.actividad_padre_id,
    COALESCE(t.n_tareas, 0) AS n_tareas,
    COALESCE(t.n_tareas_hechas, 0) AS n_tareas_hechas,
    COALESCE(ped.n_pedidos, 0) AS n_pedidos,
    COALESCE(nt.n_notas, 0) AS n_notas,
    COALESCE(doc.n_documentos, 0) AS n_documentos,
    COALESCE(eq.n_equipos, 0) AS n_equipos,
    COALESCE(ps.n_pasos, 0) AS n_pasos,
    COALESCE(ps.n_pasos_hechos, 0) AS n_pasos_hechos,
    ps.peso_total AS peso_pasos,
    a.rol_estructura,
    a.tope_frente,
    a.dotacion_prevista,
    a.analisis_id,
    a.tarea_tipo_id,
    a.cotizacion_partida_id,
    a.tiempo_tecnico,
    COALESCE(h.hh_improductivas, 0::numeric) AS hh_improductivas,
    CASE WHEN h.hh_real IS NULL THEN NULL::numeric
         ELSE h.hh_real - COALESCE(h.hh_improductivas, 0::numeric) END AS hh_productivas,
    COALESCE(e.n_incidencias, 0) AS n_incidencias
   FROM obra_actividad a
     LEFT JOIN LATERAL ( SELECT sum(x.cantidad) AS cantidad_ejecutada,
            sum(x.avance_pct) AS avance_partes,
            count(*)::integer AS n_partes,
            max(x.fecha) AS ultimo_parte,
            count(*) FILTER (WHERE x.causa_desvio IS NOT NULL)::integer AS n_incidencias
           FROM obra_ejecucion x
          WHERE x.actividad_id = a.id) e ON true
     LEFT JOIN LATERAL ( SELECT sum(r.horas) FILTER (WHERE r.tipo_hora = ANY (ARRAY['normal'::text, 'extra_50'::text, 'extra_100'::text])) AS hh_real,
            sum(r.horas) FILTER (WHERE r.tipo_hora = ANY (ARRAY['extra_50'::text, 'extra_100'::text])) AS hh_extra,
            sum(r.horas) FILTER (WHERE r.tipo_hora = ANY (ARRAY['normal'::text, 'extra_50'::text, 'extra_100'::text]) AND r.improductiva) AS hh_improductivas,
            count(*) FILTER (WHERE r.tipo_hora = ANY (ARRAY['normal'::text, 'extra_50'::text, 'extra_100'::text])) AS n_imputaciones
           FROM registros_hh r
          WHERE r.actividad_id = a.id) h ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS abiertos
           FROM obra_restriccion x
          WHERE x.actividad_id = a.id AND x.fecha_liberacion IS NULL) imp ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS n_tareas,
            count(*) FILTER (WHERE x.estado = 'hecha'::text)::integer AS n_tareas_hechas
           FROM obra_actividad x
          WHERE x.actividad_padre_id = a.id AND NOT x.archivada) t ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS n_pedidos
           FROM pedidos_materiales x
          WHERE x.actividad_id = a.id) ped ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS n_notas
           FROM obra_actividad_nota x
          WHERE x.actividad_id = a.id) nt ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS n_documentos
           FROM obra_documento x
          WHERE x.actividad_id = a.id) doc ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS n_pasos,
            count(*) FILTER (WHERE x.hecho_en IS NOT NULL)::integer AS n_pasos_hechos,
            sum(x.peso) AS peso_total,
            sum(x.peso) FILTER (WHERE x.hecho_en IS NOT NULL) AS peso_hecho
           FROM obra_actividad_paso x
          WHERE x.actividad_id = a.id) ps ON true
     LEFT JOIN LATERAL ( SELECT count(DISTINCT x.equipo)::integer AS n_equipos
           FROM obra_ejecucion_equipo x
             JOIN obra_ejecucion p ON p.id = x.ejecucion_id
          WHERE p.actividad_id = a.id) eq ON true;

comment on view public.obra_actividad_control is
  'El control de una actividad. hh_real es EL TOTAL —lo que se pagó y lo que consume el '
  'presupuesto—; hh_improductivas es la parte que no produjo y hh_productivas la diferencia. La '
  'productividad se calcula sobre las PRODUCTIVAS: dividir por el total hacía que una espera de '
  'equipo bajara el rendimiento de la tarea como si la cuadrilla hubiera trabajado peor.';

grant select on public.obra_actividad_control to authenticated;
grant select on public.obra_actividad_control to service_role;

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
