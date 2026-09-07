-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LOS PAPELES DE UN PROVEEDOR — el vínculo no había que inventarlo, había que publicarlo
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Pedido del dueño, 06/09/2026, textual: «necesito q el panel de proveedores en app.ecsas.com.ar
-- tenga guardadas las facturas o la imagen del comprobante q corresponden a cada proveedor, asi
-- como lo hacemos con "compras"».
--
-- ═══ POR QUÉ ESTO YA NO ES «SIN FUENTE» ═══
--
-- `PanelProveedor.tsx` y el canónico de la cartera declaran, los dos, que PAPELES no se dibuja
-- porque «ninguna tabla vincula un archivo con un proveedor». Era cierto y dejó de serlo: el
-- archivo cuelga de la COMPRA (`compra_adjunto.compra_clave` → `compra_sheet.clave`) y la compra
-- trae el proveedor escrito. El vínculo se DERIVA, no se inventa ni se guarda una segunda vez.
--
-- ═══ POR QUÉ UNA VISTA Y NO DOS CONSULTAS DESDE EL SERVICIO ═══
--
-- El salto que falta es del TEXTO al proveedor canónico: `compra_sheet.proveedor` es texto libre y
-- un proveedor tiene varias grafías. Ese criterio ya vive una sola vez —`proveedor_nombre_resuelto`,
-- que cruza por `normalizar_nombre_proveedor()`— y PostgREST no puede aplicar esa función en un
-- filtro. Resolverlo en TypeScript sería escribir la SEGUNDA definición de «quién es este
-- proveedor», y el día que las dos difieran la ficha y el panel mostrarían proveedores distintos
-- para el mismo papel. Se joinea contra la vista que ya decide.
--
-- ═══ POR QUÉ `distinct on` Y NO UN JOIN PELADO ═══
--
-- `compra_sheet.clave` NO es única y su migración lo declara a propósito: la misma factura puede
-- estar en dos renglones, y esconderlo rompiendo la réplica sería peor que mostrarlo. Hoy son cero
-- casos (medido 06/09/2026), pero un join pelado publicaría el MISMO papel dos veces el día que
-- aparezca el primero, y en un panel eso se lee como dos comprobantes.
--
-- El distinct es por (proveedor, adjunto): si dos renglones duplicados tuvieran proveedores
-- distintos, el papel aparece en los dos paneles. Colapsar por adjunto elegiría uno en silencio y
-- le escondería el respaldo al otro.
--
-- ═══ QUÉ NO PUEDE CONTESTAR ESTA VISTA ═══
--
-- Los papeles SUELTOS (`compra_clave is null`, 53 al 06/09/2026) no aparecen: sin compra no hay
-- proveedor, y adivinarlo por el nombre del archivo es exactamente el error que el circuito de
-- vinculación existe para evitar.
--
-- Y un papel sólo llega a su proveedor si el texto de su compra ya está resuelto: la vista de
-- resolución agrupa `costos_obra` —las compras CON OBRA— así que un nombre que nunca pasó por ahí
-- no tiene fila. Medido hoy: los 22 nombres con papel están todos en `costos_obra`, y los 11
-- papeles que quedan afuera son de nombres que no son ningún proveedor del maestro (RODAMIENTOS
-- CUYO, MOVISTAR, GOOGLE…) — no hay panel donde mostrarlos.

create or replace view public.proveedor_papel
with (security_invoker = true) as
select distinct on (r.proveedor_id, a.id)
  r.proveedor_id,
  a.id as adjunto_id,
  a.nombre,
  a.media_type,
  a.bytes,
  a.subido_at,
  -- Cómo se supo que este papel es de esta compra: `registro` es un HECHO (lo cargó el bot),
  -- `match_numero` un CÁLCULO y `match_manual` la decisión de una persona. La pantalla tiene que
  -- poder decir cuál, igual que ya lo dice para los nombres vinculados.
  a.vinculado_por,
  cs.clave as compra_clave,
  cs.fila as compra_fila,
  -- NULL acá es «esta compra no tiene fecha», no «hoy». 212 filas del libro no tienen número de
  -- comprobante y algunas tampoco fecha; el panel lo dice con palabras.
  cs.fecha as compra_fecha,
  cs.comprobante,
  cs.total
from public.compra_adjunto a
join public.compra_sheet cs on cs.clave = a.compra_clave
join public.proveedor_nombre_resuelto r
  on r.nombre_norm = public.normalizar_nombre_proveedor(cs.proveedor)
-- `no_es_proveedor` marca un texto que NO es nadie («SUELDOS», «ARCA»): colgarle su papel a un
-- proveedor sería regalarle un comprobante que la resolución justamente descartó.
where r.proveedor_id is not null
  and r.estado = 'vinculado'
  and (select public.es_administracion())
order by r.proveedor_id, a.id, cs.fecha desc nulls last, cs.fila;

comment on view public.proveedor_papel is
  'Los archivos de comprobante que llegan a un proveedor por la compra de la que cuelgan. Derivada: el vínculo no se guarda en ningún lado, sale de compra_adjunto → compra_sheet → proveedor_nombre_resuelto. No incluye los papeles sueltos: sin compra no hay proveedor.';

-- UNA COLUMNA NUEVA NACE SIN PERMISO Y RLS NO ES GRANT: sin esto PostgREST devuelve «permission
-- denied» y Next lo muestra como un 404 mudo. La cerradura por fila la siguen poniendo las policies
-- de `compra_adjunto` y `compra_sheet` (`es_administracion()`), que `security_invoker` hace valer
-- con el rol de quien consulta y no con el del dueño de la vista.
grant select on public.proveedor_papel to authenticated;
