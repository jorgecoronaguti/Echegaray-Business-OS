// LA FOTO SELLADA ES EXACTAMENTE LO QUE EL CUADRO MUESTRA (dueño, 02/10/2026).
//
// Cifras reales de la Q2-09/2026 (SELECT del 02/10): Maldonado, neto mensual $2.500.000 desde 2026-09-01, recibos del
// estudio Q1-09 $705.532,04 y Q2-09 $685.914,88 → el cuadro dice banco $1.391.446,92 / efectivo $1.108.553,08. El
// cierre iba a sellar banco $0 / efectivo $2.500.000 (el `porBanco` crudo de la línea, que sin el giro en el lote del
// extracto es 0). Tello Juan: recibo $234.963,32; con «banco 0» escrito a mano todo va en efectivo.
//
// MUTACIONES que estos tests ponen en rojo (corridas el 02/10):
//  - `escribirFoto` vuelve a escribir `l.porBanco`/`l.enEfectivo`/`l.total` → «el cierre escribe la plata de la foto».
//  - `delMensual` toma `l.porBanco` en vez de `pagoDelMensual` → «mensualizado en la 2ª».
//  - `fotoDeLaLinea` sin el corte de `seLiquidaEnLa2da` → «la 1ª del mensual».
//  - `esperaPago` que cuenta al mensual de la 1ª → «autocierre en la 1ª».
//  - `cerrarQuincenaAction` sin `registrarFalla` → «un cierre que falla deja rastro».

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { quincenaDe } from './quincena.ts'
import { armarCuadros, type DatosDeCuadros, type FilaRecibo } from './liquidacionCuadros.ts'
import { aplicarOverrides, type LineaConOverrides } from './liquidacionOverrides.ts'
import { liquidarLinea, type GrupoLiquidacion } from './liquidacionQuincena.ts'
import { entradaDeBlanco, type ReciboDeSueldo } from './sueldoBlancoNegro.ts'
import { estadoDeCierre } from './liquidacionCierre.ts'
import { pagoDelMensual } from './liquidacionPorTipo.ts'
import { fotoDeLaLinea, fotosDelGrupo, type PlataSellada } from './fotoDelCierre.ts'
import { decisionDeAutocierre, type LineaMarcable } from './autocierreDeQuincena.ts'

const CUIL = '20359232668'
const rec = (periodo: string, neto: number): FilaRecibo => ({ cuil: CUIL, periodo, neto, fecha_pago: null } as unknown as FilaRecibo)
const SEPT = [rec('Q1-09/2026', 705532.04), rec('Q2-09/2026', 685914.88)]
const TARIFA = { persona_id: 'm', desde: '2026-09-01', valor_hora: null, neto_mensual: 2500000, origen: 'acuerdo:SUELDO_NETO_OFICINA' }

const datos = (dia: string): DatosDeCuadros => ({
  quincena: quincenaDe(dia),
  personas: [{ id: 'm', nombre: 'Maldonado E.', nombreOrden: 'Maldonado', cuil: CUIL, enLaEmpresa: true, esJefe: true }],
  tarifas: [TARIFA],
  horas: new Map() as unknown as DatosDeCuadros['horas'],
  recibos: SEPT, adelantos: [], redondeos: new Map(),
})
const mensual = (dia: string): { l: LineaConOverrides; grupo: GrupoLiquidacion } => {
  const c = armarCuadros(datos(dia)).find((x) => x.lineas.some((l) => l.personaId === 'm'))!
  return { l: aplicarOverrides(c.lineas.find((l) => l.personaId === 'm')!, {}, c.grupo, null, null, null), grupo: c.grupo }
}

/** El CHECK `liquidacion_linea_cierra` de la base: round(total, 2) = round(por_banco + en_efectivo, 2). */
const cumpleElCheck = (p: PlataSellada): boolean =>
  Math.round(p.total * 100) === Math.round((p.porBanco + p.enEfectivo) * 100)

const plata = (f: ReturnType<typeof fotoDeLaLinea>): PlataSellada => {
  assert.ok(f.ok, f.ok ? '' : f.motivo)
  return f.plata
}

test('mensualizado en la 2ª: la foto sella banco = los dos recibos del estudio y efectivo = sueldo − banco, como el cuadro', () => {
  const { l, grupo } = mensual('2026-09-20')
  // LA TRAMPA: el campo crudo de la línea. Sin el giro en el lote del extracto, `porBanco` es 0.
  assert.equal(l.porBanco, 0)
  const cuadro = pagoDelMensual(l)
  assert.equal(cuadro.banco, 1391446.92)
  const p = plata(fotoDeLaLinea(l, grupo))
  assert.deepEqual(p, { cobra: 2500000, porBanco: 1391446.92, enEfectivo: 1108553.08, total: 2500000 })
  assert.equal(p.porBanco, cuadro.banco, 'banco de la foto = banco del cuadro')
  assert.equal(p.enEfectivo, cuadro.negro, 'efectivo de la foto = efectivo del cuadro')
  assert.ok(cumpleElCheck(p), 'banco + efectivo = total a 2 decimales')
})

test('la 1ª del mensual: se sella sin plata, no traba el cierre, y la cerrada sigue mostrando el recibo como dato', () => {
  const { l, grupo } = mensual('2026-09-05')
  assert.equal(l.seLiquidaEnLa2da, true)
  const f = fotoDeLaLinea(l, grupo)
  assert.ok(f.ok)
  assert.equal(f.liquida, false)
  assert.deepEqual(f.plata, { cobra: 0, porBanco: 0, enEfectivo: 0, total: 0 })
  assert.ok(cumpleElCheck(f.plata))
  assert.equal(estadoDeCierre([l]).puedeCerrar, true, 'su cobra vacío no es un pendiente')
  assert.equal(fotosDelGrupo([l], grupo).ok, true, 'antes: «Hay líneas sin importe calculable», el cierre de la 1ª no salía')
  // RELEÍDA DESPUÉS DE CERRAR (la foto en 0 + la marca de la 1ª): ni «$0» de sueldo ni banco 0; el recibo como dato.
  const cerrada = { ...l, cobra: 0, porBanco: 0, sello: { conLinea: true } } as LineaConOverrides
  const p = pagoDelMensual(cerrada)
  assert.equal(p.banco, 705532.04)
  assert.equal(p.sueldo, null)
  assert.equal(p.total, null)
  assert.equal(p.saldoTotal, null, 'la 1ª no deja saldo que arrastrar')
})

// El recibo del estudio de Tello Juan, Q2-09/2026: neto $234.963,32 (50 h × $6.468).
const RECIBO: ReciboDeSueldo = {
  personaId: 'tello', cuil: '20304020181', periodo: 'Q2-09/2026', categoria: 'Oficial',
  valorHora: 6468, horasBlanco: 50, bruto: 323400, neto: 234963.32, driveFileId: 'pdf',
}
const tello = (porBanco?: number): LineaConOverrides => aplicarOverrides(liquidarLinea({
  personaId: 'tello', nombre: 'TELLO JUAN', nombreOrden: 'TELLO JUAN', horas: 100,
  tarifa: { valorHora: 6400, netoMensual: null, desde: '2026-09-16', origen: 'test' },
  adelanto: 0, yaTransferido: 0, reciboNeto: 234963.32, giroEnElLote: true,
}, 'obreros'), porBanco == null ? {} : { porBanco }, 'obreros', null, entradaDeBlanco({
  personaId: 'tello', cuil: '20304020181', periodo: 'Q2-09/2026', recibos: [RECIBO], pisoCategoria: 6468, netoDeNomina: 234963.32,
}))

test('banco 0 escrito a mano: la foto sella banco 0 y todo en efectivo, el total no cambia', () => {
  const sinTocar = plata(fotoDeLaLinea(tello(), 'obreros'))
  assert.equal(sinTocar.porBanco, 234963.32)
  const l = tello(0)
  const p = plata(fotoDeLaLinea(l, 'obreros'))
  assert.equal(p.porBanco, 0)
  assert.equal(p.enEfectivo, l.pago.negro)
  assert.equal(p.enEfectivo, sinTocar.total, 'el 0 sólo mueve el canal')
  assert.equal(p.total, sinTocar.total)
  assert.ok(cumpleElCheck(p))
})

test('una fila que no se puede sellar como el cuadro traba con el nombre y el motivo, sin jerga', () => {
  const l = { ...tello(), cobra: 999999.99 } as LineaConOverrides
  const r = fotosDelGrupo([tello(), { ...l, nombre: 'Pérez Ana' }], 'obreros')
  assert.equal(r.ok, false)
  assert.match(r.ok ? '' : r.error, /^No cerré: Pérez Ana su fila no cierra: banco \+ efectivo da/)
})

test('autocierre en la 1ª: el mensual que no se paga ahí no cuenta como pendiente de pago', () => {
  const { l, grupo } = mensual('2026-09-05')
  const m = { ...l, adelanto: 0, yaTransferido: 0, pagadaEn: null } as LineaMarcable
  const j = { ...tello(), personaId: 'j', adelanto: 0, yaTransferido: 0, pagadaEn: null } as LineaMarcable
  const d = decisionDeAutocierre({ lineas: [m, j], personaId: 'j', grupo })
  assert.equal(d.todasPagadas, true, 'antes: esperaba la marca de pago del mensual, que el servidor rechaza')
  assert.equal(d.pendientes.some((p) => p.traba), false)
  const fotoM = d.foto.find((f) => f.persona_id === 'm')!
  assert.deepEqual([fotoM.cobra, fotoM.por_banco, fotoM.en_efectivo, fotoM.total], [0, 0, 0, 0], 'no sella plata a pagar')
  // Un grupo hecho sólo de mensuales en la 1ª no tiene a quién pagar: no se dispara solo.
  assert.equal(decisionDeAutocierre({ lineas: [m], personaId: 'm', grupo }).todasPagadas, false)
})

const ACCION = readFileSync(new URL('./liquidacionCierreActions.ts', import.meta.url), 'utf8')

test('el cierre escribe la plata de la foto, no los campos crudos de la línea', () => {
  const i = ACCION.indexOf('async function escribirFoto(')
  const cuerpo = ACCION.slice(i, i + ACCION.slice(i).indexOf('\n}\n'))
  for (const [col, campo] of [['cobra', 'cobra'], ['por_banco', 'porBanco'], ['en_efectivo', 'enEfectivo'], ['total', 'total']]) {
    assert.match(cuerpo, new RegExp(`${col}: plata\\.${campo},`), `${col} sale de fotoDeLaLinea`)
  }
  assert.match(ACCION, /fotosDelGrupo\(cuadro\.lineas, cuadro\.grupo\)/)
})

test('un cierre que falla deja rastro en app_registro con quincena, grupo y mensaje literal', () => {
  const i = ACCION.indexOf('export async function cerrarQuincenaAction(')
  const cuerpo = ACCION.slice(i, i + ACCION.slice(i).indexOf('\n}\n'))
  assert.match(cuerpo, /if \(!r\.ok\) await registrarFalla\(entrada, r\)/)
  const j = ACCION.indexOf('async function registrarFalla(')
  const reg = ACCION.slice(j, j + ACCION.slice(j).indexOf('\n}\n'))
  assert.match(reg, /await registrar\(\{/)
  assert.match(reg, /mensaje: r\.error/)
  for (const campo of ['desde', 'hasta', 'grupo']) assert.match(reg, new RegExp(`${campo}:`))
})

// Dueño, 03/10/2026, con la captura del cierre rechazado: «al marcar el último pagado sale ese error» — once filas con la
// resta del recibo anterior sumada al banco «no cerraban» por exactamente esa resta.
test('la resta del recibo anterior va en el banco y no traba el cierre: la fila cierra contra cobra + resta', () => {
  const base = { modalidad: 'quincenal', cobra: 669801.32, porBanco: 289543.8, reciboNeto: 234963.32, pagadoBanco: null, pagadoEfectivo: null,
    manual: {}, seLiquidaEnLa2da: false, pagadoEnLa1ra: null, sello: null, pagoSinRegistrar: false } as unknown as Parameters<typeof fotoDeLaLinea>[0]
  const conResta = { ...base, pago: { banco: 289543.8, negro: 434838 }, arrastre: { importe: 54580.48, estado: 'aplicado' } } as unknown as Parameters<typeof fotoDeLaLinea>[0]
  const f = fotoDeLaLinea(conResta, 'obra' as GrupoLiquidacion)
  assert.equal(f.ok, true, f.ok ? '' : f.motivo)
  if (f.ok) assert.deepEqual(f.plata, { cobra: 669801.32, porBanco: 289543.8, enEfectivo: 434838, total: 724381.8 })
  // MUTACIÓN: sin la resta declarada, la misma diferencia SÍ traba.
  const sinResta = { ...conResta, arrastre: null } as unknown as Parameters<typeof fotoDeLaLinea>[0]
  assert.equal(fotoDeLaLinea(sinResta, 'obra' as GrupoLiquidacion).ok, false)
})
