-- EL JEFE DE OBRA TAMPOCO ESCRIBE UN PAGO DE CLIENTE (cierre de la 20260922T3000, 22/09/2026).
--
-- `pago_informado_insert` seguía en `es_administracion()`, que incluye a `jefe_obra`: cerrada la
-- LECTURA de la plata de venta, quedaba abierta la ESCRITURA de un aviso de pago —«el cliente X
-- transfirió $N»— que después Administración concilia. Un dato que no se puede leer y sí se puede
-- fabricar es peor que uno abierto.
--
-- La rama del PORTAL no se toca: el cliente sigue informando su propio pago, que es para lo que se
-- creó la tabla. Lo único que sale es la rama interna, que pasa de `es_administracion()` a
-- `ve_economia()`.
--
-- NO se toca `cliente_actividad_portal_insert`, que sigue en `es_administracion()` a propósito: es el
-- registro de actividad que escribe el alta de un acceso al portal, y el jefe de obra SÍ habilita
-- accesos (`cliente_acceso_insert`). Cerrarlo le rompería ese circuito sin cerrar ninguna plata: el
-- `monto` de esa tabla lo escribe el portal, no el alta.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

drop policy if exists pago_informado_insert on public.pago_informado;
create policy pago_informado_insert on public.pago_informado for insert to authenticated
  with check ((select public.ve_economia())
           or ((select public.es_cliente()) and cliente_id = (select public.cliente_de_sesion())));

notify pgrst, 'reload schema';
