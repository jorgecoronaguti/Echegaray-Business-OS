-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL EMPLEADO ENTRA AL OS · lo suyo, su obra, su cuadrilla y sus tareas — nada más
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- El handoff «Perfil Empleado» pide catorce pantallas para alguien que hasta hoy no tenía ninguna:
-- Hoy · Mi trabajo · Mis tareas · Detalle · Mi información · Mi legajo · Mis horas · Asistencia ·
-- Mis documentos · Subir documento · Recibos · Detalle de recibo · Reportar problema.
--
-- Antes de escribir una línea se auditó qué soporte REAL había. Lo que ya existía se reutiliza:
--
--   · `perfiles.persona_id` y `mi_persona_id()`  — el vínculo usuario↔persona (20260820T3000)
--   · `mi_legajo` `mi_asignacion` `mi_hh_dia` `mi_documento_legajo` — el patrón del portero adentro
--   · `obra_asignacion` `cuadrilla` `cuadrilla_integrante` `obra_actividad` `obra_restriccion`
--   · `documentacion_legajo` — 847 papeles reales, 652 de ellos recibos de sueldo con su PDF
--
-- Lo que NO existía y se crea acá, mínimo y canónico:
--
--   1. ASISTENCIA con hora. No había ninguna marca de entrada/salida en todo el OS.
--   2. PRESENTACIÓN de documentación por el empleado, con su ciclo de revisión.
--   3. RECIBO por persona y período: el DESTINO de lo que publique la liquidación.
--
-- ═══ LO QUE NO SE DUPLICA, Y POR QUÉ ═══
--
-- `comunicacion.asistencia_novedades` NO es esto. Es la NOVEDAD del día que el jefe de obra declara
-- por Mattermost para la liquidación (presente sí/no, motivo, ART, falta injustificada) — un hecho
-- por persona-día, escrito por un tercero, con destino a la planilla de jornales. La marca de acá
-- es otra cosa: la HORA que el propio empleado registra desde su teléfono. Distinto grano, distinto
-- autor, distinto uso. Se dejan separadas a propósito y la conciliación entre las dos es un trabajo
-- de Administración que todavía no está hecho — declarado, no escondido.
--
-- Y ASISTENCIA ≠ HH IMPUTADAS. La presencia es del empleado; la imputación a una actividad de la
-- obra la hace la obra. Ninguna se deriva de la otra: en «Mis horas» se muestran las dos puntas y lo
-- que falta imputar. El faltante NUNCA se fabrica.
--
-- ═══ RLS NO ES GRANT ═══
--
-- Cada objeto lleva su grant pegado a su definición. Una policy sin grant da «permission denied» y
-- Next lo muestra como un 404: medio día perdido buscando una ruta que en realidad era un permiso.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1 · ASISTENCIA: UNA MARCA ES UN HECHO CON HORA ──────────────────────────────────────────────
--
-- Una fila por marca, no una fila por día con dos columnas. Una marca es un EVENTO —ocurrió a una
-- hora, en un lugar, la registró alguien— y el día es una agregación de eventos. Al revés («una
-- fila por día que se va completando») se pierde quién y cuándo tocó cada mitad, y la corrección de
-- una salida pisa la entrada.
create table if not exists public.asistencia_marca (
  id          uuid primary key default gen_random_uuid(),
  persona_id  uuid not null references public.personas(id) on delete cascade,
  fecha       date not null,
  tipo        text not null check (tipo in ('entrada', 'salida', 'incidencia')),
  momento     timestamptz not null default now(),
  obra_id     text references public.obra_canonica(id),
  motivo      text,
  nota        text,
  origen      text not null default 'empleado_web',
  creado_por  uuid default auth.uid(),
  creado_en   timestamptz not null default now()
);

-- Una entrada y una salida por día. La incidencia NO entra en el único: un día puede tener varias
-- (llegó tarde y además se fue al médico) y son hechos distintos, no correcciones del mismo.
create unique index if not exists asistencia_marca_una_por_dia
  on public.asistencia_marca (persona_id, fecha, tipo)
  where tipo in ('entrada', 'salida');

create index if not exists asistencia_marca_persona_fecha
  on public.asistencia_marca (persona_id, fecha desc);

comment on table public.asistencia_marca is
  'PRESENCIA con hora, registrada por la propia persona desde el teléfono. NO son HH imputadas a obra (eso es registros_hh) ni la novedad diaria del jefe para la liquidación (comunicacion.asistencia_novedades). Las tres son hechos distintos y ninguna se deriva de otra.';

alter table public.asistencia_marca enable row level security;

-- LEE: cada uno lo suyo. Administración, todo — necesita corregir el día sin salida.
drop policy if exists asistencia_marca_select on public.asistencia_marca;
create policy asistencia_marca_select on public.asistencia_marca for select to authenticated
  using (public.es_administracion() or persona_id = public.mi_persona_id());

-- ESCRIBE: sólo a nombre propio. `persona_id = mi_persona_id()` en el `with check` es lo que impide
-- fabricar la presencia de otro; sin persona vinculada, `mi_persona_id()` es NULL y el check falla
-- cerrado. Administración también puede cargarla (alguien sin teléfono, una corrección de campo).
drop policy if exists asistencia_marca_insert on public.asistencia_marca;
create policy asistencia_marca_insert on public.asistencia_marca for insert to authenticated
  with check (
    public.es_administracion()
    or (persona_id = public.mi_persona_id() and persona_id is not null)
  );

-- CORRIGE: sólo Administración. Si el empleado pudiera editar su propia hora de entrada, la marca
-- dejaría de ser un hecho y pasaría a ser una declaración editable — que es justo lo que no sirve.
drop policy if exists asistencia_marca_update on public.asistencia_marca;
create policy asistencia_marca_update on public.asistencia_marca for update to authenticated
  using (public.es_administracion()) with check (public.es_administracion());

-- Sin DELETE, ni para Administración: una marca es historial. Un error se corrige con un UPDATE que
-- deja la fila, no borrando el día — es el mismo criterio que ya rige `movimientos_herramienta`.
grant select, insert, update on public.asistencia_marca to authenticated;

-- ── 2 · EL DÍA, ARMADO DESDE SUS MARCAS ─────────────────────────────────────────────────────────
--
-- `security_invoker = false` con el portero adentro: la vista puede leer la tabla y lo que la acota
-- es el `where … = mi_persona_id()` horneado. Es el patrón de `mi_legajo`, no uno nuevo.
--
-- EL DÍA EN CURSO NO INVENTA UN TOTAL. Con entrada y sin salida hay dos casos que se ven igual y no
-- son lo mismo: hoy es «en curso» (todavía está trabajando) y ayer es «falta salida» (nadie la
-- registró). Poner `now()` como salida provisoria fabricaría horas que nadie trabajó.
create or replace view public.mi_asistencia_dia
with (security_invoker = false) as
  select
    m.fecha,
    min(m.momento) filter (where m.tipo = 'entrada')            as entrada,
    min(m.momento) filter (where m.tipo = 'salida')             as salida,
    count(*) filter (where m.tipo = 'incidencia')::int          as incidencias,
    max(m.motivo) filter (where m.tipo = 'incidencia')          as motivo,
    case
      when min(m.momento) filter (where m.tipo = 'entrada') is null then 'sin_registrar'
      when min(m.momento) filter (where m.tipo = 'salida')  is not null then 'completo'
      when m.fecha = current_date then 'en_curso'
      else 'falta_salida'
    end                                                          as estado,
    case
      when min(m.momento) filter (where m.tipo = 'entrada') is null
        or min(m.momento) filter (where m.tipo = 'salida')  is null then null
      else round(extract(epoch from (
             min(m.momento) filter (where m.tipo = 'salida')
           - min(m.momento) filter (where m.tipo = 'entrada')))::numeric / 60)
    end                                                          as minutos,
    max(m.obra_id)                                               as obra_id
  from public.asistencia_marca m
  where m.persona_id = public.mi_persona_id()
  group by m.fecha;

comment on view public.mi_asistencia_dia is
  'Mi presencia por día, armada desde mis marcas. El día en curso no publica un total: publica «en curso».';
grant select on public.mi_asistencia_dia to authenticated;

-- ── 3 · LO QUE EL EMPLEADO PRESENTA, QUE NO ES TODAVÍA EL DOCUMENTO ─────────────────────────────
--
-- El diseño es explícito: «lo presentado no reemplaza el documento oficial hasta la aprobación».
-- Por eso la presentación es una ENTIDAD APARTE y no un campo más de `documentacion_legajo`: si la
-- foto que sacó el operario escribiera directamente sobre el legajo, el legajo pasaría a contener
-- lo que alguien mandó en vez de lo que Administración validó. Aprobar es lo que las junta.
create table if not exists public.documento_presentacion (
  id               uuid primary key default gen_random_uuid(),
  persona_id       uuid not null references public.personas(id) on delete cascade,
  documentacion_id uuid references public.documentacion_legajo(id) on delete set null,
  tipo_documento   text not null,
  archivo_path     text not null,
  archivo_nombre   text,
  archivo_bytes    integer,
  archivo_tipo     text,
  estado           text not null default 'en_revision'
                     check (estado in ('en_revision', 'aprobado', 'requiere_correccion')),
  motivo_revision  text,
  revisado_por     uuid references auth.users(id) on delete set null,
  revisado_en      timestamptz,
  creado_por       uuid default auth.uid(),
  creado_en        timestamptz not null default now()
);

create index if not exists documento_presentacion_persona
  on public.documento_presentacion (persona_id, creado_en desc);
create index if not exists documento_presentacion_pendientes
  on public.documento_presentacion (estado) where estado = 'en_revision';

comment on table public.documento_presentacion is
  'Lo que el empleado sube desde su teléfono. NO es el documento del legajo: es su presentación, que vale una vez que Administración la aprueba. Ciclo: solicitado (documentacion_legajo.presente=false) → en_revision → aprobado / requiere_correccion.';

alter table public.documento_presentacion enable row level security;

drop policy if exists documento_presentacion_select on public.documento_presentacion;
create policy documento_presentacion_select on public.documento_presentacion for select to authenticated
  using (public.es_administracion() or persona_id = public.mi_persona_id());

-- SUBE a nombre propio y SIEMPRE en revisión. El `estado = 'en_revision'` del check es lo que
-- impide autoaprobarse mandando el campo a mano por PostgREST: la pantalla no lo ofrece, pero la
-- pantalla no es la cerradura.
drop policy if exists documento_presentacion_insert on public.documento_presentacion;
create policy documento_presentacion_insert on public.documento_presentacion for insert to authenticated
  with check (
    estado = 'en_revision'
    and (
      public.es_administracion()
      or (persona_id = public.mi_persona_id() and persona_id is not null)
    )
  );

-- REVISA sólo Administración. Una corrección del empleado es una presentación NUEVA, no un edit de
-- la anterior: así queda el rastro de qué se devolvió y por qué.
drop policy if exists documento_presentacion_update on public.documento_presentacion;
create policy documento_presentacion_update on public.documento_presentacion for update to authenticated
  using (public.es_administracion()) with check (public.es_administracion());

grant select, insert, update on public.documento_presentacion to authenticated;

-- ── 4 · DÓNDE VIVE EL ARCHIVO QUE SUBE EL EMPLEADO ──────────────────────────────────────────────
--
-- Bucket PRIVADO. `avatares` y `herramientas` son públicos porque una foto de perfil y una foto de
-- una amoladora no son de nadie; un apto médico o un DNI sí. Público acá significaría que la URL
-- adivinada abre el DNI de cualquiera sin sesión.
--
-- La carpeta es el `persona_id` y eso es lo que la policy exige: `<persona_id>/<uuid>.<ext>`. Así
-- el alcance del archivo es el mismo que el de la fila, y no dos criterios que pueden divergir.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos-legajo', 'documentos-legajo', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists documentos_legajo_lee_lo_suyo on storage.objects;
create policy documentos_legajo_lee_lo_suyo on storage.objects for select to authenticated
  using (
    bucket_id = 'documentos-legajo'
    and (
      public.es_administracion()
      or (public.mi_persona_id() is not null
          and (storage.foldername(name))[1] = public.mi_persona_id()::text)
    )
  );

drop policy if exists documentos_legajo_sube_lo_suyo on storage.objects;
create policy documentos_legajo_sube_lo_suyo on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentos-legajo'
    and public.mi_persona_id() is not null
    and (storage.foldername(name))[1] = public.mi_persona_id()::text
  );

-- ── 5 · EL RECIBO: EL OS NO CALCULA SUELDOS, PUBLICA LOS QUE LE PASAN ───────────────────────────
--
-- ═══ QUÉ HAY DE VERDAD, HOY ═══
--
-- El PDF del recibo SÍ existe: 652 archivos en `documentacion_legajo` con `tipo_documento =
-- 'recibo_sueldo'`, de 60 personas, con el período en el nombre («Recibo 2026-07 Q1 · APELLIDO
-- NOMBRE.pdf»). Eso es una fuente real y por eso Recibos es una pantalla que funciona hoy.
--
-- Lo que NO existe en ninguna parte del OS es la LIQUIDACIÓN por persona: neto, días trabajados, HH
-- liquidadas, estado de pago. `jornales_quincena` es el agregado de la quincena entera (cuánta
-- gente, cuánto se pagó en total) y `nomina_por_mes` el agregado del mes. Ninguno baja a la persona.
--
-- Esta tabla es el DESTINO de esos números para cuando la liquidación los publique. Nace vacía a
-- propósito: llenarla derivando el neto de un agregado sería inventarle a alguien su sueldo.
create table if not exists public.recibo_empleado (
  id             uuid primary key default gen_random_uuid(),
  persona_id     uuid not null references public.personas(id) on delete cascade,
  periodo_desde  date not null,
  periodo_hasta  date not null,
  etiqueta       text,
  neto           numeric,
  estado_pago    text check (estado_pago in ('pendiente', 'pagado')),
  fecha_pago     date,
  fecha_emision  date,
  dias           numeric,
  hh             numeric,
  categoria      text,
  drive_file_id  text,
  origen         text not null default 'liquidacion',
  creado_en      timestamptz not null default now()
);

create unique index if not exists recibo_empleado_persona_periodo
  on public.recibo_empleado (persona_id, periodo_desde, periodo_hasta);

comment on table public.recibo_empleado is
  'Lo que la liquidación publica por persona y período. El OS NO calcula sueldo: si esta tabla no tiene la fila, la pantalla dice «todavía no liquidado» y nunca $ 0. Hoy nace vacía: no existe liquidación por persona en el OS.';

alter table public.recibo_empleado enable row level security;

-- LEE: el suyo, o quien ve la plata. Un jefe de obra NO ve sueldos: `ve_economia()` no lo incluye, y
-- ésa es exactamente la línea que se trazó el 19/08 entre administrar y ver la plata.
drop policy if exists recibo_empleado_select on public.recibo_empleado;
create policy recibo_empleado_select on public.recibo_empleado for select to authenticated
  using (public.ve_economia() or persona_id = public.mi_persona_id());

drop policy if exists recibo_empleado_insert on public.recibo_empleado;
create policy recibo_empleado_insert on public.recibo_empleado for insert to authenticated
  with check (public.ve_economia());

drop policy if exists recibo_empleado_update on public.recibo_empleado;
create policy recibo_empleado_update on public.recibo_empleado for update to authenticated
  using (public.ve_economia()) with check (public.ve_economia());

grant select, insert, update on public.recibo_empleado to authenticated;

-- ── 6 · MIS RECIBOS: EL PDF QUE EXISTE + LOS NÚMEROS QUE TODAVÍA NO ─────────────────────────────
--
-- El período sale del NOMBRE del archivo, que es donde la empresa lo escribió («Recibo 2026-07 Q1»).
-- No de `fecha_documento`: las dos quincenas de julio están cargadas con la misma fecha, así que
-- ordenar por ella mezclaría Q1 con Q2. Cuando el nombre no trae período, se cae a la fecha y se
-- dice — `periodo_cierto = false` — en vez de inventar una quincena.
create or replace view public.mi_recibo
with (security_invoker = false) as
  with mio as (
    select d.id, d.nombre, d.fecha_documento, d.drive_file_id,
           substring(d.nombre from '(\d{4})-(\d{2})')            as anio,
           substring(d.nombre from '\d{4}-(\d{2})')              as mes,
           substring(d.nombre from 'Q([12])')                    as quincena
      from public.documentacion_legajo d
     where d.persona_id = public.mi_persona_id()
       and d.tipo_documento = 'recibo_sueldo'
       and d.presente
  )
  select
    m.id,
    coalesce(m.anio || '-' || m.mes, to_char(m.fecha_documento, 'YYYY-MM'))          as periodo,
    m.quincena,
    (m.anio is not null)                                                             as periodo_cierto,
    m.nombre,
    m.fecha_documento,
    m.drive_file_id,
    r.neto,
    r.estado_pago,
    r.fecha_pago,
    r.fecha_emision,
    r.dias,
    r.hh,
    r.categoria,
    (r.id is not null)                                                               as liquidado
  from mio m
  left join public.recibo_empleado r
    on r.persona_id = public.mi_persona_id()
   and to_char(r.periodo_desde, 'YYYY-MM') = coalesce(m.anio || '-' || m.mes, to_char(m.fecha_documento, 'YYYY-MM'))
   and coalesce(r.etiqueta, '') = coalesce('Q' || m.quincena, '');

comment on view public.mi_recibo is
  'Mis recibos: el PDF real del legajo + los números de la liquidación cuando existan. liquidado = false significa «todavía no liquidado», nunca neto 0.';
grant select on public.mi_recibo to authenticated;

-- ── 7 · MI LEGAJO, COMPLETO ─────────────────────────────────────────────────────────────────────
--
-- `mi_legajo` publicaba la situación laboral y nada de la identidad: quien abría «Mi legajo» veía
-- su categoría pero no su propio DNI. El diseño pide IDENTIDAD y SITUACIÓN LABORAL, y el DNI de uno
-- es de uno — el grant por columna que se lo niega a `authenticated` sobre `personas` protege el DNI
-- DE LOS DEMÁS, que sigue negado: esta vista sólo devuelve la fila de quien pregunta.
--
-- `retribucion_pactada` NO entra, y no por olvido. No sale por la API para nadie —tampoco para
-- Administración— y lo que el empleado cobra se lee en su recibo, que es el documento que vale.
--
-- Se recrea en vez de `create or replace`: agregar columnas EN EL MEDIO cambia el orden y Postgres
-- rechaza el replace. El `cascade` no arrastra nada —ninguna vista cuelga de ésta— y se verifica.
drop view if exists public.mi_legajo;
create view public.mi_legajo
with (security_invoker = false) as
  select
    p.id,
    p.nombre_completo,
    p.dni,
    p.cuil,
    p.fecha_nacimiento,
    p.nacionalidad,
    p.telefono,
    p.email,
    p.domicilio,
    p.contacto_emergencia,
    p.contacto_emergencia_telefono,
    p.categoria,
    p.especialidad,
    p.puesto,
    p.convenio_colectivo,
    p.art,
    p.obra_social,
    p.fecha_ingreso,
    p.fecha_egreso,
    p.en_la_empresa,
    p.legajo
  from public.personas p
  where p.id = public.mi_persona_id();

grant select on public.mi_legajo to authenticated;

-- ── 8 · MI OBRA ─────────────────────────────────────────────────────────────────────────────────
--
-- Lo operativo de la obra donde trabajo: nombre, ubicación, etapa y quién es el jefe. Nada de
-- contratado, presupuesto, margen ni certificado — y no porque la pantalla no los dibuje, sino
-- porque esta vista no los selecciona: por PostgREST tampoco salen.
create or replace view public.mi_obra
with (security_invoker = false) as
  select
    o.id,
    o.nombre,
    o.ubicacion,
    o.etapa,
    o.estado,
    o.jefe_obra,
    a.rol,
    a.cuadrilla,
    a.desde,
    a.hasta,
    a.actividad_id
  from public.obra_asignacion a
  join public.obra_canonica o on o.id = a.obra_id
  where a.persona_id = public.mi_persona_id()
    and public.asignacion_vigente(a.desde, a.hasta);

comment on view public.mi_obra is
  'La obra donde estoy asignado hoy, en su cara OPERATIVA. Sin una sola columna de plata: no se ocultan en la pantalla, no se seleccionan acá.';
grant select on public.mi_obra to authenticated;

-- ── 9 · MI CUADRILLA: NOMBRE Y ROL, Y AHÍ SE TERMINA ────────────────────────────────────────────
--
-- El diseño: «los integrantes de la cuadrilla se listan por nombre y rol, sin puerta a sus datos
-- sensibles». Por eso la vista devuelve DOS columnas de la persona y ninguna más. No hay un `id` de
-- persona que sirva para pedir después su legajo: lo que no se publica no se puede pedir.
create or replace view public.mi_cuadrilla
with (security_invoker = false) as
  select
    c.id            as cuadrilla_id,
    c.nombre        as cuadrilla,
    p.nombre_completo,
    coalesce(p.puesto, p.categoria) as rol,
    (p.id = c.responsable_id)       as es_responsable,
    (p.id = public.mi_persona_id()) as soy_yo
  from public.cuadrilla_integrante mia
  join public.cuadrilla c            on c.id = mia.cuadrilla_id
  join public.cuadrilla_integrante ci on ci.cuadrilla_id = c.id and ci.hasta is null
  join public.personas p             on p.id = ci.persona_id
  where mia.persona_id = public.mi_persona_id()
    and mia.hasta is null;

comment on view public.mi_cuadrilla is
  'Quién trabaja conmigo: nombre y rol. Sin id de persona a propósito — no hay puerta a legajos de terceros.';
grant select on public.mi_cuadrilla to authenticated;

-- ── 10 · MIS TAREAS ─────────────────────────────────────────────────────────────────────────────
--
-- ═══ QUÉ HACE QUE UNA ACTIVIDAD SEA «MÍA» ═══
--
-- Tres vínculos reales, y sólo tres: soy el responsable de la actividad, la actividad es de mi
-- cuadrilla, o me asignaron a esa actividad en la obra (`obra_asignacion.actividad_id`).
--
-- LO QUE NO CUENTA: estar asignado a la obra. La obra tiene 349 actividades; llamarlas «mis tareas»
-- convertiría la pantalla en el plan de obra entero con el título equivocado, y el operario dejaría
-- de mirarla el primer día. Cuando no hay ninguna, la pantalla lo dice y dice quién las asigna —
-- vacío honesto antes que lleno falso.
create or replace view public.mi_tarea
with (security_invoker = false) as
  select distinct
    t.id,
    t.obra_id,
    o.nombre        as obra,
    t.codigo,
    t.nombre,
    t.seccion,
    t.estado,
    t.pct,
    t.inicio_plan,
    t.fin_plan,
    t.unidad,
    t.cantidad_objetivo,
    t.metodo_avance,
    t.comentario,
    (select count(*) from public.obra_restriccion r
      where r.actividad_id = t.id and r.estado = 'abierta')::int as impedimentos
  from public.obra_actividad t
  join public.obra_canonica o on o.id = t.obra_id
  where t.archivada is not true
    and public.mi_persona_id() is not null
    and (
      t.responsable_id = public.mi_persona_id()
      or exists (
        select 1 from public.cuadrilla_integrante ci
         where ci.persona_id = public.mi_persona_id() and ci.hasta is null
           and ci.cuadrilla_id = t.cuadrilla_id
      )
      or exists (
        select 1 from public.obra_asignacion a
         where a.persona_id = public.mi_persona_id()
           and a.actividad_id = t.id
           and public.asignacion_vigente(a.desde, a.hasta)
      )
    );

comment on view public.mi_tarea is
  'Las actividades que son mías: soy responsable, son de mi cuadrilla, o me asignaron a ellas. Estar asignado a la obra NO alcanza — eso sería el plan entero con otro nombre.';
grant select on public.mi_tarea to authenticated;

-- ── 11 · MIS DOCUMENTOS, CON EL CICLO DE REVISIÓN ADENTRO ───────────────────────────────────────
--
-- Dos cambios sobre la vista anterior:
--
--  1. LOS RECIBOS SALEN DE ACÁ. 652 de los 847 papeles del legajo son recibos de sueldo: dejarlos
--     en «Mis documentos» sepulta el apto médico que vence bajo tres años de recibos. Tienen su
--     propia pantalla, que es donde la gente los busca.
--  2. ENTRA EL ESTADO DE LO PRESENTADO. `presente = false` es «te lo piden»; una presentación en
--     revisión es «ya lo mandaste y falta que lo miren»; una devuelta es «hay que rehacerlo». Sin
--     esto, el empleado sube la foto y la pantalla sigue diciéndole que le falta el documento.
drop view if exists public.mi_documento_legajo;
create view public.mi_documento_legajo
with (security_invoker = false) as
  select
    d.id,
    d.tipo_documento,
    d.nombre,
    d.presente,
    d.drive_file_id,
    d.fecha_documento,
    d.fecha_vencimiento,
    p.id              as presentacion_id,
    p.estado          as presentacion_estado,
    p.motivo_revision,
    p.creado_en       as presentado_en,
    p.revisado_en,
    p.archivo_nombre  as presentado_nombre
  from public.documentacion_legajo d
  left join lateral (
    select pr.* from public.documento_presentacion pr
     where pr.documentacion_id = d.id
     order by pr.creado_en desc
     limit 1
  ) p on true
  where d.persona_id = public.mi_persona_id()
    and d.tipo_documento <> 'recibo_sueldo';

grant select on public.mi_documento_legajo to authenticated;

-- ── 12 · VE_OBRA MIRA TAMBIÉN DÓNDE ESTÁ ASIGNADA LA PERSONA ────────────────────────────────────
--
-- ═══ DOS VÍNCULOS QUE HABÍA QUE MANTENER A MANO POR SEPARADO ═══
--
-- `usuario_obra` dice a qué obras entra una CUENTA. `obra_asignacion` dice a qué obra está asignada
-- una PERSONA del plantel. Hasta hoy `ve_obra()` sólo miraba el primero, así que un empleado podía
-- estar asignado a la obra en el plantel y su cuenta no ver esa obra — y para arreglarlo había que
-- acordarse de cargar el mismo hecho dos veces, en dos tablas, con dos pantallas distintas.
--
-- El diseño lo dice en una línea: «Mi obra ← asignaciones». Si la persona está asignada y la cuenta
-- es esa persona, la cuenta ve esa obra. No se agrega un criterio nuevo de autorización: se le
-- enseña al que ya existe el vínculo que ya existía.
--
-- SIGUE FALLANDO CERRADO. Sin persona vinculada `mi_persona_id()` es NULL y el `exists` no devuelve
-- nada; sin asignación vigente, tampoco. Y no toca la línea del dinero: `obra_canonica` le niega
-- `monto_contratado` a `authenticated` por grant de columna, y lo económico pasa por `ve_economia()`.
create or replace function public.ve_obra(p_obra text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_administracion()
      -- El jefe de obra opera TODAS las obras. Lo económico no pasa por acá.
      or public.current_rol() = 'jefe_obra'
      or exists (
        select 1 from public.usuario_obra uo
        where uo.usuario_id = auth.uid()
          and uo.obra_canonica_id = p_obra
      )
      -- La obra donde mi PERSONA está asignada hoy. Un eje, no dos.
      or exists (
        select 1 from public.obra_asignacion a
        where a.persona_id = public.mi_persona_id()
          and a.obra_id = p_obra
          and public.asignacion_vigente(a.desde, a.hasta)
      )
$$;

-- ── 13 · REPORTAR UN PROBLEMA ES ESCRIBIR UN IMPEDIMENTO ────────────────────────────────────────
--
-- El diseño: «Entra como impedimento de la actividad en el sistema real: no existe una segunda base
-- de problemas». Hoy `obra_restriccion_write` es un `for all` que exige dirección, administración o
-- jefe de obra: el operario que ve el muro parado no puede decirlo, y quien lo ve no está ahí.
--
-- Se parte por comando —un `for all` incluye el SELECT, trampa que este repo ya pagó dos veces— y se
-- le abre al nivel campo EXACTAMENTE una operación: ABRIR un impedimento en una obra que ve, sobre
-- una actividad de esa misma obra. No puede cerrarlo, ni liberarlo, ni tocar el de otro: eso decide
-- si el trabajo sigue frenado y lo decide quien conduce la obra.
drop policy if exists obra_restriccion_write on public.obra_restriccion;

drop policy if exists obra_restriccion_insert on public.obra_restriccion;
create policy obra_restriccion_insert on public.obra_restriccion for insert to authenticated
  with check (
    public.ve_obra(obra_id)
    and (
      public.current_rol() in ('direccion', 'administracion', 'jefe_obra')
      -- El nivel campo abre, y abre ABIERTA: no puede nacer liberada ni cerrada.
      or (
        public.current_rol() = 'campo'
        and coalesce(estado, 'abierta') = 'abierta'
        and fecha_liberacion is null
        and (
          actividad_id is null
          or exists (select 1 from public.obra_actividad t
                      where t.id = actividad_id and t.obra_id = obra_restriccion.obra_id)
        )
      )
    )
  );

drop policy if exists obra_restriccion_update on public.obra_restriccion;
create policy obra_restriccion_update on public.obra_restriccion for update to authenticated
  using (public.ve_obra(obra_id) and public.current_rol() in ('direccion', 'administracion', 'jefe_obra'))
  with check (public.ve_obra(obra_id) and public.current_rol() in ('direccion', 'administracion', 'jefe_obra'));

drop policy if exists obra_restriccion_delete on public.obra_restriccion;
create policy obra_restriccion_delete on public.obra_restriccion for delete to authenticated
  using (public.ve_obra(obra_id) and public.current_rol() in ('direccion', 'administracion', 'jefe_obra'));

-- ── 14 · LAS HORAS DE OTRO NO SON ASUNTO DEL EMPLEADO ───────────────────────────────────────────
--
-- `hh_select_por_obra` le daba a cualquiera que viera la obra TODAS las imputaciones de esa obra, de
-- todo el plantel. Para Administración y el jefe está bien —es su trabajo—; para el nivel campo es
-- exactamente lo que el diseño prohíbe: «no ve horas de terceros».
--
-- Los cuatro roles del OS son dirección, administración, jefe de obra y campo, y los tres primeros
-- son `es_administracion()`. Así que la regla completa se escribe en una línea: administra, o son
-- suyas. Sin la tercera rama que nadie ejercía.
drop policy if exists hh_select_por_obra on public.registros_hh;
create policy hh_select_por_obra on public.registros_hh for select to authenticated
  using (
    public.es_administracion()
    or (persona_id is not null and persona_id = public.mi_persona_id())
  );

-- ── 15 · LO QUE ME FRENA, Y NADA MÁS ────────────────────────────────────────────────────────────
--
-- Los impedimentos abiertos de MIS actividades. La obra entera los ve en su pantalla; acá aparecen
-- los que tocan lo que estoy haciendo, que es lo único que el empleado puede destrabar o reportar.
create or replace view public.mi_impedimento
with (security_invoker = false) as
  select
    r.id,
    r.obra_id,
    r.actividad_id,
    t.nombre     as actividad,
    r.tipo,
    r.descripcion,
    r.estado,
    r.fecha_necesidad,
    r.creado_en
  from public.obra_restriccion r
  join public.mi_tarea t on t.id = r.actividad_id
  where r.estado = 'abierta'
    -- REDUNDANTE A PROPÓSITO. El filtro ya viene por `mi_tarea`, pero un `join` que mañana alguien
    -- convierta en `left join` para "que no se pierdan los impedimentos sin actividad" publicaría
    -- los de toda la obra sin que el cambio parezca tocar permisos. La garantía se escribe acá.
    and public.mi_persona_id() is not null;

grant select on public.mi_impedimento to authenticated;
