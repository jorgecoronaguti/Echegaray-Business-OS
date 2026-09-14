-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- «VENCIDA» SE DEFINE UNA SOLA VEZ — `public.estado_de_cobro(estado, fecha_cobro, hoy)`
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- EL PEDIDO (dueño, 14/09/2026): «marca cualquier cosa como vencido y no condice con lo que se ve en
-- el portal; todo tiene que consolidarse en Supabase y leerse de ahí».
--
-- LO MEDIDO ANTES DE ESTA MIGRACIÓN — cuatro definiciones del mismo concepto:
--   cliente_cobranza          emisión + plazo_cobro_dias() (30)            → ficha del cliente
--   obra_cuenta               emisión + 30, sólo filas con cobro en el año  → cartera, home
--   cliente_cuenta_corriente  estado in (Pendiente, Facturado) y Q < current_date (UTC)
--   portal                    todo lo no cobrado ni proyectado con Q < hoy UTC
--
-- LA REGLA (decisión del dueño): la columna U de la pestaña Cobranzas,
--     =IF(O="Cobrado";"Cobrado";IF(O="Pendiente";IF(Q<TODAY();"Vencido";Q-TODAY());O))
-- O = estado, Q = fecha_cobro. La fecha de venta (P) y la de emisión NO son vencimientos.
-- Hoy = hoy en San Juan. Gemelo en JS: orquestador/lib/cobranza-estado-de-cobro.mjs, comparado fila
-- por fila contra esta función en cobranza-estado-de-cobro.pg.test.mjs.
--
-- LO QUE ESTO CAMBIA (una vista que cambia de significado se dice):
--   · `esta_vencida` (cliente_cobranza), `vencido` (obra_cuenta) y `vencido`/`aging_*`/`por_vencer`/
--     `efectividad_pct` (cliente_cuenta_corriente, y por arrastre cliente_economia) pasan a la regla
--     del Sheet. Mismos nombres, mismos tipos.
--   · cliente_cobranza AGREGA al final `estado_cobro` y `dias_cobro`, para que ninguna cara tenga que
--     recalcular el estado ni los días.
--   · La pestaña OBRAS del Sheet usa la MISMA regla desde el 14/09/2026 («Sí, misma regla en OBRAS»,
--     dueño): obras-grilla.mjs calcula su `Vencido` con critVencidoCobro. La pestaña publicada cambia
--     cuando se regenere desde el árbol principal; esta migración no escribe el Sheet.
--
-- SEGURIDAD — se conserva lo que tiene cada vista HOY en la base (leído con pg_class.reloptions el
-- 14/09/2026), explícito para que `create or replace` no lo cambie:
--   cliente_cobranza, obra_cuenta   security_invoker = false, con la puerta `ve_economia()` en el
--                                   WHERE (20260913T1200_vistas_economicas_solo_para_quien_ve_economia)
--   cliente_cuenta_corriente        security_invoker = true
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- UNA VISTA TOMADA NO TRABA LA APP DEL DUEÑO: si en 5 s no consigue el lock, falla y se reintenta
-- fuera de horario. `aplicar-migracion.mjs` envuelve el archivo en una transacción, así que alcanza
-- con `set local`.
set local lock_timeout = '5s';

-- HOY EN SAN JUAN. `current_date` en Supabase es UTC: de 21 a 24 h ya es mañana.
create or replace function public.hoy_san_juan()
returns date
language sql
stable
as $$ select (now() at time zone 'America/Argentina/San_Juan')::date $$;

comment on function public.hoy_san_juan() is
  'La fecha de hoy en San Juan (America/Argentina/San_Juan). current_date es UTC y adelanta el día '
  'tres horas. La usa estado_de_cobro en las vistas de cobranzas.';

-- SIN `set search_path` A PROPÓSITO: no toca tablas, sólo `lower` y comparaciones de pg_catalog, y
-- así Postgres la inlinea dentro de las vistas en vez de llamarla fila por fila.
create or replace function public.estado_de_cobro(estado text, fecha_cobro date, hoy date)
returns text
language sql
immutable
as $$
  select case
    when lower(estado) = 'cobrado' then 'cobrado'
    when lower(estado) = 'pendiente' and fecha_cobro is not null and hoy is not null then
      case when fecha_cobro < hoy then 'vencido' else 'a_vencer' end
    else 'otro'
  end
$$;

comment on function public.estado_de_cobro(text, date, date) is
  'LA definición de «vencida» de una cobranza: columna U de la pestaña Cobranzas. cobrado | vencido '
  '(Pendiente y fecha_cobro < hoy) | a_vencer (Pendiente y fecha_cobro >= hoy) | otro (Facturado, '
  'Proyectado, CANCELAR, sin fecha). Sin mayúsculas como el = del Sheet. hoy = hoy_san_juan(). '
  'Gemelo JS: orquestador/lib/cobranza-estado-de-cobro.mjs.';

create or replace function public.dias_para_cobro(fecha_cobro date, hoy date)
returns integer
language sql
immutable
as $$ select fecha_cobro - hoy $$;

comment on function public.dias_para_cobro(date, date) is
  'Los días de la columna U: fecha_cobro − hoy. Negativo = días de atraso.';

grant execute on function public.hoy_san_juan() to authenticated, service_role;
grant execute on function public.estado_de_cobro(text, date, date) to authenticated, service_role;
grant execute on function public.dias_para_cobro(date, date) to authenticated, service_role;

comment on function public.plazo_cobro_dias() is
  'RETIRADA el 14/09/2026 (20260914T1200): «vencida» es estado_de_cobro(), la regla de la columna U '
  'de Cobranzas, en las vistas y en la pestaña OBRAS. Ninguna cara decide vencimientos con este '
  'plazo. Queda como espejo de PLAZO_COBRO_DIAS de cobranzas-vencido.mjs. No usarla para vencer.';

-- ─── 1 · cliente_cobranza — la ficha del cliente ─────────────────────────────────────────────────
create or replace view public.cliente_cobranza with (security_invoker = false) as
select cb.id as cobranza_id,
    cb.cliente_id,
    i.obra_id,
    i.imputacion,
    cb.sheet_id as fila,
    cb.categoria,
    cb.fecha_emision,
    cb.factura,
    cb.numero_comprobante,
    cb.concepto,
    cb.orden_compra,
    cb.monto_neto,
    cb.iva,
    cb.retenciones,
    cb.total_bruto,
    cb.estado,
    cb.moneda,
    public.es_cobrada(cb.estado, cb.fecha_cobro) as esta_cobrada,
    cb.estado = 'CANCELAR'::text as esta_cancelada,
    public.estado_de_cobro(cb.estado, cb.fecha_cobro, h.hoy) = 'vencido' as esta_vencida,
    cb.fecha_cobro,
    cb.forma_cobro,
    r.drive_file_id as respaldo_drive_id,
    r.titulo as respaldo_titulo,
    r.nota as respaldo_nota,
    public.estado_de_cobro(cb.estado, cb.fecha_cobro, h.hoy) as estado_cobro,
    public.dias_para_cobro(cb.fecha_cobro, h.hoy) as dias_cobro
   from public.cobranzas cb
     cross join (select public.hoy_san_juan() as hoy) h
     left join public.cobranza_imputacion i on i.cobranza_id = cb.id
     left join lateral ( select c.drive_file_id, c.titulo, c.nota
           from public.cobranza_comprobante c
          where c.cliente_id = cb.cliente_id and c.sheet_id = cb.sheet_id
          order by c.cargado_en desc
         limit 1) r on true
  where cb.cliente_id is not null and public.ve_economia();

-- ─── 2 · obra_cuenta — la cartera y el home ──────────────────────────────────────────────────────
-- `vencido` sigue siendo un REPARTO de `por_cobrar` (misma ventana del año): si saliera de la
-- ventana, una obra podría publicar más vencido que lo que tiene por cobrar. Al 14/09/2026 ninguna
-- fila pendiente tiene fecha de cobro fuera de 2026, así que la ventana no esconde ningún vencido hoy.
create or replace view public.obra_cuenta with (security_invoker = false) as
 with filas as (
         select i.obra_id,
            i.imputacion,
            cb.sheet_id,
            public.es_cobrada(cb.estado, cb.fecha_cobro) as esta_cobrada,
            lower(btrim(coalesce(cb.estado, ''::text))) = 'cancelar'::text as esta_cancelada,
            public.estado_de_cobro(cb.estado, cb.fecha_cobro, public.hoy_san_juan()) = 'vencido' as esta_vencida,
            cb.total_bruto,
            cb.monto_neto,
            cb.fecha_cobro,
            cb.fecha_emision,
            cb.forma_cobro
           from public.cobranzas cb
             join public.cobranza_imputacion i on i.cobranza_id = cb.id
          where i.obra_id is not null
        ), marcada as (
         select f.obra_id,
            f.imputacion,
            f.sheet_id,
            f.esta_cobrada,
            f.esta_cancelada,
            f.esta_vencida,
            f.total_bruto,
            f.monto_neto,
            f.fecha_cobro,
            f.fecha_emision,
            f.forma_cobro,
            extract(year from f.fecha_cobro) = public.ano_obras()::numeric as en_el_ano,
            not f.esta_cobrada and not f.esta_cancelada as pendiente
           from filas f
        ), agregada as (
         select marcada.obra_id,
            count(*)::integer as n_cobranzas,
            count(*) filter (where marcada.esta_cobrada)::integer as n_cobradas,
            sum(marcada.total_bruto) filter (where marcada.esta_cobrada and marcada.en_el_ano) as cobrado_total,
            sum(marcada.monto_neto) filter (where marcada.esta_cobrada and marcada.en_el_ano) as cobrado_neto,
            sum(marcada.total_bruto) filter (where marcada.pendiente and marcada.en_el_ano) as por_cobrar,
            sum(marcada.total_bruto) filter (where marcada.pendiente and marcada.en_el_ano and marcada.esta_vencida) as vencido,
            min(marcada.fecha_cobro) filter (where marcada.pendiente and marcada.fecha_cobro is not null) as proximo_cobro_fecha,
            max(
                case marcada.imputacion
                    when 'oc'::text then 1
                    when 'alias'::text then 2
                    else 3
                end) as peor
           from marcada
          group by marcada.obra_id
        )
 select oc.id as obra_id,
    oc.nombre as obra,
    oc.cliente_id,
    e.contratado,
    coalesce(a.n_cobranzas, 0) as n_cobranzas,
    coalesce(a.n_cobradas, 0) as n_cobradas,
    a.cobrado_total,
    a.cobrado_neto,
    a.por_cobrar,
    a.vencido,
    a.proximo_cobro_fecha,
    ( select m.forma_cobro
           from marcada m
          where m.obra_id = oc.id and m.pendiente and m.fecha_cobro = a.proximo_cobro_fecha
          order by (nullif(regexp_replace(m.sheet_id, '\D'::text, ''::text, 'g'::text), ''::text)::integer)
         limit 1) as proximo_cobro_medio,
        case a.peor
            when 1 then 'oc'::text
            when 2 then 'alias'::text
            when 3 then 'cliente'::text
            else null::text
        end as imputacion
   from public.obra_canonica oc
     left join agregada a on a.obra_id = oc.id
     left join public.obra_economia_cartera e on e.obra_canonica_id = oc.id
  where public.ve_economia();

-- ─── 3 · cliente_cuenta_corriente — pantalla 28, cliente_economia ────────────────────────────────
-- Deuda sigue siendo Pendiente + Facturado (el saldo no cambia). Lo que cambia es qué parte de esa
-- deuda está VENCIDA: sólo Pendiente, como el Sheet. Las ventanas de 90 días siguen con current_date:
-- no son vencimientos y no forman parte de este cambio.
create or replace view public.cliente_cuenta_corriente with (security_invoker = true) as
 with base as (
         select c.cliente_id,
            c.total_bruto as total,
            c.monto_neto,
            c.estado,
            c.fecha_cobro,
            c.fecha_emision,
            c.estado = any (array['Pendiente'::text, 'Facturado'::text]) as es_deuda,
            public.es_cobrada(c.estado, c.fecha_cobro) as es_cobrado,
            public.estado_de_cobro(c.estado, c.fecha_cobro, h.hoy) = 'vencido' as es_vencido,
            - public.dias_para_cobro(c.fecha_cobro, h.hoy) as dias_atraso
           from public.cobranzas c
             cross join (select public.hoy_san_juan() as hoy) h
          where c.cliente_id is not null and c.total_bruto is not null and c.estado <> 'CANCELAR'::text
        )
 select b.cliente_id,
    cl.nombre_comercial,
    coalesce(sum(b.total) filter (where b.es_deuda), 0::numeric) as saldo,
    coalesce(sum(b.total) filter (where b.es_vencido), 0::numeric) as vencido,
    coalesce(sum(b.total) filter (where b.es_deuda and not b.es_vencido), 0::numeric) as por_vencer,
    count(*) filter (where b.es_deuda) as comprobantes_pendientes,
    coalesce(sum(b.total) filter (where b.es_deuda and not b.es_vencido), 0::numeric) as aging_por_vencer,
    coalesce(sum(b.total) filter (where b.es_vencido and b.dias_atraso >= 1 and b.dias_atraso <= 30), 0::numeric) as aging_1_30,
    coalesce(sum(b.total) filter (where b.es_vencido and b.dias_atraso >= 31 and b.dias_atraso <= 60), 0::numeric) as aging_31_60,
    coalesce(sum(b.total) filter (where b.es_vencido and b.dias_atraso >= 61 and b.dias_atraso <= 90), 0::numeric) as aging_61_90,
    coalesce(sum(b.total) filter (where b.es_vencido and b.dias_atraso > 90), 0::numeric) as aging_mas_90,
    coalesce(sum(b.total) filter (where b.fecha_emision >= (current_date - 90)), 0::numeric) as facturado_90d,
    coalesce(sum(b.total) filter (where b.es_cobrado and b.fecha_cobro >= (current_date - 90)), 0::numeric) as cobrado_90d,
    sum(b.total) filter (where b.es_cobrado) as cobrado_total,
    sum(b.monto_neto) filter (where b.es_cobrado) as cobrado_neto_total,
        case
            when coalesce(sum(b.total) filter (where b.fecha_emision >= (current_date - 90)), 0::numeric) > 0::numeric then round(coalesce(sum(b.total) filter (where b.es_deuda), 0::numeric) / sum(b.total) filter (where b.fecha_emision >= (current_date - 90)) * 90::numeric, 1)
            else null::numeric
        end as dso,
        case
            when (coalesce(sum(b.total) filter (where b.es_cobrado and b.fecha_cobro >= (current_date - 90)), 0::numeric) + coalesce(sum(b.total) filter (where b.es_vencido), 0::numeric)) > 0::numeric then round(100.0 * coalesce(sum(b.total) filter (where b.es_cobrado and b.fecha_cobro >= (current_date - 90)), 0::numeric) / (coalesce(sum(b.total) filter (where b.es_cobrado and b.fecha_cobro >= (current_date - 90)), 0::numeric) + coalesce(sum(b.total) filter (where b.es_vencido), 0::numeric)), 1)
            else null::numeric
        end as efectividad_pct,
    round(avg(b.fecha_cobro - b.fecha_emision) filter (where b.es_cobrado and b.fecha_cobro >= (current_date - 90) and b.fecha_emision is not null), 1) as dias_cobro_promedio,
    coalesce(( select sum(cc.reparo) as sum
           from public.certificado_cliente cc
          where cc.cliente_id = b.cliente_id and cc.estado <> 'cobrado'::text), 0::numeric) as fondo_reparo
   from base b
     join public.clientes cl on cl.id = b.cliente_id
  group by b.cliente_id, cl.nombre_comercial;

-- ─── INVARIANTES: la migración no se aplica si la regla dejó de ser una sola ────────────────────
do $$
declare
  v record;
begin
  -- Lo vencido es un reparto de lo que se debe, en las dos vistas agregadas.
  for v in select obra_id, por_cobrar, vencido from public.obra_cuenta
            where vencido is not null and por_cobrar is not null and vencido > por_cobrar
  loop
    raise exception 'obra_cuenta: la obra % tiene vencido (%) mayor que por cobrar (%)', v.obra_id, v.vencido, v.por_cobrar;
  end loop;
  for v in select cliente_id, saldo, vencido from public.cliente_cuenta_corriente where vencido > saldo
  loop
    raise exception 'cliente_cuenta_corriente: el cliente % tiene vencido (%) mayor que saldo (%)', v.cliente_id, v.vencido, v.saldo;
  end loop;
  -- Ninguna fila que el Sheet no llama Pendiente puede publicarse vencida.
  if exists (select 1 from public.cliente_cobranza where esta_vencida and lower(estado) <> 'pendiente') then
    raise exception 'cliente_cobranza publica vencida una fila que no es Pendiente';
  end if;
end $$;

-- La ficha del cliente se sirve desde caché: lo que publica pantalla_cliente cambió.
delete from public.ficha_cliente_cache;
