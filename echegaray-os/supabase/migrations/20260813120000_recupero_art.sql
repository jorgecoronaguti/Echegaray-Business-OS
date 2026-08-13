-- EL RECUPERO DE ART — MENOR COSTO DE NÓMINA DEL MES TRABAJADO, NO UN INGRESO DEL MES COBRADO.
--
-- POR QUÉ (13/08/2026). Prevención ART reintegró $914.612,42 por la ILT del siniestro 3012927
-- (accidente in itínere del 08/06/2026). La plata entró al Santander el 11/08 —`banco_movimientos`
-- la tiene con la referencia 8699102— y el OS la vio entrar sin saber qué era: ninguna tabla la
-- explicaba.
--
-- Los dos lugares equivocados, dichos para que nadie los vuelva a elegir:
--
--   · `cobranza` es la puerta de las VENTAS. Meter ahí un reintegro infla la facturación del mes y le
--     mete margen a una obra que no lo generó. La empresa no le vendió nada a la aseguradora.
--   · Restarlo del EGRESO de junio/julio rompe la conciliación bancaria: esa plata salió en junio y
--     julio y volvió el 11 de agosto. El cash flow no cerraría nunca contra el extracto.
--
-- LO QUE ES: el recupero de un costo laboral ya pagado. El empleador le liquidó el haber al
-- accidentado durante la incapacidad y la ART se lo devolvió. Entonces vale la MISMA separación que
-- 20260731120000_jornal_quincena_fecha_pago.sql ya dejó escrita para los jornales:
--
--   CAJA (percibido) ..... el cobro del 11/08. Ya está en el saldo del extracto. NADA que agregar acá:
--                          sumarlo otra vez lo contaría dos veces.
--   DEVENGADO ............ menor costo de nómina de los meses TRABAJADOS que recupera (jun y jul 2026).
--
-- POR QUÉ EL DESGLOSE POR CONCEPTO. La orden de pago discrimina remuneración, SAC, no remunerativo y
-- contribuciones. Los tres primeros recuperan masa salarial (línea `jornales`); las contribuciones
-- recuperan el F931 (línea `cargas_sociales`), que es justamente la línea que se compara contra la
-- DDJJ. Netear el total contra una sola línea daría el mismo costo total y las dos líneas mal.
--
-- Idempotente: se puede correr las veces que sea.

-- ── 1. LA CABECERA: UNA ORDEN DE PAGO DE LA ASEGURADORA ──────────────────────────────────────────
create table if not exists public.recupero_art (
  id                 uuid primary key default gen_random_uuid(),
  siniestro          text not null,
  -- 'ilt' = Incapacidad Laboral Temporaria. Se deja abierto porque una ILP o un recupero por gastos
  -- médicos NO netean la misma línea, y el día que aparezca hay que poder distinguirlo sin migrar.
  contingencia       text not null default 'ilt',
  aseguradora        text not null,
  cuit_aseguradora   text,
  trabajador         text not null,
  documento          text,
  solicitud          text,
  -- NOT NULL con default vacío, no NULL: la identidad del reintegro es (siniestro, orden de pago) y un
  -- índice único sobre una columna que acepta NULL no restringe nada — ya vivió sobre 206 NULLs sin
  -- quejarse una vez. Con NULL, dos corridas del mismo reintegro sin número de orden entrarían dos
  -- veces y netearían el mes por el doble.
  orden_pago         text not null default '',
  fecha_cobro        date not null,
  cbu_acreditacion   text,
  importe_solicitado numeric,
  importe_liquidado  numeric not null check (importe_liquidado > 0),
  -- Solicitado − liquidado. NO es un error de carga: es la parte del costo del siniestro que la ART no
  -- devuelve ("se aplican los aumentos por paritarias correspondientes") y se la come la empresa.
  -- Guardarla es lo que permite contestar cuánto cuesta de verdad un accidente.
  diferencia         numeric,
  -- LA PRUEBA DEL COBRO. La referencia del crédito en banco_movimientos — nunca el saldo corrido, que
  -- cambia cuando se inserta un movimiento anterior y ya dejó entrar 68 duplicados. NULL = el extracto
  -- todavía no lo muestra: el recupero está declarado pero no probado.
  referencia_banco   text,
  documento_origen   text,
  registrado_en      timestamptz not null default now(),
  -- La identidad de una orden de pago es (siniestro, orden). `coalesce` porque un índice único sobre
  -- una columna que acepta NULL no restringe nada: ya vivió sobre 206 NULLs sin quejarse una vez.
  unique (siniestro, orden_pago)
);
comment on table public.recupero_art is
  'Reintegros de la ART por siniestro. NO es una venta ni un ingreso comercial: es recupero de un costo laboral ya pagado. En caja no se registra (el cobro ya está en el saldo del banco); en devengado netea nomina_por_mes.';
comment on column public.recupero_art.diferencia is
  'Solicitado − liquidado: la parte del costo del siniestro que la ART no devuelve y queda en la empresa.';

-- ── 2. EL DETALLE: A QUÉ MES Y A QUÉ LÍNEA NETEA CADA PESO ───────────────────────────────────────
create table if not exists public.recupero_art_imputacion (
  id            uuid primary key default gen_random_uuid(),
  recupero_id   uuid not null references public.recupero_art(id) on delete cascade,
  -- El mes TRABAJADO que se recupera ('YYYY-MM'), nunca el mes en que se cobró. Cadena VACÍA —no
  -- NULL— cuando todavía no se sabe: así la clave única sigue restringiendo y el renglón se ve.
  periodo       text not null default '',
  concepto      text not null,
  concepto_nombre text,
  -- 'jornales' o 'cargas_sociales': la columna de nomina_por_mes que este peso reduce.
  linea         text not null check (linea in ('jornales', 'cargas_sociales')),
  monto         numeric not null check (monto > 0),
  -- Cómo se repartió entre períodos. 'liquidacion' es un hecho; 'prorrateo_dias' es una estimación
  -- declarada; 'sin_imputar' significa que el recupero está registrado pero NO netea ningún mes.
  metodo        text not null default 'sin_imputar'
                check (metodo in ('liquidacion', 'prorrateo_dias', 'sin_imputar')),
  es_estimacion boolean not null default false,
  unique (recupero_id, periodo, concepto)
);
comment on table public.recupero_art_imputacion is
  'Un renglón por (período × concepto) del recupero. periodo = mes TRABAJADO, no el mes de cobro: devengado y percibido no comparten ventana. periodo vacío = todavía sin imputar, y entonces NO netea ningún mes.';
create index if not exists recupero_art_imputacion_periodo_idx
  on public.recupero_art_imputacion (periodo, linea);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────────────────────────
-- Una tabla sin policy no da error: devuelve cero filas, y un cero por falta de policy es
-- indistinguible de un cero real — que acá significaría "no hubo recuperos".
alter table public.recupero_art enable row level security;
alter table public.recupero_art_imputacion enable row level security;
do $$ begin
  create policy recupero_art_lectura on public.recupero_art for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy recupero_art_imputacion_lectura on public.recupero_art_imputacion for select to authenticated using (true);
exception when duplicate_object then null; end $$;
grant select on public.recupero_art, public.recupero_art_imputacion to authenticated;

-- ── 4. EL RECUPERO POR MES, LISTO PARA NETEAR ────────────────────────────────────────────────────
create or replace view public.recupero_art_por_mes as
  select to_date(i.periodo || '-01', 'YYYY-MM-DD')                        as mes,
         sum(i.monto) filter (where i.linea = 'jornales')                 as recupero_jornales,
         sum(i.monto) filter (where i.linea = 'cargas_sociales')          as recupero_cargas,
         sum(i.monto)                                                     as recupero_total,
         bool_or(i.es_estimacion)                                         as es_estimacion
    from public.recupero_art_imputacion i
   where i.periodo <> ''
   group by 1;
comment on view public.recupero_art_por_mes is
  'Recupero de ART imputado, por mes trabajado. Excluye lo que todavía no tiene período: un recupero sin imputar no puede netear un mes que nadie eligió.';

-- LO QUE FALTA IMPUTAR, VISIBLE. Un recupero cobrado y sin período no reduce ningún costo, así que sin
-- esta vista queda cobrado y olvidado — que es como el reintegro del 11/08 estuvo dos días.
create or replace view public.recupero_art_sin_imputar as
  select r.siniestro, r.trabajador, r.fecha_cobro, r.importe_liquidado,
         sum(i.monto) as monto_sin_imputar
    from public.recupero_art r
    join public.recupero_art_imputacion i on i.recupero_id = r.id
   where i.periodo = ''
   group by 1, 2, 3, 4;
comment on view public.recupero_art_sin_imputar is
  'Recuperos cobrados que todavía no netean ningún mes porque falta el desglose por período de la liquidación. Es trabajo pendiente, no un dato faltante inocuo.';
grant select on public.recupero_art_por_mes, public.recupero_art_sin_imputar to authenticated;

-- ── 5. nomina_por_mes: EL BRUTO SE QUEDA, EL NETO SE AGREGA ──────────────────────────────────────
--
-- NO SE PISA `costo_nomina`. El bruto es lo que se pagó y es contra lo que se concilia el F931 y el
-- lote de haberes del banco; el neto es lo que la nómina costó de verdad. Son dos preguntas distintas
-- y las dos son correctas — reemplazar una por la otra rompería la conciliación que hoy funciona.
-- `es_estimacion` ya avisaba que el mes incluye proyección; ahora también avisa si el recupero que lo
-- netea es un prorrateo y no una liquidación.
--
-- DROP + CREATE Y NO `create or replace`: las columnas nuevas van en el medio (el neto al lado del
-- bruto, no colgado después de `es_estimacion`), y `replace` sólo sabe agregar al final. El DROP va SIN
-- CASCADE a propósito: hoy no hay ninguna vista que dependa de ésta —verificado en pg_depend el
-- 13/08— y si mañana la hubiera, la migración FALLA en vez de destruirla en silencio. Los grants se
-- pierden con el drop y por eso se vuelven a otorgar abajo.
drop view if exists public.nomina_por_mes;
create view public.nomina_por_mes as
  with j as (
    select date_trunc('month', desde)::date mes,
           sum(total) jornales,
           bool_or(estado = 'proyectada') tiene_proyectado
      from public.jornales_quincena group by 1
  ), c as (
    select to_date(periodo || '-01', 'YYYY-MM-DD') mes,
           sum(monto) cargas,
           bool_or(tipo = 'proyectado') tiene_proyectado
      from public.cargas_sociales_periodo group by 1
  ), r as (
    select mes, recupero_jornales, recupero_cargas, recupero_total, es_estimacion
      from public.recupero_art_por_mes
  )
  select coalesce(j.mes, c.mes, r.mes)                                      as mes,
         coalesce(j.jornales, 0)                                            as jornales,
         coalesce(c.cargas, 0)                                              as cargas_sociales,
         coalesce(j.jornales, 0) + coalesce(c.cargas, 0)                    as costo_nomina,
         coalesce(r.recupero_jornales, 0)                                   as recupero_jornales,
         coalesce(r.recupero_cargas, 0)                                     as recupero_cargas,
         coalesce(r.recupero_total, 0)                                      as recupero_art,
         coalesce(j.jornales, 0) + coalesce(c.cargas, 0)
           - coalesce(r.recupero_total, 0)                                  as costo_nomina_neto,
         coalesce(j.tiene_proyectado, false)
           or coalesce(c.tiene_proyectado, false)
           or coalesce(r.es_estimacion, false)                              as es_estimacion
    from j
         full outer join c on j.mes = c.mes
         full outer join r on r.mes = coalesce(j.mes, c.mes)
   order by 1;

comment on view public.nomina_por_mes is
  'Costo de nómina por mes DEVENGADO (mes trabajado, no mes de pago). costo_nomina es el BRUTO — lo que se pagó, y contra lo que se concilia el F931 y el lote de haberes. costo_nomina_neto le resta el recupero de ART imputado a ese mes. es_estimacion avisa cuando el mes incluye proyección o un recupero prorrateado: la web NUNCA debe mostrar un estimado como si fuera un dato.';
grant select on public.nomina_por_mes to authenticated;
