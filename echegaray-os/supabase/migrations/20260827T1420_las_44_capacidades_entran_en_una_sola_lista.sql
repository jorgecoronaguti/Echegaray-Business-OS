-- LAS 44 CAPACIDADES DEL OS ENTRAN EN UNA SOLA LISTA — Y SE PUEDE VER CUÁLES NO USA NADIE.
--
-- Hasta hoy las skills de `.claude/skills/` eran 44 carpetas en disco y nada más. `skill-map.mjs`
-- decide cuáles se inyectan por capacidad (alcanza a 20), `context-assembler.mjs` las lee del
-- disco, y `public.knowledge_frameworks` —la tabla que YA existía para esto— guardaba 26 filas con
-- cuatro campos: clave, nombre, objetivo, área. Con eso NO se podía contestar la pregunta que
-- importa: **qué capacidades tiene el OS, cuáles puede activar de verdad, y cuáles están escritas
-- pero no las alcanza nadie**. Medido al construir el catálogo: 6 skills tienen módulos del OS que
-- las implementan y NINGUNA capacidad que las rutee (financial-engineering, lectura-bancaria,
-- carga-gastos-multimedia, admin-finanzas-sheets, appsheet-desarrollo, cash-flow-operativo), 2 son
-- conocimiento de dominio que nadie puede activar, y 3 vinieron de una plantilla ajena que propone
-- un stack que este OS no usa.
--
-- NO se crea una tabla nueva: se COMPLETA la que existe. Todo es aditivo y con default, así que el
-- upsert de cuatro columnas de `seed-inteligencia-organizacional.mjs` sigue funcionando igual.
--
-- LA FUENTE DE VERDAD SIGUE SIENDO EL DISCO. Estas columnas son una proyección que produce
-- `orquestador/scripts/xsas-skills-sync.mjs` leyendo el frontmatter de cada SKILL.md; si alguien
-- edita una fila a mano, la próxima corrida la vuelve a poner igual al archivo. Lo que la SKILL.md
-- no declara (inputs, outputs, fuentes estructuradas) queda NULL: no se rellena con suposiciones.

alter table public.knowledge_frameworks add column if not exists descripcion      text;
alter table public.knowledge_frameworks add column if not exists tipo             text;
alter table public.knowledge_frameworks add column if not exists tools            text[];
alter table public.knowledge_frameworks add column if not exists capacidades      text[];
alter table public.knowledge_frameworks add column if not exists modulos_os       text[];
alter table public.knowledge_frameworks add column if not exists nivel_ia         text;
alter table public.knowledge_frameworks add column if not exists estado_operativo text;
alter table public.knowledge_frameworks add column if not exists motivo_estado    text;
alter table public.knowledge_frameworks add column if not exists hash             text;
alter table public.knowledge_frameworks add column if not exists bytes            integer;
alter table public.knowledge_frameworks add column if not exists sincronizado_en  timestamptz;

comment on column public.knowledge_frameworks.descripcion is
  'El `description` del frontmatter: es lo que dice CUÁNDO activarla. Es la señal de ruteo, no un resumen.';
comment on column public.knowledge_frameworks.tools is
  'El `allowed-tools` declarado. Referencia de qué necesita para operar; no es un permiso concedido.';
comment on column public.knowledge_frameworks.capacidades is
  'Las `advise.*` que la declaran, proyectadas desde CAPABILITY_SKILLS (orquestador/lib/skill-map.mjs). '
  'Vacío = ninguna capacidad la rutea: la skill existe y el OS no la puede activar sola.';
comment on column public.knowledge_frameworks.modulos_os is
  'Módulos de `orquestador/` que la skill cita Y QUE EXISTEN en disco. Es la única evidencia '
  'verificable de que hay código determinístico detrás; una cita a un archivo borrado no cuenta.';
comment on column public.knowledge_frameworks.nivel_ia is
  'ninguno = responde código, 0 API · asistido = el módulo trae el dato y el modelo lo interpreta · '
  'razonamiento = no hay código detrás, el criterio ES la respuesta. Derivado, no declarado.';
comment on column public.knowledge_frameworks.estado_operativo is
  'operativa (alguna capacidad la rutea) · parcial (hay módulo del OS pero nadie la rutea) · '
  'herramienta_cli (sirve a Claude Code, no al negocio) · huerfana (ni ruteo ni código) · '
  'legacy (ajena a este OS). Criterio verificable, no opinión: ver orquestador/lib/skill-catalogo.mjs.';
comment on column public.knowledge_frameworks.hash is
  'sha256 (16 hex) de la SKILL.md. Sirve para saber si la fila quedó vieja respecto del archivo.';

create index if not exists kf_estado_operativo_idx on public.knowledge_frameworks (estado_operativo);

-- ── MÉTRICAS POR EJECUCIÓN — sobre el instrumento que YA existe ────────────────────────────────
-- `orq.chat_request` guarda un registro por pedido con capacidad, modelo, costo, latencia y
-- desenlace. Le faltaba lo único que impedía medir por capacidad: QUÉ SKILL se activó, y si la
-- respuesta salió sin pagar modelo. No se crea una tabla de telemetría nueva — se completa ésta.
alter table orq.chat_request add column if not exists skills     text[];
alter table orq.chat_request add column if not exists resolucion text;
alter table orq.chat_request add column if not exists nivel      smallint;

comment on column orq.chat_request.skills is
  'Las skills que se activaron en el pedido (las mismas que se inyectaron al prompt). NULL = pedido '
  'anterior a esta instrumentación; {} = ninguna. NULL y {} NO significan lo mismo.';
comment on column orq.chat_request.resolucion is
  'determinista = la respuesta salió sin pagar modelo (detección 0-API, caché, tool) · llm = pagó '
  'modelo. La regla es la misma que ya usaba el contador del server (PAID_MODEL), en una sola función.';
comment on column orq.chat_request.nivel is
  'Nivel de la política de ruteo con el que se resolvió: 0 determinístico (sin modelo) · 1 capacidad '
  'XSAS (skill con motor del OS detrás) · 2 IA liviana · 3 razonamiento (ambiguo, multidominio o '
  'decisión compleja). La política vive en orquestador/lib/elegir-capacidad.mjs, en código '
  'versionado: un modelo no puede moverla solo.';

create index if not exists chat_request_skills_idx on orq.chat_request using gin (skills);

-- Uso real por skill. Las tres preguntas que había que poder contestar: cuánto se usa cada
-- capacidad, cuánto de eso se resolvió sin gastar un token, y cuánto cuesta la que sí gasta.
create or replace view orq.v_skill_uso as
select
  s.skill,
  count(*)                                                             as ejecuciones,
  count(*) filter (where cr.resolucion = 'determinista')               as sin_llm,
  count(*) filter (where cr.resolucion = 'llm')                        as con_llm,
  round(100.0 * count(*) filter (where cr.resolucion = 'determinista')
        / nullif(count(*) filter (where cr.resolucion is not null), 0), 1) as pct_sin_llm,
  count(*) filter (where cr.outcome = 'error')                         as errores,
  count(*) filter (where cr.nivel = 0)                                 as nivel_0,
  count(*) filter (where cr.nivel = 1)                                 as nivel_1,
  count(*) filter (where cr.nivel = 2)                                 as nivel_2,
  count(*) filter (where cr.nivel = 3)                                 as nivel_3,
  round(avg(cr.latency_ms))                                            as ms_promedio,
  percentile_disc(0.95) within group (order by cr.latency_ms)          as ms_p95,
  round(sum(coalesce(cr.cost_usd, 0))::numeric, 4)                     as usd,
  max(cr.created_at)                                                   as ultimo_uso
from orq.chat_request cr, unnest(cr.skills) as s(skill)
group by 1;

comment on view orq.v_skill_uso is
  'Uso, latencia, errores y costo POR SKILL. LÍMITE CONOCIDO: los tokens no se pueden atribuir a la '
  'skill — viven en orq.chat_cost, que no guarda el rid del pedido, así que no hay con qué unir las '
  'dos tablas. El costo sí sale, porque orq.chat_request lo guarda por pedido.';

-- EL CATÁLOGO Y SU USO, EN UNA SOLA CONSULTA. Una capacidad con `ejecuciones` nulo es una que
-- nadie usó nunca: o no hace falta, o el ruteo no la alcanza (mirá `estado_operativo`).
create or replace view public.v_capacidades_xsas as
select
  kf.clave, kf.nombre, kf.area, kf.tipo, kf.estado_operativo, kf.motivo_estado, kf.nivel_ia,
  kf.capacidades, kf.modulos_os, kf.tools, kf.ruta, kf.sincronizado_en,
  coalesce(u.ejecuciones, 0) as ejecuciones,
  u.sin_llm, u.con_llm, u.pct_sin_llm, u.errores, u.ms_promedio, u.ms_p95, u.usd, u.ultimo_uso,
  u.nivel_0, u.nivel_1, u.nivel_2, u.nivel_3
from public.knowledge_frameworks kf
left join orq.v_skill_uso u on u.skill = kf.clave;

comment on view public.v_capacidades_xsas is
  'Las capacidades del OS (una fila por skill) con su estado operativo y su uso real. Es la '
  'respuesta a "qué sabe hacer el OS, qué usa y qué escribió y no usa nadie".';

-- Las dos vistas quedan SIN `security_invoker` a propósito (corren como su dueño): no publican
-- ninguna fila protegida —`knowledge_frameworks` ya es legible por cualquier autenticado y lo
-- demás son agregados de telemetría, sin la directiva ni la respuesta— y con invoker fallarían,
-- porque `orq.chat_request` nació después del grant de esquema y `authenticated` no la alcanza.
grant select on orq.v_skill_uso to authenticated;
grant select on public.v_capacidades_xsas to authenticated;

-- La biblioteca por área muestra los frameworks: con el catálogo completo entran también las
-- skills metodológicas (prp, playwright, traspaso…), que NO son criterio de negocio de un área.
-- Se filtran por área nula, que es exactamente como quedan. Sin esto, la biblioteca del dueño
-- pasaría a listar "playwright cli" como framework del área — ruido en la vista que él mira.
-- (El resto de la vista queda idéntico: sólo cambia el bloque de frameworks.)
create or replace view public.biblioteca_completa as
  select area, tipo, titulo, confianza, activo, origen_id, origen_tabla, created_at
    from public.conocimiento_por_area
  union all
  select area, 'framework', nombre, null, estado = 'vigente', id::text, 'knowledge_frameworks', created_at
    from public.knowledge_frameworks where area is not null
  union all
  select area, 'playbook', nombre, severidad, estado = 'vigente', id::text, 'knowledge_playbooks', created_at
    from public.knowledge_playbooks
  union all
  select area, 'checklist', nombre, frecuencia, estado = 'vigente', id::text, 'knowledge_checklists', created_at
    from public.knowledge_checklists
  union all
  select area, 'kpi', nombre, base_contable, estado = 'vigente', id::text, 'knowledge_kpis', created_at
    from public.knowledge_kpis
  union all
  select area, 'regla', nombre, prioridad::text, estado = 'vigente', id::text, 'knowledge_decision_rules', created_at
    from public.knowledge_decision_rules
  union all
  select area, 'aprendizaje', titulo, clase, true, id::text, 'organizational_lessons', created_at
    from public.organizational_lessons
  union all
  select area, 'objetivo', titulo, horizonte, estado = 'activo', id::text, 'objetivos', created_at
    from public.objetivos
  union all
  select area, 'reunion', nombre, frecuencia, estado = 'vigente', id::text, 'operating_meeting_templates', created_at
    from public.operating_meeting_templates
  union all
  select area, 'decision', titulo, estado_aprobacion, resuelto_en is null, id::text, 'organizational_decision_cases', created_at
    from public.organizational_decision_cases;
