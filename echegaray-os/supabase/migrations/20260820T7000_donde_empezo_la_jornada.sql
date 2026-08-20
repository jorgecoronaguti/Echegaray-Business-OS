-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- DÓNDE EMPEZÓ LA JORNADA · la marca de entrada guarda el punto, y la obra ve quién está
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- El dueño: *"q si marcan la asistencia nos muestre el listado, corriendo un reloj con hora de
-- inicio algun indicador de activo y la geolocalizacion de donde dio el inicio del dia"*.
--
-- `asistencia_marca` (20260820T6000) ya guarda QUIÉN, CUÁNDO y EN QUÉ OBRA. Falta el DÓNDE, y falta
-- la cara que lo lee: hasta hoy la presencia sólo se veía de a una persona, desde su propio teléfono.
--
-- ═══ EL PUNTO ES UN DATO DEL HECHO, NO UNA COLUMNA MÁS ═══
--
-- Va en la MARCA y no en la persona: es dónde estaba esa persona ESE día a ESA hora. Guardarlo en
-- `personas` sería un «último lugar conocido» que se pisa solo y no sirve para nada.
--
-- Y ES OPCIONAL, SIEMPRE. El teléfono puede negar el permiso, estar sin señal de GPS o dentro de un
-- galpón de chapa. Una marca sin punto es una marca válida: lo que NO se admite es inventarle uno —
-- ni el de la obra, ni el último conocido, ni el del centro de la ciudad. `lat/lon` en NULL se lee
-- como «no se pudo tomar», que es la verdad, y la pantalla lo escribe con esas palabras.
alter table public.asistencia_marca add column if not exists lat numeric(9, 6);
alter table public.asistencia_marca add column if not exists lon numeric(9, 6);
alter table public.asistencia_marca add column if not exists precision_m integer;

-- Un punto es lat Y lon: media coordenada no ubica nada y ensucia todo cruce posterior.
alter table public.asistencia_marca drop constraint if exists asistencia_marca_punto_completo;
alter table public.asistencia_marca add constraint asistencia_marca_punto_completo
  check ((lat is null) = (lon is null));

alter table public.asistencia_marca drop constraint if exists asistencia_marca_punto_valido;
alter table public.asistencia_marca add constraint asistencia_marca_punto_valido
  check (lat is null or (lat between -90 and 90 and lon between -180 and 180));

comment on column public.asistencia_marca.lat is
  'Latitud donde se registró la marca, si el teléfono la pudo dar. NULL = no se pudo tomar (permiso negado, sin señal, adentro). NUNCA se rellena con la de la obra.';
comment on column public.asistencia_marca.precision_m is
  'Radio de precisión en metros que declaró el navegador. Sin él, un punto a 2 km de error se lee igual que uno a 5 m.';

-- RLS NO ES GRANT: las columnas nuevas necesitan su permiso o el insert da «permission denied» y
-- Next lo muestra como un 404. Las policies de `20260820T6000` ya las cubren (la fila es de quien
-- la escribe); esto es el otro lado del mismo permiso.
grant insert (lat, lon, precision_m), update (lat, lon, precision_m) on public.asistencia_marca to authenticated;

-- ── LA CARA QUE MIRA LA OBRA ────────────────────────────────────────────────────────────────────
--
-- ═══ `security_invoker = true`, Y ES LA DECISIÓN IMPORTANTE DE ESTA MIGRACIÓN ═══
--
-- Las vistas `mi_*` corren como su dueño porque el portero que las contiene es la IDENTIDAD de quien
-- pregunta. Ésta es al revés: publica a TODO EL MUNDO que marcó, y quién puede verlo ya está escrito
-- en las policies de `asistencia_marca` y `personas`. Con `security_invoker = true` esa decisión se
-- toma UNA vez, en la tabla, y esta vista no puede contradecirla:
--
--   · Dirección, Administración y Jefe de obra  → `es_administracion()` → ven a todos.
--   · Nivel campo                                → sólo su propia fila. No es una fuga: es su día.
--   · Sin sesión                                  → nada.
--
-- Si en cambio corriera como su dueño, esta vista sería una segunda definición de quién ve la
-- presencia ajena, y el día que las dos difieran gana la que nadie audita.
--
-- NO PUBLICA DNI, CUIL NI TELÉFONO: selecciona nombre, categoría y puesto, que es lo que el grant de
-- columna de `personas` le da a `authenticated` y lo único que esta pantalla necesita.
create or replace view public.presencia_del_dia
with (security_invoker = true) as
  select
    m.persona_id,
    p.nombre_completo,
    p.categoria,
    p.puesto,
    m.fecha,
    m.obra_id,
    o.nombre                                                   as obra,
    min(m.momento) filter (where m.tipo = 'entrada')            as entrada,
    min(m.momento) filter (where m.tipo = 'salida')             as salida,
    count(*) filter (where m.tipo = 'incidencia')::int          as incidencias,
    max(m.motivo) filter (where m.tipo = 'incidencia')          as motivo,
    -- EL PUNTO ES EL DE LA ENTRADA. El de la salida es otro hecho y no es el que se pidió: «dónde dio
    -- el inicio del día». Se toma con `min(momento)` para que dos marcas del mismo tipo —que el único
    -- de la tabla impide, pero una corrección de Administración podría crear— no cambien el punto.
    (array_agg(m.lat order by m.momento) filter (where m.tipo = 'entrada'))[1]         as lat,
    (array_agg(m.lon order by m.momento) filter (where m.tipo = 'entrada'))[1]         as lon,
    (array_agg(m.precision_m order by m.momento) filter (where m.tipo = 'entrada'))[1] as precision_m,
    (array_agg(m.origen order by m.momento) filter (where m.tipo = 'entrada'))[1]      as origen,
    case
      when min(m.momento) filter (where m.tipo = 'entrada') is null then 'sin_registrar'
      when min(m.momento) filter (where m.tipo = 'salida')  is not null then 'cerrada'
      when m.fecha = current_date then 'activo'
      else 'falta_salida'
    end                                                         as estado
  from public.asistencia_marca m
  join public.personas p on p.id = m.persona_id
  left join public.obra_canonica o on o.id = m.obra_id
  group by m.persona_id, p.nombre_completo, p.categoria, p.puesto, m.fecha, m.obra_id, o.nombre;

comment on view public.presencia_del_dia is
  'Quién marcó, cuándo empezó, si sigue activo y dónde dio el inicio del día. Corre con los permisos de quien pregunta: Administración y Jefe de obra ven a todos, el nivel campo sólo su propia fila.';

grant select on public.presencia_del_dia to authenticated;
