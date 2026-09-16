-- 20260916T1300 · LA MARCA «PAGADA» DE UNA LÍNEA DE LIQUIDACIÓN
--
-- Dueño, 16/09/2026, textual: *«necesito marcar como "pagado" ya a la gente y que marque un poco el color
-- distinto en liq hs»*.
--
-- ═══ QUÉ ES ═══
--
-- Un sello con fecha y autor sobre la línea de una persona en una quincena: «a ésta ya se le pagó». No es un
-- estado calculado —el saldo en cero no dice si alguien apretó el botón— y no es el cierre de la quincena, que
-- es de todo el cuadro. Al marcarla, `marcarLineaPagada` completa `pagado_banco` y `pagado_efectivo` con lo que
-- faltaba de cada lado (los saldos compensados de `pagoDeLaQuincena.ts`), así los saldos quedan en 0 por el
-- mismo camino que un pago tecleado. Lo que había antes en esas dos celdas —y sus cuentas— se guarda en
-- `pagada_antes` para que deshacer la marca las devuelva tal cual.
--
-- ═══ EL GRANT NO SE AMPLÍA, Y ES A PROPÓSITO ═══
--
-- Igual que `pagado_banco`: `authenticated` NO recibe UPDATE. Escribe la acción del servidor con la clave de
-- servicio, después de preguntar `liquida_sueldos()` y de releer que la quincena esté abierta. SELECT sí, porque
-- la pantalla dibuja la fila con su color y su fecha con la sesión de la persona.

alter table public.liquidacion_linea
  add column if not exists pagada_en    timestamptz,
  add column if not exists pagada_por   uuid,
  add column if not exists pagada_antes jsonb;

alter table public.liquidacion_linea
  drop constraint if exists liquidacion_linea_pagada_antes_es_objeto,
  add constraint liquidacion_linea_pagada_antes_es_objeto
    check (pagada_antes is null or jsonb_typeof(pagada_antes) = 'object'),
  -- LA MARCA ES ENTERA O NO ES: fecha sin autor, o autor sin fecha, es una fila a medio escribir.
  drop constraint if exists liquidacion_linea_pagada_entera,
  add constraint liquidacion_linea_pagada_entera
    check ((pagada_en is null) = (pagada_por is null));

grant select (pagada_en, pagada_por, pagada_antes) on public.liquidacion_linea to authenticated;

comment on column public.liquidacion_linea.pagada_en is
  'Cuándo alguien marcó esta línea como PAGADA (dueño, 16/09/2026). NULL = sin marcar. La marca completa pagado_banco y pagado_efectivo con lo que faltaba de cada lado; no es un cálculo, es un sello.';
comment on column public.liquidacion_linea.pagada_por is
  'Quién la marcó (auth.uid). Va y viene junto con pagada_en.';
comment on column public.liquidacion_linea.pagada_antes is
  'Lo que tenían pagado_banco, pagado_efectivo y sus cuentas antes de la marca: {"pagado_banco": 94795.5, "pagado_efectivo": null, "formulas": {...}}. Deshacer la marca los devuelve tal cual.';
