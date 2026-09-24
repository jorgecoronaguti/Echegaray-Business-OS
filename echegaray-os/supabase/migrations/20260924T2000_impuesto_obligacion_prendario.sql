-- LA CUOTA DEL PRENDARIO ENTRA A «A PAGAR EN 30 DÍAS» DE LA APP (dueño, 24/09/2026 — opción A).
--
-- La pestaña «Impuestos y Financieros» suma la cuota del prendario Ford (Santander) a «A pagar en 30
-- días» y la app no la tenía: el mismo titular daba dos números. `impuestos-a-postgres.mjs` la escribe
-- como impuesto = 'prendario', concepto = 'cuota', con el importe del último débito del extracto.
-- Sólo se amplía el CHECK: ninguna fila existente cambia, y el código viejo nunca escribe este valor.
alter table public.impuesto_obligacion drop constraint if exists impuesto_obligacion_impuesto_check;
alter table public.impuesto_obligacion add constraint impuesto_obligacion_impuesto_check
  check (impuesto = any (array['iva','iibb','ganancias','bienes_personales','cargas_sociales','impuesto_cheque','sellos','otro','prendario']));
