-- 20261001T0400 · EL ADELANTO RENDIDO DE UNA ENTREGA EXIGE NIVEL (auditoría del bot Efectivo, 01/10/2026).
--
-- Dueño, 01/10/2026, literal: «solo los usuarios con nivel jefe de obra y admin, rinden gastos y admin tiene abm
-- de efectivo». `rendir_gasto_sin_foto_del_chat` (20261001T0100) ya lo exige; `rendir_adelanto_de_sueldo`
-- (20260925T1100) no miraba ni el rol ni si la entrega era de quien escribía: cualquier perfil —un `campo`
-- incluido— que llegara a la función rendía contra cualquier entrega.
--
-- QUÉ CAMBIA: sólo dos chequeos, con el mismo criterio que la puerta del gasto sin foto:
--   · quien escribe (`p_imputada_por`, explícito: el bot no tiene sesión) es `jefe_obra`, `direccion` o
--     `administracion` — si no, 42501 ANTES de leer nada;
--   · un `jefe_obra` sólo rinde de SU entrega (`perfiles.persona_id = efectivo_entrega.persona_id`).
-- El resto del cuerpo es COPIA de la definición vigente leída de producción el 01/10/2026
-- (`pg_get_functiondef`), sin tocar: misma firma, mismo SECURITY DEFINER y search_path, mismos grants
-- (EXECUTE sólo `service_role`; `create or replace` conserva los privilegios).
--
-- EL BOT ANDA ANTES Y DESPUÉS: desde esta misma entrega el bot ya rechaza a un `campo` y a un jefe que nombra la
-- entrega de otro antes de llamar a la función; si igual llega el 42501, lo dice como «la base no te deja».
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

set local lock_timeout = '5s';

create or replace function public.rendir_adelanto_de_sueldo(p_entrega uuid, p_persona uuid, p_fecha date, p_importe numeric, p_expresion text, p_antes numeric, p_formula text, p_valor numeric, p_clave text, p_post text, p_imputada_por uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  pf record;
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
  -- 01/10/2026 · NIVEL DE QUIEN LO ESCRIBE (dueño, literal: «solo los usuarios con nivel jefe de obra y admin,
  -- rinden gastos y admin tiene abm de efectivo»). El usuario viaja explícito (el bot escribe sin sesión).
  if p_imputada_por is null then raise exception 'falta quién lo escribió' using errcode = 'P0001'; end if;
  select id, rol, persona_id into pf from perfiles where id = p_imputada_por;
  if pf.id is null then raise exception 'no encuentro el usuario que lo escribe' using errcode = '42501'; end if;
  if not coalesce(pf.rol in ('jefe_obra', 'direccion', 'administracion'), false) then
    raise exception 'sólo rinde el jefe de obra que tiene la entrega, o Administración' using errcode = '42501';
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
  -- El jefe de obra, sólo de SU entrega; Dirección y Administración, de la de cualquiera.
  if not (coalesce(pf.rol in ('direccion', 'administracion'), false)
          or (coalesce(pf.rol = 'jefe_obra', false) and coalesce(pf.persona_id = e.persona_id, false))) then
    raise exception 'sólo rinde el jefe de obra que tiene la entrega, o Administración' using errcode = '42501';
  end if;
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
end $function$;
