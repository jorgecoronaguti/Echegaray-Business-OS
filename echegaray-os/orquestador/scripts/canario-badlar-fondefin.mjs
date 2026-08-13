#!/usr/bin/env node
// CANARIO DE LA BADLAR — el único control de la línea FONDEFIN que no se valida contra sí mismo.
//
// ═══ QUÉ VIGILA ═══
//
// La TNA de FONDEFIN no es un número: es 60% de la Badlar del día del acta (ROP). El OS guarda una
// FOTO de esa Badlar en lib/badlar-bcra.mjs. Dos cosas le pueden pasar a una foto, y las dos ya
// pasaron en este repo con otras fuentes:
//
//  1. QUE ESTÉ MAL TIPEADA. Un `22,5%` donde el BCRA dijo `22,8125%` es plausible, no rompe ningún
//     test offline y publica una TNA falsa con cara de dato oficial. Sólo la API del BCRA lo desmiente.
//  2. QUE ENVEJEZCA EN SILENCIO. La fila ya caduca sola (`vigencia_hasta`, ver VALIDEZ_FOTO_DIAS),
//     pero caducar es apagarse: nadie se entera. Este canario es el que avisa ANTES.
//
// ═══ CÓMO AVISA ═══
//
//  · SALIDA 1 (rojo) si la referencia no coincide con lo que publica el BCRA, o si la foto ya venció.
//    Es lo que levanta un timer, un CI o el que lo corra a mano.
//  · REGISTRA LA LECTURA en `fuentes_datos` (FUENTES_INGESTA.badlarBcra). Así, si este canario DEJA
//    DE CORRER, `recalcular_frescura_fuentes()` marca la fuente 'atrasado' y la alerta que ya existe
//    lo dice sola. Un vigía que sólo grita cuando corre no vigila nada.
//
// Uso:
//   node orquestador/scripts/canario-badlar-fondefin.mjs                # contrasta y registra
//   node orquestador/scripts/canario-badlar-fondefin.mjs --sin-registro # sólo contrasta (sin DB)
//
// Cadencia sugerida: diaria. La fuente se declara 'semanal' a propósito (ver FUENTES_INGESTA).
import {
  SERIE_BADLAR, SERIE_LEIDA_EL, BCRA_URL, traerSerieBcra, contrastarBadlar, rangoDeLaSerie,
} from '../lib/badlar-bcra.mjs'
import { BADLAR_REFERENCIA, tnaFondefin, estadoDeLaFoto, VALIDEZ_FOTO_DIAS } from '../lib/linea-fondefin.mjs'
import { registrarIngesta, FUENTES_INGESTA } from '../lib/registrar-sincronizacion.mjs'

const sinRegistro = process.argv.includes('--sin-registro')
const pct = (f, dec = 4) => `${(Number(f) * 100).toFixed(dec).replace('.', ',')}%`

// Se pide una ventana amplia hacia atrás: sirve para contrastar la fecha de la referencia aunque el
// BCRA no haya publicado nada nuevo (feriados largos), no sólo la última rueda.
const desde = SERIE_BADLAR[0].fecha
const hasta = new Date().toISOString().slice(0, 10)

console.log('CANARIO DE LA BADLAR (FONDEFIN · Fiduciaria San Juan SAPEM)\n')
console.log(`  guardado : Badlar ${pct(BADLAR_REFERENCIA.valor)} del ${BADLAR_REFERENCIA.fecha} → TNA ${pct(tnaFondefin(BADLAR_REFERENCIA.valor))} (serie de ${SERIE_BADLAR.length} ruedas leída el ${SERIE_LEIDA_EL})`)

const foto = estadoDeLaFoto(hasta)
console.log(`  foto     : ${foto.dias_de_la_foto} días · vence el ${foto.vence_el} (validez ${VALIDEZ_FOTO_DIAS} días)${foto.vencida ? ' · ❌ VENCIDA' : ''}`)

const r = await traerSerieBcra({}, { desde, hasta })
let fallas = foto.vencida ? 1 : 0

if (!r.ok) {
  // NO SABER NO ES ESTAR BIEN. Se informa y no se afirma nada sobre la referencia.
  console.error(`  bcra     : ⚠ no se pudo leer (${r.motivo}) — ${BCRA_URL}`)
  console.error('             no se puede confirmar ni desmentir la Badlar guardada.')
} else {
  const viva = rangoDeLaSerie(r.serie)
  console.log(`  bcra     : ${r.serie.length} ruedas del ${viva.desde} al ${viva.hasta} · min ${pct(viva.min)} (${viva.min_el}) · max ${pct(viva.max)} (${viva.max_el})`)
  const c = contrastarBadlar(BADLAR_REFERENCIA, r.serie)
  if (c.estado === 'coincide') {
    console.log(`  contraste: ✅ la Badlar guardada es la que publica el BCRA para el ${c.fecha}`)
    if (c.ruedas_posteriores > 0) {
      const nueva = tnaFondefin(c.ultima_del_bcra.valor)
      console.log(`             ⚠ hay ${c.ruedas_posteriores} rueda(s) posterior(es): la última es ${pct(c.ultima_del_bcra.valor)} del ${c.ultima_del_bcra.fecha} (derrape ${c.derrape_pp.toFixed(4).replace('.', ',')} pp) → TNA ${pct(nueva)}`)
      console.log('             para refrescar: actualizar SERIE_BADLAR en lib/badlar-bcra.mjs y re-correr seed-condiciones-financieras.mjs')
    }
  } else {
    fallas++
    console.error(`  contraste: ❌ ${c.estado} — ${c.motivo}`)
  }
}

if (!sinRegistro) {
  const reg = await registrarIngesta({}, {
    declaracion: FUENTES_INGESTA.badlarBcra,
    coberturaHasta: BADLAR_REFERENCIA.fecha,
  })
  console.log(`  fuente   : ${reg.ok ? `registrada (${reg.nombre} · ${reg.estado})` : `⚠ no se pudo registrar: ${reg.motivo}`}`)
  const { closePool } = await import('../lib/db.mjs')
  await closePool()
}

if (fallas) {
  console.error(`\n❌ ${fallas} problema(s): la TNA de FONDEFIN que publica el OS no está respaldada.`)
  process.exit(1)
}
console.log('\n✅ la Badlar de referencia está confirmada contra el BCRA y la foto sigue vigente.')
