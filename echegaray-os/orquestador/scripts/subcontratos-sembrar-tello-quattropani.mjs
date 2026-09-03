#!/usr/bin/env node
// EL PRIMER PAQUETE REAL — PEDRO TELLO · Quattropani · hormigonado.
//
// No es un ejemplo ni un seed: es la transcripción de cuatro filas que YA están en la pestaña
// Compras (filas 908-911, cargadas el 27/08/2026), que declaran alcance en m², precio total y plan
// de pago. Todo lo que se escribe acá sale de ahí; nada se completa con lo que parezca razonable.
//
//   fila 908  $ 1.800.000  «Hormigonado 400 m² — pago 1 de 4 (vence 04/09/2026) … de 9.900.000»
//   fila 909  $ 2.700.000  «Hormigonado 600 m² — pago 2 de 4 (vence 11/09/2026)»
//   fila 910  $ 2.700.000  «Hormigonado 600 m² — pago 3 de 4 (vence 18/09/2026)»
//   fila 911  $ 2.700.000  «Hormigonado 600 m² — pago 4 de 4 (vence 25/09/2026)»
//
// ═══ POR QUÉ NO SE VINCULA A UNA ACTIVIDAD ═══
//
// La única actividad de Quattropani que habla de piso de hormigón es «PISO DE HORMIGON ALISADO
// MECÁNICO - MANO DE OBRA», con 240 m² de objetivo. El paquete declara 2.200 m². Vincularlo sería
// inventar el alcance —y el trigger `subcontrato_no_excede_la_actividad` lo rechazaría con razón—,
// así que el vínculo queda abierto y la discrepancia queda escrita en `notas`. Es un dato para el
// dueño: o la obra imputada en Compras no es Quattropani, o el cómputo de Quattropani está corto
// por 1.960 m².
//
// ═══ POR QUÉ NO SE CUENTA DOS VECES ═══
//
// Los $ 9.900.000 ya están en `costos_obra` (que es espejo de Compras). Cargar el precio acá NO los
// duplica porque nada suma `subcontrato_costo` con `costos_obra`: verificado el 03/09/2026 —ninguna
// vista de Postgres nombra las dos, y ningún módulo que lee una lee la otra—. La regla para cuando
// se vinculen está en `lib/subcontratos-en-compras.mjs::costoDeObraSinDobleConteo`.
//
//   node orquestador/scripts/subcontratos-sembrar-tello-quattropani.mjs [--aplicar]

import { query, closePool } from '../lib/db.mjs'

const aplicar = process.argv.includes('--aplicar')
const OBRA = 'quattropani'
const NOMBRE = 'Hormigonado de pisos — 2.200 m²'
const NOTAS = [
  'Transcripto de la pestaña Compras, filas 908-911 (27/08/2026): 4 pagos de $ 1.800.000 + 2.700.000',
  '× 3 = $ 9.900.000, con vencimientos 04, 11, 18 y 25/09/2026.',
  'SIN RESPALDO: las cuatro filas están sin CUIT y sin número de comprobante.',
  'FALTA_DATO — alcance: el paquete declara 2.200 m² y la única actividad de piso de hormigón de',
  'esta obra tiene 240 m² de objetivo. No se vinculó a ninguna actividad para no inventar el',
  'alcance. Lo decide el dueño: o la obra imputada en Compras no es ésta, o falta cómputo.',
].join(' ')

const existe = await query(
  'select id, precio_contratado from public.subcontrato where obra_id = $1 and nombre = $2',
  [OBRA, NOMBRE],
)
if (existe.rows.length > 0) {
  console.log(`YA ESTÁ · ${existe.rows[0].id} · precio ${existe.rows[0].precio_contratado}`)
  await closePool(); process.exit(0)
}
if (!aplicar) {
  console.log(`DRY · crearía el paquete «${NOMBRE}» en la obra ${OBRA} por $ 9.900.000. Corré con --aplicar.`)
  await closePool(); process.exit(0)
}

const { rows } = await query(
  `insert into public.subcontrato
     (obra_id, proveedor_texto, nombre, alcance, cantidad, unidad, precio_contratado, moneda,
      estado, documentacion_ok, notas)
   values ($1, 'PEDRO TELLO', $2, 'Hormigonado de pisos, 400 m² + 600 m² × 3', 2200, 'm2',
           9900000, 'ARS', 'contratado', false, $3)
   returning id`,
  [OBRA, NOMBRE, NOTAS],
)
console.log(`CREADO · ${rows[0].id}`)
await closePool()
