-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- RECIBO DE PAGO EN EFECTIVO A UN TERCERO — el papel que firma quien cobra (dueño, 02/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Dueño, textual (reclamo): *«te pedí que me hicieras una función en módulo efectivo en donde pueda emitir un
-- recibo para que me firmen, no me lo hiciste»*. Caso de hoy: $ 950.000 en efectivo a Pedro Tello
-- (subcontratista, fila 1062 de Compras, OB-0011) y ningún papel para que lo firme. Hasta acá el OS sólo
-- emitía recibos al personal (`recibo_liquidacion`) y al gasto manual de una entrega a rendir.
--
-- ═══ QUÉ ES Y QUÉ NO ═══
--
-- Es el COMPROBANTE de un pago que ya se hizo: no mueve la caja, no escribe Compras, no rinde ninguna entrega.
-- El pago vive donde ya vivía (la fila de Compras); si el recibo también moviera plata, el mismo pago contaría
-- dos veces. Por eso la fila de Compras de la que se tomó queda sólo como referencia (`compra_fila`).
--
-- ═══ NÚMERO ═══
--
-- Serie RP, la misma de todos los pagos (20261002T1200: «que se vaya siguiendo»). Se toma con
-- `tomar_numero_de_recibo` DESPUÉS de validar y en la misma transacción del insert: un recibo rechazado no
-- consume número, y si el insert cae el número vuelve con él.
--
-- ═══ NO SE BORRA NI SE RENUMERA: SE ANULA ═══
--
-- El papel ya pudo salir firmado. La única escritura posterior es la anulación, una vez y con motivo, y anula
-- también el asiento del libro (`recibo_numero_asignado`): el número queda ocupado y dice por qué.
--
-- ═══ EL DOBLE CLIC NO EMITE DOS ═══
--
-- La pantalla genera el id del recibo antes de mandar. Si ese id ya existe (la misma emisión llegó dos veces)
-- la función devuelve el que hay y no toma otro número: un número tomado no se devuelve, y dos recibos por el
-- mismo pago obligarían a anular uno a mano.
--
-- ═══ QUIÉN ═══
--
-- Emite y anula `_efectivo_exigir_administracion()` (Dirección y Administración: `ve_economia()`), el mismo
-- portero del ABM de Efectivo. Leen los mismos: el recibo dice a quién se le pagó cuánto.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

create table if not exists public.recibo_pago_efectivo (
  id             uuid primary key,
  serie_numero   integer not null,
  codigo         text not null,
  fecha          date not null,
  -- LA FOTO DE LO IMPRESO. Los ids de abajo son de dónde se tomó, no lo que se imprime: si mañana el padrón
  -- cambia el nombre o el CUIT, el papel firmado no cambia. Sin FK a propósito: borrar o fusionar un proveedor
  -- o una obra no puede quedar trabado por un recibo, ni el recibo cambiar por eso.
  a_nombre_de    text not null check (btrim(a_nombre_de) <> ''),
  documento      text check (documento is null or documento ~ '^[0-9]{7,11}$'),
  importe        numeric(14, 2) not null check (importe > 0),
  concepto       text not null check (btrim(concepto) <> ''),
  obra           text,
  obra_id        text,
  proveedor_id   uuid,
  persona_id     uuid,
  compra_fila    integer,
  emitido_en     timestamptz not null default now(),
  emitido_por    uuid not null,
  anulado_en     timestamptz,
  anulado_motivo text,
  anulado_por    uuid,
  constraint recibo_pago_efectivo_codigo_de_su_numero check (codigo = public.codigo_de_recibo('RP', serie_numero)),
  constraint recibo_pago_efectivo_anulado_con_motivo
    check ((anulado_en is null) = (anulado_motivo is null) and (anulado_motivo is null or btrim(anulado_motivo) <> ''))
);
create unique index if not exists recibo_pago_efectivo_serie_numero_key on public.recibo_pago_efectivo (serie_numero);
create unique index if not exists recibo_pago_efectivo_codigo_key on public.recibo_pago_efectivo (codigo);
create index if not exists recibo_pago_efectivo_emitido_en_idx on public.recibo_pago_efectivo (emitido_en desc);
comment on table public.recibo_pago_efectivo is
  'Recibos de pago en efectivo a terceros (serie RP), emitidos desde Efectivo. Comprobante del pago, no lo '
  'registra: no mueve caja ni Compras. No se borra ni se renumera; se anula con motivo.';

alter table public.recibo_pago_efectivo enable row level security;
revoke all on public.recibo_pago_efectivo from anon, public, authenticated;
grant select on public.recibo_pago_efectivo to authenticated;
drop policy if exists recibo_pago_efectivo_select on public.recibo_pago_efectivo;
create policy recibo_pago_efectivo_select on public.recibo_pago_efectivo
  for select to authenticated using ((select public.ve_economia()));

-- Sólo la anulación, una vez. Ni el número, ni el importe, ni a quién: lo firmado no se reescribe.
create or replace function public._recibo_pago_efectivo_inmutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'un recibo numerado no se borra: % ya está impreso; se anula con motivo', old.codigo
      using errcode = 'P0001';
  end if;
  if old.anulado_en is not null
     or (new.id, new.serie_numero, new.codigo, new.fecha, new.a_nombre_de, new.documento, new.importe, new.concepto,
         new.obra, new.obra_id, new.proveedor_id, new.persona_id, new.compra_fila, new.emitido_en, new.emitido_por)
        is distinct from
        (old.id, old.serie_numero, old.codigo, old.fecha, old.a_nombre_de, old.documento, old.importe, old.concepto,
         old.obra, old.obra_id, old.proveedor_id, old.persona_id, old.compra_fila, old.emitido_en, old.emitido_por) then
    raise exception 'el recibo % no se cambia: sólo se anula, una vez', old.codigo using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists recibo_pago_efectivo_inmutable on public.recibo_pago_efectivo;
create trigger recibo_pago_efectivo_inmutable before update or delete on public.recibo_pago_efectivo
  for each row execute function public._recibo_pago_efectivo_inmutable();
drop trigger if exists recibo_pago_efectivo_no_se_vacia on public.recibo_pago_efectivo;
create trigger recibo_pago_efectivo_no_se_vacia before truncate on public.recibo_pago_efectivo
  for each statement execute function public._recibo_numerado_no_se_vacia();

-- ── EMITIR ───────────────────────────────────────────────────────────────────────────────────────
create or replace function public.emitir_recibo_pago_efectivo(
  p_id uuid, p_fecha date, p_a_nombre_de text, p_documento text, p_importe numeric, p_concepto text,
  p_obra text default null, p_obra_id text default null, p_proveedor_id uuid default null,
  p_persona_id uuid default null, p_compra_fila integer default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid;
  v_nombre text := nullif(btrim(regexp_replace(coalesce(p_a_nombre_de, ''), '\s+', ' ', 'g')), '');
  v_doc text := nullif(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g'), '');
  v_concepto text := nullif(btrim(regexp_replace(coalesce(p_concepto, ''), '\s+', ' ', 'g')), '');
  v_obra text := nullif(btrim(coalesce(p_obra, '')), '');
  v_ya public.recibo_pago_efectivo;
  v_numero integer;
begin
  v_usr := public._efectivo_exigir_administracion();
  if p_id is null then raise exception 'falta el id del recibo' using errcode = 'P0001'; end if;
  -- La misma emisión que llega dos veces devuelve la que hay: no toma otro número.
  select * into v_ya from public.recibo_pago_efectivo where id = p_id;
  if v_ya.id is not null then return v_ya.codigo; end if;
  if v_nombre is null or length(v_nombre) < 3 then
    raise exception 'el recibo tiene que decir quién recibe la plata' using errcode = 'P0001';
  end if;
  if v_doc is not null and length(v_doc) not between 7 and 11 then
    raise exception 'el DNI o CUIT tiene que tener entre 7 y 11 dígitos' using errcode = 'P0001';
  end if;
  if p_importe is null or p_importe <= 0 or p_importe <> round(p_importe, 2) then
    raise exception 'el importe tiene que ser mayor que cero, con hasta dos decimales' using errcode = 'P0001';
  end if;
  if v_concepto is null or length(v_concepto) < 3 then
    raise exception 'el recibo tiene que decir en concepto de qué' using errcode = 'P0001';
  end if;
  if p_fecha is null or p_fecha > (now() at time zone 'America/Argentina/San_Juan')::date then
    raise exception 'la fecha del recibo no puede ser futura' using errcode = 'P0001';
  end if;
  v_numero := public.tomar_numero_de_recibo('RP',
    'recibo_pago_efectivo:' || p_id || ' · ' || v_nombre || ' · $' || p_importe);
  insert into public.recibo_pago_efectivo (id, fecha, a_nombre_de, documento, importe, concepto, obra, obra_id,
                                           proveedor_id, persona_id, compra_fila, emitido_por,
                                           serie_numero, codigo)
  values (p_id, p_fecha, v_nombre, v_doc, p_importe, v_concepto, v_obra, nullif(btrim(coalesce(p_obra_id, '')), ''),
          p_proveedor_id, p_persona_id, p_compra_fila, v_usr,
          v_numero, public.codigo_de_recibo('RP', v_numero));
  return public.codigo_de_recibo('RP', v_numero);
end $$;
revoke all on function public.emitir_recibo_pago_efectivo(uuid, date, text, text, numeric, text, text, text, uuid, uuid, integer) from public, anon;
grant execute on function public.emitir_recibo_pago_efectivo(uuid, date, text, text, numeric, text, text, text, uuid, uuid, integer) to authenticated;

-- ── ANULAR ───────────────────────────────────────────────────────────────────────────────────────
create or replace function public.anular_recibo_pago_efectivo(p_id uuid, p_motivo text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid;
  v_motivo text := nullif(btrim(regexp_replace(coalesce(p_motivo, ''), '\s+', ' ', 'g')), '');
  r public.recibo_pago_efectivo;
begin
  v_usr := public._efectivo_exigir_administracion();
  if v_motivo is null or length(v_motivo) < 5 then
    raise exception 'anular un recibo exige decir por qué' using errcode = 'P0001';
  end if;
  select * into r from public.recibo_pago_efectivo where id = p_id for update;
  if r.id is null then raise exception 'ese recibo no existe' using errcode = 'P0001'; end if;
  if r.anulado_en is not null then raise exception 'el recibo % ya está anulado', r.codigo using errcode = 'P0001'; end if;
  update public.recibo_pago_efectivo set anulado_en = now(), anulado_motivo = v_motivo, anulado_por = v_usr
   where id = p_id;
  perform public.anular_numero_de_recibo('RP', r.serie_numero, 'recibo anulado: ' || v_motivo);
  return now();
end $$;
revoke all on function public.anular_recibo_pago_efectivo(uuid, text) from public, anon;
grant execute on function public.anular_recibo_pago_efectivo(uuid, text) to authenticated;

notify pgrst, 'reload schema';
