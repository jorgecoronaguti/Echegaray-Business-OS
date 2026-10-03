-- LA CAJA EN EFECTIVO, CABLEADA ENTERA EN POSTGRES (dueño, 02/10/2026)
--
-- Textual, pagando haberes en efectivo: «hacé todo el cableado de caja bien en app, Supabase y Sheet».
--
-- ═══ LOS DOS HUECOS ═══
--
-- 1 · EL RECIBO POR LA DIFERENCIA ERA SÓLO PAPEL. `recibo_pago_efectivo` (20261002T2300) no movía nada: el dueño emitía
--     el RP de la diferencia de la quincena y además tenía que sumar el importe a mano al «Pagado efectivo» de la línea.
--     Con dos pasos, uno se olvida (el pago no baja la caja) o se hace dos veces (baja dos veces).
--     AHORA: el recibo emitido con `linea_id` SUMA su importe a `liquidacion_linea.pagado_efectivo`, y desde ahí el trigger
--     de siempre (20261002T1800) escribe el delta en `liquidacion_pago_efectivo`, que baja a la caja de la app y al Sheet
--     (`_HABERES_PAGADOS_RAW`). No se inventa otra vía: la línea sigue siendo la única puerta del pago.
--     Anular el recibo lo RESTA (delta negativo con la fecha del recibo). Nunca deja `pagado_efectivo` negativo.
--
-- 2 · EL SALDO DE LA APP SÓLO CONOCÍA LO QUE NACE EN POSTGRES. `efectivo_caja_saldo` decía «NO incluye compras en
--     efectivo, cobros, extracciones ni depósitos (hoy sólo los resta el Sheet)». El Sheet define el efectivo como conteo
--     + OCHO renglones «desde el conteo» (`HISTORICO_EFECTIVO_BASE`, orquestador/lib/caja-anexo.mjs). Acá se agregan los
--     que faltaban, con LA MISMA definición y LA MISMA ventana que cada renglón del Sheet, leyendo los espejos que ya
--     existen en la base:
--       · Compras pagadas en efectivo — `compra_sheet` (`formulaComprasEfectivoPosteriores`)
--       · Cobros en efectivo          — `cobranzas`, el espejo de la pestaña (`formulaCobrosEfectivoPosteriores`)
--       · Extracciones y depósitos     — `banco_movimientos`, la fuente de `_BANCO_RAW` (`esExtraccion…`/`esDeposito…`)
--       · Sueldos de oficina          — `liquidacion_pago_efectivo` del grupo oficina (la parte web de
--                                       `formulaOficinaEfectivoPosteriores`), separados de los jornales.
--
-- ═══ LA VENTANA, RENGLÓN POR RENGLÓN — LA DEL SHEET, NO UNA PARECIDA ═══
--
-- Compras, cobranzas y el extracto NO guardan hora (medido en caja-ancla-por-instante.mjs). El Sheet resuelve el día del
-- conteo del lado conservador de cada uno (`CRITERIO_MISMO_DIA`): lo que SALE entra desde el día del conteo INCLUSIVE,
-- lo que ENTRA desde el día SIGUIENTE. Se replica tal cual:
--   compras y depósitos (salen):  día del conteo ≤ fecha ≤ hoy           (`ventanaDelConteo(…, false)`)
--   extracciones (entran):        día del conteo < fecha ≤ hoy           (`ventanaDelConteo(…, true)`)
--   cobros (entran):              día del conteo < fecha                 (SUMIFS «>»&ancla, sin tope en hoy: así está)
-- Liquidación SÍ guarda la hora (`registrado_en`). Hasta hoy la rama «Pago de jornales» contaba sólo `fecha > día del
-- conteo`, y el Sheet ya compara el instante anotado contra el sello (`despuesDelSello`, caja-haberes-web.mjs): un pago
-- del MISMO día anotado DESPUÉS del sello lo restaba el Sheet y no la app. Ahora jornales y oficina usan:
--   fecha ≤ hoy  y  (fecha > día del conteo  ó  (fecha = día del conteo y anotado después del sello))
-- Diferencia que queda, dicha: un pago con fecha ANTERIOR al conteo anotado después del sello (un pago viejo cargado
-- tarde) el Sheet lo resta y la app no — la plata ya no estaba en el cajón cuando se contó.
--
-- ═══ LO QUE NO SE CUENTA DOS VECES ═══
--
--   · Compras «A rendir» no entran (`tipo_pago = 'Efectivo'` exacto, como el Sheet), y TAMPOCO una fila de Compras que
--     una rendición de entrega ya imputó (por clave o por fila), aunque diga «Efectivo»: esa plata salió con la entrega.
--     Medido hoy: 0 filas en ese caso; la guarda queda para que no aparezca nunca.
--   · Compras de la nómina que paga la planilla (rubros «Nómina · Jornales de obra» y «Nómina · Sueldos administración»,
--     `RUBROS_DE_PLANILLA` de rubro-caja.mjs) no entran: los jornales y la oficina ya bajan por Liquidación.
--   · `_EFECTIVO_RAW` NO recibe ninguna de las ramas nuevas: el Sheet las cuenta desde sus propias pestañas. El escritor
--     (`efectivo-raw-pestana.mjs`) pasa a una lista CERRADA de movimientos (Entrega, Devolución, Adelanto de sueldo).
--
-- ═══ POR QUÉ COBROS Y BANCO VAN POR UNA FUNCIÓN ═══
--
-- `cobranzas` y `banco_movimientos` tienen grant POR COLUMNA y `authenticated` no ve `forma_cobro`, `moneda`, `concepto`
-- ni `importe`: una vista invoker que los leyera daría «permission denied» y tumbaría la vista entera. La función
-- `efectivo_caja_movimientos_de_espejos()` es security definer, devuelve SÓLO los movimientos de efectivo y SÓLO a
-- quien liquida sueldos (mismo portero que el conteo), igual que `efectivo_ultimo_conteo()`.
--
-- ═══ LOS 10 RECIBOS YA EMITIDOS (RP-000022 … RP-000031) ═══
--
-- Se vinculan a la línea de su persona en la quincena 16–30/09 y se les aplica el mismo alta del pago, con la fecha del
-- recibo. IDEMPOTENTE Y CONTRA LO QUE EL DUEÑO YA HIZO A MANO: si después de emitir el recibo la línea ya registró
-- deltas que suman EXACTAMENTE su importe (el dueño lo sumó en la celda: medido a las 22:16 UTC en Alaniz), se vincula
-- sin volver a sumar y se anota la constancia en ese delta. Si suman otra cosa, no se toca: se avisa y queda sin
-- vincular (la app lo sigue reconociendo por el concepto).
--
-- NO SE APLICA DESDE UN AGENTE (`.claude/rules/migraciones.md`). Sin begin/commit: los pone aplicar-migracion.mjs.

set local lock_timeout = '5s';

-- ───────────────────────────────────────────────────────────
-- 1 · EL RECIBO SABE DE QUÉ LÍNEA ES
-- ───────────────────────────────────────────────────────────
-- FK sin cascada: un papel firmado no desaparece porque se borre una quincena; borrarla con recibos tiene que fallar.
-- `recibo_pago_efectivo` tiene grant de SELECT por TABLA (20261002T2300), que cubre también las columnas nuevas.
alter table public.recibo_pago_efectivo
  add column if not exists liquidacion_id uuid references public.liquidacion_quincena(id) on delete restrict,
  add column if not exists linea_id uuid references public.liquidacion_linea(id) on delete restrict;
alter table public.recibo_pago_efectivo drop constraint if exists recibo_pago_efectivo_linea_con_su_quincena;
alter table public.recibo_pago_efectivo add constraint recibo_pago_efectivo_linea_con_su_quincena
  check ((linea_id is null) = (liquidacion_id is null));
create index if not exists recibo_pago_efectivo_linea_idx on public.recibo_pago_efectivo (linea_id) where linea_id is not null;
comment on column public.recibo_pago_efectivo.linea_id is
  'La línea de Liquidación de horas cuyo «Pagado efectivo» este recibo sumó al emitirse (y resta al anularse). NULL = recibo a un tercero: sólo papel.';

-- ───────────────────────────────────────────────────────────
-- 2 · LO FIRMADO NO SE REESCRIBE — TAMPOCO A QUÉ LÍNEA SE SUMÓ
-- ───────────────────────────────────────────────────────────
-- La línea se fija al emitir. La única excepción es la vinculación de los recibos emitidos ANTES de esta migración, que
-- la hace esta misma migración marcando su transacción (`echegaray.recibo_se_vincula`); nadie tiene grant de UPDATE.
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
  if (new.liquidacion_id, new.linea_id) is distinct from (old.liquidacion_id, old.linea_id)
     and (old.linea_id is not null or coalesce(current_setting('echegaray.recibo_se_vincula', true), '') <> 'si') then
    raise exception 'el recibo % ya dice de qué línea es: no se cambia', old.codigo using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ───────────────────────────────────────────────────────────
-- 3 · SUMAR (O RESTAR) AL «PAGADO EFECTIVO» DE UNA LÍNEA — la única escritura, por la columna de siempre
-- ───────────────────────────────────────────────────────────
-- El valor de una cuenta simple de la celda («=243000+16000», «=8*6400+51000»): NULL si no es sólo números, + y *.
create or replace function public._liquidacion_valor_de_cuenta(p text) returns numeric
language plpgsql immutable set search_path to 'pg_catalog', 'pg_temp'
as $f$
declare
  v_limpia text := regexp_replace(coalesce(p, ''), '\s', '', 'g');
  v_total  numeric := 0;
  v_prod   numeric;
  v_term   text;
  v_fac    text;
begin
  if v_limpia !~ '^=[0-9]+(\.[0-9]+)?([*+][0-9]+(\.[0-9]+)?)*$' then return null; end if;
  foreach v_term in array string_to_array(substr(v_limpia, 2), '+') loop
    v_prod := 1;
    foreach v_fac in array string_to_array(v_term, '*') loop v_prod := v_prod * v_fac::numeric; end loop;
    v_total := v_total + v_prod;
  end loop;
  return v_total;
end
$f$;
revoke all on function public._liquidacion_valor_de_cuenta(text) from public, anon, authenticated;

-- El delta lo escribe el trigger `liquidacion_linea_pago_efectivo` (contra LO MOSTRADO: escrito, si no adelanto manual, si
-- no el espejo de JORNALES) con la fecha del puente `fecha_pago_efectivo`. Acá se suma contra ESE mismo mostrado, así
-- el delta es exactamente el importe del recibo. La cuenta de la celda se extiende («=243000» → «=243000+16000», como
-- la escribe el dueño) sólo si hoy vale lo mostrado; si no se puede afirmar, se quita y queda el número.
create or replace function public._liquidacion_linea_sumar_efectivo(
  p_linea uuid, p_importe numeric, p_fecha date, p_nota text, p_autor uuid
) returns numeric
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $f$
declare
  l          public.liquidacion_linea;
  v_cab      public.liquidacion_quincena;
  v_espejo   numeric;
  v_mostrado numeric;
  v_nuevo    numeric;
  v_cuenta   text;
  v_txt      text := trim_scale(abs(p_importe))::text;
  v_formulas jsonb;
begin
  if p_importe is null or p_importe = 0 then
    raise exception 'no hay importe para anotar en la liquidación' using errcode = 'P0001';
  end if;
  select * into l from public.liquidacion_linea where id = p_linea for update;
  if l.id is null then raise exception 'esa línea de liquidación no existe' using errcode = 'P0001'; end if;
  select * into v_cab from public.liquidacion_quincena where id = l.liquidacion_id;
  select sum(adelanto) into v_espejo from public.jornales_bloque_persona
   where persona_id = l.persona_id and quincena_desde between v_cab.desde and v_cab.hasta and adelanto is not null;
  v_mostrado := coalesce(l.pagado_efectivo, l.adelanto_manual, v_espejo, 0);
  v_nuevo := round(v_mostrado + p_importe, 2);
  if v_nuevo < 0 then
    raise exception 'el pagado en efectivo de la línea quedaría negativo: hoy dice %, se le restarían %. Corregí primero el Pagado',
      v_mostrado, abs(p_importe) using errcode = 'P0001';
  end if;

  v_cuenta := l.formulas ->> 'pagadoEfectivo';
  v_formulas := coalesce(l.formulas, '{}'::jsonb) - 'pagadoEfectivo';
  if p_importe = round(p_importe) and p_importe > 0 then
    if v_cuenta is not null and public._liquidacion_valor_de_cuenta(v_cuenta) = v_mostrado then
      v_formulas := v_formulas || jsonb_build_object('pagadoEfectivo', v_cuenta || '+' || v_txt);
    elsif v_cuenta is null and v_mostrado > 0 and v_mostrado = round(v_mostrado) then
      v_formulas := v_formulas || jsonb_build_object('pagadoEfectivo', '=' || trim_scale(v_mostrado)::text || '+' || v_txt);
    end if;
  elsif p_importe = round(p_importe)
        and v_cuenta is not null and public._liquidacion_valor_de_cuenta(v_cuenta) = v_mostrado
        and right(v_cuenta, length(v_txt) + 1) = '+' || v_txt then
    v_cuenta := left(v_cuenta, length(v_cuenta) - length(v_txt) - 1);
    -- «=243000» sola no es una cuenta: queda el número.
    if v_cuenta ~ '[*+]' then v_formulas := v_formulas || jsonb_build_object('pagadoEfectivo', v_cuenta); end if;
  end if;

  update public.liquidacion_linea
     set pagado_efectivo = v_nuevo, fecha_pago_efectivo = p_fecha, formulas = v_formulas,
         escribio_en = now(), escribio_id = p_autor
   where id = p_linea;
  -- La constancia en el movimiento de caja: de qué recibo salió (o qué anulación lo devolvió).
  update public.liquidacion_pago_efectivo set nota = p_nota
   where linea_id = p_linea and txid = txid_current() and nota is null;
  return v_nuevo;
end
$f$;
revoke all on function public._liquidacion_linea_sumar_efectivo(uuid, numeric, date, text, uuid) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────
-- 4 · EMITIR: con la línea, el recibo anota el pago
-- ───────────────────────────────────────────────────────────
-- Parámetros nuevos AL FINAL y con default: quien llama sin ellos (el recibo a un tercero) no cambia. Se borra la firma
-- vieja para que PostgREST no tenga dos funciones con el mismo nombre que elegir.
drop function if exists public.emitir_recibo_pago_efectivo(uuid, date, text, text, numeric, text, text, text, uuid, uuid, integer);
create or replace function public.emitir_recibo_pago_efectivo(
  p_id uuid, p_fecha date, p_a_nombre_de text, p_documento text, p_importe numeric, p_concepto text,
  p_obra text default null, p_obra_id text default null, p_proveedor_id uuid default null,
  p_persona_id uuid default null, p_compra_fila integer default null,
  p_liquidacion_id uuid default null, p_linea_id uuid default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid;
  v_nombre text := nullif(btrim(regexp_replace(coalesce(p_a_nombre_de, ''), '\s+', ' ', 'g')), '');
  v_doc text := nullif(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g'), '');
  v_concepto text := nullif(btrim(regexp_replace(coalesce(p_concepto, ''), '\s+', ' ', 'g')), '');
  v_obra text := nullif(btrim(coalesce(p_obra, '')), '');
  v_ya public.recibo_pago_efectivo;
  v_linea public.liquidacion_linea;
  v_numero integer;
  v_codigo text;
begin
  v_usr := public._efectivo_exigir_administracion();
  if p_id is null then raise exception 'falta el id del recibo' using errcode = 'P0001'; end if;
  -- La misma emisión que llega dos veces devuelve la que hay: no toma otro número NI suma el pago otra vez.
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
  if p_linea_id is null and p_liquidacion_id is not null then
    raise exception 'falta la línea: la quincena sola no dice a quién se le suma el pago' using errcode = 'P0001';
  end if;
  if p_linea_id is not null then
    if not public.liquida_sueldos() then
      raise exception 'anotar el pago en Liquidación de horas es de quien liquida sueldos' using errcode = '42501';
    end if;
    select * into v_linea from public.liquidacion_linea where id = p_linea_id;
    if v_linea.id is null then raise exception 'esa línea de liquidación no existe' using errcode = 'P0001'; end if;
    if p_liquidacion_id is not null and p_liquidacion_id <> v_linea.liquidacion_id then
      raise exception 'la línea no es de esa quincena' using errcode = 'P0001';
    end if;
    if p_persona_id is not null and p_persona_id <> v_linea.persona_id then
      raise exception 'el recibo es de otra persona que la línea' using errcode = 'P0001';
    end if;
  end if;

  v_numero := public.tomar_numero_de_recibo('RP',
    'recibo_pago_efectivo:' || p_id || ' · ' || v_nombre || ' · $' || p_importe);
  v_codigo := public.codigo_de_recibo('RP', v_numero);
  insert into public.recibo_pago_efectivo (id, fecha, a_nombre_de, documento, importe, concepto, obra, obra_id,
                                           proveedor_id, persona_id, compra_fila, emitido_por,
                                           serie_numero, codigo, liquidacion_id, linea_id)
  values (p_id, p_fecha, v_nombre, v_doc, p_importe, v_concepto, v_obra, nullif(btrim(coalesce(p_obra_id, '')), ''),
          p_proveedor_id, coalesce(p_persona_id, v_linea.persona_id), p_compra_fila, v_usr,
          v_numero, v_codigo, v_linea.liquidacion_id, v_linea.id);
  if v_linea.id is not null then
    perform public._liquidacion_linea_sumar_efectivo(v_linea.id, p_importe, p_fecha, 'recibo ' || v_codigo, v_usr);
  end if;
  return v_codigo;
end $$;
revoke all on function public.emitir_recibo_pago_efectivo(uuid, date, text, text, numeric, text, text, text, uuid, uuid, integer, uuid, uuid) from public, anon;
grant execute on function public.emitir_recibo_pago_efectivo(uuid, date, text, text, numeric, text, text, text, uuid, uuid, integer, uuid, uuid) to authenticated;

-- ───────────────────────────────────────────────────────────
-- 5 · ANULAR: el pago que el recibo sumó se resta, con la fecha del recibo
-- ───────────────────────────────────────────────────────────
-- Con la fecha del RECIBO y no la de hoy: anular un pago anterior al conteo no puede mover el saldo posterior. Si la
-- línea ya tiene menos que el recibo (alguien corrigió el Pagado), la anulación entera se rechaza: no queda a medias.
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
  if r.linea_id is not null and not public.liquida_sueldos() then
    raise exception 'el recibo % sumó un pago en Liquidación de horas: lo anula quien liquida sueldos', r.codigo using errcode = '42501';
  end if;
  update public.recibo_pago_efectivo set anulado_en = now(), anulado_motivo = v_motivo, anulado_por = v_usr
   where id = p_id;
  perform public.anular_numero_de_recibo('RP', r.serie_numero, 'recibo anulado: ' || v_motivo);
  if r.linea_id is not null then
    perform public._liquidacion_linea_sumar_efectivo(r.linea_id, -r.importe, r.fecha, 'anulación del recibo ' || r.codigo, v_usr);
  end if;
  return now();
end $$;
revoke all on function public.anular_recibo_pago_efectivo(uuid, text) from public, anon;
grant execute on function public.anular_recibo_pago_efectivo(uuid, text) to authenticated;

-- ───────────────────────────────────────────────────────────
-- 6 · LOS 10 RECIBOS DE HOY (una sola vez; idempotente; respeta lo sumado a mano)
-- ───────────────────────────────────────────────────────────
do $b$
declare
  r       record;
  v_n     int;
  v_linea uuid;
  v_liq   uuid;
  v_post  numeric;
begin
  perform set_config('echegaray.recibo_se_vincula', 'si', true);
  for r in
    select * from public.recibo_pago_efectivo
     where codigo in ('RP-000022', 'RP-000023', 'RP-000024', 'RP-000025', 'RP-000026',
                      'RP-000027', 'RP-000028', 'RP-000029', 'RP-000030', 'RP-000031')
       and anulado_en is null and linea_id is null and persona_id is not null
       and concepto like 'Diferencia de pago en efectivo de la 2ª quincena de septiembre de 2026%'
     order by serie_numero
  loop
    select count(*), min(l.id::text)::uuid, min(l.liquidacion_id::text)::uuid into v_n, v_linea, v_liq
      from public.liquidacion_linea l
      join public.liquidacion_quincena q on q.id = l.liquidacion_id
     where q.desde = date '2026-09-16' and l.persona_id = r.persona_id;
    if v_n <> 1 then
      raise notice '% · % líneas de la persona en la quincena 16/09: queda sin vincular', r.codigo, v_n;
      continue;
    end if;
    -- Lo que la línea registró DESPUÉS de emitirse el recibo: si es exactamente su importe, el dueño ya lo sumó a mano.
    select coalesce(sum(x.importe), 0) into v_post from public.liquidacion_pago_efectivo x
     where x.linea_id = v_linea and x.registrado_en > r.emitido_en;
    if v_post = 0 then
      update public.recibo_pago_efectivo set liquidacion_id = v_liq, linea_id = v_linea where id = r.id;
      perform public._liquidacion_linea_sumar_efectivo(v_linea, r.importe, r.fecha, 'recibo ' || r.codigo, r.emitido_por);
    elsif v_post = r.importe then
      update public.recibo_pago_efectivo set liquidacion_id = v_liq, linea_id = v_linea where id = r.id;
      update public.liquidacion_pago_efectivo
         set nota = 'recibo ' || r.codigo || ' (el importe ya se había sumado a mano en la celda)'
       where linea_id = v_linea and registrado_en > r.emitido_en and nota is null;
    else
      raise notice '% · la línea registró % después del recibo (no %): no se suma ni se vincula, revisar a mano',
        r.codigo, v_post, r.importe;
    end if;
  end loop;
end
$b$;

-- ───────────────────────────────────────────────────────────
-- 7 · COBROS, EXTRACCIONES Y DEPÓSITOS: los espejos con grant por columna, por una puerta con portero
-- ───────────────────────────────────────────────────────────
create or replace function public.efectivo_caja_movimientos_de_espejos()
returns table (fecha date, codigo text, persona text, destino text, movimiento text, importe numeric, registrado_en timestamptz)
language sql stable security definer set search_path to 'public', 'pg_temp'
as $f$
  -- Cobranzas: forma «Efectivo», estado «Cobrado», en pesos (el dólar no es el cajón de pesos), por el TOTAL.
  select c.fecha_cobro, coalesce(nullif(btrim(c.numero_comprobante), ''), nullif(btrim(c.factura), ''), 'Cobranzas'),
         coalesce(nullif(btrim(c.obra_cliente), ''), '—'), coalesce(nullif(btrim(c.obra_celda), ''), c.unidad, 'Cobranzas'),
         'Cobro en efectivo'::text, c.total_bruto, null::timestamptz
    from public.cobranzas c
   where (select public.liquida_sueldos())
     and c.estado = 'Cobrado' and c.forma_cobro = 'Efectivo' and coalesce(c.moneda, '') <> 'USD'
     and c.fecha_cobro is not null and coalesce(c.total_bruto, 0) <> 0
  union all
  -- Extracción: débito («sale») cuyo concepto dice «extracción» o «retiro de efectivo». ENTRA al cajón.
  select b.fecha, 'Banco ' || b.cuenta, 'Banco', b.concepto, 'Extracción'::text, abs(b.importe), null::timestamptz
    from public.banco_movimientos b
   where (select public.liquida_sueldos()) and b.importe < 0
     and (translate(lower(b.concepto), 'ó', 'o') like '%extraccion%' or lower(b.concepto) like '%retiro de efectivo%')
  union all
  -- Depósito: crédito («entra») que dice «depósito» Y «efectivo» o «efvo» (los e-cheq no dicen ninguna). SALE del cajón.
  select b.fecha, 'Banco ' || b.cuenta, 'Banco', b.concepto, 'Depósito'::text, -b.importe, null::timestamptz
    from public.banco_movimientos b
   where (select public.liquida_sueldos()) and b.importe > 0
     and translate(lower(b.concepto), 'ó', 'o') like '%deposito%'
     and (lower(b.concepto) like '%efectivo%' or lower(b.concepto) like '%efvo%')
$f$;
revoke all on function public.efectivo_caja_movimientos_de_espejos() from public, anon, service_role;
grant execute on function public.efectivo_caja_movimientos_de_espejos() to authenticated;

-- ───────────────────────────────────────────────────────────
-- 8 · LOS MOVIMIENTOS DE CAJA: las ramas de siempre + las que faltaban
-- ───────────────────────────────────────────────────────────
-- `security_invoker` explícito: un `create or replace` sin `with` lo pierde. Mismas columnas, mismo orden y tipo.
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
 -- Liquidación, obreros: sólo `caja` (lo pagado desde una entrega ya bajó con la entrega).
 SELECT x.fecha,
    'Q ' || to_char(x.quincena_desde, 'DD/MM') AS codigo,
    emp.nombre_completo AS persona,
    'Jornales ' || x.grupo AS destino,
    'Pago de jornales'::text AS movimiento,
    - x.importe AS importe,
    x.registrado_en
   FROM liquidacion_pago_efectivo x
     JOIN personas emp ON emp.id = x.persona_id
  WHERE x.origen = 'caja' AND x.grupo <> 'oficina' AND NOT COALESCE(emp.es_prueba, false)
UNION ALL
 -- Liquidación, oficina: el renglón «sueldos de OFICINA en efectivo» del Sheet (su parte web).
 SELECT x.fecha,
    'Q ' || to_char(x.quincena_desde, 'DD/MM') AS codigo,
    emp.nombre_completo AS persona,
    'Sueldos oficina'::text AS destino,
    'Sueldo de oficina'::text AS movimiento,
    - x.importe AS importe,
    x.registrado_en
   FROM liquidacion_pago_efectivo x
     JOIN personas emp ON emp.id = x.persona_id
  WHERE x.origen = 'caja' AND x.grupo = 'oficina' AND NOT COALESCE(emp.es_prueba, false)
UNION ALL
 -- Compras: el MONTO PAGADO (parcial o total). «Pagado» por fecha de caja, «Pendiente» con parcial por fecha de carga.
 SELECT CASE WHEN c.estado = 'Pagado' THEN c.fecha_caja ELSE c.fecha END AS fecha,
    'Compras f' || c.fila AS codigo,
    COALESCE(NULLIF(btrim(c.proveedor), ''), '—') AS persona,
    COALESCE(NULLIF(btrim(c.obra_texto), ''), NULLIF(btrim(c.unidad_negocio), ''), 'Estructura') AS destino,
    'Compra en efectivo'::text AS movimiento,
    - c.monto_pagado AS importe,
    NULL::timestamptz AS registrado_en
   FROM compra_sheet c
  WHERE c.tipo_pago = 'Efectivo' AND c.estado IN ('Pagado', 'Pendiente') AND COALESCE(c.monto_pagado, 0) <> 0
    AND public.rubro_caja(c.proveedor, c.unidad_negocio, c.obra_texto, c.concepto)
        NOT IN ('Nómina · Jornales de obra', 'Nómina · Sueldos administración')
    AND NOT EXISTS (
      SELECT 1 FROM efectivo_rendicion r JOIN efectivo_entrega e ON e.id = r.entrega_id
       WHERE e.anulada_en IS NULL AND (r.compra_clave = c.clave OR r.compra_clave = 'f:' || c.fila OR r.fila = c.fila))
UNION ALL
 SELECT m.fecha, m.codigo, m.persona, m.destino, m.movimiento, m.importe, m.registrado_en
   FROM public.efectivo_caja_movimientos_de_espejos() m;

revoke all on public.efectivo_movimiento_caja from anon, public;
grant select on public.efectivo_movimiento_caja to authenticated;

-- ───────────────────────────────────────────────────────────
-- 9 · EL SALDO: conteo sellado + los ocho renglones del Sheet, cada uno con su ventana
-- ───────────────────────────────────────────────────────────
-- «Adelanto de sueldo» sigue sin entrar: era el contrapeso del Sheet por restar el sueldo ENTERO; acá cada pago resta por
-- su delta y lo pagado desde una entrega ya bajó con la entrega. Columnas nuevas AL FINAL: `create or replace view` no
-- deja insertar en el medio. Sólo lo ve quien liquida sueldos: sin las ramas que su sesión no lee, el número mentiría.
create or replace view public.efectivo_caja_saldo with (security_invoker = true) as
 with s as (
   select c.valor, c.sellado_en,
          (c.sellado_en at time zone 'America/Argentina/San_Juan')::date as dia,
          (now() at time zone 'America/Argentina/San_Juan')::date as hoy
     from public.efectivo_ultimo_conteo() c
 ),
 m as (
   select
     coalesce(sum(v.importe) filter (where v.movimiento in ('Entrega', 'Devolución') and v.registrado_en > s.sellado_en), 0)
       as a_rendir,
     coalesce(sum(v.importe) filter (where v.movimiento = 'Pago de jornales' and v.fecha <= s.hoy
       and (v.fecha > s.dia or (v.fecha = s.dia and v.registrado_en > s.sellado_en))), 0) as jornales,
     coalesce(sum(v.importe) filter (where v.movimiento = 'Sueldo de oficina' and v.fecha <= s.hoy
       and (v.fecha > s.dia or (v.fecha = s.dia and v.registrado_en > s.sellado_en))), 0) as oficina,
     coalesce(sum(v.importe) filter (where v.movimiento = 'Compra en efectivo' and v.fecha >= s.dia and v.fecha <= s.hoy), 0)
       as compras,
     coalesce(sum(v.importe) filter (where v.movimiento = 'Cobro en efectivo' and v.fecha > s.dia), 0) as cobros,
     coalesce(sum(v.importe) filter (where v.movimiento = 'Extracción' and v.fecha > s.dia and v.fecha <= s.hoy), 0)
       as extracciones,
     coalesce(sum(v.importe) filter (where v.movimiento = 'Depósito' and v.fecha >= s.dia and v.fecha <= s.hoy), 0)
       as depositos
   from s left join public.efectivo_movimiento_caja v on true
 )
 select s.valor as conteo_sellado,
        s.sellado_en,
        m.a_rendir as entregas_y_devoluciones,
        m.jornales as pagos_de_jornales,
        s.valor + m.a_rendir + m.jornales + m.oficina + m.compras + m.cobros + m.extracciones + m.depositos as saldo,
        ('Conteo sellado + desde el sello: entregas y devoluciones a rendir (por instante); jornales y sueldos de oficina '
         || 'pagados en efectivo en Liquidación (por fecha; los del día del conteo, si se anotaron después del sello); '
         || 'compras pagadas en efectivo (Compras: monto pagado, sin «A rendir», sin lo rendido de una entrega ni la '
         || 'nómina de la planilla; desde el día del conteo); cobros en efectivo en pesos (Cobranzas «Cobrado», desde el '
         || 'día siguiente); extracciones (desde el día siguiente) y depósitos de efectivo (desde el día del conteo) del '
         || 'extracto. NO incluye: los pagos de la planilla de Jornales y Oficina anteriores a la quincena del 16/09 (no '
         || 'están en la base), los pagos cargados tarde sobre filas anteriores al conteo, ni lo que los espejos de '
         || 'Compras, Cobranzas y el extracto todavía no trajeron.')::text as alcance,
        m.compras as compras_en_efectivo,
        m.cobros as cobros_en_efectivo,
        m.extracciones,
        m.depositos,
        m.oficina as sueldos_de_oficina
   from s cross join m
  where public.liquida_sueldos();

revoke all on public.efectivo_caja_saldo from anon, public;
grant select on public.efectivo_caja_saldo to authenticated;
comment on view public.efectivo_caja_saldo is
  'Saldo de efectivo en pesos según Postgres: el último conteo sellado más los ocho renglones del Sheet (CAJA, «desde el conteo») con la misma definición y ventana. Ver la columna alcance.';

notify pgrst, 'reload schema';
