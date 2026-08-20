-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL LEGAJO REAL ENTRA AL MÓDULO: 61 CARPETAS, 192 PAPELES, Y QUIÉN SIGUE EN LA EMPRESA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- El data room de Personal quedó ordenado por persona y por estado (1. ACTIVOS / 2. INACTIVOS /
-- 3. A REVISAR / 9. ADMINISTRACIÓN). Al ir a volcarlo al módulo aparecieron tres cosas que la base
-- no aguantaba. Ninguna es cosmética.
--
-- ═══ 1. VINCULAR UN DOCUMENTO ESTABA ROTO EN PRODUCCIÓN ═══
--
-- `documentacion_legajo.tipo_documento` tenía el CHECK original de julio:
--     ('alta_afip','fondo_cese_hm','dni_escaneado','baja','epp')
-- y el selector de la pantalla ofrece OTRO vocabulario ('dni','cuil','alta_temprana','contrato',
-- 'art','libreta_fondo_cese','certificado_medico','capacitacion','licencia_conducir','otro').
-- NINGUNA de las diez opciones que se pueden elegir pasa el CHECK: elegir cualquiera devolvía 23514.
-- El comentario del catálogo en TypeScript decía *"NO es un CHECK en la base"* — y sí lo era. Nadie
-- lo notó porque las 12 filas cargadas son de la carga inicial por script, no de la pantalla.
--
-- Se unifica en UN vocabulario, el de un legajo de construcción de verdad, y las 12 filas viejas se
-- traducen. El CHECK queda, porque un dominio abierto en una columna que después agrupa "qué falta"
-- termina con 'HM', 'hm', 'examen medico' y 'Examen Médico' contándose por separado.
--
-- ═══ 2. UN DOCUMENTO POR TIPO POR PERSONA NO ES UN LEGAJO ═══
--
-- `unique (persona_id, tipo_documento)` deja UN examen médico por persona. En el data room real
-- FERREYRA RODOLFO tiene dos (el de ingreso y el periódico de 24/4), SANTANDER WALTER tiene dos DNI
-- y dos exámenes, ROSALES IVAN tiene siete papeles. Un legajo es 1:N por tipo — el periódico no
-- reemplaza al preocupacional, se suma. La clave pasa a ser el ARCHIVO: el mismo papel de Drive no
-- se vincula dos veces, y es la única duplicación que hay que impedir.
--
-- ═══ 3. «SE FUE» Y «SE FUE EL DÍA X» SON DOS PREGUNTAS ═══
--
-- El diseño de julio decía: `fecha_egreso` es lo único que saca a alguien del plantel, sin un
-- `activo` aparte, para no tener dos campos del mismo hecho. Correcto mientras la baja tenga fecha.
-- El data room trajo el caso que faltaba: de los 45 legajos fuera de la nómina vigente, 15 NO tienen
-- baja documentada — se fueron, consta, y la fecha no consta en ningún papel.
--
-- Con un solo campo hay que elegir entre dos mentiras: dejarlos con fecha en null y que aparezcan en
-- el selector de asignación de las ocho obras, o inventarles una fecha de egreso. Las dos son peores
-- que el problema.
--
-- Así que la pregunta se parte en las dos que realmente son: `en_la_empresa` responde "¿sigue?" y
-- `fecha_egreso` responde "¿desde cuándo no?". No son dos definiciones del mismo hecho, y para que
-- no puedan contradecirse el CHECK las ata: si hay fecha de egreso, no está en la empresa. El plantel
-- pasa a definirse por `en_la_empresa`, en la vista y en un solo lugar.

begin;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1 · EL VOCABULARIO DEL LEGAJO
-- ─────────────────────────────────────────────────────────────────────────────────────────────

alter table public.documentacion_legajo drop constraint if exists documentacion_legajo_tipo_documento_check;

update public.documentacion_legajo set tipo_documento = case tipo_documento
  when 'alta_afip'     then 'alta_temprana'
  when 'dni_escaneado' then 'dni'
  when 'fondo_cese_hm' then 'libreta_fondo_cese'
  else tipo_documento end
where tipo_documento in ('alta_afip', 'dni_escaneado', 'fondo_cese_hm');

alter table public.documentacion_legajo add constraint documentacion_legajo_tipo_documento_check
  check (tipo_documento in (
    'dni',                 -- documento de identidad (frente y dorso)
    'cuil',                -- constancia de CUIL
    'alta_temprana',       -- alta temprana ante el fisco (F.885 / F.web)
    'ieric',               -- libreta de aportes / registro IERIC
    'contrato',            -- contrato de trabajo, acuerdos, adendas
    'art',                 -- constancia de cobertura de riesgos del trabajo
    'libreta_fondo_cese',  -- fondo de cese laboral del régimen de la construcción
    'examen_medico',       -- preocupacional, periódico y de egreso
    'epp',                 -- constancia de entrega de elementos de protección personal
    'capacitacion',        -- constancias de capacitación en seguridad e higiene
    'recibo_sueldo',       -- recibos firmados y liquidación final
    'licencia_conducir',
    'baja',                -- baja ante el fisco, telegrama de renuncia o despido
    'otro'));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2 · UN LEGAJO TIENE VARIOS PAPELES DEL MISMO TIPO
-- ─────────────────────────────────────────────────────────────────────────────────────────────

alter table public.documentacion_legajo drop constraint if exists documentacion_legajo_persona_id_tipo_documento_key;

-- El mismo archivo de Drive no se vincula dos veces al mismo legajo. Parcial porque un documento
-- cargado a mano —"el original está en la carpeta física"— no tiene archivo y debe poder repetirse.
create unique index if not exists documentacion_legajo_un_archivo_por_persona
  on public.documentacion_legajo (persona_id, drive_file_id)
  where drive_file_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3 · QUIÉN SIGUE EN LA EMPRESA
-- ─────────────────────────────────────────────────────────────────────────────────────────────

alter table public.personas add column if not exists en_la_empresa boolean not null default true;

update public.personas set en_la_empresa = false where fecha_egreso is not null;

alter table public.personas drop constraint if exists personas_egreso_coherente;
alter table public.personas add constraint personas_egreso_coherente
  check (fecha_egreso is null or not en_la_empresa);

comment on column public.personas.en_la_empresa is
  'Si la persona sigue trabajando acá. Es lo que define el plantel (persona_plantel). fecha_egreso '
  'dice DESDE CUÁNDO no está y puede faltar: hay bajas sin papel con fecha. El CHECK impide la '
  'contradicción — con fecha de egreso, en_la_empresa es false.';

grant select (en_la_empresa) on public.personas to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4 · EL PLANTEL SE DEFINE UNA SOLA VEZ, ACÁ
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Hasta hoy la regla "quién está disponible" vivía copiada en DOS servicios de la aplicación
-- (`obras/personalService` y `administracion/personasService`), cada uno con su `.is('fecha_egreso',
-- null)`. Dos copias de una regla es una que se va a quedar vieja. Baja a la vista: quien lee
-- `persona_plantel` ya recibe sólo a quien está.

-- `cuadrilla_panel` cuelga de `persona_plantel` sólo para poner el NOMBRE del responsable. Si el
-- plantel pasa a excluir a quien se fue, ese nombre desaparecería de la cuadrilla y quedaría un
-- responsable en blanco: la cuadrilla sigue existiendo y su responsable histórico también. Se
-- reconstruye contra `personas`, de donde `authenticated` sólo puede leer las columnas operativas.
drop view if exists public.cuadrilla_panel;
drop view if exists public.persona_plantel;
create view public.persona_plantel with (security_invoker = false) as
  select id, nombre_completo, categoria, especialidad, fecha_egreso
    from public.personas p
   where p.en_la_empresa;
grant select on public.persona_plantel to authenticated;

create view public.cuadrilla_panel with (security_invoker = true) as
  select c.id, c.nombre, c.activa, c.notas, c.responsable_id,
         r.nombre_completo as responsable,
         (select count(*)::integer from public.cuadrilla_integrante ci
           where ci.cuadrilla_id = c.id and ci.hasta is null) as integrantes,
         (select string_agg(distinct oa.obra_id, ', ' order by oa.obra_id) from public.obra_asignacion oa
           where oa.cuadrilla_id = c.id and public.asignacion_vigente(oa.desde, oa.hasta)) as obras_actuales
    from public.cuadrilla c
    left join public.personas r on r.id = c.responsable_id;
grant select on public.cuadrilla_panel to authenticated;

create or replace view public.persona_directorio with (security_invoker = true) as
  select p.id, p.nombre_completo, p.categoria, p.especialidad, p.puesto,
         p.fecha_ingreso, p.fecha_egreso,
         ci.cuadrilla_id, cu.nombre as cuadrilla,
         a.obra_id as obra_actual_id, oc.nombre as obra_actual,
         a.rol as rol_en_obra, a.desde as asignada_desde,
         p.en_la_empresa
    from public.personas p
    left join public.cuadrilla_integrante ci on ci.persona_id = p.id and ci.hasta is null
    left join public.cuadrilla cu on cu.id = ci.cuadrilla_id
    left join lateral (
      select oa.obra_id, oa.rol, oa.desde from public.obra_asignacion oa
       where oa.persona_id = p.id and public.asignacion_vigente(oa.desde, oa.hasta)
       order by oa.desde desc nulls last, oa.creado_en desc limit 1) a on true
    left join public.obra_canonica oc on oc.id = a.obra_id;

commit;
