#!/usr/bin/env node
// Registro del endpoint público actual del OS interactivo.
//
// El motor interactivo (:8790) escucha en LOOPBACK, así que no es alcanzable desde internet
// entrante. No lo cierra un firewall —este server no tiene uno que filtre: 22, 80 y 443 están
// abiertos—: lo cierra el bind, que es la defensa que no depende de una regla en otro lado. El
// único camino hacia adentro es un túnel SALIENTE (cloudflared), cuya URL cambia cada vez que se
// reinicia. Para que el frente estable (Vercel) y la extensión no dependan de
// esa URL volátil, la publicamos acá, en una tabla de Supabase, y quien quiera
// hablar con el OS la lee primero.
//
// Uso:
//   node orquestador/scripts/os-endpoint.mjs ensure-table
//   node orquestador/scripts/os-endpoint.mjs set https://xxxx.trycloudflare.com [clave]
//   node orquestador/scripts/os-endpoint.mjs get [clave]
//
// Hay DOS endpoints y no uno: `interactive_endpoint` (el motor interactivo, :8790, que usan la
// extensión y `/api/os/*`) y `xsas_endpoint` (la puerta única de XSAS, :8791, que usa `/api/xsas`).
// Comparten tabla y mecanismo; no comparten puerto ni autenticación, y por eso no comparten clave.
import { query, closePool } from '../lib/db.mjs'

const CLAVE_POR_DEFECTO = 'interactive_endpoint'
/** Las claves válidas, declaradas: un typo en el script del túnel publicaba un endpoint que nadie
 *  leía nunca, y el síntoma era «XSAS no contesta desde la app» sin nada roto a la vista. */
const CLAVES = new Set([CLAVE_POR_DEFECTO, 'xsas_endpoint'])

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

async function set(url, clave = CLAVE_POR_DEFECTO) {
  if (!/^https:\/\/\S+$/.test(url)) throw new Error(`URL inválida: ${url}`)
  if (!CLAVES.has(clave)) throw new Error(`clave desconocida: ${clave} (válidas: ${[...CLAVES].join(', ')})`)
  await ensureTable()
  await query(
    `insert into public.os_runtime (key, value, updated_at) values ($1, $2, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [clave, url.trim()],
  )
  console.log(`[os-endpoint] publicado ${clave}: ${url}`)
}

async function get(clave = CLAVE_POR_DEFECTO) {
  const { rows } = await query(`select value, updated_at from public.os_runtime where key = $1`, [clave])
  if (!rows[0]) { console.log('(sin endpoint publicado)'); return }
  console.log(`${rows[0].value}  (actualizado ${rows[0].updated_at.toISOString()})`)
}

const [cmd, arg, clave] = process.argv.slice(2)
try {
  if (cmd === 'ensure-table') await ensureTable()
  else if (cmd === 'set') await set(arg, clave || CLAVE_POR_DEFECTO)
  else if (cmd === 'get') await get(arg || CLAVE_POR_DEFECTO)
  else { console.error('uso: os-endpoint.mjs <ensure-table|set <url> [clave]|get [clave]>'); process.exit(2) }
} catch (e) {
  console.error('[os-endpoint] error:', e.message)
  process.exitCode = 1
} finally {
  await closePool()
}
