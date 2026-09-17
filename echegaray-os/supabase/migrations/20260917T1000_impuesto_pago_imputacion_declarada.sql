-- 20260917T1000 · UN PAGO PUEDE ESTAR IMPUTADO POR LO QUE DECLARÓ EL DUEÑO
--
-- `impuesto_pago.imputacion` distinguía tres fuerzas de evidencia: el papel lo nombra (`documento`),
-- coincide al centavo con una DDJJ (`importe`) o no se sabe (`sin_imputar`). El 17/09/2026 el dueño
-- dijo del VEP de $69.722,68 del 28/08: «eso es f931 pagado». No hay comprobante ni coincidencia: es su
-- palabra, y registrarlo como `documento` sería presentar una declaración como un papel.
--
-- `declarada` es esa cuarta fuerza. La regla vive en `orquestador/lib/impuestos-vep.mjs`
-- (IMPUTACIONES_DECLARADAS) con quién lo dijo, cuándo y —si el período es inferencia— su confianza.
-- La pantalla sólo filtra `sin_imputar`: no cambia nada del lado web.

set local lock_timeout = '2s';

alter table public.impuesto_pago drop constraint if exists impuesto_pago_imputacion_check;
alter table public.impuesto_pago add constraint impuesto_pago_imputacion_check
  check (imputacion in ('documento', 'importe', 'declarada', 'sin_imputar'));

comment on column public.impuesto_pago.imputacion is
  'Fuerza de la imputación: documento (el papel lo nombra) > importe (coincide con una DDJJ) > declarada '
  '(lo dijo el dueño; detalle.declarado) > sin_imputar (impuesto null).';
