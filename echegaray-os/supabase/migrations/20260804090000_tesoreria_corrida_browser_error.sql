-- ============================================================================
-- UNA CORRIDA TIENE QUE PODER REGISTRAR QUE EL NAVEGADOR SE ROMPIÓ.
--
-- `tesoreria.corridas.estado` admitía siete valores y ninguno era
-- `browser_error`, que es EXACTAMENTE lo que `ciclo.mjs` devuelve cuando Chrome
-- no abre y la mitad de mercado no se puede mirar (ciclo.mjs, rama
-- `esSesion ? 'session_required' : 'browser_error'`).
--
-- ═══ QUÉ COSTABA ═══
--
-- `ciclo-tesorero.mjs` cierra la corrida con `estado: r.estado`. Con el
-- navegador caído, ese update violaba el check, la excepción salía por el
-- `catch` de `main()` y `cerrarCorrida` no llegaba a correr NUNCA. Resultado:
-- la fila quedaba `en_curso` para siempre —`resumenAnterior` sólo mira
-- ('ok','session_required')—, la corrida siguiente se creía la primera, y el
-- único rastro de que el navegador estaba roto se perdía. El ledger no podía
-- registrar su propio fracaso, que es justo para lo que existe.
--
-- ═══ POR QUÉ SE RECREA EL CHECK Y NO SE EDITA LA MIGRACIÓN VIEJA ═══
--
-- `20260801170000_tesoreria_inversor.sql` ya está aplicada. Editarla dejaría al
-- repo diciendo una cosa y a la base otra, y nadie se enteraría hasta el próximo
-- deploy limpio. La lista completa vive en `orquestador/lib/tesoreria/ledger.mjs`
-- (`ESTADOS_CORRIDA`) y un test compara las dos.
--
-- LO QUE SIGUE PROHIBIDO: `ejecutada`. Este agente NO opera —no compra, no
-- suscribe, no transfiere—, así que una corrida no puede declararse ejecutada.
-- Esa exclusión es la que hace que el check valga la pena y no se toca.
-- ============================================================================

alter table tesoreria.corridas drop constraint if exists corridas_estado_check;

alter table tesoreria.corridas
  add constraint corridas_estado_check
  check (estado in ('en_curso','ok','sin_dato','session_required','browser_error','error','omitida'));

comment on column tesoreria.corridas.estado is
  'Estado terminal de la corrida. La lista viva está en orquestador/lib/tesoreria/ledger.mjs · ESTADOS_CORRIDA, y un test la compara contra este check. NUNCA incluye "ejecutada": el agente no opera.';
