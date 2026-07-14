#!/usr/bin/env node
// Registro del endpoint público actual del OS interactivo.
//
// El motor interactivo (:8790) no es alcanzable desde internet entrante (el
// firewall del server solo deja SSH). El único camino hacia adentro es un túnel
// SALIENTE (cloudflared). Ese túnel tiene una URL que cambia cada vez que se
// reinicia. Para que el frente estable (Vercel) y la extensión no dependan de
// esa URL volátil, la publicamos acá, en una tabla de Supabase, y quien quiera
// hablar con el OS la lee primero.
//
// Uso:
//   node orquestador/scripts/os-endpoint.mjs ensure-table
//   node orquestador/scripts/os-endpoint.mjs set https://xxxx.trycloudflare.com
//   node orquestador/scripts/os-endpoint.mjs get
import { query, closePool } from '../lib/db.mjs'

const KEY = 'interactive_endpoint'

async function ensureTable() {
  await query(`
    create table if not exists public.os_runtime (
      key        text primary key,
      value      text not null,
      updated_at timestamptz not null default now()
    );
    alter table public.os_runtime enable row level security;
  `)
  // Lectura pública (Vercel/extensión leen con la anon key). No es dato sensible:
  // la URL solo dice DÓNDE está el OS; entrar sigue requiriendo el Bearer token.
  await query(`
    do $$
    begin
      if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'os_runtime' and policyname = 'os_runtime_public_read'
      ) then
        create policy os_runtime_public_read on public.os_runtime for select using (true);
      end if;
    end $$;
  `)
  // Supabase exige GRANT a nivel de tabla ADEMÁS de la policy RLS para que el rol
  // anon (Vercel/extensión) pueda leer.
  await query(`grant select on public.os_runtime to anon, authenticated;`)
}

async function set(url) {
  if (!/^https:\/\/\S+$/.test(url)) throw new Error(`URL inválida: ${url}`)
  await ensureTable()
  await query(
    `insert into public.os_runtime (key, value, updated_at) values ($1, $2, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [KEY, url.trim()],
  )
  console.log(`[os-endpoint] publicado: ${url}`)
}

async function get() {
  const { rows } = await query(`select value, updated_at from public.os_runtime where key = $1`, [KEY])
  if (!rows[0]) { console.log('(sin endpoint publicado)'); return }
  console.log(`${rows[0].value}  (actualizado ${rows[0].updated_at.toISOString()})`)
}

const [cmd, arg] = process.argv.slice(2)
try {
  if (cmd === 'ensure-table') await ensureTable()
  else if (cmd === 'set') await set(arg)
  else if (cmd === 'get') await get()
  else { console.error('uso: os-endpoint.mjs <ensure-table|set <url>|get>'); process.exit(2) }
} catch (e) {
  console.error('[os-endpoint] error:', e.message)
  process.exitCode = 1
} finally {
  await closePool()
}
