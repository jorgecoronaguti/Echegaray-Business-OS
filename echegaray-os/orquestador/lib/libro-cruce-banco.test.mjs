// EL CRUCE DEL LIBRO CONTRA EL EXTRACTO — los casos medidos sobre el Sheet vivo el 17/08/2026.
//
// Cada caso de acá salió de `_MOVIMIENTOS` y `_BANCO_RAW` reales, con su importe al centavo. No son
// datos de laboratorio: son las filas que CAJA publicaba como "DEUDA ATRASADA Y DEL MES".

import test from 'node:test'
import assert from 'node:assert/strict'

import { movimiento, SALE } from './libro-movimientos.mjs'
import { NAT } from './banco-santander.mjs'
import {
  cruzarLibroContraBanco, naturalezaEsperada, MODO, MODO_DE_NATURALEZA, VEREDICTO_CRUCE, HOLGURA_MENSUAL,
} from './libro-cruce-banco.mjs'

/** Los seriales reales de agosto de 2026, para que los casos se lean como se leen en el archivo. */
const S = { '07/08': 46241, '10/08': 46244, '11/08': 46245, '17/08': 46251, '06/08': 46240, '31/08': 46265 }

const deb = (fecha, importe, naturaleza, fila, concepto = '') => ({ fecha, importe, naturaleza, fila, concepto })

/** El F931 de julio tal cual lo emite `deCargasSociales`: proyección de la cadena, contraparte ARCA. */
const f931Julio = () => movimiento({
  fecha: S['10/08'],
  signo: SALE,
  importe: 7074772,
  concepto: 'F931 · nómina de jul-26',
  contraparte: 'ARCA',
  rubro: 'Nómina · Cargas sociales',
  estado: 'VENCIDO',
  origen: { pestana: 'Cargas Sociales', fila: 'F931 · devengado 7' },
})

/** La cuota del prendario tal cual sale de Compras: rubro Financiero, proveedor "Banco". */
const cuotaPrendario = () => movimiento({
  fecha: S['07/08'],
  signo: SALE,
  importe: 1282811,
  concepto: 'Banco',
  contraparte: 'Banco',
  rubro: 'Financiero',
  estado: 'VENCIDO',
  instrumento: 'transferencia',
  origen: { pestana: 'Compras', fila: 871 },
})

// ── EL DEFECTO QUE ESTE MÓDULO CIERRA ─────────────────────────────────────────────────────────────

test('EL DEFECTO: el F931 de julio que el banco pagó el 11/08 dejaba de contarse como deuda', () => {
  // El único pago de servicios AFIP de agosto, al centavo, de `_BANCO_RAW` f373.
  const debitos = [deb(S['11/08'], 8235741.96, NAT.afip, 373, 'Pago de servicios - Imp.afip')]
  const libro = [f931Julio()]

  const r = cruzarLibroContraBanco(libro, debitos, { corte: 46248 })
  const v = r.veredictos.get(0)

  assert.equal(v.veredicto, VEREDICTO_CRUCE.banco,
    'el banco pagó $8.235.741,96 de AFIP el 11/08 y la obligación de $7.074.772 vencía el 10/08: '
    + 'el pago la contiene y el libro no puede seguir publicándola como deuda')
  assert.equal(v.fecha, S['11/08'], 'la fecha del movimiento pasa a ser la del débito, no la del vencimiento')
  assert.deepEqual(v.filas, [373], 'tiene que decir QUÉ fila del extracto lo prueba')
})

test('el excedente del pago agregado se reporta: no se lo come el emparejamiento', () => {
  const debitos = [deb(S['11/08'], 8235741.96, NAT.afip, 373)]
  const r = cruzarLibroContraBanco([f931Julio()], debitos, { corte: 46248 })
  // $8.235.741,96 − $7.074.772 = $1.160.969,96 que ninguna obligación del libro explica.
  const sobra = r.sobrantes.find((s) => s.fila === 373)
  assert.ok(sobra, 'el débito que sobró plata tiene que quedar nombrado')
  assert.equal(Math.round(sobra.sobrante * 100) / 100, 1160969.96)
})

test('la cuota del prendario del 07/08: única de cada lado y el MISMO día', () => {
  // `_BANCO_RAW` f366, al centavo. Es $1.033 MENOR que la cuota proyectada en Compras.
  const debitos = [deb(S['07/08'], 1281778.17, NAT.prendario, 366, 'Prestamos prendarios')]
  const r = cruzarLibroContraBanco([cuotaPrendario()], debitos, { corte: 46248 })
  const v = r.veredictos.get(0)

  assert.equal(v.veredicto, VEREDICTO_CRUCE.banco)
  assert.equal(v.cubierto, 1281778.17,
    'la obligación se cierra por lo que el banco DEBITÓ, no por lo que la planilla proyectaba: '
    + 'entre una proyección y un hecho, manda el hecho')
  assert.equal(v.fecha, S['07/08'])
})

// ── LO QUE NO SE PUEDE PROBAR NO SE EMPAREJA ──────────────────────────────────────────────────────

test('el pago agregado que NO alcanza para todas las obligaciones no cubre ninguna', () => {
  // Dos F931 pendientes por $7.074.772 cada uno y un débito que sólo alcanza para uno: no hay forma
  // de saber cuál pagó, y elegir "el más viejo" sería inventar un criterio para no quedarse sin
  // respuesta. Es la regla del repo: ante la duda, el compromiso sigue vivo.
  const otro = movimiento({ ...JSON.parse(JSON.stringify(f931Julio())), fecha: S['10/08'], signo: SALE, estado: 'VENCIDO', origen: { pestana: 'Cargas Sociales', fila: 'F931 · devengado 6' } })
  const debitos = [deb(S['11/08'], 8235741.96, NAT.afip, 373)]
  const r = cruzarLibroContraBanco([f931Julio(), otro], debitos, { corte: 46248 })

  assert.equal(r.veredictos.get(0).veredicto, VEREDICTO_CRUCE.contradice)
  assert.equal(r.veredictos.get(1).veredicto, VEREDICTO_CRUCE.contradice)
  assert.ok(r.avisos.some((a) => /no alcanza/i.test(a)), 'y se grita, con monto')
})

test('DOS cuotas del prendario el mismo día: no hay 1:1 y no se empareja ninguna', () => {
  const otra = movimiento({
    fecha: S['07/08'], signo: SALE, importe: 999999, concepto: 'Banco', contraparte: 'Banco',
    rubro: 'Financiero', estado: 'VENCIDO', instrumento: 'transferencia',
    origen: { pestana: 'Compras', fila: 999 },
  })
  const debitos = [deb(S['07/08'], 1281778.17, NAT.prendario, 366)]
  const r = cruzarLibroContraBanco([cuotaPrendario(), otra], debitos, { corte: 46248 })

  assert.equal(r.veredictos.get(0).veredicto, VEREDICTO_CRUCE.contradice)
  assert.equal(r.veredictos.get(1).veredicto, VEREDICTO_CRUCE.contradice)
})

test('la cuota del prendario de OTRO día no la explica el débito: el modo cuota exige fecha idéntica', () => {
  const debitos = [deb(S['06/08'], 1281778.17, NAT.prendario, 366)]
  const r = cruzarLibroContraBanco([cuotaPrendario()], debitos, { corte: 46248 })
  assert.notEqual(r.veredictos.get(0).veredicto, VEREDICTO_CRUCE.banco)
})

test('un débito sólo respalda a UN movimiento: `usados` lo consume', () => {
  const debitos = [deb(S['11/08'], 8235741.96, NAT.afip, 373)]
  const usados = new Set([373])
  const r = cruzarLibroContraBanco([f931Julio()], debitos, { corte: 46248, usados })
  assert.notEqual(r.veredictos.get(0).veredicto, VEREDICTO_CRUCE.banco,
    'el débito ya reclamado por otro movimiento no puede pagar esta obligación otra vez')
})

test('lo que vence después del corte del extracto no es deuda sin probar: es futuro', () => {
  const futura = movimiento({
    fecha: S['31/08'], signo: SALE, importe: 7074772, concepto: 'F931 · nómina de ago-26',
    contraparte: 'ARCA', rubro: 'Nómina · Cargas sociales', estado: 'COMPROMETIDO',
    origen: { pestana: 'Cargas Sociales', fila: 'F931 · devengado 8' },
  })
  const r = cruzarLibroContraBanco([futura], [deb(S['11/08'], 8235741.96, NAT.afip, 373)], { corte: 46248 })
  assert.equal(r.veredictos.get(0).veredicto, VEREDICTO_CRUCE.futuro)
})

test('el vencimiento anterior al extracto queda FUERA_DE_VENTANA, no impago', () => {
  const vieja = movimiento({
    fecha: 46050, signo: SALE, importe: 5000000, concepto: 'F931 · nómina de feb-26',
    contraparte: 'ARCA', rubro: 'Nómina · Cargas sociales', estado: 'VENCIDO',
    origen: { pestana: 'Cargas Sociales', fila: 'F931 · devengado 2' },
  })
  const r = cruzarLibroContraBanco([vieja], [deb(S['11/08'], 8235741.96, NAT.afip, 373)],
    { corte: 46248, desdeExtracto: 46170 })
  assert.equal(r.veredictos.get(0).veredicto, VEREDICTO_CRUCE.fueraDeVentana,
    'el extracto empieza el 28/05: sobre febrero NO puede opinar, y decir "impago" sería inventar')
})

// ── LO QUE YA TIENE DUEÑO NO SE CRUZA DOS VECES ───────────────────────────────────────────────────

test('los jornales y los cheques NO los toca este módulo: ya tienen su propio cruce', () => {
  const jornal = movimiento({
    fecha: S['10/08'], signo: SALE, importe: 5133267, concepto: 'Jornales · quincena al 2026-07-31',
    rubro: 'Nómina · Jornales de obra', estado: 'VENCIDO',
    origen: { pestana: 'Jornales por Quincena', fila: 'Quincenas reales:7' },
  })
  const cheque = movimiento({
    fecha: S['17/08'], signo: SALE, importe: 470944, concepto: 'Corralon Progreso · cheque 312',
    rubro: 'Materiales Mantenimiento', estado: 'COMPROMETIDO', instrumento: 'cheque',
    numeroCheque: '312', origen: { pestana: 'Compras', fila: 913 },
  })
  const debitos = [deb(S['10/08'], 5133267, NAT.sueldos, 500), deb(S['06/08'], 470944, NAT.cheques, 356)]
  const r = cruzarLibroContraBanco([jornal, cheque], debitos, { corte: 46248 })

  assert.equal(r.veredictos.get(0).veredicto, VEREDICTO_CRUCE.otroDueno)
  assert.equal(r.veredictos.get(1).veredicto, VEREDICTO_CRUCE.otroDueno)
})

test('un ingreso no se cruza: este módulo prueba PAGOS', () => {
  const cobro = movimiento({
    fecha: S['10/08'], signo: 1, importe: 100, concepto: 'cobro', rubro: 'Cobranzas',
    estado: 'COMPROMETIDO', origen: { pestana: 'Cobranzas', fila: 3 },
  })
  const r = cruzarLibroContraBanco([cobro], [], { corte: 46248 })
  assert.equal(r.veredictos.size, 0)
})

test('un movimiento ya REAL no se vuelve a probar', () => {
  const ya = movimiento({ ...f931Julio(), estado: 'REAL' })
  const r = cruzarLibroContraBanco([ya], [deb(S['11/08'], 8235741.96, NAT.afip, 373)], { corte: 46248 })
  assert.equal(r.veredictos.size, 0)
})

// ── EL MAPA NO PUEDE INVENTAR UNA NATURALEZA ──────────────────────────────────────────────────────

test('toda naturaleza que este módulo usa existe en NAT — el rótulo es un contrato con el importador', () => {
  const universo = new Set(Object.values(NAT))
  for (const n of Object.keys(MODO_DE_NATURALEZA)) {
    assert.ok(universo.has(n), `"${n}" no es una naturaleza que el importador escriba: un filtro que `
      + 'no encuentra filas devuelve cero, sin dar un solo error')
  }
})

test('el rubro decide la naturaleza, y el que no tiene contraparte natural no se empareja', () => {
  assert.equal(naturalezaEsperada({ rubro: 'Nómina · Cargas sociales', contraparte: 'ARCA' }), NAT.afip)
  assert.equal(naturalezaEsperada({ rubro: 'Financiero', contraparte: 'Banco' }), NAT.prendario)
  // Los gremiales los cobran FCL/UOCRA/IERIC/FODECO por transferencia, NO ARCA. Mandarlos a AFIP
  // haría que el VEP de ARCA "pagara" una obligación sindical.
  assert.equal(naturalezaEsperada({ rubro: 'Nómina · Gremiales', contraparte: 'FCL · UOCRA' }), null)
  // El IIBB lo cobra DGR San Juan y en el extracto entra como compra con tarjeta de débito.
  assert.equal(naturalezaEsperada({ rubro: 'Impuestos', contraparte: 'DGR San Juan' }), null)
  assert.equal(naturalezaEsperada({ rubro: 'Impuestos', contraparte: 'ARCA' }), NAT.afip)
})

test('el modo de cada naturaleza está declarado: ninguna se empareja "como salga"', () => {
  assert.equal(MODO_DE_NATURALEZA[NAT.afip], MODO.agregado)
  assert.equal(MODO_DE_NATURALEZA[NAT.prendario], MODO.cuota)
  assert.ok(Object.values(MODO).includes(MODO_DE_NATURALEZA[NAT.transferencias]))
})

test('la holgura mensual es menor que medio mes: un pago no puede explicar dos meses', () => {
  assert.ok(HOLGURA_MENSUAL < 15,
    'con holgura ≥15 días el pago de un mes alcanzaría al vencimiento del mes siguiente')
})

// ═══ UN PAGO AGREGADO NO PRUEBA SU COMPOSICIÓN (17/08/2026) ═══
//
// El auditor se negó a firmar el retiro de $7.074.772 del F931 porque salía de una inferencia de
// magnitud —"el banco le pagó a ARCA más de lo que el libro decía deberle"— publicada como hecho.
// Tenía razón: el patrón citado como respaldo se contradecía solo, el pago del 20/07 fue de
// $4.859.763, MENOS que un F931 mensual. Ahora el agregado sólo retira lo que el dueño confirmó.
test('el pago agregado NO retira una obligación que el dueño no confirmó', async () => {
  const { cruzarLibroContraBanco } = await import('./libro-cruce-banco.mjs')
  const mov = [{
    fecha: 46254, signo: -1, importe: 3000000, estado: 'VENCIDO',
    concepto: 'F931 · nómina de ago-26', rubro: 'Nómina · Cargas sociales', contraparte: 'ARCA',
  }]
  const debitos = [{ fila: 1, fecha: 46256, importe: 9000000, naturaleza: 'AFIP' }]
  const r = cruzarLibroContraBanco(mov, debitos, { corte: 46260, desdeExtracto: 46200 })
  const v = r.veredictos.get(0)
  assert.notEqual(v?.veredicto, 'BANCO',
    'que el débito alcance no prueba que contenga esta obligación: no se retira sola')
  assert.match(String(v?.motivo ?? ''), /confirme/,
    'y el motivo tiene que decir que falta la confirmación, no callarse')
})

// La otra mitad: con la confirmación del dueño cargada, SÍ se retira. Es la que destrabó los
// $7.074.772 del F931 de julio el 17/08.
test('el pago agregado SÍ retira la obligación que el dueño confirmó', async () => {
  const { cruzarLibroContraBanco } = await import('./libro-cruce-banco.mjs')
  const { OBLIGACIONES_CONFIRMADAS } = await import('./confirmaciones-del-dueno.mjs')
  const concepto = [...OBLIGACIONES_CONFIRMADAS.keys()][0]
  assert.ok(concepto, 'tiene que haber al menos una confirmación cargada, con su cita')
  const mov = [{
    fecha: 46254, signo: -1, importe: 7074772, estado: 'VENCIDO',
    concepto, rubro: 'Nómina · Cargas sociales', contraparte: 'ARCA',
  }]
  const debitos = [{ fila: 1, fecha: 46256, importe: 8235742, naturaleza: 'AFIP' }]
  const r = cruzarLibroContraBanco(mov, debitos, { corte: 46260, desdeExtracto: 46200 })
  assert.equal(r.veredictos.get(0)?.veredicto, 'BANCO', 'con la palabra del dueño deja de ser deuda')
})
