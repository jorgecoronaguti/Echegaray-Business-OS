-- CALENDARIO COMPLETO — feriado, día no laborable, y de qué norma sale cada uno.
--
-- ADITIVA sobre 20260731090000, que ya está en producción y NO se toca. Todo lo de acá es
-- `add column if not exists`, `create table if not exists`, `insert ... on conflict do nothing`
-- y un `update` acotado a las filas que sembró aquella migración. Ningún drop, ningún alter
-- destructivo, ninguna fila de una persona modificada.
--
-- ── QUÉ FALTABA Y POR QUÉ IMPORTA ────────────────────────────────────────────────────────
-- La v1 modeló una sola cosa: el FERIADO, con 0 horas. Alcanza para el 1° de mayo y es ciega a
-- las otras tres figuras que un obrador de San Juan vive todos los años, y que NO son lo mismo:
--
--   · FERIADO NACIONAL INAMOVIBLE — se celebra en su fecha, siempre. No se trabaja; si se
--     trabaja, se paga doble (LCT art. 166).
--   · FERIADO NACIONAL TRASLADABLE — el Poder Ejecutivo puede correrlo. La consecuencia
--     laboral es idéntica a la del inamovible; lo que cambia es la FECHA, y por eso hay que
--     poder distinguirlo: el día que se traslada, el calendario del año siguiente no se puede
--     copiar del anterior.
--   · DÍA NO LABORABLE — trabajar o no lo decide el EMPLEADOR (LCT art. 167). Si se trabaja se
--     paga simple; si el empleador opta por no trabajar, el jornal se paga igual. Para una
--     constructora privada esto NO es un feriado: por defecto la obra trabaja.
--   · FERIADO / ASUETO PROVINCIAL — San Juan. El asueto por la Fundación de la Ciudad alcanza a
--     la administración pública provincial; para el sector privado se comporta como día no
--     laborable y NO se paga doble.
--
-- Meter las cuatro en el mismo cajón "feriado = 0 horas" precargaría a toda la cuadrilla en
-- franco un día en que la obra trabaja. Ese es exactamente el error que esta migración evita.
--
-- ── LA REGLA SIGUE SIENDO DATO, NO CÓDIGO ────────────────────────────────────────────────
-- Se agregan DOS catálogos (`jornada_alcance`, `jornada_clase`) con el mismo criterio con que
-- 20260731090000 creó `jornada_tipo_regla`: integridad referencial para que un 'provinicial'
-- no entre y falle en silencio, y extensibilidad por INSERT en vez de por despliegue.
--
-- ── VERIFICACIÓN DE LAS FECHAS ───────────────────────────────────────────────────────────
-- Cada fila sembrada acá lleva su fundamento en `nota`, verificado en la sesión contra fuente
-- oficial o normativa citada. Ninguna se dedujo de memoria. Las que NO se pudieron verificar
-- no se siembran: una fecha equivocada precarga a toda la empresa en franco un día laborable.

-- ── 1. UN TIPO DE REGLA NUEVO: DÍA NO LABORABLE ──────────────────────────────────────────
-- `decide_empleador` es la diferencia operativa entre feriado y día no laborable, y vive en el
-- catálogo de tipos (no en cada fila) porque es una propiedad del TIPO, no del día concreto.
alter table comunicacion.jornada_tipo_regla
  add column if not exists decide_empleador boolean not null default false;

comment on column comunicacion.jornada_tipo_regla.decide_empleador is
  'true = trabajar o no ese día lo decide el empleador (LCT art. 167). El módulo NO precarga 0 horas: precarga la jornada normal y avisa, porque para una constructora privada el default legal es que se trabaja.';

-- Prioridad 15: entre `feriado` (10) y `media_jornada` (20). Si una fecha es feriado Y día no
-- laborable a la vez —pasa: en 2026 el Jueves Santo cae el 2 de abril, que es el feriado
-- inamovible de Malvinas— gana el feriado, que es la figura más restrictiva.
insert into comunicacion.jornada_tipo_regla (tipo, prioridad, descripcion, decide_empleador) values
  ('dia_no_laborable', 15,
   'Día no laborable: trabajar o no lo decide el empleador (LCT art. 167). Incluye los turísticos del PEN, el Jueves Santo, el día del gremio y los asuetos provinciales.',
   true)
on conflict (tipo) do nothing;

-- ── 2. DE QUÉ JURISDICCIÓN SALE LA REGLA ─────────────────────────────────────────────────
create table if not exists comunicacion.jornada_alcance (
  alcance     text primary key,
  descripcion text not null,
  orden       int  not null default 100,
  creado_at   timestamptz not null default now()
);

insert into comunicacion.jornada_alcance (alcance, descripcion, orden) values
  ('nacional',   'Norma nacional: Ley 27.399 y los decretos y resoluciones que la aplican.',        10),
  ('provincial', 'Norma de la Provincia de San Juan (jurisdicción operativa de la empresa).',       20),
  ('municipal',  'Norma del municipio donde está la obra. Varía obra por obra.',                    30),
  ('gremial',    'Convenio colectivo de la construcción (CCT 76/75, UOCRA).',                       40),
  ('empresa',    'Decisión propia de Echegaray: no sale de ninguna norma externa.',                 50)
on conflict (alcance) do nothing;

-- Cualquier valor de `alcance` que ya exista en la tabla entra al catálogo tal cual, para que
-- la clave foránea de abajo no pueda fallar sobre datos que ya están en producción.
insert into comunicacion.jornada_alcance (alcance, descripcion, orden)
select distinct c.alcance,
       'Valor preexistente en jornada_config al momento de crear el catálogo. Revisar y describir.',
       900
  from comunicacion.jornada_config c
 where c.alcance is not null
on conflict (alcance) do nothing;

alter table comunicacion.jornada_config drop constraint if exists jornada_config_alcance_fk;
alter table comunicacion.jornada_config
  add  constraint jornada_config_alcance_fk
  foreign key (alcance) references comunicacion.jornada_alcance(alcance);

comment on table comunicacion.jornada_alcance is
  'Jurisdicción de la que sale una regla de jornada. Existe para dar integridad referencial a jornada_config.alcance: sin la FK, un ''provinicial'' entraría y la regla se leería mal para siempre.';

-- ── 3. QUÉ FIGURA JURÍDICA ES ────────────────────────────────────────────────────────────
-- `alcance` dice DE DÓNDE sale la regla; `clase` dice QUÉ ES. Son dos preguntas distintas: el
-- Jueves Santo es nacional y no laborable; la Fundación de San Juan es provincial y no
-- laborable; Navidad es nacional e inamovible.
create table if not exists comunicacion.jornada_clase (
  clase       text primary key,
  descripcion text not null,
  norma       text,
  orden       int  not null default 100,
  creado_at   timestamptz not null default now()
);

insert into comunicacion.jornada_clase (clase, descripcion, norma, orden) values
  ('inamovible',
   'Feriado nacional que se celebra siempre en su fecha. No se trabaja; si se trabaja, se paga doble.',
   'Ley 27.399, art. 1 · LCT art. 166', 10),
  ('trasladable',
   'Feriado nacional que el Poder Ejecutivo puede correr y que este año quedó en su fecha original (cayó lunes, o no se trasladó).',
   'Ley 27.399, arts. 2 y 7', 20),
  ('trasladado',
   'Feriado nacional trasladable efectivamente corrido a otra fecha. La nota indica desde qué día se movió.',
   'Ley 27.399, art. 7 · Decreto 614/2025', 30),
  ('turistico',
   'Día no laborable con fines turísticos. El PEN fija hasta tres por año, siempre lunes o viernes. Alcanza al sector público; en el privado decide el empleador.',
   'Ley 27.399, art. 7 · LCT art. 167', 40),
  ('no_laborable_ley',
   'Día no laborable fijado por la propia ley de feriados (Jueves Santo). Trabajar o no lo decide el empleador; se paga simple.',
   'Ley 27.399, art. 4 · LCT art. 167', 50),
  ('no_laborable_cct',
   'Día no laborable PAGO del convenio de la construcción. Si se convoca a la obra corresponde pago doble.',
   'CCT 76/75 (UOCRA), art. 19', 60),
  ('asueto_administrativo',
   'Asueto de una administración pública (provincial o municipal). Alcanza a los empleados públicos; para el sector privado se comporta como día no laborable y NO se paga doble.',
   'Decreto provincial o municipal', 70)
on conflict (clase) do nothing;

alter table comunicacion.jornada_config add column if not exists clase text;
alter table comunicacion.jornada_config drop constraint if exists jornada_config_clase_fk;
alter table comunicacion.jornada_config
  add  constraint jornada_config_clase_fk
  foreign key (clase) references comunicacion.jornada_clase(clase);

comment on column comunicacion.jornada_config.clase is
  'Figura jurídica de la regla: inamovible, trasladable, trasladado, turístico, no laborable por ley, no laborable por CCT, asueto administrativo. Distinta de `alcance`, que dice de qué jurisdicción sale. NULL en una fila de empresa que no responde a ninguna norma externa.';

comment on table comunicacion.jornada_clase is
  'Catálogo de figuras jurídicas de una regla de jornada, con la norma que las sostiene. Es DATO: agregar una figura nueva es insertar una fila.';

-- ── 4. CLASIFICAR LOS 14 FERIADOS QUE YA ESTABAN ─────────────────────────────────────────
-- Acotado por `creado_por` a las filas que sembró 20260731090000 y a las que todavía no tienen
-- clase: si alguien ya editó o clasificó una fila a mano, no se la toca.
update comunicacion.jornada_config c
   set clase = v.clase, actualizado_at = now()
  from (values
    ('2026-01-01'::date, 'inamovible'),
    ('2026-02-16'::date, 'inamovible'),
    ('2026-02-17'::date, 'inamovible'),
    ('2026-03-24'::date, 'inamovible'),
    ('2026-04-02'::date, 'inamovible'),
    ('2026-04-03'::date, 'inamovible'),
    ('2026-05-01'::date, 'inamovible'),
    ('2026-05-25'::date, 'inamovible'),
    ('2026-06-20'::date, 'inamovible'),
    ('2026-07-09'::date, 'inamovible'),
    ('2026-08-17'::date, 'trasladable'),
    ('2026-10-12'::date, 'trasladable'),
    ('2026-12-08'::date, 'inamovible'),
    ('2026-12-25'::date, 'inamovible')
  ) as v(fecha, clase)
 where c.creado_por = 'migracion_20260731090000'
   and c.tipo  = 'feriado'
   and c.fecha = v.fecha
   and c.clase is null;

-- ── 5. LOS DOS TRASLADABLES QUE FALTABAN, YA VERIFICADOS ─────────────────────────────────
-- 20260731090000 los dejó afuera a propósito porque las fuentes discrepaban. Se verificaron:
--   · Güemes: fecha original miércoles 17/06/2026. Ley 27.399 art. 7 manda los trasladables que
--     caen martes o miércoles al LUNES ANTERIOR → lunes 15/06/2026. Confirmado por el
--     calendario oficial y por la prensa nacional del 01/06/2026, que ya lo reporta ejecutado.
--   · Soberanía Nacional: fecha original viernes 20/11/2026. El mismo art. 7 manda los que caen
--     jueves o viernes al LUNES SIGUIENTE → lunes 23/11/2026.
-- El Decreto 614/2025 —el que sembró la duda— NO cambia estas dos: sólo habilita a mover los
-- trasladables que caen SÁBADO O DOMINGO al lunes siguiente o al viernes anterior. Ninguno de
-- los dos cae fin de semana, así que rige la regla de la ley y la fecha queda determinada.
insert into comunicacion.jornada_config (tipo, fecha, horas, etiqueta, alcance, clase, creado_por, nota) values
  ('feriado', '2026-06-15', 0, 'Paso a la Inmortalidad del Gral. Martín Miguel de Güemes', 'nacional', 'trasladado', 'migracion_20260731120000',
   'Trasladado desde el miércoles 17/06/2026 al lunes anterior · Ley 27.399 art. 7'),
  ('feriado', '2026-11-23', 0, 'Día de la Soberanía Nacional',                             'nacional', 'trasladado', 'migracion_20260731120000',
   'Trasladado desde el viernes 20/11/2026 al lunes siguiente · Ley 27.399 art. 7')
on conflict do nothing;

-- ── 6. DÍAS NO LABORABLES ────────────────────────────────────────────────────────────────
-- `horas` en NULL a propósito, y no en 0. Cero sería afirmar que la obra no trabaja, y eso no
-- es cierto: en un día no laborable el default legal del sector privado es que se trabaja
-- (LCT art. 167). NULL deja que decida la calibración de la planilla —jornada normal— mientras
-- la etiqueta y la nota viajan hasta la pantalla para que el jefe vea de qué día se trata.
insert into comunicacion.jornada_config (tipo, fecha, horas, etiqueta, alcance, clase, creado_por, nota) values
  ('dia_no_laborable', '2026-03-23', null, 'Día no laborable turístico',              'nacional',   'turistico',        'migracion_20260731120000',
   'Resolución 164/2025 JGM (BO 26/12/2025) · lunes previo al feriado del 24/03. Decide el empleador'),
  ('dia_no_laborable', '2026-07-10', null, 'Día no laborable turístico',              'nacional',   'turistico',        'migracion_20260731120000',
   'Resolución 164/2025 JGM (BO 26/12/2025) · viernes posterior al feriado del 09/07. Decide el empleador'),
  ('dia_no_laborable', '2026-12-07', null, 'Día no laborable turístico',              'nacional',   'turistico',        'migracion_20260731120000',
   'Resolución 164/2025 JGM (BO 26/12/2025) · lunes previo al feriado del 08/12. Decide el empleador'),
  ('dia_no_laborable', '2026-04-02', null, 'Jueves Santo',                            'nacional',   'no_laborable_ley', 'migracion_20260731120000',
   'Ley 27.399 art. 4 · en 2026 cae el mismo día que el feriado inamovible de Malvinas, que tiene prioridad y gana'),
  ('dia_no_laborable', '2026-04-22', null, 'Día del Trabajador de la Construcción',   'gremial',    'no_laborable_cct', 'migracion_20260731120000',
   'CCT 76/75 (UOCRA) art. 19 · día pago no laborable del gremio; si se convoca a la obra corresponde pago doble. Sin horas a propósito: cómo se carga en JORNALES lo decide Dirección'),
  ('dia_no_laborable', '2026-06-13', null, 'Fundación de la Ciudad de San Juan',      'provincial', 'asueto_administrativo', 'migracion_20260731120000',
   'Asueto de la administración pública de San Juan · para el sector privado es día no laborable y NO se paga doble. En 2026 cae sábado')
on conflict do nothing;

-- ── 7. LA OBRA PARADA NO ES AUSENTISMO ───────────────────────────────────────────────────
-- `falta_injustificada` y `art` ya se guardan materializados para que una consulta no tenga
-- que replicar la regla del catálogo. Falta la tercera lectura, que es la de PRODUCCIÓN: los
-- días en que el trabajador SE PRESENTÓ y la obra no produjo —lluvia, falta de material, paro—.
-- Hoy esos días están indistinguibles de una ausencia, y mezclados inflan el ausentismo hacia
-- arriba y dejan el desvío de plazo sin ninguna causa registrada.
alter table comunicacion.asistencia_novedades
  add column if not exists paraliza_obra boolean not null default false;

comment on column comunicacion.asistencia_novedades.paraliza_obra is
  'La obra no produjo y NO fue porque faltara la persona: estaba y no hubo trabajo (lluvia, sin material, paro). Sale de `novedad.paraliza_obra` del catálogo de orquestador/lib/asistencia-motivos.mjs — quien escriba esta tabla tiene que mapearlo, igual que falta_injustificada y art. Separa la lectura de personas de la de producción.';

comment on column comunicacion.asistencia_novedades.motivo is
  'Clave estable del catálogo de orquestador/lib/asistencia-motivos.mjs. Deliberadamente SIN FK a una tabla de motivos: las reglas del catálogo (si exige aclaración, si obliga a 0 horas, en qué contexto aplica) son comportamiento y viven en el código, en un solo lugar. Una tabla espejo sería una segunda definición del mismo concepto. El catálogo crece: cualquier lista de claves que se escriba en una consulta queda vieja, hay que pedírsela al módulo.';

-- ── QUÉ QUEDÓ AFUERA, Y POR QUÉ ──────────────────────────────────────────────────────────
--   · Otros feriados provinciales de San Juan además del 13/06. No se encontró un listado
--     oficial de la Provincia que los enumere para 2026. La tabla los espera con
--     alcance='provincial'; se cargan cuando aparezca la norma, no antes.
--   · Feriados municipales (patronales del departamento donde está cada obra). Dependen de la
--     UBICACIÓN de la obra, no de la empresa: una regla global los aplicaría a obras que no
--     corresponden. Necesitan otro modelo (regla por obra) y una decisión de Dirección.
--   · Los días no laborables por credo (Ley 24.571 judíos, Ley 24.757 islámicos). NO son del
--     calendario de la empresa: son personales, de cada trabajador que profesa ese culto. Se
--     registran como novedad individual (motivo `licencia_especial`), no como regla del día.
--   · 24 y 31 de diciembre. Son asuetos que el Gobierno decreta año a año para la
--     administración pública, y para Echegaray son una decisión propia de Dirección. Cuando se
--     tome, se cargan como tipo `media_jornada`, alcance `empresa`.
