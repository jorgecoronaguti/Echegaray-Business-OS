// SOLO LECTURA — corre la mitad de caja del ciclo con el modelo nuevo. Se borra al terminar.
import { makeGoogleClient, WORKSPACE_SCOPES } from './orquestador/lib/google.mjs'
import { loadConfig } from './orquestador/lib/config.mjs'
import { query, closePool } from './orquestador/lib/db.mjs'
import { leerFlujoDeFondos, vencidoComercialDe } from './orquestador/lib/tesoreria/lectura-flujo.mjs'
import { reconstruirPosicion } from './orquestador/lib/tesoreria/posicion-caja.mjs'
import { proyectarLiquidez } from './orquestador/lib/tesoreria/proyeccion-liquidez.mjs'
import { calcularExcedente } from './orquestador/lib/tesoreria/excedente.mjs'
import { politicaVigente, filaCajaRestringida } from './orquestador/lib/tesoreria/ledger.mjs'

const fmt = (n) => (Number.isFinite(Number(n)) ? '$' + Math.round(Number(n)).toLocaleString('es-AR') : String(n))
const google = makeGoogleClient({ config: loadConfig(), scopes: WORKSPACE_SCOPES })
const hoy = new Date('2026-08-03T12:00:00')

const filaReserva = await politicaVigente(query, 'reserva_minima')
const filaRestringida = await filaCajaRestringida(query)
const flujo = await leerFlujoDeFondos({ google }, { hoy, dias: 90 })
const pos = await reconstruirPosicion({ google }, {
  hoy, filaReserva, filaRestringida,
  vencidoComercial: vencidoComercialDe(flujo),
  movimientosVencidos: flujo.movimientos.filter((m) => m.status === 'vencido' && m.direction === 'out'),
})
console.log('POSICION:', pos.estado)
console.log('  caja_real            ', fmt(pos.caja_real))
console.log('  ars_liquida          ', fmt(pos.composicion?.ars_liquida))
console.log('  valores_a_depositar  ', fmt(pos.composicion?.valores_a_depositar))
console.log('  comprometida (vencido)', fmt(pos.caja_comprometida))
console.log('  restringida          ', fmt(pos.caja_restringida?.restricted_cash_amount), pos.caja_restringida?.restricted_cash_source)
console.log('  restringida x ventana ', JSON.stringify(pos.caja_restringida_por_ventana?.[30]))
console.log('  doble conteo         ', JSON.stringify(pos.doble_conteo_cheques_compras))
console.log('  reserva              ', fmt(pos.caja_minima), pos.reserva?.estado)
console.log('  techo T+0            ', fmt(pos.techo_tecnico_preliminar))
console.log('  faltantes            ', JSON.stringify(pos.datos_faltantes))

const proy = proyectarLiquidez(flujo, { cajaInicial: pos.caja_real })
const exc = await calcularExcedente(pos, proy, { hoy, dias: flujo.dias })
console.log('\nEXCEDENTE POR PLAZO:')
for (const v of exc.ventanas_por_plazo) {
  console.log(`  ${v.dias}d  monto ${fmt(v.monto_maximo).padStart(16)} | piso ${fmt(v.piso).padStart(16)} (${v.fecha_tension}) | neto@venc ${fmt(v.neto_al_vencimiento).padStart(16)}`)
  console.log(`        entradas ${fmt(v.entradas)} · salidas ${fmt(v.salidas)} · sin cobranzas ${fmt(v.monto_sin_creerle_a_las_cobranzas)} · base ${fmt(v.escenarios.base.monto_maximo)}`)
}
console.log('\nSOLAPE RESERVA:', JSON.stringify(exc.solape_reserva))
console.log('\nBLOQUES:')
for (const v of exc.ventanas) console.log(`  ${v.bloque} ${String(v.dias_libres ?? '-').padStart(3)}d  ${fmt(v.monto_maximo)}  ${v.motivo ?? ''}`)
await closePool()
