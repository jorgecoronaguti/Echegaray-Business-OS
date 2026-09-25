-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL PORTAL DEL CLIENTE ENTRA CON UN ENLACE PERSONAL, NO CON EL MAIL A SECAS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Medido el 25/09/2026: `/portal/login` abría la sesión de un cliente con sólo escribir un mail
-- habilitado — sin código, sin clave, sin enlace. Quien supiera (o adivinara) el correo de un contacto
-- veía las obras, las facturas, los pagos y los documentos de ese cliente. Se probó con el acceso
-- propio del dueño (jorge.o.corona@gmail.com → Inter Motor): una línea de texto y adentro.
--
-- El proyecto no tiene SMTP en la web (ver usuariosActions) y la cola `mail_saliente` no tiene el
-- worker corriendo, así que un código por mail hoy no llegaría. La puerta pasa a ser un ENLACE
-- PERSONAL por acceso: Administración lo copia desde la ficha del cliente («Copiar enlace de ingreso»)
-- y se lo manda a esa persona. El enlace lleva 32 bytes al azar; en la base se guarda SÓLO su SHA-256,
-- así que ni leyendo la tabla se puede armar un enlace. Generar uno nuevo invalida el anterior;
-- revocar el acceso lo invalida también (la ruta exige `revocado_at is null`).
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.
alter table public.cliente_acceso
  add column if not exists enlace_hash text,
  add column if not exists enlace_creado_at timestamptz,
  add column if not exists enlace_creado_por uuid references auth.users (id) on delete set null;

create unique index if not exists cliente_acceso_enlace_hash_unico
  on public.cliente_acceso (enlace_hash) where enlace_hash is not null;

comment on column public.cliente_acceso.enlace_hash is
  'SHA-256 (hex) del enlace personal de ingreso al portal. El enlace en claro no se guarda en ningún lado. '
  'Lo escribe sólo la clave de servicio, después de comprobar ve_economia() (accesosActions.enlaceDeIngreso).';
