-- Rollback de 20260713120000_orq_organizacion_ia.sql (Etapa 4 — Organización IA).
-- Aditivo/reversible. No borra datos de negocio. Devuelve el registro y las vistas
-- al estado de Etapa 3.

-- vistas aditivas de Etapa 4 (public.orq_direction NO se tocó en la migración)
drop view if exists public.orq_org;
drop view if exists public.orq_objective_closure;

-- deshacer membresía del organigrama de los agentes preexistentes
update orq.agents set org_title = null, org_order = null
 where slug in ('director-general','software-architect','implementer');

-- borrar rutas, capacidades de agente, agentes y principals de los 9 especialistas
delete from orq.model_routes
 where scope = 'capability' and match_key in
   ('advise.finance','advise.accounting','advise.procurement','advise.commercial',
    'advise.engineering','advise.architecture','advise.civil','advise.legal','advise.hr');

delete from orq.agents
 where slug in ('cfo','contador','compras','comercial','ingenieria','arquitecto',
                'ingeniero-civil','abogado','rrhh');            -- cascada a agent_capabilities

delete from orq.principals
 where slug in ('agent:cfo','agent:contador','agent:compras','agent:comercial','agent:ingenieria',
                'agent:arquitecto','agent:ingeniero-civil','agent:abogado','agent:rrhh');

delete from orq.capabilities
 where slug in ('advise.finance','advise.accounting','advise.procurement','advise.commercial',
                'advise.engineering','advise.architecture','advise.civil','advise.legal','advise.hr');

-- quitar columnas de organigrama
alter table orq.agents drop column if exists org_title;
alter table orq.agents drop column if exists org_order;
