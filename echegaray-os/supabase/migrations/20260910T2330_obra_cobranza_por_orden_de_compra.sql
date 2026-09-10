-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL COBRO ES DE UNA OBRA, Y LO DICE LA ORDEN DE COMPRA — NO LA ETIQUETA DEL CLIENTE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ EL DEFECTO, MEDIDO EN PRODUCCIÓN (10/09/2026) ═══
--
-- `obra_cobranza` (20260822T6200, predicado unificado en 20260910T2100) resuelve la obra de cada
-- fila de `public.cobranzas` con `norm_obra(obra_cliente) = obra_alias.alias`. Pero `obra_cliente`
-- NO nombra una obra: nombra al CLIENTE. Los cinco valores vivos, textuales:
--
--     'MESSINA'                              24 filas   $ 223.217.908,56
--     'ARCOR'                                17 filas   $  61.167.150,31
--     'IMOTOR/San Francisco/JAVI SANCHEZ'    21 filas   $ 211.457.748,40
--     'LA ESTRELLA /ALIMENTOS DEL SUR SAS'   18 filas   $ 192.747.417,93
--     'Quattropani - Melisa García SAS'      14 filas   $ 160.235.027,43
--
-- Los tres primeros resuelven a una obra BOLSA (`messina`, `arcor`) o a nada, y sólo `quattropani`
-- es además una obra en curso. Consecuencia medida: las cinco obras vivas de Messina —BSA, Bases
-- Tanque SO2, Pisos 120 m² y Rampa, Playón de Azufre, Adicional Tercer Muro— publicaban
-- `cobrado = NULL` con $ 223 M cobrados a ese cliente, y la barra de cobro de /clientes salía vacía
-- para Messina y San Francisco. El dueño lo reclamó hoy.
--
-- EL COBRO POR OBRA NO EXISTÍA EN LA BASE. No es que estuviera mal calculado: no había con qué.
--
-- ═══ LA CADENA QUE SÍ EXISTE, EN ORDEN ═══
--
--   1 · LA ORDEN DE COMPRA. La columna H del Sheet (`cobranzas.orden_compra`) declara la OC, y esa
--       OC está en `cliente_orden` con su `obra_id` —el papel que emitió el cliente, ya leído y
--       atribuido—. Es el único eslabón DOCUMENTAL: no se adivina, se lee.
--   2 · EL TEXTO QUE NOMBRA LA OBRA. Cuando no hay OC cargada, «PILON», «BASES TANQUE SO2 -
--       Cancelación» o «Playon Azufre - Negro - Certificación 1/2» nombran la obra. Se resuelve con
--       el MISMO diccionario `obra_alias`, restringido a las obras DEL MISMO CLIENTE y sólo con los
--       alias marcados `en_texto_libre` (ver más abajo por qué hace falta esa marca).
--   3 · LA BOLSA DEL CLIENTE, exactamente como hasta hoy — y marcada como tal.
--
-- EL ORDEN NO ES ESTÉTICO: la fila 94 de Messina («Adicional tercer muro (armado 20 m) Playon de
-- Azufre», OC 00002-00002256) nombra el Playón en el texto y pertenece al Adicional Tercer Muro
-- según su orden. Si el alias ganara, $ 12.100.000 se imputarían a la obra equivocada del mismo
-- cliente. El papel gana.
--
-- ═══ LA COLUMNA NUEVA `imputacion` — LO QUE LA PANTALLA NECESITABA PARA NO MENTIR ═══
--
-- 'oc' (hay un papel) · 'alias' (el texto nombra la obra) · 'cliente' (no se pudo: quedó con el
-- cliente). Sin este dato, una obra bolsa con $ 61 M dibuja la misma barra que una obra con su OC
-- probada, y la pantalla no tiene cómo decir «sin obra asignada». Es la diferencia entre un dato y
-- una ausencia con cara de dato — el mismo argumento con el que 20260822T6200 publicó `n_cobranzas`.
--
-- ═══ POR QUÉ `obra_alias.en_texto_libre` Y NO «BUSCAR TODOS LOS ALIAS EN EL TEXTO» ═══
--
-- Un alias sirve para MATCHEAR UNA ETIQUETA ENTERA («quattropani melisa garcia sas» = esta obra).
-- Buscarlo DENTRO de una frase es otra operación y no todos aguantan: el alias «san francisco»
-- (obra `san-francisco`, «Galpones, Mampostería, Cancha de Padel») aparece dentro de «Saldo obras
-- San Francisco — cuota quincenal 1 de 4», que es un pago de TODAS las obras del cliente. Sin la
-- marca, esas cuatro filas —$ 47,6 M— se imputarían enteras a una obra que no las generó. La marca
-- nace en `false`: un alias sólo entra al texto libre cuando alguien lo declara acá, con su fuente.
--
-- ═══ QUÉ NO HACE ESTA MIGRACIÓN ═══
--
-- NO declara la obra bolsa de San Francisco ni la de La Estrella. Sus etiquetas
-- («imotor san francisco javi sanchez», «estrella alimentos sur sas») no están en `obra_alias` y
-- 20260822T6200 ya escribió por qué: decir que ese rótulo compuesto pertenece a una obra y no a
-- otra lo firma una persona. Las filas de esos clientes que no resuelvan por OC ni por texto siguen
-- sin llegar a ninguna obra, igual que hoy, y quedan listadas en la consulta de verificación.

-- ── 1 · LA IDENTIDAD DEL NÚMERO DE ORDEN ────────────────────────────────────────────────────────
--
-- Réplica EXACTA de `numeroCanonico()` de `orquestador/lib/ordenes-identidad.mjs`: se queda con los
-- tramos de dígitos, tira los ceros a la izquierda de cada uno y descarta los que quedan en cero.
-- «00002-00002162», «OC 02- 00002162» y «02-00002162» son la MISMA orden: «2-2162». Sin esto, la
-- fila 51 («02-00002097») y la orden que emitió Messina («00002-00002097») son dos órdenes.
create or replace function public.oc_numero_canonico(numero text)
returns text
language sql
immutable
as $$
  select nullif(
    coalesce((
      select string_agg(t.limpio, '-' order by t.ord)
        from (
          select ltrim(m[1], '0') as limpio, ord
            from regexp_matches(coalesce(numero, ''), '\d+', 'g') with ordinality as r(m, ord)
        ) t
       where t.limpio <> ''
    ), ''),
  '')
$$;

comment on function public.oc_numero_canonico(text) is
  'La IDENTIDAD de un número de orden: «00002-00002162» y «02-00002162» son «2-2162». Réplica de '
  'numeroCanonico() de orquestador/lib/ordenes-identidad.mjs; las dos se comparan fila por fila en '
  'orquestador/lib/cobranza-obra.pg.test.mjs.';

-- ── 2 · QUÉ ORDEN DECLARA LA COLUMNA H ──────────────────────────────────────────────────────────
--
-- H no tiene formato. Las formas medidas hoy en el Sheet, textuales:
--
--     'OC 53239034'                            ARCOR, con rótulo
--     'OC 53241303 - 50%'                      con rótulo y una coletilla que también es número
--     '00002-00002097'                         Messina, el número pelado
--     '53312775 6A'                            pelado con el ítem de la orden pegado atrás
--     '00002-00002256 · cta. cte. 30 días'     pelado con la condición de pago pegada atrás
--     'Anticipo … Playon de Azufre. OC 00002-00002173 (11/08/2026) — 50% …'   rótulo en una frase
--     'RECLAMAR OC!'                           el rótulo SIN número: no declara ninguna orden
--
-- De ahí las dos reglas: el RÓTULO en cualquier parte, y —sólo si no hay rótulo— el número AL
-- PRINCIPIO. «Al principio» y no «en cualquier parte» porque «Resto 50% s/ total 65.000.000 —
-- certificación quincenal 1/2» tiene tres números y ninguno es una orden, y porque en
-- «… Playon de Azufre. (11/08/2026) — 50% anticipado» el año entraría como número de orden.
--
-- DOS ÓRDENES CON RÓTULO ⇒ NINGUNA. Una fila que cita dos órdenes no pertenece a una de las dos.
create or replace function public.oc_declarada(texto text)
returns text
language sql
immutable
as $$
  with rotuladas as (
    select distinct public.oc_numero_canonico(m[1]) as n
      from regexp_matches(
             coalesce(texto, ''),
             '\y(?:o/?c|orden(?:es)?\s+de\s+compra)\s*(?:n[°ºo.r]*)?\s*[:#-]?\s*(\d{1,5}\s*-\s*\d{3,10}|\d{4,10})',
             'gi') as m
  ), resumen as (
    select count(*) filter (where n is not null) as cuantas, min(n) as n from rotuladas
  )
  select case
           when r.cuantas = 1 then r.n
           when r.cuantas > 1 then null
           else public.oc_numero_canonico(
                  substring(coalesce(texto, '') from '^\s*(\d{1,5}\s*-\s*\d{3,10}|\d{4,10})'))
         end
    from resumen r
$$;

comment on function public.oc_declarada(text) is
  'El número de orden de compra —canónico— que declara la columna H de Cobranzas, o NULL. Acepta el '
  'rótulo en cualquier parte del texto y el número pelado SÓLO al principio: en «Resto 50% s/ total '
  '65.000.000 — certificación 1/2» ninguno de los tres números es una orden. Dos órdenes citadas ⇒ '
  'NULL. Réplica de ocDeclarada() de orquestador/lib/cobranza-obra.mjs.';

-- ── 3 · LA OBRA VIVA DE UNA OBRA FUSIONADA ──────────────────────────────────────────────────────
--
-- `bsa-planta` y `pisos-120m2` se fusionaron hoy (20260910T1900) y sus filas quedaron apuntando al
-- destino. Una OC cargada contra la obra vieja tiene que llevar su cobro a la viva: si no, el cobro
-- aterriza en una obra que `obra_panel` ya no muestra y desaparece de la pantalla sin avisar.
create or replace function public.obra_viva(p_obra_id text)
returns text
language sql
stable
as $$
  select coalesce(o.fusionada_en, o.id) from public.obra_canonica o where o.id = p_obra_id
$$;

comment on function public.obra_viva(text) is
  'El id de obra al que hay que imputar: el destino si la obra fue fusionada (obra_canonica.'
  'fusionada_en), el propio id si no. NULL si el id no existe.';

-- ── 4 · EL ALIAS QUE SE PUEDE BUSCAR DENTRO DE UNA FRASE ────────────────────────────────────────
alter table public.obra_alias
  add column if not exists en_texto_libre boolean not null default false;

comment on column public.obra_alias.en_texto_libre is
  'true = este alias se puede BUSCAR DENTRO del texto libre de una cobranza para imputarle la obra. '
  'Nace en false: «san francisco» identifica bien una etiqueta entera y arruinaría «Saldo obras San '
  'Francisco — cuota 1 de 4», que es un pago de todas las obras del cliente. Se enciende alias por '
  'alias, con la fila real que lo justifica en ejemplo_raw.';

-- La columna nueva nace SIN permiso: `obra_alias` tiene grants por columna, no por tabla. Esto no
-- ensancha nada — le da a la columna nueva exactamente lo que ya tienen las otras cuatro.
grant select, insert, update (en_texto_libre) on public.obra_alias to authenticated;
grant select, insert, update (en_texto_libre) on public.obra_alias to service_role;

-- ── 5 · LOS ALIAS DE OBRA QUE FALTABAN, CON SU FUENTE ───────────────────────────────────────────
--
-- Cada uno sale de una fila REAL de Cobranzas al 10/09/2026, copiada en `ejemplo_raw`. Ninguno es
-- una etiqueta de cliente: todos nombran una obra que ya existe en `obra_canonica` con ese cliente.
insert into public.obra_alias (alias, obra_id, clasificacion, ejemplo_raw, en_texto_libre) values
  ('pilon',                     'pilon',                    'obra', 'Cobranzas 28: «PILON - Pago parcial (07/05)»',        true),
  ('playon azufre',             'messina-playon-azufre',    'obra', 'Cobranzas 70: «Playon Azufre - Blanco - Certificación 1/2»', true),
  ('bases tanque so2',          'messina-bases-tanque-so2', 'obra', 'Cobranzas 98: «BASES TANQUE SO2 - Cancelación»',      true),
  ('relevamiento topografico',  'relevamiento-topografico', 'obra', 'Cobranzas 61: «Relevamiento topográfico»',            true),
  ('galpon 9',                  'le-galpon-9',              'obra', 'Cobranzas 40: «Faltante - GALPON 9»',                 true),
  ('oficinas y fabrica palitos','le-comedor',               'obra', 'Cobranzas 12: «Oficinas y Fabrica de Palitos»',       true),
  ('pisos industriales',        'pisos-industriales',       'obra', 'Cobranzas 62: «Pisos Industriales»',                  true),
  ('instalaciones electricas',  'instalacion-electrica',    'obra', 'Cobranzas 63: «Instalaciones Eléctricas — anticipo 1ª cuota»', true),
  ('instalacion electrica',     'instalacion-electrica',    'obra', 'obra_canonica: «SF - INSTALACIÓN ELÉCTRICA» (el singular del rótulo)', true),
  ('entrepiso',                 'entrepiso-y-escalera',     'obra', 'Cobranzas 87: «Entrepiso y Escaleras» (el alias corto cubre singular y plural)', true)
on conflict (alias) do update
  set obra_id = excluded.obra_id,
      ejemplo_raw = excluded.ejemplo_raw,
      en_texto_libre = excluded.en_texto_libre;

-- Ya existía y es seguro dentro de una frase: «Pisos 120m2 - Restante 50%».
update public.obra_alias set en_texto_libre = true where alias = 'pisos 120m2';

-- ── 6 · LA IMPUTACIÓN, FILA POR FILA ────────────────────────────────────────────────────────────
--
-- Vista propia y no un CTE dentro de `obra_cobranza` por dos razones: la pantalla necesita el
-- DETALLE para poder listar «sin obra asignada» sin volver a resolver nada por su cuenta, y la
-- verificación (antes/después, y el contraste contra la regla en JS) necesita mirar fila por fila.
-- Una segunda copia de esta lógica en un script de control sería una segunda definición del mismo
-- concepto, que es el defecto que este repo persigue.
--
-- `security_invoker = false` con `ve_economia()` adentro, igual que `obra_cobranza` y por el mismo
-- motivo escrito en 20260822T6200: `authenticated` no tiene select sobre `cobranzas` ni sobre
-- `cliente_orden`, y una vista invoker daría «permission denied» a la web entera. No publica ni un
-- peso: cobranza, cliente, la orden que declaró y a qué obra fue.
create or replace view public.cobranza_imputacion with (security_invoker = false) as
with base as (
  select cb.id                                                     as cobranza_id,
         cb.cliente_id,
         public.oc_declarada(cb.orden_compra)                      as orden_declarada,
         public.norm_obra(coalesce(cb.concepto, '') || ' ' || coalesce(cb.orden_compra, '')) as texto,
         public.norm_obra(cb.obra_cliente)                         as etiqueta_cliente
    from public.cobranzas cb
), por_oc as (
  -- EL PAPEL. Mismo cliente, orden de compra no eliminada, y la obra resuelta a su versión viva.
  select b.cobranza_id,
         count(distinct public.obra_viva(co.obra_id)) as cuantas,
         min(public.obra_viva(co.obra_id))            as obra_id
    from base b
    join public.cliente_orden co
      on co.cliente_id = b.cliente_id
     and co.tipo = 'orden_compra'
     and co.eliminado_en is null
     and public.oc_numero_canonico(coalesce(co.numero_canonico, co.numero)) = b.orden_declarada
   where b.orden_declarada is not null
     and public.obra_viva(co.obra_id) is not null
   group by b.cobranza_id
), por_alias as (
  -- EL TEXTO. Sólo alias habilitados y sólo de obras del MISMO cliente: sin ese recorte, «entrepiso»
  -- de San Francisco podría llevarse un cobro de Messina.
  select b.cobranza_id,
         count(distinct public.obra_viva(a.obra_id)) as cuantas,
         min(public.obra_viva(a.obra_id))            as obra_id
    from base b
    join public.obra_alias a
      on a.en_texto_libre
     and a.obra_id is not null
     and a.clasificacion in ('obra', 'mantenimiento')
     and b.texto ~ ('\y' || a.alias || '\y')
    join public.obra_canonica o
      on o.id = a.obra_id
     and o.cliente_id = b.cliente_id
   where public.obra_viva(a.obra_id) is not null
   group by b.cobranza_id
), bolsa as (
  -- LO DE HOY, INTACTO: `norm_obra(obra_cliente) = obra_alias.alias`, con el mismo recorte de
  -- clasificación que hacía 20260822T6200.
  select b.cobranza_id, public.obra_viva(a.obra_id) as obra_id
    from base b
    join public.obra_alias a
      on a.alias = b.etiqueta_cliente
     and a.obra_id is not null
     and a.clasificacion in ('obra', 'mantenimiento')
)
select b.cobranza_id,
       b.cliente_id,
       b.orden_declarada,
       case when oc.cuantas = 1 then oc.obra_id
            when al.cuantas = 1 then al.obra_id
            else bo.obra_id end                                    as obra_id,
       case when oc.cuantas = 1 then 'oc'
            when al.cuantas = 1 then 'alias'
            when bo.obra_id is not null then 'cliente' end         as imputacion
  from base b
  left join por_oc    oc on oc.cobranza_id = b.cobranza_id
  left join por_alias al on al.cobranza_id = b.cobranza_id
  left join bolsa     bo on bo.cobranza_id = b.cobranza_id
 where public.ve_economia();

comment on view public.cobranza_imputacion is
  'A qué OBRA pertenece cada fila de Cobranzas y CON QUÉ FUERZA. Orden: (1) la OC declarada en la '
  'columna H, buscada en cliente_orden del mismo cliente; (2) el texto que nombra una obra del '
  'cliente, sólo con alias en_texto_libre; (3) la obra bolsa del cliente, como hasta el 10/09/2026. '
  'imputacion = oc | alias | cliente; obra_id NULL = no se pudo imputar a ninguna obra y la pantalla '
  'tiene que decirlo, no dibujar un cero. La regla vive también en orquestador/lib/cobranza-obra.mjs '
  'y las dos se comparan en cobranza-obra.pg.test.mjs.';

grant select on public.cobranza_imputacion to authenticated;
grant select on public.cobranza_imputacion to service_role;

-- ── 7 · LA VISTA POR OBRA, CON LA MISMA FORMA Y UNA COLUMNA MÁS ─────────────────────────────────
--
-- Todas las columnas de 20260910T2100 con el mismo nombre, el mismo tipo y el mismo orden —los
-- consumidores (TablaClientes, progresoCobro, homeCartera, economia-de-obra.pg.test) no cambian—.
-- Lo único nuevo es `imputacion`, y lo único que cambia es de dónde sale `obra_id`.
--
-- `imputacion` de la OBRA es la PEOR de sus filas: una obra donde la mitad del cobro llegó por la
-- etiqueta del cliente no está imputada por OC, y decir 'oc' porque alguna fila lo estaba sería el
-- mismo optimismo que esta migración vino a sacar.
create or replace view public.obra_cobranza with (security_invoker = false) as
with clasificada as (
  select i.obra_id,
         i.imputacion,
         public.es_cobrada(cb.estado, cb.fecha_cobro) as esta_cobrada,
         cb.total_bruto,
         cb.monto_neto
    from public.cobranzas cb
    join public.cobranza_imputacion i on i.cobranza_id = cb.id
   where i.obra_id is not null
), por_obra as (
  select obra_id,
         count(*)::int                                            as n_cobranzas,
         count(*) filter (where esta_cobrada)::int                as n_cobradas,
         sum(total_bruto) filter (where esta_cobrada)             as cobrado,
         sum(monto_neto)  filter (where esta_cobrada)             as cobrado_neto,
         sum(total_bruto) filter (where not esta_cobrada)         as por_cobrar_proyectado,
         max(case imputacion when 'oc' then 1 when 'alias' then 2 else 3 end) as peor
    from clasificada
   group by obra_id
)
select oc.id                                as obra_id,
       oc.nombre                            as obra,
       coalesce(p.n_cobranzas, 0)           as n_cobranzas,
       coalesce(p.n_cobradas, 0)            as n_cobradas,
       -- SIN FILAS, NULL. Una obra sin ninguna cobranza imputada no cobró «$0»: no se sabe.
       p.cobrado,
       p.cobrado_neto,
       p.por_cobrar_proyectado,
       (case p.peor when 1 then 'oc' when 2 then 'alias' when 3 then 'cliente' end)::text as imputacion
  from public.obra_canonica oc
  left join por_obra p on p.obra_id = oc.id
 where public.ve_economia();

comment on view public.obra_cobranza is
  'FUENTE ÚNICA de lo COBRADO y lo POR COBRAR de cada obra. Desde el 10/09/2026 la obra sale de '
  'public.cobranza_imputacion —la OC de la columna H primero, el texto que nombra la obra después, '
  'la bolsa del cliente al final— y NO de norm_obra(obra_cliente), que nombra al cliente y metía las '
  '24 filas de Messina en una sola obra bolsa. Qué está cobrado lo sigue decidiendo '
  'public.es_cobrada(). `cobrado` es bruto (lo que entra al banco); `cobrado_neto` es sin IVA y es el '
  'único comparable contra el contrato. `imputacion` es la PEOR de las filas de la obra: con '
  '«cliente» la pantalla tiene que decir «sin obra asignada», no dibujar una barra. Sin filas, NULL. '
  'Corre como dueña con ve_economia() en el WHERE porque authenticated no tiene select sobre '
  'cobranzas.';

grant select on public.obra_cobranza to authenticated;
grant select on public.obra_cobranza to service_role;

-- ── 8 · LOS CONTROLES, DENTRO DE LA MIGRACIÓN ───────────────────────────────────────────────────
--
-- Se corren acá y no en un script aparte porque un control que hay que acordarse de correr no es un
-- control. Los tres pueden dar rojo: el primero se comprobó apagando la marca `en_texto_libre`, el
-- segundo se comprobó apuntando un alias a una obra de otro cliente, y el tercero se comprobó
-- revirtiendo el paso de la OC — los tres pusieron rojo el `raise exception`.
do $$
declare
  v_direccion uuid;
  v record;
  v_texto text := '';
  v_filas int;
begin
  -- ── 8.0 · SIN SESIÓN QUE VEA ECONOMÍA, LOS CONTROLES MIRAN CERO FILAS Y PASAN SIEMPRE ──
  --
  -- `cobranza_imputacion` y `obra_cobranza` llevan `ve_economia()` en el WHERE. Corriendo la
  -- migración como dueño de la base, `current_rol()` no devuelve nada y las dos vistas se leen
  -- VACÍAS: los controles de abajo darían verde sin haber mirado un solo cobro. Es exactamente el
  -- verde falso del barrido que no encuentra archivos.
  select id into v_direccion from public.perfiles where rol = 'direccion' limit 1;
  if v_direccion is null then
    raise exception 'no hay ningún perfil de dirección: sin él estos controles no pueden mirar nada';
  end if;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_direccion, 'role', 'authenticated')::text, true);
  if not public.ve_economia() then
    raise exception 'la sesión de control no ve economía: los controles mirarían cero filas';
  end if;

  select count(*) into v_filas from public.cobranza_imputacion;
  if v_filas = 0 then
    raise exception 'cobranza_imputacion devolvió CERO filas: el control no miró nada';
  end if;

  -- ── 8.1 · TODO ALIAS DE TEXTO LIBRE ESTÁ NORMALIZADO ──
  --
  -- El alias entra a una expresión regular. Si no está normalizado no matchea nunca (el texto sí lo
  -- está) y, peor, un carácter suyo podría significar algo dentro de la expresión.
  for v in select alias from public.obra_alias
            where en_texto_libre and alias <> public.norm_obra(alias)
  loop
    v_texto := v_texto || v.alias || ' ';
  end loop;
  if v_texto <> '' then
    raise exception 'alias de texto libre sin normalizar (no matchearían nunca): %', v_texto;
  end if;

  -- ── 8.2 · NINGÚN PESO CRUZA DE UN CLIENTE A OTRO ──
  --
  -- La imputación mueve plata ENTRE OBRAS DEL MISMO CLIENTE. Si una fila termina en una obra de otro
  -- cliente, el total por cliente deja de cerrar contra `cliente_cuenta_corriente` y no habría cómo
  -- notarlo mirando la pantalla.
  for v in
    select i.cobranza_id, i.obra_id, i.cliente_id, o.cliente_id as cliente_de_la_obra
      from public.cobranza_imputacion i
      join public.obra_canonica o on o.id = i.obra_id
     where i.cliente_id is not null
       and o.cliente_id is not null
       and o.cliente_id <> i.cliente_id
  loop
    v_texto := v_texto || v.cobranza_id || '→' || v.obra_id || ' ';
  end loop;
  if v_texto <> '' then
    raise exception 'estas cobranzas fueron a parar a una obra de OTRO cliente: %', v_texto;
  end if;

  -- ── 8.3 · LA SUMA POR CLIENTE NO CAMBIA, Y NINGUNA FILA PIERDE SU OBRA ──
  --
  -- Se compara contra la regla VIEJA (`norm_obra(obra_cliente) = obra_alias.alias`) sobre las filas
  -- que ESA regla resolvía: son las únicas que tenían un antes. Las filas que hoy no llegaban a
  -- ninguna obra —las 21 de San Francisco y las 18 de La Estrella— sólo pueden SUMAR, y eso no es
  -- una diferencia a explicar: es el defecto que se está cerrando. Se listan en la verificación.
  for v in
    with vieja as (
      select cb.id, public.obra_viva(a.obra_id) as obra_id, coalesce(cb.total_bruto, 0) as total
        from public.cobranzas cb
        join public.obra_alias a
          on a.alias = public.norm_obra(cb.obra_cliente)
         and a.obra_id is not null
         and a.clasificacion in ('obra', 'mantenimiento')
    ), antes as (
      select o.cliente_id, sum(vj.total) as total
        from vieja vj join public.obra_canonica o on o.id = vj.obra_id
       group by o.cliente_id
    ), despues as (
      select o.cliente_id, sum(vj.total) as total
        from vieja vj
        join public.cobranza_imputacion i on i.cobranza_id = vj.id
        join public.obra_canonica o on o.id = i.obra_id
       group by o.cliente_id
    )
    select coalesce(a.cliente_id, d.cliente_id) as cliente_id,
           coalesce(a.total, 0) as antes, coalesce(d.total, 0) as despues
      from antes a full outer join despues d on d.cliente_id = a.cliente_id
     where coalesce(a.total, 0) <> coalesce(d.total, 0)
  loop
    v_texto := v_texto || v.cliente_id || ': ' || v.antes || ' → ' || v.despues || ' ';
  end loop;
  if v_texto <> '' then
    raise exception 'la imputación movió plata entre clientes o dejó filas sin obra: %', v_texto;
  end if;

  -- ── 8.4 · EL CONTROL QUE PRUEBA QUE ALGO PASÓ ──
  --
  -- Los tres de arriba pasarían intactos si la migración no hiciera nada: son controles de NO ROMPER.
  -- Éste exige que la cadena esté viva. Sin él, revertir el paso de la OC dejaría los controles en
  -- verde y la pantalla igual de vacía que ayer.
  select count(*) into v_filas from public.cobranza_imputacion where imputacion = 'oc';
  if v_filas < 15 then
    raise exception 'sólo % cobranzas se imputaron por ORDEN DE COMPRA: la cadena H → cliente_orden → obra no está funcionando', v_filas;
  end if;
end
$$;
