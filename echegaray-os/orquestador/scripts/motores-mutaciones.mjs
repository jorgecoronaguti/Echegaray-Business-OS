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
const ORQ = path.join(AQUI, '..')
const LIB = path.join(ORQ, 'lib', 'motores')
const NEGATIVOS = path.join(LIB, 'motores-negativos.test.mjs')

const MUTACIONES = [
  {
    n: 1, patron: 'NEGATIVO 1', archivo: 'plantillas-motor.mjs',
    de: "  if (!p) return fallo(CODIGO.TEMPLATE_NOT_FOUND, `no existe la plantilla «${template_id}»`)\n  if (p.estado",
    a: "  if (p.estado",
  },
  {
    // MITAD A del control de datos obligatorios. La B es la mutación 13: se prueban POR SEPARADO
    // porque apagar las dos juntas esconde que una sola no está probada — el auditor encontró
    // exactamente eso acá.
    n: 2, patron: 'NEGATIVO 2', archivo: 'plantillas-motor.mjs',
    cambios: [
      { de: 'export function faltanRequeridos(p, datos) {\n  return p.required_data.filter', a: 'export function faltanRequeridos(p, datos) {\n  return [].filter' },
      { de: "      sinDato.filter((k) => p.required_data.includes(k)).forEach((k) => faltantes.add(k))", a: '      // (mutación) sin registrar los críticos' },
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
  {
    // La llave borrada VUELVE A LA VIDA si no se neutraliza el EnvironmentFile del modelo:
    // `lib/config.mjs` carga `~/.config/echegaray-orq/anthropic.env` dentro de `process.env`.
    n: 9, patron: 'una API KEY en el entorno', archivo: 'scripts/motores-sin-llm.mjs',
    test: 'lib/motores/claude-zero.test.mjs',
    de: "process.env.ORQ_ANTHROPIC_ENV_FILE = '/dev/null/no-existe'",
    a: "// (mutación) sin neutralizar el EnvironmentFile del modelo",
  },
  {
    n: 10, patron: 'NEGATIVO 10', archivo: 'frontera-modelo.mjs',
    de: "export const PROHIBIDOS = Object.freeze(['1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'])",
    a: 'export const PROHIBIDOS = Object.freeze([])',
  },
  {
    // EL VERIFY-AFTER-WRITE DE LA RUTA DE ACTUALIZACIÓN. La 8 cubre la de creación.
    n: 11, patron: 'NEGATIVO 11', archivo: 'documento-motor.mjs',
    de: 'export async function verificarSeccion(google, fileId, seccionId, bloques) {\n  const leido',
    a: 'export async function verificarSeccion(google, fileId, seccionId, bloques) {\n  if (bloques) return { ok: true, verificacion: { releido: true } }\n  const leido',
  },
  {
    n: 12, patron: 'NEGATIVO 12', archivo: 'documento-motor.mjs',
    de: "  if (sinReemplazar.length) {\n    return fallo(CODIGO.WRITE_NOT_PERSISTED, 'quedaron variables sin reemplazar después de escribir', { sin_reemplazar: sinReemplazar })\n  }",
    a: '  // (mutación) sin comprobar que las variables se hayan ido',
  },
  {
    // MITAD B del control de datos: la sección obligatoria a la que le faltó un dato opcional.
    n: 13, patron: 'NEGATIVO 13', archivo: 'plantillas-motor.mjs',
    de: '      incompletas.push({ seccion: s.id, sin_dato: sinDato })',
    a: '      // (mutación) sin declarar que la sección salió incompleta',
  },
  {
    n: 14, patron: 'NEGATIVO 14', archivo: 'documento-motor.mjs',
    de: '    ...(carpeta_id ? { parents: [carpeta_id] } : {}),',
    a: '    // (mutación) sin parents: el archivo cae donde caiga',
  },
  {
    // EL PORTERO LLAMADO DESDE ADENTRO. Sin esta línea, el motor escribe Drive con el token del
    // dueño salteándose las dos cerraduras y la lista de archivos prohibidos.
    n: 15, patron: 'NEGATIVO 15', archivo: 'documento-motor.mjs',
    de: "  const puerta = puedeEscribir({ operation: 'crear_documento', actor, archivos_habilitados })\n  if (!puerta.ok) return puerta",
    a: "  puedeEscribir({ operation: 'crear_documento', actor, archivos_habilitados })",
  },
  {
    // EL PIE DE LA LÁMINA DE FUENTES: el mismo arreglo en dos lugares, cada uno con su test.
    n: 16, patron: 'lámina de FUENTES', archivo: 'lib/slides/plantillas.mjs',
    test: 'lib/motores/presentacion.test.mjs',
    de: 'laminas.push(laminaFuentes(fuentes, { numero: i + 2, total, deck })); return }',
    a: 'laminas.push(laminaFuentes(fuentes, { numero: i + 2, total: total + 1, deck })); return }',
  },
  {
    // LA GUARDIA QUE NO SOBREVIVE A MAÑANA: el import DINÁMICO de un cliente de IA. Es la inyección
    // textual con la que el auditor dejó la auditoría estructural en 4/4 verde.
    n: 17, patron: 'ningún módulo de los dos motores', archivo: 'lib/motores/documento-motor.mjs',
    test: 'lib/motores/claude-zero.test.mjs',
    de: 'const MIME_DOC =',
    a: "export async function narrarConModelo(texto) {\n  const { pedirTexto } = await import('../ia/cliente.mjs')\n  return pedirTexto({ prompt: texto })\n}\n\nconst MIME_DOC =",
  },
]

/** Corre SÓLO el test de esa mutación. Devuelve `{verde, salida}`. Nunca lanza. */
function correr(patron, archivoDeTest = NEGATIVOS) {
  try {
    const salida = execFileSync(process.execPath, ['--test', '--test-name-pattern', patron, archivoDeTest], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    // Salir con 0 no alcanza: un patrón que no matchea ningún test también sale con 0, y entonces
    // «verde» significaría «no se probó nada». Se exige que haya corrido al menos uno.
    const paso = Number(salida.match(/pass (\d+)/)?.[1] ?? 0)
    const fallo = Number(salida.match(/fail (\d+)/)?.[1] ?? 1)
    return { verde: paso >= 1 && fallo === 0, salida }
  } catch (e) {
    return { verde: false, salida: String(e.stdout ?? '') + String(e.stderr ?? '') }
  }
}

/** La razón del rojo. Se prefiere la ASERCIÓN sobre el «Command failed» del proceso hijo: lo que
 *  hay que poder leer es qué control saltó, no que el comando devolvió distinto de cero. */
const motivo = (salida) => (salida.match(/AssertionError[^\n]*/)?.[0] ?? salida.match(/Error: [^\n]*/)?.[0] ?? '(sin línea de error)').slice(0, 150)

let fallados = 0
for (const m of MUTACIONES) {
  const ruta = m.archivo.includes('/') ? path.join(ORQ, m.archivo) : path.join(LIB, m.archivo)
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
    const test = m.test ? path.join(ORQ, m.test) : NEGATIVOS
    const rojo = correr(m.patron, test)
    writeFileSync(ruta, original)
    const verde = correr(m.patron, test)
    const bien = !rojo.verde && verde.verde
    if (!bien) fallados++
    console.log(`${bien ? '✔' : '✖'} ${m.n} · ${m.archivo}`)
    console.log(`     mutado → ${rojo.verde ? 'SIGUIÓ VERDE (el test no prueba nada)' : `ROJO: ${motivo(rojo.salida)}`}`)
    console.log(`     revertido → ${verde.verde ? 'VERDE' : `SIGUE ROJO: ${motivo(verde.salida)}`}`)
  } finally {
    writeFileSync(ruta, original) // pase lo que pase, el código queda como estaba
  }
}
console.log(fallados ? `\n${fallados} mutación(es) no demostraron nada.` : `\nLas ${MUTACIONES.length} mutaciones pusieron en rojo su test y el código quedó como estaba.`)
process.exit(fallados ? 1 : 0)
