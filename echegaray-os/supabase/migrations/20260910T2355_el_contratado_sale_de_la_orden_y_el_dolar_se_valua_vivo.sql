-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL CONTRATADO DE UNA OBRA: LO DICE SU ORDEN DE COMPRA, Y EL DÓLAR SE VALÚA VIVO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Cuatro defectos medidos el 10/09/2026 sobre las nueve obras en curso, todos del LADO QUE LEE
-- (`obras-economia-sync.mjs` → `obra_economia_sheet` → `obra_economia_cartera` / `cliente_economia`).
-- La pestaña OBRAS del Sheet no se toca acá.
--
-- ═══ 1 · LA MARCA DEL ORIGEN MENTÍA EN CUATRO OBRAS DE NUEVE ═══
--
-- `origen = 'suma-viva'` significa «esta obra no declara contrato en ningún lado y publico la suma
-- de sus filas de Cobranzas» — el camino MÁS DÉBIL, el que el propio módulo declara como riesgoso
-- («si una obra tuviera hitos sin cargar, esta celda publicaría de menos»). Cuatro obras salían con
-- esa marca teniendo el PAPEL cargado en `cliente_orden`:
--
--     ME - ADICIONAL TERCER MURO   OC 2256        $ 12.100.000 c/IVA = $ 10.000.000 neto  ✔
--     ME - PLAYÓN DILUCIÓN ÁCIDO   OC 2266        $ 24.309.950,07    = $ 20.090.867,83    ✔
--     ME - PISOS 120 M² Y RAMPA    OC 2097+2226   $ 11.450.401,73    = $  9.463.141,93    ✔
--     ME - BSA                     5 OC           $ 49.886.583,12    ≠ $ 17.704.199,40    ✗
--
-- Las tres primeras coinciden al centavo con la suma viva: el número no cambia, cambia lo que se
-- puede AFIRMAR de él —hay un papel que lo respalda— y eso es exactamente lo que decide si se
-- reclama o no. La cuarta no coincide, y ahí la marca honesta sigue siendo `suma-viva` CON LA
-- DIFERENCIA ESCRITA al lado, en vez de un número solo que no se puede desmentir.
--
-- ═══ 2 · UNA OC DE 2024 NO ES EL CONTRATO DE LA OBRA DE 2026 ═══
--
-- `bsa-planta` se fusionó en `messina-bsa` (20260910T1900) y con ella entraron sus tres OC de 2024
-- ($ 38.321.214,36). El panel sumaba «OC · OP c/IVA $ 49.886.583» al lado de un contratado de
-- $ 17,7 M: dos números de la misma obra, tres años de diferencia, y ninguna forma de verlo. La
-- pestaña OBRAS ya acota su cuadro al año del rótulo (`ANO = 2026`); acá se acota IGUAL, y lo de
-- antes no se tira: se cuenta aparte como histórico de la obra fusionada.
--
-- ═══ 3 · UN CONTRATO EN DÓLARES CONGELADO ES UN DATO FALSO CON CARA DE DATO ═══
--
-- Quattropani se firmó por U$S 63.000. La pestaña publica `=63000*TIPO_CAMBIO_USD` —una fórmula
-- viva, $ 95.302.494 hoy— y el sync persistía `63.000 × el TC del momento de la corrida`
-- ($ 95.298.588). Los dos números son de la misma obra y sólo coinciden el día del sync; el resto
-- del tiempo la pantalla publica el dólar de ayer sin decirlo. La valuación se muda a la VISTA: el
-- número en dólares se persiste una vez y el peso se calcula cada vez que alguien mira.
--
-- ═══ 4 · LAS OC DE ARCOR ESTÁN EN NETO Y LAS DE MESSINA CON IVA ═══
--
-- Verificado contra la base el 10/09/2026, no contra el PDF: las cobranzas que citan cada OC de
-- ARCOR suman EXACTAMENTE el importe de la orden en NETO (53241303 → 0,5 + 0,5; 53259436 → 0,3 +
-- 0,1 + 0,3 + 0,3; 53270182 → 1,0). Las de Messina, en cambio, sólo cierran dividiendo por 1,21.
-- Dividir todo por 1,21 le sacaría a ARCOR el 17,4% de su cartera de papeles; no dividir nada le
-- inflaría a Messina el contratado en 21%. La diferencia la declara una columna, no un `if` con el
-- nombre del cliente adentro.

-- ── 1 · LA ORDEN DECLARA SI SU IMPORTE YA ESTÁ SIN IVA ──────────────────────────────────────────
alter table public.cliente_orden
  add column if not exists importe_es_neto boolean not null default false;

comment on column public.cliente_orden.importe_es_neto is
  'true = `importe` ya está SIN IVA («antes de impuestos» en el PDF de ARCOR). false = con IVA, que '
  'es lo que emite Messina. Nace en false porque es el caso de la mayoría; se enciende por cliente '
  'con la evidencia. Lo consume neto_de_orden(): un contratado comparado contra una OC en la unidad '
  'equivocada se equivoca en 21% sin dar error.';

-- La columna nace SIN permiso: `cliente_orden` tiene grants por columna.
-- Mismo reparto que las otras columnas de la tabla: `authenticated` LEE, el servicio escribe.
grant select (importe_es_neto) on public.cliente_orden to authenticated;
grant select, insert, update (importe_es_neto) on public.cliente_orden to service_role;

-- ARCOR emite sus órdenes en neto. La evidencia está arriba y es de la propia base.
update public.cliente_orden co
   set importe_es_neto = true
  from public.clientes c
 where c.id = co.cliente_id
   and c.slug = 'arcor'
   and co.importe_es_neto is distinct from true;

-- ── 2 · EL NETO DE UNA ORDEN, UNA SOLA VEZ ─────────────────────────────────────────────────────
--
-- Réplica de `netoDeOrden()` de `orquestador/lib/obras-economia.mjs`. El 1,21 es la alícuota general
-- de IVA de obra sobre inmueble ajeno; si alguna orden llevara otra, la cuenta se rompe en silencio
-- y por eso el importe neto NUNCA se publica solo: viaja con el importe c/IVA al lado.
create or replace function public.neto_de_orden(importe numeric, es_neto boolean)
returns numeric
language sql
immutable
as $$
  select case when importe is null then null
              when coalesce(es_neto, false) then importe
              else importe / 1.21 end
$$;

comment on function public.neto_de_orden(numeric, boolean) is
  'El importe de una orden de compra SIN IVA. Divide por 1,21 salvo que la orden declare '
  'importe_es_neto (ARCOR). Réplica de netoDeOrden() de orquestador/lib/obras-economia.mjs.';

-- ── 3 · LO QUE EL LECTOR PERSISTE PARA PODER DESMENTIRSE ────────────────────────────────────────
--
-- `referencia` y `nota` no son adornos: son la diferencia entre un número y un número que se puede
-- auditar sin volver a la fuente. La regla de este repo —«el número que decide se publica, y la
-- evidencia de cómo se formó viaja con él»— ya la cumple `contratoDeObra` con sus `valores`; acá se
-- cumple del lado de Postgres.
alter table public.obra_economia_sheet
  add column if not exists referencia        text,
  add column if not exists nota              text,
  add column if not exists oc_civa_ventana   numeric,
  add column if not exists oc_civa_historico numeric,
  add column if not exists oc_n_ventana      integer,
  add column if not exists oc_n_historico    integer;

comment on column public.obra_economia_sheet.referencia is
  'De qué papel sale el contratado cuando sale de uno: «según OC 2256». NULL cuando el número es la '
  'suma viva de Cobranzas y no lo respalda ninguna orden.';
comment on column public.obra_economia_sheet.nota is
  'La discrepancia declarada cuando la obra TIENE órdenes cargadas y no cierran contra el número '
  'publicado: «OC $X c/IVA vs Cobranzas $Y». Una diferencia escrita se puede resolver; una '
  'diferencia que sólo existe entre dos pantallas, no.';
comment on column public.obra_economia_sheet.oc_civa_ventana is
  'Σ de las OC de la obra CON IVA dentro de la misma ventana anual que el contratado (el ANO de '
  'obras-grilla.mjs). Es el total que la pantalla puede mostrar al lado del contrato sin mezclar '
  'períodos.';
comment on column public.obra_economia_sheet.oc_civa_historico is
  'Σ de las OC de la obra CON IVA FUERA de esa ventana — típicamente las de la obra fusionada. Se '
  'cuenta aparte y no se tira: son papeles reales de la misma obra, de otro año.';

grant select (referencia, nota, oc_civa_ventana, oc_civa_historico, oc_n_ventana, oc_n_historico)
  on public.obra_economia_sheet to authenticated;
grant select, insert, update (referencia, nota, oc_civa_ventana, oc_civa_historico,
                              oc_n_ventana, oc_n_historico)
  on public.obra_economia_sheet to service_role;

-- El origen gana un cuarto valor: el contrato que NO está escrito en Cobranzas pero SÍ está en el
-- papel que mandó el cliente. Sin él, «hay una OC que respalda esto» y «no hay nada que lo respalde»
-- se publicaban con la misma marca.
alter table public.obra_economia_sheet drop constraint if exists obra_economia_sheet_origen_check;
alter table public.obra_economia_sheet add constraint obra_economia_sheet_origen_check
  check (origen is null or origen in ('oc-pesos', 'oc-usd-x-tc', 'suma-viva', 'oc-cliente'));

comment on column public.obra_economia_sheet.origen is
  'Por qué camino salió el contratado: oc-pesos (lo declara el texto de la Orden de Compra en '
  'Cobranzas) · oc-usd-x-tc (declarado en dólares; el peso lo valúa la vista, no esta tabla) · '
  'oc-cliente (no lo declara Cobranzas, pero las OC cargadas en cliente_orden suman lo mismo ±$1) · '
  'suma-viva (no lo respalda ningún papel: es la suma de sus filas de Cobranzas).';

-- ── 4 · EL PESO DE UN CONTRATO EN DÓLARES SE CALCULA AL MIRARLO ─────────────────────────────────
--
-- `tipo_cambio` existe desde 20260821T4200 y NACIÓ VACÍA a propósito. La llena
-- `obras-economia-sync.mjs` con el mismo `TIPO_CAMBIO_USD` que usa la pestaña — una fila por día,
-- con su fuente. Sin ninguna fila, esta función cae al peso persistido: degradarse al dólar de la
-- última corrida es peor que el vivo y mucho mejor que publicar NULL en la obra más grande del año.
create or replace function public.tc_vigente()
returns numeric
language sql
stable
as $$
  select t.tc from public.tipo_cambio t where t.fecha <= current_date order by t.fecha desc limit 1
$$;

comment on function public.tc_vigente() is
  'El tipo de cambio más reciente cargado en public.tipo_cambio con fecha <= hoy, o NULL. Lo escribe '
  'obras-economia-sync.mjs leyendo el rango TIPO_CAMBIO_USD del Sheet.';

create or replace function public.contratado_valuado(contratado numeric, contratado_usd numeric)
returns numeric
language sql
stable
as $$
  select case
           when contratado_usd is not null and public.tc_vigente() is not null
             then contratado_usd * public.tc_vigente()
           else contratado
         end
$$;

comment on function public.contratado_valuado(numeric, numeric) is
  'El contratado EN PESOS. Un contrato firmado en dólares se valúa al TC vigente CADA VEZ QUE SE '
  'MIRA: persistir `63.000 x el TC del sync` publicaba $95.298.588 mientras la pestaña —que usa una '
  'fórmula viva— decía $95.302.494, y los dos números sólo coincidían el día de la corrida. Vive '
  'como función y no repetida en cada vista porque la usan obra_economia_cartera y '
  'contratado_de_cliente(), y dos copias publicarían la misma obra distinto.';

-- `security_invoker = false` como nació: la vista lee `obra_economia_sheet`, que tiene RLS, y el
-- portero de la economía ya está adentro (`ve_economia()`). Encenderlo la dejaría vacía para la web.
create or replace view public.obra_economia_cartera with (security_invoker = false) as
select e.obra_canonica_id,
       e.obra_clave,
       case when public.ve_economia() or auth.uid() is null
            then public.contratado_valuado(e.contratado, e.contratado_usd) end as contratado,
       case when public.ve_economia() or auth.uid() is null then e.contratado_usd end as contratado_usd,
       e.costo_mo,
       e.costo_materiales,
       -- EL MARGEN SIGUE AL CONTRATADO. Publicar un margen calculado con el dólar de ayer al lado de
       -- un contratado de hoy es peor que no publicarlo: los dos números parecen consistentes.
       case when public.ve_economia() or auth.uid() is null
            then case when e.contratado_usd is not null and public.tc_vigente() is not null
                           and e.costo_mo is not null and e.costo_materiales is not null
                      then public.contratado_valuado(e.contratado, e.contratado_usd)
                           - e.costo_mo - e.costo_materiales
                      else e.margen end end as margen,
       e.plazo_desde,
       e.plazo_hasta,
       e.origen,
       e.leido_en,
       e.referencia,
       e.nota,
       e.oc_civa_ventana,
       e.oc_civa_historico,
       e.oc_n_ventana,
       e.oc_n_historico,
       public.tc_vigente() as tipo_cambio
  from public.obra_economia_sheet e;

comment on view public.obra_economia_cartera is
  'La economía de cada obra para las pantallas. Desde el 10/09/2026 el contratado en dólares se '
  'valúa acá con public.tc_vigente() —no en el sync— y viaja con `referencia` (el papel que lo '
  'respalda), `nota` (la discrepancia declarada contra las OC cargadas) y los dos totales de OC: '
  'la ventana del año y el histórico de la obra fusionada, que NO se suman entre sí.';

grant select on public.obra_economia_cartera to authenticated;
grant select on public.obra_economia_cartera to service_role;

-- El contratado del CLIENTE suma el de sus obras: si la obra se valúa viva y el cliente no, la ficha
-- y la lista dicen distinto del mismo cliente — que es lo que REALIDAD ÚNICA prohíbe.
create or replace function public.contratado_de_cliente(cliente uuid, solo_en_curso boolean default false)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when public.ve_economia() or auth.uid() is null or public.cliente_de_sesion() = cliente
    then (
      select sum(public.contratado_valuado(e.contratado, e.contratado_usd))
        from public.obra_canonica oc
        join public.obra_economia_sheet e on e.obra_canonica_id = oc.id
       where oc.cliente_id = cliente
         and oc.fusionada_en is null
         and (not solo_en_curso or oc.estado = 'activa')
    )
  end
$function$;

-- ── 5 · EL ALIAS QUE FALTABA, CON SU FILA ──────────────────────────────────────────────────────
--
-- `sf-mamposteria` no tenía ningún alias `en_texto_libre`, así que al pasar el contratado a la
-- imputación canónica su única fila («Mampostería y cancha de padel», $ 9.273.576,40) se quedaba
-- sin obra y la obra sin contrato. «mamposteria» no aparece en ninguna otra fila de San Francisco
-- (verificado sobre las 21 del cliente al 10/09/2026) y «cancha de padel» no es alias de nadie, así
-- que no puede reclamar la fila una segunda obra.
insert into public.obra_alias (alias, obra_id, clasificacion, ejemplo_raw, en_texto_libre) values
  ('mamposteria', 'sf-mamposteria', 'obra', 'Cobranzas 85: «Mampostería y cancha de padel»', true)
on conflict (alias) do update
  set obra_id = excluded.obra_id, ejemplo_raw = excluded.ejemplo_raw, en_texto_libre = true;

-- ── 6 · LOS CONTROLES ──────────────────────────────────────────────────────────────────────────
do $$
declare
  v_direccion uuid;
  v_n int;
  v_tc numeric;
begin
  -- Sin sesión que vea economía, todo lo de abajo mira cero filas y pasa siempre.
  select id into v_direccion from public.perfiles where rol = 'direccion' limit 1;
  if v_direccion is null then
    raise exception 'no hay ningún perfil de dirección: sin él estos controles no miran nada';
  end if;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_direccion, 'role', 'authenticated')::text, true);

  select count(*) into v_n from public.obra_economia_cartera;
  if v_n = 0 then
    raise exception 'obra_economia_cartera devolvió CERO filas: el control no miró nada';
  end if;

  -- 6.1 · ARCOR quedó marcada y nadie más.
  select count(*) into v_n
    from public.cliente_orden co join public.clientes c on c.id = co.cliente_id
   where co.importe_es_neto and c.slug <> 'arcor';
  if v_n > 0 then
    raise exception '% órdenes de otros clientes quedaron marcadas como netas', v_n;
  end if;

  -- 6.2 · El neto de una orden con IVA es su importe / 1,21, y el de una neta es su importe.
  if public.neto_de_orden(12100000, false) <> 10000000 then
    raise exception 'neto_de_orden no descuenta el IVA: 12.100.000 c/IVA tendría que dar 10.000.000';
  end if;
  if public.neto_de_orden(12100000, true) <> 12100000 then
    raise exception 'neto_de_orden le descontó IVA a una orden que ya venía neta';
  end if;

  -- 6.3 · LA VALUACIÓN VIVA PUEDE DAR ROJO: con un TC cargado, el contratado en dólares tiene que
  -- MOVERSE. Si `contratado_valuado` devolviera el peso persistido, este bloque no lo notaría nunca
  -- — así que se prueba con dos tipos de cambio distintos, dentro de una subtransacción que se
  -- deshace.
  select tc into v_tc from public.tipo_cambio where fecha = current_date;
  insert into public.tipo_cambio (fecha, tc, fuente)
       values (current_date, 1000, 'control de la migración 20260910T2355')
  on conflict (fecha) do update set tc = 1000, fuente = excluded.fuente;
  if public.contratado_valuado(999, 100) <> 100000 then
    raise exception 'contratado_valuado ignoró el tipo de cambio vigente';
  end if;
  update public.tipo_cambio set tc = 2000 where fecha = current_date;
  if public.contratado_valuado(999, 100) <> 200000 then
    raise exception 'contratado_valuado no siguió al tipo de cambio: quedó congelado';
  end if;
  if public.contratado_valuado(999, null) <> 999 then
    raise exception 'contratado_valuado pisó un contrato en pesos con una valuación en dólares';
  end if;
  if v_tc is null then
    delete from public.tipo_cambio where fecha = current_date
      and fuente = 'control de la migración 20260910T2355';
  else
    update public.tipo_cambio set tc = v_tc where fecha = current_date;
  end if;
end $$;
