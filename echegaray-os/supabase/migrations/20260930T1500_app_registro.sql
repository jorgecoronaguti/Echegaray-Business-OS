-- app_registro: EL REGISTRO GENERAL DE LA APP — quién fue a dónde, qué le contestó la app y qué se rompió.
--
-- Caso real 30/09/2026 (Maldonado, jefe): «no anda» + «se mete por una URL vieja». Vercel guarda la ruta
-- y el estado pero NO la identidad, y 5.000 líneas cubren ~4 minutos: reconstruir qué vio una persona
-- llevó una hora y quedó a medias. Esta tabla lo contesta con una consulta
-- (`orquestador/scripts/control-de-fallas.mjs --usuario <quien>`).
--
-- La escribe SÓLO el servidor (middleware, `onRequestError`, `/api/registro-error`) con la clave de
-- servicio. Es interna: RLS sin política + `revoke all` a anon/authenticated. Nadie la lee desde la app.
--
-- TAMAÑO ACOTADO (la base ya tumbó Postgres con 406 MB, 13/09): no se registran prefetch ni estáticos;
-- las textos van recortados en origen; y un pg_cron diario borra navegación > 14 días y errores > 90.

create table if not exists public.app_registro (
  id          bigint generated always as identity primary key,
  en          timestamptz not null default now(),
  tipo        text not null check (tipo in ('navegacion','accion','redireccion','rechazo','error_servidor','error_cliente')),
  perfil_id   uuid,
  rol         text,
  prestada    boolean not null default false,  -- sesión de «entrar como» (la de un administrador mirando)
  metodo      text,
  ruta        text not null,
  consulta    text,
  estado      int,
  destino     text,                             -- Location de una redirección
  dispositivo text check (dispositivo in ('telefono','pc')),
  despliegue  text,                             -- commit de Vercel que contestó
  digest      text,
  mensaje     text,
  detalle     jsonb
);

create index if not exists app_registro_en_idx on public.app_registro (en desc);
create index if not exists app_registro_perfil_idx on public.app_registro (perfil_id, en desc);
create index if not exists app_registro_errores_idx on public.app_registro (en desc) where tipo in ('error_servidor','error_cliente');

alter table public.app_registro enable row level security;
revoke all on public.app_registro from anon, authenticated;
grant select, insert, delete on public.app_registro to service_role;

select cron.schedule(
  'podar-app-registro',
  '15 7 * * *',  -- 04:15 de San Juan
  $$delete from public.app_registro
     where (tipo in ('error_servidor','error_cliente') and en < now() - interval '90 days')
        or (tipo not in ('error_servidor','error_cliente') and en < now() - interval '14 days')$$
);
