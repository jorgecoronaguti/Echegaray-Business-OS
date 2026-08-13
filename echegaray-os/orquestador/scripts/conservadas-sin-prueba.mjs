#!/usr/bin/env node
// QUÉ CELDAS CONSERVA EL OS SIN PODER PROBAR DE QUIÉN SON — EN CUALQUIER PESTAÑA.
//
// ═══ EL PROBLEMA, DICHO SIN ADORNOS (13/08/2026) ═══
//
// `lib/no-borrar.mjs` corrige toda escritura que deje vacía una celda con contenido. Ve dos cosas: que
// la celda tiene algo y que la escritura la vaciaría. NO ve de quién es — no tiene con qué. Durante
// meses su log dijo igual *"conservo N celda(s) TUYA(S)"*, y esa palabra es la que decide si alguien
// va a mirar la celda o no.
//
// Nadie las miró. `Cash Flow Semanal!A106 = "AH7"` y `Cash Flow Mensual!A108 = "I7"` son artefactos
// del propio OS —las revisiones de Drive los muestran apareciendo entre dos corridas de la cuenta de
// servicio, sin un solo guardado humano en el medio, en filas que antes no existían— y quedaron
// blindados con el mismo blindaje que protege el trabajo del dueño.
//
// ═══ QUÉ HACE ESTE SCRIPT ═══
//
// LEE Y REPORTA. No escribe una celda: el cliente sale con permisos de SOLO LECTURA, así que no puede
// escribir aunque alguien le agregue una llamada por error. Su trabajo es que el borrado manual sea
// una decisión con evidencia y no un "borrá de la fila X para abajo", que es exactamente cómo se
// pierde trabajo.
//
// La prueba de propiedad sale de `public.sheet_huella_celda`: la forma con la que el OS dejó cada
// celda que escribió. Coincide → es MÍA y se puede borrar tranquilo. No coincide, o no hay huella →
// **puede ser del dueño** y este script no la recomienda: la lista aparte, para que la mire él.
//
// Generaliza `caja-residuo-del-rediseno.mjs`, que hacía lo mismo para una sola pestaña y necesitaba
// conocer su generador. Éste no necesita conocer ninguno: le alcanza con la huella.
//
//   node orquestador/scripts/conservadas-sin-prueba.mjs
//   node orquestador/scripts/conservadas-sin-prueba.mjs 'Cash Flow Semanal' 'Cash Flow Mensual'

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { leerHuellas, formaDe, formaComparable, claveCelda } from '../lib/huella-celda.mjs'
import { letraCol } from '../lib/preservar-anotaciones.mjs'
import { query } from '../lib/db.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const TOPE = Number(process.env.ORQ_RESIDUO_TOPE || 40)

/** Los cuatro veredictos posibles sobre una celda con contenido, y qué significa cada uno. */
export const VEREDICTOS = {
  mia: '✔ mía   ',      // huella propia y la forma de hoy es la que dejé escrita
  cambiada: '? cambió ', // la escribí yo y hoy dice otra cosa: alguien la editó encima
  vaciada: '? volvió ',  // vos la vaciaste y hoy tiene algo otra vez
  ajena: '? mirar  ',    // no tengo ninguna huella acá: no puedo probar nada
}

/**
 * NÚCLEO PURO: clasifica cada celda con contenido contra el mapa de huellas.
 *
 * ═══ POR QUÉ LA ZONA IMPORTA TANTO COMO EL VEREDICTO ═══
 *
 * Una celda sin huella DENTRO del rectángulo que el OS escribe es la que `no-borrar` conserva en cada
 * corrida: está en el camino de la escritura y se repone sola. Una celda sin huella DEBAJO de ese
 * rectángulo ni siquiera se mira: ningún generador la va a limpiar ni a pisar nunca. Se deciden
 * distinto —la primera puede ser una nota del dueño en su lugar, la segunda es casi siempre residuo
 * de un layout que ya no existe— y por eso se informan separadas.
 *
 * @param {any[][]} actual la pestaña leída con render FORMULA (una fórmula que se ve vacía TIENE algo)
 * @param {Map<string,{forma:string,huella:string,borrada:boolean}>} huellas
 * ═══ Y POR QUÉ EL RECTÁNGULO ARRANCA DONDE ARRANCA, NO EN LA FILA 1 ═══
 *
 * En "Parámetros" el OS escribe SÓLO el bloque de inflación (filas 73 a 96); de la 1 a la 72 vive la
 * tabla de parámetros que mantiene el dueño a mano. Midiendo desde la fila 1 este reporte listaba sus
 * 117 celdas —"LA ESTRELLA", "Horas por jornada", "9"— como "mirar", que es una invitación a borrar
 * su propia tabla. Lo que está ARRIBA del rectángulo es tan ajeno como lo que está a la derecha.
 *
 * @param {{ancho:number, fila0:number, filaFin:number}} footprint el rectángulo que el OS escribe
 * @returns {{mias:Array, sinPrueba:Array}} celdas con {ref, fila, col, valor, veredicto, zona}
 */
export function clasificar(actual = [], huellas = new Map(), { ancho = 0, fila0 = 1, filaFin = 0 } = {}) {
  const mias = []; const sinPrueba = []
  for (const [i, fila] of actual.entries()) {
    if (i + 1 < fila0) continue
    for (const [j, v] of (fila ?? []).entries()) {
      if (j >= ancho || !formaDe(v)) continue
      const h = huellas.get(claveCelda(i + 1, j))
      // SE COMPARA LA FORMA Y NO EL HASH. El hash de una huella vieja se calculó antes de que
      // `formaComparable` existiera, y con él este reporte llamaba "cambiada" a cada fórmula del OS:
      // 3.971 celdas marcadas para mirar, casi todas suyas. Un inventario con ese ruido no se lee.
      const igual = h && formaComparable(formaDe(v)).slice(0, 300) === formaComparable(h.forma)
      const veredicto = !h ? 'ajena' : (h.borrada ? 'vaciada' : (igual ? 'mia' : 'cambiada'))
      const celda = {
        ref: `${letraCol(j)}${i + 1}`, fila: i + 1, col: j,
        valor: String(v).slice(0, 60), veredicto, zona: i + 1 <= filaFin ? 'dentro' : 'debajo',
      }
      ;(veredicto === 'mia' ? mias : sinPrueba).push(celda)
    }
  }
  return { mias, sinPrueba }
}

/**
 * NÚCLEO PURO: el rectángulo que el OS escribe en esta pestaña, según sus propias huellas.
 *
 * SIN HUELLAS NO HAY RECTÁNGULO, Y ESO SE DICE. Devolver un rectángulo por defecto haría que el
 * reporte hablara de "dentro" y "debajo" sobre una pestaña donde no tiene idea de nada — la clase de
 * precisión falsa que este repo no se puede permitir.
 */
export function footprint(huellas = new Map()) {
  let ancho = 0; let filaFin = 0; let fila0 = Infinity
  for (const k of huellas.keys()) {
    const [fila, col] = k.split(':').map(Number)
    if (col + 1 > ancho) ancho = col + 1
    if (fila > filaFin) filaFin = fila
    if (fila < fila0) fila0 = fila
  }
  return { ancho, fila0: Number.isFinite(fila0) ? fila0 : 1, filaFin, hay: huellas.size > 0 }
}

/** Las pestañas de las que el OS tiene huella en este archivo. Sin argumentos, se reportan todas. */
async function pestanasConHuella(fileId) {
  const r = await query('select distinct pestana from public.sheet_huella_celda where file_id = $1 order by 1', [fileId])
  return r.rows.map((x) => x.pestana)
}

function listar(titulo, celdas) {
  if (!celdas.length) return
  console.log(`   ── ${titulo} (${celdas.length}) ──`)
  for (const c of celdas.slice(0, TOPE)) console.log(`      ${VEREDICTOS[c.veredicto]} ${c.ref.padEnd(7)} ${c.valor}`)
  if (celdas.length > TOPE) console.log(`      … y ${celdas.length - TOPE} más (ORQ_RESIDUO_TOPE sube el tope)`)
}

async function reportar(google, fileId, pestana) {
  const huellas = await leerHuellas(fileId, pestana).catch(() => new Map())
  const fp = footprint(huellas)
  console.log(`\n══ ${pestana} ══`)
  if (!fp.hay) {
    console.log('   Sin huella todavía: no puedo separar lo mío de lo tuyo en esta pestaña.')
    console.log('   El generador que la escribe tiene que sellar su huella al menos una vez. Hasta entonces,')
    console.log('   TODO lo que haya acá se conserva sin prueba — que es exactamente el agujero que se está cerrando.')
    return { mias: [], sinPrueba: [] }
  }
  // SE LEE LA FÓRMULA, NO EL VALOR: una celda con `=SI(...;"";...)` se VE vacía y TIENE contenido.
  // Contra el texto visible este reporte diría que está libre y el dueño borraría una fórmula viva.
  const actual = await google.readSheetValues(fileId, `'${pestana}'!A1:${letraCol(fp.ancho - 1)}`, { render: 'FORMULA' })
    .catch((e) => { console.log(`   ⚠ no pude leer la pestaña (${e.message}): no reporto nada antes que reportar mal.`); return null })
  if (!actual) return { mias: [], sinPrueba: [] }

  const r = clasificar(actual, huellas, fp)
  console.log(`   El OS escribe de la fila ${fp.fila0} a la ${fp.filaFin}, hasta la columna ${letraCol(fp.ancho - 1)}; la pestaña llega hasta la ${actual.length}.`)
  console.log(`   ${r.mias.length} celda(s) con huella propia · ${r.sinPrueba.length} sin poder probarse mías.`)
  listar('DENTRO de lo que el OS escribe — `no-borrar` las conserva en CADA corrida', r.sinPrueba.filter((c) => c.zona === 'dentro'))
  listar('DEBAJO — ningún generador las mira: no las limpia ni las pisa nunca', r.sinPrueba.filter((c) => c.zona === 'debajo'))
  return r
}

async function main() {
  // SIN `scopes`: el cliente sale con los permisos de SOLO LECTURA, que es el default. No es estilo —
  // es que un reporte sobre qué borrar tiene que ser incapaz de borrar.
  const google = makeGoogleClient({ config: loadConfig() })
  const pedidas = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const pestanas = pedidas.length ? pedidas : await pestanasConHuella(ID)
  if (!pestanas.length) {
    console.log('No hay ninguna pestaña con huella en este archivo. Nombrá las que querés revisar como argumento.')
    return
  }
  let mias = 0; let sinPrueba = 0
  for (const p of pestanas) {
    const r = await reportar(google, ID, p)
    mias += r.mias.length; sinPrueba += r.sinPrueba.length
  }
  console.log('\n── QUÉ HACER ──')
  console.log(`   ${mias} celda(s) tienen la huella del OS: son suyas y el generador las mantiene solo.`)
  console.log(`   ${sinPrueba} celda(s) NO se pueden probar del OS. Las mira una persona antes de tocarlas.`)
  console.log('\n   Este script NO borra nada, y ningún generador va a borrar las de la segunda lista:')
  console.log('   lib/no-borrar.mjs conserva toda celda con contenido que no se pueda probar propia, sin')
  console.log('   bypass y a propósito (siete pérdidas registradas). Las borra el dueño, una vez, mirando')
  console.log('   esta lista — y no vuelven, porque ahora el generador que las produjo deja huella.')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 })
    .finally(async () => { await import('../lib/db.mjs').then((m) => m.closePool()).catch(() => {}) })
}
