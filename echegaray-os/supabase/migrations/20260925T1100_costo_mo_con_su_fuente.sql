-- ERP OBRAS · EL COSTO DE MO DE UNA HISTORIA DICE DE DÓNDE SALE (dueño 25/09: «el costo de MO por
-- historia, sacalo de los presupuestos de cada obra»; coordinador: «dejá anotado de qué presupuesto y
-- partidas sale cada número»).
--
-- `costo_mo_fuente` guarda la procedencia del número: el archivo de Drive (id y nombre), la hoja, las
-- partidas con su cantidad y su MO (mano de obra + cargas sociales del Análisis), y cuándo se leyó; o
-- «a mano» con quién y cuándo, si lo cargó una persona. NULL = sin fuente registrada.

alter table public.obra_actividad add column if not exists costo_mo_fuente jsonb;
comment on column public.obra_actividad.costo_mo_fuente is
  'Procedencia de costo_mo: {origen: cotizacion_drive|a_mano|presupuesto_os, archivo, drive_id, hoja, partidas:[{id,tarea,cant,mo}], leido_en} o {origen:a_mano, por, en}.';
grant select (costo_mo_fuente), insert (costo_mo_fuente), update (costo_mo_fuente) on public.obra_actividad to authenticated;
