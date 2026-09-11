-- ═══ EL COMPROBANTE DE UNA COBRANZA SE ATA A SU FILA, NO A SU ID ═══════════════════════════════
--
-- Dueño, 11/09/2026: «en todo lo que es Messina no has cargado esa imagen, que es el recibo de los
-- pagos en negro que nos han hecho. Subila donde corresponda en app.ecsas.com.ar». La nota firmada
-- por Rodrigo Echegaray el 10/09 (Drive 14-oxfzzm6EHyObGysr8xjNJfDtBHyx2Z) respalda tres cobros en
-- efectivo de Messina: Platea Azufre 50 % $18.159.641 · Cancelación Pilón $3.484.558 · Cancelación
-- TK 23 bases $2.844.877 = $24.489.076. Estaba en Drive y en `documento_cliente`, pero la solapa
-- Cobranzas decía «sin comprobante» en las tres filas, porque una fila N no tiene factura y no había
-- dónde colgar otro papel.
--
-- Nace `cobranza_comprobante`: el papel que respalda una fila de Cobranzas. Se ata por
-- (cliente_id, sheet_id) y NO por `cobranzas.id`: el sync del Sheet borra y vuelve a insertar las
-- filas en cada corrida (medido hoy: la fila 78 cambió de id entre las 07:55 y las 11:15), así que
-- una FK al id se perdería en dos horas. El número de fila es lo que el dueño ve y lo que el sync
-- conserva.

create table if not exists public.cobranza_comprobante (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  sheet_id       text not null,
  drive_file_id  text not null,
  titulo         text not null,
  nota           text,
  cargado_en     timestamptz not null default now(),
  cargado_por    text,
  unique (cliente_id, sheet_id, drive_file_id)
);

comment on table public.cobranza_comprobante is
  'El papel (Drive) que respalda una fila de Cobranzas del Sheet: recibo, nota firmada, constancia. '
  'Atado por (cliente_id, sheet_id) porque el sync recrea las filas. Una fila N puede tener respaldo '
  'sin tener factura (11/09/2026).';

alter table public.cobranza_comprobante enable row level security;
drop policy if exists cobranza_comprobante_lee_quien_ve_economia on public.cobranza_comprobante;
create policy cobranza_comprobante_lee_quien_ve_economia on public.cobranza_comprobante
  for select to authenticated using ((select public.ve_economia()));
grant select on public.cobranza_comprobante to authenticated;
grant all on public.cobranza_comprobante to service_role;

-- La vista de la pestaña lo publica: columnas nuevas AL FINAL, `create or replace` las acepta.
create or replace view public.cliente_cobranza with (security_invoker = false) as
 select cb.id as cobranza_id,
    cb.cliente_id,
    i.obra_id,
    i.imputacion,
    cb.sheet_id as fila,
    cb.categoria,
    cb.fecha_emision,
    cb.factura,
    cb.numero_comprobante,
    cb.concepto,
    cb.orden_compra,
    cb.monto_neto,
    cb.iva,
    cb.retenciones,
    cb.total_bruto,
    cb.estado,
    cb.moneda,
    public.es_cobrada(cb.estado, cb.fecha_cobro) as esta_cobrada,
    cb.estado = 'CANCELAR'::text as esta_cancelada,
    not public.es_cobrada(cb.estado, cb.fecha_cobro) and cb.estado is distinct from 'CANCELAR'::text
      and cb.fecha_emision is not null and cb.fecha_emision < (current_date - public.plazo_cobro_dias()) as esta_vencida,
    cb.fecha_cobro,
    cb.forma_cobro,
    r.drive_file_id as respaldo_drive_id,
    r.titulo        as respaldo_titulo,
    r.nota          as respaldo_nota
   from public.cobranzas cb
     left join public.cobranza_imputacion i on i.cobranza_id = cb.id
     left join lateral (
       select c.drive_file_id, c.titulo, c.nota
         from public.cobranza_comprobante c
        where c.cliente_id = cb.cliente_id and c.sheet_id = cb.sheet_id
        order by c.cargado_en desc
        limit 1
     ) r on true
  where cb.cliente_id is not null and public.ve_economia();

grant select on public.cliente_cobranza to authenticated;
grant select on public.cliente_cobranza to service_role;

-- ── Los tres cobros en efectivo de Messina del 10/09, con la nota de Rodrigo como respaldo ──────
insert into public.cobranza_comprobante (cliente_id, sheet_id, drive_file_id, titulo, nota, cargado_por)
select '2b151bfe-d65f-49a6-a297-15732b0c80a3', s.sheet_id, '14-oxfzzm6EHyObGysr8xjNJfDtBHyx2Z',
       'Nota firmada por Rodrigo Echegaray · 10/09/2026',
       'Recibo manuscrito de los tres cobros en efectivo del 10/09: Platea Azufre 50 % $18.159.641 · Cancelación Pilón $3.484.558 · Cancelación TK 23 bases $2.844.877 = $24.489.076.',
       'Claude Code · 11/09/2026'
  from (values ('30'), ('65'), ('98')) as s(sheet_id)
on conflict (cliente_id, sheet_id, drive_file_id) do nothing;

-- Y en la biblioteca del cliente deja de ser «otro»: es un recibo.
update public.documento_cliente
   set categoria = 'recibo'
 where drive_file_id = '14-oxfzzm6EHyObGysr8xjNJfDtBHyx2Z' and categoria = 'otro';
