-- EL CONTRATADO DE UNA OBRA ES UNO SOLO: la página Obras lee la misma base que el CRM.
--
-- «hay obras que no están reflejando el monto cotizado ni el costo de mat o mo en app.ecsas.com.ar»
-- (dueño, 14/09/2026).
--
-- ═══ EL DEFECTO, MEDIDO (solo lectura, 14/09/2026) ═══
--
-- `obra_panel.monto_contratado` y `obra_economia.venta_contratada` son `contratado_de_obra()`, que leía
-- SÓLO `obra_canonica.monto_contratado` (el campo del formulario). Las obras ACTIVAS tienen el precio en
-- OBRAS (`obra_economia_cartera`) y el formulario vacío: en Obras se veían sin contratado (ME - PLAYÓN DE
-- AZUFRE $102,5 M, SF - PISOS INDUSTRIALES $47,6 M, QP - SALÓN COMERCIAL $139,1 M) mientras el CRM las
-- mostraba. Y el margen cotizado de Obras quedaba en null por la misma razón.
--
-- ═══ LA REGLA, UNA VEZ ═══
--
--   1. contrato desglosado valuado (`obra_economia_cartera.contrato_total` > 0) — la base del CRM;
--   2. lo que publica OBRAS (`obra_economia_cartera.contratado`);
--   3. recién sin fila en OBRAS, el campo del formulario (`obra_canonica.monto_contratado`).
--
-- 1 y 2 son exactamente `baseContractualDe` / `baseDelContrato` del CRM: en las obras con OBRAS, las dos
-- pantallas publican el mismo número. `contratado_de_obra_fuente()` dice cuál de las tres respondió.
--
-- ═══ LO QUE ESTA MIGRACIÓN NO DECIDE ═══
--
-- El CRM sigue SIN usar el formulario (H1, 10/09/2026, con tests): una obra cerrada que no está en OBRAS
-- se ve «sin precio» en la ficha y la cartera, y en Obras muestra el monto del formulario, como hasta hoy.
-- Si ese monto vale como contratado en el CRM lo decide el dueño: entrar a `obra_economia_cartera`
-- movería también `obra_cuenta` (saldos de cobranza) y `cliente_economia`.

CREATE OR REPLACE FUNCTION public.contratado_de_obra(p_obra text)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when public.ve_economia() or auth.uid() is null then (
    select coalesce(
             -- 1. EL CONTRATO DESGLOSADO: un total de cero no es una base (la regla del CRM).
             (select case when e.contrato_total > 0 then e.contrato_total end
                from public.obra_economia_cartera e where e.obra_canonica_id = p_obra),
             -- 2. LO QUE PUBLICA OBRAS, valuado al dólar de hoy si el contrato es en U$S.
             (select e.contratado from public.obra_economia_cartera e where e.obra_canonica_id = p_obra),
             -- 3. EL FORMULARIO DE LA OBRA: último respaldo, sólo sin fila en OBRAS.
             (select oc.monto_contratado from public.obra_canonica oc where oc.id = p_obra))
  ) end
$function$;

CREATE OR REPLACE FUNCTION public.contratado_de_obra_fuente(p_obra text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when public.ve_economia() or auth.uid() is null then (
    select case
             when e.contrato_total > 0 then 'contrato'
             -- el `origen` de OBRAS: oc-pesos · oc-usd-x-tc · oc-cliente · suma-viva
             when e.contratado is not null then coalesce(e.origen, 'obras')
             when oc.monto_contratado is not null then 'formulario'
           end
      from public.obra_canonica oc
      left join public.obra_economia_cartera e on e.obra_canonica_id = oc.id
     where oc.id = p_obra)
  end
$function$;

revoke all on function public.contratado_de_obra_fuente(text) from public, anon;
grant execute on function public.contratado_de_obra_fuente(text) to authenticated, service_role;

comment on function public.contratado_de_obra(text) is
  'LA BASE CONTRACTUAL DE UNA OBRA (20260915T0820): contrato_total > 0 → contratado de OBRAS → '
  'formulario. La leen obra_panel.monto_contratado y obra_economia.venta_contratada.';

notify pgrst, 'reload schema';
