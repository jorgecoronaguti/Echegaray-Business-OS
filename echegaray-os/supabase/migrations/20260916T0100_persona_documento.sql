-- ============================================================================
-- EL LEGAJO RECIBE LOS PAPELES QUE EL DUEÑO NOMBRÓ, Y EL CERTIFICADO MÉDICO SABE QUÉ DÍAS CUBRE.
--
-- El dueño, 16/09/2026: «se subió certificado (de licencia) a su carpeta de Drive porque nunca me
-- hiciste ninguna forma de subir documentos a app.ecsas.com.ar de legajos y nada».
--
-- ═══ NO ES UNA TABLA NUEVA ═══
--
-- `persona_documento` ya existe: es `entidad_documento` con `entidad_tipo = 'persona'`
-- (20260910T2320), aplicada en producción y con su bucket privado `documentos-legajo` a 25 MB. El
-- control «Subir documento» del legajo ya escribía ahí. Lo que NO tenía era la lista de papeles que
-- el dueño nombró —certificado médico, alta IERIC, examen médico, EPP, telegrama, contrato— ni la
-- forma de decir QUÉ DÍAS cubre un certificado. Una tercera tabla con las mismas columnas sería
-- una tercera cerradura que se desincroniza y una segunda cola a Drive: se extiende la que hay.
--
-- ═══ EL CERTIFICADO MÉDICO LLEVA DESDE/HASTA ═══
--
-- Es el único papel del legajo que AFIRMA algo sobre días: «no trabajó del 8 al 12 y está
-- justificado». Con las dos fechas el OS puede cruzarlo contra `asistencia_dia` (licencia por
-- enfermedad/accidente) y decir «cubre 4 días» — sin fabricar la licencia: la licencia la declara el
-- jefe, el certificado la RESPALDA. Para los demás papeles las fechas van NULL y el CHECK lo exige:
-- un DNI con «desde/hasta» sería un dato que nadie sabe leer.
--
-- `fecha_documento` es la fecha que dice el papel (la del examen, la del telegrama), distinta de
-- `creado_en`, que es cuándo se subió. Se guarda porque el legajo ordena por la primera y la
-- auditoría por la segunda.
-- ============================================================================

-- ── 1 · LAS CATEGORÍAS DE PERSONA ──────────────────────────────────────────
-- Se agregan las seis del dueño y se conservan las cuatro que ya existían (dni, alta_arca,
-- libreta_ieric, constancia): borrarlas dejaría el CHECK peleado con cualquier fila vieja.
-- Las de obra, cliente y proveedor quedan EXACTAMENTE como estaban.
alter table public.entidad_documento
  drop constraint if exists entidad_documento_categoria_del_tipo;

alter table public.entidad_documento
  add constraint entidad_documento_categoria_del_tipo check (
    (entidad_tipo = 'obra'      and categoria in ('plano','certificado','acta','foto','otro')) or
    (entidad_tipo = 'cliente'   and categoria in ('factura','orden_compra','orden_pago','contrato','otro')) or
    (entidad_tipo = 'proveedor' and categoria in ('factura','remito','presupuesto','otro')) or
    (entidad_tipo = 'persona'   and categoria in ('certificado_medico','dni','alta_ieric','alta_arca','libreta_ieric','examen_medico','epp','telegrama','contrato','constancia','otro'))
  );

-- ── 2 · LAS FECHAS DEL PAPEL ───────────────────────────────────────────────
alter table public.entidad_documento
  add column if not exists fecha_documento date,
  add column if not exists licencia_desde  date,
  add column if not exists licencia_hasta  date;

-- LAS DOS O NINGUNA, Y SÓLO EN UN CERTIFICADO MÉDICO. Un «desde» sin «hasta» no cubre nada y un
-- rango en un telegrama no significa nada: la app lo pregunta en castellano, la base lo cierra.
alter table public.entidad_documento
  drop constraint if exists entidad_documento_licencia_solo_certificado;
alter table public.entidad_documento
  add constraint entidad_documento_licencia_solo_certificado check (
    (licencia_desde is null and licencia_hasta is null)
    or (
      entidad_tipo = 'persona' and categoria = 'certificado_medico'
      and licencia_desde is not null and licencia_hasta is not null
      and licencia_hasta >= licencia_desde
      -- Un certificado de más de un año no es un certificado: es un rango mal tipeado.
      and licencia_hasta <= licencia_desde + 366
    )
  );

comment on column public.entidad_documento.fecha_documento is
  'La fecha que dice el papel (la del examen, la del telegrama). No es creado_en, que es cuándo se subió.';
comment on column public.entidad_documento.licencia_desde is
  'Sólo en un certificado médico de persona: primer día que el certificado respalda. La licencia la declara el jefe en asistencia_dia; el certificado la RESPALDA, no la crea.';
comment on column public.entidad_documento.licencia_hasta is
  'Sólo en un certificado médico de persona: último día que el certificado respalda (inclusive).';

-- La grilla de asistencia pregunta «¿qué certificados de estas personas tocan esta quincena?». Es un
-- solapamiento de rangos sobre pocas filas; el índice parcial es lo que evita barrer todos los
-- planos de todas las obras para contestar.
create index if not exists entidad_documento_certificado_rango_idx
  on public.entidad_documento (entidad_id, licencia_desde, licencia_hasta)
  where entidad_tipo = 'persona' and categoria = 'certificado_medico' and eliminado_en is null;

-- ── 3 · LA PERSONA ABRE LO SUYO ────────────────────────────────────────────
-- La policy de la TABLA ya deja a la persona ver sus filas (`entidad_id = mi_persona_id()`), pero la
-- de STORAGE (`documentos_legajo_lee_lo_suyo`, 20260820T6000) sólo abre objetos cuya primera
-- carpeta es SU persona_id — y lo que sube Administración vive en `<uid>/persona/<persona_id>/…`.
-- Sin esta policy la persona veía el renglón y no podía firmar la URL: una lista de nombres sin
-- nada que abrir. Se agrega al lado; la primera no se toca.
--
-- No se nombra `liquida_sueldos()`: `es_administracion()` la contiene (dirección, administración y
-- jefe de obra desde el 19/08), y nombrarla sería una segunda cerradura que dice lo mismo.
drop policy if exists documentos_legajo_lee_lo_que_le_subieron on storage.objects;
create policy documentos_legajo_lee_lo_que_le_subieron on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documentos-legajo'
    and public.mi_persona_id() is not null
    and exists (
      select 1 from public.entidad_documento d
       where d.bucket = 'documentos-legajo' and d.storage_path = storage.objects.name
         and d.entidad_tipo = 'persona' and d.entidad_id = (public.mi_persona_id())::text
         and d.eliminado_en is null
    )
  );

-- ── 4 · GRANTS ─────────────────────────────────────────────────────────────
-- El grant de 20260910T2320 es de TABLA (`grant select, insert on … to authenticated`), así que las
-- tres columnas nuevas nacen con permiso. Se deja dicho para que nadie lo busque: «columna nueva
-- nace sin permiso» vale para los grants POR COLUMNA, como los de proveedor_documento.
