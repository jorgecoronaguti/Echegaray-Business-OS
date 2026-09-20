-- EL FONDO ADMINISTRADO NO ES PRECIO (dueño, 19/09/2026: «ok»).
--
-- ═══ EL CASO ═══
--
-- Quattropani: el contrato dice «Precio de mano de obra: U$S 63.000 + IVA, ajuste alzado. Materiales:
-- fondo administrado de $ 44.110.169,31 (cláusula 4)». Los materiales NO son venta nuestra: el cliente
-- pone la plata, la empresa compra con ella y rinde. Pasan por nuestra cuenta y por Cobranzas —hoy la
-- obra tiene $132,5 M cobrados contra un contratado de $95 M—, y sin decir cuál es cuál, la diferencia
-- se lee como si le hubiéramos facturado de más.
--
-- ═══ QUÉ AGREGA ═══
--
-- `materiales_regimen` dice, POR CONTRATO, qué son los materiales: parte del PRECIO (lo normal) o un
-- FONDO ADMINISTRADO del cliente. Es un dato del contrato, no una interpretación: se carga junto con
-- su cita. El total del contrato (`contrato_total`) sigue existiendo, pero quien muestre plata puede
-- ahora distinguir lo que es venta de lo que es fondo de terceros.
--
-- El margen NO cambia con esta migración: `obra_economia_sheet` (la pestaña OBRAS, que mantiene el
-- dueño) ya deja fuera los materiales del fondo, y el contratado de Quattropani ya es sólo la MO.
alter table public.obra_contrato
  add column if not exists materiales_regimen text not null default 'precio';

alter table public.obra_contrato drop constraint if exists obra_contrato_materiales_regimen_check;
alter table public.obra_contrato add constraint obra_contrato_materiales_regimen_check
  check (materiales_regimen in ('precio', 'fondo_administrado'));

comment on column public.obra_contrato.materiales_regimen is
  'precio = los materiales son venta nuestra · fondo_administrado = plata del cliente que la empresa administra y rinde (no es venta ni costo propio). Lo dice el contrato, con su cita en `cita`.';

update public.obra_contrato
   set materiales_regimen = 'fondo_administrado'
 where obra_id = 'quattropani'
   and cita ilike '%fondo administrado%';
