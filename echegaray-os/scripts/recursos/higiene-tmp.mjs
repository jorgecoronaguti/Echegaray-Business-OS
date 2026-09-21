#!/usr/bin/env node
// HIGIENE DE /tmp — los temporales de desarrollo que nadie borra.
//
// El 20/09/2026 la herramienta Bash de Claude Code murió entera: hasta `echo hola` devolvía exit 1
// sin una letra de salida, en la sesión y en los subagentes. No era memoria: `/tmp` es tmpfs CON
// CUOTA POR USUARIO (`usrquota`, viene del `tmp.mount` de systemd) y el cupo del uid estaba agotado.
// Claude Code escribe la salida de cada comando en /tmp: sin cupo, el comando muere antes de
// escribir y el harness informa un exit 1 pelado. Lo que llenaba /tmp eran 95.657 directorios de
// `mkdtemp` que nadie borra —la suite de pruebas y el SDK de ARCA, acumulados desde el 7 de agosto—.
//
// `systemd-tmpfiles --clean` corre todos los días con la regla `q /tmp 1777 root root 10d` y NO los
// borraba: mira atime, y cualquier `ls` o glob sobre /tmp se lo refresca a todos. Por eso la
// limpieza tiene que ser explícita y por mtime. Ésta es esa limpieza.
//
// Es DELIBERADAMENTE ANGOSTA. Se borra sólo lo que cumple TODO:
//   1. el nombre empieza con una familia conocida (la lista de abajo) y termina en los seis
//      caracteres que agrega `mkdtemp`: nada con nombre propio entra;
//   2. es un directorio del mismo uid que corre esto, no un enlace ni un archivo;
//   3. su mtime tiene más de EDAD días;
//   4. ningún proceso vivo lo tiene como directorio de trabajo ni con un archivo abierto adentro.
// Ante cualquier duda —un lstat que falla, un /proc que no se deja leer— no se borra. El error caro
// es borrar algo en uso; el barato es dejar un huérfano un día más.

import { readdirSync, readlinkSync, lstatSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Familias que fugan, con su origen. Sólo se agrega una acá cuando se sabe QUIÉN la crea: una
 * familia de origen desconocido no se barre, se investiga.
 */
export const FAMILIAS = [
  'afipsdk',        // SDK externo de ARCA: un directorio por llamada; no lo borra nunca (13.502 al 20/09)
  'conocimiento',   // lib/conocimiento: leer-archivo.mjs, buscar.mjs y sus pruebas
  'vigia',          // pruebas de lib/tesoreria/vigia-navegador
  'balanz',         // pruebas de comunicacion/servidor-balanz-remoto (balanz- y balanz-remoto-)
  'backlog-test',   // pruebas del hook de backlog
  'resiliencia',    // pruebas de lib/conocimiento/resiliencia
  'estudiar',       // pruebas de lib/conocimiento/estudiar
  'orq-doc',        // lib/documentos/leer.mjs
  'cache-planos',   // pruebas de lib/plano/pipeline
  'cache-region',   // pruebas de lib/plano/pipeline
  'cache-vacio',    // pruebas de lib/plano/pipeline
  'xsas-cap',       // pruebas de lib/ingesta/capacidades
  'xsas-dwg',       // lib/ingesta/dwg.mjs
  'ignorar-build',  // pruebas de scripts/vercel-ignorar-build
  'devrouter',      // pruebas de orquestador/dev-router/router
  'dec',            // pruebas de lib/decisiones-hallazgos
  'suite',          // el TMPDIR propio de la suite, si murió de golpe y no alcanzó a borrarlo
]

/** El sufijo que `mkdtemp` agrega siempre: seis caracteres al final. */
const SUFIJO_MKDTEMP = /[A-Za-z0-9]{6}$/

export function esFamilia(nombre, familias = FAMILIAS) {
  return familias.some((f) => nombre.startsWith(`${f}-`)) && SUFIJO_MKDTEMP.test(nombre)
}

/**
 * Los nombres de primer nivel bajo `base` que algún proceso vivo tiene abiertos (cwd o descriptor).
 * Se recorre /proc entero; lo que no se deja leer (procesos de otros usuarios) simplemente no suma.
 */
export function nombresEnUso(base = '/tmp') {
  const usados = new Set()
  const prefijo = `${base}/`
  const agregar = (destino) => {
    if (typeof destino !== 'string' || !destino.startsWith(prefijo)) return
    const nombre = destino.slice(prefijo.length).split('/')[0]
    if (nombre) usados.add(nombre)
  }
  let pids = []
  try { pids = readdirSync('/proc').filter((p) => /^\d+$/.test(p)) } catch { return usados }
  for (const pid of pids) {
    try { agregar(readlinkSync(`/proc/${pid}/cwd`)) } catch { /* ya murió o no se deja mirar */ }
    let fds = []
    try { fds = readdirSync(`/proc/${pid}/fd`) } catch { continue }
    for (const fd of fds) {
      try { agregar(readlinkSync(`/proc/${pid}/fd/${fd}`)) } catch { /* el fd se cerró */ }
    }
  }
  return usados
}

/**
 * Barre los temporales viejos. Nunca lanza: devuelve lo que hizo.
 * `tope` acota cuánto puede tardar una corrida del timer; lo que sobra se va en la siguiente.
 */
export function higieneTmp({
  base = '/tmp', edadDias = 3, tope = 20000, seco = false,
  uid = process.getuid(), familias = FAMILIAS, ahora = Date.now(),
} = {}) {
  const r = { vistos: 0, candidatos: 0, borrados: 0, enUso: 0, tope: false, error: null }
  let entradas = []
  try { entradas = readdirSync(base) } catch (e) { r.error = String(e?.message || e); return r }
  const limite = ahora - edadDias * 86400000
  const candidatos = []
  for (const nombre of entradas) {
    r.vistos++
    if (!esFamilia(nombre, familias)) continue
    const ruta = join(base, nombre)
    let st
    try { st = lstatSync(ruta) } catch { continue }   // desapareció mientras mirábamos: no es asunto nuestro
    if (!st.isDirectory() || st.uid !== uid) continue // enlaces, archivos y cosas de otros: intactos
    if (st.mtimeMs > limite) continue
    candidatos.push({ nombre, ruta })
  }
  r.candidatos = candidatos.length
  if (!candidatos.length) return r
  // /proc se recorre UNA vez y sólo si hay algo para borrar: en la corrida normal esto no cuesta nada.
  const usados = nombresEnUso(base)
  for (const c of candidatos) {
    if (usados.has(c.nombre)) { r.enUso++; continue }
    if (r.borrados >= tope) { r.tope = true; break }
    if (!seco) { try { rmSync(c.ruta, { recursive: true, force: true }) } catch { continue } }
    r.borrados++
  }
  return r
}
