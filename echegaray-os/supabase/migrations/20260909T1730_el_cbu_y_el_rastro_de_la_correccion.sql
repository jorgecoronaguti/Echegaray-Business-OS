-- 20260909T1730 · EL PADRÓN DEL LOTE Y EL RASTRO DEL DÍA CORREGIDO
--
-- Dos huecos del §7 del handoff v2, en una migración porque los dos son sobre datos que hoy viven
-- fuera de la base: el CBU está en una planilla y la corrección de un día no queda en ningún lado.
--
-- ═══ 1 · CBU Y TITULARIDAD ═══
--
-- Sin el CBU en `personas`, conciliar el lote de haberes contra el extracto se hace por NOMBRE, y el
-- banco escribe los nombres como quiere (JORNALES ya invierte nombre y apellido en abril/26). La
-- titularidad es un dato aparte y no un adorno: un CBU a nombre de otro es la diferencia entre un
-- pago y un problema, y sólo se sabe si se registra.

alter table public.personas
  add column if not exists cbu             text,
  add column if not exists cbu_titular     text,
  add column if not exists cbu_verificado_en date;

-- 22 dígitos, o nada. Un CBU de 21 se acepta en una planilla y rebota en el banco el viernes.
alter table public.personas drop constraint if exists personas_cbu_valido;
alter table public.personas add constraint personas_cbu_valido check (cbu is null or cbu ~ '^[0-9]{22}$');

comment on column public.personas.cbu_titular is
  'A nombre de quién está la cuenta. Distinto de la persona = se paga a un tercero, y eso se decide, no se descubre.';
comment on column public.personas.cbu_verificado_en is
  'Cuándo se comprobó contra el comprobante del banco. NULL = declarado y no verificado; no es lo mismo.';

-- LA COLUMNA NUEVA NACE SIN PERMISO — «RLS no es GRANT», y el grant de personas es por columna
-- desde 20260819T4900 (`retribucion_pactada` sigue cerrada para todos). El CBU se lee y se escribe
-- sólo desde el módulo de liquidación, así que no se abre a `authenticated` en general: lo mueve el
-- servidor con service role, y la lectura va por la puerta del módulo.
grant select (cbu, cbu_titular, cbu_verificado_en) on public.personas to authenticated;

-- ═══ 2 · R8 · EDITAR UN DÍA DEJA RASTRO, Y EL ORIGINAL NO SE PIERDE ═══
--
-- `registros_hh` guarda `corrigio` y `corregido_en`, pero NO el valor anterior: después de la
-- segunda corrección nadie puede decir de cuánto se venía. La fila de la pantalla 3 promete
-- «corrigió J. Corona el 08/09 · era 9» y «Ver el original» — sin el valor viejo esa promesa no se
-- puede cumplir, y una pantalla que promete evidencia que no tiene es peor que una que no promete.
--
-- Es una tabla y no dos columnas porque un día puede corregirse más de una vez: dos columnas
-- guardarían sólo la última y borrarían el original en la segunda pasada.

create table if not exists public.registro_hh_correccion (
  id             uuid primary key default gen_random_uuid(),
  registro_id    uuid not null references public.registros_hh(id) on delete cascade,
  horas_antes    numeric(10,2),
  horas_despues  numeric(10,2),
  tipo_antes     text,
  tipo_despues   text,
  motivo         text,
  autor          uuid,
  corregido_en   timestamptz not null default now(),

  -- UNA CORRECCIÓN QUE NO CAMBIA NADA NO ES UNA CORRECCIÓN: sería ruido en el historial que
  -- alguien va a leer para entender por qué un jornal no cierra.
  constraint registro_hh_correccion_cambia_algo check (
    horas_antes is distinct from horas_despues or tipo_antes is distinct from tipo_despues
  )
);

create index if not exists registro_hh_correccion_registro
  on public.registro_hh_correccion (registro_id, corregido_en desc);

comment on table public.registro_hh_correccion is
  'El historial de correcciones de un día cargado (R8 del handoff v2): qué valor había, cuál quedó, quién y cuándo. El original nunca se pierde: la PRIMERA fila de este historial lo tiene.';

alter table public.registro_hh_correccion enable row level security;

do $$
begin
  -- LEER EL RASTRO NO ES LEER UN SUELDO. Quien puede cargar y corregir el día —el jefe de obra,
  -- por `es_administracion()`— tiene que poder ver que lo corrigió: esconderle su propia corrección
  -- haría que la vuelva a hacer. Lo que el jefe no ve es la plata, y acá no hay plata.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='registro_hh_correccion' and policyname='registro_hh_correccion_lee_admin') then
    create policy registro_hh_correccion_lee_admin on public.registro_hh_correccion
      for select to authenticated using (public.es_administracion());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='registro_hh_correccion' and policyname='registro_hh_correccion_escribe_admin') then
    create policy registro_hh_correccion_escribe_admin on public.registro_hh_correccion
      for insert to authenticated with check (public.es_administracion());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='registro_hh_correccion' and policyname='registro_hh_correccion_srv') then
    create policy registro_hh_correccion_srv on public.registro_hh_correccion
      for all to service_role using (true) with check (true);
  end if;
end $$;

grant select, insert on public.registro_hh_correccion to authenticated;
grant all on public.registro_hh_correccion to service_role;
-- EL RASTRO NO SE EDITA NI SE BORRA: es lo único que prueba qué decía el día antes.
revoke update, delete on public.registro_hh_correccion from authenticated;
