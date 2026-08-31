#!/usr/bin/env node
// PONE EN ROJO, DE VERDAD, CADA TEST NEGATIVO DE LOS MOTORES.
//
// ═══ POR QUÉ EXISTE ═══
//
// Un test negativo que nunca se vio fallar no prueba nada: puede estar afirmando algo que se cumple
// solo. Acá pasó las dos versiones del problema — un control que era una constante y no podía dar
// rojo (escondía $ 4,1 M), y una mutación «QUE LO PONE ROJO» declarada en un comentario y nunca
// corrida. Este script corre las ocho.
//
// Cada mutación toca CÓDIGO DE PRODUCCIÓN, no el test. Se aplica, se corre el test, se exige que
// falle, se revierte y se exige que vuelva a pasar. Si algo sale mal, el `finally` restaura.
//
//   node orquestador/scripts/motores-mutaciones.mjs

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const LIB = path.join(AQUI, '..', 'lib', 'motores')
const TEST = path.join(LIB, 'motores-negativos.test.mjs')

const MUTACIONES = [
  {
    n: 1, patron: 'NEGATIVO 1', archivo: 'plantillas-motor.mjs',
    de: "  if (!p) return fallo(CODIGO.TEMPLATE_NOT_FOUND, `no existe la plantilla «${template_id}»`)\n  if (p.estado",
    a: "  if (p.estado",
  },
  {
    n: 2, patron: 'NEGATIVO 2', archivo: 'plantillas-motor.mjs',
    cambios: [
      { de: 'export function faltanRequeridos(p, datos) {\n  return p.required_data.filter', a: 'export function faltanRequeridos(p, datos) {\n  return [].filter' },
      { de: '      if (criticos.length || s.obligatoria) { criticos.forEach((k) => faltantes.add(k)) }', a: '      if (false) { criticos.forEach((k) => faltantes.add(k)) }' },
    ],
  },
  {
    n: 3, patron: 'NEGATIVO 3', archivo: 'documento-motor.mjs',
    de: "  const seccion = seccionPorId(leido.estructura, seccion_id)\n  if (!seccion) {",
    a: "  const seccion = seccionPorId(leido.estructura, seccion_id) ?? leido.estructura.secciones[0]\n  if (!seccion) {",
  },
  {
    n: 4, patron: 'NEGATIVO 4', archivo: 'errores.mjs',
    de: '  [404, CODIGO.FILE_NOT_FOUND],',
    a: '  [404, CODIGO.DRIVE_UNAVAILABLE],',
  },
  {
    n: 5, patron: 'NEGATIVO 5', archivo: 'frontera-modelo.mjs',
    de: '  const permisos = permisosDeRol(actor.rol) // el rol manda, nunca lo que declare el pedido',
    a: '  const permisos = Object.values(OPERACIONES)',
  },
  {
    n: 6, patron: 'NEGATIVO 6', archivo: 'documento-motor.mjs',
    de: '  const mime = FORMATOS[String(formato).toLowerCase()]',
    a: '  const mime = FORMATOS[String(formato).toLowerCase()] ?? FORMATOS.pdf',
  },
  {
    n: 7, patron: 'NEGATIVO 7', archivo: 'documento-motor.mjs',
    de: '  if (clave) {\n    const previo = await buscarPorClave(google, clave)',
    a: '  if (false) {\n    const previo = await buscarPorClave(google, clave)',
  },
  {
    n: 8, patron: 'NEGATIVO 8', archivo: 'documento-motor.mjs',
    de: 'async function verificarDocumento(google, fileId, doc) {\n  const leido = await leerDocumento(google, fileId)',
    a: 'async function verificarDocumento(google, fileId, doc) {\n  if (doc) return { ok: true, verificacion: { releido: true } }\n  const leido = await leerDocumento(google, fileId)',
  },
]

/** Corre SÓLO el test de esa mutación. Devuelve `{verde, salida}`. Nunca lanza. */
function correr(patron) {
  try {
    const salida = execFileSync(process.execPath, ['--test', '--test-name-pattern', patron, TEST], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    // Salir con 0 no alcanza: un patrón que no matchea ningún test también sale con 0, y entonces
    // «verde» significaría «no se probó nada». Se exige que haya corrido al menos uno.
    const paso = Number(salida.match(/pass (\d+)/)?.[1] ?? 0)
    const fallo = Number(salida.match(/fail (\d+)/)?.[1] ?? 1)
    return { verde: paso >= 1 && fallo === 0, salida }
  } catch (e) {
    return { verde: false, salida: String(e.stdout ?? '') + String(e.stderr ?? '') }
  }
}

const motivo = (salida) => (salida.match(/AssertionError.*|Error: .*/)?.[0] ?? '(sin línea de error)').slice(0, 140)

let fallados = 0
for (const m of MUTACIONES) {
  const ruta = path.join(LIB, m.archivo)
  const original = readFileSync(ruta, 'utf8')
  // Una mutación puede tener que tocar más de un renglón: un control implementado en dos lugares
  // sólo se apaga apagando los dos, y apagar uno solo «sigue verde» sin que eso pruebe nada.
  const cambios = m.cambios ?? [{ de: m.de, a: m.a }]
  const ausente = cambios.find((c) => !original.includes(c.de))
  if (ausente) {
    console.log(`✖ ${m.n}  NO SE PUDO MUTAR: el texto a cambiar ya no está en ${m.archivo}`)
    fallados++
    continue
  }
  try {
    writeFileSync(ruta, cambios.reduce((t, c) => t.replace(c.de, c.a), original))
    const rojo = correr(m.patron)
    writeFileSync(ruta, original)
    const verde = correr(m.patron)
    const bien = !rojo.verde && verde.verde
    if (!bien) fallados++
    console.log(`${bien ? '✔' : '✖'} ${m.n} · ${m.archivo}`)
    console.log(`     mutado → ${rojo.verde ? 'SIGUIÓ VERDE (el test no prueba nada)' : `ROJO: ${motivo(rojo.salida)}`}`)
    console.log(`     revertido → ${verde.verde ? 'VERDE' : `SIGUE ROJO: ${motivo(verde.salida)}`}`)
  } finally {
    writeFileSync(ruta, original) // pase lo que pase, el código queda como estaba
  }
}
console.log(fallados ? `\n${fallados} mutación(es) no demostraron nada.` : '\nLas 8 mutaciones pusieron en rojo su test y el código quedó como estaba.')
process.exit(fallados ? 1 : 0)
