-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CADA CAMBIO DEJA QUIÉN Y CUÁNDO — fundación de la solapa Auditoría de la Ficha 360 (§29)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Hoy el legajo y el contrato guardan `actualizado_por` y `actualizado_en`: el ÚLTIMO que tocó, no
-- QUÉ tocó. Con eso no se puede contestar la única pregunta que la solapa Auditoría tiene que
-- contestar —«¿quién le cambió la categoría, y desde qué valor?»— y tampoco la que motivó la 5000:
-- si alguien pisó un monto contratado, el rastro es una fecha y un nombre sobre un valor que ya no
-- existe.
--
-- Esta migración deja la TABLA y el DATO FLUYENDO. La pantalla es de otro frente.
--
-- ═══ POR QUÉ LA RETRIBUCIÓN Y EL MONTO SE REGISTRAN TAPADOS ═══
--
-- La auditoría la lee `es_administracion()`, que incluye al jefe de obra — el mismo rol al que la
-- 5000 le acaba de sacar la escritura del sueldo pactado y del monto contratado, y al que la 2900 le
-- había sacado la lectura. Registrar el valor en claro convertiría la auditoría en la ventana por la
-- que se leen las dos columnas que tres migraciones cerraron: un cambio de $3.910/h a $4.200/h
-- publica los dos números.
--
-- Se registra el HECHO —que el sueldo cambió, quién y cuándo— y se tapa el VALOR con `•••`. La
-- alternativa era un hash: no se eligió porque un hash de un monto es reversible por fuerza bruta en
-- segundos (el espacio es chico y son enteros), o sea que daría la sensación de tapado sin tapar
-- nada. La otra alternativa —partir el SELECT en dos policies, una por `ve_economia()` para los
-- campos de plata— queda anotada para cuando la solapa exista y alguien pida ver el número: es más
-- fina, pero hoy nadie la necesita y agrega una segunda regla que mantener.

-- ── 1 · la tabla ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.entidad_cambio (
  id          uuid primary key default gen_random_uuid(),
  entidad     text not null,
  entidad_id  text not null,
  campo       text,
  antes       text,
  despues     text,
  autor       uuid default auth.uid(),
  en          timestamptz not null default now()
);

comment on table public.entidad_cambio is
  'Bitácora de cambios campo por campo. `entidad_id` es text porque las claves del OS no son todas '
  'uuid (obra_canonica.id es un slug). Los campos económicos se registran con el valor tapado: el '
  'hecho es auditable, el número no se publica por acá.';
comment on column public.entidad_cambio.autor is
  'auth.uid() del que hizo el cambio. NULL cuando escribió el orquestador por service_role: es un '
  'dato honesto —no hubo persona— y no se inventa un usuario de sistema para llenarlo.';

create index if not exists entidad_cambio_por_entidad
  on public.entidad_cambio (entidad, entidad_id, en desc);

-- ── 2 · RLS: se lee, no se escribe ────────────────────────────────────────────────────────────
-- Sin policy de INSERT y sin GRANT de insert: nadie escribe esta tabla por PostgREST. La escriben
-- los triggers `security definer` de abajo, que corren como el dueño y no pasan por la RLS. Un
-- registro de auditoría que el auditado puede fabricar no es un registro de auditoría.
alter table public.entidad_cambio enable row level security;

revoke all on public.entidad_cambio from authenticated, anon;
grant select on public.entidad_cambio to authenticated;
grant all on public.entidad_cambio to service_role;

drop policy if exists entidad_cambio_select on public.entidad_cambio;
create policy entidad_cambio_select on public.entidad_cambio
  for select to authenticated
  using (public.es_administracion());

drop policy if exists entidad_cambio_srv on public.entidad_cambio;
create policy entidad_cambio_srv on public.entidad_cambio
  for all to service_role using (true) with check (true);

-- ── 3 · el trigger, uno solo para todas las entidades ─────────────────────────────────────────
--
-- Los campos vigilados y los tapados viajan en `TG_ARGV` en vez de estar escritos adentro: así una
-- entidad nueva se suma con un `create trigger` y no con otra función igual a ésta. Compara sobre
-- `to_jsonb` porque `->>` normaliza cualquier tipo a texto y `is distinct from` trata bien el NULL:
-- pasar de NULL a un valor y de un valor a NULL son cambios, y con `<>` no lo serían.
--
-- Sólo UPDATE. Un alta no tiene «antes», y la fila de creación ya la cuenta `creado_por`/`created_at`
-- en cada tabla; registrar el alta acá duplicaría 30 filas por persona nueva sin agregar una
-- pregunta que hoy no se pueda contestar. Queda declarado como límite.
create or replace function public.auditar_cambio()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_entidad text := tg_argv[0];
  v_campos  text[] := string_to_array(tg_argv[1], ',');
  v_tapados text[] := case when coalesce(tg_argv[2], '') = '' then array[]::text[]
                           else string_to_array(tg_argv[2], ',') end;
  v_viejo   jsonb := to_jsonb(old);
  v_nuevo   jsonb := to_jsonb(new);
  v_campo   text;
  v_antes   text;
  v_despues text;
begin
  foreach v_campo in array v_campos loop
    v_antes   := v_viejo ->> v_campo;
    v_despues := v_nuevo ->> v_campo;
    if v_antes is distinct from v_despues then
      if v_campo = any (v_tapados) then
        v_antes := case when v_antes is null then null else '•••' end;
        v_despues := case when v_despues is null then null else '•••' end;
      end if;
      insert into public.entidad_cambio (entidad, entidad_id, campo, antes, despues, autor)
      values (v_entidad, v_nuevo ->> 'id', v_campo, v_antes, v_despues, auth.uid());
    end if;
  end loop;
  return null;
end;
$$;

comment on function public.auditar_cambio() is
  'Trigger genérico de bitácora. TG_ARGV: [0] nombre de la entidad, [1] campos vigilados separados '
  'por coma, [2] campos cuyo VALOR se tapa con ••• (el cambio se registra igual). Definer para '
  'poder escribir entidad_cambio, que nadie puede escribir directo.';

-- ── 4 · las dos entidades que las 5000 acaba de cerrar ────────────────────────────────────────
-- Los RPC `fijar_retribucion()` y `fijar_monto_contratado()` hacen un UPDATE normal: quedan
-- cubiertos por estos triggers sin una línea más.
drop trigger if exists personas_auditar on public.personas;
create trigger personas_auditar
  after update on public.personas
  for each row execute function public.auditar_cambio(
    'personas',
    'nombre_completo,dni,cuil,fecha_nacimiento,legajo,fecha_ingreso,fecha_egreso,en_la_empresa,'
    'categoria,especialidad,puesto,convenio_colectivo,modalidad_liquidacion,retribucion_pactada',
    'retribucion_pactada');

drop trigger if exists obra_canonica_auditar on public.obra_canonica;
create trigger obra_canonica_auditar
  after update on public.obra_canonica
  for each row execute function public.auditar_cambio(
    'obra_canonica', 'monto_contratado', 'monto_contratado');
