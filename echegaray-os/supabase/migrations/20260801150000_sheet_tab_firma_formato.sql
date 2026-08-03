-- LA FIRMA DEL FORMATO (01/08/2026)
--
-- El dueño: "puedo haber tocado algún número o algún formato y las debe respetar". La firma que ya
-- existía (public.sheet_tab_firma.firma) hashea VALORES: un cambio de color, de formato de número, de
-- negrita o de ancho de columna la deja idéntica, así que el generador volvía a formatear encima.
--
-- Esta columna guarda el hash del formato ENTRADO (userEnteredFormat + anchos + filas congeladas) que
-- el OS dejó en la pestaña. Si el formato vivo difiere, lo tocó una persona y el OS no lo pisa —pero
-- sigue actualizando los NÚMEROS: se protege el formato, no se congela la pestaña.
--
-- Nullable a propósito: sin valor previo, evaluarFormato ADOPTA el formato actual como referencia y
-- saltea una sola pasada de formateo. Ver orquestador/lib/firma-formato.mjs.

alter table public.sheet_tab_firma add column if not exists firma_formato text;

comment on column public.sheet_tab_firma.firma_formato is
  'Hash del formato entrado (userEnteredFormat + anchos + congeladas) que dejó el OS. Si difiere del vivo, el formato es del dueño y no se pisa.';
