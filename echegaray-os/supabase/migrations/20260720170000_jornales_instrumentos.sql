-- LAS DOS FUENTES DE CAJA QUE VIVÍAN SÓLO EN EL SHEET.
--
-- POR QUÉ (20/07). Al contrastar el núcleo contra la planilla, el núcleo daba $60.402.163 MENOS en
-- el año. $53.637.487 de esa diferencia tienen una explicación estructural y son estas dos tablas:
--
--   · JORNALES $40.657.604. El cash flow del Sheet NO usa Compras para los jornales: usa la planilla
--     real de quincenas ($185.505.626) porque en Compras están tipeados a mano como estimación
--     ($144.848.022). El núcleo usaba Compras, así que subestimaba el costo laboral —el egreso más
--     grande de la empresa— en $40,7M.
--
--   · CHEQUES Y TARJETA SIN FACTURA $12.979.883. Son pagos que salen del banco y cuya factura NO
--     está cargada en Compras, así que ninguna consulta al núcleo los veía. En el Sheet ya son una
--     línea del cash flow desde hoy; acá se replican para que la web y el chat vean lo mismo.
--
-- POR QUÉ TABLAS Y NO VISTAS: el dato de origen es un Google Sheet, no Postgres. Se replican con
-- scripts/sync-caja-nucleo.mjs y cada fila guarda de dónde salió.

-- ── JORNALES POR QUINCENA ────────────────────────────────────────────────────────────────────────
create table if not exists public.jornal_quincena (
  id              uuid primary key default gen_random_uuid(),
  desde           date not null,
  hasta           date not null,
  -- 'real' = quincena liquidada, sale de la planilla de jornales.
  -- 'proyeccion' = supuesto: plantel y jornal actuales × días hábiles × inflación esperada.
  clase           text not null check (clase in ('real', 'proyeccion')),
  personas        int,
  dias_habiles    int,
  hs_reales       numeric,
  banco           numeric,
  adelanto        numeric,
  total_recibo    numeric,
  total           numeric not null,
  origen          text not null default 'jornales_sheet',
  sincronizado_en timestamptz not null default now(),
  unique (desde, hasta, clase)
);
comment on table public.jornal_quincena is
  'Costo laboral por quincena. La fecha de caja es HASTA: la quincena se paga al cerrar. clase distingue lo liquidado de lo proyectado.';
comment on column public.jornal_quincena.total is
  'Lo que efectivamente sale de la caja por esa quincena (banco + adelanto + recibo). NO es la remuneración bruta.';

-- ── CHEQUES Y TARJETA ────────────────────────────────────────────────────────────────────────────
create table if not exists public.instrumento_pago (
  id                  uuid primary key default gen_random_uuid(),
  tipo                text not null check (tipo in ('cheque', 'tarjeta')),
  numero              text,
  proveedor           text,
  monto               numeric not null,
  comprobante         text,
  -- Clave normalizada del comprobante ("0001-000036" y "1-36" son el MISMO). La normaliza el script
  -- con lib/cheques-cobertura.mjs, que es la MISMA función que usa el Sheet — reimplementarla en SQL
  -- sería una segunda definición del cruce, y el cruce es justamente lo que decide si un pago está
  -- contemplado o no.
  comprobante_norm    text,
  factura_en_compras  boolean not null default false,
  fecha_pago          date,
  debitado            boolean not null default false,
  unidad_negocio      text,
  origen              text not null default 'cheques_sheet',
  sincronizado_en     timestamptz not null default now(),
  unique (tipo, origen, numero, comprobante, monto, fecha_pago)
);
comment on table public.instrumento_pago is
  'Cheques emitidos y consumos de tarjeta. factura_en_compras = su comprobante está en Compras, así que ese pago YA viaja al cash flow por el rubro de esa factura y sumarlo otra vez duplicaría.';

alter table public.jornal_quincena  enable row level security;
alter table public.instrumento_pago enable row level security;
do $$ begin
  create policy jornal_quincena_lectura on public.jornal_quincena for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy instrumento_pago_lectura on public.instrumento_pago for select to authenticated using (true);
exception when duplicate_object then null; end $$;
