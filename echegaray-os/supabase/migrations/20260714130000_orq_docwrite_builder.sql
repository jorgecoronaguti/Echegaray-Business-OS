-- ============================================================================
-- CORRECTIVA — Fijar doc.write en el Builder (claude-cli)
-- ----------------------------------------------------------------------------
-- Cambio MÍNIMO de dato: agrega ruta explícita para la capacidad 'doc.write'
-- hacia engine='claude-cli', para que NO herede el default '*' (anthropic-api).
-- No toca ningún otro ruteo, no cambia arquitectura, no crea tablas.
--
-- Consistencia con las rutas técnicas existentes (read.analyze): prioridad 50
-- (primaria, haiku) + 100 (fallback, sonnet), con los mismos techos de costo.
-- Idempotente (ON CONFLICT DO NOTHING) y reversible (rollback abajo).
-- ============================================================================

insert into orq.model_routes (tenant_id, scope, match_key, priority, engine, model, max_cost_usd)
select t.tenant_id, 'capability', 'doc.write', v.priority, 'claude-cli', v.model, v.max_cost
  from (select distinct tenant_id from orq.model_routes) t
  cross join (values (50, 'haiku', 0.15), (100, 'sonnet', 0.50)) as v(priority, model, max_cost)
 on conflict (tenant_id, scope, match_key, priority) do nothing;

-- ============================================================================
-- ROLLBACK (manual):
--   delete from orq.model_routes where scope='capability' and match_key='doc.write';
-- ============================================================================
