-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LOS RECIBOS TIENEN UN NÚMERO QUE SE VA SIGUIENDO — una sola numeración, en la base (dueño, 02/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Dueño, textual: *«necesito q los recibos de pago tengan una numeracion q se vaya siguiendo, una
-- codificacion, todos los recibos. los de pago y los de cobros de todas las secciones q manejen recibos en
-- app ecsas. revisar y rehacer»*.
--
-- ═══ QUÉ HABÍA Y POR QUÉ NO ALCANZABA ═══
--
-- · `recibo_liquidacion.codigo` era una columna GENERADA 'REC-<año>-<NNNN>' sobre una identity: sin UNIQUE,
--   y una identity es una sequence — cada rollback (un CHECK que rebota, una conexión cortada) quema un
--   número y deja un hueco que nadie puede explicar. El año, además, reiniciaba la lectura: «REC-2026-0003»
--   y «REC-2027-0003» son dos recibos con el mismo número.
-- · El recibo del gasto manual de Efectivo (`efectivo_recibo_firma`) no tenía número propio: el PDF mostraba
--   el ER de la ENTREGA, que es de la entrega y se repite en todos sus gastos.
-- · El recibo de cobro al cliente se numeraba a mano, y el script que lo arma tenía el número escrito en el
--   código ('18').
--
-- ═══ UNA FUENTE, DOS SERIES ═══
--
-- `recibo_serie` guarda el último número de cada serie y `tomar_numero_de_recibo` lo avanza con
-- `update … returning` bajo lock de fila, DENTRO de la transacción que inserta el recibo. Es el patrón de
-- `remito_contador` (20260929T1500): si la transacción se cae, el número vuelve con ella. Sin huecos.
--
-- · RP = recibos de PAGO. La quincena del personal y el gasto manual de efectivo comparten UN correlativo:
--   el dueño pidió que los pagos se sigan, no una serie por pantalla.
-- · RC = recibos de COBRO a clientes. Arranca en el mayor número entero ya usado en `recibo_cliente.numero`
--   (los sembrados desde Drive), para que el próximo sea el siguiente y no repita uno entregado.
--
-- El código impreso es `<serie>-<6 dígitos>` (RP-000123): `codigo_de_recibo` lo arma, y es la misma regla
-- que `src/shared/recibo/codigoDeRecibo.ts` en la app. Seis dígitos son un relleno, no un tope: el número
-- 1.000.000 sale 'RP-1000000', no truncado.
--
-- ═══ UN NÚMERO IMPRESO NO CAMBIA ═══
--
-- Un recibo con número ya pudo haberse entregado firmado. Un trigger rechaza cualquier UPDATE que cambie
-- `serie_numero` o `codigo` de una fila que ya los tiene; `efectivo_recibo_firma` ya rechazaba todo UPDATE.
-- Reemitir un recibo de la quincena no reusa el número: es OTRA fila (otro hecho, 20260922T2600) y toma
-- el siguiente. El lote que encuentra el MISMO papel ya guardado no registra otro y conserva el número.
--
-- ═══ EL PORTAL DEL CLIENTE NO SE TOCA ═══
--
-- `recibo_cliente.numero` sigue siendo el número pelado ('18'): el portal lo cruza con
-- `esquema_pago.recibo_numero` y lo muestra así. 'RC-000018' es cómo lo escribe el OS, no lo que se guarda.
--
-- ═══ QUIÉN ═══
--
-- Toman número sólo las funciones `security definer` que insertan el recibo. `tomar_numero_de_recibo` no
-- tiene execute para `authenticated`: una llamada suelta por PostgREST consumiría un número sin recibo
-- detrás — el hueco que esto existe para evitar. `recibo_serie` se lee, no se escribe por la API.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

-- ── LA SERIE ─────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.recibo_serie (
  serie       text primary key check (serie ~ '^[A-Z]{2}$'),
  descripcion text not null,
  ultimo      integer not null check (ultimo >= 0)
);
comment on table public.recibo_serie is
  'El último número entregado de cada serie de recibos (RP pago, RC cobro). Lo avanza sólo '
  'tomar_numero_de_recibo, dentro de la transacción del recibo: sin huecos.';

alter table public.recibo_serie enable row level security;
revoke all on public.recibo_serie from anon, public, authenticated;
grant select on public.recibo_serie to authenticated;
drop policy if exists recibo_serie_select on public.recibo_serie;
create policy recibo_serie_select on public.recibo_serie for select to authenticated using (true);

insert into public.recibo_serie (serie, descripcion, ultimo)
values ('RP', 'Recibos de pago: quincena del personal y gasto manual de efectivo', 0)
on conflict (serie) do nothing;

-- RC arranca donde terminó la numeración a mano. Sólo los valores que son un entero: un número de recibo
-- escrito raro no se adivina. `greatest` hace la corrida repetible: nunca baja una serie que ya avanzó.
insert into public.recibo_serie (serie, descripcion, ultimo)
select 'RC', 'Recibos de cobro a clientes',
       coalesce(max(btrim(numero)::integer), 0)
  from public.recibo_cliente
 where btrim(numero) ~ '^[0-9]{1,9}$'
on conflict (serie) do update set ultimo = greatest(public.recibo_serie.ultimo, excluded.ultimo);

-- ── EL CÓDIGO ────────────────────────────────────────────────────────────────────────────────────
create or replace function public.codigo_de_recibo(p_serie text, p_numero integer) returns text
language plpgsql immutable strict set search_path = '' as $$
begin
  if p_serie !~ '^[A-Z]{2}$' then
    raise exception 'serie de recibo inválida: %', p_serie using errcode = 'P0001';
  end if;
  if p_numero < 1 then
    raise exception 'un recibo se numera desde 1: %', p_numero using errcode = 'P0001';
  end if;
  -- `lpad` TRUNCA lo que pasa del ancho: el 1.000.000 saldría '100000'. Se rellena sólo lo que falta.
  return p_serie || '-' || case when length(p_numero::text) >= 6 then p_numero::text
                                else lpad(p_numero::text, 6, '0') end;
end $$;
grant execute on function public.codigo_de_recibo(text, integer) to authenticated;

-- ── TOMAR EL SIGUIENTE ───────────────────────────────────────────────────────────────────────────
create or replace function public.tomar_numero_de_recibo(p_serie text) returns integer
language plpgsql security definer set search_path = public as $$
declare v_numero integer;
begin
  update public.recibo_serie set ultimo = ultimo + 1 where serie = p_serie returning ultimo into v_numero;
  if v_numero is null then
    raise exception 'la serie de recibos «%» no existe', p_serie using errcode = 'P0001';
  end if;
  return v_numero;
end $$;
revoke all on function public.tomar_numero_de_recibo(text) from public, anon, authenticated;
grant execute on function public.tomar_numero_de_recibo(text) to service_role;

-- ── EL NÚMERO NO CAMBIA UNA VEZ PUESTO ───────────────────────────────────────────────────────────
-- Se permite pasar de vacío a numerado (el backfill de abajo); nunca de un número a otro.
create or replace function public._recibo_numero_inmutable() returns trigger
language plpgsql as $$
begin
  if old.serie_numero is not null
     and (new.serie_numero is distinct from old.serie_numero or new.codigo is distinct from old.codigo) then
    raise exception 'el número de un recibo no se cambia: % ya está impreso', old.codigo using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ── RECIBO DE QUINCENA ───────────────────────────────────────────────────────────────────────────
-- `codigo` deja de ser generada y conserva su nombre: la ficha, el teléfono y la vista
-- `recibo_liquidacion_emitido` ya lo leen así, y siguen leyéndolo sin cambiar una línea.
alter table public.recibo_liquidacion add column if not exists serie_numero integer;
alter table public.recibo_liquidacion alter column codigo drop expression if exists;

drop trigger if exists recibo_liquidacion_numero_inmutable on public.recibo_liquidacion;
create trigger recibo_liquidacion_numero_inmutable before update on public.recibo_liquidacion
  for each row execute function public._recibo_numero_inmutable();

-- LOS YA EMITIDOS, EN EL ORDEN EN QUE SE EMITIERON (`numero`, la identity): RP-000001 en adelante, y la
-- serie queda en el último. Sólo los que no tienen número: correrla dos veces no renumera nada.
do $$
declare v_base integer; v_n integer;
begin
  select ultimo into v_base from public.recibo_serie where serie = 'RP' for update;
  with pendientes as (
    select id, row_number() over (order by numero, id) as orden
      from public.recibo_liquidacion where serie_numero is null
  )
  update public.recibo_liquidacion r
     set serie_numero = v_base + p.orden,
         codigo = public.codigo_de_recibo('RP', (v_base + p.orden)::integer)
    from pendientes p where r.id = p.id;
  get diagnostics v_n = row_count;
  update public.recibo_serie set ultimo = ultimo + v_n where serie = 'RP';
end $$;

alter table public.recibo_liquidacion alter column serie_numero set not null;
alter table public.recibo_liquidacion alter column codigo set not null;
create unique index if not exists recibo_liquidacion_serie_numero_key on public.recibo_liquidacion (serie_numero);
create unique index if not exists recibo_liquidacion_codigo_key on public.recibo_liquidacion (codigo);
do $$
begin
  -- EL CÓDIGO DICE SU NÚMERO: no puede quedar 'RP-000007' sobre el número 8.
  if not exists (select 1 from pg_constraint where conname = 'recibo_liquidacion_codigo_de_su_numero') then
    alter table public.recibo_liquidacion add constraint recibo_liquidacion_codigo_de_su_numero
      check (codigo = public.codigo_de_recibo('RP', serie_numero));
  end if;
end $$;
comment on column public.recibo_liquidacion.codigo is
  'RP-NNNNNN, de la serie de pago (recibo_serie). Lo pone registrar_recibo_liquidacion y no cambia nunca.';

-- Misma firma, mismo cuerpo que 20260922T2600 más el número. El número se toma DESPUÉS de las validaciones
-- y en la misma transacción del insert: un recibo rechazado no consume número.
create or replace function public.registrar_recibo_liquidacion(
  p_persona uuid, p_desde date, p_hasta date, p_nombre text, p_renglones jsonb,
  p_categoria text default null, p_horas numeric default null, p_banco numeric default null,
  p_efectivo numeric default null, p_total numeric default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_numero integer;
begin
  if auth.uid() is null then
    raise exception 'hace falta un usuario logueado' using errcode = '42501';
  end if;
  if not public.liquida_sueldos() then
    raise exception 'sólo dirección y administración emiten recibos' using errcode = '42501';
  end if;
  if not exists (select 1 from personas where id = p_persona) then
    raise exception 'la persona no existe' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'el recibo tiene que decir a nombre de quién es' using errcode = 'P0001';
  end if;
  -- UN PAPEL VACÍO NO SE EMITE: si no dice ni horas ni medios, no hay nada que la persona firme.
  if coalesce(jsonb_array_length(p_renglones -> 'horas'), 0)
   + coalesce(jsonb_array_length(p_renglones -> 'medios'), 0) = 0 then
    raise exception 'el recibo no dice nada: no se emite' using errcode = 'P0001';
  end if;
  v_numero := public.tomar_numero_de_recibo('RP');
  insert into recibo_liquidacion (persona_id, quincena_desde, quincena_hasta, nombre, categoria,
                                  horas, banco, efectivo, total, renglones, emitido_por,
                                  serie_numero, codigo)
  values (p_persona, p_desde, p_hasta, trim(p_nombre), nullif(trim(p_categoria), ''),
          p_horas, p_banco, p_efectivo, p_total, p_renglones, auth.uid(),
          v_numero, public.codigo_de_recibo('RP', v_numero))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.registrar_recibo_liquidacion(uuid, date, date, text, jsonb, text, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.registrar_recibo_liquidacion(uuid, date, date, text, jsonb, text, numeric, numeric, numeric, numeric) to authenticated;

-- ── RECIBO DEL GASTO MANUAL DE EFECTIVO ──────────────────────────────────────────────────────────
alter table public.efectivo_recibo_firma
  add column if not exists serie_numero integer,
  add column if not exists codigo text;

-- Los ya firmados (hoy ninguno) se numeran a continuación de los de quincena, por orden de firma. La tabla
-- rechaza todo UPDATE (20261001T0900): su trigger se apaga SÓLO para esto, dentro de esta transacción.
do $$
declare v_base integer; v_n integer;
begin
  select ultimo into v_base from public.recibo_serie where serie = 'RP' for update;
  alter table public.efectivo_recibo_firma disable trigger efectivo_recibo_firma_inmutable;
  with pendientes as (
    select rendicion_id, row_number() over (order by firmado_en, rendicion_id) as orden
      from public.efectivo_recibo_firma where serie_numero is null
  )
  update public.efectivo_recibo_firma f
     set serie_numero = v_base + p.orden,
         codigo = public.codigo_de_recibo('RP', (v_base + p.orden)::integer)
    from pendientes p where f.rendicion_id = p.rendicion_id;
  get diagnostics v_n = row_count;
  alter table public.efectivo_recibo_firma enable trigger efectivo_recibo_firma_inmutable;
  update public.recibo_serie set ultimo = ultimo + v_n where serie = 'RP';
end $$;

alter table public.efectivo_recibo_firma alter column serie_numero set not null;
alter table public.efectivo_recibo_firma alter column codigo set not null;
create unique index if not exists efectivo_recibo_firma_serie_numero_key on public.efectivo_recibo_firma (serie_numero);
create unique index if not exists efectivo_recibo_firma_codigo_key on public.efectivo_recibo_firma (codigo);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'efectivo_recibo_firma_codigo_de_su_numero') then
    alter table public.efectivo_recibo_firma add constraint efectivo_recibo_firma_codigo_de_su_numero
      check (codigo = public.codigo_de_recibo('RP', serie_numero));
  end if;
end $$;

-- Misma firma y mismo cuerpo que 20261001T0900 más el número, tomado tras las validaciones.
create or replace function public.firmar_recibo_gasto_manual(
  p_rendicion uuid, p_trazo text, p_aclaracion text, p_dni text default null)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := auth.uid();
  r public.efectivo_rendicion;
  e public.efectivo_entrega;
  v_acl text := nullif(btrim(regexp_replace(coalesce(p_aclaracion, ''), '\s+', ' ', 'g')), '');
  v_dni text := nullif(regexp_replace(coalesce(p_dni, ''), '\D', '', 'g'), '');
  v_en timestamptz;
  v_numero integer;
begin
  if v_usr is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  -- `for update`: dos pantallas firmando a la vez no llegan las dos al insert.
  select * into r from public.efectivo_rendicion where id = p_rendicion for update;
  if r.id is null then raise exception 'ese gasto no existe' using errcode = 'P0001'; end if;
  if r.origen is distinct from 'manual' then
    raise exception 'sólo los gastos cargados a mano llevan recibo firmado: un ticket ya tiene su comprobante' using errcode = 'P0001';
  end if;
  select * into e from public.efectivo_entrega where id = r.entrega_id;
  if not coalesce(public._efectivo_actua_por(e.persona_id), false) then
    raise exception 'sólo firma el recibo quien rinde esta entrega: el jefe de obra que la tiene, o Administración' using errcode = '42501';
  end if;
  if exists (select 1 from public.efectivo_recibo_firma where rendicion_id = p_rendicion) then
    raise exception 'el recibo de este gasto ya está firmado' using errcode = 'P0001';
  end if;
  if v_acl is null or length(v_acl) < 3 then
    raise exception 'escribí el nombre de quien firma (aclaración)' using errcode = 'P0001';
  end if;
  if length(v_acl) > 120 then raise exception 'la aclaración es demasiado larga' using errcode = 'P0001'; end if;
  if v_dni is not null and v_dni !~ '^[0-9]{6,8}$' then
    raise exception 'el DNI tiene entre 6 y 8 números (o dejalo vacío)' using errcode = 'P0001';
  end if;
  -- El mismo criterio que `esTrazoGuardable` de la app: un SVG con un path, no cualquier texto.
  if p_trazo is null or length(p_trazo) > 60000
     or p_trazo !~ '^<svg [^>]*viewBox="0 0 [0-9]+ [0-9]+">' or p_trazo !~ '<path d="M[0-9 MLl-]+"' or p_trazo not like '%</svg>' then
    raise exception 'falta la firma: firmá arriba de la línea' using errcode = 'P0001';
  end if;
  v_numero := public.tomar_numero_de_recibo('RP');
  insert into public.efectivo_recibo_firma
    (rendicion_id, entrega_id, monto, fecha, concepto, proveedor, trazo, aclaracion, dni, registrado_por,
     serie_numero, codigo)
  values
    (r.id, r.entrega_id, r.monto, coalesce(r.fecha, (r.imputada_en at time zone 'America/Argentina/San_Juan')::date),
     nullif(btrim(coalesce(r.concepto, '')), ''), nullif(btrim(coalesce(r.proveedor, '')), ''),
     p_trazo, v_acl, v_dni, v_usr,
     v_numero, public.codigo_de_recibo('RP', v_numero))
  returning firmado_en into v_en;
  return v_en;
end $$;
revoke all on function public.firmar_recibo_gasto_manual(uuid, text, text, text) from public, anon;
grant execute on function public.firmar_recibo_gasto_manual(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
