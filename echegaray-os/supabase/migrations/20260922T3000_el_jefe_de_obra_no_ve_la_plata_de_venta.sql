-- LA PLATA DE VENTA DEJA DE SER LECTURA DE «ADMINISTRACIÓN» Y PASA A SER DE `ve_economia()`.
--
-- Orden del dueño, 22/09/2026, textual: *«los usuarios jefes de obra no pueden ver los montos
-- contratados de los clientes en CRM admin app.ecsas.com.ar, además de todo lo que implique monto de
-- venta en todo app.ecsas.com.ar»*.
--
-- ═══ EL AGUJERO, MEDIDO POR POSTGREST CON EL TOKEN DE UN JEFE DE OBRA ═══
--
-- `orquestador/scripts/sonda-venta-por-postgrest.mjs jefe`, contra la base viva, 22/09/2026 21:26 UTC.
-- NO es lectura de policies: es lo que la base le contestó al token que cualquiera copia de las
-- devtools.
--
--   GET /rest/v1/cliente_cuenta_corriente?select=nombre_comercial,saldo,cobrado_total,facturado_90d
--   200 [{"nombre_comercial":"La Estrella","saldo":0,"cobrado_total":192747417.93,…},
--        {"nombre_comercial":"Messina","saldo":102261955.36,"cobrado_total":120708963.38,…},
--        {"nombre_comercial":"Franco Quattropani","saldo":52408003.76,"cobrado_total":107900500.11,…}]
--
--   GET /rest/v1/cobranzas?select=cliente_id,obra_id,estado,monto_neto,total_bruto
--   200 [{"obra_id":"quattropani","estado":"Pendiente","total_bruto":1105146},
--        {"obra_id":"messina-bases-tanque-so2","estado":"Cobrado","monto_neto":2844877,…}, …]
--
--   GET /rest/v1/esquema_pago?select=obra_id,concepto,monto
--   200 [{"obra_id":"arcor","concepto":"Bacheo de suelos en Concentrador Rossi…","monto":2741732}, …]
--
--   GET /rest/v1/recibo_cliente?select=numero,monto&monto=not.is.null
--   200 [{"numero":"18","monto":10000000},{"numero":"19","monto":22000000},{"numero":"13","monto":4723000}]
--
--   GET /rest/v1/certificado_cliente?select=obra_id,numero,monto,reparo&monto=not.is.null
--   200 [{"numero":"230","monto":1105146},{"numero":"01-000048","monto":9491440}, …]
--
--   GET /rest/v1/movimientos_caja?select=tipo,concepto,monto,cliente_id
--   200 [{"tipo":"cobro","concepto":"Echeq pendiente - Oficinas y Fábrica de Palitos (FA 01-00000208)",
--        "monto":14999999.99,"cliente_id":"24150f2c-…"}, …]
--
-- La pantalla ya escondía casi todo esto —`cliente_economia`, `obra_economia`, `obra_panel`,
-- `obra_plan_vs_real` devuelven el contratado y el margen en NULL desde el 19/08— pero la FACTURACIÓN,
-- la CERTIFICACIÓN, el ESQUEMA DE PAGO, los RECIBOS y la CUENTA CORRIENTE salían enteros. Con el
-- cobrado total y el facturado de cada cliente en la mano, el contratado se deduce sin esfuerzo: la
-- máscara del contratado era una puerta cerrada al lado de una ventana abierta.
--
-- ═══ POR QUÉ LA CAUSA ES UNA SOLA ═══
--
-- Todas estas policies dicen `es_administracion()`, que desde el 19/08/2026 INCLUYE a `jefe_obra`
-- (migración 20260819T4900, decisión del dueño). La función que separa «administrar los maestros» de
-- «ver el precio» ya existe y es `ve_economia()` (`direccion | administracion`). No se toca
-- `es_administracion()` —de ella cuelgan los permisos de media app— ni `ve_obra()`, que para
-- `jefe_obra` devuelve true en TODAS las obras y por eso no sirve de cerradura económica.
--
-- ═══ QUÉ DECISIÓN ANTERIOR REVISA ESTO, Y POR QUÉ ═══
--
-- El 19/08/2026 el dueño había acotado el secreto: *«La única información expresamente secreta para
-- Obras es: PRESUPUESTO TOTAL / CONTRATADO TOTAL DE LA OBRA + cualquier cálculo que permita
-- deducirlo directamente»*, y ahí mismo: *«Certificación, facturación y cobranza pasaron a ser
-- operativas y SE VEN»* (está citado en `tests/autorizacion-por-obra.spec.ts`). La orden del 22/09 es
-- posterior y más amplia —«todo lo que implique monto de venta»—, y una certificación, una factura y
-- un cobro SON montos de venta. Manda la orden nueva. Queda anotado acá porque es un cambio de
-- criterio, no un descuido del anterior.
--
-- ═══ LO QUE EL JEFE DE OBRA SIGUE VIENDO (no se toca nada de esto) ═══
--
-- El COSTO de su obra (`costos_obra`, `costos_reales`, `compra_sheet`, `compras`, `comprobantes_arca`,
-- `clasificaciones_costo_obra`), su gente, la asistencia, las herramientas, el efectivo propio, la
-- ficha del cliente con sus contactos, obras, documentos y notas, y el alta/edición de todo eso.
-- Ninguna policy de escritura cambia de dueño: las que ya eran `direccion|administracion` siguen
-- igual, y las `ALL` que decían `es_administracion()` sobre plata de venta pasan a `ve_economia()` —
-- que es el mismo conjunto de personas que hoy las usa, menos el jefe de obra.
--
-- Sin DDL pesado: son policies. No toma locks sobre datos.
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

-- ═══ 1. LA FACTURACIÓN AL CLIENTE ═══
-- `cobranzas` es la pestaña Cobranzas del Sheet: lo que se le factura a cada cliente. De acá cuelga
-- `cuenta_corriente_de_clientes()` y, por ella, la vista `cliente_cuenta_corriente` (security_invoker):
-- cerrando la tabla se cierran las dos, sin tocarlas.
drop policy if exists cobranzas_select on public.cobranzas;
create policy cobranzas_select on public.cobranzas for select to authenticated
  using ((select public.ve_economia()));

-- `cobranza` es la tabla legado del mismo dato (total, fecha de cobro, cliente): estaba en
-- `using (true)`, o sea abierta hasta para el nivel campo.
drop policy if exists cobranza_read on public.cobranza;
create policy cobranza_read on public.cobranza for select to authenticated
  using ((select public.ve_economia()));

-- El pedido de corrección de un importe de cobranza lleva el importe adentro.
drop policy if exists cobranza_cambio_select on public.cobranza_cambio;
create policy cobranza_cambio_select on public.cobranza_cambio for select to authenticated
  using ((select public.ve_economia()));
drop policy if exists cobranza_cambio_insert on public.cobranza_cambio;
create policy cobranza_cambio_insert on public.cobranza_cambio for insert to authenticated
  with check ((select public.ve_economia())
              and pedido_por = (select auth.uid()) and estado = 'pendiente' and intentos = 0);

-- ═══ 2. EL CONTRATO Y SU COBRO: CERTIFICADOS, ESQUEMA DE PAGO, RECIBOS ═══
-- Las tres conservan intacta su rama de PORTAL (`es_cliente()`): el cliente sigue viendo lo suyo.
-- Y las tres cambian TAMBIÉN su policy de escritura, porque una policy `ALL` con `using` habilita el
-- SELECT: dejar sólo la de lectura sería creer que se cerró algo que sigue abierto por la de al lado.
drop policy if exists certificado_cliente_select on public.certificado_cliente;
create policy certificado_cliente_select on public.certificado_cliente for select to authenticated
  using ((select public.ve_economia())
     or ((select public.es_cliente()) and cliente_id = (select public.cliente_de_sesion())
         and exists (select 1 from public.cliente_acceso a
                      where a.auth_user_id = (select auth.uid()) and a.revocado_at is null
                        and a.puede_ver_obra
                        and (a.obras is null or certificado_cliente.obra_id = any (a.obras)))));
drop policy if exists certificado_cliente_escribe on public.certificado_cliente;
create policy certificado_cliente_escribe on public.certificado_cliente for all to authenticated
  using ((select public.ve_economia())) with check ((select public.ve_economia()));

drop policy if exists esquema_pago_select on public.esquema_pago;
create policy esquema_pago_select on public.esquema_pago for select to authenticated
  using ((select public.ve_economia())
     or ((select public.es_cliente()) and cliente_id = (select public.cliente_de_sesion())
         and visible_portal and publicado_at is not null
         and exists (select 1 from public.cliente_acceso a
                      where a.auth_user_id = (select auth.uid()) and a.revocado_at is null
                        and a.puede_ver_obra
                        and (a.obras is null or esquema_pago.obra_id = any (a.obras)))));
drop policy if exists esquema_pago_escribe on public.esquema_pago;
create policy esquema_pago_escribe on public.esquema_pago for all to authenticated
  using ((select public.ve_economia())) with check ((select public.ve_economia()));

drop policy if exists recibo_cliente_select on public.recibo_cliente;
create policy recibo_cliente_select on public.recibo_cliente for select to authenticated
  using ((select public.ve_economia())
     or ((select public.es_cliente()) and cliente_id = (select public.cliente_de_sesion())
         and visible_portal
         and exists (select 1 from public.cliente_acceso a
                      where a.auth_user_id = (select auth.uid()) and a.revocado_at is null
                        and a.puede_ver_obra
                        and (a.obras is null or recibo_cliente.obra_id = any (a.obras)))));
drop policy if exists recibo_cliente_escribe on public.recibo_cliente;
create policy recibo_cliente_escribe on public.recibo_cliente for all to authenticated
  using ((select public.ve_economia())) with check ((select public.ve_economia()));

-- ═══ 3. LA ORDEN DE COMPRA DEL CLIENTE ═══
-- `cliente_orden.importe` es el precio que el cliente puso por escrito: es EL contrato, en papel.
-- Su policy le daba al jefe de obra las órdenes de «sus» obras, y `ve_obra()` para `jefe_obra` son
-- TODAS. 393 filas.
drop policy if exists cliente_orden_select on public.cliente_orden;
create policy cliente_orden_select on public.cliente_orden for select to authenticated
  using ((select public.ve_economia()));

-- ═══ 4. LO QUE EL CLIENTE INFORMA QUE PAGÓ ═══
-- Cero filas hoy. Un permiso que todavía no filtró nada porque la tabla está vacía no es un permiso
-- correcto: es una bomba con la mecha apagada (la misma razón que la 20260922T2700).
drop policy if exists pago_informado_select on public.pago_informado;
create policy pago_informado_select on public.pago_informado for select to authenticated
  using ((select public.ve_economia())
     or ((select public.es_cliente()) and cliente_id = (select public.cliente_de_sesion())));
drop policy if exists pago_informado_update on public.pago_informado;
create policy pago_informado_update on public.pago_informado for update to authenticated
  using ((select public.ve_economia())) with check ((select public.ve_economia()));

-- El registro de actividad del portal lleva el importe que el cliente informó.
drop policy if exists cliente_actividad_portal_select on public.cliente_actividad_portal;
create policy cliente_actividad_portal_select on public.cliente_actividad_portal for select to authenticated
  using ((select public.ve_economia())
     or ((select public.es_cliente()) and cliente_id = (select public.cliente_de_sesion())));

-- ═══ 5. LA CAJA, DONDE EL COBRO VUELVE A APARECER CON NOMBRE Y APELLIDO ═══
-- `movimientos_caja` estaba en `using (true)`: cualquiera con sesión —incluido el nivel campo— leía
-- «cobro · Echeq pendiente - Galpón 9 (FA 01_00000213) · 10.000.000 · cliente 24150f2c…». Ninguna
-- pantalla de Obras la lee (verificado por búsqueda en `src/`); las que sí, son de Dirección.
drop policy if exists lectura_autenticados on public.movimientos_caja;
create policy movimientos_caja_select on public.movimientos_caja for select to authenticated
  using ((select public.ve_economia()));

-- `acciones` (pendientes de cobro y de pago con su contraparte y su monto), `obligaciones` (la deuda
-- comercial e impositiva de la empresa) y `aplicaciones_pago` (cuánto se aplicó a cada una) también
-- estaban en `using (true)`. No son «monto de venta» en sentido estricto —son tesorería— pero son la
-- plata de la empresa leída por cualquier sesión, y sus únicas pantallas (`/reportes`,
-- `/calendario-financiero`, Dirección) ya son de `ve_economia()`. Se cierran acá y se declara.
drop policy if exists lectura_autenticados on public.acciones;
create policy acciones_select on public.acciones for select to authenticated
  using ((select public.ve_economia()));

drop policy if exists lectura_autenticados on public.obligaciones;
create policy obligaciones_select on public.obligaciones for select to authenticated
  using ((select public.ve_economia()));

drop policy if exists lectura_autenticados on public.aplicaciones_pago;
create policy aplicaciones_pago_select on public.aplicaciones_pago for select to authenticated
  using ((select public.ve_economia()));

notify pgrst, 'reload schema';
