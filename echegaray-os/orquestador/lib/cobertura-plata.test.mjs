// LA REGLA 8, EN FRÍO — cada test es un peso que hoy no llega al Cash Flow.
//
// Todos los casos de acá se midieron en el archivo vivo el 06/09/2026 antes de escribirse. No son
// hipótesis: son las filas que estaban afuera, con su nombre y su importe.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MOTIVOS, comprobantesEnElLibro, filasEnElLibro, huecosDePlata, porMotivo,
  residuoDeCobranzas, residuoDeCompras,
} from './cobertura-plata.mjs'

// El encabezado REAL de la fila 3 de Compras, con los mismos rótulos que verifica libro-extractores.
const ENC = ['Proveedor', 'CUIT (OS)', 'N° Comprobante', 'Total', 'Estado', 'Tipo pago',
  'Rubro de caja', 'Fecha de caja', 'Detalles / Obra', 'Estado pago', 'Monto Pagado',
  'Cliente / Asignación', 'Monto Parcial 2']
const compras = (...filas) => [[], [], ENC, ...filas]
/** Una fila de Compras. Los defaults son el caso normal: pendiente, con fecha, sin pagos a cuenta. */
const fila = (o = {}) => [
  o.proveedor ?? 'Prov SRL', o.cuit ?? '30-11111111-1', o.comprobante ?? '0001-00000001',
  o.total ?? 100000, o.estado ?? 'Pendiente', 'Transferencia', o.rubro ?? 'Materiales Civil',
  'fechaCaja' in o ? o.fechaCaja : 46000, '', '', o.montoPagado ?? '', '', o.parcial2 ?? '',
]
/** Un movimiento del Libro, tal como lo devuelve el auditor tras leer `_MOVIMIENTOS`. */
const mov = (o = {}) => ({
  origen: o.origen ?? 'Compras', fila: o.fila ?? '4',
  cuit: o.cuit ?? '', comprobante: o.comprobante ?? '', importe: o.importe ?? 0,
})
const de = (residuo, n) => residuo.find((r) => r.fila === n)

test('la fila SIN "Fecha de caja" es un HUECO: deCompras la descarta sin avisar y la plata no llega', () => {
  // EL DEFECTO REAL (06/09/2026): 21 filas de Compras sin fecha de caja, $687.249, de los cuales
  // $171.314 seguían PENDIENTES. `deCompras` hace `if (cargada === null) continue` sin un solo aviso.
  // La única señal era el control del pie de Proveedores, que apuntaba al síntoma equivocado ("un
  // medio de pago que no tiene columna") porque esas filas tienen también el Tipo pago vacío.
  const r = residuoDeCompras(compras(fila({ fechaCaja: '', total: 4903 })), [])
  assert.equal(de(r, 4).motivo, 'SIN_FECHA_DE_CAJA')
  assert.equal(MOTIVOS.SIN_FECHA_DE_CAJA.hueco, true, 'si deja de ser hueco, nadie se entera de los $171.314')
  assert.equal(huecosDePlata(r).length, 1)
})

test('la fila que SÍ está en el Libro no es un hueco — el control tiene que poder decir que sí', () => {
  const r = residuoDeCompras(compras(fila()), [mov({ fila: '4' })])
  assert.equal(de(r, 4).motivo, 'EN_EL_LIBRO')
  assert.deepEqual(huecosDePlata(r), [])
})

test('la fila del Libro decorada ("4 · cheque 12", "4:real") sigue siendo la fila 4 de la fuente', () => {
  // El libro parte una fila en dos cuando hay un cheque en vuelo y le agrega el sufijo. Sin esta
  // normalización, TODA fila partida se reportaría como hueco: cientos de falsos positivos.
  assert.ok(filasEnElLibro([mov({ fila: '4 · cheque 12' })], 'Compras').has('4'))
  assert.ok(filasEnElLibro([mov({ fila: '4:real' })], 'Compras').has('4'))
  assert.ok(!filasEnElLibro([mov({ fila: '4', origen: 'Cobranzas' })], 'Compras').has('4'))
})

test('mismo comprobante y OTRO importe: el colapso borra plata y es HUECO', () => {
  // EL DEFECTO REAL: `claveDe` arma `comp:CUIT:NÚMERO:SIGNO` y NO mira el importe. Medido en vivo, 11
  // filas por $5.745.493 —Industrias Castel $3.240.300, SIDERAGRO $1.619.197— colapsaron contra una
  // fila de OTRO importe y desaparecieron del Cash Flow. Compras ya las marca "⚠ N° repetido"; ese
  // aviso no llega al Libro.
  const r = residuoDeCompras(
    compras(fila({ total: 3240300, comprobante: '00003-00012792', estado: 'Pagado', montoPagado: 3240300 })),
    [mov({ fila: '3', cuit: '30-11111111-1', comprobante: '00003-00012792', importe: 2000000 })],
  )
  assert.equal(de(r, 4).motivo, 'COLAPSADA_POR_COMPROBANTE_REPETIDO')
  assert.equal(MOTIVOS.COLAPSADA_POR_COMPROBANTE_REPETIDO.hueco, true)
})

test('mismo comprobante y MISMO importe: es la misma factura cargada dos veces, no es hueco', () => {
  // La contracara, y por eso son dos motivos: si esto se reportara como hueco, el control gritaría
  // por una deduplicación que funciona — y un control que grita por algo correcto se deja de mirar.
  const r = residuoDeCompras(
    compras(fila({ total: 77384, comprobante: '0013-00011634', estado: 'Pagado', montoPagado: 77384 })),
    [mov({ fila: '3', cuit: '30-11111111-1', comprobante: '0013-00011634', importe: 77384 })],
  )
  assert.equal(de(r, 4).motivo, 'DUPLICADO_EXACTO')
  assert.equal(MOTIVOS.DUPLICADO_EXACTO.hueco, false)
  assert.deepEqual(huecosDePlata(r), [])
})

test('la fila sin gemelo, con fecha y con rubro común, es SIN_MOTIVO_CONOCIDO y es HUECO', () => {
  // El caso peor: plata que desaparece por un camino que nadie modeló. Nunca se absorbe en "otros".
  const r = residuoDeCompras(compras(fila({ comprobante: '9999-99999999' })), [])
  assert.equal(de(r, 4).motivo, 'SIN_MOTIVO_CONOCIDO')
  assert.equal(MOTIVOS.SIN_MOTIVO_CONOCIDO.hueco, true)
})

test('la nómina y las cargas de la cadena NO son huecos: entran por otra puerta declarada', () => {
  const r = residuoDeCompras(compras(
    fila({ rubro: 'Nómina · Jornales de obra' }),
    fila({ rubro: 'Nómina · Cargas sociales' }),
  ), [])
  assert.equal(de(r, 4).motivo, 'NOMINA_POR_JORNALES')
  assert.equal(de(r, 5).motivo, 'CARGAS_POR_LA_CADENA')
  assert.deepEqual(huecosDePlata(r), [])
})

test('una carga social YA PAGADA que falta SÍ es hueco: la cadena sólo puede tapar una previsión', () => {
  // El hecho le gana a la proyección (libro-extractores-cargas.mjs). Sin esta distinción, cualquier
  // pago real de cargas que se perdiera quedaría absuelto por una regla que no lo cubre.
  const r = residuoDeCompras(
    compras(fila({ rubro: 'Nómina · Cargas sociales', estado: 'Pagado', montoPagado: 100000, comprobante: '' })),
    [],
  )
  assert.equal(de(r, 4).motivo, 'SIN_MOTIVO_CONOCIDO')
})

test('"sin pagar" no miente: una fila PAGADA debe cero, aunque el extractor la emita por el total', () => {
  // `pendienteDeCompra` devuelve el TOTAL para la fila cerrada —es su contrato: por cuánto entra al
  // libro, no cuánto se debe—. Usado tal cual, el informe publicaba "$427.499.815 todavía sin mover"
  // sobre 833 facturas ya pagadas. Son dos ventanas distintas y no se mezclan.
  const r = residuoDeCompras(compras(
    fila({ total: 500000, estado: 'Pagado', montoPagado: 500000 }),
    fila({ total: 500000, estado: 'Pendiente', montoPagado: 200000 }),
  ), [])
  assert.equal(de(r, 4).pendiente, 0)
  assert.equal(de(r, 5).pendiente, 300000)
})

test('la NOTA DE CRÉDITO pendiente cuenta en NEGATIVO: es plata que vuelve, no que sale', () => {
  // En magnitud, las dos notas de Corralón Progreso inflaban el hueco de $171.314 a $387.858: su
  // importe contado del lado del egreso, dos veces. Con el neto, el número reconcilia exactamente con
  // el que publica el control del pie de "Proveedores" — otra fuente, otro camino, el mismo peso.
  const r = residuoDeCompras(compras(fila({ total: -105858, fechaCaja: '' })), [])
  assert.equal(de(r, 4).pendiente, -105858)
  assert.equal(porMotivo(r)[0].pendiente, -105858)
})

// ── COBRANZAS ─────────────────────────────────────────────────────────────────────────────────────
const ENC_COB = ['Obra / Cliente', 'TOTAL a cobrar (neto de retenciones)', 'Estado', 'Fecha cobro']
const cobranzas = (...filas) => [[], [], [], ENC_COB, ...filas]

test('COBRANZAS: sin "Fecha cobro" el ingreso no aparece en ninguna semana ni en ningún mes', () => {
  const r = residuoDeCobranzas(cobranzas(['ARCOR', 5000000, 'Pendiente', '']), [])
  assert.equal(de(r, 5).motivo, 'SIN_FECHA_DE_COBRO')
  assert.equal(MOTIVOS.SIN_FECHA_DE_COBRO.hueco, true)
})

test('COBRANZAS: el valor endosado y la venta cancelada NO son huecos — están declarados', () => {
  const r = residuoDeCobranzas(cobranzas(
    ['LA ESTRELLA', 20000000, 'Cobrado', 46000],
    ['MESSINA', 3000000, 'A cancelar', 46000],
  ), [])
  assert.equal(de(r, 5).motivo, 'ENDOSADA_O_EXCLUIDA')
  assert.equal(de(r, 6).motivo, 'CANCELADA')
  assert.deepEqual(huecosDePlata(r), [])
})

test('COBRANZAS: sin el encabezado ROMPE — no puede decir "todo bien" sobre cero filas', () => {
  // El modo de falla más caro: un control que no encuentra su columna, lee cero filas y se declara
  // verde. Es el mismo defecto que los tres controles publicados con los insumos vacíos.
  assert.throws(() => residuoDeCobranzas([[], [], [], ['Cliente', 'Monto'], ['X', 1]], []),
    /no encuentro "Estado"/)
})

test('comprobantesEnElLibro normaliza el número: "0001-00000001" y "1-1" son el mismo comprobante', () => {
  // Es el mismo criterio de `claveDe` (soloDigitos). Con otra clave, este control mediría un colapso
  // que no ocurre — y reportaría huecos inventados.
  const m = comprobantesEnElLibro([mov({ cuit: '30-11111111-1', comprobante: '0001-00000001', importe: 10 })])
  assert.equal(m.get('30111111111:100000001')?.[0]?.importe, 10)
  assert.equal(m.size, 1, 'un movimiento sin CUIT ni comprobante no debe crear una clave vacía')
})
