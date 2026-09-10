-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- `obra_cuenta` — LA FILA DE LA PESTAÑA OBRAS, EN POSTGRES, CON LA MISMA DEFINICIÓN
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ EL DEFECTO, MEDIDO (10/09/2026) ═══
--
-- El dueño compara /clientes contra la pestaña OBRAS renglón por renglón, y los números no son los
-- mismos porque no son la misma medida:
--
--     BSA                 la app dice cobrado $ 4.073.022   ·  OBRAS dice $ 4.848.135
--     ME - PLAYÓN AZUFRE  la app dice          $ 50.659.641  ·  OBRAS dice $ 56.834.641
--
-- Ninguno está mal calculado: el de la app es el NETO y el de OBRAS es el TOTAL con IVA — la plata
-- que entra al banco. Las dos cifras son legítimas y responden preguntas distintas, y por eso el
-- problema no se arregla eligiendo una: se arregla PUBLICANDO LAS DOS CON SU NOMBRE, para que la
-- pantalla no pueda tomar una creyendo que toma la otra. `obra_cobranza` ya publicaba las dos
-- (`cobrado` / `cobrado_neto`) y el nombre corto se llevó la ambigüedad puesta.
--
-- Y faltaban tres columnas que OBRAS sí publica y ninguna cara de la app tenía: lo VENCIDO, la
-- PRÓXIMA fecha de cobro y su MEDIO. Sin ellas, la pantalla no puede contestar «a quién reclamo hoy»
-- —que es para lo que existe la pestaña—, y el dueño vuelve al Sheet.
--
-- ═══ POR QUÉ UNA VISTA NUEVA Y NO MÁS COLUMNAS EN `obra_cobranza` ═══
--
-- `obra_cobranza` es «lo cobrado y lo por cobrar de una obra» y sus columnas las consumen cinco
-- caras. `obra_cuenta` es otra cosa: es LA FILA DE LA PESTAÑA OBRAS —contrato, cobro, saldo, alarma
-- y próximo hito— con los mismos criterios que el generador `orquestador/scripts/obras-pestana.mjs`.
-- Nace con su propio nombre para que se pueda decir «esto tiene que dar igual que el Sheet» y
-- probarlo, en vez de ensanchar una vista hasta que signifique dos cosas.
--
-- ═══ LOS CRITERIOS, Y DE DÓNDE SALE CADA UNO (obras-grilla.mjs) ═══
--
--   contratado          `obra_economia_cartera.contratado` — la columna D.
--   cobrado_total       Σ TOTAL bruto de las filas «Cobrado», ventana del año por FECHA DE COBRO.
--   cobrado_neto        lo mismo en neto: es el único comparable contra el contrato.
--   por_cobrar          Σ TOTAL bruto de lo que no está Cobrado ni CANCELAR, misma ventana.
--   vencido             el mismo universo que `por_cobrar`, con el reloj de `cobranzas-vencido.mjs`:
--                       FECHA DE EMISIÓN + 30 días. La fecha de cobro de una fila pendiente NO es un
--                       vencimiento —se corre hacia adelante cada vez que pasa— y por eso la fórmula
--                       vieja publicaba «—» en las 18 celdas.
--   proximo_cobro_*     la MENOR fecha de cobro pendiente y la forma de esa fila. SIN ventana de
--                       año: la pregunta es «qué cobro viene», no «qué cobro viene este año».
--
-- ═══ LA DIFERENCIA CONOCIDA CON EL SHEET, DECLARADA ═══
--
-- Las columnas de OBRAS se calculan con SUMIFS que buscan el nombre de la obra dentro del Concepto o
-- de la Orden de Compra. Esa selección NO es la definición de «qué fila es de qué obra» —lo es
-- `cobro_por_obra`— y en BSA da distinto: la fila 46 («ACTUALIZACION DE PRECIOS OC 02-00000279»,
-- $3.583.956 netos / $4.336.586,76 brutos) pertenece a la obra por su orden 00002-00001984 y no dice
-- «BSA» en ninguna columna. Esta vista la INCLUYE y el Sheet la excluye:
--
--     BSA   contratado  $17.704.199,40  (OBRAS: $14.120.243,40)
--           por cobrar  $16.493.725,02  (OBRAS: $12.157.138,26)
--           vencido     $16.493.725,02  (OBRAS: $12.157.138,26)
--
-- Las otras ocho obras coinciden al centavo, y así lo prueba `obra-cuenta.pg.test.mjs`. La pestaña
-- queda para un trabajo aparte: su celda es una fórmula que Sheets evalúa sobre la propia hoja y no
-- puede consultar Postgres, así que emparejarlas exige cambiar cómo se arman los criterios del
-- SUMIFS — es un cambio del generador del Sheet, con efecto sobre el archivo que el dueño edita.

-- ── 1 · EL AÑO DEL RÓTULO, UNA SOLA VEZ ────────────────────────────────────────────────────────
--
-- `ANO` vive en `orquestador/lib/obras-grilla.mjs` y gobierna la ventana de TODA la pestaña. Acá se
-- replica, y `obra-cuenta.pg.test.mjs` compara las dos: subir el año en un solo lado dejaría la
-- pantalla mirando un año y la pestaña otro, sin un solo error.
create or replace function public.ano_obras()
returns integer
language sql
immutable
as $$ select 2026 $$;

comment on function public.ano_obras() is
  'El año del rótulo «⇒ TOTAL 2026» de la pestaña OBRAS. Réplica de ANO de '
  'orquestador/lib/obras-grilla.mjs; obra-cuenta.pg.test.mjs exige que sean el mismo número.';

-- ── 2 · EL PLAZO DE COBRO, UNA SOLA VEZ ────────────────────────────────────────────────────────
create or replace function public.plazo_cobro_dias()
returns integer
language sql
immutable
as $$ select 30 $$;

comment on function public.plazo_cobro_dias() is
  'Los días desde la EMISIÓN a partir de los cuales una cobranza está vencida. No es una política '
  'que decida este código: es la que el propio Cobranzas escribe en sus fórmulas (=P+30). Réplica '
  'de PLAZO_COBRO_DIAS de orquestador/lib/cobranzas-vencido.mjs.';

-- ── 3 · LA FILA DE LA PESTAÑA ──────────────────────────────────────────────────────────────────
create or replace view public.obra_cuenta with (security_invoker = false) as
with filas as (
  select i.obra_id,
         i.imputacion,
         cb.sheet_id,
         public.es_cobrada(cb.estado, cb.fecha_cobro)                     as esta_cobrada,
         lower(btrim(coalesce(cb.estado, ''))) = 'cancelar'               as esta_cancelada,
         cb.total_bruto, cb.monto_neto, cb.fecha_cobro, cb.fecha_emision, cb.forma_cobro
    from public.cobranzas cb
    join public.cobranza_imputacion i on i.cobranza_id = cb.id
   where i.obra_id is not null
), marcada as (
  select f.*,
         (extract(year from f.fecha_cobro) = public.ano_obras())          as en_el_ano,
         (not f.esta_cobrada and not f.esta_cancelada)                    as pendiente
    from filas f
), agregada as (
  select obra_id,
         count(*)::int                                                    as n_cobranzas,
         count(*) filter (where esta_cobrada)::int                        as n_cobradas,
         sum(total_bruto) filter (where esta_cobrada and en_el_ano)       as cobrado_total,
         sum(monto_neto)  filter (where esta_cobrada and en_el_ano)       as cobrado_neto,
         sum(total_bruto) filter (where pendiente and en_el_ano)          as por_cobrar,
         -- EL MISMO UNIVERSO QUE `por_cobrar`, OTRO RELOJ. Lo vencido es un REPARTO de la resta, no
         -- otra medición: si acotaran distinto, las dos cifras dejarían de cerrar entre sí.
         sum(total_bruto) filter (
           where pendiente and en_el_ano and fecha_emision is not null
             and fecha_emision < current_date - public.plazo_cobro_dias()) as vencido,
         min(fecha_cobro) filter (where pendiente and fecha_cobro is not null) as proximo_cobro_fecha,
         max(case imputacion when 'oc' then 1 when 'alias' then 2 else 3 end) as peor
    from marcada
   group by obra_id
)
select oc.id                                   as obra_id,
       oc.nombre                               as obra,
       oc.cliente_id,
       e.contratado,
       coalesce(a.n_cobranzas, 0)              as n_cobranzas,
       coalesce(a.n_cobradas, 0)               as n_cobradas,
       -- SIN FILAS, NULL. Una obra sin cobranzas imputadas no cobró «$0»: no se sabe.
       a.cobrado_total,
       a.cobrado_neto,
       a.por_cobrar,
       a.vencido,
       a.proximo_cobro_fecha,
       -- LA FORMA DE COBRO DE LA FILA QUE VIENE. Dos filas pueden compartir la fecha (el Playón de
       -- Azufre tiene Transferencia y Efectivo el mismo día): se toma la PRIMERA de la pestaña, que
       -- es lo que hace el INDEX/MATCH del Sheet, y no la más grande ni una cualquiera.
       (select m.forma_cobro from marcada m
         where m.obra_id = oc.id and m.pendiente and m.fecha_cobro = a.proximo_cobro_fecha
         order by nullif(regexp_replace(m.sheet_id, '\D', '', 'g'), '')::int nulls last
         limit 1)                              as proximo_cobro_medio,
       (case a.peor when 1 then 'oc' when 2 then 'alias' when 3 then 'cliente' end)::text as imputacion
  from public.obra_canonica oc
  left join agregada a on a.obra_id = oc.id
  left join public.obra_economia_cartera e on e.obra_canonica_id = oc.id
 where public.ve_economia();

comment on view public.obra_cuenta is
  'LA FILA DE LA PESTAÑA OBRAS en Postgres: contratado · cobrado (TOTAL con IVA y NETO, los dos con '
  'su nombre) · por cobrar · vencido · próximo cobro y su medio. Mismos criterios que '
  'orquestador/lib/obras-grilla.mjs: ventana del año por fecha de COBRO, y lo vencido con el reloj '
  'de la EMISIÓN + plazo_cobro_dias(). Las filas de cada obra salen de public.cobranza_imputacion '
  '(cobro_por_obra), NO del texto que busca el SUMIFS del Sheet: por eso BSA incluye la fila 46 y '
  'la pestaña no. La diferencia está medida y declarada en obra-cuenta.pg.test.mjs.';

grant select on public.obra_cuenta to authenticated;
grant select on public.obra_cuenta to service_role;

-- ── 4 · LOS CONTROLES ──────────────────────────────────────────────────────────────────────────
do $$
declare
  v_direccion uuid;
  v record;
begin
  select id into v_direccion from public.perfiles where rol = 'direccion' limit 1;
  if v_direccion is null then
    raise exception 'no hay ningún perfil de dirección: sin él estos controles no miran nada';
  end if;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_direccion, 'role', 'authenticated')::text, true);

  if (select count(*) from public.obra_cuenta where n_cobranzas > 0) = 0 then
    raise exception 'obra_cuenta no devolvió ninguna obra con cobranzas: el control no miró nada';
  end if;

  -- 4.1 · EL TOTAL NUNCA ES MENOR QUE EL NETO. Si alguien invierte las dos columnas —el defecto que
  -- esta vista viene a hacer imposible— esto se pone rojo con la obra escrita.
  for v in select obra_id, cobrado_total, cobrado_neto from public.obra_cuenta
            where cobrado_total is not null and cobrado_neto is not null
              and cobrado_total < cobrado_neto
  loop
    raise exception 'la obra % publica un cobrado TOTAL (%) menor que su NETO (%): las columnas '
                    'están invertidas', v.obra_id, v.cobrado_total, v.cobrado_neto;
  end loop;

  -- 4.2 · LO VENCIDO ES UN REPARTO DE LO POR COBRAR, NUNCA MÁS.
  for v in select obra_id, por_cobrar, vencido from public.obra_cuenta
            where vencido is not null and por_cobrar is not null and vencido > por_cobrar
  loop
    raise exception 'la obra % tiene vencido (%) mayor que lo por cobrar (%): los dos universos se '
                    'separaron', v.obra_id, v.vencido, v.por_cobrar;
  end loop;

  -- 4.3 · UNA OBRA CON PRÓXIMA FECHA TIENE MEDIO, Y AL REVÉS. Un «25/09 · » sin forma de cobro es
  -- una celda a medias que nadie puede usar para decidir.
  for v in select obra_id from public.obra_cuenta
            where (proximo_cobro_fecha is null) <> (proximo_cobro_medio is null)
  loop
    raise exception 'la obra % publica la próxima fecha de cobro sin su medio (o al revés)', v.obra_id;
  end loop;
end $$;
