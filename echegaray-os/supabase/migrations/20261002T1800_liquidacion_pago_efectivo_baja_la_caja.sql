-- EL PAGO EN EFECTIVO DE LIQUIDACIÓN DE HORAS BAJA LA CAJA EN EFECTIVO (dueño, 02/10/2026)
--
-- Textual: «los pagos que se hagan en efectivo registrados en liq de hs de app ecsas deben hacer descuento directo
-- de la caja en efectivo de app ecsas, sheet flujo de fondos y supabase». ESTA migración es la parte Postgres (fase 1);
-- el Sheet es la fase 2 y no se toca acá.
--
-- ═══ EL HUECO ═══
--
-- La app guarda el pago en efectivo como un ACUMULADO sin fecha (`liquidacion_linea.pagado_efectivo`), no como un
-- movimiento de caja: Postgres no tenía ni el movimiento «pago de jornales» ni un saldo de efectivo.
--
-- ═══ QUÉ SE CONSTRUYE ═══
--
-- 1. `liquidacion_pago_efectivo`: UN RENGLÓN POR CAMBIO DEL ACUMULADO, con su fecha y su signo. Es un DELTA, nunca el
--    acumulado: sumar acumulados duplicaría cada corrección. Si el acumulado baja (se corrige un tipeo, se deshace
--    la marca «pagada») el delta es negativo y la caja vuelve a subir.
-- 2. Un TRIGGER sobre `liquidacion_linea` que deja el delta en la MISMA transacción que cambia `pagado_efectivo`.
--    Por qué trigger y no una función que llame la app: hay cinco caminos que escriben esa columna (la celda de la
--    pantalla, la marca «Pagar», el RPC del chat `pago_efectivo_de_sueldo`, `rendir_adelanto_de_sueldo`/
--    `quitar_adelanto_rendido`, y los cargadores del orquestador). Una acción nueva sólo cubre a quien se acuerde de
--    llamarla; el trigger no deja ninguna vía afuera, y cada vía futura nace cubierta.
-- 3. Un pago hecho desde una ENTREGA A RENDIR NO baja la caja otra vez: la entrega ya la bajó. Esos RPC siguen sin
--    tocarse (tienen varias versiones); dos triggers chicos sobre `efectivo_rendicion` reclasifican el delta recién
--    escrito de ESA transacción como origen `entrega`, y el saldo no lo cuenta.
-- 4. La fecha del pago: por defecto HOY (hora de San Juan). La app puede mandarla en `fecha_pago_efectivo`, una
--    columna PUENTE que el trigger consume y vacía en la misma escritura (si no se vaciara, el pago siguiente
--    heredaría una fecha vieja). El RPC del chat ya trae su `p_fecha`: el trigger de `pago_efectivo_sueldo` la pone.
-- 5. La rama «Pago de jornales» de `efectivo_movimiento_caja` y la vista `efectivo_caja_saldo`.
--
-- ═══ EL CORTE: DE CONTEO A CONTEO ═══
--
-- El último conteo sellado (`caja_conteo_observado`, concepto CAJA_ARQUEO_ARS) ya contiene todo lo pagado ANTES. Un
-- pago con fecha anterior al sello queda registrado (con su fecha) pero NO resta del saldo posterior: restarlo bajaría
-- la caja dos veces. Los pagos del día del conteo, que no se pueden ordenar contra el sello, se dejan afuera (el mismo
-- criterio conservador que el Sheet: no se afirma una precisión que no hay).
--
-- LA SIEMBRA (decisión del dueño, no se retro-aplica a ciegas): quincena 16–30/09 → pagada el 16/09 (anterior al
-- sello: queda dentro del conteo); quincena 01–15/10 → pagada el 01/10 (posterior: RESTA); el resto (01–15/09 y la
-- carga histórica de julio–agosto) → anterior al sello. `liquidacion_cambio` sólo registra `pagado_efectivo` desde el
-- 01/10 y sus filas «base» son el backfill de otro trigger: NO sirve para fechar pagos pasados.
--
-- ═══ LO QUE ESTO NO ES ═══
--
-- `efectivo_caja_saldo` NO es el saldo del cajón: es el conteo sellado más lo que POSTGRES conoce desde el sello
-- (entregas, devoluciones y estos pagos). Compras en efectivo, cobros, extracciones y depósitos todavía los resta sólo el
-- Sheet. La vista lo dice en su columna `alcance`; no publica un número como si fuera el total.
--
-- NO SE APLICA DESDE UN AGENTE (`.claude/rules/migraciones.md`). Idempotente: aplicarla dos veces no duplica la
-- siembra ni rompe nada.

-- Sin `begin/commit` propios: `aplicar-migracion.mjs` abre la transacción ANTES de ejecutar este archivo (y rechaza un
-- archivo con su propio begin/commit), así que el `set local` rige para todo lo que sigue: si no consigue el candado
-- sobre `liquidacion_linea` en 5 s, la migración se cae entera en vez de trabar la app.
set local lock_timeout = '5s';

-- ───────────────────────────────────────────────────────────
-- 1 · LA TABLA DE DELTAS
-- ───────────────────────────────────────────────────────────
create table if not exists public.liquidacion_pago_efectivo (
  id              bigint generated always as identity primary key,
  liquidacion_id  uuid not null references public.liquidacion_quincena(id) on delete cascade,
  -- La línea no lleva FK: borrar y recrear la línea no debe borrar lo que salió del cajón.
  linea_id        uuid,
  persona_id      uuid not null references public.personas(id),
  quincena_desde  date not null,
  grupo           text not null,
  -- El día en que el dinero salió. NO es el día en que se cargó.
  fecha           date not null,
  -- Con signo: positivo = salió plata de la caja; negativo = corrección que la devuelve.
  importe         numeric(14,2) not null check (importe <> 0),
  origen          text not null default 'caja' check (origen in ('caja', 'entrega')),
  -- La rendición de la entrega a rendir que pagó esto (sólo origen `entrega`). Sin FK: quitar el adelanto borra la rendición.
  rendicion_id    uuid,
  registrado_por  uuid,
  registrado_en   timestamptz not null default now(),
  -- Transacción que lo escribió: deja a los triggers de entrega y de chat reclasificar SÓLO lo de su propia transacción.
  txid            bigint default txid_current(),
  clave           text not null unique,
  nota            text
);

create index if not exists liquidacion_pago_efectivo_por_fecha on public.liquidacion_pago_efectivo (fecha);
create index if not exists liquidacion_pago_efectivo_por_linea on public.liquidacion_pago_efectivo (liquidacion_id, persona_id);

comment on table public.liquidacion_pago_efectivo is
  'Movimientos de caja en efectivo de Liquidación de horas: un DELTA por cada cambio de liquidacion_linea.pagado_efectivo, con fecha del pago y signo. Lo escribe el trigger de la línea en la misma transacción. origen=entrega no baja la caja (la entrega a rendir ya la bajó).';
comment on column public.liquidacion_pago_efectivo.fecha is
  'Día en que salió el dinero (por defecto el de la carga, hora de San Juan). Un pago anterior al sello del conteo ya está dentro del conteo y no resta del saldo.';

-- RLS ≠ GRANT: la policy sola no da acceso, y los privilegios por defecto reparten DML a `authenticated`. Sólo lee quien
-- liquida sueldos (mismo portero que `liquidacion_linea` y `liquidacion_cambio`); escribe el trigger (security definer).
alter table public.liquidacion_pago_efectivo enable row level security;
drop policy if exists liquidacion_pago_efectivo_lee_admin on public.liquidacion_pago_efectivo;
create policy liquidacion_pago_efectivo_lee_admin on public.liquidacion_pago_efectivo
  for select to authenticated using (public.liquida_sueldos());
revoke all on public.liquidacion_pago_efectivo from anon, authenticated;
grant select on public.liquidacion_pago_efectivo to authenticated;

-- ───────────────────────────────────────────────────────────
-- 2 · LA COLUMNA PUENTE DE LA FECHA
-- ───────────────────────────────────────────────────────────
-- Siempre NULL en reposo: el trigger la consume y la vacía. La escribe sólo el servidor con la clave de servicio, por eso
-- no se le da GRANT a `authenticated` (una columna nueva nace sin permiso y así se queda).
alter table public.liquidacion_linea add column if not exists fecha_pago_efectivo date;
comment on column public.liquidacion_linea.fecha_pago_efectivo is
  'Puente: la fecha del pago en efectivo que se está escribiendo. El trigger liquidacion_pago_efectivo la lee y la vacía en la misma escritura; en reposo es NULL.';

-- ───────────────────────────────────────────────────────────
-- 3 · EL TRIGGER DE LA LÍNEA
-- ───────────────────────────────────────────────────────────
create or replace function public.liquidacion_linea_anotar_pago_efectivo()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
declare
  v_hoy     date := (now() at time zone 'America/Argentina/San_Juan')::date;
  v_cab     public.liquidacion_quincena;
  v_espejo  numeric;
  v_antes   numeric;
  v_despues numeric;
  v_delta   numeric;
  v_autor   uuid;
  v_n       int;
  v_fecha   date;
begin
  if new.fecha_pago_efectivo is not null and new.fecha_pago_efectivo > v_hoy then
    raise exception 'el pago en efectivo no puede tener fecha futura (%)', new.fecha_pago_efectivo using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' or new.pagado_efectivo is distinct from old.pagado_efectivo then
    select * into v_cab from public.liquidacion_quincena where id = new.liquidacion_id;
    -- LO QUE LA PANTALLA MUESTRA como «Pagado efectivo» es el escrito, y si no hay, el adelanto manual o el espejo de
    -- JORNALES (lo mismo que leen los RPC del chat). El delta es contra LO MOSTRADO, no contra cero: escribir 150.000
    -- sobre una celda que ya decía 100.000 es un pago de 50.000.
    select sum(adelanto) into v_espejo from public.jornales_bloque_persona
     where persona_id = new.persona_id and quincena_desde between v_cab.desde and v_cab.hasta and adelanto is not null;
    v_antes := case when tg_op = 'UPDATE'
                    then coalesce(old.pagado_efectivo, old.adelanto_manual, v_espejo, 0)
                    else coalesce(new.adelanto_manual, v_espejo, 0) end;
    v_despues := coalesce(new.pagado_efectivo, new.adelanto_manual, v_espejo, 0);
    v_delta := round(v_despues - v_antes, 2);

    if v_delta <> 0 then
      v_autor := coalesce(auth.uid(),
                          case when tg_op = 'UPDATE' and new.escribio_en is distinct from old.escribio_en then new.escribio_id end,
                          new.pagada_por);
      -- UN DELTA NEGATIVO ES UNA CORRECCIÓN, NO UN PAGO: sin fecha explícita hereda la del último movimiento de la línea. Con
      -- la de hoy, corregir un pago anterior al sello movería el saldo posterior por un efectivo que ya estaba en el conteo.
      v_fecha := new.fecha_pago_efectivo;
      if v_fecha is null and v_delta < 0 then
        select x.fecha into v_fecha from public.liquidacion_pago_efectivo x where x.linea_id = new.id order by x.id desc limit 1;
      end if;
      v_fecha := coalesce(v_fecha, v_hoy);
      select count(*) + 1 into v_n from public.liquidacion_pago_efectivo where linea_id = new.id and txid = txid_current();
      insert into public.liquidacion_pago_efectivo
        (liquidacion_id, linea_id, persona_id, quincena_desde, grupo, fecha, importe, origen, registrado_por, clave)
      values (new.liquidacion_id, new.id, new.persona_id, v_cab.desde, v_cab.grupo,
              v_fecha, v_delta, 'caja', v_autor,
              'linea:' || new.id || ':' || txid_current() || ':' || v_n);
    end if;
  end if;

  -- La fecha se usa UNA vez: sin esto el pago siguiente, que no la manda, heredaría la de hoy.
  if new.fecha_pago_efectivo is not null then
    update public.liquidacion_linea set fecha_pago_efectivo = null where id = new.id;
  end if;
  return null;
end
$f$;
revoke all on function public.liquidacion_linea_anotar_pago_efectivo() from public, anon, authenticated;

drop trigger if exists liquidacion_linea_pago_efectivo on public.liquidacion_linea;
create trigger liquidacion_linea_pago_efectivo
  after insert or update on public.liquidacion_linea
  for each row execute function public.liquidacion_linea_anotar_pago_efectivo();

-- ───────────────────────────────────────────────────────────
-- 4 · LOS PAGOS QUE NO SALIERON DE LA CAJA, Y LA FECHA DEL CHAT
-- ───────────────────────────────────────────────────────────
-- `rendir_adelanto_de_sueldo` actualiza la línea y DESPUÉS inserta la rendición; `quitar_adelanto_rendido` actualiza la
-- línea y DESPUÉS la borra. Cuando llega la rendición, el delta de esa transacción ya está: se lo marca `entrega`.
create or replace function public.efectivo_rendicion_adelanto_no_baja_la_caja()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
declare
  r   record := case when tg_op = 'DELETE' then old else new end;
  v_q uuid;
begin
  if r.adelanto_persona_id is null then return null; end if;
  select id into v_q from public.liquidacion_quincena where desde = r.adelanto_quincena and grupo = r.adelanto_grupo;
  update public.liquidacion_pago_efectivo
     set origen = 'entrega', rendicion_id = r.id
   where txid = txid_current() and liquidacion_id = v_q and persona_id = r.adelanto_persona_id
     and origen = 'caja' and rendicion_id is null
     and (case when tg_op = 'DELETE' then importe < 0 else importe > 0 end);
  return null;
end
$f$;
revoke all on function public.efectivo_rendicion_adelanto_no_baja_la_caja() from public, anon, authenticated;

drop trigger if exists efectivo_rendicion_adelanto_caja on public.efectivo_rendicion;
create trigger efectivo_rendicion_adelanto_caja
  after insert or delete on public.efectivo_rendicion
  for each row execute function public.efectivo_rendicion_adelanto_no_baja_la_caja();

-- El RPC del chat dice cuándo se pagó (`p_fecha`): se escribe en `pago_efectivo_sueldo` después de actualizar la línea.
create or replace function public.pago_efectivo_sueldo_fecha_del_delta()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
begin
  update public.liquidacion_pago_efectivo p
     set fecha = new.fecha
   where p.txid = txid_current() and p.persona_id = new.persona_id
     and p.quincena_desde = new.quincena_desde and p.grupo = new.grupo
     and p.origen = 'caja' and p.importe > 0;
  return null;
end
$f$;
revoke all on function public.pago_efectivo_sueldo_fecha_del_delta() from public, anon, authenticated;

drop trigger if exists pago_efectivo_sueldo_fecha on public.pago_efectivo_sueldo;
create trigger pago_efectivo_sueldo_fecha
  after insert on public.pago_efectivo_sueldo
  for each row execute function public.pago_efectivo_sueldo_fecha_del_delta();

-- ───────────────────────────────────────────────────────────
-- 5 · LA SIEMBRA DE LO YA REGISTRADO (fechas dichas por el dueño; idempotente por clave)
-- ───────────────────────────────────────────────────────────
insert into public.liquidacion_pago_efectivo
  (liquidacion_id, linea_id, persona_id, quincena_desde, grupo, fecha, importe, origen, clave, nota, txid)
select l.liquidacion_id, l.id, l.persona_id, q.desde, q.grupo,
       case when q.desde = date '2026-09-16' then date '2026-09-16'
            when q.desde = date '2026-10-01' then date '2026-10-01'
            else coalesce((l.pagada_en at time zone 'America/Argentina/San_Juan')::date, q.hasta) end,
       l.pagado_efectivo, 'caja', 'siembra:' || l.id,
       'siembra 02/10/2026: lo ya registrado, con la fecha que dijo el dueño (16/09 y 01/10) o la de la marca / fin de la quincena', null
  from public.liquidacion_linea l
  join public.liquidacion_quincena q on q.id = l.liquidacion_id
 where l.pagado_efectivo is not null and l.pagado_efectivo > 0
   -- Cualquier otra quincena posterior al 01/09 no tiene fecha confiable: NO se siembra, se dice.
   and (q.desde <= date '2026-09-01' or q.desde in (date '2026-09-16', date '2026-10-01'))
on conflict (clave) do nothing;

-- ───────────────────────────────────────────────────────────
-- 6 · LA CAJA: LA RAMA «PAGO DE JORNALES» Y EL SALDO
-- ───────────────────────────────────────────────────────────
-- Las tres ramas de siempre, tal cual (20260925T1100), más la cuarta. `security_invoker` explícito: un `create or replace`
-- sin `with` lo pierde. Sólo `caja`: lo que salió de una entrega ya está en su rama «Entrega».
create or replace view public.efectivo_movimiento_caja with (security_invoker = true) as
 SELECT e.fecha,
    e.codigo,
    p.nombre_completo AS persona,
    COALESCE(o.nombre, 'Estructura'::text) AS destino,
    'Entrega'::text AS movimiento,
    - e.monto AS importe,
    e.creada_en AS registrado_en
   FROM efectivo_entrega e
     JOIN personas p ON p.id = e.persona_id
     LEFT JOIN obra_canonica o ON o.id = e.obra_id
  WHERE e.anulada_en IS NULL AND NOT COALESCE(p.es_prueba, false) AND NOT e.es_prueba
UNION ALL
 SELECT d.fecha,
    e.codigo,
    p.nombre_completo AS persona,
    COALESCE(o.nombre, 'Estructura'::text) AS destino,
    'Devolución'::text AS movimiento,
    d.monto AS importe,
    d.registrada_en AS registrado_en
   FROM efectivo_devolucion d
     JOIN efectivo_entrega e ON e.id = d.entrega_id
     JOIN personas p ON p.id = e.persona_id
     LEFT JOIN obra_canonica o ON o.id = e.obra_id
  WHERE e.anulada_en IS NULL AND NOT COALESCE(p.es_prueba, false) AND NOT e.es_prueba
UNION ALL
 SELECT r.adelanto_fecha,
    e.codigo,
    p.nombre_completo AS persona,
    'Sueldo de ' || COALESCE(emp.nombre_completo, 'empleado') AS destino,
    'Adelanto de sueldo'::text AS movimiento,
    r.monto AS importe,
    r.imputada_en AS registrado_en
   FROM efectivo_rendicion r
     JOIN efectivo_entrega e ON e.id = r.entrega_id
     JOIN personas p ON p.id = e.persona_id
     LEFT JOIN personas emp ON emp.id = r.adelanto_persona_id
  WHERE r.adelanto_persona_id IS NOT NULL
    AND e.anulada_en IS NULL AND NOT COALESCE(p.es_prueba, false) AND NOT e.es_prueba
UNION ALL
 SELECT x.fecha,
    'Q ' || to_char(x.quincena_desde, 'DD/MM') AS codigo,
    emp.nombre_completo AS persona,
    'Jornales ' || x.grupo AS destino,
    'Pago de jornales'::text AS movimiento,
    - x.importe AS importe,
    x.registrado_en
   FROM liquidacion_pago_efectivo x
     JOIN personas emp ON emp.id = x.persona_id
  WHERE x.origen = 'caja' AND NOT COALESCE(emp.es_prueba, false);

revoke all on public.efectivo_movimiento_caja from anon, public;
grant select on public.efectivo_movimiento_caja to authenticated;

-- EL SELLO, VISIBLE PARA LA VISTA. `caja_conteo_observado` sólo tiene policy de servicio: una vista invoker no la leería.
-- Esta función devuelve el último conteo (valor e instante) y nada más, y SÓLO a quien liquida sueldos: es security definer y
-- PostgREST la expone en /rpc, así que sin la guarda cualquier sesión (un jefe de obra, un `campo`) leería el conteo de la
-- caja, que hoy sólo lee el rol de servicio. Para el resto devuelve cero filas, no un error.
create or replace function public.efectivo_ultimo_conteo()
returns table (valor numeric, sellado_en timestamptz)
language sql stable security definer set search_path to 'public', 'pg_temp'
as $f$
  select c.valor, c.visto_desde from public.caja_conteo_observado c
   where c.concepto = 'CAJA_ARQUEO_ARS' and public.liquida_sueldos()
   order by c.visto_desde desc limit 1
$f$;
revoke all on function public.efectivo_ultimo_conteo() from public, anon, service_role;
grant execute on function public.efectivo_ultimo_conteo() to authenticated;

-- SALDO DE EFECTIVO SEGÚN POSTGRES = conteo sellado + movimientos posteriores al sello.
--  · Entregas y devoluciones: por el INSTANTE en que se registraron contra el instante del sello (como la réplica del Sheet).
--  · Pagos de jornales: por la FECHA del pago, estrictamente posterior al día del sello (San Juan). Los del día del conteo
--    no se pueden ordenar contra el sello y se dejan afuera.
--  · «Adelanto de sueldo» NO entra: era el contrapeso de que el Sheet resta el sueldo ENTERO al pagarse la quincena.
--    Acá cada pago resta por su delta y el pago desde una entrega ya bajó con la entrega: sumarlo inflaría la caja.
-- Sólo la ve quien liquida sueldos: sin esa guarda, un perfil que no lee los pagos vería un saldo SIN ellos, un número falso.
create or replace view public.efectivo_caja_saldo with (security_invoker = true) as
 with s as (select valor, sellado_en from public.efectivo_ultimo_conteo()),
 m as (
   select
     coalesce(sum(case when v.movimiento in ('Entrega', 'Devolución') and v.registrado_en > s.sellado_en
                       then v.importe end), 0) as a_rendir,
     coalesce(sum(case when v.movimiento = 'Pago de jornales'
                        and v.fecha > (s.sellado_en at time zone 'America/Argentina/San_Juan')::date
                       then v.importe end), 0) as jornales
   from s left join public.efectivo_movimiento_caja v on true
 )
 select s.valor as conteo_sellado,
        s.sellado_en,
        m.a_rendir as entregas_y_devoluciones,
        m.jornales as pagos_de_jornales,
        s.valor + m.a_rendir + m.jornales as saldo,
        'Conteo sellado + entregas/devoluciones + pagos de jornales desde el sello. NO incluye compras en efectivo, cobros, extracciones ni depósitos (hoy sólo los resta el Sheet).'::text as alcance
   from s cross join m
  where public.liquida_sueldos();

revoke all on public.efectivo_caja_saldo from anon, public;
grant select on public.efectivo_caja_saldo to authenticated;
comment on view public.efectivo_caja_saldo is
  'Saldo de efectivo SEGÚN POSTGRES: conteo sellado + movimientos posteriores que Postgres conoce (entregas, devoluciones, pagos de jornales). No es el total del cajón: ver la columna alcance.';
