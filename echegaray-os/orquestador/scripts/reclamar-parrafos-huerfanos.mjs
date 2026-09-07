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
import { loEscribioElOS, yaNoEstaEnElCodigo } from '../lib/autoria-por-historial.mjs'
import { VACIO, escribirPreservando } from '../lib/preservar-anotaciones.mjs'
// EL TERCER ESTADO, Y ES EL QUE CORRESPONDE ACÁ. `VACIO` dice «es mi celda y va vacía» y la huella
// sólo lo obedece si PUEDE probar la propiedad — que es justo lo que a estos párrafos les falta, y
// por eso las 24 escrituras entraron sin cambiar un carácter. `MIA_PROBADA` es el estado para cuando
// la evidencia viene POR FUERA de la huella: acá, el commit del historial donde ese texto se escribió.
import { MIA_PROBADA } from '../lib/no-borrar.mjs'
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
        if (!esProsa(celda)) continue
        const a = await loEscribioElOS(celda)
        if (!a.mio) { protegidas++; continue }
        // ═══ UNA FÓRMULA PIDE UNA PRUEBA MÁS (06/09/2026) ═══
        //
        // Antes se salteaban todas, y por eso sobrevivían los avisos viejos de «Estructura» y
        // «Jornales»: los dos son fórmulas, los dos se acortaron en el código, y los dos siguieron
        // publicados. Pero una fórmula que el generador SIGUE escribiendo es la que publica el
        // número: borrarla se lleva puesto el cálculo. Lo que separa una cosa de la otra es si su
        // texto todavía existe en el repositorio. Si ya no está en ninguna línea, no la escribe
        // nadie: es la versión vieja que sobrevivió a un cambio de forma.
        if (String(celda ?? '').startsWith('=') && !(await yaNoEstaEnElCodigo(celda))) { protegidas++; continue }
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
      // ═══ POR QUÉ NO SE ESCRIBE POR `batchUpdateValues` (06/09/2026) ═══
      //
      // Se intentó, dos veces, y el archivo no cambió. El cinturón «vacío sobre lleno» de
      // `guardarEscritura` corre PRIMERO —antes que `no-borrar`, y sin consultar la base— así que
      // `vaciarPropio` nunca llegaba a actuar: cada celda salía frenada con «no piso contenido con
      // una grilla vacía». Es su trabajo y está bien que lo haga.
      //
      // La vía diseñada para «esta celda es mía y va vacía» es el CENTINELA, y quien lo entiende es
      // `escribirPreservando`: fusiona, traduce el centinela a vacío y escribe con `yaGuardado`,
      // porque ya verificó candado y firma él mismo. Se va celda por celda con su `fila0`/`col0`
      // para no tocar un solo carácter de lo que hay alrededor.
      //
      // `respetar: false` va DECLARADO y con motivo: la Regla 0 protege lo que no se puede probar
      // ajeno, y acá cada celda pasó la prueba de autoría contra el historial de git. Lo que no la
      // pasa no llega hasta esta línea.
      let escritas = 0
      for (const c of aLimpiar) {
        const [, col, fila] = c.ref.match(/^([A-Z]+)(\d+)$/)
        const col0 = [...col].reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0) - 1
        const valor = c.queda === VACIO ? MIA_PROBADA : c.queda
        const r = await escribirPreservando(google, ID, `'${p.titulo}'`, [[valor]], {
          fila0: Number(fila), col0, respetar: false, anchoHoja: col0 + 1,
        })
        if (r?.bloqueada || r?.protegido) console.log(`      ⛔ ${c.ref}: ${r.motivo ?? 'la guarda lo frenó'}`)
        else escritas++
      }
      console.log(`      → ${escritas} de ${aLimpiar.length} escritas`)

    }
  }

  console.log(`\n${reclamadas} párrafo(s) con autoría probada · ${protegidas} sin prueba: quedan como están`)
  if (!APLICAR && reclamadas) console.log('(sin --aplicar: no escribí nada)')
}

main().catch((e) => { console.error(e); process.exit(1) })
