-- EL TELÉFONO CONFIRMA LO QUE SE LEYÓ DE SU TICKET, Y FIRMA LA DEVOLUCIÓN (22/09/2026).
--
-- Diseño: docs/diseno/efectivo-a-rendir/efectivo-a-rendir.dc.html, pantallas M05 y M08.
--
-- ═══ M05 · «LO QUE LEYÓ, A CONFIRMAR» ═══
--
-- Hasta hoy la persona sacaba la foto y el circuito decidía solo: lo que el modelo de visión leyó de SU
-- ticket —comercio, total, fecha— entraba a Compras sin que ella lo viera nunca. Ese total es lo que le
-- baja el saldo: una lectura ×10 la deja debiendo plata que gastó. El diseño pone la confirmación antes
-- de escribir, y para eso hacen falta dos cosas que no existían:
--
--   · UN LUGAR DONDE CONSTE que la persona miró y dijo que está bien (`confirmado_en`), y
--   · UN ESTADO `a_confirmar` en la vista, para que la pantalla sepa a quién preguntarle qué.
--
-- El freno real lo pone el worker (`orquestador/comunicacion/comprobantes/cola-web.mjs`): un lote de
-- rendición sin confirmar se LEE pero no se escribe, y la fila de la cola queda `en_espera` con lo leído
-- guardado en `resultado.leidos`. Confirmar la devuelve a `pendiente` y la segunda pasada la carga.
-- «Sacar la foto de nuevo» la descarta: no queda un ticket fantasma esperando a nadie.
--
-- ═══ M08 · DEVOLVER EL VUELTO, CON LA FIRMA ═══
--
-- `registrar_devolucion_efectivo` exige Administración y así tiene que seguir: la plata vuelve a la caja
-- cuando QUIEN LA RECIBE la cuenta, no cuando quien la devuelve lo declara. Pero eso dejaba a la persona
-- sin forma de decir «te llevo $ 172.300», que es lo que pide M08.
--
-- Se separa el hecho en dos, que es lo que son: la persona DECLARA y firma; Administración CONFIRMA al
-- recibirla. La declarada NO baja el saldo ni entra a la caja —si bajara, declarar sería una forma de
-- hacer desaparecer plata sin moverla—; queda a la vista de los dos hasta que se confirma.
--
-- Y para que no quede colgada de una pantalla que todavía no existe: `registrar_devolucion_efectivo`, la
-- que Administración ya usa, CONFIRMA la declaración que coincide en entrega y monto en vez de insertar
-- una segunda fila. El circuito cierra sin tocar el escritorio.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

-- ── M05 · LA CONFIRMACIÓN DE LA LECTURA ─────────────────────────────────────────────────────────
alter table public.efectivo_comprobante add column if not exists confirmado_en  timestamptz;
alter table public.efectivo_comprobante add column if not exists confirmado_por uuid;
alter table public.efectivo_comprobante add column if not exists rehecho_en     timestamptz;

comment on column public.efectivo_comprobante.confirmado_en is
  'Cuándo la persona miró lo que se leyó de su ticket y dijo que está bien. Hasta entonces el worker no '
  'escribe la fila de Compras (M05).';
comment on column public.efectivo_comprobante.rehecho_en is
  'Cuándo la persona dijo «sacar la foto de nuevo»: el ticket queda descartado y vuelve a la cámara.';

-- Los tickets que YA existen nacieron sin esta puerta: darlos por no confirmados los dejaría esperando
-- una confirmación que nadie va a pedir. Se dan por confirmados en su envío.
update public.efectivo_comprobante set confirmado_en = enviado_en where confirmado_en is null;

/**
 * CONFIRMAR: la persona de la entrega (o Administración por ella) dice que lo leído está bien.
 *
 * Devolver la fila de la cola a `pendiente` es lo que destraba la escritura: el worker la vuelve a tomar
 * y esta vez `cargarSolo` corre. Sólo se toca si está `en_espera`; una que quedó `rechazado` o `error`
 * no se revive por confirmarla, y una ya `cargado` no se vuelve a cargar.
 */
create or replace function public.confirmar_lectura_rendicion(p_comprobante uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c efectivo_comprobante; e efectivo_entrega;
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  select * into c from efectivo_comprobante where id = p_comprobante for update;
  if c.id is null then raise exception 'ese ticket no existe' using errcode = 'P0001'; end if;
  select * into e from efectivo_entrega where id = c.entrega_id;
  if e.persona_id is distinct from public.mi_persona_id() and not public.es_administracion() then
    raise exception 'lo que se leyó lo confirma quien mandó el ticket' using errcode = '42501';
  end if;
  if c.descartado_en is not null then raise exception 'ese ticket está descartado' using errcode = 'P0001'; end if;
  if c.confirmado_en is not null then return; end if;   -- idempotente: dos toques no son dos tickets
  update efectivo_comprobante set confirmado_en = now(), confirmado_por = auth.uid() where id = p_comprobante;
  update comprobante_entrada
     set estado = 'pendiente', motivo = null, tomado_at = null, cerrado_at = null
   where id = c.entrada_id and estado = 'en_espera';
end $$;

/**
 * SACAR LA FOTO DE NUEVO: el ticket se descarta y la cola lo cierra. La foto ya subida no se borra del
 * bucket (nada se borra); deja de ser una rendición viva. Si ya escribió en Compras NO se puede: ahí el
 * gasto existe y sacarlo es trabajo de Administración, no de un botón del teléfono.
 */
create or replace function public.rehacer_foto_rendicion(p_comprobante uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c efectivo_comprobante; e efectivo_entrega; v_rendida int;
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  select * into c from efectivo_comprobante where id = p_comprobante for update;
  if c.id is null then raise exception 'ese ticket no existe' using errcode = 'P0001'; end if;
  select * into e from efectivo_entrega where id = c.entrega_id;
  if e.persona_id is distinct from public.mi_persona_id() and not public.es_administracion() then
    raise exception 'la foto la vuelve a sacar quien mandó el ticket' using errcode = '42501';
  end if;
  select count(*) into v_rendida from efectivo_rendicion where comprobante_id = p_comprobante;
  if v_rendida > 0 then
    raise exception 'ese ticket ya entró a Compras: pedile a Administración que lo corrija' using errcode = 'P0001';
  end if;
  if c.descartado_en is not null then return; end if;
  update efectivo_comprobante
     set descartado_en = now(), descartado_motivo = 'la persona la sacó de nuevo', rehecho_en = now()
   where id = p_comprobante;
  update comprobante_entrada
     set estado = 'rechazado', motivo = 'la persona sacó la foto de nuevo', cerrado_at = now()
   where id = c.entrada_id and estado in ('pendiente', 'en_espera', 'error');
end $$;

revoke all on function public.confirmar_lectura_rendicion(uuid) from public, anon;
revoke all on function public.rehacer_foto_rendicion(uuid) from public, anon;
grant execute on function public.confirmar_lectura_rendicion(uuid), public.rehacer_foto_rendicion(uuid) to authenticated;

-- ── LA VISTA DE TICKETS, CON EL ESTADO `a_confirmar` ────────────────────────────────────────────
--
-- Se copia TAL CUAL de la 20260922T2300 y se le agregan `confirmado_en` y un ramo al `case`. El orden de
-- los ramos importa: `a_confirmar` va DESPUÉS de `en_compras` y de `observado` (lo que ya entró no se
-- confirma, y un dato que falta se pide antes que una confirmación que no se puede dar) y ANTES de
-- traducir `en_espera` a «observado», que es donde el worker deja el ticket que espera esta confirmación.
--
-- `leidos` es lo que el worker guardó de la lectura SIN escribir. Que exista es la señal de que hay algo
-- que confirmar: sin lectura no se le pregunta nada a nadie, el ticket sigue «leyendo».
drop view if exists public.efectivo_comprobante_estado;
create view public.efectivo_comprobante_estado with (security_invoker = true) as
  select c.id, c.entrega_id, e.codigo as entrega, e.persona_id, c.canal, c.enviado_en,
         ce.storage_path, ce.nombre_archivo, ce.media_type, ce.estado as estado_cola, ce.motivo,
         ce.resultado, r.compra_clave, r.monto as monto_rendido,
         c.observacion, c.observado_en, c.respuesta, c.respondido_en, c.descartado_en, c.descartado_motivo,
         c.confirmado_en,
         case
           when c.descartado_en is not null then 'descartado'
           when r.id is not null then 'en_compras'
           when c.observacion is not null and c.respondido_en is null then 'observado'
           when ce.estado in ('pendiente', 'procesando') then 'leyendo'
           when ce.estado = 'ya_estaba' then 'duplicado'
           when c.confirmado_en is null and ce.estado = 'en_espera'
                and jsonb_array_length(coalesce(ce.resultado->'leidos', '[]'::jsonb)) > 0 then 'a_confirmar'
           when c.respondido_en is not null and ce.estado in ('en_espera', 'rechazado') then 'respondido'
           when ce.estado in ('en_espera', 'rechazado') then 'observado'
           when ce.estado = 'error' then 'error'
           when ce.estado = 'cargado' then 'leyendo'   -- escrito, falta el vínculo (lo pone el worker)
           else 'leyendo'
         end as estado
    from public.efectivo_comprobante c
    join public.efectivo_entrega e on e.id = c.entrega_id
    left join public.comprobante_entrada ce on ce.id = c.entrada_id
    left join lateral (
      select r.* from public.efectivo_rendicion r
       where r.entrega_id = c.entrega_id
         and (r.compra_clave = any (select x->>'clave' from jsonb_array_elements(coalesce(ce.resultado->'comprobantes', '[]'::jsonb)) x)
              or r.comprobante_id = c.id)
       limit 1) r on true
   where not public.persona_es_prueba(e.persona_id);
revoke all on public.efectivo_comprobante_estado from anon, public;
grant select on public.efectivo_comprobante_estado to authenticated;

-- ── M08 · DECLARAR Y FIRMAR LA DEVOLUCIÓN, DESDE EL TELÉFONO ───────────────────────────────────
--
-- La 2800 y la 2900 ya dejaron el modelo de LAS DOS FIRMAS: `firma_entrega` es de quien devuelve y
-- `firma_recibe` de quien recibe, y `firmar_devolucion_efectivo` deja que cada uno firme lo suyo. Eso no
-- se duplica: lo único que falta es que la persona pueda EMPEZAR el acto —decir cuánto devuelve y
-- firmarlo— sin esperar a que Administración cargue una fila primero.
--
-- Lo que la declaración NO puede hacer es bajar el saldo: la plata todavía está en la mano de la persona.
-- Por eso una devolución vale para la caja recién con `confirmada_en`, que pone quien la recibe y cuenta.
alter table public.efectivo_devolucion add column if not exists declarada_en   timestamptz;
alter table public.efectivo_devolucion add column if not exists declarada_por  uuid;
alter table public.efectivo_devolucion add column if not exists confirmada_en  timestamptz;
alter table public.efectivo_devolucion add column if not exists confirmada_por uuid;

comment on column public.efectivo_devolucion.declarada_en is
  'Cuándo la persona dijo desde el teléfono cuánto devuelve y lo firmó (M08). La plata sigue en su mano.';
comment on column public.efectivo_devolucion.confirmada_en is
  'Cuándo quien recibe contó la plata. SÓLO desde acá la devolución baja el saldo y entra a la caja.';

-- Lo ya registrado lo registró Administración al recibirlo: nació confirmado. Sin este relleno, las dos
-- vistas de abajo darían por no devuelto todo lo que ya volvió.
update public.efectivo_devolucion set confirmada_en = registrada_en, confirmada_por = registrada_por
 where confirmada_en is null;

/**
 * DECLARAR: la persona dice cuánto devuelve, a quién, y firma. NO baja el saldo.
 *
 * El tope es lo que tiene en la mano MENOS lo que ya declaró y nadie recibió todavía: sin eso, tocar el
 * botón dos veces declara dos devoluciones del total y la entrega figura devolviendo el doble.
 */
create or replace function public.declarar_devolucion_efectivo(
  p_entrega uuid, p_monto numeric, p_trazo text, p_recibida_por uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare e efectivo_entrega; v_poder numeric; v_declarado numeric; v_id uuid;
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  select * into e from efectivo_entrega where id = p_entrega for update;
  if e.id is null then raise exception 'la entrega no existe' using errcode = 'P0001'; end if;
  if e.persona_id is distinct from public.mi_persona_id() then
    raise exception 'la devolución la declara y firma quien recibió el efectivo' using errcode = '42501';
  end if;
  if e.anulada_en is not null then raise exception '% está anulada', e.codigo using errcode = 'P0001'; end if;
  if e.cerrada_en is not null then raise exception '% ya está cerrada', e.codigo using errcode = 'P0001'; end if;
  if nullif(trim(p_trazo), '') is null then raise exception 'firmá arriba de la línea' using errcode = 'P0001'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'el monto tiene que ser mayor que cero' using errcode = 'P0001'; end if;
  select en_su_poder into v_poder from efectivo_entrega_saldo where id = p_entrega;
  if v_poder is null then raise exception 'no puedo leer el saldo de %', e.codigo using errcode = 'P0001'; end if;
  select coalesce(sum(monto), 0) into v_declarado from efectivo_devolucion
   where entrega_id = p_entrega and confirmada_en is null;
  if round(p_monto, 2) > v_poder - v_declarado then
    raise exception '% tiene % para devolver (ya declaraste % sin recibir)', e.codigo, v_poder - v_declarado, v_declarado
      using errcode = 'P0001';
  end if;
  insert into efectivo_devolucion (entrega_id, monto, recibida_por, registrada_por, nota,
                                   declarada_en, declarada_por, firma_entrega, firma_entrega_en)
  values (p_entrega, round(p_monto, 2), p_recibida_por, auth.uid(), null,
          now(), auth.uid(), trim(p_trazo), now())
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.declarar_devolucion_efectivo(uuid, numeric, text, uuid) from public, anon;
grant execute on function public.declarar_devolucion_efectivo(uuid, numeric, text, uuid) to authenticated;

/**
 * REGISTRAR (Administración), ahora con la declaración de la persona en el medio.
 *
 * Es la MISMA función de la 2900 —mismos argumentos, mismo retorno, mismas validaciones— con dos cambios:
 *
 *   · Lo que inserta nace CONFIRMADO: quien registra es quien contó la plata.
 *   · Si hay una declarada de esta entrega por el MISMO monto, se CONFIRMA ésa en vez de insertar otra
 *     fila. La persona declaró $ 172.300 y Administración contó esos mismos $ 172.300: dos filas harían
 *     que la entrega devolviera el doble. Así el circuito cierra sin que el escritorio cambie una línea.
 *
 * La firma de quien devuelve NO se pisa: si ya firmó al declarar, queda la suya.
 */
create or replace function public.registrar_devolucion_efectivo(
  p_entrega uuid, p_monto numeric, p_recibida_por uuid, p_cerrar boolean,
  p_nota text, p_fecha date, p_firma_recibe text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._efectivo_exigir_administracion(); e efectivo_entrega;
        v_poder numeric; v_dev uuid;
begin
  select * into e from efectivo_entrega where id = p_entrega for update;
  if e.id is null then raise exception 'la entrega no existe' using errcode = 'P0001'; end if;
  if e.anulada_en is not null then raise exception '% está anulada', e.codigo using errcode = 'P0001'; end if;
  if e.cerrada_en is not null then raise exception '% ya está cerrada', e.codigo using errcode = 'P0001'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'el monto tiene que ser mayor que cero' using errcode = 'P0001'; end if;
  select en_su_poder into v_poder from efectivo_entrega_saldo where id = p_entrega;
  if round(p_monto, 2) > v_poder then
    raise exception '% tiene % en su poder: no puede devolver %', e.codigo, v_poder, p_monto using errcode = 'P0001';
  end if;

  select id into v_dev from efectivo_devolucion
   where entrega_id = p_entrega and confirmada_en is null and monto = round(p_monto, 2)
   order by declarada_en asc nulls last limit 1;

  if v_dev is not null then
    update efectivo_devolucion
       set confirmada_en = now(), confirmada_por = v_usr,
           recibida_por  = coalesce(p_recibida_por, recibida_por),
           nota          = coalesce(nullif(trim(p_nota), ''), nota),
           fecha         = coalesce(p_fecha, fecha),
           firma_recibe  = coalesce(nullif(trim(p_firma_recibe), ''), firma_recibe),
           firma_recibe_en = case when nullif(trim(p_firma_recibe), '') is null then firma_recibe_en else now() end
     where id = v_dev;
  else
    insert into efectivo_devolucion (entrega_id, monto, fecha, recibida_por, registrada_por, nota,
                                     firma_recibe, firma_recibe_en, confirmada_en, confirmada_por)
    values (p_entrega, round(p_monto, 2), coalesce(p_fecha, (now() at time zone 'America/Argentina/San_Juan')::date),
            p_recibida_por, v_usr, nullif(trim(p_nota), ''),
            nullif(trim(p_firma_recibe), ''),
            case when nullif(trim(p_firma_recibe), '') is null then null else now() end,
            now(), v_usr)
    returning id into v_dev;
  end if;

  v_poder := v_poder - round(p_monto, 2);
  -- El cierre no fuerza el cero: si devuelve menos, sigue abierta con el resto.
  if coalesce(p_cerrar, true) and v_poder = 0 then
    update efectivo_entrega set cerrada_en = now() where id = p_entrega;
  end if;
  return jsonb_build_object('devolucion', v_dev, 'resto', v_poder, 'cerrada', coalesce(p_cerrar, true) and v_poder = 0);
end $$;

-- ── SÓLO LO CONFIRMADO BAJA EL SALDO Y ENTRA A LA CAJA ──────────────────────────────────────────
--
-- Las dos vistas se copian TAL CUAL de la 2200 y la 1900 y sólo se les agrega `confirmada_en is not null`
-- del lado de las devoluciones. Una declarada que bajara el saldo sería una forma de hacer desaparecer
-- plata sin moverla de lugar: la persona la declara, deja de deberla y se la queda.
create or replace view public.efectivo_entrega_saldo with (security_invoker = true) as
  select e.id, e.codigo, e.persona_id,
         coalesce(p.nombre_completo, 'sin nombre') as persona,
         e.obra_id, o.nombre as obra,
         e.estructura, e.fecha, e.monto as entregado,
         coalesce(r.rendido, 0)  as rendido,  coalesce(r.filas, 0) as filas_rendidas,
         coalesce(d.devuelto, 0) as devuelto,
         e.monto - coalesce(r.rendido, 0) - coalesce(d.devuelto, 0) as en_su_poder,
         (e.conformidad_en is not null or e.conformidad_papel_url is not null) as conformidad,
         case when e.anulada_en is not null then 'anulada'
              when e.cerrada_en is not null then 'cerrada'
              else 'abierta' end as estado,
         e.para_que, e.conformidad_en, e.cerrada_en, e.anulada_en, e.anulada_motivo
    from public.efectivo_entrega e
    left join public.personas p on p.id = e.persona_id
    left join public.obra_canonica o on o.id = e.obra_id
    left join lateral (select sum(monto) rendido, count(*) filas from public.efectivo_rendicion where entrega_id = e.id) r on true
    left join lateral (select sum(monto) devuelto from public.efectivo_devolucion
                        where entrega_id = e.id and confirmada_en is not null) d on true
   where not public.persona_es_prueba(e.persona_id);
grant select on public.efectivo_entrega_saldo to authenticated;

create or replace view public.efectivo_movimiento_caja with (security_invoker = true) as
  select e.fecha, e.codigo, p.nombre_completo as persona,
         coalesce(o.nombre, 'Estructura') as destino, 'Entrega'::text as movimiento,
         -e.monto as importe, e.creada_en as registrado_en
    from public.efectivo_entrega e
    join public.personas p on p.id = e.persona_id
    left join public.obra_canonica o on o.id = e.obra_id
   where e.anulada_en is null and not coalesce(p.es_prueba, false)
  union all
  select d.fecha, e.codigo, p.nombre_completo, coalesce(o.nombre, 'Estructura'), 'Devolución', d.monto, d.registrada_en
    from public.efectivo_devolucion d
    join public.efectivo_entrega e on e.id = d.entrega_id
    join public.personas p on p.id = e.persona_id
    left join public.obra_canonica o on o.id = e.obra_id
   where e.anulada_en is null and not coalesce(p.es_prueba, false) and d.confirmada_en is not null;

-- ── LA VISTA DE DEVOLUCIONES, CON LO QUE FALTABA PARA M08 ──────────────────────────────────────
-- La de la 2900 TAL CUAL, con tres columnas agregadas AL FINAL (agregar se puede; cambiar o quitar, no).
-- Sin `declarada_en` y `confirmada_en`, M08 no puede decir «ya declaraste $ 172.300 y todavía no te los
-- recibieron», y la persona vuelve a declarar lo mismo mañana.
create or replace view public.efectivo_devolucion_estado with (security_invoker = true) as
  select d.id, d.entrega_id, e.codigo as entrega, d.monto, d.fecha, d.recibida_por,
         p.nombre_completo as recibe, d.registrada_en, d.nota,
         (d.firma_entrega is not null) as firmo_entrega,
         (d.firma_recibe  is not null) as firmo_recibe,
         d.papel_url, d.papel_en,
         case when d.firma_entrega is not null and d.firma_recibe is not null then 'completo'
              when d.firma_recibe is not null then 'falta_quien_devolvio'
              when d.firma_entrega is not null then 'falta_quien_recibio'
              else 'sin_firmas' end as comprobante,
         d.declarada_en, d.confirmada_en,
         case when d.confirmada_en is not null then 'recibida' else 'declarada' end as estado
    from public.efectivo_devolucion d
    join public.efectivo_entrega e on e.id = d.entrega_id
    left join public.personas p on p.id = d.recibida_por;
revoke all on public.efectivo_devolucion_estado from anon, public;
grant select on public.efectivo_devolucion_estado to authenticated;

notify pgrst, 'reload schema';
