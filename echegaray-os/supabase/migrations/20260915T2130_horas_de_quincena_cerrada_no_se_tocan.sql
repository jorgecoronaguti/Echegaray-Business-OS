-- 20260915T2130 · LAS HORAS DE UNA QUINCENA CERRADA NO SE TOCAN, TAMPOCO DESDE POSTGREST
--
-- La app ya lo frena (`quincenaCerrada.ts`), pero la acción no es la cerradura: el auditor midió el
-- 15/09/2026, en una tx con ROLLBACK, que un jefe de obra (543b2008…, rol jefe_obra) hacía UPDATE y
-- DELETE de `registros_hh` del 17/08, dentro de 16–31/08 cerrada. Y la guarda de la app no ve el cierre
-- para él: `liquidacion_quincena` sólo la lee quien liquida sueldos, así que su lectura vuelve vacía.
--
-- ═══ POR QUÉ EN ESTE TRIGGER Y NO EN RLS ═══
--
-- `registros_hh_periodo_cerrado` ya es la cerradura de «período cerrado» (SECURITY DEFINER, BEFORE
-- INSERT/UPDATE/DELETE), pero mira `periodo_hh`, que está vacía: nunca frenó nada. Se le agrega la
-- quincena de `liquidacion_quincena`. Al ser SECURITY DEFINER lee el cierre sin depender de quién
-- escribe. Una policy nueva tendría el mismo agujero que la guarda de la app.
--
-- ═══ auth.uid() NULL SIGUE PASANDO, A PROPÓSITO ═══
--
-- Hoy la función sale temprano sin sesión (service role, scripts como `jornales-a-registros-hh`, el
-- importador horario) y eso NO cambia. Trabarlos cambiaría el comportamiento de procesos que no son
-- parte de este arreglo y que corren sin que nadie mire el error. El costo es explícito: un script con
-- service role PUEDE reescribir una quincena cerrada; esa puerta se decide aparte.
--
-- ═══ LA REGLA ES LA DE LA APP ═══
--
-- Cerrada = alguna fila de `liquidacion_quincena` con estado 'cerrada' cuyo rango contiene la fecha, de
-- cualquier grupo (basta uno: esa quincena ya se pagó). Se mira la fecha NUEVA y la VIEJA: mover una hora
-- desde o hacia una quincena cerrada también la toca. Sólo `fecha`: `fecha_inicio_semana` es el lunes de
-- la semana, no el día trabajado, y podría caer en la quincena vecina. El mensaje es el mismo de la app.

CREATE OR REPLACE FUNCTION public.registros_hh_periodo_cerrado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_nueva    date;
  v_vieja    date;
  v_cerrado  date;
  v_desde    date;
  v_hasta    date;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if tg_op <> 'DELETE' then
    v_nueva := date_trunc('month', coalesce(new.fecha, new.fecha_inicio_semana))::date;
  end if;
  if tg_op <> 'INSERT' then
    v_vieja := date_trunc('month', coalesce(old.fecha, old.fecha_inicio_semana))::date;
  end if;

  select p.periodo into v_cerrado
    from public.periodo_hh p
   where p.estado = 'cerrado'
     and p.periodo in (coalesce(v_nueva, v_vieja), coalesce(v_vieja, v_nueva))
   limit 1;

  if v_cerrado is not null then
    raise exception 'El período % está cerrado: no se pueden cargar, modificar ni borrar horas de ese mes. Reabrilo si hay que corregirlo.',
      to_char(v_cerrado, 'MM/YYYY') using errcode = '23514';
  end if;

  select q.desde, q.hasta into v_desde, v_hasta
    from public.liquidacion_quincena q
   where q.estado = 'cerrada'
     and (
       (tg_op <> 'DELETE' and new.fecha between q.desde and q.hasta)
       or (tg_op <> 'INSERT' and old.fecha between q.desde and q.hasta)
     )
   order by q.desde
   limit 1;

  if v_desde is not null then
    raise exception 'La quincena %–% está cerrada: para cambiar horas hay que reabrirla en Liquidación.',
      to_char(v_desde, 'DD/MM'), to_char(v_hasta, 'DD/MM') using errcode = '23514';
  end if;

  return coalesce(new, old);
end;
$function$;
