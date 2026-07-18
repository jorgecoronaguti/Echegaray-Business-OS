-- Certificaciones keyeadas al EJE CANÓNICO de obras (F0.2), no a public.obras (uuid legacy,
-- desactualizado). La tabla public.certificados ya modela todo el flujo (certificado→facturado→
-- cobrado) pero estaba vacía y sin forma de registrar. Esto la conecta al eje canónico para que
-- salud_obra tome el ingreso DEVENGADO por obra. No destructivo: la FK vieja a public.obras queda.
alter table public.certificados
  add column if not exists obra_canonica_id text references public.obra_canonica(id);

create index if not exists certificados_obra_canonica_idx on public.certificados(obra_canonica_id);

-- obra_id (uuid → public.obras) pasa a ser opcional: los certificados nuevos van por el eje canónico.
alter table public.certificados alter column obra_id drop not null;

-- numero pasa a opcional: al "empezar a tener" certificaciones, puede no haber número formal aún.
alter table public.certificados alter column numero drop not null;
