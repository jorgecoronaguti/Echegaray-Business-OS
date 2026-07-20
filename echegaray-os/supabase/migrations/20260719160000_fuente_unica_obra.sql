-- ARQUITECTURA · FUENTE ÚNICA (decisión del dueño 2026-07-19)
--
-- Problema detectado: el mismo concepto de negocio se calculaba dos veces, una en la web (TypeScript)
-- y otra en el chat (.mjs del orquestador). Peor todavía: la vista que consumía la web
-- (obra_resumen_economico) está construida sobre la tabla LEGACY `obras` — con obras "Pisos",
-- "Galpón 9", "Cambio de Pisos - RRHH" — mientras el chat usa el EJE CANÓNICO (La Estrella, San
-- Francisco, Messina, ARCOR, Galpones). No eran números distintos: eran universos de obras distintos.
--
-- Regla que se establece: todo concepto de negocio que se muestre en más de una cara del OS (web,
-- chat, o cualquier otra herramienta que consuma del OS) se define UNA SOLA VEZ en Postgres. Las
-- caras consumen; ninguna recalcula. Es lo único que todos los consumidores hablan por igual.

-- 1) NORMALIZACIÓN DE NOMBRE DE OBRA — antes vivía duplicada en JS y en TypeScript, con un comentario
--    en el código que lo admitía: "normObra() es IDÉNTICA a la de la web. Si cambia una, cambia la
--    otra." Eso es una mina. Ahora la definición vive acá y las dos caras la usan.
--    Réplica exacta del comportamiento previo: minúsculas → sin acentos → todo lo no alfanumérico a
--    espacio → se quitan artículos/preposiciones → se colapsan espacios.
create or replace function public.norm_obra(txt text) returns text
language sql immutable as $$
  select trim(regexp_replace(
           regexp_replace(
             regexp_replace(
               translate(lower(coalesce(txt,'')),
                 'áàäâãéèëêíìïîóòöôõúùüûñç','aaaaaeeeeiiiiooooouuuunc'),
             '[^a-z0-9]+', ' ', 'g'),
           '\y(la|el|los|las|de|del)\y', ' ', 'g'),
         '\s+', ' ', 'g'))
$$;

-- 2) COSTO REAL POR OBRA CANÓNICA — la fuente única del costo por obra.
--    'mantenimiento' se agrega junto con 'obra' porque es igualmente facturable (caso ARCOR); los
--    alias 'indirecto' y 'excluido' quedan fuera a propósito: son Estructura, no costo de obra.
--    Verificado contra la capacidad del chat: coincide al peso en las 5 obras
--    (La Estrella $168.735.719 · San Francisco $66.646.796 · Messina $11.663.278 · ARCOR $10.023.691).
create or replace view public.obra_costo_real as
select oc.id            as obra_id,
       oc.nombre        as obra_nombre,
       oc.estado,
       oc.tipo,
       count(c.*)::int  as n_comprobantes,
       coalesce(sum(c.total), 0)::numeric as costo_real
  from public.obra_canonica oc
  left join public.obra_alias a
         on a.obra_id = oc.id
        and a.clasificacion in ('obra', 'mantenimiento')
  left join public.costos_obra c
         on public.norm_obra(c.obra_texto) = a.alias
 group by oc.id, oc.nombre, oc.estado, oc.tipo;

comment on view public.obra_costo_real is
  'FUENTE ÚNICA del costo real por obra canónica. La consumen web, chat y cualquier otra herramienta del OS. No recalcular este concepto en ninguna cara: ver orquestador/scripts/canario-fuente-unica.mjs.';
