-- CONTROL DE OBRAS Fase 3 — COSTO POR OBRA. ARCA trae el comprobante (proveedor + monto +
-- fecha) pero NO la obra a la que corresponde. No hay match automático confiable (pedidos no
-- tienen proveedor ni monto). Por eso la atribución es HUMANA ASISTIDA: el dueño asigna cada
-- comprobante a su obra; el OS puede PROPONER según el historial del proveedor, nunca fabrica.
-- null en obra_texto = comprobante SIN asignar (aún no se sabe a qué obra fue).
alter table public.comprobantes_arca
  add column if not exists obra_texto        text,
  add column if not exists obra_asignada_por text,
  add column if not exists obra_asignada_en  timestamptz;

create index if not exists comprobantes_arca_obra on public.comprobantes_arca (obra_texto)
  where obra_texto is not null;

-- La web necesita ASIGNAR la obra (update de esas 3 columnas). Antes sólo había SELECT.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='comprobantes_arca' and policyname='comprobantes_arca_update') then
    create policy comprobantes_arca_update on public.comprobantes_arca for update to authenticated using (true) with check (true);
  end if;
end $$;
grant update on public.comprobantes_arca to authenticated;
