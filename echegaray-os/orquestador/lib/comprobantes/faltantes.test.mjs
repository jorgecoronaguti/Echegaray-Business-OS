import test from 'node:test'
import assert from 'node:assert/strict'
import { faltantesDe, puedeCargarse, validar, POLITICA, MOTIVO, PREGUNTA_OBRA } from './faltantes.mjs'
import { preguntasDe, estaCompleto } from './fajo.mjs'
import { claveComprobante } from './lectura.mjs'

// ═══ UNA PREGUNTA, UNA DEFINICIÓN, DOS POLÍTICAS (03/08) ═══
//
// "¿Qué le falta a este comprobante para poder cargarse?" se contestaba en dos lugares con dos
// criterios: `validar()` en el cargador de Claude Code y `preguntasDe()` en el bot de Mattermost.
// No era una política distinta: era que cada cara revisaba cosas que la otra no revisaba. El bot
// dejaba pasar un comprobante sin proveedor legible (moría después, adentro del cargador, con un
// mensaje que el dueño no veía) y el cargador dejaba pasar uno sin obra sin decirlo.
//
// Estos tests fijan las dos mitades del arreglo:
//   1. la LÓGICA es una sola — las dos caras dan la misma respuesta cuando la política es la misma;
//   2. la POLÍTICA sigue siendo distinta A PROPÓSITO en la obra, porque es una decisión de negocio
//      del dueño que todavía no tomó.

const comprobante = (over = {}) => ({
  proveedor: 'Combustibles Barcelo',
  fecha: '02/08/2026',
  numero: '0113-00014219',
  tipo: 'A',
  total: 64006.07,
  iva: 11106.07,
  obra: 'MESSINA',
  ...over,
})
// `leidoEn` fija el reloj contra el que se juzga la fecha (`plausibilidad.mjs`): sin él, estos
// casos se medirían contra el de la máquina y empezarían a fallar solos con el paso del tiempo.
const item = ({ comprobante: over, ...resto } = {}) => ({ comprobante: comprobante(over), leidoEn: '2026-08-04T10:00:00Z', ...resto })

const codigos = (it, pol) => faltantesDe(it, pol).map((f) => f.codigo)

// ── La política: lo que difiere, y por qué ───────────────────────────────────

test('SIN OBRA: las dos caras cargan igual — decisión del dueño del 03/08/2026', () => {
  // Era la única diferencia de NEGOCIO entre las dos políticas: el bot bloqueaba y el cargador no.
  // El dueño decidió alinear el bot con el cargador. Bloquear costaba más que el dato que protegía:
  // el comprobante no quedaba cargado en ningún lado. La obra se sigue OFRECIENDO —eso se prueba en
  // mensaje.test.mjs—, pero no impide escribir la fila.
  const sinObra = item({ comprobante: { obra: null } })
  assert.deepEqual(codigos(sinObra, POLITICA.CARGADOR), [], 'el cargador no exige la obra: el dueño la completa en el Sheet')
  assert.deepEqual(codigos(sinObra, POLITICA.CHAT), [], 'el bot tampoco: carga y avisa que fue sin obra')
  assert.equal(puedeCargarse(sinObra, POLITICA.CARGADOR), true)
  assert.equal(puedeCargarse(sinObra, POLITICA.CHAT), true)
  assert.equal(POLITICA.CHAT.exigirObra, false, 'la decisión vive en la bandera, no repartida por el código')
  assert.equal(POLITICA.CARGADOR.exigirObra, false)
})

test('el MECANISMO de exigir la obra sigue existiendo: la decisión es una bandera, no un borrado', () => {
  // Si el dueño la vuelve a exigir mañana, tiene que alcanzar con la bandera. Borrar la rama habría
  // convertido una decisión reversible en una reescritura.
  const sinObra = item({ comprobante: { obra: null } })
  const exigente = { ...POLITICA.CHAT, exigirObra: true }
  assert.deepEqual(codigos(sinObra, exigente), [MOTIVO.OBRA])
  assert.equal(puedeCargarse(sinObra, exigente), false)
})

test('la diferencia vive en la POLÍTICA, no en la lógica: con la misma política, la misma respuesta', () => {
  // Si alguien reintroduce una segunda definición, este test se cae: la única forma de que las dos
  // políticas coincidan sobre el mismo comprobante es que las dos salgan de la misma función.
  const conObra = item()
  assert.deepEqual(codigos(conObra, POLITICA.CARGADOR), codigos(conObra, POLITICA.CHAT))
  assert.equal(puedeCargarse(conObra, POLITICA.CARGADOR), puedeCargarse(conObra, POLITICA.CHAT))
})

// ── Lo que NO es política: vale para las dos caras ───────────────────────────

test('sin proveedor legible NO se carga por ninguna de las dos caras', () => {
  // ANTES: el chat no lo miraba. El comprobante pasaba las cinco preguntas del bot, el dueño
  // apretaba Confirmar, y recién ahí el cargador lo rechazaba con "sin proveedor" en un stdout que
  // nadie leía. La barrera tiene que estar donde está la persona.
  const sinProv = item({ comprobante: { proveedor: null } })
  assert.ok(codigos(sinProv, POLITICA.CARGADOR).includes(MOTIVO.PROVEEDOR))
  assert.ok(codigos(sinProv, POLITICA.CHAT).includes(MOTIVO.PROVEEDOR))
  assert.ok(preguntasDe(sinProv).join(' ').includes('proveedor'))
})

test('un tipo de comprobante que el desplegable no reconoce frena las dos caras', () => {
  // Escribir un valor que el desplegable estricto de la columna G rechaza deja la celda en rojo.
  const raro = item({ comprobante: { tipo: 'X' } })
  assert.ok(codigos(raro, POLITICA.CARGADOR).includes(MOTIVO.TIPO))
  assert.ok(codigos(raro, POLITICA.CHAT).includes(MOTIVO.TIPO))
})

test('una fecha ilegible es ilegible para las dos: se evalúa con el mismo parser', () => {
  // El chat sólo miraba `!c.fecha`, así que un "ayer" o un "02-ago" pasaba y moría del otro lado.
  const mala = item({ comprobante: { fecha: 'ayer' } })
  assert.ok(codigos(mala, POLITICA.CARGADOR).includes(MOTIVO.FECHA))
  assert.ok(codigos(mala, POLITICA.CHAT).includes(MOTIVO.FECHA))
  assert.deepEqual(codigos(item({ comprobante: { fecha: '5/1/2026' } }), POLITICA.CARGADOR), [], 'y "5/1/2026" es una fecha válida en las dos')
})

test('el DUPLICADO y el YA CARGADO frenan las dos caras: ninguna política los levanta', () => {
  // Un gasto contado dos veces en el Flujo de Fondos cuesta lo mismo entre por donde entre.
  const ya = item({ yaCargado: { fila: 800 } })
  const probable = item({ posibleDuplicado: { fila: 802 } })
  for (const pol of [POLITICA.CARGADOR, POLITICA.CHAT]) {
    assert.equal(puedeCargarse(ya, pol), false, `yaCargado tendría que frenar en ${pol.nombre}`)
    assert.equal(puedeCargarse(probable, pol), false, `el probable tendría que preguntarse en ${pol.nombre}`)
  }
  assert.ok(faltantesDe(probable, POLITICA.CARGADOR)[0].texto.includes('802'), 'se dice QUÉ fila, no "hay un duplicado"')
})

test('un PROBABLE ya contestado por una persona se carga; uno CIERTO no lo levanta esa respuesta', () => {
  const contestado = item({ posibleDuplicado: { fila: 802 }, duplicadoResuelto: 'otro' })
  assert.equal(puedeCargarse(contestado, POLITICA.CARGADOR), true)
  assert.equal(puedeCargarse(item({ duplicadoResuelto: 'mismo' }), POLITICA.CARGADOR), false)
  // "Es el mismo" no se levanta ni con la respuesta afirmativa sobre otro comprobante.
  assert.equal(puedeCargarse(item({ yaCargado: { fila: 800 }, duplicadoResuelto: 'otro' }), POLITICA.CARGADOR), false)
})

// ── Que las dos caras SIGAN llamando a la misma ──────────────────────────────

test('preguntasDe y estaCompleto del fajo son la política CHAT de esta función, no una copia', () => {
  const casos = [
    item(),
    item({ comprobante: { obra: null } }),
    item({ comprobante: { numero: null } }),
    item({ comprobante: { total: null, neto: 40000 } }),
    item({ comprobante: { fecha: null } }),
    item({ comprobante: { proveedor: '' } }),
    item({ proveedorNuevo: true }),
    item({ posibleDuplicado: { fila: 802 } }),
    item({ yaCargado: { fila: 800 } }),
  ]
  for (const [k, it] of casos.entries()) {
    assert.deepEqual(preguntasDe(it), faltantesDe(it, POLITICA.CHAT).map((f) => f.pregunta), `caso ${k}`)
    assert.equal(estaCompleto(it), puedeCargarse(it, POLITICA.CHAT), `caso ${k}`)
  }
})

test('validar() del cargador es la política CARGADOR de esta función, no una copia', () => {
  assert.deepEqual(validar({ fecha: '5/1/2026', proveedor: 'RSV', neto: '$44.664' }), [])
  assert.ok(validar({ proveedor: 'RSV', neto: 100 }).includes('fecha ilegible o ausente'))
  assert.ok(validar({ fecha: '5/1/2026', neto: 100 }).includes('sin proveedor'))
  assert.ok(validar({ fecha: '5/1/2026', proveedor: 'RSV' }).includes('sin importe numérico'))
  assert.deepEqual(validar({ fecha: '5/1/2026', proveedor: 'RSV', neto: 100 }),
    faltantesDe({ comprobante: { fecha: '5/1/2026', proveedor: 'RSV', neto: 100 } }, POLITICA.CARGADOR).map((f) => f.texto))
})

// ── El texto de la obra es uno solo ─────────────────────────────────────────

test('la obra YA NO se pregunta como faltante — pero su texto sigue siendo uno solo', () => {
  // Desde el 03/08/2026 la obra no bloquea, así que no sale de `faltantesDe`. El bloque que la
  // OFRECE lo arma `mensaje.mjs` por su cuenta (ver `ofreceObra`), y sigue habiendo un solo literal
  // para no terminar con dos redacciones de la misma pregunta.
  const p = preguntasDe(item({ comprobante: { obra: null } }))
  assert.equal(p.includes(PREGUNTA_OBRA), false, 'no es un faltante: no se lista como lo que impide cargar')
  // Y con la bandera puesta, la que sale es exactamente ese texto — el mecanismo no se degradó.
  const conExigencia = faltantesDe(item({ comprobante: { obra: null } }), { ...POLITICA.CHAT, exigirObra: true })
  assert.equal(conExigencia.find((f) => f.codigo === MOTIVO.OBRA)?.pregunta, PREGUNTA_OBRA)
})

// ── El caso que motivó el fajo: sólo el neto ─────────────────────────────────

test('con neto y sin total: el cargador puede escribir la fila, el chat no', () => {
  // El fajo que el bot le manda al cargador NO lleva el neto (`aFajoJson`): la columna M se deriva
  // de Total − IVA. Sin total, del otro lado no hay con qué escribir — por eso el chat lo exige.
  const soloNeto = item({ comprobante: { total: null, neto: 52900 } })
  assert.deepEqual(codigos(soloNeto, POLITICA.CARGADOR), [])
  assert.deepEqual(codigos(soloNeto, POLITICA.CHAT), [MOTIVO.TOTAL])
})

// ── LA INVARIANTE QUE FALTABA: cargable ⇒ identificable (04/08) ──────────────
//
// El chat reserva una clave de idempotencia ANTES de escribir, y `claveComprobante` devuelve null
// cuando falta el número o la LETRA. Un ítem que `estaCompleto` pero sin clave era un agujero: la
// reserva lo salteaba en silencio, `escribirFajo` lo confundía con un duplicado y contestaba "ya
// estaban cargados" sin haber escrito nada (el tique de Barcelo del 03/08).
//
// Se cierra en el origen: si el chat lo va a dar por cargable, tiene que poder identificarlo.
test('INVARIANTE: todo lo que el chat da por cargable tiene clave de idempotencia', () => {
  const casos = [
    item(),
    item({ comprobante: { tipo: null } }),                    // el tique sin letra
    item({ comprobante: { tipo: null, esNotaCredito: true } }), // NC: el tipo sale del flag
    item({ comprobante: { numero: null } }),
    item({ comprobante: { cuit: null } }),                    // sin CUIT: cae al nombre, sigue habiendo clave
    item({ comprobante: { cuit: null, proveedor: null } }),
  ]
  let cargables = 0
  for (const it of casos) {
    if (!puedeCargarse(it, POLITICA.CHAT)) continue
    cargables++
    assert.ok(claveComprobante(it.comprobante), `cargable sin clave: ${JSON.stringify(it.comprobante)}`)
  }
  assert.ok(cargables >= 2, 'la invariante se probó sobre casos que de verdad pasan')
})

test('sin letra el chat CARGA IGUAL: la letra no es parte de la identidad', () => {
  // El tique de Combustibles Barcelo del 03/08. "TIQUE FACTURA A" no es "FACTURA A" y la visión
  // devolvió la letra vacía: antes eso lo dejaba sin clave y el bot decía "ya estaba cargado" sin
  // haber escrito nada. La letra se sigue leyendo y se escribe en la columna G si está — pero no
  // puede impedir que el gasto entre a Compras.
  const sinLetra = item({ comprobante: { tipo: null } })
  assert.deepEqual(codigos(sinLetra, POLITICA.CHAT), [], 'no bloquea')
  assert.ok(claveComprobante(sinLetra.comprobante), 'y tiene con qué deduplicarse')
})

test('una NOTA DE CRÉDITO no comparte clave con la factura del mismo número', () => {
  // Comparten numeración y confundirlas ya costó $41,9M. La separación va por el flag, no por la
  // letra: no depende de que el OCR lea nada.
  const factura = claveComprobante({ cuit: '30712345678', numero: '0113-00010489', tipo: 'A' })
  const nc = claveComprobante({ cuit: '30712345678', numero: '0113-00010489', esNotaCredito: true })
  assert.notEqual(factura.clave, nc.clave)
})

test('un presupuesto/remito NO es un gasto: frena en las dos políticas — CON-SEC, 21/08', () => {
  // Dos presupuestos de CON-SEC llegaron por el chat con dos totales impresos (lista vs contado).
  // El modelo escribió «no es una factura» en las dudas de texto libre... y el flujo igual los
  // encaminó a carga. La duda no gobierna nada: el dato viaja como campo y acá se frena.
  const presupuesto = item({ comprobante: { esPresupuestoORemito: true } })
  assert.ok(codigos(presupuesto, POLITICA.CHAT).includes(MOTIVO.NO_ES_FACTURA))
  assert.ok(codigos(presupuesto, POLITICA.CARGADOR).includes(MOTIVO.NO_ES_FACTURA))
  assert.equal(puedeCargarse(presupuesto, POLITICA.CHAT), false)
  assert.equal(puedeCargarse(presupuesto, POLITICA.CARGADOR), false)
  // Una factura común no se ve tocada por el campo nuevo.
  assert.equal(codigos(item(), POLITICA.CHAT).includes(MOTIVO.NO_ES_FACTURA), false)
})
