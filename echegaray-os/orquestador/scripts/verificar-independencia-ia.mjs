#!/usr/bin/env node
// ¿EL OS SIGUE SIENDO DEL OS? — el control ejecutable de la independencia de la inteligencia.
//
// El dueño lo pidió el 25/08/2026 en una frase: «Claude Code desarrolla el OS, pero NO es parte de
// su runtime» y «los agentes pertenecen al Echegaray Business OS, no a Anthropic». Eso no es un
// documento: o se puede verificar corriendo algo, o es una afirmación sin evidencia.
//
//   node orquestador/scripts/verificar-independencia-ia.mjs
//
// NO GASTA UN TOKEN. Los escenarios que necesitan un proveedor usan un doble que devuelve el error
// que se quiere probar. Lo que mira la base y los servicios se saltea solo si no están disponibles,
// y lo dice — un control que no pudo mirar no puede decir «está bien».

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ═══ ESTE CONTROL NO ENSUCIA LA CONTABILIDAD QUE OTROS LEEN (26/08/2026) ═══
//
// Los escenarios de degradación usan dobles que devuelven el error que se quiere probar. Está bien
// —no gasta un token—, pero esas llamadas simuladas se guardaban en `orq.chat_cost` junto a las de
// verdad: cada corrida agregaba cuatro fallos y el reporte de costos terminaba diciendo que el
// ruteo del Director falla 11 de 12 veces. Una afirmación falsa producida por el propio control.
// Medido: 14 fallos antes de correrlo, 18 después.
process.env.ORQ_IA_SIN_REGISTRO = '1'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const resultados = []
const anotar = (ok, titulo, detalle) => { resultados.push({ ok, titulo, detalle }); return ok }
const saltear = (titulo, motivo) => resultados.push({ ok: null, titulo, detalle: motivo })

/** Los .mjs/.ts del OS, sin tests ni dependencias. */
function fuentes(dir, salida = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue
    const r = join(dir, e)
    if (statSync(r).isDirectory()) fuentes(r, salida)
    else if (/\.(mjs|ts|tsx)$/.test(e) && !/\.test\./.test(e)) salida.push(r)
  }
  return salida
}
// ESTE CONTROL SE EXCLUYE A SÍ MISMO: su código CONTIENE los patrones que busca —es lo que lo hace
// un control— y sin esto se acusa solo en cada corrida. Cualquier otro archivo que los tenga es un
// hallazgo de verdad.
const YO = fileURLToPath(import.meta.url)
const ARCHIVOS = [join(RAIZ, 'orquestador'), join(RAIZ, 'src')].flatMap((d) => fuentes(d)).filter((f) => f !== YO)

/** El código sin comentarios: un comentario que NOMBRA `claude` no es una dependencia de `claude`. */
function codigo(ruta) {
  return readFileSync(ruta, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')
}

// ── 1 · NADA DEL RUNTIME INVOCA CLAUDE CODE ──────────────────────────────────────────────────
// La excepción declarada es `engines/claude-cli.mjs`: es el BUILDER, el motor con el que el OS se
// construye a sí mismo, y sólo lo usa el handler `code_change`. Que exista está bien; que lo use el
// negocio, no.
{
  const culpables = ARCHIVOS
    .filter((f) => !f.endsWith('engines/claude-cli.mjs'))
    .filter((f) => /\bclaude\s+(-p|remote-control)|CLAUDE_BIN|npx\s+claude\b/.test(codigo(f)))
    .map((f) => f.replace(RAIZ + '/', ''))
  anotar(culpables.length === 0, 'Ningún módulo del OS invoca el binario de Claude Code',
    culpables.length ? culpables.join(', ') : `${ARCHIVOS.length} archivos revisados · única excepción: engines/claude-cli.mjs (Builder)`)
}

// ── 2 · UNA SOLA PUERTA HACIA EL PROVEEDOR ───────────────────────────────────────────────────
//
// ═══ EL AGUJERO QUE ESTE CONTROL TUVO HASTA HOY (26/08/2026) ═══
//
// Buscaba únicamente la URL —`api.anthropic.com`— y daba verde. Pero al proveedor se llega de DOS
// formas, y la otra no escribe la URL en ningún lado: `new Anthropic()` del SDK oficial la lleva
// adentro. `lib/web-search.mjs` hace exactamente eso desde hace tiempo, con su propio modelo
// hardcodeado, sin registrar costo, sin mirar `estado-cerebro` y sin breaker — y pasaba el control
// sin ser vista. El guardián tenía un agujero del tamaño exacto de la dependencia que debía
// encontrar.
//
// Ahora se buscan las dos puertas: la URL y el SDK. Un control que sólo mira una de las dos formas
// de entrar no está verificando la puerta, está verificando un cartel.
{
  const permitidos = ['lib/ia/proveedores/anthropic.mjs', 'engines/anthropic-api.mjs']
  const PUERTAS = /api\.anthropic\.com|generativelanguage|api\.openai\.com|@anthropic-ai\/sdk|from ['"]openai['"]/
  const culpables = ARCHIVOS
    .filter((f) => !permitidos.some((p) => f.endsWith(p)))
    .filter((f) => PUERTAS.test(codigo(f)))
    .map((f) => f.replace(RAIZ + '/', ''))
  anotar(culpables.length === 0, 'Nadie llama a un proveedor por fuera de la capa `lib/ia`',
    culpables.length ? `POR FUERA DE LA PUERTA: ${culpables.join(', ')}` : 'sólo el proveedor y el port del Work Fabric')
}

// ── 3 · EL RAZONADOR DEL NEGOCIO NO ES CLAUDE CODE ───────────────────────────────────────────
{
  const { loadConfig } = await import('../lib/config.mjs')
  const cfg = loadConfig()
  anotar(cfg.AI_ENGINE_DEFAULT === 'anthropic-api',
    'El razonador por defecto del negocio es la API, no el CLI',
    `AI_ENGINE_DEFAULT=${cfg.AI_ENGINE_DEFAULT}`)
}

// ── 4 · CAMBIAR DE MODELO NO CAMBIA PERMISOS ─────────────────────────────────────────────────
// El invariante del mandato. Las herramientas de un agente salen de `orq.agents`, del lado del OS.
// La puerta hacia el modelo no puede ni leerlas.
{
  const puerta = codigo(join(RAIZ, 'orquestador/lib/ia/cliente.mjs'))
  const toca = /allowed_tools|disallowed_tools|orq\.agents|permiso/i.test(puerta)
  anotar(!toca, 'La puerta hacia el modelo no lee ni otorga permisos',
    toca ? 'cliente.mjs menciona permisos: un cambio de proveedor podría cambiar capacidades' : 'los permisos viven en orq.agents')
}

// ── 5 · CON EL PROVEEDOR CAÍDO, EL CHAT DEGRADA EN VEZ DE ROMPERSE ───────────────────────────
{
  const { crearRazonadorDeRuteo } = await import('../comunicacion/razonar-ruteo.mjs')
  const caido = async () => ({ ok: false, status: 503, text: async () => '' })
  const r = crearRazonadorDeRuteo({ apiKey: 'x', fetchImpl: caido })
  const salida = await r('lo que sea', [{ slug: 'cfo', titulo: 'CFO', descripcion: 'plata' }])
  anotar(salida === null, 'Con el proveedor caído el Director degrada (no rompe la conversación)',
    salida === null ? 'devuelve null y se muestra el catálogo' : `devolvió ${salida}`)
}

// ── 6 · UN BUG NUESTRO NO SE REINTENTA ───────────────────────────────────────────────────────
{
  const { pedirTexto } = await import('../lib/ia/cliente.mjs')
  let llamadas = 0
  try {
    await pedirTexto({
      mensajes: [{ role: 'user', content: 'x' }], apiKey: 'x', agente: 'control', funcion: 'autotest',
      fetchImpl: async () => { llamadas++; return { ok: false, status: 422, text: async () => 'malformado' } },
    })
  } catch { /* se espera */ }
  anotar(llamadas === 1, 'Un pedido mal armado se intenta UNA vez (no se esconde con reintentos)',
    `${llamadas} llamada(s)`)
}

// ── 7 · LOS SERVICIOS EN PRODUCCIÓN CORREN CON EL RAZONADOR CORRECTO ─────────────────────────
{
  try {
    const linea = execSync(
      'journalctl --user -u echegaray-orq-worker -n 200 --no-pager -o cat 2>/dev/null | grep "daemon iniciado" | tail -1',
      { encoding: 'utf8', shell: '/bin/bash' },
    ).trim()
    if (!linea) saltear('El worker en producción declara su razonador', 'no hay línea de arranque en el journal')
    else {
      const j = JSON.parse(linea)
      anotar(j.razonador === 'anthropic-api', 'El worker en producción declara su razonador',
        `razonador=${j.razonador} · engine_legado=${j.engine_legado ?? 'null'}`)
    }
  } catch (e) { saltear('El worker en producción declara su razonador', String(e.message).slice(0, 80)) }
}

// ── 8 · NINGÚN AGENTE DE NEGOCIO DEPENDE DEL CLI ─────────────────────────────────────────────
// El Builder tiene nombre y apellido: `implementer` y `software-architect` construyen el propio OS,
// y que usen Claude Code es correcto. Cualquier OTRO agente con `claude-cli` es una dependencia del
// negocio con la cuota de una herramienta de desarrollo — que es justo lo que no puede pasar.
const BUILDERS = new Set(['implementer', 'software-architect'])
{
  try {
    const { query, closePool } = await import('../lib/db.mjs')
    const { rows } = await query(
      `select slug from orq.agents where enabled and default_engine = 'claude-cli' order by slug`)
    const intrusos = rows.map((r) => r.slug).filter((s) => !BUILDERS.has(s))
    anotar(intrusos.length === 0, 'Ningún agente de NEGOCIO razona con Claude Code',
      intrusos.length ? `dependen del CLI: ${intrusos.join(', ')}` : `sólo los dos del Builder: ${[...BUILDERS].join(', ')}`)
    await closePool()
  } catch (e) { saltear('Ningún agente de NEGOCIO razona con Claude Code', `sin base: ${String(e.message).slice(0, 60)}`) }
}

// ── 9 · EL RAZONADOR NO PUEDE ESCRIBIR ───────────────────────────────────────────────────────
// «Un fallback jamás puede obtener más acceso que el agente original». Acá se verifica la raíz de
// eso: los handlers que razonan le pasan al motor una lista BLANCA de sólo lectura, escrita en el
// código del OS. Un modelo distinto —o un proveedor distinto— recibe exactamente la misma lista.
{
  const HANDLERS = ['specialist', 'plan', 'direction', 'consolidate']
  const malos = HANDLERS.filter((h) => {
    const src = codigo(join(RAIZ, `orquestador/handlers/${h}.mjs`))
    const m = src.match(/allowedTools:\s*'([^']*)'/)
    if (!m) return true
    return m[1].split(',').some((t) => !['Read', 'Glob', 'Grep'].includes(t.trim()))
  })
  anotar(malos.length === 0, 'Los handlers que razonan sólo autorizan lectura (fail-closed)',
    malos.length ? `permiten algo más: ${malos.join(', ')}` : 'Read, Glob y Grep en los cuatro')
}

// ── informe ──────────────────────────────────────────────────────────────────────────────────
console.log('\nINDEPENDENCIA DE LA INTELIGENCIA DEL OS\n')
for (const r of resultados) {
  const marca = r.ok === null ? '·' : r.ok ? '✔' : '✖'
  console.log(`  ${marca} ${r.titulo}`)
  console.log(`      ${r.detalle}`)
}
const fallan = resultados.filter((r) => r.ok === false)
const salteados = resultados.filter((r) => r.ok === null)
console.log(`\n${resultados.length - fallan.length - salteados.length} verificados · ${fallan.length} fallan · ${salteados.length} no se pudieron mirar`)
if (salteados.length) console.log('Un control que no pudo mirar NO dice «está bien».')
process.exit(fallan.length ? 1 : 0)
