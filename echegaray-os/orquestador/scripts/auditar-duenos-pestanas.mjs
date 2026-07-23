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

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

/**
 * Pestañas que NO tienen que tener un generador, con el motivo escrito.
 *
 * Una excepción sin motivo declarado es una huérfana disfrazada: por eso el motivo es obligatorio y
 * se imprime. Son las pestañas de CAPTURA —las carga una persona— y el OS las lee, no las escribe.
 */
export const SIN_GENERADOR = {
  Compras: 'la carga una persona: es el libro de gastos. El OS le calcula columnas (rubro-caja-sheet) pero no la reescribe.',
  Cobranzas: 'la carga una persona: es el libro de ventas y cobros.',
  Parámetros: 'los parámetros los decide una persona (alícuotas, jornada, clientes).',
  '01_Valores Iniciales': 'saldos de arranque del ejercicio: se cargan una vez.',
  // NO ES UNA EXCEPCIÓN CÓMODA, ES UNA DEUDA DECLARADA: la escala del convenio cambia con cada
  // paritaria y hoy la réplica se carga a mano. Mientras siga así, el bloque de escala de Jornales
  // envejece en silencio cuando se firma un acuerdo nuevo.
  _UOCRA_RAW: '⚠ DEUDA: réplica del acuerdo UOCRA cargada a mano. Falta el script que la traiga del boletín de la paritaria.',
}

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

  const mal = r.huerfanas.length + r.compartidas.length + r.fantasmas.length
  console.log(`\n── ${r.filas.filter((f) => f.duenos.length === 1).length} con un solo dueño · ${r.filas.filter((f) => f.excepcion).length} de captura · ${r.huerfanas.length} huérfana(s) · ${r.compartidas.length} con varios dueños · ${r.fantasmas.length} fantasma(s)`)
  process.exit(mal ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(2) })
}
