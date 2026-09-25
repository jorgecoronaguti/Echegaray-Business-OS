-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- HERRAMIENTAS · EL EPP Y LA ROPA DE SERSOLIN: productos reales en el catálogo y la compra en el stock
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Dueño, 25/09/2026: mandó tres PDF de SERSOLIN S.A.S. (CUIT 30718320514) «con los EPP y ropa de
-- trabajo que quiero que cargues en el módulo Herramientas donde y como corresponde».
--
--   1. Factura A 00002-00000885 del 04/09/2026 (entregada el 02/09 en Calvento Este 217, CAE
--      86361493488109, neto $311.480 = 5 pantalones × $11.830 + 5 botines × $50.466). Es COMPRA: entra
--      al stock del Taller con un movimiento de ingreso que lleva la factura como origen.
--   2. Presupuesto X 00002366 del 08/09/2026 y 3. Presupuesto X 00002233 del 05/08/2026: cotizaciones.
--      Dan de alta el producto con su precio de referencia y stock 0. NO suman unidades.
--
-- ═══ EL PRODUCTO REAL REEMPLAZA AL GENÉRICO DONDE COINCIDE ═══
-- El genérico del mismo tipo y talle (base de 20260925T1100, sin ningún uso: ni movimientos, ni ajustes,
-- ni existencias al 25/09) pasa a ser el producto real —mismo código, se le cargan marca, modelo y código
-- del proveedor—. Así no quedan dos ítems para lo mismo y nada se borra. Donde no hay genérico del
-- mismo talle o tipo, el producto entra como ítem nuevo.
--
-- ═══ LA FACTURA 00002-00000897 (09/09, neto $349.648,40) NO SE CARGA ═══
-- Está en ARCA pero no hay PDF (ni en Gmail de jorge/rodrigo ni en Drive al 25/09). Su neto es EXACTO a
-- los cinco renglones de guantes y anteojos del presupuesto 2233 sin el chaleco; es una inferencia, no el
-- detalle de la factura: queda para que el dueño la confirme o mande el PDF.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

-- ── 1. LO QUE EL CATÁLOGO NECESITA SABER DE UN PRODUCTO REAL ───────────────────────────────────
alter table public.activo
  add column marca text check (marca is null or length(btrim(marca)) between 1 and 60),
  add column modelo text check (modelo is null or length(btrim(modelo)) between 1 and 160),
  add column codigo_proveedor text check (codigo_proveedor is null or length(btrim(codigo_proveedor)) between 1 and 40),
  add column precio_referencia numeric(14, 2) check (precio_referencia is null or precio_referencia >= 0),
  add column precio_referencia_de text check (precio_referencia_de is null or length(precio_referencia_de) <= 120);
comment on column public.activo.codigo_proveedor is 'Código del artículo en la lista del proveedor (compra_proveedor_id).';
comment on column public.activo.precio_referencia is
  'Precio neto unitario de una COTIZACIÓN (no es una compra: la compra va en compra_precio). precio_referencia_de dice de cuál.';

alter table public.activo_movimiento add column comprobante_id uuid references public.comprobantes_arca(id);
comment on column public.activo_movimiento.comprobante_id is
  'El comprobante de compra que respalda un ingreso (origen_id null): la factura del proveedor en comprobantes_arca.';

-- ── 2. LOS PRODUCTOS ────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_sersolin uuid := '10adbd84-1791-4aa7-9b35-e9fc246d09e0';
  v_f885 uuid := '046be888-d0b1-4f3d-9c76-48405a3c4997';
  v_taller uuid;
  v_fecha timestamptz := '2026-09-02 12:00:00-03';
  v_nota text := 'compra · Factura A 00002-00000885 SERSOLIN (entregada el 02/09 en Calvento Este 217)';
  r record; v_id uuid; v_usados int;
begin
  select id into v_taller from ubicacion where tipo = 'taller' and not archivada;
  if v_taller is null then raise exception 'no hay Taller'; end if;
  if not exists (select 1 from proveedores where id = v_sersolin and cuit = '30718320514') then raise exception 'falta SERSOLIN en proveedores'; end if;
  if not exists (select 1 from comprobantes_arca where id = v_f885 and numero = '885' and emisor_cuit = '30718320514') then raise exception 'falta la factura 885 en ARCA'; end if;

  -- Los genéricos que se van a convertir no pueden tener historia: si alguien los usó, se frena.
  select count(*) into v_usados from activo a
   where a.clase in ('epp', 'ropa')
     and a.codigo in ('PAN-002', 'PAN-003', 'PAN-006', 'BOT-003', 'BOT-004', 'BOT-006', 'BOT-008', 'GUA-001', 'ANT-001', 'ANT-002', 'CHA-001')
     and (exists (select 1 from activo_movimiento m where m.activo_id = a.id)
       or exists (select 1 from activo_ajuste j where j.activo_id = a.id)
       or exists (select 1 from activo_existencia e where e.activo_id = a.id));
  if v_usados > 0 then raise exception '% genéricos ya tienen uso: no se convierten a ciegas', v_usados; end if;

  for r in select * from (values
    -- nombre (genérico o nuevo), talle, clase, marca, modelo, código proveedor, compra (precio neto), referencia (precio neto), de, unidades de la 885, prefijo si es nuevo
    ('Pantalón de trabajo', '40', 'ropa', 'TEX WORK', 'pantalón de trabajo azulino, azul marino', '1857', 11830.00, null::numeric, null::text, 2, 'PAN'),
    ('Pantalón de trabajo', '42', 'ropa', 'TEX WORK', 'pantalón de trabajo azulino, azul marino', '1858', 11830.00, null, null, 1, 'PAN'),
    ('Pantalón de trabajo', '48', 'ropa', 'TEX WORK', 'pantalón de trabajo azulino, azul marino', '1861', 11830.00, null, null, 2, 'PAN'),
    ('Botín de seguridad', '40', 'epp', 'PEGASO', 'EFFORT cuero flor negro', '1610', 50466.00, null, null, 1, 'BOT'),
    ('Botín de seguridad', '41', 'epp', 'PEGASO', 'EFFORT cuero flor negro', '1611', 50466.00, null, null, 2, 'BOT'),
    ('Botín de seguridad', '45', 'epp', 'PEGASO', 'EFFORT cuero flor negro', '1615', 50466.00, null, null, 1, 'BOT'),
    ('Botín de seguridad', '43', 'epp', 'PEGASO', 'BRONCE marrón/negro', '1633', 50466.00, null, null, 1, 'BOT'),
    ('Pantalón de trabajo jeans', '40', 'ropa', 'FULLBACK', 'pantalón de trabajo jeans azul', '504', null, 21863.64, 'Presupuesto X 00002366 · 08/09/2026', 0, 'PAN'),
    ('Pantalón de trabajo jeans', '42', 'ropa', 'FULLBACK', 'pantalón de trabajo jeans azul', '505', null, 21863.64, 'Presupuesto X 00002366 · 08/09/2026', 0, 'PAN'),
    ('Pantalón de trabajo jeans', '48', 'ropa', 'FULLBACK', 'pantalón de trabajo jeans azul', '508', null, 21863.64, 'Presupuesto X 00002366 · 08/09/2026', 0, 'PAN'),
    ('Guantes de vaqueta', '10', 'epp', 'CVE', 'cuero vaqueta amarilla, puño elástico, certificado (GU-VAQ-T10)', '480', null, 2812.50, 'Presupuesto X 00002233 · 05/08/2026', 0, 'GUA'),
    ('Guantes recubiertos de látex', '11', 'epp', 'PROWORK', 'recubierto látex rugoso PW 1741', '1685', null, 1087.50, 'Presupuesto X 00002233 · 05/08/2026', 0, 'GUA'),
    ('Guantes de descarne', null, 'epp', 'CVE', 'descarne soldador rojo, costura de kevlar, certificado', '479', null, 5125.00, 'Presupuesto X 00002233 · 05/08/2026', 0, 'GUA'),
    ('Anteojos de seguridad oscuros', null, 'epp', 'LIBUS', 'Eco Line gris HC-900555', '776', null, 1477.12, 'Presupuesto X 00002233 · 05/08/2026', 0, 'ANT'),
    ('Anteojos de seguridad claros', null, 'epp', 'LIBUS', 'Eco Line transparente HC-900558', '777', null, 1477.12, 'Presupuesto X 00002233 · 05/08/2026', 0, 'ANT'),
    ('Chaleco reflectivo', null, 'ropa', 'BIL VEX', 'poliéster naranja/amarillo', '2201', null, 2026.31, 'Presupuesto X 00002233 · 05/08/2026', 0, 'CHA')
  ) v(nombre, talle, clase, marca, modelo, cod_prov, compra, referencia, de, unidades, pre)
  loop
    select id into v_id from activo
     where clase = r.clase and lower(nombre) = lower(r.nombre) and coalesce(talle, '') = coalesce(r.talle, '') and estado <> 'baja';
    if v_id is null then
      insert into activo (codigo, clase, nombre, categoria, talle, cantidad)
      values (public._siguiente_codigo(r.pre), r.clase, r.nombre, case r.clase when 'epp' then 'EPP' else 'Ropa de trabajo' end, r.talle, 0)
      returning id into v_id;
    end if;
    update activo set marca = r.marca, modelo = r.modelo, codigo_proveedor = r.cod_prov, compra_proveedor_id = v_sersolin,
                      compra_precio = r.compra, compra_fecha = case when r.compra is not null then date '2026-09-04' end,
                      precio_referencia = r.referencia, precio_referencia_de = r.de
     where id = v_id;
    if r.unidades > 0 then
      insert into activo_movimiento (activo_id, origen_id, destino_id, fecha_hora, usuario_id, usuario_texto, nota, cantidad, comprobante_id)
      values (v_id, null, v_taller, v_fecha, null, 'Factura SERSOLIN 885', v_nota, r.unidades, v_f885);
      insert into activo_existencia (activo_id, ubicacion_id, cantidad) values (v_id, v_taller, r.unidades)
      on conflict (activo_id, ubicacion_id) do update set cantidad = activo_existencia.cantidad + excluded.cantidad;
      perform public._activo_recalcular(v_id);
    end if;
  end loop;
end $$;

-- ── LA CUENTA TIENE QUE CERRAR: 10 unidades de la 885 en el Taller, $311.480 neto ───────────────
do $$
declare v_u int; v_neto numeric;
begin
  select sum(m.cantidad), sum(m.cantidad * a.compra_precio) into v_u, v_neto
    from activo_movimiento m join activo a on a.id = m.activo_id
   where m.comprobante_id = '046be888-d0b1-4f3d-9c76-48405a3c4997';
  if v_u <> 10 or v_neto <> 311480 then raise exception 'la factura 885 no cierra: % unidades, $% neto', v_u, v_neto; end if;
  if (select count(*) from activo where compra_proveedor_id = '10adbd84-1791-4aa7-9b35-e9fc246d09e0' and clase in ('epp', 'ropa')) <> 16 then
    raise exception 'no quedaron 16 productos de SERSOLIN';
  end if;
  raise notice 'SERSOLIN: 16 productos, 10 unidades de la factura 885 en el Taller ($311.480 neto)';
end $$;
