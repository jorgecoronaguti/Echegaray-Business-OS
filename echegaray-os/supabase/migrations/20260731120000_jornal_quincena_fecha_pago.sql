-- LA QUINCENA NO SE PAGA EL DÍA QUE CIERRA.
--
-- POR QUÉ (31/07). El dueño: *"los jornales que se pagan de la quincena q termina hoy, se pagarán la
-- semana que viene, tengo q reflejar eso en los cash flows"*.
--
-- Hasta hoy el núcleo afirmaba lo contrario, con estas palabras textuales:
--   · 20260720170000_jornales_instrumentos.sql → 'La fecha de caja es HASTA: la quincena se paga al cerrar'
--   · 20260720160000_rubro_caja_nucleo.sql     → '-- La quincena es caja del día en que CIERRA'
--
-- Y el extracto del Santander ya lo desmentía desde antes de que el dueño lo dijera. Los pagos de
-- haberes llegan en LOTES, uno por quincena:
--
--   quincena cierra   lote del banco                              desfase
--   ───────────────   ─────────────────────────────────────────   ──────────────
--   mar 30/06/2026    mié 01/07/2026 · lote 260701507 · 2 movs    +1 día hábil
--   mié 15/07/2026    vie 17/07/2026 · lote 260717507 · 15 movs   +2 días hábiles
--
-- El segundo cierra al peso: los 14 movimientos del lote 260717507 ($3.522.950) más el "Pago de
-- haberes por cci" del mismo día ($252.200) suman $3.775.150, que es EXACTAMENTE la columna "Banco"
-- de la quincena 01/07–15/07 en la pestaña "Jornales por Quincena".
--
-- ═══ QUÉ CAMBIA, MEDIDO SOBRE LAS 24 QUINCENAS DEL AÑO ═══
--
-- La quincena 16/07–31/07 ($7.675.588) pasa de julio a agosto. Ocho quincenas más cambian de mes (toda
-- la que cierra a fin de mes se paga el mes siguiente). El total NO cambia —$184.172.771 de las dos
-- formas— pero el año 2026 baja a $176.210.469 porque la quincena 16/12–31/12 ($7.962.302) se paga el
-- 01/01/2027, fuera del ejercicio. Eso es correcto en caja y hay que decirlo, no taparlo.
--
-- ═══ LAS TRES CONVENCIONES DE FECHA, RESUELTAS EXPLÍCITAMENTE ═══
--
-- Coexistían tres y ninguna estaba escrita. Ahora sí, y la distinción NO es un defecto a "arreglar":
--
--   CAJA (percibido) ......... por FECHA DE PAGO. Cash flow, egreso_rubro_mes, calendario_caja.
--                              Contesta: ¿cuándo sale la plata de la cuenta?
--   DEVENGAMIENTO ............ por DESDE / HASTA. nomina_por_mes, Cargas Sociales (F931 se declara por
--                              el mes TRABAJADO, no por el mes en que se paga el sueldo).
--                              Contesta: ¿qué costó el mes de obra?
--
-- Son dos preguntas distintas sobre la misma quincena y las dos respuestas son correctas. Mezclarlas
-- es exactamente lo que la regla de oro del OS prohíbe: P&L devengado, Cash Flow percibido.
--
-- Idempotente: se puede correr las veces que sea.

alter table public.jornal_quincena
  add column if not exists fecha_pago date;

comment on column public.jornal_quincena.fecha_pago is
  'CUÁNDO SALE LA PLATA — la fecha de caja de la quincena, distinta de `hasta` (cuándo cierra). Sale, '
  'en este orden: del lote de "Pago haberes" del extracto que le corresponde (hecho con origen), del '
  'parámetro de la pestaña Parámetros (supuesto declarado), o de lo que el dueño escriba a mano (manda '
  'sobre las dos). Puede ser NULL: en ese caso vale `hasta` como fallback, para que una quincena sin '
  'dato no desaparezca del cuadro.';

comment on column public.jornal_quincena.hasta is
  'Cuándo CIERRA la quincena — el último día trabajado. Es la fecha del DEVENGAMIENTO, no la de caja: '
  'para caja está fecha_pago. No "arreglar" nomina_por_mes ni Cargas Sociales para que usen fecha_pago: '
  'esos cuadros miden el mes TRABAJADO y por eso van por desde/hasta, a propósito.';

-- Las quincenas que ya están en la base no tienen fecha de pago cargada, y NO se les inventa una acá:
-- la escribe la sincronización desde el Sheet, que es donde vive el dato con su origen. Mientras esté
-- en NULL las vistas usan `hasta` — el mismo comportamiento que hasta hoy, sin sorpresas.

comment on view public.nomina_por_mes is
  'Costo de nómina por mes DEVENGADO: agrupa por `desde`, o sea por el mes TRABAJADO. NO es caja — la '
  'caja de jornales va por fecha_pago y vive en egreso_rubro_mes / calendario_caja. Las dos '
  'convenciones son correctas y deliberadas: P&L devengado, Cash Flow percibido.';
