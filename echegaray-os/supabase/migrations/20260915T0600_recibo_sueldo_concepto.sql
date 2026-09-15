-- LOS CONCEPTOS DE CADA RECIBO DE SUELDO, UNO POR UNO: código, sección, unidad, base e importe.
--
-- Dueño, 14/09/2026: *«al hacer click en la persona quiero q el menu de la derecha … me muestre una
-- liquidacion estimada concepto por concepto tomando en cuenta lo q se considera todas las quincenas en
-- el recibo de sueldo»*. `recibo_sueldo_linea` guarda los totales (bruto, descuentos, neto); con eso no
-- se puede saber que la jubilación es un porcentaje del remunerativo y el seguro de vida un monto fijo.
-- Las reglas del recibo estimado se DERIVAN de estas filas, no se escriben de memoria.
--
-- Por qué una tabla hija y no columnas en `recibo_sueldo_linea`: el catálogo de códigos no es cerrado
-- (vacaciones, accidente, SAC, sumas no remunerativas aparecen según la quincena). Por qué FK y no
-- (cuil, periodo): la línea ya es la llave única del recibo; repetir cuil y periodo acá abriría la
-- puerta a un concepto que no coincide con su recibo.
--
-- La carga es de `orquestador/scripts/recibos-detalle-importar.mjs`, sólo si el recibo cierra al
-- centavo Σ remunerativo, Σ no remunerativo y Σ descuentos contra lo impreso, y rem + no rem −
-- descuentos = neto. Un recibo cuyo detalle no cierra no tiene conceptos: nunca un detalle a medias.
--
-- ═══ QUIÉN LEE Y QUIÉN ESCRIBE ═══ La misma puerta que `recibo_sueldo_linea`: lee quien liquida
-- sueldos (`liquida_sueldos()`), escribe SÓLO la clave de servicio.

create table if not exists public.recibo_sueldo_concepto (
  id          uuid primary key default gen_random_uuid(),
  recibo_id   uuid not null references public.recibo_sueldo_linea(id) on delete cascade,
  -- El orden impreso. `codigo` no es único dentro de un recibo: el mismo código puede venir dos veces.
  orden       smallint not null check (orden >= 0),
  codigo      text not null check (codigo ~ '^\d{4}$'),
  descripcion text not null,
  seccion     text not null check (seccion in ('remunerativo', 'no_remunerativo', 'descuento', 'contribucion')),
  unidad      numeric,
  base        numeric,
  monto       numeric not null,
  cargado_en  timestamptz not null default now(),
  unique (recibo_id, orden)
);

create index if not exists recibo_sueldo_concepto_codigo on public.recibo_sueldo_concepto (codigo);

comment on table public.recibo_sueldo_concepto is
  'Cada concepto impreso en un recibo de sueldo (0401 básico, 4010 jubilación, 5485 fondo de cese…), con su sección. Hija de recibo_sueldo_linea. Se carga sólo si las sumas por sección cierran al centavo contra el recibo.';
comment on column public.recibo_sueldo_concepto.unidad is 'Horas o días impresos en la columna UNIDAD. Null si el concepto no la trae.';
comment on column public.recibo_sueldo_concepto.base is 'Valor unitario impreso en la columna BASE (formato con rótulos). Null si no la trae.';
comment on column public.recibo_sueldo_concepto.monto is 'Importe con su signo: el 0426 AJUSTE COD.0425 es negativo.';

alter table public.recibo_sueldo_concepto enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'recibo_sueldo_concepto' and policyname = 'recibo_sueldo_concepto_lee_admin') then
    create policy recibo_sueldo_concepto_lee_admin on public.recibo_sueldo_concepto
      for select to authenticated using ((select public.liquida_sueldos()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'recibo_sueldo_concepto' and policyname = 'recibo_sueldo_concepto_srv') then
    create policy recibo_sueldo_concepto_srv on public.recibo_sueldo_concepto
      for all to service_role using (true) with check (true);
  end if;
end $$;

grant select on public.recibo_sueldo_concepto to authenticated;
grant all on public.recibo_sueldo_concepto to service_role;
revoke insert, update, delete on public.recibo_sueldo_concepto from authenticated;
