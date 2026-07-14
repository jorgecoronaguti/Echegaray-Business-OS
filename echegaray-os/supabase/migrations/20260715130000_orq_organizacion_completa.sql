-- ============================================================================
-- ORGANIZACIÓN IA COMPLETA — 8 especialistas nuevos. Aditivo y reversible.
-- ----------------------------------------------------------------------------
-- Completa el organigrama de la constructora: cada función real tiene su agente.
-- Reutiliza TODO lo existente (Etapa 4): el handler 'specialist' es genérico, la
-- carga de skills la decide skill-map por capability, y el Director consolida.
-- NO crea tablas, estados, colas ni motores nuevos.
--
-- Nuevos (org_order 12–19, todos clearance C = analizar/preparar/recomendar, A–C):
--   12 Presupuestador · 13 Calidad · 14 Jefe de Obra · 15 Equipos y Flota ·
--   16 Fiscal · 17 Administración · 18 Seguridad e Higiene · 19 Continuidad de Datos
--
-- Diferencias respecto de la Etapa 4:
--   * Las rutas de modelo se insertan directo en 'anthropic-api' (estándar actual
--     de razonamiento tras el desacople 20260714120000), no 'claude-cli'.
--   * default_engine del agente = 'anthropic-api' desde el alta.
--
-- GAP declarado (no fabricado): "Equipos y Flota" no tiene skill de dominio propia.
--   Interino: skill-map lo cubre con costos-presupuestacion + administracion-operativa.
--   Queda como gap_skill a resolver (crear 'equipos-flota-construccion').
--
-- Rollback: orquestador/db/rollback/0006_organizacion_completa_down.sql
-- ============================================================================

-- --- Capacidades de dominio nuevas (una por especialista) --------------------
-- Nivel C (analizar/preparar/recomendar), blast low, idempotente. El trabajo con
-- efecto económico/fiscal/legal real sigue siendo Nivel E (approval_request).
insert into orq.capabilities
  (slug, domain, description, required_clearance, blast_radius, idempotency, agent_role) values
  ('advise.estimating', 'presupuestacion', 'Analizar cómputo, presupuestación y costo de insumo para cotizar; recomendar precio/margen. No cotiza en firme.', 'C','low','idempotent','presupuestador'),
  ('advise.quality',    'calidad',         'Analizar control de calidad: ensayos, tolerancias y no conformidades; recomendar tratamiento. No certifica.',      'C','low','idempotent','calidad'),
  ('advise.site',       'obra',            'Analizar coordinación de obra, avance de sitio y problemas de ejecución; recomendar. No ejecuta obra.',            'C','low','idempotent','jefe-obra'),
  ('advise.equipment',  'equipos',         'Analizar equipos y flota: utilización, mantenimiento y costo por equipo; recomendar. No compra ni asigna.',        'C','low','idempotent','equipos'),
  ('advise.tax',        'fiscal',          'Analizar IVA, Ingresos Brutos (San Juan), Ganancias y retenciones; recomendar. Verifica norma vigente. No liquida.', 'C','low','idempotent','fiscal'),
  ('advise.admin',      'administracion',  'Analizar orden documental, organismos (IERIC/UOCRA/ARCA/estudio) y comprobantes; recomendar. No ejecuta trámites.', 'C','low','idempotent','administracion'),
  ('advise.safety',     'seguridad',       'Analizar seguridad e higiene: ART, EPP, capacitaciones, incidentes y pliegos SSMA; recomendar. No habilita obra.',  'C','low','idempotent','seguridad'),
  ('advise.data',       'datos',           'Analizar frescura, cobertura y reconciliación de fuentes de datos; recomendar y preparar. No sobrescribe fuentes.',  'C','low','idempotent','continuidad-datos')
on conflict (slug) do nothing;

-- ============================================================================
-- SEEDS — 8 especialistas (principal + agente + capacidades + rutas anthropic-api)
-- ============================================================================
do $$
declare
  v_tenant uuid;
  v_princ  uuid;
  v_agent  uuid;
  rec record;
begin
  select id into v_tenant from orq.tenants where slug = 'echegaray';

  for rec in
    select * from (values
      ('presupuestador',    'Presupuestador IA',     12, 'advise.estimating',
       'Cómputo, presupuestación y análisis de costo de insumo para cotizar una obra; recomienda precio/margen. No cotiza en firme.',
       'costos-presupuestacion'),
      ('calidad',           'Calidad IA',            13, 'advise.quality',
       'Control de calidad de obra: ensayos, tolerancias, no conformidades y pliegos de calidad del cliente; recomienda. No certifica.',
       'calidad-obra'),
      ('jefe-obra',         'Jefe de Obra IA',       14, 'advise.site',
       'Dirección y coordinación de obra en sitio: frentes, avance, relación con el cliente en obra y resolución de problemas; recomienda. No ejecuta.',
       'direccion-obra'),
      ('equipos',           'Equipos y Flota IA',    15, 'advise.equipment',
       'Equipos, vehículos y herramientas: utilización, mantenimiento y costo por equipo; recomienda. No compra ni asigna. (Skill dedicada pendiente: gap_skill.)',
       'costos-presupuestacion'),
      ('fiscal',            'Fiscal IA',             16, 'advise.tax',
       'Impuestos: IVA, Ingresos Brutos (San Juan), Ganancias, retenciones y vencimientos; recomienda. Verifica norma vigente. No liquida ni presenta.',
       'impuestos-construccion'),
      ('administracion',    'Administración IA',     17, 'advise.admin',
       'Administración operativa: orden documental, relación con IERIC/UOCRA/ARCA/estudio contable, caja chica y comprobantes; recomienda. No ejecuta trámites.',
       'administracion-operativa-construccion'),
      ('seguridad',         'Seguridad e Higiene IA', 18, 'advise.safety',
       'Seguridad e Higiene y ART: EPP, capacitaciones, incidentes y pliegos SSMA del cliente (ARCOR); recomienda. No habilita obra.',
       'seguridad-higiene-art'),
      ('continuidad-datos', 'Continuidad de Datos IA', 19, 'advise.data',
       'Continuidad y confiabilidad del dato: frescura, cobertura y reconciliación de fuentes (Drive↔OS); recomienda y prepara. No sobrescribe fuentes.',
       'lectura-drive-documentos-multiformato')
    ) as t(slug, org_title, org_order, cap, descr, skill)
  loop
    insert into orq.principals (tenant_id, kind, slug, display_name, rol, clearance)
    values (v_tenant, 'agent', 'agent:'||rec.slug, rec.org_title, rec.org_title, 'C')
    on conflict (tenant_id, slug) do update set rol = excluded.rol, clearance = excluded.clearance
    returning id into v_princ;

    insert into orq.agents (tenant_id, principal_id, slug, role, description, context_ref,
                            default_engine, default_model, max_cost_usd_per_task, max_cost_usd_per_day,
                            max_concurrent, org_title, org_order)
    values (v_tenant, v_princ, rec.slug, rec.org_title, rec.descr,
            'echegaray-os/.claude/skills/'||rec.skill, 'anthropic-api', 'sonnet', 1.00, 12.0, 1, rec.org_title, rec.org_order)
    on conflict (tenant_id, slug) do update
      set role = excluded.role, description = excluded.description, context_ref = excluded.context_ref,
          default_engine = excluded.default_engine, org_title = excluded.org_title, org_order = excluded.org_order
    returning id into v_agent;

    -- capacidad primaria de dominio + auxiliares de lectura/documentación
    insert into orq.agent_capabilities (agent_id, capability_slug)
    select v_agent, unnest(array[rec.cap, 'read.analyze', 'doc.write', 'knowledge.write_memory'])
    on conflict do nothing;

    -- rutas de modelo del dominio: anthropic-api (estándar de razonamiento actual)
    insert into orq.model_routes (tenant_id, scope, match_key, priority, engine, model, max_cost_usd) values
      (v_tenant, 'capability', rec.cap,  50, 'anthropic-api', 'sonnet', 1.00),
      (v_tenant, 'capability', rec.cap, 100, 'anthropic-api', 'opus',   2.00)
    on conflict (tenant_id, scope, match_key, priority) do nothing;
  end loop;
end $$;
