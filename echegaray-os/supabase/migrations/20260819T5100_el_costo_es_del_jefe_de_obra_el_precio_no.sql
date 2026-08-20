-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL COSTO ES DEL JEFE DE OBRA. EL PRECIO NO.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- El dueño precisó la regla (19/08/2026): *"los costos de las obras que se han estipulado en la
-- cotización de una obra sí, y lo que se lleva gastado en esa obra, son valores que «jefes de obra»
-- sí tienen que tener permiso para ver"*.
--
-- La línea no es «económico / no económico»: es **COSTO / PRECIO**.
--
--   VE el jefe        el costo presupuestado en la cotización, el costo indirecto, la HH estimada,
--                     y lo gastado hasta hoy. Es lo que administra: sin eso no puede saber si su
--                     obra se está yendo de precio.
--
--   NO VE el jefe     el monto presupuestado (el PRECIO de venta), el contratado, el margen, lo
--                     certificado, lo facturado y lo cobrado.
--
-- Y esa línea YA ESTABA DIBUJADA en `presupuestos`, por columna: `monto_presupuestado` y
-- `margen_esperado` nunca tuvieron GRANT de select para `authenticated` —Administración los lee por
-- las funciones `presupuesto_monto()` y `presupuesto_margen()`, que son `SECURITY DEFINER`—, y las
-- de costo sí lo tienen.
--
-- Así que la policy vuelve a `es_administracion()` —que desde hoy incluye al jefe— y los grants de
-- columna hacen el resto solos. El archivo anterior la había cerrado entera, y con eso se llevaba
-- puesto el costo presupuestado, que es justo lo que el jefe necesita.

drop policy if exists presupuestos_select on public.presupuestos;
create policy presupuestos_select on public.presupuestos for select to authenticated
  using (public.es_administracion());

comment on table public.presupuestos is
  'La cotización de una obra. El COSTO presupuestado lo lee cualquiera que administre —incluido el '
  'jefe de obra—; el PRECIO (monto_presupuestado) y el margen NO tienen grant de columna y salen '
  'sólo por presupuesto_monto() y presupuesto_margen(), que exigen ve_economia().';
