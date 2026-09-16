-- EL COMPROBANTE DE UN PAGO — el papel que prueba que la plata salió, distinto de la factura.
--
-- ═══ EL PEDIDO (dueño, 16/09/2026), TEXTUAL ═══
--
-- «necesito poder subir comprobantes de pago a app.ecsas.com.ar imputados a la compra y que eso quede
-- registrado».
--
-- ═══ POR QUÉ NO ES «OTRO ADJUNTO» ═══
--
-- `compra_adjunto` ya guarda el papel de cada fila de Compras, pero ese papel es LA FACTURA: lo que
-- el proveedor emitió. El comprobante de pago es la otra mitad —la transferencia, el recibo, el
-- echeq— y responde otra pregunta. Mezclarlos en la misma bolsa haría que el panel de una compra
-- mostrara cuatro imágenes sin poder decir cuál prueba qué, y que «esta compra no tiene respaldo»
-- dejara de significar nada. Por eso una columna `tipo`, y no una tabla nueva: es el mismo archivo,
-- en el mismo bucket, con las mismas políticas; lo único que cambia es qué prueba.
--
-- `pago_cambio_id` lo ata al PAGO concreto, no sólo a la compra: una factura pagada en dos tramos
-- tiene dos comprobantes y cada uno es de su tramo.
--
-- ═══ EL TECHO DEL BUCKET SUBE DE 5 A 25 MB, Y HAY QUE DECIR QUÉ SE PIERDE ═══
--
-- Los 5 MB de 20260825T1000 no eran arbitrarios: son `MAX_BYTES_ADJUNTO`, el techo del circuito de
-- visión que LEE las facturas. El límite del bucket existía para que el error llegara cuando la
-- persona todavía tiene el archivo en la mano y no dos minutos después, en una fila roja.
--
-- Un comprobante de pago NO pasa por ese circuito: nadie lo lee con un modelo, se guarda y se mira.
-- Pero `file_size_limit` es del BUCKET, no del prefijo: subirlo a 25 MB también deja entrar una
-- factura de 20 MB que el circuito después rechaza. LO QUE SE PIERDE es esa segunda red; la primera
-- —`archivoEntra` en el formulario y el techo del propio circuito— sigue en pie y sigue dando el
-- error temprano. Se acepta porque el dueño pidió 25 MB y porque la red que queda es la que habla.
--
-- ═══ LA RUTA: `pagos/<fila_compras>/<uuid>.<ext>` ═══
--
-- La policy de subida de 20260825T1000 exige que la primera carpeta sea `auth.uid()`. Con esa regla
-- la ruta pedida rebota, así que la policy se amplía con una segunda forma. Lo que la regla de la
-- carpeta protegía —que nadie escriba encima del archivo de otro— lo sigue protegiendo el nombre:
-- es un uuid nuevo por archivo, se sube con `upsert:false` y el bucket NO tiene policy de UPDATE
-- para `authenticated`, así que un objeto existente no se puede reemplazar desde la web.
--
-- ═══ POR QUÉ LA INSERCIÓN ES POR RPC Y NO POR UN GRANT ═══
--
-- `compra_adjunto` no le da INSERT a `authenticated` a propósito, y la migración que la creó lo
-- explica: «poder insertar una fila acá sería poder afirmar que existe un respaldo que nadie subió».
-- Eso no cambia. La RPC es `security definer`, chequea `es_administracion()`, exige que la fila de
-- Compras exista y anota SIEMPRE quién y cuándo — nadie puede declarar un comprobante a nombre de
-- otro ni apuntar la fila a un objeto arbitrario del bucket.
--
-- ═══ EL LÍMITE CONOCIDO ═══
--
-- Cuando la fila de Compras tiene número de comprobante, el vínculo es `compra_clave` y no se mueve.
-- Cuando NO lo tiene —219 de 960 filas al 15/09: subcontratistas, efectivo, sueldos, impuestos— lo
-- único que hay es `fila_compras`, que es una POSICIÓN: si alguien inserta una fila arriba en el
-- Sheet, el comprobante de pago queda apuntando a la fila de al lado. Es la misma limitación que ya
-- tiene `compra_adjunto.fila_compras` y no se resuelve acá; se declara.
--
-- ORDEN: después de 20260916T1700 (necesita `compra_obra_cambio` para la referencia).

set local lock_timeout = '5s';

-- ─── 1 · el bucket acepta 25 MB ─────────────────────────────────────────────────────────────────
update storage.buckets set file_size_limit = 26214400 where id = 'comprobantes';

-- ─── 2 · la ruta `pagos/<fila>/<uuid>.<ext>` puede subirse ──────────────────────────────────────
drop policy if exists comprobantes_sube_administracion on storage.objects;
create policy comprobantes_sube_administracion on storage.objects for insert to authenticated
  with check (
    bucket_id = 'comprobantes'
    and (select public.es_administracion())
    and (
      -- La factura que carga la pantalla: en la carpeta de quien la sube (20260825T1000).
      (storage.foldername(name))[1] = (select auth.uid()::text)
      -- El comprobante de un pago: `pagos/<fila de Compras>/<uuid>.<ext>`. La segunda carpeta tiene
      -- que ser un número: sin eso, `pagos/` sería una carpeta libre donde cualquiera escribe.
      or ((storage.foldername(name))[1] = 'pagos' and (storage.foldername(name))[2] ~ '^[0-9]+$')
    )
  );

-- ─── 3 · qué prueba cada papel ──────────────────────────────────────────────────────────────────
alter table public.compra_adjunto
  add column if not exists tipo text not null default 'factura',
  add column if not exists pago_cambio_id uuid references public.compra_obra_cambio (id) on delete set null;

alter table public.compra_adjunto drop constraint if exists compra_adjunto_tipo_chk;
alter table public.compra_adjunto add constraint compra_adjunto_tipo_chk
  check (tipo in ('factura', 'pago'));
-- Un comprobante de pago SIEMPRE dice de qué fila es: sin eso no se puede mostrar en ningún lado.
alter table public.compra_adjunto drop constraint if exists compra_adjunto_pago_con_fila;
alter table public.compra_adjunto add constraint compra_adjunto_pago_con_fila
  check (tipo <> 'pago' or fila_compras is not null);

create index if not exists compra_adjunto_pago_idx
  on public.compra_adjunto (fila_compras) where tipo = 'pago';

comment on column public.compra_adjunto.tipo is
  'factura = el papel que emitió el proveedor · pago = la transferencia, el recibo o el echeq que prueba que la plata salió.';
comment on column public.compra_adjunto.pago_cambio_id is
  'El pago concreto (compra_obra_cambio tipo=pago) que este comprobante respalda. Una factura pagada en dos tramos tiene dos.';

-- Una columna nueva NACE SIN PERMISO y el grant de esta tabla es POR COLUMNA: sin esto la pantalla
-- las leería como un error de permisos, no como vacías.
grant select (tipo, pago_cambio_id) on public.compra_adjunto to authenticated;

-- ─── 4 · la puerta de la app ────────────────────────────────────────────────────────────────────
create or replace function public.compra_pago_comprobante_registrar(
  p_fila integer, p_cambio_id uuid, p_storage_path text, p_nombre text, p_media_type text, p_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clave text;
  v_id    uuid;
begin
  if not public.es_administracion() then
    return jsonb_build_object('ok', false, 'error', 'sin permiso para cargar comprobantes de pago');
  end if;
  if coalesce(p_bytes, 0) <= 0 or p_bytes > 26214400 then
    return jsonb_build_object('ok', false, 'error', 'el archivo está vacío o pasa los 25 MB');
  end if;
  if coalesce(p_media_type, '') not in ('application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif') then
    return jsonb_build_object('ok', false, 'error', 'sólo PDF, JPG, PNG o HEIC');
  end if;
  -- LA RUTA TIENE QUE SER LA DE ESTA FILA. Sin esto, alguien podría registrar contra la fila 57 un
  -- objeto subido bajo otra, y el panel mostraría el comprobante de otro pago como prueba de éste.
  if p_storage_path is distinct from format('pagos/%s/%s', p_fila, split_part(p_storage_path, '/', 3))
     or split_part(p_storage_path, '/', 3) = '' then
    return jsonb_build_object('ok', false, 'error', 'la ruta del archivo no corresponde a esta compra');
  end if;

  select clave into v_clave from public.compra_sheet where fila = p_fila;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'esa fila ya no está en Compras');
  end if;
  if p_cambio_id is not null and not exists (
    select 1 from public.compra_obra_cambio where id = p_cambio_id and fila = p_fila and tipo = 'pago'
  ) then
    return jsonb_build_object('ok', false, 'error', 'ese pago no es de esta compra');
  end if;

  insert into public.compra_adjunto
    (compra_clave, fila_compras, storage_path, nombre, media_type, bytes, origen, tipo, pago_cambio_id,
     vinculado_por, vinculado_por_usuario, vinculado_at)
  values
    -- `match_manual`: lo imputó una persona de Administración contra esta fila, en el mismo acto de
    -- subirlo. No es un cálculo ni un hecho del bot, y la tabla ya distingue las tres cosas.
    (v_clave, p_fila, p_storage_path, p_nombre, p_media_type, p_bytes, 'web', 'pago', p_cambio_id,
     'match_manual', (select auth.uid()), now())
  returning id into v_id;

  return jsonb_build_object('ok', true, 'adjunto_id', v_id);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'ese archivo ya estaba registrado');
end;
$$;

revoke all on function public.compra_pago_comprobante_registrar(integer, uuid, text, text, bigint) from public, anon;
grant execute on function public.compra_pago_comprobante_registrar(integer, uuid, text, text, bigint) to authenticated;

comment on function public.compra_pago_comprobante_registrar(integer, uuid, text, text, bigint) is
  'Registra el comprobante de un PAGO de una fila de Compras (bucket comprobantes, prefijo pagos/<fila>/). '
  'Anota siempre quién y cuándo. La inserción directa en compra_adjunto sigue sin estar concedida.';
