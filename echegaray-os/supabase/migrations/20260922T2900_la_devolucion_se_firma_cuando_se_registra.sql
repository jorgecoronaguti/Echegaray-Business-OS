-- D06 — LA DEVOLUCIÓN SE FIRMA EN EL MOMENTO EN QUE SE REGISTRA, NO DESPUÉS.
--
-- ═══ QUÉ ESTABA ROTO (22/09/2026) ═══
--
-- El diseño dice, textual: «Se genera el comprobante de devolución con las dos firmas y se archiva en la
-- carpeta de Salón comercial». Lo construido registraba la devolución y no pedía NINGUNA firma: el vuelto
-- volvía a la caja sin que quedara constancia de quién lo entregó ni de quién lo recibió. Es plata
-- moviéndose entre dos manos sin papel.
--
-- La 2800 dejó las columnas de las dos firmas y `firmar_devolucion_efectivo`. Lo que falta, y es lo que
-- hace acá, es que la firma de QUIEN RECIBE se tome en el mismo acto de registrar: quien aprieta
-- «Registrar y cerrar» es quien está recibiendo el efectivo, y pedirle la firma en un segundo paso es
-- pedirle que vuelva — nadie vuelve, y el comprobante queda sin firmar para siempre.
--
-- La otra firma —la de quien devuelve— es del teléfono de esa persona, como la conformidad de D02.
--
-- ═══ POR QUÉ UNA SOBRECARGA Y NO UN CAMBIO DE FIRMA ═══
--
-- `registrar_devolucion_efectivo(uuid, numeric, uuid, boolean, text, date)` ya está publicada y la llama
-- la app. Cambiarle el tipo de retorno obliga a `drop function`, y entre el drop y el create la app que
-- está abierta pega contra una función que no existe. Se agrega una de 7 argumentos que devuelve el id de
-- la devolución además del resto, y la vieja pasa a delegar en ella: una sola cuenta, dos puertas.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

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

  insert into efectivo_devolucion (entrega_id, monto, fecha, recibida_por, registrada_por, nota,
                                   firma_recibe, firma_recibe_en)
  values (p_entrega, round(p_monto, 2), coalesce(p_fecha, (now() at time zone 'America/Argentina/San_Juan')::date),
          p_recibida_por, v_usr, nullif(trim(p_nota), ''),
          nullif(trim(p_firma_recibe), ''),
          case when nullif(trim(p_firma_recibe), '') is null then null else now() end)
  returning id into v_dev;

  v_poder := v_poder - round(p_monto, 2);
  -- El cierre no fuerza el cero: si devuelve menos, sigue abierta con el resto.
  if coalesce(p_cerrar, true) and v_poder = 0 then
    update efectivo_entrega set cerrada_en = now() where id = p_entrega;
  end if;
  return jsonb_build_object('devolucion', v_dev, 'resto', v_poder, 'cerrada', coalesce(p_cerrar, true) and v_poder = 0);
end $$;

-- LA VIEJA DELEGA: una sola cuenta, dos puertas. Sin firma, exactamente como se comportaba.
create or replace function public.registrar_devolucion_efectivo(
  p_entrega uuid, p_monto numeric, p_recibida_por uuid default null, p_cerrar boolean default true,
  p_nota text default null, p_fecha date default null
) returns numeric
language plpgsql security definer set search_path = public as $$
begin
  return (public.registrar_devolucion_efectivo(p_entrega, p_monto, p_recibida_por, p_cerrar, p_nota, p_fecha, null)
          ->> 'resto')::numeric;
end $$;

revoke all on function public.registrar_devolucion_efectivo(uuid, numeric, uuid, boolean, text, date, text)
  from public, anon;
grant execute on function public.registrar_devolucion_efectivo(uuid, numeric, uuid, boolean, text, date, text)
  to authenticated;

-- ── LO QUE LE FALTA AL COMPROBANTE, DICHO POR LA BASE ────────────────────────────────────────────
--
-- Que la pantalla sepa sumar dos booleanos no es el punto: el punto es que «le falta la firma de quien
-- devolvió» sea UNA definición y no tres frases distintas en tres pantallas.
create or replace view public.efectivo_devolucion_estado with (security_invoker = true) as
  select d.id, d.entrega_id, e.codigo as entrega, d.monto, d.fecha, d.recibida_por,
         p.nombre_completo as recibe, d.registrada_en, d.nota,
         (d.firma_entrega is not null) as firmo_entrega,
         (d.firma_recibe  is not null) as firmo_recibe,
         d.papel_url, d.papel_en,
         case when d.firma_entrega is not null and d.firma_recibe is not null then 'completo'
              when d.firma_recibe is not null then 'falta_quien_devolvio'
              when d.firma_entrega is not null then 'falta_quien_recibio'
              else 'sin_firmas' end as comprobante
    from public.efectivo_devolucion d
    join public.efectivo_entrega e on e.id = d.entrega_id
    left join public.personas p on p.id = d.recibida_por;
revoke all on public.efectivo_devolucion_estado from anon, public;
grant select on public.efectivo_devolucion_estado to authenticated;

notify pgrst, 'reload schema';
