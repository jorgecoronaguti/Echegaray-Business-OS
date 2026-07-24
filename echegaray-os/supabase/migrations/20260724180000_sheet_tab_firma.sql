-- LA FIRMA DE LO QUE EL OS DEJÓ ESCRITO EN CADA PESTAÑA — para detectar CUALQUIER edición del dueño.
--
-- POR QUÉ (24/07). "logra que los agentes respeten mis modificaciones". La detección por rótulos sólo
-- ve reescrituras TOTALES; una edición parcial se le escapa y el generador la pisa. La forma robusta:
-- el OS guarda una FIRMA (hash) de lo que dejó en la pestaña; en la corrida siguiente compara la firma
-- actual con la suya. Si difieren, ALGUIEN editó la pestaña desde la última escritura del OS → el OS
-- se retira y no la pisa. Falla del lado seguro: ante mismatch, NO escribe (mejor desactualizada que
-- perdida). La firma se guarda desde una RE-LECTURA post-escritura, así el ida y vuelta de Google
-- (normalización de fórmulas, formato) no genera un falso "editado".

create table if not exists public.sheet_tab_firma (
  file_id    text not null,
  pestana    text not null,
  firma      text not null,
  escrito_en timestamptz not null default now(),
  primary key (file_id, pestana)
);

comment on table public.sheet_tab_firma is
  'Firma (hash) de lo que el OS dejó escrito en cada pestaña. Si la firma actual difiere, el dueño editó la pestaña y el OS no la pisa. La verdad del dueño es definitiva.';

alter table public.sheet_tab_firma enable row level security;
drop policy if exists sheet_tab_firma_service on public.sheet_tab_firma;
create policy sheet_tab_firma_service on public.sheet_tab_firma for all to service_role using (true) with check (true);
