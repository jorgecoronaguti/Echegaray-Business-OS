#!/usr/bin/env node
// LOS PAPELES QUE EL DUEÑO MIRÓ UNO POR UNO Y DIJO «ES ESA FILA». SÓLO ESOS.
//
// Decisión del dueño del 10/09/2026 sobre la lista de `clasificar-adjuntos-sin-vincular.mjs`:
// «dá de alta; buscá en mi mail si no encontrás paridad con algún proveedor». Los seis pares de
// abajo son los que él confirmó mirando el papel contra la fila candidata. La regla automática
// (`clave-conciliada.mjs`) no puede unirlos y hace bien: el número leído difiere en un dígito, o la
// fila del Sheet volvió sin CUIT. Lo que los une es una persona, y por eso quedan `match_manual`.
//
// NO ESCRIBE EN EL SHEET NI EN MATTERMOST: sólo rellena `compra_adjunto.compra_clave/fila_compras`
// donde hoy hay un hueco. Nunca pisa un vínculo existente; correr dos veces no cambia nada.
//
//   node orquestador/scripts/vincular-papeles-confirmados.mjs [--dry]

import { query, closePool } from '../lib/db.mjs'
import { claveComprobante } from '../lib/comprobantes/lectura.mjs'
import { planDeVinculos } from '../lib/comprobantes/vinculo-confirmado.mjs'
import { lecturaPorArchivo } from './vincular-adjuntos-huerfanos.mjs'

const DRY = process.argv.includes('--dry')

// LA DECISIÓN, TEXTUAL Y FECHADA. Si mañana aparece otro papel con la misma clave, cae en la misma
// fila sin volver a preguntar — que es exactamente lo que el dueño decidió.
export const DECISIONES = [
  { clave: 'c:30714340677|0015-00015751', fila: 813, nota: 'Villa del Pino — mismo importe $99.998,98, el bot leyó 0015 por 0001' },
  { clave: 'c:30714340677|0001-00015751', fila: 813, nota: 'Villa del Pino — mismo número, la fila volvió sin CUIT' },
  { clave: 'c:30621517429|0042-00393288', fila: 817, nota: 'Pinturería Córdoba — mismo importe $426.219,42 y mismo proveedor' },
  { clave: 'c:30549581710|00016-00029784', fila: 818, nota: 'Axion Servicentro — mismo número 0016-00029784, la fila volvió sin CUIT' },
  { clave: 'c:30561078927|0012-00050057', fila: 812, nota: 'Rodamientos Cuyo — mismo número, la fila volvió sin CUIT' },
  { clave: 'c:23284752589|0002-00004725', fila: 814, nota: 'Ruviño Matías Esteban — mismo número, la fila volvió sin CUIT' },
  // NO ES UN GASTO SIN CARGAR: ES EL MISMO, ANOTADO CON EL NOMBRE COMERCIAL. La fila 783 dice «RSV»
  // y el papel dice «A.C.SAT S.R.L.»; coinciden número (0011-00087469), fecha (03/08/2026) e importe
  // ($67.797,51), y el mail del dueño («Factura RSV» de avisos.rsvonline.com.ar) confirma que RSV
  // Online es A.C.SAT. Cargarlo habría duplicado $67.797,51 de gasto.
  { clave: 'c:30719656944|0011-00087469', fila: 783, nota: 'A.C.SAT = RSV Online — mismo número, fecha e importe que la fila 783' },
]

async function main() {
  const [{ rows: sueltos }, { rows: fajos }, { rows: filas }] = await Promise.all([
    query(`select origen_file_id, nombre, lectura from public.compra_adjunto
            where compra_clave is null and origen_file_id is not null`),
    query('select items, filas from comunicacion.comprobante_fajos'),
    query('select fila, clave, proveedor, total::float8 total from public.compra_sheet where clave is not null'),
  ])
  const porArchivo = lecturaPorArchivo(fajos)
  const papeles = sueltos.map((s) => {
    const l = porArchivo.get(String(s.origen_file_id))
    const propia = s.lectura ? claveComprobante(s.lectura) : null
    return { file_id: String(s.origen_file_id), nombre: s.nombre, clave: l?.clave ?? propia?.clave ?? null }
  })

  const { vinculos, problemas } = planDeVinculos({ papeles, decisiones: DECISIONES, filas })
  for (const v of vinculos) console.log(`${v.nombre} · ${v.clave_papel} → fila ${v.fila} · ${v.compra_clave}`)
  for (const p of problemas) console.log(`SIN APLICAR ${p.clave} → fila ${p.fila}: ${p.motivo}`)

  if (DRY) { console.log(`\n[dry] ${vinculos.length} vínculo(s) a escribir, ${problemas.length} problema(s)`); return }
  let escritos = 0
  for (const v of vinculos) {
    const { rowCount } = await query(
      `update public.compra_adjunto
          set compra_clave=$1, fila_compras=$2, vinculado_por='match_manual', confianza=1, vinculado_at=now()
        where origen_file_id=$3 and compra_clave is null`,
      [v.compra_clave, v.fila, v.file_id])
    escritos += rowCount
  }
  console.log(`\n${escritos} vínculo(s) escritos (match_manual)`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(closePool)
