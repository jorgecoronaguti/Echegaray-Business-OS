-- 20260925T1100 · EL ADELANTO DE SUELDO QUE SE PAGA CON PLATA DE UNA ENTREGA, ESCRITO EN EL CANAL EFECTIVO.
--
-- Dueño, 25/09/2026, textual: *«necesito que se reconozca por lenguaje natural imputaciones de gastos
-- directamente como se escribe en canal efectivo del chat. es una funcion especifica de pago de adelantos a
-- empleados por escritura en ese chat. el pago se le tiene q imputar como rendicion directa a la persona q
-- escribio esto, debe quedar registrado como pago en modulo liquidacion de hs de app.ecsas.com.ar (si hay algo
-- antes tiene q sumarlo a lo q hay es decir antes habia 8500*8 + 7600, asi) y tiene q enviar todas las
-- confirmaciones por el hilo de esa carga en el canal efectivo del chat»*.
--
-- ═══ DOS ESCRITURAS, UNA TRANSACCIÓN ═══
--
--   1. LA RENDICIÓN. Una fila de `efectivo_rendicion` contra la entrega abierta de quien escribió: su saldo a
--      rendir baja por el importe. No hay ticket ni fila de Compras —un adelanto de sueldo no es una compra—, así
--      que la clave es `adelanto:<id del mensaje>` y el comprobante es el mensaje mismo (`origen_post_id`).
--   2. EL PAGO EN LIQUIDACIÓN. La celda «Pagado efectivo» (`liquidacion_linea.pagado_efectivo` + su cuenta en
--      `formulas.pagadoEfectivo`) de ese empleado en la quincena de la fecha. Es la celda donde el dueño escribe
--      hoy los adelantos («=8500*8»): el importe se SUMA a la cuenta que haya, nunca la pisa.
--
-- Si una de las dos no se puede, no se hace ninguna: una rendición sin pago en Liquidación le baja el saldo a
-- quien escribió sin que el empleado lo tenga descontado, y al revés el billete queda dos veces en la calle.
--
-- ═══ POR QUÉ NO `persona_adelanto` (la tabla del botón «Registrar un adelanto») ═══
--
-- Medido el 25/09/2026: 0 filas, y NINGUNA pantalla ni cuenta la lee (el botón se desmontó en b26279ae). La
-- grilla arma «Pagado efectivo» con `pagado_efectivo` escrito, y si no hay, con el ADELANTO del espejo de
-- JORNALES. Escribir en `persona_adelanto` dejaría el adelanto invisible en Liquidación, que es exactamente lo
-- contrario de lo pedido. La puerta que se reusa es la de la celda (`guardarCeldaLiquidacion`): quincena abierta
-- releída de la base, la cuenta al lado del número, y la escritura acusada leyendo lo guardado.
--
-- ═══ CAJA: EL BILLETE SALIÓ UNA VEZ ═══
--
-- La entrega ya descargó la caja física (`_EFECTIVO_RAW`, movimiento «Entrega»). El sueldo en efectivo de la
-- quincena CAJA lo resta completo cuando se paga (Jornales: adelanto + recibo, por «Pagado el»), y ese completo
-- incluye este adelanto. Sin compensación, el mismo billete saldría dos veces. Por eso la réplica publica el
-- adelanto como movimiento propio, «Adelanto de sueldo», con signo de ENTRADA para el fondo a rendir: esa parte
-- de la entrega deja de estar en manos de la persona y pasa a ser sueldo, que se descuenta al pagarse la
-- quincena — igual que un adelanto dado desde el cajón de la oficina.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

-- ── 1. LA RENDICIÓN SABE QUE ES UN ADELANTO, DE QUIÉN Y DE QUÉ QUINCENA ─────────────────────────────────────
alter table public.efectivo_rendicion
  add column if not exists adelanto_persona_id uuid references public.personas(id),
  add column if not exists adelanto_fecha      date,
  add column if not exists adelanto_quincena   date,
  add column if not exists adelanto_grupo      text,
  -- Lo que se sumó a la cuenta de la celda, tal cual («20000», «8500*8»). Quitar el adelanto lo saca de ahí.
  add column if not exists adelanto_expresion  text,
  -- La raíz del hilo del canal Efectivo donde se escribió: el mensaje ES el comprobante.
  add column if not exists origen_post_id      text;

alter table public.efectivo_rendicion
  drop constraint if exists efectivo_rendicion_adelanto_entero,
  add constraint efectivo_rendicion_adelanto_entero check (
    (adelanto_persona_id is null) = (adelanto_quincena is null)
    and (adelanto_persona_id is null) = (adelanto_fecha is null)
    and (adelanto_persona_id is null) = (adelanto_grupo is null)
    and (adelanto_persona_id is null) = (adelanto_expresion is null)
    -- La clave dice qué es: una fila de Compras o un adelanto. No hay tercera cosa.
    and (adelanto_persona_id is null) = (compra_clave not like 'adelanto:%')
  ),
  drop constraint if exists efectivo_rendicion_adelanto_grupo,
  add constraint efectivo_rendicion_adelanto_grupo check (adelanto_grupo is null or adelanto_grupo in ('obreros', 'oficina'));

comment on column public.efectivo_rendicion.adelanto_persona_id is
  'Si no es null, esta rendición NO es una fila de Compras: es un adelanto de sueldo pagado con la plata de la entrega a este empleado, registrado en Liquidación («Pagado efectivo» de adelanto_quincena).';

-- La tabla ya tiene `grant select` a authenticated a nivel TABLA (20260922T1500): las columnas nuevas quedan
-- cubiertas. Se repite explícito porque una columna nueva sin permiso es el defecto que más se repitió.
grant select on public.efectivo_rendicion to authenticated;

-- ── 2. LA QUINCENA DE UNA FECHA Y EL ESTADO DE LA CELDA ─────────────────────────────────────────────────────
create or replace function public._quincena_de(p_fecha date)
returns table (desde date, hasta date)
language sql immutable
as $$
  select case when extract(day from p_fecha) <= 15 then date_trunc('month', p_fecha)::date
              else (date_trunc('month', p_fecha) + interval '15 days')::date end,
         case when extract(day from p_fecha) <= 15 then (date_trunc('month', p_fecha) + interval '14 days')::date
              else (date_trunc('month', p_fecha) + interval '1 month' - interval '1 day')::date end
$$;

/*
 * LO QUE HOY MUESTRA LA CELDA «PAGADO EFECTIVO» de una persona en la quincena de esa fecha, y dónde está.
 *
 * El GRUPO es la regla de `armarCuadros` (cobroMensual.ts): jefe de obra o neto mensual vigente → Oficina; si no,
 * Obreros. Si la persona YA tiene línea en exactamente un grupo de esa quincena, manda esa línea.
 *
 * `antes` es la precedencia de `aplicarOverrides`: lo escrito en la celda; si no, el ADELANTO (escrito a mano o el
 * del espejo de JORNALES); si no, 0. Es lo que la pantalla dibuja, así que es a lo que se le suma.
 */
create or replace function public.adelanto_de_sueldo_celda(p_persona uuid, p_fecha date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  q record;
  v_grupo text;
  v_grupos text[];
  v_jefe boolean;
  v_neto numeric;
  cab liquidacion_quincena;
  lin liquidacion_linea;
  v_antes numeric;
  v_origen text;
  v_espejo numeric;
begin
  select * into q from public._quincena_de(p_fecha);
  select array_agg(distinct cq.grupo) into v_grupos
    from liquidacion_linea l join liquidacion_quincena cq on cq.id = l.liquidacion_id
   where l.persona_id = p_persona and cq.desde = q.desde and cq.hasta = q.hasta and cq.grupo in ('obreros', 'oficina');
  if coalesce(array_length(v_grupos, 1), 0) = 1 then
    v_grupo := v_grupos[1];
  else
    select regexp_replace(lower(translate(btrim(coalesce(puesto, '')), 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu')), '[\s_-]+', '_', 'g')
           in ('jefe_de_obra', 'jefe_obra')
      into v_jefe from personas where id = p_persona;
    select neto_mensual into v_neto from persona_tarifa
     where persona_id = p_persona and desde <= q.hasta order by desde desc limit 1;
    v_grupo := case when coalesce(v_jefe, false) or v_neto is not null then 'oficina' else 'obreros' end;
  end if;

  select * into cab from liquidacion_quincena where desde = q.desde and hasta = q.hasta and grupo = v_grupo;
  if cab.id is not null then
    select * into lin from liquidacion_linea where liquidacion_id = cab.id and persona_id = p_persona;
  end if;

  select sum(adelanto) into v_espejo from jornales_bloque_persona
   where persona_id = p_persona and quincena_desde between q.desde and q.hasta and adelanto is not null;

  if lin.pagado_efectivo is not null then v_antes := lin.pagado_efectivo; v_origen := 'escrito';
  elsif lin.adelanto_manual is not null then v_antes := lin.adelanto_manual; v_origen := 'adelanto';
  elsif v_espejo is not null then v_antes := v_espejo; v_origen := 'jornales';
  else v_antes := 0; v_origen := 'vacio';
  end if;

  return jsonb_build_object(
    'desde', q.desde, 'hasta', q.hasta, 'grupo', v_grupo,
    'estado', coalesce(cab.estado, 'abierta'), 'liquidacion_id', cab.id, 'linea_id', lin.id,
    'pagado_efectivo', lin.pagado_efectivo, 'formula', lin.formulas ->> 'pagadoEfectivo',
    'antes', round(v_antes, 2), 'origen', v_origen, 'pagada', lin.pagada_en is not null);
end $$;

revoke all on function public.adelanto_de_sueldo_celda(uuid, date) from public, anon, authenticated;
grant execute on function public.adelanto_de_sueldo_celda(uuid, date) to service_role;

-- ── 3. LA ESCRITURA: RENDICIÓN + PAGO, O NADA ───────────────────────────────────────────────────────────────
/*
 * La llama SÓLO el bot (service_role), después de pasar sus dos puertas: el canal oficial de `rendicion` y la
 * persona del padrón detrás del usuario de Mattermost con ESA entrega abierta. Quien escribe no necesita ser de
 * Liquidación —suele ser el jefe de obra con plata a rendir—; la decisión de que su adelanto quede registrado es
 * del dueño (25/09/2026).
 *
 * `p_formula` y `p_valor` los arma el bot con el MISMO lector de cuentas que la celda de la app
 * (`leerCeldaNumerica`); acá se exige que `p_valor = p_antes + p_importe` y que `p_antes` siga siendo lo que la
 * celda muestra, bajo el candado de la línea. Si alguien la cambió en el medio, no se pisa: se reintenta.
 *
 * Idempotente por `p_clave` (`adelanto:<evento>`): la misma tarea reintentada devuelve lo ya hecho.
 */
create or replace function public.rendir_adelanto_de_sueldo(
  p_entrega uuid, p_persona uuid, p_fecha date, p_importe numeric, p_expresion text,
  p_antes numeric, p_formula text, p_valor numeric,
  p_clave text, p_post text, p_imputada_por uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  e efectivo_entrega;
  v_poder numeric;
  emp personas;
  cel jsonb;
  cab liquidacion_quincena;
  lin liquidacion_linea;
  v_antes numeric;
  v_espejo numeric;
  r efectivo_rendicion;
begin
  if p_clave is null or p_clave not like 'adelanto:%' then
    raise exception 'clave de adelanto inválida' using errcode = 'P0001';
  end if;
  select * into r from efectivo_rendicion where compra_clave = p_clave;
  if r.id is not null then
    return jsonb_build_object('ya_estaba', true, 'rendicion_id', r.id, 'monto', r.monto,
      'desde', r.adelanto_quincena, 'grupo', r.adelanto_grupo,
      'codigo', (select codigo from efectivo_entrega where id = r.entrega_id));
  end if;

  if p_importe is null or p_importe <= 0 then raise exception 'un adelanto de $ 0 no es un adelanto' using errcode = 'P0001'; end if;
  if round(p_valor, 2) <> round(p_antes + p_importe, 2) then
    raise exception 'la cuenta no cierra: % + % no es %', p_antes, p_importe, p_valor using errcode = 'P0001';
  end if;
  if p_formula is null or left(p_formula, 1) <> '=' or length(p_formula) > 500 then
    raise exception 'la cuenta de la celda no es válida' using errcode = 'P0001';
  end if;
  if p_imputada_por is null then raise exception 'falta quién lo escribió' using errcode = 'P0001'; end if;

  -- LA ENTREGA: abierta, de verdad, y con plata suficiente.
  select * into e from efectivo_entrega where id = p_entrega for update;
  if e.id is null then raise exception 'la entrega no existe' using errcode = 'P0001'; end if;
  if e.anulada_en is not null or e.cerrada_en is not null then
    raise exception '% no está abierta', e.codigo using errcode = 'P0001';
  end if;
  if e.es_prueba or public.persona_es_prueba(e.persona_id) then
    raise exception '% es de prueba: no registra adelantos', e.codigo using errcode = 'P0001';
  end if;
  select en_su_poder into v_poder from efectivo_entrega_saldo where id = p_entrega;
  if coalesce(v_poder, 0) < p_importe then
    raise exception 'el adelanto es más de lo que queda a rendir en %', e.codigo using errcode = 'P0001';
  end if;

  -- EL EMPLEADO: del plantel, no de prueba, no Dirección.
  select * into emp from personas where id = p_persona;
  if emp.id is null or not coalesce(emp.en_la_empresa, false) or coalesce(emp.es_prueba, false) then
    raise exception 'esa persona no está en el plantel' using errcode = 'P0001';
  end if;

  -- LA QUINCENA: abierta. La cabecera se crea como la crea la app (`cabecera()` de liquidacionActions.ts).
  cel := public.adelanto_de_sueldo_celda(p_persona, p_fecha);
  insert into liquidacion_quincena (desde, hasta, grupo)
  values ((cel ->> 'desde')::date, (cel ->> 'hasta')::date, cel ->> 'grupo')
  on conflict (desde, hasta, grupo) do nothing;
  select * into cab from liquidacion_quincena
   where desde = (cel ->> 'desde')::date and hasta = (cel ->> 'hasta')::date and grupo = cel ->> 'grupo'
   for update;
  if cab.estado = 'cerrada' then
    raise exception 'la quincena % a % (%) está cerrada: no recibe adelantos', cab.desde, cab.hasta, cab.grupo
      using errcode = 'P0001';
  end if;

  -- LA CELDA, BAJO CANDADO: lo que muestra tiene que seguir siendo `p_antes`.
  insert into liquidacion_linea (liquidacion_id, persona_id) values (cab.id, p_persona)
  on conflict (liquidacion_id, persona_id) do nothing;
  select * into lin from liquidacion_linea where liquidacion_id = cab.id and persona_id = p_persona for update;
  select sum(adelanto) into v_espejo from jornales_bloque_persona
   where persona_id = p_persona and quincena_desde between cab.desde and cab.hasta and adelanto is not null;
  v_antes := round(coalesce(lin.pagado_efectivo, lin.adelanto_manual, v_espejo, 0), 2);
  if v_antes <> round(p_antes, 2) then
    raise exception 'la celda cambió mientras se cargaba (ahora dice %): volvé a intentar', v_antes
      using errcode = '40001';
  end if;

  update liquidacion_linea
     set pagado_efectivo = round(p_valor, 2),
         formulas = coalesce(formulas, '{}'::jsonb) || jsonb_build_object('pagadoEfectivo', p_formula),
         actualizado_en = now()
   where id = lin.id
  returning * into lin;

  insert into efectivo_rendicion (entrega_id, compra_clave, monto, imputada_por,
      adelanto_persona_id, adelanto_fecha, adelanto_quincena, adelanto_grupo, adelanto_expresion, origen_post_id)
  values (p_entrega, p_clave, round(p_importe, 2), p_imputada_por,
      p_persona, p_fecha, cab.desde, cab.grupo, p_expresion, p_post)
  returning * into r;

  select en_su_poder into v_poder from efectivo_entrega_saldo where id = p_entrega;
  return jsonb_build_object('ya_estaba', false, 'rendicion_id', r.id, 'codigo', e.codigo, 'entrega_id', e.id,
    'desde', cab.desde, 'hasta', cab.hasta, 'grupo', cab.grupo,
    'pagado_efectivo', lin.pagado_efectivo, 'formula', lin.formulas ->> 'pagadoEfectivo',
    'pagada', lin.pagada_en is not null, 'en_su_poder', v_poder);
end $$;

revoke all on function public.rendir_adelanto_de_sueldo(uuid, uuid, date, numeric, text, numeric, text, numeric, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.rendir_adelanto_de_sueldo(uuid, uuid, date, numeric, text, numeric, text, numeric, text, text, uuid)
  to service_role;

-- ── 4. QUITAR UN ADELANTO RENDIDO (el error se corrige, no se borra a mano) ─────────────────────────────────
/*
 * La deshace quien liquida sueldos: saca el término que se sumó a la cuenta de la celda (o resta si alguien la
 * reescribió), baja el valor, y suelta la rendición (el saldo de la entrega vuelve a subir). Una quincena
 * cerrada no se toca.
 */
create or replace function public.quitar_adelanto_rendido(p_rendicion uuid, p_motivo text)
returns text
language plpgsql volatile security definer set search_path = public
as $$
declare
  r efectivo_rendicion;
  cab liquidacion_quincena;
  lin liquidacion_linea;
  v_formula text;
  v_nueva text;
  v_valor numeric;
  v_sufijo text;
begin
  if not public.liquida_sueldos() then
    raise exception 'quitar un adelanto es de quien liquida sueldos' using errcode = '42501';
  end if;
  if nullif(btrim(p_motivo), '') is null then raise exception 'quitar pide el motivo' using errcode = 'P0001'; end if;
  select * into r from efectivo_rendicion where id = p_rendicion for update;
  if r.id is null or r.adelanto_persona_id is null then
    raise exception 'esa rendición no es un adelanto de sueldo' using errcode = 'P0001';
  end if;
  select * into cab from liquidacion_quincena
   where desde = r.adelanto_quincena and grupo = r.adelanto_grupo for update;
  if cab.id is null then raise exception 'no encuentro la quincena del adelanto' using errcode = 'P0001'; end if;
  if cab.estado = 'cerrada' then
    raise exception 'la quincena % a % está cerrada: reabrila antes de quitar el adelanto', cab.desde, cab.hasta
      using errcode = 'P0001';
  end if;
  select * into lin from liquidacion_linea where liquidacion_id = cab.id and persona_id = r.adelanto_persona_id for update;
  if lin.id is null or lin.pagado_efectivo is null then
    raise exception 'la celda Pagado efectivo ya no tiene el adelanto: corregila a mano' using errcode = 'P0001';
  end if;
  v_valor := round(lin.pagado_efectivo - r.monto, 2);
  if v_valor < 0 then
    raise exception 'la celda tiene menos que el adelanto: corregila a mano' using errcode = 'P0001';
  end if;
  v_formula := lin.formulas ->> 'pagadoEfectivo';
  v_sufijo := '+' || r.adelanto_expresion;
  if v_formula is not null and right(v_formula, length(v_sufijo)) = v_sufijo then
    v_nueva := left(v_formula, length(v_formula) - length(v_sufijo));
  elsif v_formula = '=' || r.adelanto_expresion then
    v_nueva := null;
  elsif v_formula is not null then
    v_nueva := v_formula || '-' || r.adelanto_expresion;
  else
    v_nueva := null;
  end if;
  update liquidacion_linea
     set pagado_efectivo = case when v_nueva is null and v_valor = 0 then null else v_valor end,
         formulas = case when v_nueva is null then coalesce(formulas, '{}'::jsonb) - 'pagadoEfectivo'
                         else coalesce(formulas, '{}'::jsonb) || jsonb_build_object('pagadoEfectivo', v_nueva) end,
         actualizado_en = now()
   where id = lin.id;
  delete from efectivo_rendicion where id = r.id;
  return 'Adelanto quitado de Liquidación y de la entrega: ' || trim(p_motivo);
end $$;

revoke all on function public.quitar_adelanto_rendido(uuid, text) from public, anon;
grant execute on function public.quitar_adelanto_rendido(uuid, text) to authenticated, service_role;

-- ── 5. ANULAR UNA ENTREGA CON UN ADELANTO RENDIDO: PRIMERO SE QUITA EL ADELANTO ─────────────────────────────
-- Sin esto, anular buscaba la clave `adelanto:…` en el espejo de Compras y cortaba con «la fila de Compras del
-- comprobante adelanto:… todavía no está en el espejo», que es falso y no dice qué hacer. La pregunta va en
-- `anular_entrega_efectivo`, ANTES de soltar las filas, y no en `_efectivo_cancelar_filas_rendidas`: esa la
-- redefine también la migración 20260925T1000 (compras reimputadas), y dos copias de la misma función en dos
-- migraciones se pisan según cuál se aplique última. Ésta es la de 20260923T1400 con una sola pregunta nueva.
create or replace function public.anular_entrega_efectivo(p_entrega uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public
as $function$
declare
  v_usr uuid := public._efectivo_exigir_administracion();
  e efectivo_entrega;
  v_adel text;
begin
  if nullif(trim(p_motivo), '') is null then raise exception 'anular pide el motivo' using errcode = 'P0001'; end if;
  select * into e from efectivo_entrega where id = p_entrega for update;
  if e.id is null then raise exception 'la entrega no existe' using errcode = 'P0001'; end if;
  if e.anulada_en is not null then return; end if;
  select string_agg(coalesce(p.nombre_para_mostrar, p.nombre_completo) || ' $' || r.monto, ', ') into v_adel
    from public.efectivo_rendicion r left join public.personas p on p.id = r.adelanto_persona_id
   where r.entrega_id = p_entrega and r.adelanto_persona_id is not null;
  if v_adel is not null then
    raise exception '% tiene adelantos de sueldo rendidos en Liquidación (%): quitalos primero desde su ficha', e.codigo, v_adel
      using errcode = 'P0001';
  end if;
  perform public._efectivo_cancelar_filas_rendidas(p_entrega, p_motivo, v_usr);
  delete from efectivo_devolucion where entrega_id = p_entrega;
  update efectivo_comprobante
     set descartado_en = now(),
         descartado_motivo = 'la entrega se anuló: ' || trim(p_motivo)
   where entrega_id = p_entrega and descartado_en is null;
  update efectivo_entrega
     set anulada_en = now(), anulada_por = v_usr, anulada_motivo = trim(p_motivo)
   where id = p_entrega;
end $function$;

-- ── 6. LA RÉPLICA DE CAJA: EL ADELANTO VUELVE DEL FONDO A RENDIR Y SE PAGA COMO SUELDO ──────────────────────
-- Las dos ramas de siempre, tal cual (20260922T2200), más la tercera. `security_invoker` explícito: un
-- `create or replace` sin `with` lo pierde.
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
    AND e.anulada_en IS NULL AND NOT COALESCE(p.es_prueba, false) AND NOT e.es_prueba;

revoke all on public.efectivo_movimiento_caja from anon, public;
grant select on public.efectivo_movimiento_caja to authenticated;
