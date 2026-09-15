-- «Sin obra – SAN FRANCISCO» venía del desplegable (rótulo en MAYÚSCULAS, `rotuloSinObra` de obra-destino.mjs)
-- y el resolver lo comparaba contra `cliente_texto` tal cual («San Francisco»): 218 filas del relleno del 15/09
-- rechazadas con «no es un cliente con más de una obra viva». Misma regla que el JS: sin distinguir mayúsculas.
CREATE OR REPLACE FUNCTION public.obra_celda_resolver(p_valor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_valor  text := nullif(btrim(coalesce(p_valor, '')), '');
  v_codigo text;
  v_obra   record;
  v_rotulo text;
  v_cliente text;
begin
  if v_valor is null then
    return jsonb_build_object('destino', null, 'obra_id', null);
  end if;
  v_codigo := upper(substring(v_valor from '^((?:[Oo][Bb]|[Zz][Zz])-[0-9]{4,})(?![A-Za-z0-9_-])'));
  if v_codigo is not null then
    select id, btrim(codigo) as codigo, btrim(coalesce(nombre, '')) as nombre into v_obra
      from public.obra_canonica
     where upper(btrim(codigo)) = v_codigo and fusionada_en is null and btrim(codigo) ~* '^OB-';
    if not found then
      return jsonb_build_object('error', format('%s no es una obra viva del desplegable', v_codigo));
    end if;
    v_rotulo := case when v_obra.nombre = '' then v_obra.codigo else v_obra.codigo || ' · ' || v_obra.nombre end;
    if v_valor is distinct from v_rotulo then
      return jsonb_build_object('error', format('«%s» no es el rótulo de %s: el desplegable dice «%s»', left(v_valor, 60), v_codigo, v_rotulo));
    end if;
    return jsonb_build_object('destino', 'obra', 'obra_id', v_obra.id);
  end if;
  if v_valor = 'ES-ADM · Estructura – Administración' then
    return jsonb_build_object('destino', 'estructura_admin', 'obra_id', null);
  end if;
  if v_valor = 'ES-TAL · Estructura – Taller' then
    return jsonb_build_object('destino', 'estructura_taller', 'obra_id', null);
  end if;
  if v_valor like 'Sin obra – %' then
    v_cliente := substring(v_valor from char_length('Sin obra – ') + 1);
    if (select count(*) from public.obra_canonica
         where fusionada_en is null and upper('Sin obra – ' || btrim(coalesce(cliente_texto, ''))) = upper(v_valor)) > 1 then
      return jsonb_build_object('destino', 'obra', 'obra_id', null);
    end if;
    return jsonb_build_object('error', format('«%s» no es un cliente con más de una obra viva', left(v_cliente, 60)));
  end if;
  return jsonb_build_object('error', format('«%s» no es una opción del desplegable de Obra', left(v_valor, 60)));
end;
$function$
;
