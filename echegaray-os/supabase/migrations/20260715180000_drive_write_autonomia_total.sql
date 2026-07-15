-- ============================================================================
-- Autonomía TOTAL en escrituras de Drive (decisión del dueño 2026-07-15)
-- ----------------------------------------------------------------------------
-- El OS actúa como el usuario (OAuth por usuario, PRP-024): escribir en SU propio
-- Drive NO es un efecto externo (económico/fiscal/legal), es una operación interna
-- reversible (historial de versiones + papelera). Por eso drive.write pasa de Nivel E
-- (requiere aprobación) a Nivel C automático. El borrado PERMANENTE (drive.delete)
-- queda prohibido (irreversible) — la baja a papelera (drive.write) sí es automática.
-- ============================================================================

update orq.capabilities
   set disposition_override = 'auto',
       required_clearance   = 'C',
       blast_radius         = 'low'
 where slug = 'drive.write';

-- drive.delete permanece forbidden (irreversible) — no se toca.
