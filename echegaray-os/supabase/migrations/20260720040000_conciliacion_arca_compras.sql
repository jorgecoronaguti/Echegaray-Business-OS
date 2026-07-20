-- CONCILIACIÓN ARCA ↔ COMPRAS DEL SHEET — fuente única de "qué gasto no está imputado a ninguna obra".
--
-- CORRIGE UNA FALSA ALARMA PROPIA (2026-07-20): el control administrativo reportaba "47 de 47
-- facturas de compra sin imputar a obra" mirando `comprobantes_arca.obra_texto`, un campo que
-- NADIE llena. La imputación real existe y funciona: vive en `costos_obra`, espejo de la pestaña
-- Compras donde la empresa ya asigna cada compra a una obra (731 filas, $578M). Alertar sobre un
-- problema ya resuelto en otra fuente destruye la confianza más rápido que no alertar.
--
-- El problema REAL es otro y es material: comprobantes que ARCA registró y que nunca entraron a la
-- pestaña Compras. Ese gasto existe, es deducible, y no está en el costo de ninguna obra: el margen
-- que muestra el OS está sobreestimado exactamente en ese monto.
--
-- CLAVE DE CONCILIACIÓN: ARCA guarda punto de venta y número por separado y sin ceros a la
-- izquierda ("6", "3188"); el Sheet los escribe juntos y con relleno ("06-006668"). Se normalizan
-- los dos lados al mismo formato canónico "pv-numero" sin ceros.
create or replace function public.norm_comprobante(pv text, nro text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(pv, ''), '^0+', ''), '') || '-' ||
         nullif(regexp_replace(coalesce(nro, ''), '^0+', ''), '');
$$;

comment on function public.norm_comprobante(text, text) is
  'Clave canónica de un comprobante (punto de venta - número, sin ceros a la izquierda). Permite cruzar ARCA con la pestaña Compras, que los escribe con formatos distintos.';

-- Comprobantes de COMPRA registrados en ARCA que NO aparecen en la pestaña Compras.
create or replace view public.comprobante_sin_registrar as
with sheet as (
  select distinct public.norm_comprobante(split_part(comprobante, '-', 1), split_part(comprobante, '-', 2)) as k
    from public.costos_obra
   where comprobante like '%-%'
)
select a.id,
       a.periodo,
       a.fecha_emision,
       a.emisor_nombre,
       a.emisor_cuit,
       a.imp_total,
       public.norm_comprobante(a.punto_venta, a.numero) as comprobante
  from public.comprobantes_arca a
  left join sheet s on s.k = public.norm_comprobante(a.punto_venta, a.numero)
 where a.tipo_libro = 'R'
   and a.punto_venta is not null
   and a.numero is not null
   and s.k is null;

comment on view public.comprobante_sin_registrar is
  'Gasto real registrado en ARCA que nunca entró a la pestaña Compras: no está imputado a ninguna obra, así que el margen por obra lo ignora. Fuente única para chat y web.';
