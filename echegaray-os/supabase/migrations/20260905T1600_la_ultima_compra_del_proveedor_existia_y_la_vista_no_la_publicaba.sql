-- LA FECHA ESTABA EN LA BASE Y LA PANTALLA DECÍA «SIN LEER».
--
-- ═══ EL DEFECTO ═══
--
-- El handoff v4 dibuja la tabla de Proveedores con una columna ÚLTIMA COMPRA y fechas reales en
-- cuatro de sus cinco filas de muestra («21/08», «19/08», «14/08», «25/08»); el «—» aparece sólo en
-- el proveedor que no tiene ninguna compra leída. La pantalla portó la columna y contestaba «sin
-- leer» en el 100% de las filas — no porque el dato falte, sino porque esta vista no lo publicaba.
--
-- `costos_obra.fecha` está cargada en las 940 filas. La vista ya agrupa por nombre normalizado para
-- contar comprobantes y sumar importes: el máximo y el mínimo de esa misma agrupación no cuestan
-- una lectura más.
--
-- ═══ POR QUÉ TAMBIÉN LA PRIMERA ═══
--
-- «Proveedores · una pantalla» pide las dos —`dato('Primera compra', …)` y `dato('Última compra',
-- …)`— en la ficha del proveedor. Publicar sólo una obligaría a volver acá dentro de una semana, y
-- sale del mismo `group by`.
--
-- ═══ LO QUE NO CAMBIA ═══
--
-- El juego de columnas anterior, su orden y sus tipos quedan intactos: `create or replace view` no
-- admite otra cosa, y las dos nuevas van al final. El portero (`es_administracion()`) y el
-- `security_invoker` no se tocan: esto publica una fecha de compra, no abre la vista.

create or replace view public.proveedor_nombre_resuelto
with (security_invoker = true) as
with nombres as (
  select
    public.normalizar_nombre_proveedor(c.proveedor) as nombre_norm,
    count(*) as comprobantes,
    sum(coalesce(c.total, 0)) as total,
    -- NULL acá significa «este proveedor no tiene ninguna compra fechada», que es exactamente el
    -- «—» del mockup. No se reemplaza por una fecha inventada ni por la de hoy.
    max(c.fecha) as ultima_compra,
    min(c.fecha) as primera_compra
  from public.costos_obra c
  where public.normalizar_nombre_proveedor(c.proveedor) is not null
  group by 1
)
select
  n.nombre_norm,
  n.comprobantes,
  n.total,
  coalesce(a.estado, 'vinculado') as estado,
  coalesce(a.proveedor_id, p.id) as proveedor_id,
  coalesce(pa.nombre, p.nombre) as proveedor_nombre,
  -- De dónde salió el vínculo: cambia cuánto se le cree y quién lo puede deshacer.
  case when a.id is not null then 'resolucion_manual' else 'exacto' end as via,
  a.id as alias_id,
  n.ultima_compra,
  n.primera_compra
from nombres n
left join public.proveedores p
  on public.normalizar_nombre_proveedor(p.nombre) = n.nombre_norm
left join public.proveedor_alias a on a.nombre_norm = n.nombre_norm
left join public.proveedores pa on pa.id = a.proveedor_id
where (p.id is not null or a.id is not null)
  and public.es_administracion();

comment on view public.proveedor_nombre_resuelto is
  'Nombres del Sheet que YA tienen destino, y por qué vía. Sirve para deshacer una vinculación equivocada. Publica además la primera y la última compra fechada de ese nombre.';

-- UNA COLUMNA NUEVA NACE SIN PERMISO. Acá el grant de `authenticated` es a nivel vista y las cubre
-- solas, pero se declara igual: es idempotente, y el día que alguien cierre esta vista por columna
-- —como ya pasó con `cobranzas`— la pantalla se quedaría muda sin que nada falle.
grant select (ultima_compra, primera_compra) on public.proveedor_nombre_resuelto to authenticated;
