-- Adicionales keyeados al eje canónico (F0.2), como certificados. La tabla ya modela el flujo
-- detección→cotización→aprobación→facturación→cobranza pero estaba vacía y sin forma de registrar.
alter table public.adicionales add column if not exists obra_canonica_id text references public.obra_canonica(id);
create index if not exists adicionales_obra_canonica_idx on public.adicionales(obra_canonica_id);
alter table public.adicionales alter column obra_id drop not null;
