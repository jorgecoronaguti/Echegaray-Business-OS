-- EL COSTO EMPLEADOR DE CADA RECIBO: contribuciones patronales y costo total, leídos del mismo PDF.
--
-- `recibo_sueldo_linea` guardaba lo que cobra el obrero (bruto, descuentos, neto). Lo que le cuesta a
-- la empresa es otro número: bruto + contribuciones patronales. Sin él, el costo de mano de obra de
-- una obra se subestima en la mitad del bruto.
--
-- Todas nullable y SIN default: null quiere decir «el recibo no lo trae» (el formato enero–junio no
-- imprime el detalle 5xxx ni el costo total). Un 0 diría que la empresa no pagó contribuciones, que
-- es falso. El importador sólo las completa cuando bruto + contribuciones = costo total impreso.
--
-- Sin cambios de permisos: las columnas nuevas heredan la puerta de la tabla (lee `liquida_sueldos()`,
-- escribe sólo la clave de servicio). Los GRANT de la tabla son sobre la tabla entera, no por columna.

alter table public.recibo_sueldo_linea
  add column if not exists contribuciones_empleador numeric,
  add column if not exists costo_total_empleador    numeric,
  add column if not exists fondo_cese               numeric,
  add column if not exists art                      numeric,
  add column if not exists contribucion_uocra       numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recibo_sueldo_linea_costo_empleador_no_negativo') then
    alter table public.recibo_sueldo_linea
      add constraint recibo_sueldo_linea_costo_empleador_no_negativo check (
        (contribuciones_empleador is null or contribuciones_empleador >= 0)
        and (costo_total_empleador is null or costo_total_empleador >= 0)
        and (fondo_cese is null or fondo_cese >= 0)
        and (art is null or art >= 0)
        and (contribucion_uocra is null or contribucion_uocra >= 0));
  end if;
end $$;

comment on column public.recibo_sueldo_linea.contribuciones_empleador is
  'SUB TOTAL CONTRIBUCIONES EMPLEADOR impreso en el recibo (suma de los conceptos 5xxx). Null si el recibo no trae la sección.';
comment on column public.recibo_sueldo_linea.costo_total_empleador is
  'COSTO TOTAL EMPLEADOR impreso en el recibo. Se carga sólo si bruto + contribuciones_empleador lo reproduce con tolerancia de $0,02.';
comment on column public.recibo_sueldo_linea.fondo_cese is
  'Concepto 5485 CONT.FONDO DESEMPLEO UOCRA (Fondo de Cese Laboral). Null si el recibo no trae la sección; 0 si la trae y el concepto no figura.';
comment on column public.recibo_sueldo_linea.art is
  'Concepto 5250 CONTRIBUCION PORCENTUAL ART. Null si el recibo no trae la sección; 0 si la trae y el concepto no figura.';
comment on column public.recibo_sueldo_linea.contribucion_uocra is
  'Concepto 5480 CONTRIBUCION EMPRESARIA UOCRA (costo derivado del CCT). Null si el recibo no trae la sección; 0 si la trae y el concepto no figura.';
