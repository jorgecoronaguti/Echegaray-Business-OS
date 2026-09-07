#!/usr/bin/env node
// LOS PÁRRAFOS QUE ESCRIBÍ ANTES DE LA HUELLA, Y QUE NADIE PODÍA BORRAR.
//
// El podador saca la prosa de la grilla GENERADA, así que un párrafo nuevo ya no se publica. Pero
// los que están HOY en la pestaña vienen de corridas viejas y no tienen huella: el generador los
// trata como del dueño («nunca fue mía y tiene algo tuyo: no la piso») y quedan ahí para siempre.
// Medido el 06/09 tras enchufar el podador: ocho en «Proveedores», más algunos en otras pestañas.
//
// ESTE BISTURÍ NO BORRA POR PARECIDO: cada celda tiene que pasar las DOS pruebas.
//   1. El contrato la marca como prosa —`esProsa` de diseno-unificado.mjs, la misma que audita—.
//   2. Su texto exacto aparece en el historial de `orquestador/`, o sea salió de un generador mío.
// Sin las dos, la celda queda como está: no poder probar nunca es permiso para borrar.
//
//   node orquestador/scripts/reclamar-parrafos-huerfanos.mjs [pestaña] [--aplicar]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { esProsa, enAlcance } from '../lib/diseno-unificado.mjs'
import { sePoda, podarCelda } from '../lib/podar-prosa.mjs'
import { loEscribioElOS } from '../lib/autoria-por-historial.mjs'
import { VACIO } from '../lib/preservar-anotaciones.mjs'
import { PESTANAS } from './formato-pestanas.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const SOLO = process.argv.slice(2).find((a) => !a.startsWith('--'))
const APLICAR = process.argv.includes('--aplicar')

const LETRA = (n) => { let s = ''; for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s; return s }

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const lista = (SOLO ? PESTANAS.filter((p) => p.titulo.toLowerCase().includes(SOLO.toLowerCase())) : PESTANAS)
    .filter((p) => enAlcance(p.titulo) && sePoda(p.titulo))

  let reclamadas = 0
  let protegidas = 0
  for (const p of lista) {
    const filas = await google.readSheetValues(ID, `${p.titulo}!A1:BZ400`).catch(() => null)
    if (!filas) { console.log(`· ${p.titulo}: no pude leerla — no escribo`); continue }

    const aLimpiar = []
    for (let i = 3; i < filas.length; i++) {
      for (let j = 0; j < (filas[i] || []).length; j++) {
        const celda = filas[i][j]
        // La fórmula se deja quieta SIEMPRE: su texto es un resultado, no un párrafo pegado, y
        // borrarla se lleva puesto el cálculo.
        if (String(celda ?? '').startsWith('=')) continue
        if (!esProsa(celda)) continue
        const a = await loEscribioElOS(celda)
        if (!a.mio) { protegidas++; continue }
        // NO SE VACÍA: SE PODA. Un título de sección que argumenta —«7 · FACTURAS EMITIDAS — control
        // cruzado contra Cobranzas»— también cae en `esProsa`, y borrarlo entero se lleva puesto el
        // nombre del bloque. `podarCelda` es la misma decisión que ya toma el podador: la glosa se
        // va, el nombre se queda.
        const queda = podarCelda(celda)
        aLimpiar.push({ ref: `${LETRA(j)}${i + 1}`, texto: String(celda).slice(0, 60), commit: a.commit, queda, crudo: String(celda) })
      }
    }

    if (!aLimpiar.length) { console.log(`✓ ${p.titulo.padEnd(24)} nada que reclamar`); continue }
    console.log(`${APLICAR ? '🧹' : '·'} ${p.titulo.padEnd(24)} ${aLimpiar.length} párrafo(s) míos`)
    for (const c of aLimpiar) console.log(`      ${c.ref} · ${c.commit.slice(0, 8)} · "${c.texto}"${c.queda === VACIO ? '' : ` → "${c.queda}"`}`)
    reclamadas += aLimpiar.length

    if (APLICAR) {
      // Celda por celda y con su rango propio: un rango que abarque de la primera a la última se
      // llevaría puesto todo lo que hay en el medio, que es de otro.
      // Por `batchUpdateValues` y NO por un escritor crudo: ahí vive la guarda central que se niega
      // a pisar una pestaña candada o una que el dueño editó desde mi última escritura.
      // ═══ POR QUÉ HACE FALTA `vaciarPropio` (06/09/2026) ═══
      //
      // La primera aplicación escribió las 26 celdas y el archivo no cambió: el cinturón
      // vacío-sobre-lleno las frenó una por una —«no piso contenido con una grilla vacía»—, que es
      // exactamente su trabajo y por eso existe. `vaciarPropio` es la segunda vía de prueba que ese
      // mismo módulo define: se le entrega el TEXTO que hoy tiene cada celda, ya probado mío contra
      // el historial de git. Sin esa prueba el cinturón vuelve a frenar, que es como tiene que ser.
      const mios = new Set(aLimpiar.map((c) => c.crudo))
      const r = await google.batchUpdateValues(
        ID,
        aLimpiar.map((c) => ({ range: `'${p.titulo}'!${c.ref}`, values: [[c.queda === VACIO ? '' : c.queda]] })),
        { vaciarPropio: { mios, tope: aLimpiar.length } },
      )
      if (r?.protegido) console.log(`      ⛔ no escribí: ${r.motivo ?? r.porQue ?? 'la guarda lo frenó'}`)
    }
  }

  console.log(`\n${reclamadas} párrafo(s) con autoría probada · ${protegidas} sin prueba: quedan como están`)
  if (!APLICAR && reclamadas) console.log('(sin --aplicar: no escribí nada)')
}

main().catch((e) => { console.error(e); process.exit(1) })
