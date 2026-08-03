import test from 'node:test'
import assert from 'node:assert/strict'
import { faltantesDe, puedeCargarse, validar, POLITICA, MOTIVO, PREGUNTA_OBRA } from './faltantes.mjs'
import { preguntasDe, estaCompleto } from './fajo.mjs'

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
const item = ({ comprobante: over, ...resto } = {}) => ({ comprobante: comprobante(over), ...resto })

const codigos = (it, pol) => faltantesDe(it, pol).map((f) => f.codigo)

// ── La política: lo que difiere, y por qué ───────────────────────────────────

test('SIN OBRA: el cargador lo escribe igual, el chat lo pregunta — y es la ÚNICA diferencia', () => {
  const sinObra = item({ comprobante: { obra: null } })
  assert.deepEqual(codigos(sinObra, POLITICA.CARGADOR), [], 'el cargador no exige la obra: el dueño la completa en el Sheet')
  assert.deepEqual(codigos(sinObra, POLITICA.CHAT), [MOTIVO.OBRA], 'el bot bloquea: una fila sin obra entra al Flujo de Caja sin clasificar')
  assert.equal(puedeCargarse(sinObra, POLITICA.CARGADOR), true)
  assert.equal(puedeCargarse(sinObra, POLITICA.CHAT), false)
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

test('la pregunta de la obra tiene un solo texto: mensaje.mjs la reconoce por igualdad', () => {
  // `mensaje.mjs` la reemplaza por el bloque con los botones comparando el string exacto. Dos
  // literales distintos harían que el dueño viera la pregunta escrita y sin nada que apretar.
  const p = preguntasDe(item({ comprobante: { obra: null } }))
  assert.ok(p.includes(PREGUNTA_OBRA))
})

// ── El caso que motivó el fajo: sólo el neto ─────────────────────────────────

test('con neto y sin total: el cargador puede escribir la fila, el chat no', () => {
  // El fajo que el bot le manda al cargador NO lleva el neto (`aFajoJson`): la columna M se deriva
  // de Total − IVA. Sin total, del otro lado no hay con qué escribir — por eso el chat lo exige.
  const soloNeto = item({ comprobante: { total: null, neto: 52900 } })
  assert.deepEqual(codigos(soloNeto, POLITICA.CARGADOR), [])
  assert.deepEqual(codigos(soloNeto, POLITICA.CHAT), [MOTIVO.TOTAL])
})
