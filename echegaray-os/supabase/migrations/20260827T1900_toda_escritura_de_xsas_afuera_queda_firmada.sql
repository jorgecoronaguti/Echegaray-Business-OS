-- CADA VEZ QUE XSAS ESCRIBE AFUERA, QUEDA QUIÉN, QUÉ Y CUÁNDO.
--
-- El dueño autorizó `drive.write` con una condición: que la escritura sea de capacidades nombradas y
-- que quede registrada. Las dos cerraduras (rol + tool autorizada) viven en `lib/xsas-permisos.mjs`;
-- esta tabla es la tercera pata: la evidencia POSTERIOR. Sin ella, «XSAS creó una presentación» es
-- algo que se puede afirmar y no verificar — y un permiso de escritura sin traza es un permiso que
-- nadie puede auditar después.
--
-- Se registra el INTENTO, no sólo el éxito: una escritura que falló también dice que alguien la pidió.

create table if not exists public.xsas_escritura (
  id             uuid primary key default gen_random_uuid(),
  correlation_id text,
  actor_id       text not null,
  actor_nombre   text,
  actor_rol      text,
  canal          text,
  tool           text not null,
  capability     text not null,
  archivo_id     text,
  archivo_link   text,
  resultado      text not null check (resultado in ('ok', 'error')),
  motivo         text,
  creado_en      timestamptz not null default now()
);

create index if not exists xsas_escritura_creado_en_idx on public.xsas_escritura (creado_en desc);
create index if not exists xsas_escritura_actor_idx on public.xsas_escritura (actor_id, creado_en desc);

alter table public.xsas_escritura enable row level security;

-- Quien puede ver Dirección puede ver qué escribió el OS en nombre de la empresa. El resto, no: el
-- registro dice qué archivos existen y quién los pidió.
drop policy if exists xsas_escritura_lee_direccion on public.xsas_escritura;
create policy xsas_escritura_lee_direccion on public.xsas_escritura for select
  using ((select public.es_administracion()));

grant select on public.xsas_escritura to authenticated;
grant insert, select on public.xsas_escritura to service_role;

comment on table public.xsas_escritura is
  'Traza de toda escritura de XSAS con efecto fuera del OS (Drive). Se escribe desde el gateway, con el correlation_id del pedido.';
