-- MARCAR UN PASO ES UN SOLO HECHO: O QUEDA FIRMADO Y MARCADO, O NO PASÓ NADA (25/08/2026).
--
-- ═══ EL ESTADO QUE ESTA MIGRACIÓN VUELVE IMPOSIBLE ═══
--
-- La auditoría del móvil con datos encontró en la base `obra_actividad_paso …000021 (Armadura)` con
-- `hecho_en = 2026-08-25T12:06:12Z` y CERO filas en `obra_ejecucion` para esa actividad. O sea: el
-- avance de la columna se había movido al 33,3 % y no existía el registro de quién lo movió. Pasó
-- porque el escritor marcaba el paso y después insertaba la firma, la firma la rechazaba el CHECK
-- `obra_ejecucion_dice_algo` (iba sin `cantidad` ni `avance_pct`), y entre las dos escrituras no
-- había transacción: PostgREST manda una por request.
--
-- El código ya no puede producir ese estado —`src/features/jefe/services/pasos.ts` firma primero y
-- marca después, así que el peor caso quedó del lado inofensivo (una firma sin paso marcado NO
-- mueve el porcentaje)—. Pero «el peor caso es inofensivo» no es lo mismo que «no puede partirse».
-- Esta función lo cierra de verdad: las tres escrituras adentro de una transacción.
--
-- ═══ SECURITY INVOKER, Y ES LO IMPORTANTE DE ESTE ARCHIVO ═══
--
-- La función NO es `security definer`. Con definer, cualquiera que pueda ejecutarla escribiría
-- `obra_ejecucion` con los permisos del dueño de la función, y eso saltearía la policy
-- `obra_ejecucion_insert` (hoy: dirección, administración, jefe de obra). Si el empleado de campo
-- va a poder firmar producción, ésa es una decisión del dueño sobre la policy — no un efecto
-- colateral de una función de conveniencia. Con `invoker`, la RLS de las dos tablas sigue mandando
-- exactamente igual que hoy, y a un usuario de campo la función le va a fallar con 42501 SIN haber
-- marcado nada, que es el comportamiento correcto.
--
-- ═══ EL PORCENTAJE ES EL MISMO DE `actividad_avance` ═══
--
-- `round(peso / peso_total * 100, 1)`: la misma cuenta de la vista y de `avancePorPasos`. La firma
-- NO es la fuente del avance —para el método 'pasos' el avance lo calcula la vista desde `hecho_en`
-- y no sumando `obra_ejecucion.avance_pct`—; es el rastro de cuánto aportaba el paso que se marcó.
-- Por eso tres pasos iguales firman 33,3 tres veces (99,9) y la actividad igual queda en 100.
--
-- ═══ NO CAMBIA NADA POR SÍ SOLA ═══
--
-- Ningún camino de escritura la llama todavía. Aplicarla agrega la capacidad; cambiar el escritor
-- para que la use es una línea en `guardarPasos` y va DESPUÉS de que la función exista en la base y
-- alguien lea el efecto de una corrida real. Una función nueva llamada por código que nadie corrió
-- contra ella es exactamente la trampa de «la migración está en el repo, entonces está aplicada».
--
-- ═══ CÓMO SE PROBÓ SIN APLICARLA (25/08/2026) ═══
--
-- Adentro de UNA transacción terminada en `rollback`, contra las filas del fixture `[PRUEBA E2E]`
-- (actividad `…000013`, tres pasos de peso 1):
--
--   · marcar Encofrado          → (marcados 1, desmarcados 0); 1 fila en obra_ejecucion con
--                                 avance_pct 33,3 · metodo 'pasos' · paso_id …022;
--                                 `actividad_avance` 33,3 % → 66,7 %.
--   · volver a mandar sólo …021 → (0, 1): Encofrado se desmarca y la actividad vuelve a 33,3 %.
--   · obra ajena                → «Esa tarea es de otra obra.»
--   · actividad medida por cantidad → «Esa tarea no se mide por pasos.»
--   · actividad inexistente     → «Esa tarea no existe o no es de una obra tuya.»
--   · lista vacía               → desmarca todo (el arreglo es el estado completo, no un delta).
--
-- Después del rollback: 0 funciones `registrar_pasos` en la base y los pasos del fixture como
-- estaban. Lo que NO se probó así es la RLS: la sonda corre como dueño de la base, así que el 42501
-- del rol campo hay que verlo con una sesión `authenticated` después de aplicar.

create or replace function public.registrar_pasos(
  p_obra       text,
  p_actividad  uuid,
  p_fecha      date,
  p_marcados   uuid[],
  p_comentario text default null,
  p_fuente     text default 'jefe_telefono'
)
returns table (marcados integer, desmarcados integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_metodo text;
  v_obra   text;
  v_peso   numeric;
  v_marcados integer := 0;
  v_desmarcados integer := 0;
begin
  select a.obra_id, a.metodo_avance into v_obra, v_metodo
    from public.obra_actividad a where a.id = p_actividad;
  if v_obra is null then
    raise exception 'Esa tarea no existe o no es de una obra tuya.' using errcode = 'no_data_found';
  end if;
  if v_obra is distinct from p_obra then
    raise exception 'Esa tarea es de otra obra.' using errcode = 'check_violation';
  end if;
  if v_metodo is distinct from 'pasos' then
    raise exception 'Esa tarea no se mide por pasos.' using errcode = 'check_violation';
  end if;

  -- EL CANDADO ANTES DE LA CUENTA. Dos teléfonos marcando pasos de la misma columna leerían el
  -- mismo `hecho_en` nulo y firmarían dos veces el mismo paso.
  perform 1 from public.obra_actividad_paso p where p.actividad_id = p_actividad for update;

  select sum(p.peso) into v_peso from public.obra_actividad_paso p where p.actividad_id = p_actividad;
  if coalesce(v_peso, 0) <= 0 then
    -- Sin peso total no hay aporte que firmar, y 0 no es la respuesta: 0 diría «este paso no aporta
    -- nada», que es distinto de «nadie declaró cuánto pesa». Hoy sólo se llega acá con la actividad
    -- SIN pasos: `obra_actividad_paso_peso_check` ya exige `peso > 0` por fila. La guarda queda
    -- igual, porque el día que ese CHECK se afloje esto es lo único que impide una división por cero
    -- disfrazada de firma.
    raise exception 'Los pasos de esta tarea no declaran cuánto pesa cada uno: cargá los pesos en la planificación.'
      using errcode = 'check_violation';
  end if;

  insert into public.obra_ejecucion
    (obra_id, actividad_id, fecha, avance_pct, metodo, paso_id, comentario, fuente)
  select p_obra, p_actividad, p_fecha, round(p.peso / v_peso * 100, 1), 'pasos', p.id,
         nullif(btrim(coalesce(p_comentario, '')), ''), p_fuente
    from public.obra_actividad_paso p
   where p.actividad_id = p_actividad
     and p.id = any(coalesce(p_marcados, '{}'::uuid[]))
     and p.hecho_en is null;

  update public.obra_actividad_paso p set hecho_en = now()
   where p.actividad_id = p_actividad
     and p.id = any(coalesce(p_marcados, '{}'::uuid[]))
     and p.hecho_en is null;
  get diagnostics v_marcados = row_count;

  update public.obra_actividad_paso p set hecho_en = null
   where p.actividad_id = p_actividad
     and not (p.id = any(coalesce(p_marcados, '{}'::uuid[])))
     and p.hecho_en is not null;
  get diagnostics v_desmarcados = row_count;

  return query select v_marcados, v_desmarcados;
end;
$$;

comment on function public.registrar_pasos(text, uuid, date, uuid[], text, text) is
  'Marca y desmarca los pasos de una actividad y deja su firma en obra_ejecucion, todo en una transacción. SECURITY INVOKER a propósito: la policy obra_ejecucion_insert sigue decidiendo quién puede firmar producción.';

-- El grant es a `authenticated` y no a `anon`: el que no inició sesión no marca pasos. Que un rol
-- pueda EJECUTARLA no quiere decir que pueda escribir: adentro mandan las policies de las dos
-- tablas, porque la función es invoker.
revoke all on function public.registrar_pasos(text, uuid, date, uuid[], text, text) from public;
grant execute on function public.registrar_pasos(text, uuid, date, uuid[], text, text) to authenticated;
grant execute on function public.registrar_pasos(text, uuid, date, uuid[], text, text) to service_role;
