-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- HERRAMIENTAS · LOS PAPELES DE UN RODADO — título, cédula, RTO, seguro, patente
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Dueño, 22/09/2026: *«en esa carpeta esta todo lo relacionado a rodados de la empresa [Drive] crea carga
-- arma todo en modulo herramientas segun corresponda»*. La pantalla de Rodados ya decía, textual, «papeles y
-- plan de service sin cargar»: esto llena esa mitad. El service NO entra acá — un plan de mantenimiento es
-- otro modelo (periodicidad, km, tareas) y prometerlo con esta tabla sería fingirlo.
--
-- ═══ QUÉ ES UNA FILA ═══
--
-- UN papel de UN activo, con el archivo que lo respalda en Drive. El papel manda sobre lo que el OS afirma:
-- si el RTO vence el 03/2027, lo dice el PDF del RTO y acá queda el `drive_file_id` para abrirlo. Un dato que
-- el papel no dice va NULL: un vencimiento inventado es peor que ninguno, porque se confía en él.
--
-- ═══ EL VIGENTE ES EL ÚLTIMO, NO EL ÚNICO ═══
--
-- Los papeles se renuevan: cada RTO nuevo es una fila nueva y la vieja queda. `activo_papel_vigente` devuelve
-- el último por (activo, tipo) según `vence_en` y, con empate, el más nuevo. El historial no se borra: es lo
-- que prueba que la cobertura fue continua.
--
-- ═══ QUIÉN ESCRIBE ═══
--
-- Sólo `registrar_papel_activo`, `security definer`, como el resto del módulo (`_activo_usuario`): la tabla no
-- tiene ninguna policy de escritura. Leer, cualquiera autenticado: un chofer tiene que poder ver el
-- vencimiento del RTO de la camioneta que maneja.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

create table if not exists public.activo_papel (
  id             uuid primary key default gen_random_uuid(),
  activo_id      uuid not null references public.activo(id),
  -- Lo que es el papel. `otro` existe para no perder un archivo que no encaja en ninguno.
  tipo           text not null check (tipo in ('titulo', 'cedula_verde', 'rto', 'seguro', 'patente', 'factura_compra', 'otro')),
  -- Número de póliza, de oblea del RTO, de factura… Lo que identifica ESE papel. Null si no lo trae.
  numero         text,
  -- Quién lo emite: la compañía del seguro, el taller del RTO, el municipio de la patente.
  emisor         text,
  -- El titular que figura EN EL PAPEL, tal como está escrito. No se cruza con el padrón: un rodado
  -- puede estar a nombre de una persona y usarse en la empresa, y eso es un dato, no un error.
  titular        text,
  emitido_en     date,
  -- El vencimiento que DECLARA el papel. Null = el papel no vence o no lo dice.
  vence_en       date,
  -- El archivo en Drive. `drive_file_id` es único: cargar dos veces el mismo PDF no duplica el papel.
  drive_file_id  text unique,
  drive_nombre   text,
  drive_carpeta  text,
  observacion    text,
  cargado_en     timestamptz not null default now(),
  cargado_por    uuid
);
create index if not exists activo_papel_activo_idx on public.activo_papel (activo_id, tipo);
create index if not exists activo_papel_vence_idx on public.activo_papel (vence_en) where vence_en is not null;
comment on table public.activo_papel is
  'Los papeles de un activo (título, cédula, RTO, seguro, patente) con su archivo de Drive. El papel manda: '
  'lo que no dice queda NULL. Escribe sólo registrar_papel_activo.';

alter table public.activo_papel enable row level security;
revoke all on public.activo_papel from anon, public;
revoke insert, update, delete on public.activo_papel from authenticated;
grant select on public.activo_papel to authenticated;
drop policy if exists activo_papel_select on public.activo_papel;
create policy activo_papel_select on public.activo_papel for select to authenticated using (true);

-- ── EL PAPEL VIGENTE DE CADA TIPO, Y CUÁNTO LE QUEDA ────────────────────────────────────────────
-- `dias` es negativo si ya venció. La pantalla decide con qué color lo dice; la base no opina de colores.
create or replace view public.activo_papel_vigente with (security_invoker = true) as
  select distinct on (p.activo_id, p.tipo)
         p.*,
         case when p.vence_en is null then null
              else (p.vence_en - (now() at time zone 'America/Argentina/San_Juan')::date) end as dias
    from public.activo_papel p
   order by p.activo_id, p.tipo, p.vence_en desc nulls last, p.cargado_en desc;
grant select on public.activo_papel_vigente to authenticated;

-- ── REGISTRAR UN PAPEL ──────────────────────────────────────────────────────────────────────────
-- Idempotente por `drive_file_id`: volver a correr la carga desde Drive no duplica nada, y si el archivo ya
-- estaba, ACTUALIZA lo leído (un PDF que se releyó mejor no obliga a borrar a mano).
create or replace function public.registrar_papel_activo(
  p_activo uuid, p_tipo text, p_drive_file_id text default null, p_drive_nombre text default null,
  p_drive_carpeta text default null, p_numero text default null, p_emisor text default null,
  p_titular text default null, p_emitido_en date default null, p_vence_en date default null,
  p_observacion text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._activo_usuario(); v_id uuid;
begin
  if not exists (select 1 from activo where id = p_activo) then
    raise exception 'el activo no existe' using errcode = 'P0001';
  end if;
  if p_vence_en is not null and p_emitido_en is not null and p_vence_en < p_emitido_en then
    raise exception 'el vencimiento no puede ser anterior a la emisión' using errcode = 'P0001';
  end if;
  insert into activo_papel (activo_id, tipo, numero, emisor, titular, emitido_en, vence_en,
                            drive_file_id, drive_nombre, drive_carpeta, observacion, cargado_por)
  values (p_activo, p_tipo, nullif(trim(p_numero), ''), nullif(trim(p_emisor), ''), nullif(trim(p_titular), ''),
          p_emitido_en, p_vence_en, nullif(trim(p_drive_file_id), ''), nullif(trim(p_drive_nombre), ''),
          nullif(trim(p_drive_carpeta), ''), nullif(trim(p_observacion), ''), v_usr)
  on conflict (drive_file_id) do update
    set tipo = excluded.tipo, numero = excluded.numero, emisor = excluded.emisor, titular = excluded.titular,
        emitido_en = excluded.emitido_en, vence_en = excluded.vence_en, observacion = excluded.observacion,
        activo_id = excluded.activo_id
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.registrar_papel_activo(uuid, text, text, text, text, text, text, text, date, date, text) from public, anon;
grant execute on function public.registrar_papel_activo(uuid, text, text, text, text, text, text, text, date, date, text) to authenticated;

notify pgrst, 'reload schema';
