-- Reportes automáticos y comunicaciones (skill reportes-automaticos-y-comunicaciones,
-- directiva de Jorge 2026-07-10). Un tipo de reporte = una fila en definiciones +
-- un generador en código; cada generación queda en el historial con contenido,
-- confianza declarada y estado de entrega. Canales externos (email/WhatsApp)
-- preparados en el modelo pero NO activos: primero publicación dentro del OS.

create table reportes_definiciones (
  id uuid primary key default gen_random_uuid(),
  clave text unique not null,
  nombre text not null,
  objetivo text not null,
  audiencia text not null,
  dominio text not null,
  frecuencia text not null check (frecuencia in ('diario','semanal','mensual','bajo_demanda','por_condicion')),
  dia_hora text,
  periodo_cubierto text not null,
  fuentes text[] not null default '{}',
  nivel_detalle text not null default 'resumen',
  formato text not null default 'os',
  canal text not null default 'os' check (canal in ('os','email','pdf','gdoc','whatsapp','telegram','slack')),
  responsable text,
  condicion_envio text,
  confianza_minima text,
  si_faltan_datos text not null default 'publicar_con_gaps_declarados',
  activo boolean not null default true,
  creado_por uuid references perfiles(id) default auth.uid(),
  actualizado_por uuid references perfiles(id),
  actualizado_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table reportes_generados (
  id uuid primary key default gen_random_uuid(),
  definicion_id uuid not null references reportes_definiciones(id) on delete cascade,
  periodo_desde date not null,
  periodo_hasta date not null,
  contenido jsonb not null,
  confianza jsonb not null,
  fuentes_usadas text[] not null default '{}',
  canal text not null default 'os',
  estado_entrega text not null default 'publicado' check (estado_entrega in ('generado','publicado','enviado','fallido')),
  generado_por text not null default 'on-demand',
  creado_por uuid references perfiles(id) default auth.uid(),
  actualizado_por uuid references perfiles(id),
  actualizado_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reportes_generados_definicion_idx on reportes_generados(definicion_id, created_at desc);

alter table reportes_definiciones enable row level security;
alter table reportes_generados enable row level security;

create policy "lectura_autenticados" on reportes_definiciones for select to authenticated using (true);
create policy "escritura_direccion" on reportes_definiciones for all to authenticated
  using (current_rol() = 'direccion') with check (current_rol() = 'direccion');

create policy "lectura_autenticados" on reportes_generados for select to authenticated using (true);
create policy "generacion_roles_gestion" on reportes_generados for insert to authenticated
  with check (current_rol() in ('direccion','administracion','operaciones'));
create policy "actualizacion_gestion" on reportes_generados for update to authenticated
  using (current_rol() in ('direccion','administracion'));

create trigger trg_actualizado_en before update on reportes_definiciones for each row execute function set_actualizado_en();
create trigger trg_actualizado_en before update on reportes_generados for each row execute function set_actualizado_en();

insert into reportes_definiciones (clave, nombre, objetivo, audiencia, dominio, frecuencia, dia_hora, periodo_cubierto, fuentes, canal, responsable) values
  ('diario-direccion', 'Reporte Diario de Dirección',
   'Que Dirección arranque el día sabiendo qué requiere decisión: acciones vencidas, caja inmediata y hallazgos del sistema.',
   'direccion', 'direccion', 'diario', '07:00', 'hoy_y_vencidos',
   array['acciones','backlog_autonomo','calendario_sheet','fuentes_datos'], 'os', 'Jorge'),
  ('semanal-obras', 'Reporte Semanal de Obras',
   'Estado de avance, HH y desvíos de las obras activas para la reunión semanal.',
   'operaciones', 'obras_produccion', 'semanal', 'lunes 07:00', 'ultima_semana',
   array['obras','actividades_semanales','registros_hh','acciones'], 'os', 'Operaciones'),
  ('financiero-semanal', 'Reporte Financiero Semanal',
   'Posición de caja, cobros y pagos de los próximos 7 días y vencidos sin ejecutar, desde la fuente de verdad (Sheet Flujo de Caja).',
   'direccion', 'administracion_finanzas', 'semanal', 'lunes 07:30', 'proximos_7_dias',
   array['calendario_sheet','obligaciones','fuentes_datos'], 'os', 'Administración');

-- Mismo patrón que 20260708134500: sin GRANT explícito, RLS nunca llega a
-- evaluarse y la app ve las tablas vacías sin error visible.
grant all on reportes_definiciones to authenticated;
grant select, insert, update on reportes_generados to authenticated;
