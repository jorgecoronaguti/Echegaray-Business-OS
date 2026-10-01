-- 20261001T1000 · EL PAGO EN EFECTIVO A CUENTA (SIN ENTREGA) EXIGE NIVEL (auditoría de cierre del bot Efectivo, 01/10/2026).
--
-- Dueño, 01/10/2026, literal: «solo los usuarios con nivel jefe de obra y admin, rinden gastos y admin tiene abm
-- de efectivo». `rendir_gasto_sin_foto_del_chat` (T0100) y `rendir_adelanto_de_sueldo` (T0400) ya lo exigen;
-- `pago_efectivo_de_sueldo` (20260930T2200) no miraba el rol: un `campo` que escribía «le pagué 30000 a Fulano de
-- la caja» dejaba un pago en Liquidación (probado por el auditor con puerto doble, sin tocar nada real).
--
-- QUÉ CAMBIA: un solo chequeo, antes de leer nada — quien escribe (`p_registrado_por`, explícito: el bot no tiene
-- sesión) es `jefe_obra`, `direccion` o `administracion`; si no, 42501.
-- El resto del cuerpo es COPIA de la definición vigente leída de producción el 01/10/2026
-- (`pg_get_functiondef`), sin tocar: misma firma, mismo SECURITY DEFINER y search_path, mismos grants
-- (EXECUTE sólo `service_role`; `create or replace` conserva los privilegios).
--
-- EL BOT ANDA ANTES Y DESPUÉS: desde esta misma entrega el bot ya rechaza a un `campo` antes de llamar a la
-- función; si igual llega el 42501, lo dice como «la base no te deja».
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

set local lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.pago_efectivo_de_sueldo(p_persona uuid, p_fecha date, p_importe numeric, p_expresion text, p_antes numeric, p_formula text, p_valor numeric, p_clave text, p_post text, p_registrado_por uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  pf record;
  emp personas;
  cel jsonb;
  cab liquidacion_quincena;
  lin liquidacion_linea;
  v_antes numeric;
  v_espejo numeric;
  r pago_efectivo_sueldo;
begin
  if p_clave is null or p_clave not like 'pago-efectivo:%' then
    raise exception 'clave de pago inválida' using errcode = 'P0001';
  end if;
  -- 01/10/2026 · NIVEL DE QUIEN LO ESCRIBE (dueño, literal: «solo los usuarios con nivel jefe de obra y admin,
  -- rinden gastos y admin tiene abm de efectivo»). El usuario viaja explícito (el bot escribe sin sesión).
  if p_registrado_por is null then raise exception 'falta quién lo escribió' using errcode = 'P0001'; end if;
  select id, rol into pf from perfiles where id = p_registrado_por;
  if pf.id is null then raise exception 'no encuentro el usuario que lo escribe' using errcode = '42501'; end if;
  if not coalesce(pf.rol in ('jefe_obra', 'direccion', 'administracion'), false) then
    raise exception 'un pago en efectivo a cuenta lo carga un jefe de obra o Administración' using errcode = '42501';
  end if;
  select * into r from pago_efectivo_sueldo where clave = p_clave;
  if r.id is not null then
    return jsonb_build_object('ya_estaba', true, 'id', r.id, 'monto', r.importe,
      'desde', r.quincena_desde, 'grupo', r.grupo);
  end if;

  if p_importe is null or p_importe <= 0 then raise exception 'un pago de $ 0 no es un pago' using errcode = 'P0001'; end if;
  if round(p_valor, 2) <> round(p_antes + p_importe, 2) then
    raise exception 'la cuenta no cierra: % + % no es %', p_antes, p_importe, p_valor using errcode = 'P0001';
  end if;
  if p_formula is null or left(p_formula, 1) <> '=' or length(p_formula) > 500 then
    raise exception 'la cuenta de la celda no es válida' using errcode = 'P0001';
  end if;
  if p_registrado_por is null then raise exception 'falta quién lo escribió' using errcode = 'P0001'; end if;

  select * into emp from personas where id = p_persona;
  if emp.id is null or not coalesce(emp.en_la_empresa, false) or coalesce(emp.es_prueba, false) then
    raise exception 'esa persona no está en el plantel' using errcode = 'P0001';
  end if;

  cel := public.adelanto_de_sueldo_celda(p_persona, p_fecha);
  insert into liquidacion_quincena (desde, hasta, grupo)
  values ((cel ->> 'desde')::date, (cel ->> 'hasta')::date, cel ->> 'grupo')
  on conflict (desde, hasta, grupo) do nothing;
  select * into cab from liquidacion_quincena
   where desde = (cel ->> 'desde')::date and hasta = (cel ->> 'hasta')::date and grupo = cel ->> 'grupo'
   for update;
  if cab.estado = 'cerrada' then
    raise exception 'la quincena % a % (%) está cerrada: no recibe pagos', cab.desde, cab.hasta, cab.grupo
      using errcode = 'P0001';
  end if;

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

  insert into pago_efectivo_sueldo (clave, persona_id, fecha, importe, expresion, quincena_desde, grupo, origen_post_id, registrado_por)
  values (p_clave, p_persona, p_fecha, round(p_importe, 2), p_expresion, cab.desde, cab.grupo, p_post, p_registrado_por)
  returning * into r;

  return jsonb_build_object('ya_estaba', false, 'id', r.id,
    'desde', cab.desde, 'hasta', cab.hasta, 'grupo', cab.grupo,
    'pagado_efectivo', lin.pagado_efectivo, 'formula', lin.formulas ->> 'pagadoEfectivo',
    'pagada', lin.pagada_en is not null);
end $function$;
