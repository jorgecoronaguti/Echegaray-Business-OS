-- Rollback de 20260715130000_orq_organizacion_completa.sql
-- Elimina los 8 especialistas nuevos y sus capacidades/rutas. Reversible y acotado:
-- no toca los 11 especialistas de la Etapa 4 ni ningún estado del Work Fabric.
do $$
declare
  v_tenant uuid;
  v_slugs  text[] := array['presupuestador','calidad','jefe-obra','equipos','fiscal','administracion','seguridad','continuidad-datos'];
  v_caps   text[] := array['advise.estimating','advise.quality','advise.site','advise.equipment','advise.tax','advise.admin','advise.safety','advise.data'];
begin
  select id into v_tenant from orq.tenants where slug = 'echegaray';

  delete from orq.model_routes
   where tenant_id = v_tenant and scope = 'capability' and match_key = any(v_caps);

  delete from orq.agent_capabilities
   where agent_id in (select id from orq.agents where tenant_id = v_tenant and slug = any(v_slugs));

  delete from orq.agents      where tenant_id = v_tenant and slug = any(v_slugs);
  delete from orq.principals   where tenant_id = v_tenant and slug = any(select 'agent:'||s from unnest(v_slugs) s);
  delete from orq.capabilities where slug = any(v_caps);
end $$;
