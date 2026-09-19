-- UN PAGO POR DEBIN ES UN TIPO DE PAGO (19/09/2026).
--
-- ═══ POR QUÉ ═══
--
-- El 17/09/2026 salieron $432.764,90 de la cuenta como «Debito debin - id debin … cuit 30707743987».
-- Ese CUIT es ADMINISTRADORA SAN JUAN S.A. (PlusPagos), una PLATAFORMA DE COBRO: el extracto dice quién
-- cobró, no qué se pagó. El dueño lo confirmó el 19/09: «pagué rentas». Y el importe es EXACTAMENTE el
-- «a pagar» de la DDJJ de IIBB de 08/2026 presentada el 15/09 ($432.764,90, comprobante 13200510681),
-- que es lo que lo prueba: por la misma plataforma viaja la boleta de UOCRA, que no es un impuesto.
--
-- Hasta hoy el CHECK sólo admitía vep · debito_automatico · debito_bancario · retencion · percepcion, y
-- registrar el pago fallaba. Un DEBIN no es ninguno de esos: no es un VEP (no hay volante), no es un
-- débito automático (lo inicia el cobrador y el pagador lo acepta) y no es un débito del banco.
--
-- COMPATIBLE HACIA ATRÁS: agrega un valor permitido, no cambia ninguna fila. El código que lee la
-- pantalla de Impuestos ya nombra el tipo nuevo en el mismo hito.
alter table public.impuesto_pago drop constraint if exists impuesto_pago_tipo_check;
alter table public.impuesto_pago add constraint impuesto_pago_tipo_check
  check (tipo = any (array['vep', 'debito_automatico', 'debito_bancario', 'debin', 'retencion', 'percepcion']));
