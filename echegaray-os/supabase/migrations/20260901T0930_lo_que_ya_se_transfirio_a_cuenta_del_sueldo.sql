-- LO QUE YA SE LE TRANSFIRIÓ A CADA UNO A CUENTA DEL SUELDO.
--
-- El dueño: «para armar ese cuadro de nomina tenes q indicar lo que diga el de sueldo y restar lo
-- que ya hemos transferido lo pagado en adelantos». Restar exige saber a quién y cuánto, y hasta
-- hoy eso vivía en una columna de la planilla que no dice de dónde salió cada número.
--
-- ═══ LA LLAVE ES LA REFERENCIA DEL BANCO ═══
--
-- Un adelanto se identifica por su movimiento bancario, no por (persona, fecha, importe): el mismo
-- viernes se le pueden hacer dos transferencias iguales a la misma persona, y con esa terna las dos
-- se leen como una. Este repo ya lo pagó — el saldo corrido dejó 68 duplicados por confiar en una
-- clave que no era clave. La referencia del banco es única y viene en el extracto.
--
-- ═══ POR QUÉ SEPARAR EL CONCEPTO ═══
--
-- El lote de haberes del 28/08/2026 pagó $300.000 a Jofre y $300.000 a Sosa, que **ya no cobran la
-- quincena**: salieron por liquidación final el 25/08. Meter esa plata en la misma bolsa que el
-- adelanto de Rosales o de Pastran mezcla dos cosas que se restan de cuadros distintos — una del
-- sueldo de la quincena, la otra de la liquidación final. Por eso el concepto es obligatorio.

create table if not exists public.nomina_adelanto (
  id             uuid primary key default gen_random_uuid(),
  referencia     text not null unique,   -- la del extracto: identifica el movimiento, y sólo uno
  fecha          date not null,
  cuil           text,                   -- puede faltar: el lote de haberes no lo trae
  beneficiario   text not null,          -- el nombre TAL COMO lo escribe el banco
  importe        numeric(14,2) not null,
  -- 'QUINCENA' se resta del cuadro de la quincena · 'LIQUIDACION_FINAL' del cuadro 1.b.
  concepto       text not null,
  fuente         text not null,
  cargado_en     timestamptz not null default now(),

  constraint nomina_adelanto_positivo check (importe > 0),
  constraint nomina_adelanto_concepto check (concepto in ('QUINCENA', 'LIQUIDACION_FINAL')),
  constraint nomina_adelanto_cuil_valido check (cuil is null or cuil ~ '^[0-9]{11}$'),
  constraint nomina_adelanto_con_fuente check (length(btrim(fuente)) > 0)
);

create index if not exists nomina_adelanto_cuil on public.nomina_adelanto (cuil, concepto);

alter table public.nomina_adelanto enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='nomina_adelanto' and policyname='nomina_adelanto_lee_economia') then
    create policy nomina_adelanto_lee_economia on public.nomina_adelanto
      for select to authenticated using (ve_economia());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='nomina_adelanto' and policyname='nomina_adelanto_srv') then
    create policy nomina_adelanto_srv on public.nomina_adelanto
      for all to service_role using (true) with check (true);
  end if;
end $$;

grant select on public.nomina_adelanto to authenticated;
grant all on public.nomina_adelanto to service_role;
revoke insert, update, delete on public.nomina_adelanto from authenticated;

comment on table public.nomina_adelanto is
  'Plata ya transferida a cuenta del sueldo, una fila por movimiento bancario. Llave: la referencia del extracto. El concepto separa lo que se resta de la quincena de lo que se resta de una liquidación final.';
