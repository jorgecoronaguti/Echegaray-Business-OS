-- ASISTENCIA v2 — el calendario de la empresa y el POR QUÉ de cada jornada incompleta.
--
-- ADITIVA y AISLADA en el schema `comunicacion`. No hace ningún drop, ningún alter destructivo,
-- y no toca public.* ni orq.*. Tampoco crea una copia maestra de trabajadores, obras ni horas:
-- la verdad de las HORAS sigue siendo el Sheet JORNALES y ahí se queda.
--
-- Trae dos cosas que hoy no existen en ningún lado:
--
--   1. jornada_tipo_regla + jornada_config → cuántas horas vale una jornada en una fecha
--      concreta. Hasta acá el número salía de calibrar la planilla (jornada-politica.mjs), que
--      es correcto para la semana normal y ciego a las excepciones: un feriado no se puede
--      calibrar porque justamente ese día no hay nada cargado.
--
--   2. asistencia_novedades → el MOTIVO de una ausencia o de una jornada parcial. Hoy el que
--      faltó sin avisar, el que está de vacaciones, el suspendido y el que se accidentó en obra
--      se guardan todos como el mismo cero. Son cuatro hechos con consecuencias distintas
--      —económica, laboral, de ART y de planificación— y el sistema no puede distinguirlos.
--
-- ── DECISIÓN YA TOMADA: EL MOTIVO NO VA A LA PLANILLA ────────────────────────────────────
-- El motivo, la aclaración y la obra realizada se guardan ACÁ, en Postgres. La celda de
-- JORNALES sigue recibiendo SÓLO HORAS. Por tres razones:
--   a) Las columnas diarias de JORNALES se suman para la quincena. Un texto en una celda
--      diaria convierte la suma en #ERROR! o la trunca en silencio — es exactamente el defecto
--      que ya costó una reparación en el Flujo de Fondos.
--   b) El camino de escritura (fingerprint de celda, fórmula preservada, escritura atómica
--      todo-o-nada, auditoría celda por celda) está validado y en producción para números.
--      Meterle un tipo de dato nuevo obliga a revalidarlo entero, sin ninguna ganancia.
--   c) El motivo es un dato que se CONSULTA y se AGREGA (ausentismo por causa, accidentes del
--      mes, vacaciones en curso). Eso es una consulta SQL, no una lectura de planilla.
-- El vínculo entre las dos caras es (fecha_operativa, clave_obra, trabajador_ref): la misma
-- identidad estructural con la que el módulo resuelve la celda.
--
-- ── RLS ──────────────────────────────────────────────────────────────────────────────────
-- El schema `comunicacion` NO está expuesto por PostgREST: se accede sólo con el port de
-- Postgres del Work Fabric (rol del servidor). Por eso, igual que las dos migraciones
-- anteriores del módulo, no se habilita RLS ni se otorgan grants a `anon`/`authenticated`.
-- Si algún día una pantalla lee estas tablas directamente desde el navegador, ahí sí hay que
-- habilitar RLS y política — y esa decisión se toma en ese momento, no ahora por las dudas.

-- ── 1. TIPOS DE REGLA DE JORNADA (lookup, extensible sin migrar) ─────────────────────────
-- Existe para dos cosas: fijar la PRECEDENCIA entre reglas como dato, y dar integridad
-- referencial a `tipo`. Sin la FK, un 'feriadoo' entraría y la regla nunca se aplicaría —
-- fallando en silencio, que es la peor forma de fallar.
-- Agregar un caso nuevo mañana (horario de verano, jornada reducida por calor, paro general)
-- es INSERTAR UNA FILA acá y otra en jornada_config. No hace falta otra migración.
create table if not exists comunicacion.jornada_tipo_regla (
  tipo        text primary key,
  prioridad   int  not null,          -- menor gana; ordena reglas que caen sobre la misma fecha
  descripcion text not null,
  creado_at   timestamptz not null default now()
);

insert into comunicacion.jornada_tipo_regla (tipo, prioridad, descripcion) values
  ('feriado',       10, 'Feriado nacional, provincial o de la empresa. Gana sobre cualquier otra regla del día.'),
  ('media_jornada', 20, 'Jornada reducida: 24 y 31 de diciembre, un sábado especial, un turno recortado.'),
  ('config_dia',    30, 'Horas que vale una jornada completa en un día de la semana, con vigencia.')
on conflict (tipo) do nothing;

comment on table comunicacion.jornada_tipo_regla is
  'Catálogo de tipos de regla de jornada y su precedencia. Es DATO, no código: agregar un caso nuevo es insertar una fila, no desplegar.';

-- ── 2. CONFIGURACIÓN DE JORNADA ──────────────────────────────────────────────────────────
-- Una sola tabla para los tres casos, porque los tres responden la misma pregunta ("cuántas
-- horas vale la jornada de esta fecha") y se resuelven con una sola consulta ordenada. Tres
-- tablas separadas obligarían a tres consultas y a decidir la precedencia en el código.
--
-- Una regla es POR FECHA (feriado, media jornada puntual) o POR DÍA DE LA SEMANA (config_dia,
-- y también una media jornada recurrente). Nunca las dos, nunca ninguna.
--
-- `horas` puede ser NULL a propósito: es la forma de decir "este día no tiene una jornada
-- defendible, se carga a mano". El sábado es exactamente ese caso — el archivo muestra 4; 5,5;
-- 6 y 8 sin una regla única. NULL no es cero: cero es una afirmación (un feriado), NULL es la
-- ausencia de afirmación, y el módulo la trata distinto.
create table if not exists comunicacion.jornada_config (
  id             bigint generated always as identity primary key,
  tipo           text not null references comunicacion.jornada_tipo_regla(tipo),
  fecha          date,                     -- regla de fecha exacta
  dia_semana     smallint,                 -- 0=domingo … 6=sábado, regla recurrente
  horas          numeric(5,2),             -- NULL = se carga a mano (no es cero)
  etiqueta       text,                     -- 'Día del Trabajador', 'Nochebuena', … para mostrar
  alcance        text not null default 'empresa',  -- 'nacional' | 'provincial' | 'empresa'
  vigente_desde  date,                     -- sólo para reglas recurrentes; NULL = sin límite
  vigente_hasta  date,
  activo         boolean not null default true,
  nota           text,
  creado_por     text,
  creado_at      timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  constraint jornada_config_fecha_xor_dia check (
    (fecha is not null and dia_semana is null)
 or (fecha is null and dia_semana is not null)
  ),
  constraint jornada_config_dia_valido  check (dia_semana is null or dia_semana between 0 and 6),
  constraint jornada_config_horas_rango check (horas is null or (horas >= 0 and horas <= 24)),
  constraint jornada_config_vigencia    check (
    vigente_desde is null or vigente_hasta is null or vigente_desde <= vigente_hasta
  )
);

-- Una sola regla ACTIVA por tipo y fecha: dos feriados el mismo día es un error de carga, no
-- una situación real. La parcial por `activo` deja desactivar una y cargar la corregida.
create unique index if not exists jornada_config_fecha_idx
  on comunicacion.jornada_config (tipo, fecha) where fecha is not null and activo;
-- Para las recurrentes la clave incluye la vigencia: "los jueves valían 8 hasta marzo y 9 desde
-- abril" son dos filas legítimas del mismo tipo y el mismo día.
create unique index if not exists jornada_config_dia_idx
  on comunicacion.jornada_config (tipo, dia_semana, coalesce(vigente_desde, '-infinity'::date))
  where dia_semana is not null and activo;
create index if not exists jornada_config_lookup_idx
  on comunicacion.jornada_config (fecha, dia_semana) where activo;

comment on table comunicacion.jornada_config is
  'Excepciones y reglas de jornada por fecha o por día de la semana. Es una capa POR ENCIMA de la calibración de la planilla (jornada-politica.mjs), que sigue siendo la fuente de verdad: sin fila acá, decide la planilla. Se lee con orquestador/lib/jornada-config.mjs.';
comment on column comunicacion.jornada_config.horas is
  'Horas de jornada completa. NULL = no hay jornada defendible para ese día y se carga a mano. NULL no es cero: cero es una afirmación (feriado), NULL es la ausencia de afirmación.';
comment on column comunicacion.jornada_config.alcance is
  'De dónde sale la regla: nacional, provincial (San Juan) o empresa. Informativo — no participa de la resolución.';

-- ── 3. FERIADOS NACIONALES 2026 ──────────────────────────────────────────────────────────
-- Se siembran SÓLO los que se pudieron verificar contra más de una fuente coincidente
-- (calendario oficial de Jefatura de Gabinete y publicaciones que citan la Ley 27.399), con el
-- día de la semana chequeado aparte. Ninguna fecha se dedujo "de memoria".
--
-- horas = 0 porque un feriado no tiene jornada ordinaria. Que el feriado se PAGUE es otra cosa
-- —es una regla de liquidación del CCT, no de horas trabajadas— y no se decide en esta tabla.
-- Si se trabaja igual (pasa, con recargo), la pantalla permite cargar horas: la configuración
-- precarga, no bloquea.
--
-- NO SE SIEMBRAN, a propósito:
--   · Güemes (17/06) y Soberanía Nacional (20/11): son TRASLADABLES y las fuentes consultadas
--     no coinciden en la fecha final (15 vs 17 de junio; 20 vs 23 de noviembre), en parte por
--     el cambio de reglas del Decreto 614/2025. Una fecha inventada acá precargaría a toda la
--     empresa en franco un día laborable. Se cargan cuando se confirmen en el boletín oficial.
--   · Los días no laborables con fines turísticos (23/03, 10/07, 07/12). NO son feriados: en un
--     día no laborable trabajar o no lo decide el empleador. Es una decisión de Dirección, y
--     cuando se tome se carga como alcance 'empresa'.
--   · Feriados provinciales de San Juan. No se verificaron; la tabla los espera con
--     alcance='provincial'.
insert into comunicacion.jornada_config (tipo, fecha, horas, etiqueta, alcance, creado_por, nota) values
  ('feriado', '2026-01-01', 0, 'Año Nuevo',                                         'nacional', 'migracion_20260731090000', 'Inamovible · Ley 27.399'),
  ('feriado', '2026-02-16', 0, 'Carnaval',                                          'nacional', 'migracion_20260731090000', 'Inamovible · Ley 27.399'),
  ('feriado', '2026-02-17', 0, 'Carnaval',                                          'nacional', 'migracion_20260731090000', 'Inamovible · Ley 27.399'),
  ('feriado', '2026-03-24', 0, 'Día Nacional de la Memoria por la Verdad y la Justicia', 'nacional', 'migracion_20260731090000', 'Inamovible · Ley 27.399'),
  ('feriado', '2026-04-02', 0, 'Día del Veterano y de los Caídos en la Guerra de Malvinas', 'nacional', 'migracion_20260731090000', 'Inamovible · Ley 27.399'),
  ('feriado', '2026-04-03', 0, 'Viernes Santo',                                     'nacional', 'migracion_20260731090000', 'Inamovible · Pascua 05/04/2026'),
  ('feriado', '2026-05-01', 0, 'Día del Trabajador',                                'nacional', 'migracion_20260731090000', 'Inamovible · Ley 27.399'),
  ('feriado', '2026-05-25', 0, 'Día de la Revolución de Mayo',                      'nacional', 'migracion_20260731090000', 'Inamovible · Ley 27.399'),
  ('feriado', '2026-06-20', 0, 'Paso a la Inmortalidad del Gral. Manuel Belgrano',  'nacional', 'migracion_20260731090000', 'Inamovible · cae sábado'),
  ('feriado', '2026-07-09', 0, 'Día de la Independencia',                           'nacional', 'migracion_20260731090000', 'Inamovible · Ley 27.399'),
  ('feriado', '2026-08-17', 0, 'Paso a la Inmortalidad del Gral. José de San Martín', 'nacional', 'migracion_20260731090000', 'Trasladable, pero cae lunes: sin traslado'),
  ('feriado', '2026-10-12', 0, 'Día del Respeto a la Diversidad Cultural',          'nacional', 'migracion_20260731090000', 'Trasladable, pero cae lunes: sin traslado'),
  ('feriado', '2026-12-08', 0, 'Inmaculada Concepción de María',                    'nacional', 'migracion_20260731090000', 'Inamovible · Ley 27.399'),
  ('feriado', '2026-12-25', 0, 'Navidad',                                           'nacional', 'migracion_20260731090000', 'Inamovible · Ley 27.399')
on conflict do nothing;

-- La tabla queda CREADA Y VACÍA para `config_dia` y `media_jornada` a propósito. La jornada de
-- la semana normal ya la resuelve la calibración de la planilla, que la mide sobre datos reales
-- en vez de declararla; escribir acá "lunes a jueves 9, viernes 8" duplicaría esa regla en dos
-- lugares que podrían contradecirse. Se cargan sólo cuando haya una excepción concreta.

-- ── 4. NOVEDADES DE ASISTENCIA ───────────────────────────────────────────────────────────
-- Estado ACTUAL del motivo de cada carga. No es un log: una recarga del mismo día pisa la fila
-- (el módulo escribe el valor final, no un delta). La historia de quién cambió qué y cuándo ya
-- vive en orq.events, que es append-only y es el ledger oficial — no se duplica acá.
--
-- La identidad del trabajador es `trabajador_ref`: la MISMA referencia estructural con la que
-- jornales-estructura.mjs resuelve la fila en la planilla. No se guarda un id propio de
-- trabajador: crear un padrón paralelo al de JORNALES sería inventar una segunda verdad.
create table if not exists comunicacion.asistencia_novedades (
  id                 bigint generated always as identity primary key,
  fecha_operativa    date not null,
  clave_obra         text not null,        -- obra del bloque donde está cargado
  trabajador_ref     text not null,        -- ref estructural (jornales-estructura.mjs)
  trabajador_nombre  text,                 -- para leer la auditoría sin resolver la ref
  presente           boolean not null,
  horas              numeric(5,2),
  jornada            numeric(5,2),         -- jornada vigente ese día, para poder releer el juicio
  motivo             text not null,        -- clave de MOTIVO (asistencia-motivos.mjs)
  aclaracion         text,
  obra_realizada     text,                 -- si trabajó en OTRA obra distinta a la de su bloque
  falta_injustificada boolean not null default false,
  art                boolean not null default false,  -- accidente de trabajo: dispara ART
  origen             text,                 -- 'web' | 'mattermost'
  plataforma_user_id text,                 -- quién la cargó (traza)
  plataforma_username text,
  correlation_id     uuid,
  creado_at          timestamptz not null default now(),
  actualizado_at     timestamptz not null default now(),
  constraint asistencia_novedades_motivo_no_vacio check (length(btrim(motivo)) > 0),
  constraint asistencia_novedades_horas_rango check (horas is null or (horas >= 0 and horas <= 24))
);

-- Una novedad por trabajador, obra y día: es el estado, no el historial.
create unique index if not exists asistencia_novedades_unica_idx
  on comunicacion.asistencia_novedades (fecha_operativa, clave_obra, trabajador_ref);
-- Las tres consultas que motivan la tabla: el día, la persona, y los accidentes del período.
create index if not exists asistencia_novedades_fecha_idx
  on comunicacion.asistencia_novedades (fecha_operativa desc);
create index if not exists asistencia_novedades_trabajador_idx
  on comunicacion.asistencia_novedades (trabajador_ref, fecha_operativa desc);
create index if not exists asistencia_novedades_art_idx
  on comunicacion.asistencia_novedades (fecha_operativa desc) where art;

comment on table comunicacion.asistencia_novedades is
  'POR QUÉ un trabajador no hizo su jornada completa, por (fecha, obra, trabajador). Complementa a JORNALES, que guarda sólo las HORAS: el motivo NO se escribe en la planilla para no romper las sumas de la quincena ni el camino de escritura validado. Estado actual, no historial: la traza append-only vive en orq.events.';
comment on column comunicacion.asistencia_novedades.motivo is
  'Clave estable del catálogo de orquestador/lib/asistencia-motivos.mjs (falta, enfermedad, accidente, permiso, vacaciones, suspension, franco, llego_tarde, se_retiro_antes, otro). Deliberadamente SIN FK a una tabla de motivos: las reglas del catálogo (si exige aclaración, si obliga a 0 horas, en qué contexto aplica) son comportamiento y viven en el código, en un solo lugar. Una tabla espejo sería una segunda definición del mismo concepto.';
comment on column comunicacion.asistencia_novedades.falta_injustificada is
  'SÓLO la falta lo es. Franco, vacaciones y suspensión también dan 0 horas y NO son faltas: contarlas juntas inflaría el ausentismo. Se guarda materializado para que una consulta de ausentismo no tenga que replicar la regla del catálogo.';
comment on column comunicacion.asistencia_novedades.obra_realizada is
  'Obra donde efectivamente trabajó, cuando no es la del bloque en el que está cargado. Es el insumo para imputar la HH a la obra correcta; NO mueve la fila en la planilla.';
