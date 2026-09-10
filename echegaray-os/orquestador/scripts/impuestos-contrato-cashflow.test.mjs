// EL CONTRATO QUE EL REDISEÑO DE «Impuestos y Financieros» NO PUEDE ROMPER.
//
// ═══ POR QUÉ ESTE ARCHIVO EXISTE (09/09/2026) ═══
//
// La pestaña se rediseñó entero: el hero pasó de diez filas a tres, la sección 6 se eliminó, la
// alícuota se mudó a «Parámetros» y la fila mensual «Planes previsionales F931» se retiró por
// duplicar el cuadro 4 de «Cargas Sociales». Nada de eso puede mover un peso de las dos líneas del
// Cash Flow Mensual que cuelgan de acá.
//
// LO QUE ESTA PESTAÑA ALIMENTA, Y LO QUE NO. Entre la pestaña y el cash flow hay UN eslabón, y es
// estrecho: `deImpuestosCalendario` lee TRES filas —«⇒ IVA a pagar en el mes», «⇒ IIBB a pagar» y,
// desde el 10/09/2026, «Impuesto al cheque (Ley 25.413)»— ubicadas POR RÓTULO. Ninguna otra fila de
// la pestaña llega al Libro. Por eso retirar la fila de planes no podía mover la línea «Financiero»
// ni la de «Impuestos»: el modo de falla no era ése, era que el rótulo cambiara o se duplicara.
//
// ═══ LA TERCERA FILA ENTRÓ EL 10/09/2026, Y NO CAMBIA EL CONTRATO: LO EXTIENDE ═══
//
// La auditoría de ese día midió que el impuesto de la Ley 25.413 proyectado de septiembre a
// diciembre ($7,5M en J34:M34) no llegaba a NINGUNA celda de ningún cash flow: la línea que lo tenía
// murió con el cuadro de líneas y la matriz por rubro no tenía extractor para esa fila. Ahora sí,
// y sale con rubro «Impuestos» como todo lo demás de esta pestaña — la invariante de abajo sigue
// intacta a propósito: una segunda puerta hacia «Financiero» haría entrar la misma cuota dos veces.
//
// LAS CIFRAS SON LAS MEDIDAS EN EL CASH FLOW MENSUAL EL 09/09/2026, y viven acá y no en un mensaje:
//
//   Impuestos   $1.023.684 real · $11.800.936 proyectado
//   Financiero  $15.781.442 real · $3.848.432 proyectado
//
// De esos cuatro números, esta pestaña sólo produce el PROYECTADO de «Impuestos». El real de
// «Impuestos» sale del rubro «Impuestos» de Compras (impuestos ya pagados, que acá no viven) y los
// dos de «Financiero» del rubro «Financiero» de Compras — el cuadro de amortización del prendario.
// Que la pestaña NO pueda producirlos es parte del contrato y se prueba abajo: si algún día uno de
// estos movimientos saliera con rubro «Financiero», la misma plata entraría dos veces al flujo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { grilla } from './impuestos-pestana.mjs'
import { deImpuestosCalendario } from '../lib/libro-extractores.mjs'
import { CALENDARIO_IMPUESTOS } from '../lib/cash-flow-lineas.mjs'
import { ROTULO as ROTULO_IMPUESTO_CHEQUE } from '../lib/impuesto-cheque.mjs'
import { contratoDeRotulos } from '../lib/iva-libre-disponibilidad.mjs'

/** Los cuatro totales del cuadro, medidos el 09/09/2026. */
const IMPUESTOS = { real: 1_023_684, proyectado: 11_800_936 }
const FINANCIERO = { real: 15_781_442, proyectado: 3_848_432 }

const C = { total: 'O', concepto: 'L', fecha: 'AD', rubro: 'AB', fechaPrev: 'Q', detalle: 'K' }
const armar = () => grilla({
  anio: 2026,
  C,
  hoy: '2026-09-09',
  iibb: [1, 2, 3, 4, 5, 6].map((m) => ({ periodo: `2026-0${m}` })),
  ivaOficial: [1, 2, 3, 4, 5, 6].map((m) => ({
    periodo: `2026-0${m}`, debito: 1, credito: 1, a_pagar_efectivo: 0, libre_disp: 1e6,
    fecha_presentacion: '19/02/2026', nro_transaccion: '1',
  })),
  planes: [{ nombre: 'Plan F931 W303094', porMes: [0, 0, 0, 0, 0, 0, 0, 0, 2494876, 2494876, 2494876, 0, 0] }],
  proy: {
    meses: [8, 9, 10, 11, 12], ultimoMesConDato: 7, libreDisp: 7050036, alicuotaVigente: 0.21,
    brutoDebito: (m) => [`BRUTO_DEB_${m}`], brutoCredito: (m) => [`BRUTO_CRE_${m}`], supuesto: 'el supuesto',
  },
})

/** El serial de Sheets de una fecha ISO — la misma cuenta que hace el extractor. */
const serial = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)
}

test('EL PRIMER ESLABÓN: los dos rótulos que el Libro busca siguen ahí, una sola vez', () => {
  // Se ubican POR TEXTO en la columna A, así que el texto ES el contrato. Un rótulo cambiado deja el
  // IVA/IIBB a pagar en $0 y el piso de caja sube sin que se haya pagado nada; uno DUPLICADO es peor,
  // porque `findIndex` se queda con la primera aparición sin dar ningún error.
  const g = armar()
  const r = contratoDeRotulos(g.filas, CALENDARIO_IMPUESTOS.rotulos)
  assert.ok(r.ok, r.motivo)
  const colA = g.filas.map((f) => String(f[0] ?? '').trim())
  assert.equal(colA.filter((x) => x === CALENDARIO_IMPUESTOS.rotulos.iva).length, 1)
  assert.equal(colA.filter((x) => x === CALENDARIO_IMPUESTOS.rotulos.iibb).length, 1)
  // Y el tercero, que entró el 10/09/2026. Mismo riesgo exacto: si se renombra de un solo lado, el
  // Libro no lo encuentra, el paso ROMPE y los dos cash flow se quedan sin regenerar — que es lo que
  // pasó el 30/07 con el rótulo del IVA.
  assert.equal(colA.filter((x) => x === ROTULO_IMPUESTO_CHEQUE).length, 1,
    'la fila del impuesto al cheque existe UNA sola vez y con el rótulo que el Libro busca')
  // Y la fila que el generador DECLARA es la misma que el contrato resuelve leyendo la grilla: si se
  // separan, el Libro lee una fila y la pestaña publica otra.
  assert.equal(r.destino.iva, g.filasCalendario.iva)
  assert.equal(r.destino.iibb, g.filasCalendario.iibb)
})

test('EL SEGUNDO ESLABÓN: el proyectado de «Impuestos» sale ENTERO de esas dos filas', () => {
  // Un movimiento por CELDA, no por fila: los doce meses viven en la misma fila y con la fila sola la
  // clave de dedup los colapsaría en uno — quedaría un mes de IVA en todo el año.
  const filas = []
  filas[17] = ['⇒ IVA a pagar', ...Array(12).fill(0)]
  filas[18] = ['⇒ IIBB a pagar', ...Array(12).fill(0)]
  // La tercera fila del contrato, VACÍA: este test mide el proyectado de IVA/IIBB y un mes sin
  // importe no emite movimiento. Su comportamiento propio lo prueba lib/libro-impuesto-cheque.test.mjs.
  filas[19] = [ROTULO_IMPUESTO_CHEQUE, ...Array(12).fill(0)]
  // El reparto es sintético y suma exactamente el proyectado medido: 11.800.936.
  filas[17][10] = IMPUESTOS.proyectado - 800_936
  filas[18][11] = 800_936
  const ms = deImpuestosCalendario(filas, { filaIva: 18, filaIibb: 19, filaCheque: 20 }, 2026, serial('2026-09-09'))
  assert.equal(ms.length, 2, 'un movimiento por celda con importe; las vacías no emiten nada')
  assert.equal(ms.reduce((a, m) => a + m.importe, 0), IMPUESTOS.proyectado)
  for (const m of ms) {
    assert.equal(m.rubro, 'Impuestos', 'todo lo que sale de acá es impuesto, nunca «Financiero»')
    assert.equal(m.estado, 'PROYECTADO', 'vencimientos futuros: el REAL de la línea sale de Compras')
    assert.equal(m.origen.pestana, 'Impuestos y Financieros')
  }
})

test('LA LÍNEA «Financiero» NO PUEDE SALIR DE ESTA PESTAÑA, y por eso el rediseño no la movió', () => {
  // ═══ LO QUE ESTE TEST PROTEGE (09/09/2026) ═══
  //
  // Se retiró la fila mensual «Planes previsionales F931» —era el cuadro 4 de «Cargas Sociales»
  // publicado dos veces— y la pregunta obligada es si eso mueve la línea «Financiero» del cash flow,
  // que vale $15.781.442 reales y $3.848.432 proyectados. No puede: esa línea sale del rubro
  // «Financiero» de Compras, y el ÚNICO extractor que mira esta pestaña emite todo con rubro
  // «Impuestos». Si alguien enchufara acá una segunda puerta, la misma cuota entraría dos veces.
  const filas = []
  filas[17] = ['⇒ IVA a pagar', ...Array(12).fill(1_000)]
  filas[18] = ['⇒ IIBB a pagar', ...Array(12).fill(1_000)]
  // Con importe en las TRES filas: ni siquiera el impuesto al cheque —que el banco cobra y que en el
  // extracto llega como cargo «Financiero»— sale de acá con ese rubro.
  filas[19] = [ROTULO_IMPUESTO_CHEQUE, ...Array(12).fill(1_000)]
  const ms = deImpuestosCalendario(filas, { filaIva: 18, filaIibb: 19, filaCheque: 20 }, 2026, serial('2026-09-09'))
  assert.equal(ms.filter((m) => m.rubro === 'Financiero').length, 0)
  assert.ok(ms.some((m) => m.concepto.startsWith(ROTULO_IMPUESTO_CHEQUE)), 'la tercera fila SÍ emite')
  assert.ok(FINANCIERO.real > 0 && FINANCIERO.proyectado > 0, 'las dos cifras del contrato están declaradas')
  // Y la pestaña ya no publica una fila mensual de planes que alguien pudiera enchufar por error.
  const colA = armar().filas.map((f) => String(f[0] ?? '').trim())
  assert.equal(colA.includes('Planes previsionales F931'), false,
    'la fila de planes se retiró: su cuadro es el de «Cargas Sociales», una sola vez')
  // La cuota SÍ sigue contando donde tiene que contar: dentro de «A pagar en 30 días» del hero, leída
  // por el rango con nombre de aquella pestaña. Si desapareciera de ahí, la ventana bajaría ~$2,49M.
  const hero = armar().filas.find((f) => /^⇒ A pagar en 30 días/.test(String(f[0] ?? '')))
  assert.match(String(hero[1]), /CARGAS_MES_PLANES/)
})

test('el extractor ROMPE si no le dan las dos filas: una fila muerta devolvería $0 sin error', () => {
  // Es el modo de falla que el rediseño podía introducir: la fila se mueve, el ubicador no la
  // encuentra, y el cash flow publica «este año no hay que pagar IVA» con todo en verde.
  assert.throws(() => deImpuestosCalendario([], { filaIva: 18 }, 2026), /IVA y del IIBB/)
  assert.throws(() => deImpuestosCalendario([], { filaIva: 18, filaIibb: 19 }), /IVA y del IIBB/)
})
