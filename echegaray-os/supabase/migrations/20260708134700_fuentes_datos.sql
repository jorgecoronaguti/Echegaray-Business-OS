-- Continuidad Operacional de Datos y Conocimiento (dependencia transversal antes de
-- OLA 3): registro vivo de fuentes de la empresa real (Drive, sistemas externos,
-- capacidades propias del OS), con su frescura/cobertura -- Track B / punto 8.
-- El Motor de Confianza y el Motor de Decisiones deben poder consultar esto antes
-- de responder. No reemplaza ninguna fuente: las cataloga.
create table fuentes_datos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  tipo_archivo text not null check (tipo_archivo in (
    'google_sheet', 'google_doc', 'google_form', 'pdf_periodico', 'carpeta_documental',
    'excel_macro', 'excel_estatico', 'interno_os', 'externo_no_conectado'
  )),
  drive_file_id text,
  drive_url text,
  proceso_negocio text not null,
  area text not null,
  responsable_probable text,
  frecuencia_actualizacion text not null check (frecuencia_actualizacion in (
    'diaria', 'semanal', 'quincenal', 'mensual', 'por_evento', 'esporadica', 'desconocida'
  )),
  vigencia text not null check (vigencia in ('vigente', 'obsoleta', 'desconocida')),
  fuente_primaria boolean not null,
  naturaleza_dato text not null check (naturaleza_dato in (
    'confirmado', 'conciliado', 'observado', 'calculado', 'estimado', 'inferido', 'conflictivo', 'sin_dato'
  )),
  cobertura_desde date,
  cobertura_hasta date,
  destino_supabase text,
  capability_dependiente text,
  criticidad text not null check (criticidad in ('alta', 'media', 'baja')),
  mecanismo_integracion text not null check (mecanismo_integracion in (
    'sincronizacion', 'ingesta_incremental', 'lectura_periodica', 'eventos', 'api', 'webhook',
    'extraccion_documental', 'procesamiento_batch', 'interfaz_propia', 'convivencia_temporal',
    'reemplazo_progresivo', 'mantenimiento_documento', 'hibrido', 'no_conectado'
  )),
  duplicada_de uuid references fuentes_datos(id) on delete set null,
  conflicto_con text,
  ultima_lectura timestamptz,
  ultima_sincronizacion_exitosa timestamptz,
  estado text not null default 'fuente_no_disponible' check (estado in (
    'actualizado', 'atrasado', 'error', 'cobertura_parcial', 'conflicto', 'fuente_no_disponible'
  )),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table fuentes_datos enable row level security;

create policy fuentes_datos_select on fuentes_datos for select to authenticated using (true);

create policy fuentes_datos_write on fuentes_datos
  for all to authenticated
  using (current_rol() in ('direccion', 'administracion'))
  with check (current_rol() in ('direccion', 'administracion'));

grant select, insert, update, delete on public.fuentes_datos to authenticated;

create trigger fuentes_datos_set_updated_at before update on fuentes_datos
  for each row execute function set_updated_at();
