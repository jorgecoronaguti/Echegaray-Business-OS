-- D08 — LA FICHA DEL PROVEEDOR DICE CUÁNTO SE LE PAGÓ EN EFECTIVO DE OBRA, Y QUIÉN SE LO PAGÓ.
--
-- ═══ QUÉ FALTABA ═══
--
-- El módulo de efectivo sabía qué fila de Compras rinde qué entrega (`efectivo_rendicion.compra_clave`),
-- pero ese dato moría adentro del módulo. Desde la ficha del proveedor —la pantalla donde se decide si
-- se le paga por transferencia, si se le abre cuenta corriente o si se le sigue mandando gente con
-- plata en el bolsillo— no había forma de ver que el 14 % de lo que se le compra se le está pagando en
-- efectivo de obra, ni de saber por mano de quién.
--
-- ═══ POR QUÉ NACE DE `proveedor_compra` Y NO DE `efectivo_rendicion` ═══
--
-- El proveedor de una compra NO está en el módulo de efectivo: la rendición apunta a una fila de
-- Compras por su clave, y recién `proveedor_compra` la resuelve a un proveedor (por CUIT o por nombre
-- resuelto). Partir de la rendición obligaría a repetir esa resolución acá y a tener dos respuestas
-- para «¿de quién es esta compra?». Hay una sola: la de la ficha.
--
-- ═══ QUIÉN LA VE (Y POR QUÉ NO SE DIBUJA RECORTADA) ═══
--
-- `security_invoker`: hereda la policy de `compra_sheet` (`es_administracion()`) Y la de
-- `efectivo_rendicion`, que desde la 20260922T2700 es `ve_economia()` o la propia persona. El jefe de
-- obra entra a la ficha pero NO tiene `ve_economia()`: la base le devolvería CERO filas sin error, y
-- una cifra de «pagado en efectivo» en cero sobre un proveedor al que se le pagaron millones es peor
-- que no dibujarla (regla de oro 2). Por eso la app cuelga el bloque entero de `ve_economia()` y al
-- jefe no le muestra ni la cifra ni la columna. La vista no miente; la pantalla tampoco.
--
-- ═══ `left join` A `personas` Y A `obra_canonica`, A PROPÓSITO ═══
--
-- Lección del 22/09/2026 (`efectivo_entrega_saldo`): una vista `security_invoker` no puede depender de
-- la RLS de OTRA tabla para decidir si una fila EXISTE. Quién rindió y en qué obra es decoración de la
-- fila; lo que la hace existir es la compra y su rendición. Si `personas` no deja leer el nombre, la
-- fila igual aparece —sin nombre— y la cifra no se achica en silencio.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

create or replace view public.proveedor_efectivo_rendido with (security_invoker = true) as
  select pc.proveedor_id,
         pc.clave,
         pc.fecha,
         pc.comprobante,
         pc.concepto,
         pc.total,
         r.monto        as monto_rendido,
         r.imputada_en,
         e.codigo       as entrega,
         e.obra_id,
         o.nombre       as obra,
         e.persona_id,
         p.nombre_completo as rindio
    from public.proveedor_compra pc
    join public.efectivo_rendicion r on r.compra_clave = pc.clave
    join public.efectivo_entrega   e on e.id = r.entrega_id
    left join public.obra_canonica o on o.id = e.obra_id
    left join public.personas      p on p.id = e.persona_id
   where pc.anulada is not true
     and e.anulada_en is null;

comment on view public.proveedor_efectivo_rendido is
  'D08 · qué compras de cada proveedor se pagaron con efectivo a rendir, con la entrega (ER-####) y '
  'quién la tenía en la mano. Una fila por compra rendida. La ve quien ve el módulo de efectivo '
  '(ve_economia): al jefe de obra le devuelve cero filas, y por eso la app no le dibuja el bloque.';

revoke all on public.proveedor_efectivo_rendido from anon, public;
grant select on public.proveedor_efectivo_rendido to authenticated;

notify pgrst, 'reload schema';
