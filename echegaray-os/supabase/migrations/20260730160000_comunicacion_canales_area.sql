-- CANALES ↔ ÁREA OPERATIVA. La pieza que hace que un canal nuevo no exija código nuevo.
--
-- Cada canal privado de Mattermost ES un contexto operativo del Business OS. El Director
-- usa esta tabla para saber de qué se está hablando cuando nadie reclamó el mensaje: en el
-- canal Compras, "generar orden de compra" va a Compras IA sin que ninguna capa conozca la
-- palabra "compra". Agregar un área es INSERTAR UNA FILA, no desplegar.
--
-- El área es la clave canónica de public.area_canonica, que ya gobierna el resto del OS
-- (biblioteca, egresos, scorecard). No se inventa una taxonomía paralela.
-- ADITIVA y AISLADA en el schema `comunicacion`.

create table if not exists comunicacion.canales_area (
  id            bigint generated always as identity primary key,
  plataforma    text not null default 'mattermost',
  channel_id    text not null,
  canal_nombre  text not null,          -- display, para leer la auditoría sin ir a MM
  area_clave    text not null references public.area_canonica(clave),
  activo        boolean not null default true,
  creado_at     timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  unique (plataforma, channel_id)
);

-- VARIOS canales pueden compartir área a propósito: "Asistencia" y "Personal" son los dos
-- contextos operativos del área `personas`, y el equipo puede querer salas separadas. Lo
-- único que tiene que ser único es el canal: la resolución va canal → área, nunca al revés.

create index if not exists canales_area_lookup_idx
  on comunicacion.canales_area (plataforma, channel_id) where activo;

comment on table comunicacion.canales_area is
  'Binding canal de Mattermost → área canónica del OS. Es el DATO que reemplaza al ruteo por código: el Director lee de acá el contexto operativo del canal. Agregar un área nueva es insertar una fila.';
