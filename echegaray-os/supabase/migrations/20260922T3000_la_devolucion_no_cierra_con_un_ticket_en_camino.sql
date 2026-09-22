-- LA DEVOLUCIÓN NO CIERRA UNA ENTREGA QUE TODAVÍA TIENE UN TICKET EN CAMINO.
--
-- ═══ EL AGUJERO, MEDIDO HOY EN LA BASE (22/09/2026) ═══
--
-- `cerrar_entrega_efectivo` (20260922T1700) ya exigía que no quedara ningún ticket leyéndose, observado,
-- respondido o en error: cerrar con uno en camino deja ese gasto sin entrega a la que rendir. La OTRA
-- puerta de cierre —`registrar_devolucion_efectivo`, que es la que usa D06— no tenía ese control.
--
-- Se probó en vivo: ER-0005 tenía $ 120.000 en la mano y UN ticket observado de $ 30.000. La devolución
-- del total la cerró igual. Si ese ticket se hubiera cargado después a Compras, la entrega cerrada habría
-- quedado con «en su poder» negativo: la persona debiendo plata en una entrega que el sistema da por
-- terminada. Las dos puertas ahora dicen lo mismo, desde la MISMA condición.
--
-- La devolución se registra igual —el vuelto vuelve a la caja, eso no se discute—; lo que no pasa es el
-- cierre.
--
-- ═══ ESTA VERSIÓN PARTE DE LA DEL TELÉFONO, NO DE LA 2900 ═══
--
-- `20260922T3000_el_telefono_confirma_lo_leido_y_firma_la_devolucion.sql` (mismo día, y alfabéticamente
-- ANTES que este archivo, que es el orden en que se reconstruye la cadena) separó el hecho en dos: la
-- persona DECLARA desde el teléfono y firma; Administración CONFIRMA al contar la plata, y sólo lo
-- confirmado baja el saldo y entra a la caja. Una primera versión de este archivo redefinió
-- `registrar_devolucion_efectivo` partiendo de la 2900 y borró esa mitad: las devoluciones nuevas nacían
-- sin `confirmada_en` y no descontaban nada — se vio en ER-0005, que devolvió $ 120.000 y siguió con
-- $ 120.000 en su poder. Acá se copia la del teléfono ENTERA y se le agrega el único cambio propio.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

create or replace function public.efectivo_tickets_en_camino(p_entrega uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.efectivo_comprobante_estado
   where entrega_id = p_entrega and estado in ('leyendo', 'observado', 'respondido', 'error', 'a_confirmar')
$$;
revoke all on function public.efectivo_tickets_en_camino(uuid) from public, anon;
grant execute on function public.efectivo_tickets_en_camino(uuid) to authenticated;

create or replace function public.registrar_devolucion_efectivo(
  p_entrega uuid, p_monto numeric, p_recibida_por uuid, p_cerrar boolean,
  p_nota text, p_fecha date, p_firma_recibe text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_usr uuid := public._efectivo_exigir_administracion(); e efectivo_entrega;
        v_poder numeric; v_dev uuid; v_camino integer; v_cierra boolean;
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

  -- LA DECLARACIÓN DEL TELÉFONO SE CONFIRMA, NO SE DUPLICA: la persona declaró ese mismo monto y
  -- Administración está contando esa misma plata. Dos filas harían que la entrega devolviera el doble.
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
  v_camino := public.efectivo_tickets_en_camino(p_entrega);
  -- EL ÚNICO CAMBIO PROPIO DE ESTE ARCHIVO: el cierre no fuerza el cero (si devuelve menos, sigue abierta
  -- con el resto) Y NO CIERRA CON UN TICKET EN CAMINO — la misma condición de `cerrar_entrega_efectivo`.
  v_cierra := coalesce(p_cerrar, true) and v_poder = 0 and v_camino = 0;
  if v_cierra then
    update efectivo_entrega set cerrada_en = now() where id = p_entrega;
  end if;
  return jsonb_build_object(
    'devolucion', v_dev, 'resto', v_poder, 'cerrada', v_cierra,
    -- Por qué NO se cerró, para que la pantalla lo pueda decir sin volver a preguntar.
    'tickets_en_camino', v_camino);
end $$;
revoke all on function public.registrar_devolucion_efectivo(uuid, numeric, uuid, boolean, text, date, text)
  from public, anon;
grant execute on function public.registrar_devolucion_efectivo(uuid, numeric, uuid, boolean, text, date, text)
  to authenticated;

notify pgrst, 'reload schema';
