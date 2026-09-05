-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA CUENTA CORRIENTE DEL CLIENTE NO SE VEÍA — Y LA POLICY DECÍA QUE SÍ
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Lo encontró la pasada visual del 05/09/2026, entrando a la ficha de un cliente como DIRECCIÓN —el
-- rol de mayor jerarquía— y mirando la pantalla, no el código: la cara «Cuenta corriente» venía
-- vacía. Contra la base, con el token real, el motivo:
--
--     permission denied for table cobranzas   ·   42501
--
-- ═══ POR QUÉ NADIE LO VIO ANTES ═══
--
-- Porque `public.cobranzas` tenía las dos cosas mal, y cada una TAPABA a la otra:
--
--   · La policy `cobranzas_select` decía `USING (true)`. Leído solo, eso dice «lo ve cualquiera».
--   · No había ningún GRANT a `authenticated`. Leído solo, eso dice «no lo ve nadie».
--
-- Postgres resuelve primero el GRANT: sin permiso de tabla, la policy ni se evalúa. Es la trampa
-- que este repo ya tenía escrita —«RLS no es GRANT: policy sin grant = denied»— y aun así volvió,
-- porque la policy permisiva hace que la revisión del código parezca correcta.
--
-- Y la vista lo hacía invisible desde arriba: `cliente_cuenta_corriente` tiene
-- `security_invoker=true` y SÍ tiene GRANT a `authenticated`. Mirando la vista, todo está bien.
-- `security_invoker` significa que el acceso a la tabla de abajo se verifica como el usuario que
-- llama — así que el permiso que faltaba estaba un nivel más abajo del que cualquiera revisa.
--
-- ═══ POR QUÉ EL GRANT ES POR COLUMNA Y NO SOBRE LA TABLA ═══
--
-- La vista usa CINCO columnas: `cliente_id`, `total_bruto`, `estado`, `fecha_cobro`,
-- `fecha_emision`. `cobranzas` tiene 22. Otorgar la tabla entera pondría al alcance de la web
-- `monto_neto`, `iva`, `retenciones`, `orden_compra` y `numero_comprobante` sin que ninguna
-- pantalla los pida — permiso que nadie usa hoy y que mañana alguien va a usar sin discutirlo.
--
-- ═══ Y POR QUÉ LA POLICY SE ENDURECE EN LUGAR DE DEJARLA COMO ESTÁ ═══
--
-- `USING (true)` era inofensivo mientras no hubiera GRANT. Con el GRANT puesto pasa a significar
-- que un JEFE DE OBRA lee la cobranza de todos los clientes. Eso contradice la decisión ya tomada
-- en este OS —el costo es del jefe de obra, el precio no— y contradice a sus tres tablas hermanas,
-- que gatean por `es_administracion()`:
--
--     certificado_cliente   es_administracion() OR (es_cliente() AND cliente_id = ...)
--     cobranza_cambio       es_administracion()
--     esquema_pago          es_administracion() OR (es_cliente() AND cliente_id = ...)
--
-- Se copia la de `cobranza_cambio`, que es la más estricta y la que corresponde: `cobranzas` es el
-- espejo interno de la pestaña del Sheet, no algo que el cliente mire. Lo que el cliente ve de su
-- cuenta sale de `certificado_cliente` y `esquema_pago`, que ya tienen su rama `es_cliente()`.
--
-- ENDURECER NO ROMPE NADA HOY: como no había GRANT, no existe ningún consumidor `authenticated` de
-- esta tabla al que se le pueda quitar algo. El orquestador entra por `service_role`, que no pasa
-- por RLS. Se pasa de «nadie la lee» a «la lee Administración», nunca de más a menos.

-- ── 1 · EL PERMISO QUE FALTABA, ACOTADO A LO QUE LA VISTA USA ───────────────────────────────────
grant select (cliente_id, total_bruto, estado, fecha_cobro, fecha_emision)
  on public.cobranzas to authenticated;

-- ── 2 · LA POLICY, ALINEADA CON SUS HERMANAS ───────────────────────────────────────────────────
drop policy if exists cobranzas_select on public.cobranzas;

create policy cobranzas_select on public.cobranzas
  for select to authenticated
  -- El `(select ...)` no es cosmético: envuelto así, Postgres lo evalúa UNA vez por consulta
  -- (InitPlan) en lugar de una vez por fila. Es el mismo patrón que el resto de los porteros de
  -- este esquema, y sobre una tabla que crece con cada cobranza la diferencia se nota.
  using ((select es_administracion()));

comment on policy cobranzas_select on public.cobranzas is
  'Sólo Administración/Dirección. Antes decía USING (true), que era inofensivo sólo porque no '
  'había GRANT: la combinación dejaba la cuenta corriente del cliente vacía para todos los roles. '
  'Lo que el CLIENTE ve de su cuenta sale de certificado_cliente y esquema_pago, no de acá.';
