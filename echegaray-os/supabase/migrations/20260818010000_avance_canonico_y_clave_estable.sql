-- UN SOLO AVANCE DE OBRA, Y UNA IDENTIDAD DE ACTIVIDAD QUE NO ES SU RENGLÓN.
--
-- ═══ 1) EL AVANCE SE CALCULABA DOS VECES Y DABA DOS NÚMEROS ═══
--
-- El OS tenía dos caminos leyendo el MISMO archivo de Drive en el mismo minuto:
--
--   `avance-fisico.mjs` → tabla `avance_obra` → /chat y /control-obras   ...decía San Francisco 85%
--   `obra-cronograma.mjs` → `obra_actividad` → /obras                    ...decía San Francisco 44%
--
-- No era un empate entre dos opiniones: el viejo sólo miraba las filas con algo en la columna `#`,
-- que en San Francisco son las 24 primeras —trabajo de junio y julio, casi todo terminado— y dejaba
-- afuera PISOS, ENTREPISO y MEDIANERA enteros, 90 actividades planificadas hasta el 27/08. El 85%
-- era el promedio de la parte vieja de la obra, publicado como si fuera la obra.
--
-- Desde acá el cálculo vive UNA sola vez, en `obra_avance`, y todos leen de ahí. La definición:
--
--   AVANCE = promedio de «% Done» sobre las actividades PLANIFICADAS.
--   · Planificada  = no es rótulo de sección y tiene fecha de inicio.
--   · Los rótulos de sección quedan afuera: pesarían doble el avance de sus propias hijas.
--   · Las actividades SIN FECHA quedan afuera y se cuentan aparte (`n_sin_planificar`). Una
--     actividad sin planificar no es una actividad al 0%: es una que todavía no se puede medir.
--     Contarla como cero hacía que cargar el cronograma futuro BAJARA el avance de la obra.
--   · La cobertura (`n_medidas` sobre `n_actividades`) viaja al lado del número, siempre. Un
--     promedio sin decir sobre cuántas cosas se tomó es exactamente el defecto que se corrige acá.
--
-- ═══ 2) LA IDENTIDAD DE UNA ACTIVIDAD ERA SU NÚMERO DE FILA ═══
--
-- 248 de 325 actividades se identificaban por el renglón que ocupaban (`f57`), porque el tracker no
-- las numera. Con eso, insertar UNA fila en el tracker hacía que el `on conflict` escribiera los
-- datos de cada actividad sobre la de al lado —medido: 6 de 9 en la prueba— y que el candado
-- `editado_a_mano` protegiera a la actividad equivocada. Nadie ve un error: ve fechas cambiadas.
--
-- La clave pasa a salir del CONTENIDO: `sección/nombre`. Sobrevive a insertar, borrar y reordenar.
-- El `#` del tracker queda como lo que siempre fue —un dato de la fila, a veces código y a veces
-- una cantidad— y por eso deja de ser obligatorio y deja de ser único.

-- ── 1) La clave estable
alter table public.obra_actividad add column if not exists clave   text;
alter table public.obra_actividad add column if not exists seccion text;

-- Las filas actuales están claveadas por posición: son justamente las que no se pueden migrar sin
-- adivinar. `obra_actividad` es un ESPEJO de Drive —el sync lo reconstruye entero en 20 segundos—
-- así que se descartan y se vuelven a traer. Lo editado a mano NO se descarta: eso no está en Drive.
delete from public.obra_actividad where not editado_a_mano;
update public.obra_actividad
   set clave = 'legado/' || coalesce(codigo, id::text), seccion = null
 where clave is null;

alter table public.obra_actividad alter column codigo drop not null;
alter table public.obra_actividad alter column clave  set not null;
alter table public.obra_actividad drop constraint if exists obra_actividad_obra_id_codigo_key;
create unique index if not exists obra_actividad_obra_clave_key on public.obra_actividad (obra_id, clave);

-- ── 2) EL avance. Una definición, un lugar.
create or replace view public.obra_avance as
select
  oc.id     as obra_id,
  oc.nombre as obra,
  -- Actividades REALES: los rótulos de sección no son trabajo, son títulos.
  count(a.*) filter (where a.tipo <> 'resumen')                                    as n_actividades,
  count(a.*) filter (where a.tipo <> 'resumen' and a.inicio_plan is not null)      as n_medidas,
  count(a.*) filter (where a.tipo <> 'resumen' and a.inicio_plan is null)          as n_sin_planificar,
  count(a.*) filter (where a.tipo = 'resumen')                                     as n_secciones,
  count(a.*) filter (where a.tipo <> 'resumen' and a.inicio_plan is not null
                       and a.pct >= 100)                                           as n_completas,
  round(avg(a.pct) filter (where a.tipo <> 'resumen' and a.inicio_plan is not null))::int
                                                                                   as avance_pct,
  min(a.inicio_plan) filter (where a.tipo <> 'resumen')                            as desde,
  max(a.fin_plan)    filter (where a.tipo <> 'resumen')                            as hasta,
  max(a.sincronizado_en)                                                           as sincronizado_en,
  max(a.fuente_pestana)                                                            as fuente_pestana
from public.obra_canonica oc
left join public.obra_actividad a on a.obra_id = oc.id
group by oc.id, oc.nombre;

comment on view public.obra_avance is
  'FUENTE ÚNICA del avance físico por obra. Promedio de % sobre actividades no-resumen con fecha de '
  'inicio. Todo consumidor (web /obras, /chat, /control-obras, briefings) lee de acá: dos cálculos '
  'del mismo número fue el defecto que la creó.';

grant select on public.obra_avance to authenticated;

-- ── 3) `obra_panel` deja de tener su propia cuenta y usa la canónica
drop view if exists public.obra_panel;

create view public.obra_panel as
select
  oc.id                as obra_id,
  oc.nombre,
  oc.cliente_texto,
  oc.estado,
  oc.tipo,
  oc.etapa,
  oc.jefe_obra,
  oc.orden,
  oc.monto_contratado,
  oc.fecha_inicio_plan,
  oc.fecha_fin_plan,
  oc.fecha_inicio_real,
  oc.fecha_fin_real,
  oc.drive_carpeta_id,
  ocr.costo_real,
  ocr.n_comprobantes,
  case when oc.monto_contratado > 0 and coalesce(ocr.costo_real, 0) > 0
       then round((oc.monto_contratado - ocr.costo_real) / oc.monto_contratado * 100, 1) end
    as margen_sobre_contratado_pct,
  av.avance_pct,
  av.n_medidas::int         as n_actividades_medidas,
  av.n_actividades::int     as n_actividades,
  av.n_sin_planificar::int  as n_actividades_sin_planificar,
  av.sincronizado_en        as avance_sincronizado_en,
  (select count(*)::int from public.obra_restriccion r
    where r.obra_id = oc.id and r.estado <> 'liberada')                                      as restricciones_abiertas,
  (select count(*)::int from public.obra_restriccion r
    where r.obra_id = oc.id and r.estado <> 'liberada'
      and r.fecha_compromiso is not null and r.fecha_compromiso < current_date)              as restricciones_vencidas
from public.obra_canonica oc
left join public.obra_costo_real ocr on ocr.obra_id = oc.id
left join public.obra_avance av      on av.obra_id = oc.id;

-- `drop view` se lleva los privilegios, y eso ya dejó el módulo entero en `permission denied` una
-- vez: el 404 de todas las pantallas de Obras era esto, no un error de ruteo.
grant select on public.obra_panel to authenticated;

-- ── 4) La tabla vieja se retira, no se borra
--
-- `avance_obra` era el espejo del cálculo viejo. Se conserva con su nombre cambiado —por si hay que
-- comparar contra lo que se publicaba— y deja de existir con el nombre que leían las pantallas: así
-- cualquier consumidor que se me haya pasado FALLA A LA VISTA en vez de seguir leyendo un número
-- viejo en silencio. Su sincronizador (`sync-avance-obra.mjs`) se da de baja en el mismo commit.
alter table if exists public.avance_obra rename to avance_obra_legado;
comment on table public.avance_obra_legado is
  'RETIRADA el 17/08/2026. Espejo del cálculo viejo de avance (avance-fisico.mjs), que promediaba '
  'sólo las filas con algo en la columna # y publicaba San Francisco al 85% mirando 24 de 119 '
  'actividades. El avance canónico vive en la vista obra_avance. No la lee nadie.';
