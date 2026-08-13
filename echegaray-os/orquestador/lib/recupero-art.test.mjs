// EL RECUPERO DE ART EN FRÍO — con la orden de pago real del siniestro 3012927.
//
// Los casos son los defectos que este registro puede cometer y que cuestan plata:
// un desglose que no cierra, un neteo que cae en la línea equivocada, un prorrateo inventado, y un
// recupero dado por cobrado sin que el extracto lo pruebe.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CONCEPTOS_ILT, LINEAS, normalizarRecupero, imputar, respaldoDelCobro, formatRecupero,
} from './recupero-art.mjs'

// Orden de pago 6969379 de Prevención ART, textual. Los cuatro conceptos suman $914.612,42.
const REAL = {
  siniestro: '3012927',
  solicitud: '1000705628',
  orden_pago: '6969379',
  aseguradora: 'Prevención ART',
  cuit_aseguradora: '30-68436191-7',
  trabajador: 'QUIROGA ALEXANDER SEBASTIAN',
  documento: '44.527.554',
  contingencia: 'ilt',
  fecha_cobro: '2026-08-11',
  cbu_acreditacion: '0720179620000009138368',
  importe_solicitado: 1042045.00,
  importe_liquidado: 914612.42,
  conceptos: {
    remunerativo: 660628.12,
    sac: 15500.41,
    no_remunerativo: 78020.00,
    contribuciones: 160463.89,
  },
}

test('la orden de pago real se normaliza y el desglose cierra contra lo liquidado', () => {
  const r = normalizarRecupero(REAL)
  assert.equal(r.cabecera.importe_liquidado, 914612.42)
  assert.equal(r.conceptos.length, 4)
  const suma = r.conceptos.reduce((a, c) => a + c.monto, 0)
  assert.equal(Math.round(suma * 100), Math.round(914612.42 * 100))
  // El CUIT se guarda sin puntos ni guiones: es el mismo CUIT del crédito bancario (30684361917).
  assert.equal(r.cabecera.cuit_aseguradora, '30684361917')
})

test('lo que la ART NO pagó queda registrado: es costo del siniestro que se come la empresa', () => {
  const r = normalizarRecupero(REAL)
  assert.equal(r.diferencia, 127432.58)
})

// EL DEFECTO: `orden_pago` en NULL. La identidad del reintegro es (siniestro, orden de pago) y un
// índice único sobre una columna que acepta NULL no restringe: dos corridas del mismo reintegro sin
// número de orden entrarían dos veces y netearían el mes por el doble.
test('sin número de orden, orden_pago es cadena vacía y NO null: la clave tiene que seguir restringiendo', () => {
  const sinOrden = { ...REAL }
  delete sinOrden.orden_pago
  assert.equal(normalizarRecupero(sinOrden).cabecera.orden_pago, '')
})

// EL DEFECTO: transcribir mal un concepto y que el neteo reduzca un costo por un importe que nadie
// verificó. Si esta guarda se cae, el error entra a la base y de ahí al costo de nómina de dos meses.
test('un desglose que no cierra NO se registra', () => {
  const roto = { ...REAL, conceptos: { ...REAL.conceptos, sac: 15500.00 } }
  assert.throws(() => normalizarRecupero(roto), /no cierra contra lo liquidado/)
})

test('un concepto que no existe en una liquidación de ILT se rechaza en vez de perderse', () => {
  const raro = { ...REAL, conceptos: { ...REAL.conceptos, gastos_medicos: 1000 } }
  assert.throws(() => normalizarRecupero(raro), /conceptos que no existen/)
})

test('falla cerrado sin siniestro, sin fecha o sin importe', () => {
  assert.throws(() => normalizarRecupero({ ...REAL, siniestro: '' }), /siniestro/)
  assert.throws(() => normalizarRecupero({ ...REAL, fecha_cobro: '11/08/2026' }), /fecha_cobro/)
  assert.throws(() => normalizarRecupero({ ...REAL, importe_liquidado: 0 }), /importe_liquidado/)
})

// ═══ LA LÍNEA QUE NETEA CADA CONCEPTO ═══
//
// EL DEFECTO: tirar los $914.612,42 enteros contra "jornales". El costo TOTAL daría igual y las dos
// líneas quedarían mal — y la línea de cargas sociales es la que se compara contra la DDJJ F931.
test('las contribuciones netean CARGAS SOCIALES; el resto, JORNALES', () => {
  const r = normalizarRecupero(REAL)
  const porLinea = (l) => r.conceptos.filter((c) => c.linea === l).reduce((a, c) => a + c.monto, 0)
  assert.equal(Math.round(porLinea('jornales') * 100), Math.round(754148.53 * 100))
  assert.equal(Math.round(porLinea('cargas_sociales') * 100), Math.round(160463.89 * 100))
  assert.deepEqual([...new Set(CONCEPTOS_ILT.map((c) => c.linea))].sort(), [...LINEAS].sort())
})

// ═══ LA IMPUTACIÓN ═══

test('con montos por período, el reparto es EXACTO y no pierde un centavo', () => {
  const r = normalizarRecupero(REAL)
  const imp = imputar(r, [
    { periodo: '2026-06', monto: 500000.00 },
    { periodo: '2026-07', monto: 414612.42 },
  ])
  assert.equal(imp.metodo, 'liquidacion')
  assert.equal(imp.es_estimacion, false)
  const total = imp.renglones.reduce((a, x) => a + x.monto, 0)
  assert.equal(Math.round(total * 100), Math.round(914612.42 * 100))
  // Cada período recibe su parte de CADA concepto, así el neteo cae en la línea correcta mes a mes.
  const jun = imp.renglones.filter((x) => x.periodo === '2026-06')
  assert.equal(jun.length, 4)
})

test('un reparto por período que no suma lo cobrado es un neteo inventado y se rechaza', () => {
  const r = normalizarRecupero(REAL)
  assert.throws(() => imputar(r, [
    { periodo: '2026-06', monto: 500000 },
    { periodo: '2026-07', monto: 300000 },
  ]), /Un reparto que no cierra/)
})

test('con días por período se prorratea, pero el renglón sale marcado como ESTIMACIÓN', () => {
  const r = normalizarRecupero(REAL)
  const imp = imputar(r, [{ periodo: '2026-06', dias: 13 }, { periodo: '2026-07', dias: 30 }])
  assert.equal(imp.metodo, 'prorrateo_dias')
  assert.equal(imp.es_estimacion, true)
  const total = imp.renglones.reduce((a, x) => a + x.monto, 0)
  assert.equal(Math.round(total * 100), Math.round(914612.42 * 100))
  assert.ok(imp.avisos.some((a) => /ESTIMACI[ÓO]N/.test(a)))
})

// EL DEFECTO QUE ESTE CASO EVITA: prorratear "porque hay dos meses declarados" sin tener ni montos ni
// días. Ahí es donde una precisión inventada se convierte en "el costo de junio" para siempre.
test('sin desglose por período NO se prorratea: queda sin imputar y no netea ningún mes', () => {
  const r = normalizarRecupero(REAL)
  const imp = imputar(r, [])
  assert.equal(imp.metodo, 'sin_imputar')
  assert.equal(imp.renglones.length, 4)
  assert.ok(imp.renglones.every((x) => x.periodo === ''))
  // El importe NO se pierde: el cobro es un hecho y sigue estando entero.
  const total = imp.renglones.reduce((a, x) => a + x.monto, 0)
  assert.equal(Math.round(total * 100), Math.round(914612.42 * 100))
})

test('períodos a medias (unos con monto, otros sin) no mezclan hecho con estimación', () => {
  const r = normalizarRecupero(REAL)
  const imp = imputar(r, [{ periodo: '2026-06', monto: 500000 }, { periodo: '2026-07', dias: 30 }])
  assert.equal(imp.metodo, 'sin_imputar')
  assert.ok(imp.avisos.some((a) => /a medias/.test(a)))
})

test('un período con formato inválido se descarta y se avisa', () => {
  const r = normalizarRecupero(REAL)
  const imp = imputar(r, [{ periodo: 'junio', monto: 914612.42 }])
  assert.equal(imp.metodo, 'sin_imputar')
  assert.ok(imp.avisos.some((a) => /formato inv[áa]lido/.test(a)))
})

// ═══ EL RESPALDO DEL BANCO — la evidencia es del efecto ═══

// El crédito REAL del Santander del 11/08.
const CREDITOS = [
  { fecha: '2026-08-11', importe: '914612.42', referencia: '8699102', concepto: 'Pago a proveedores recibido - Prevencion aseguradora de rie 30684361917 03 8699102' },
  { fecha: '2026-08-10', importe: '250000.00', referencia: '111', concepto: 'otro' },
]

test('el recupero se da por cobrado sólo si el extracto lo prueba, y guarda la REFERENCIA', () => {
  const r = normalizarRecupero(REAL)
  const s = respaldoDelCobro(r.cabecera, CREDITOS)
  assert.equal(s.respaldado, true)
  assert.equal(s.referencia_banco, '8699102')
})

test('sin crédito que lo respalde, NO se da por cobrado', () => {
  const r = normalizarRecupero(REAL)
  const s = respaldoDelCobro(r.cabecera, [CREDITOS[1]])
  assert.equal(s.respaldado, false)
  assert.match(s.motivo, /ning[úu]n cr[ée]dito/)
})

// EL DEFECTO: dos créditos iguales el mismo día y el código elige el primero. Ahí se ata el recupero a
// un movimiento que puede ser de otra cosa, y el segundo queda huérfano sin que nada avise.
test('dos créditos iguales el mismo día: no se elige uno, se declara la ambigüedad', () => {
  const r = normalizarRecupero(REAL)
  const dobles = [CREDITOS[0], { ...CREDITOS[0], referencia: '8699103' }]
  const s = respaldoDelCobro(r.cabecera, dobles)
  assert.equal(s.respaldado, false)
  assert.deepEqual(s.candidatos, ['8699102', '8699103'])
})

test('el informe dice qué mes netea y avisa que en caja no cambia nada', () => {
  const r = normalizarRecupero(REAL)
  const imp = imputar(r, [{ periodo: '2026-06', monto: 500000 }, { periodo: '2026-07', monto: 414612.42 }])
  const txt = formatRecupero(r, imp, respaldoDelCobro(r.cabecera, CREDITOS))
  assert.match(txt, /3012927/)
  assert.match(txt, /2026-06/)
  assert.match(txt, /8699102/)
  assert.match(txt, /dos veces/)
})
