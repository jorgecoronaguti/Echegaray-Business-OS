#!/usr/bin/env node
// ¿QUIÉN MANTIENE CADA PESTAÑA? El censo de dueños, contra el archivo real.
//
// POR QUÉ EXISTE (23/07). El dueño preguntó: "¿estás respetando la regla de que cada pestaña tenga
// su agente que la mantenga actualizada y conectada a la fuente correcta?". Hasta hoy eso sólo se
// podía contestar de memoria — y de memoria contesté mal más de una vez.
//
// Los dos defectos que este censo detecta son los que ya rompieron pestañas de verdad:
//
//   HUÉRFANA. Ningún script la escribe. Su contenido envejece o se rompe y nadie se entera. Así
//   quedaron el bloque "PAGADO" de Cargas Sociales (seis meses de #VALUE! congelados) y el cuadro de
//   SAC, que era el único contenido del archivo que ningún script mantenía.
//
//   VARIOS DUEÑOS. Dos o tres scripts escriben la misma pestaña, cada uno con su ancho de grilla y
//   su forma de titular. Es la causa estructural de "las pestañas no respetan un patrón de diseño":
//   un solo script no puede descuadrarse contra sí mismo, tres sí.
//
//   node orquestador/scripts/auditar-duenos-pestanas.mjs
//
// El código de salida es 1 si hay huérfanas o pestañas con más de un dueño, para poder encadenarlo.

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { PASOS } from '../lib/flujo-caja-pasos.mjs'
// EL REGISTRO DE EXCEPCIONES SE MUDÓ A `lib/` (14/08/2026) y se re-exporta acá para no romper a quien
// lo importaba de este script. El motivo es de fuente única: ahora lo consultan DOS controles —este
// censo, que necesita el archivo vivo, y el test estático de `pestanas-auxiliares`, que corre sin
// red—. Con la lista en el script, el test tendría que declarar sus propias excepciones y las dos
// listas empezarían a divergir el día que se agregue una.
import { SIN_GENERADOR, MANTENIDAS_POR_DINAMICA, coberturaDeDinamica } from '../lib/pestanas-auxiliares.mjs'

export { SIN_GENERADOR }

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

/** NÚCLEO PURO: cruza las pestañas reales contra el registro de pasos. */
export function censar(titulos = [], pasos = PASOS, sinGenerador = SIN_GENERADOR) {
  const duenos = new Map()
  for (const [script, , pestanas] of pasos) {
    for (const p of pestanas || []) {
      if (!duenos.has(p)) duenos.set(p, [])
      duenos.get(p).push(script)
    }
  }
  const filas = titulos.map((t) => ({
    pestana: t,
    duenos: duenos.get(t) ?? [],
    excepcion: sinGenerador[t] ?? null,
  }))
  return {
    filas,
    huerfanas: filas.filter((f) => !f.duenos.length && !f.excepcion),
    compartidas: filas.filter((f) => f.duenos.length > 1),
    // Un paso que declara una pestaña que ya no existe apunta al vacío: se renombró y nadie lo siguió.
    fantasmas: [...duenos.keys()].filter((p) => !titulos.includes(p)),
  }
}

/**
 * LA EXCEPCIÓN "LA MANTIENE UNA DINÁMICA", VERIFICADA CONTRA EL ARCHIVO.
 *
 * ═══ POR QUÉ ESTO NO ES UN LUJO (14/08/2026) ═══
 *
 * `SIN_GENERADOR` exime a una pestaña de tener dueño, y su motivo es PROSA: nada obliga a que siga
 * siendo cierta. Para "la carga una persona" no hay nada que medir. Para "la mantiene una tabla
 * dinámica" sí: el rango de origen es un hecho de la API.
 *
 * Y el modo de falla es el que este archivo persigue desde el primer día. El origen de la dinámica de
 * "Deuda viva (OS)" termina en la fila 932 de Compras, que va por la 846. El día que Compras pase esa
 * fila, la dinámica deja de ver las compras nuevas: la deuda viva BAJA, no hay un solo `#REF!`, y una
 * pestaña que se exime del censo por definición no tiene quién la mire. Es el mismo silencio de
 * `_CRUCE_ARCA`, con la diferencia de que acá el aire se puede contar antes de que se acabe.
 *
 * @param {object} g cliente de Google
 * @param {Record<string,string>} mantenidas pestaña → pestaña de origen
 * @returns {Promise<number>} cuántos hallazgos (0 = todo cubierto)
 */
export async function auditarDinamicas(g, mantenidas = MANTENIDAS_POR_DINAMICA) {
  let mal = 0
  for (const [pestana, fuente] of Object.entries(mantenidas)) {
    // El rango de la dinámica sale del campo `pivotTable` de su celda ancla: una dinámica no tiene
    // valor ni fórmula propios, así que `readSheetValues` no la ve. Mismo camino que `anclasDeDinamicas`.
    const grid = await g.getGridData(ID, `'${pestana}'!A1:Z40`).catch(() => null)
    const pivots = (grid?.sheets?.[0]?.data?.[0]?.rowData ?? [])
      .flatMap((f) => (f?.values ?? []).map((c) => c?.pivotTable).filter(Boolean))
    if (!pivots.length) {
      console.log(`✖ ${pestana.padEnd(28)} declarada "la mantiene una dinámica" y NO tiene ninguna: la excepción ya no es cierta`)
      mal++
      continue
    }
    // `endRowIndex` es exclusivo y 0-indexado: la última fila incluida es ese número tal cual.
    const finOrigen = Math.min(...pivots.map((p) => Number(p?.source?.endRowIndex ?? 0)))
    const filasFuente = (await g.readSheetValues(ID, `${fuente}!A:A`).catch(() => [])).length
    const { aire, cubre, avisa } = coberturaDeDinamica({ finOrigen, filasFuente })
    if (!cubre) {
      console.log(`✖ ${pestana.padEnd(28)} su dinámica llega hasta ${fuente} fila ${finOrigen} y ${fuente} va por la ${filasFuente}: `
        + `${-aire} fila(s) YA QUEDARON AFUERA del cuadro, sin un solo error a la vista`)
      mal++
    } else if (avisa) {
      console.log(`✖ ${pestana.padEnd(28)} a su dinámica le quedan ${aire} fila(s) de aire sobre ${fuente} (hasta la ${finOrigen}, hoy va por la ${filasFuente}): `
        + 'cuando se acabe, el cuadro baja en silencio')
      mal++
    } else {
      console.log(`· ${pestana.padEnd(28)} dinámica sobre ${fuente} hasta la fila ${finOrigen} · ${aire} filas de aire`)
    }
  }
  return mal
}

async function main() {
  const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const titulos = (await g.getSheetMeta(ID)).map((h) => h.title)
  const r = censar(titulos)

  for (const f of r.filas) {
    if (f.duenos.length === 1) console.log(`✓ ${f.pestana.padEnd(28)} ${f.duenos[0]}`)
    else if (f.duenos.length > 1) console.log(`✖ ${f.pestana.padEnd(28)} ${f.duenos.length} DUEÑOS: ${f.duenos.join(', ')}`)
    else if (f.excepcion) console.log(`· ${f.pestana.padEnd(28)} sin generador — ${f.excepcion}`)
    else console.log(`✖ ${f.pestana.padEnd(28)} HUÉRFANA: ningún script la mantiene`)
  }
  for (const p of r.fantasmas) console.log(`✖ ${p.padEnd(28)} declarada por un paso pero NO EXISTE en el archivo`)

  // Las excepciones que SÍ se pueden verificar, se verifican. Una eximida del censo no tiene quién la
  // mire: si además se la cree sin comprobar, la exención es el escondite perfecto.
  const malDinamicas = await auditarDinamicas(g)

  const mal = r.huerfanas.length + r.compartidas.length + r.fantasmas.length + malDinamicas
  console.log(`\n── ${r.filas.filter((f) => f.duenos.length === 1).length} con un solo dueño · ${r.filas.filter((f) => f.excepcion).length} de captura · ${r.huerfanas.length} huérfana(s) · ${r.compartidas.length} con varios dueños · ${r.fantasmas.length} fantasma(s)`)
  process.exit(mal ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(2) })
}
