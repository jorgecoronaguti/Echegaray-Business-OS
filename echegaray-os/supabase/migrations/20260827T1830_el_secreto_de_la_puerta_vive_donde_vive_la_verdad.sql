-- EL SECRETO DE LA PUERTA DE XSAS, EN POSTGRES Y NO EN UN PANEL.
--
-- ═══ EL PROBLEMA QUE RESUELVE ═══
--
-- `app.ecsas.com.ar/api/xsas` necesita dos cosas para hablar con la puerta de XSAS: DÓNDE está
-- (que ya se resuelve por `os_runtime`, porque el túnel rota) y CON QUÉ SECRETO entra. El secreto
-- vivía únicamente en `~/.config/echegaray-orq/comunicacion.env`, en la VM. Ponerlo del lado de
-- Vercel exige credencial de Vercel; mientras esa credencial no exista, la ruta contesta 503 y XSAS
-- queda desconectado de la app aunque todo lo demás funcione.
--
-- ═══ POR QUÉ ESTO NO BAJA EL NIVEL DE SEGURIDAD ═══
--
-- La app YA tiene `SUPABASE_SERVICE_ROLE_KEY` (es con lo que entra el portal del cliente). Esa clave
-- puede leer y escribir la base entera. El secreto de la puerta sólo autoriza a hablar con XSAS: es
-- estrictamente MENOS poder que el que la app ya tiene. Guardarlo acá no agrega superficie — la
-- superficie es la service role, y ya estaba.
--
-- Lo que sí importa: esta tabla NO es `os_runtime`. `os_runtime` es pública a propósito (la URL sólo
-- dice dónde está el OS, entrar sigue requiriendo secreto). Ésta no tiene una sola policy y no tiene
-- un solo grant a `anon` ni a `authenticated`: la única forma de leerla es con la service role, que
-- pasa por encima de RLS. Una policy de más acá adentro sería una filtración.

create table if not exists public.os_secreto (
  clave         text primary key,
  valor         text not null,
  actualizado_en timestamptz not null default now()
);

alter table public.os_secreto enable row level security;

-- Sin policies: con RLS activa y sin policy, ningún rol que respete RLS lee NADA. `service_role` la
-- saltea por diseño de Supabase; el resto no tiene ni siquiera el privilegio de tabla.
revoke all on public.os_secreto from anon, authenticated;
grant select, insert, update, delete on public.os_secreto to service_role;

comment on table public.os_secreto is
  'Secretos que el frente de Vercel necesita y no puede recibir por variable de entorno. Sólo service_role. Nunca exponer por PostgREST a anon/authenticated.';
