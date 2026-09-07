#!/usr/bin/env node
// ¿DICE `obra_canonica` LO MISMO QUE LA PESTAÑA OBRAS? — EL CONTROL, CONTRA LA BASE VIVA.
//
// El cálculo NO está acá: está en `orquestador/lib/obras-cartera-canonica.mjs`, que es puro y se
// prueba con `node --test`. Este archivo sólo hace las tres lecturas y decide el código de salida.
// Un control cuya regla vive pegada a la consulta sólo se puede probar teniendo la base delante.
//
//   node orquestador/scripts/obras-cartera-canonica.mjs            → informe legible; 1 si hay algo
//   node orquestador/scripts/obras-cartera-canonica.mjs --sql      → además, el UPDATE mínimo
//
// NO ESCRIBE NADA, NI CON `--sql`. Cambiar la fecha de una obra en Postgres es un efecto sobre lo
// que ve el dueño en app.ecsas.com.ar: lo emite para que alguien lo lea y lo aplique, no lo aplica.
// Esa es la misma línea que traza el `CLAUDE.md` de la raíz entre preparar y ejecutar.

import { query, closePool } from '../lib/db.mjs'
import { obrasVendidas } from '../lib/obras-datos.mjs'
import { diferenciasDeCartera, sqlDeCorreccion } from '../lib/obras-cartera-canonica.mjs'

const ROTULO = {
  fechas_distintas: 'FECHAS DISTINTAS',
  no_esta_activa: 'NO ESTÁ ACTIVA  ',
  falta_en_la_base: 'FALTA EN LA BASE',
}

async function main() {
  // EL VÍNCULO SE LEE, NO SE TIPEA: `obra_egreso_proyectado` es donde el ledger del Cash Flow ya
  // declaró qué clave del Sheet corresponde a qué obra canónica. Ver el módulo puro.
  const { rows: vin } = await query(
    'select distinct obra_clave, obra_canonica_id from public.obra_egreso_proyectado where obra_canonica_id is not null',
  )
  const vinculos = new Map(vin.map((r) => [r.obra_clave, r.obra_canonica_id]))
  const { rows: canonicas } = await query(
    'select id, estado, fecha_inicio_plan::text, fecha_fin_plan::text from public.obra_canonica',
  )

  const hallazgos = diferenciasDeCartera(obrasVendidas, vinculos, canonicas)
  console.log(`Pestaña OBRAS: ${obrasVendidas.length} obras · obra_canonica: ${canonicas.length} filas`)
  if (hallazgos.length === 0) {
    console.log('OK — la cartera de Postgres dice exactamente lo que dice la pestaña OBRAS.')
    return 0
  }
  console.log(`\n${hallazgos.length} hallazgo(s):\n`)
  for (const h of hallazgos) {
    console.log(`  ${ROTULO[h.tipo] ?? h.tipo}  ${h.obra} (${h.id})`)
    console.log(`      pestaña OBRAS : ${h.esperado}`)
    console.log(`      obra_canonica : ${h.encontrado ?? '(no existe)'}`)
  }
  if (process.argv.includes('--sql')) {
    const sql = sqlDeCorreccion(obrasVendidas, vinculos, hallazgos)
    console.log(sql ? `\n-- UPDATE mínimo (NO se aplicó):\n${sql}` : '\n-- Nada que corregir con un UPDATE.')
  }
  return 1
}

let codigo = 1
try {
  codigo = await main()
} catch (e) {
  console.error('no pude leer la cartera:', e.message)
} finally {
  await closePool()
}
process.exit(codigo)
