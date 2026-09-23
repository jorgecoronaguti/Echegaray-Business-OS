-- CADA UNO ELIGE QUÉ AVISOS RECIBE Y POR DÓNDE (dueño, 23/09/2026: «Mi cuenta › Notificaciones»).
--
-- Hasta hoy la pantalla decía «elegirlo todavía no se puede» porque no había dónde guardarlo. Esto
-- es el dónde: una fila por (usuario, tipo de aviso, canal). SIN FILA = SE AVISA. La preferencia
-- guarda sólo lo que la persona apagó (o volvió a prender): un aviso nuevo que aparezca mañana llega
-- a todos hasta que alguien lo apague, que es el modo de fallar bueno para avisos que piden una firma.
--
-- LOS TIPOS son los que el OS manda HOY (catálogo en `orquestador/lib/notificaciones.mjs`, espejado
-- en `src/features/mi-cuenta/services/notificaciones.ts` con un test que exige que coincidan):
--   efectivo_firma      te entregaron efectivo: confirmá y firmá     (DM a la persona)
--   efectivo_anulacion  se anuló una entrega tuya                    (DM a la persona)
--   efectivo_firmada    alguien firmó la plata que recibió           (DM al dueño)
--   sistema             avisos de operación del OS al dueño          (DM al dueño)
-- LOS CANALES: `mattermost_dm` (el único que hoy manda avisos a personas) y `correo` (reservado: el
-- OS no manda correos de aviso todavía; la pantalla no dibuja un interruptor para él).
--
-- QUIÉN LA RESPETA: `debeAvisar()` en `orquestador/lib/notificaciones.mjs`, que consultan los
-- emisores (`efectivo-avisos.mjs`, `avisar-al-dueno.mjs`), y `public.debe_avisar()` acá para quien
-- pregunte desde SQL.

create table if not exists public.usuario_preferencia_notificacion (
  usuario_id      uuid not null references auth.users (id) on delete cascade,
  tipo            text not null,
  canal           text not null,
  activo          boolean not null default true,
  actualizado_en  timestamptz not null default now(),
  primary key (usuario_id, tipo, canal),
  constraint usuario_preferencia_notificacion_tipo_check
    check (tipo in ('efectivo_firma', 'efectivo_anulacion', 'efectivo_firmada', 'sistema')),
  constraint usuario_preferencia_notificacion_canal_check
    check (canal in ('mattermost_dm', 'correo'))
);

comment on table public.usuario_preferencia_notificacion is
  'Qué avisos quiere recibir cada usuario y por qué canal. Sin fila = se avisa. La escribe la propia persona desde Mi cuenta › Notificaciones; la leen los emisores (orquestador/lib/notificaciones.mjs).';

alter table public.usuario_preferencia_notificacion enable row level security;

-- CADA UNO LO SUYO: leer, crear, cambiar y borrar sólo las filas con su propio uid. Ni Dirección ve
-- las de otro desde acá: si hace falta auditar, es con la clave de servicio.
drop policy if exists usuario_preferencia_notificacion_propia on public.usuario_preferencia_notificacion;
create policy usuario_preferencia_notificacion_propia on public.usuario_preferencia_notificacion
  for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

grant select, insert, update, delete on public.usuario_preferencia_notificacion to authenticated;
grant select, insert, update, delete on public.usuario_preferencia_notificacion to service_role;

-- ¿HAY QUE AVISARLE A ESTE USUARIO ESTO POR ACÁ? `true` cuando no dijo nada: la ausencia de fila es
-- «sí». Es `security definer` para que el orquestador y cualquier trigger puedan preguntar por otro
-- usuario sin abrir la tabla entera a la sesión.
create or replace function public.debe_avisar(p_usuario uuid, p_tipo text, p_canal text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select activo from public.usuario_preferencia_notificacion
      where usuario_id = p_usuario and tipo = p_tipo and canal = p_canal),
    true)
$$;
revoke all on function public.debe_avisar(uuid, text, text) from public, anon;
grant execute on function public.debe_avisar(uuid, text, text) to authenticated, service_role;
