-- Línea A (Personas / Laboral / Seguridad e Higiene, OLA 3): primer dato estructurado
-- real desde la carpeta "ALTAS - BAJAS - HM - EPP - DNI" de Drive (30 legajos reales
-- descubiertos, 3 relevados en profundidad leyendo su documentación real).
--
-- No mezcla conceptos: `personas` es identidad + relación laboral (evidencia real
-- muestra 1 persona = 1 legajo = 1 relación laboral en esta empresa, no se separan en
-- 2 tablas por especulación sin evidencia). `documentacion_legajo` es un concepto
-- distinto -- qué documentos existen por persona -- porque es 1:N y responde una
-- pregunta distinta ("qué falta"), no "quién es esta persona".
-- Asistencia/HH/costo laboral NO se duplican acá -- siguen viviendo en
-- registros_hh/JORNALES (fuentes_datos), por diseño.
create table personas (
  id uuid primary key default gen_random_uuid(),
  nombre_completo text not null,
  dni text,
  cuil text,
  fecha_nacimiento date,
  nacionalidad text,
  fecha_ingreso date,
  fecha_egreso date,
  categoria text,
  especialidad text,
  art text,
  obra_social text,
  convenio_colectivo text,
  retribucion_pactada numeric,
  modalidad_liquidacion text,
  drive_folder_id text unique,
  documentacion_relevada boolean not null default false,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table documentacion_legajo (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references personas(id) on delete cascade,
  tipo_documento text not null check (tipo_documento in ('alta_afip', 'fondo_cese_hm', 'dni_escaneado', 'baja', 'epp')),
  presente boolean not null,
  drive_file_id text,
  fecha_documento date,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (persona_id, tipo_documento)
);

alter table personas enable row level security;
alter table documentacion_legajo enable row level security;

-- Mismo patrón de RLS que el resto del proyecto (lectura abierta a cualquier
-- autenticado, escritura direccion/administracion) -- ver PR5. Se deja registrado
-- como gap explícito en el reporte de este ciclo que `personas` incluye DNI/CUIL/
-- retribución pactada (datos personales sensibles) bajo la misma policy amplia que
-- el resto de las tablas, no una más restrictiva -- decisión heredada, no nueva.
create policy personas_select on personas for select to authenticated using (true);
create policy personas_write on personas for all to authenticated
  using (current_rol() in ('direccion', 'administracion'))
  with check (current_rol() in ('direccion', 'administracion'));

create policy documentacion_legajo_select on documentacion_legajo for select to authenticated using (true);
create policy documentacion_legajo_write on documentacion_legajo for all to authenticated
  using (current_rol() in ('direccion', 'administracion'))
  with check (current_rol() in ('direccion', 'administracion'));

grant select, insert, update, delete on public.personas to authenticated;
grant select, insert, update, delete on public.documentacion_legajo to authenticated;
