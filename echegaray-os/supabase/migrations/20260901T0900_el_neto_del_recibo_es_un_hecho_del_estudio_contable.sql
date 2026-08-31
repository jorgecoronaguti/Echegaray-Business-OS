-- EL NETO QUE DICE EL RECIBO DE SUELDO, COMO HECHO GUARDADO.
--
-- El cuadro de Nómina calculaba la parte que va por banco como el 50% del acuerdo. El dueño lo
-- corrigió el 31/08/2026: «por banco va lo q dice recibo y en efectivo se completa todo hasta
-- llegar al numero». La columna deja de ser un cálculo y pasa a ser un HECHO que produce el
-- estudio contable — y un hecho necesita dónde vivir, con su fuente al lado.
--
-- ═══ LA LLAVE ES EL CUIL, NO persona_id ═══
--
-- `recibo_empleado` ya existe y cuelga de `personas`. No sirve acá: cuatro de las diecinueve
-- personas que cobran la 2da quincena de agosto (legajos 85, 86, 87 y 95) NO tienen fila en
-- `personas` — son altas nuevas que nadie cargó todavía. Colgar el recibo de la persona haría que
-- el papel de alguien no se pueda guardar porque falta un trámite interno, y el papel existe
-- igual: se lo dieron y se le paga.
--
-- El CUIL viene impreso en el recibo, es único y no depende de ningún registro nuestro.
--
-- ═══ POR QUÉ NO HAY UPDATE ═══
--
-- Un recibo emitido no se corrige: se emite otro. Cada carga es una fila y la última gana por
-- fecha. Permitir el UPDATE sería permitir que el neto de un recibo cambie sin que quede rastro de
-- cuál era antes, y ese número es lo que cobra una persona.

create table if not exists public.nomina_recibo_neto (
  id            uuid primary key default gen_random_uuid(),
  cuil          text not null,
  periodo       text not null,          -- 'Q1-08/2026' | 'Q2-08/2026' | 'FINAL'
  neto          numeric(14,2) not null,
  nombre_recibo text not null,          -- el nombre TAL COMO lo imprime el papel
  legajo        text,                   -- pista, no identidad: en el PDF viene pegado al importe
  etiqueta      text,                   -- 'SEGUNDA QUINCENA 08/2026', 'LIQUIDACION FINAL'
  fecha_pago    date,
  fuente        text not null,          -- de qué archivo salió y cómo se confirmó
  cargado_en    timestamptz not null default now(),

  -- Un neto de cero o negativo no es un recibo: es una lectura que salió mal. Que la base lo
  -- rechace evita que un parser roto le pague nada a alguien y el total de la quincena cierre igual.
  constraint nomina_recibo_neto_positivo check (neto > 0),
  -- El CUIL son once dígitos. Sin esto, un CUIL a medio leer entra y no empareja con nadie.
  constraint nomina_recibo_neto_cuil_valido check (cuil ~ '^[0-9]{11}$'),
  -- La fuente es obligatoria: un número de plata sin decir de dónde salió no se puede defender.
  constraint nomina_recibo_neto_con_fuente check (length(btrim(fuente)) > 0)
);

create index if not exists nomina_recibo_neto_cuil_periodo on public.nomina_recibo_neto (cuil, periodo, cargado_en desc);

alter table public.nomina_recibo_neto enable row level security;

-- Leer un neto de sueldo es ver cuánto cobra una persona: sólo quien ya puede ver la economía.
-- Sin GRANT la policy no alcanza — en este repo una policy sin grant da «denied» y la pantalla lo
-- muestra como 404.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='nomina_recibo_neto' and policyname='nomina_recibo_neto_lee_economia') then
    create policy nomina_recibo_neto_lee_economia on public.nomina_recibo_neto
      for select to authenticated using (ve_economia());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='nomina_recibo_neto' and policyname='nomina_recibo_neto_srv') then
    create policy nomina_recibo_neto_srv on public.nomina_recibo_neto
      for all to service_role using (true) with check (true);
  end if;
end $$;

grant select on public.nomina_recibo_neto to authenticated;
grant all on public.nomina_recibo_neto to service_role;

-- Nadie edita ni borra un recibo cargado, tampoco dirección. Se emite otro.
revoke insert, update, delete on public.nomina_recibo_neto from authenticated;

comment on table public.nomina_recibo_neto is
  'El neto que dice cada recibo de sueldo, leído del PDF del estudio y confirmado contra el Cubo. Llave: CUIL + período. Es la columna BANCO del cuadro de Nómina — un hecho, no el 50% calculado.';
