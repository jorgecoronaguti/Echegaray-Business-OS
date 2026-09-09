-- 20260909T1700 · EL ADELANTO DEJA DE SER PAPEL
--
-- La columna ADELANTO de la liquidación hoy se escribe a mano en la pantalla y no queda en ningún
-- lado: al recargar, el número que el dueño ya entregó desaparece y la quincena vuelve a pagar de
-- más. Handoff v2 §7: «tabla de adelantos con importe, fecha, canal, autor y quincena».
--
-- ═══ POR QUÉ NO ALCANZA `nomina_adelanto` ═══
--
-- Esa tabla (20260901T0930) es el LOTE DEL BANCO: su clave es `referencia`, la del extracto, y es
-- NOT NULL UNIQUE. Un adelanto entregado en billetes un martes al mediodía no tiene referencia de
-- extracto y nunca la va a tener — cargarlo ahí obligaría a inventar una, que es exactamente el
-- error que la unicidad existe para evitar. Las dos conviven: `nomina_adelanto` es lo que el banco
-- prueba, `persona_adelanto` es lo que alguien de la empresa declara haber entregado.
--
-- ═══ «YA TRANSFERIDO» NO ES UN ADELANTO ═══
--
-- R5 del handoff, con las palabras del dueño: *«un giro hecho antes de armar el lote no es un
-- adelanto: va en ya transferido»*. Son dos renglones distintos de la cadena de pago y se restan
-- los dos, así que sumarlos en una sola columna daría el mismo total y una liquidación que nadie
-- puede explicar. Por eso `clase` es obligatoria y no derivable de `canal`: un adelanto también
-- puede salir por banco (transferencia a cuenta de la quincena en curso), y lo que los separa es
-- CUÁNDO se decidió, no por dónde salió.

-- ═══ EL MÓDULO ES SÓLO DE ADMINISTRADOR, Y ESO ES UNA FUNCIÓN PROPIA ═══
--
-- Dueño, 09/09/2026: *«Liquidación de horas es accesible SÓLO con nivel de usuario administrador»*.
-- Hoy ese conjunto coincide con `ve_economia()` (dirección + administración), pero NO se reusa:
-- `ve_economia()` gobierna la plata de las OBRAS —contratos, certificados, márgenes— y el día que
-- alguien la abra a un rol más, la liquidación de sueldos se abriría con ella sin que nadie lo
-- decida. Una puerta propia hace que ampliar una no amplíe la otra.
--
-- JEFE DE OBRA NO ENTRA, y es el caso que hay que probar: `es_administracion()` lo incluye desde el
-- 19/08/2026 y es la función que gobierna el resto del legajo, al que el jefe sí entra a cargar
-- asistencia. Usar esa acá le abriría los sueldos del plantel entero.

create or replace function public.liquida_sueldos()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(public.current_rol() in ('direccion', 'administracion'), false)
$function$;

comment on function public.liquida_sueldos() is
  'Quién entra al módulo Liquidación de horas: dirección y administración. Jefe de obra NO. '
  'Es una puerta propia y no ve_economia(): ampliar la economía de obra no debe abrir los sueldos.';

create table if not exists public.persona_adelanto (
  id           uuid primary key default gen_random_uuid(),
  persona_id   uuid not null references public.personas(id) on delete restrict,
  -- La quincena a la que se imputa, por su primer día. No es `date_trunc` de `fecha`: un adelanto
  -- entregado el 14 puede ser a cuenta de la quincena que arranca el 16, y sólo quien lo entrega
  -- sabe cuál de las dos. Derivarlo de la fecha lo restaría de la quincena equivocada.
  quincena     date not null,
  fecha        date not null,
  importe      numeric(14,2) not null,
  clase        text not null,
  canal        text not null,
  nota         text,
  -- QUIÉN LO ENTREGÓ. Un descuento del sueldo sin autor es un descuento que nadie firma.
  autor        uuid,
  cargado_en   timestamptz not null default now(),
  -- Si el movimiento del banco apareció, se ata: es lo que convierte una declaración en evidencia.
  nomina_adelanto_id uuid references public.nomina_adelanto(id) on delete set null,

  constraint persona_adelanto_positivo check (importe > 0),
  constraint persona_adelanto_clase check (clase in ('adelanto', 'ya_transferido')),
  constraint persona_adelanto_canal check (canal in ('efectivo', 'banco')),
  -- EL EFECTIVO NO TIENE MOVIMIENTO BANCARIO QUE MOSTRAR. Atar uno sería afirmar una conciliación
  -- que no puede existir.
  constraint persona_adelanto_efectivo_sin_banco check (
    canal = 'banco' or nomina_adelanto_id is null
  )
);

create index if not exists persona_adelanto_quincena
  on public.persona_adelanto (quincena, persona_id);

comment on table public.persona_adelanto is
  'Lo entregado a cuenta de una quincena. clase=adelanto se resta en la columna ADELANTO; clase=ya_transferido en YA TRANSFERIDO (un giro anterior al lote NO es un adelanto, R5 del handoff v2). nomina_adelanto_id ata la declaración al movimiento del extracto cuando aparece.';
comment on column public.persona_adelanto.quincena is
  'Primer día de la quincena a la que se imputa. Se declara, no se deriva de fecha: un adelanto del 14 puede ser a cuenta de la quincena que arranca el 16.';

alter table public.persona_adelanto enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='persona_adelanto' and policyname='persona_adelanto_lee_admin') then
    create policy persona_adelanto_lee_admin on public.persona_adelanto
      for select to authenticated using (public.liquida_sueldos());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='persona_adelanto' and policyname='persona_adelanto_escribe_admin') then
    create policy persona_adelanto_escribe_admin on public.persona_adelanto
      for insert to authenticated with check (public.liquida_sueldos());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='persona_adelanto' and policyname='persona_adelanto_corrige_admin') then
    create policy persona_adelanto_corrige_admin on public.persona_adelanto
      for update to authenticated using (public.liquida_sueldos()) with check (public.liquida_sueldos());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='persona_adelanto' and policyname='persona_adelanto_srv') then
    create policy persona_adelanto_srv on public.persona_adelanto
      for all to service_role using (true) with check (true);
  end if;
end $$;

-- POLICY SIN GRANT ES «permission denied». Van las dos, siempre.
grant select, insert, update on public.persona_adelanto to authenticated;
grant all on public.persona_adelanto to service_role;
-- BORRAR UN ADELANTO BORRARÍA LA PRUEBA DE QUE SE ENTREGÓ PLATA. Se corrige, no se borra.
revoke delete on public.persona_adelanto from authenticated;
