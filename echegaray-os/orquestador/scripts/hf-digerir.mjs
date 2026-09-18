// DIGERIR UNA SALIDA LARGA CON UN MODELO DE HUGGING FACE ANTES DE QUE ENTRE AL CONTEXTO DE CLAUDE.
//
// POR QUÉ EXISTE (18/09/2026). La medición del 16/09 (dev-router/medicion-pareto-2026-09-16.log)
// mostró adónde se va el contexto de Claude Code: leer archivos 41 %, búsquedas 16 %, logs 10 %.
// Editar código es el 0,6 %. Cada línea que entra al contexto se vuelve a leer en CADA respuesta
// posterior de la sesión, así que un log de 40 KB leído una vez se paga cientos de veces.
// Esto lo lee un modelo de HF (centavos de dólar, una sola vez) y a Claude le llega el resumen.
//
// QUÉ PUEDE SALIR Y QUÉ NO. Sólo salidas de DESARROLLO: tests, typecheck, lint, build, git y
// búsquedas sobre el código. Nunca una salida del pipeline del Sheet, de la base o del banco: esas
// traen clientes, montos y personas, y el techo de HF es INTERNAL. Se controla dos veces: por el
// tipo declarado (lista cerrada) y escaneando el texto (`revisarEgreso` + montos en pesos).
//
// EL MODELO PUEDE INVENTAR. Por eso el resumen se pide con las líneas clave citadas entre «»
// y cada cita se busca LITERAL en la entrada original, acá, sin modelo. Una cita que no está se
// marca ✗ — el control no se valida contra lo que produjo el modelo, sino contra la fuente.
//
//   <comando> 2>&1 | node orquestador/scripts/hf-digerir.mjs tests "¿qué falla y dónde?"
//   node orquestador/scripts/hf-digerir.mjs typecheck "errores por archivo" salida.log
import { readFileSync } from 'node:fs'
import { revisarEgreso } from '../dev-router/politica-codigo.mjs'
import { hfInferencia } from '../lib/ml/hf-inferencia.mjs'

/** Tipo declarado → ruta sintética que `revisarEgreso` clasifica como INTERNAL. Lista cerrada. */
export const TIPOS = Object.freeze({
  tests: 'tests/salida.log',
  typecheck: 'types/salida.log',
  lint: 'tests/lint.log',
  build: 'herramientas/build.log',
  git: 'herramientas/git.log',
  codigo: 'herramientas/busqueda-codigo.log',
})

/** Señales de dato de negocio que `revisarEgreso` no mira: montos en pesos con miles. */
const MONTOS = /\$\s?-?\d{1,3}(\.\d{3}){2,}/

const MODELO = process.env.ORQ_HF_DIGERIR_MODELO || 'Qwen/Qwen3-Coder-480B-A35B-Instruct'
const MAX_CHARS = 120_000

/** Deja cabeza y cola si la entrada no entra: los errores suelen estar al final, el contexto al principio. */
export function recortar(texto, max = MAX_CHARS) {
  if (texto.length <= max) return { texto, recortado: false }
  const cabeza = Math.floor(max * 0.2)
  return { texto: `${texto.slice(0, cabeza)}\n[… ${texto.length - max} caracteres omitidos …]\n${texto.slice(-(max - cabeza))}`, recortado: true }
}

/** ¿Puede este texto salir a HF? Devuelve el motivo si no. */
export function puedeSalir(tipo, texto) {
  const ruta = TIPOS[tipo]
  if (!ruta) return { permitido: false, porQue: `tipo «${tipo}» no está en la lista (${Object.keys(TIPOS).join(', ')})` }
  if (MONTOS.test(texto)) return { permitido: false, porQue: 'el texto tiene montos en pesos: es dato de negocio, no sale' }
  return revisarEgreso({ ruta, texto })
}

/** Cada «cita» del resumen tiene que aparecer literal en la entrada. Devuelve el resumen marcado. */
export function verificarCitas(resumen, fuente) {
  let malas = 0
  const marcado = resumen.replace(/«([^»]{4,})»/g, (m, cita) => {
    if (fuente.includes(cita.trim())) return m
    malas += 1
    return `${m} ✗NO-ESTÁ-EN-LA-SALIDA`
  })
  return { marcado, malas }
}

async function main() {
  const [tipo, pregunta, archivo] = process.argv.slice(2)
  if (!tipo || !pregunta) {
    console.error('Uso: <cmd> | hf-digerir.mjs <tipo> "<pregunta>" [archivo]   tipos: ' + Object.keys(TIPOS).join(' '))
    process.exit(2)
  }
  const bruto = readFileSync(archivo || 0, 'utf8')
  if (bruto.length < 3000) { process.stdout.write(bruto); return } // corto: no vale la llamada
  const permiso = puedeSalir(tipo, bruto)
  if (!permiso.permitido) {
    console.error(`hf-digerir: NO SALE — ${permiso.porQue}. Filtrá local (grep/tail) en vez de mandarlo.`)
    process.exit(3)
  }
  const { texto, recortado } = recortar(bruto)
  const r = await hfInferencia({
    capacidad: 'digest', modelo: MODELO, tarea: 'chat-completions', dominio: 'codigo', modulo: 'hf-digerir',
    opciones: { temperature: 0, max_tokens: 1200 },
    entrada: [
      { role: 'system', content: 'Resumís salidas de herramientas de desarrollo para otro ingeniero. Máximo 25 líneas: agrupá y contá en vez de listar todo. Citá textual entre «» cada línea clave (error, archivo:línea, nombre de test). No inventes nada que no esté en la salida; si lo pedido no está, decí «NO ESTÁ». Sin preámbulo. En español.' },
      { role: 'user', content: `Pregunta: ${pregunta}\n\nSalida (${tipo}${recortado ? ', recortada al medio' : ''}):\n${texto}` },
    ],
  })
  const resumen = r.datos?.choices?.[0]?.message?.content?.trim() || '(el modelo no devolvió texto)'
  const { marcado, malas } = verificarCitas(resumen, bruto)
  const u = r.datos?.usage || {}
  console.log(marcado)
  console.log(`— hf-digerir · ${MODELO} · ${r.ms} ms · ${bruto.length}→${marcado.length} caracteres · tokens ${u.prompt_tokens ?? '?'}/${u.completion_tokens ?? '?'}${r.costoUsd ? ` · US$${r.costoUsd}` : ''}${malas ? ` · ⚠ ${malas} cita(s) NO están en la salida: no confiar en esas` : ' · citas verificadas'}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(`hf-digerir: ${e.message}`); process.exit(1) })
}
