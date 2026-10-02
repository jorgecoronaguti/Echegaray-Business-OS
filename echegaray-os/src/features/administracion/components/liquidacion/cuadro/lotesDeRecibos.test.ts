// RECIBOS EN LOTE: el papel de cada persona es el del panel, se registra ANTES de imprimir, sale de a cuatro por hoja
// y quien no tiene nada que cobrar se nombra en vez de salir en blanco.
//
// MUTACIONES QUE LO PONEN ROJO: que `ArmarRecibo` vuelva a decidir su propia elección; partir en hojas de 3 ó 5;
// armar el lote en el orden en que se tildó; no saltear el recibo vacío; imprimir antes de registrar; sacar el
// `A4 landscape`; que una casilla de sección arrastre a otra sección.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pagoDeLaLinea } from '../../../services/pagoDeLaQuincena.ts'
import type { LineaConOverrides } from '../../../services/liquidacionOverrides.ts'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales.ts'
import {
  armarLote, avisoDelLote, eleccionEnElLote, eleccionPorDefecto, enHojas, estadoDeOpcion, OPCIONES_DEL_RECIBO, reciboSinNada,
  estadoDeSeccion, marcarSeccion, reciboPorDefecto, sinNadaQueCobrar,
  soloLosVisibles, textoDeSeleccion, textoDelLote,
} from './lotesDeRecibos.ts'

const fmt = (n: number) => `$${n}`
const rotulo = (c: string) => c.toUpperCase()
const Q = { desde: '2026-09-16', hasta: '2026-09-30' }
const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

// Un jornalero con 45 h en blanco (neto 230.000 por banco) y 51 h en negro (306.000 en efectivo): 96 h, 536.000.
const jornalero = {
  porBanco: 230000, enEfectivo: 306000, pagadoBanco: 0, pagadoEfectivo: 0, modalidad: 'jornal',
  sueldo: { horasBlanco: 45, valorHoraCategoria: 6666.67, bruto: 300000, horasNegro: 51, valorHoraNegro: 6000, negro: 306000 },
  pago: pagoDeLaLinea({ banco: 230000, negro: 306000 }),
} as unknown as LineaConOverrides
// Sin horas ni importes: el papel no diría nada.
const vacia = {
  porBanco: null, enEfectivo: null, pagadoBanco: 0, pagadoEfectivo: 0, modalidad: 'jornal', horas: null, sueldo: null, cobra: null,
  pago: pagoDeLaLinea({ banco: null, negro: null }),
} as unknown as LineaConOverrides

const fila = (id: string, nombre: string, linea: LineaConOverrides, categoria: string | null = 'oficial'): FilaDelEspejo =>
  ({ personaId: id, nombre, categoria, grupo: 'obreros', cerrada: false, linea, celdas: [] }) as unknown as FilaDelEspejo

test('el recibo del lote es el del panel: 96 h con su reparto y la cuenta del valor hora, banco, efectivo y total', () => {
  const r = reciboPorDefecto(fila('p1', 'Ana', jornalero), Q, fmt, rotulo)
  // Por defecto desde el 02/10/2026 (dueño: «no sale ni valor hora en el recibo»): el reparto y la cuenta.
  assert.deepEqual(r.recibo.horas.map((h) => [h.rotulo, h.horas, h.importe]), [
    ['Horas trabajadas', 96, null],
    ['Horas trabajadas por recibo', 45, null],
    ['Horas trabajadas fuera de recibo', 51, 306000],
  ])
  assert.deepEqual(r.recibo.medios.map((m) => [m.rotulo, m.importe]), [['Depósito en banco', 230000], ['Efectivo', 306000]])
  assert.equal(r.sellado.total, 536000)
  assert.deepEqual([r.sellado.personaId, r.sellado.quincenaDesde, r.sellado.quincenaHasta, r.categoria], ['p1', Q.desde, Q.hasta, 'OFICIAL'])
})

test('el lote respeta el orden de la grilla, ignora lo no marcado y nombra a quien no tiene nada', () => {
  const filas = [fila('a', 'Ana', jornalero), fila('b', 'Beto', vacia), fila('c', 'Cora', jornalero), fila('d', 'Dani', jornalero)]
  // Se tildó en otro orden y se dejó afuera a Dani.
  const lote = armarLote(filas, new Set(['c', 'b', 'a']), Q, fmt, rotulo)
  assert.deepEqual(lote.listos.map((l) => l.fila.nombre), ['Ana', 'Cora'])
  assert.deepEqual(lote.sinNada, ['Beto'])
})

test('«nada que cobrar»: sin renglones, o sólo «sin dato» y ceros; un cero junto a una cifra real sí sale', () => {
  assert.equal(reciboSinNada({ horas: [], medios: [], total: null }), true)
  assert.equal(reciboSinNada({ horas: [], medios: [{ rotulo: 'Efectivo', importe: null }, { rotulo: 'Depósito en banco', importe: 0 }], total: null }), true)
  assert.equal(reciboSinNada({ horas: [], medios: [{ rotulo: 'Efectivo', importe: 306000 }, { rotulo: 'Depósito en banco', importe: 0 }], total: 306000 }), false)
  assert.equal(reciboSinNada({ horas: [{ rotulo: 'Horas trabajadas', horas: 12, detalle: null, importe: null }], medios: [], total: null }), false)
})

test('cuatro por hoja: 9 recibos son 3 hojas (4 + 4 + 1) y 0 son ninguna', () => {
  const nueve = Array.from({ length: 9 }, (_, i) => i)
  assert.deepEqual(enHojas(nueve).map((h) => h.length), [4, 4, 1])
  assert.deepEqual(enHojas([1, 2, 3, 4]).map((h) => h.length), [4])
  assert.deepEqual(enHojas([]), [])
})

test('la casilla de un cuadro marca y desmarca sólo a los suyos; con algunos tildados queda «algunas»', () => {
  const jornaleros = ['a', 'b'], mensuales = ['m']
  let sel: ReadonlySet<string> = new Set(['m'])
  sel = marcarSeccion(sel, jornaleros, true)
  assert.deepEqual([...sel].sort(), ['a', 'b', 'm'])
  assert.equal(estadoDeSeccion(jornaleros, sel), 'todas')
  sel = marcarSeccion(sel, jornaleros, false)
  assert.deepEqual([...sel], ['m'], 'desmarcar los quincenales no toca al mensual')
  assert.equal(estadoDeSeccion(jornaleros, sel), 'ninguna')
  assert.equal(estadoDeSeccion(jornaleros, new Set(['a'])), 'algunas')
  assert.equal(estadoDeSeccion(mensuales, sel), 'todas')
})

test('un filtro que esconde una fila la saca de la selección', () => {
  assert.deepEqual([...soloLosVisibles(new Set(['a', 'b']), ['b', 'c'])], ['b'])
  assert.equal(textoDeSeleccion(1, 19), '1 de 19 seleccionado')
  assert.equal(textoDeSeleccion(7, 19), '7 de 19 seleccionados')
})

test('REHACER 01/10 · quien no tiene nada que cobrar se sabe ANTES de tildar, con la misma regla del lote', () => {
  const filas = [fila('a', 'AGÜERO', jornalero), fila('v', 'VACÍO', vacia), fila('c', 'CASTILLO', jornalero)]
  assert.deepEqual([...sinNadaQueCobrar(filas, Q, fmt, rotulo)], ['v'])
  // Y el lote armado sin esa persona no deja a nadie afuera «después».
  assert.deepEqual(armarLote(filas, new Set(['a', 'c']), Q, fmt, rotulo).sinNada, [])
})

// EL MENSUAL EN LA 1ª NO EMITE (dueño, 02/10/2026), aunque su fila muestre el banco del recibo del estudio de esa
// quincena: el mes se liquida en la 2ª. MUTACIÓN: que el recibo de la 1ª vuelva a llevar ese banco → deja de estar
// en `sinNada` y el lote imprime una hoja que paga el mes dos veces.
test('02/10 · el mensual en la 1ª quincena no tiene recibo que emitir; en la 2ª sí', () => {
  const mensual = (en1ra: boolean) => ({
    ...jornalero, modalidad: 'mensual', sueldo: null, porBanco: 705532.04, enEfectivo: en1ra ? null : 1794467.96,
    cobra: en1ra ? null : 2500000, reciboNeto: 705532.04, manual: {}, ...(en1ra ? { seLiquidaEnLa2da: true } : {}),
    pago: pagoDeLaLinea({ banco: 705532.04, negro: en1ra ? null : 1794467.96 }),
  }) as unknown as LineaConOverrides
  const Q1 = { desde: '2026-09-01', hasta: '2026-09-15' }
  assert.deepEqual([...sinNadaQueCobrar([fila('m', 'MALDONADO', mensual(true))], Q1, fmt, rotulo)], ['m'])
  assert.deepEqual([...sinNadaQueCobrar([fila('m', 'MALDONADO', mensual(false))], Q, fmt, rotulo)], [])
})

test('REHACER 01/10 · el título de la vista previa dice recibos y hojas', () => {
  assert.equal(textoDelLote(1), '1 recibo · 1 hoja')
  assert.equal(textoDelLote(4), '4 recibos · 1 hoja')
  assert.equal(textoDelLote(7), '7 recibos · 2 hojas')
})

test('REHACER 01/10 · el aviso: guardados, ya estaban (no se duplican) y a quién no se pudo', () => {
  assert.deepEqual(avisoDelLote(7, 0, []), { tono: 'ok', lineas: ['7 recibos guardados en los legajos.'] })
  assert.deepEqual(avisoDelLote(0, 2, []), { tono: 'ok', lineas: ['2 ya estaban guardados igual: no se duplicaron.'] })
  assert.deepEqual(avisoDelLote(1, 1, []).lineas, ['1 recibo guardado en el legajo.', '1 ya estaba guardado igual: no se duplicó.'])
  const mal = avisoDelLote(1, 0, ['SOSA: la base no respondió'])
  assert.equal(mal.tono, 'mal')
  assert.match(mal.lineas[1], /No se guardó y no sale en la hoja\. SOSA/)
  assert.equal(avisoDelLote(0, 0, []).tono, 'mal')
})

test('CABLEADO: una sola regla de «qué lleva», registrar antes de imprimir, A4 horizontal', () => {
  const armar = fuente('./ArmarRecibo.tsx')
  assert.match(armar, /eleccionPorDefecto\(fila\)/)
  assert.doesNotMatch(armar, /eleccionInicial\(/, 'ArmarRecibo no decide su propia elección por defecto')
  // REHACER 01/10: la barra NO guarda ni imprime; su única acción es abrir la vista previa.
  const barra = fuente('./BarraDeRecibos.tsx')
  assert.doesNotMatch(barra, /guardarRecibosDelLote|aceptarRecibo|imprimirEnVentana/, 'la barra no escribe ni imprime')
  assert.match(barra, /data-testid="recibos-lote-previa"/)
  assert.match(barra, /disabled=\{Boolean\(apagada\)\}/, 'la casilla de quien no cobra va apagada')
  // La vista previa dibuja LA MISMA hoja que se imprime, y guarda antes de imprimir o descargar.
  const previa = fuente('./VistaPreviaDeRecibos.tsx')
  assert.match(previa, /<HojasDeRecibosA4 vista recibos=/)
  assert.match(previa, /<HojasDeRecibosA4 hoja=\{hoja\} recibos=\{paraImprimir\}/)
  assert.ok(previa.indexOf('const guardados = await guardar()') < previa.indexOf('setParaImprimir(guardados'), 'se guarda antes de mandar a imprimir')
  assert.match(previa, /recibos-lote\?ids=\$\{guardados\.map/, 'el PDF se pide con los ids de lo guardado')
  assert.match(previa, /<Drawer testid="vista-previa-recibos"/, 'panel lateral compartido, no un modal propio')
  // La grilla apaga la casilla ANTES y pasa la marca de impreso.
  const grilla = fuente('../GrillaEspejoQuincena.tsx')
  // CAMBIÓ EL 02/10/2026 (el mensual se liquida en la 2ª): la casilla apagada tiene DOS motivos y los dos se exigen.
  // Quien no está en `sinNada` se puede tildar; quien está, sale con su motivo —el del mensual en la 1ª o el genérico—.
  assert.match(grilla, /apagada: !sinNada\.has\(fila\.personaId\) \? undefined\s*: fila\.linea\.seLiquidaEnLa2da \? MOTIVO_SE_LIQUIDA_EN_LA_2DA : MOTIVO_SIN_NADA/,
    'la casilla apagada perdió uno de sus dos motivos')
  assert.match(grilla, /visibles\.filter\(\(f\) => !sinNada\.has\(f\.personaId\)\)/, 'quien no tiene nada no entra en lo tildado')
  assert.match(grilla, /impreso: impresos\[fila\.personaId\]/)
  assert.match(fuente('./HojaDelRecibo.tsx'), /size: A4 landscape/)
  assert.match(fuente('./HojasDeRecibosA4.tsx'), /gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr'/)
})

// ═══ EL CHECKLIST DEL RECIBO EN EL LOTE (dueño, 01/10/2026) ═══
//
// MUTACIONES QUE LO PONEN ROJO: que un concepto sin tocar deje de salir como sale por defecto; que destildar no
// saque el renglón; que tildar le invente un concepto a quien no lo tiene; que el panel y el lote ofrezcan
// checklists distintos.
test('lote sin tocar el checklist = el recibo por defecto de cada persona', () => {
  const f = fila('p1', 'Ana', jornalero)
  assert.deepEqual(eleccionEnElLote(f, {}), eleccionPorDefecto(f))
  assert.deepEqual(armarLote([f], new Set(['p1']), Q, fmt, rotulo, {}).listos[0].sellado, reciboPorDefecto(f, Q, fmt, rotulo).sellado)
})

test('destildar «Efectivo» en el lote saca ese renglón de TODOS los recibos, y lo sellado lo refleja', () => {
  const filas = [fila('a', 'Ana', jornalero), fila('b', 'Beto', jornalero)]
  const antes = armarLote(filas, new Set(['a', 'b']), Q, fmt, rotulo)
  const despues = armarLote(filas, new Set(['a', 'b']), Q, fmt, rotulo, { efectivo: false })
  for (const r of antes.listos) assert.ok(r.recibo.medios.some((m) => m.importe === 306000), 'por defecto lleva el efectivo')
  for (const r of despues.listos) {
    assert.ok(!r.recibo.medios.some((m) => m.importe === 306000), 'sin el renglón de efectivo')
    assert.notDeepEqual(r.sellado, antes.listos[0].sellado)
  }
  assert.equal(despues.listos.length, 2)
})

test('destildar todo deja a la persona sin nada: se nombra y no sale una hoja vacía', () => {
  const todoNo = Object.fromEntries(OPCIONES_DEL_RECIBO.map((o) => [o.clave, false]))
  const lote = armarLote([fila('a', 'Ana', jornalero)], new Set(['a']), Q, fmt, rotulo, todoNo)
  assert.deepEqual([lote.listos.length, lote.sinNada], [0, ['Ana']])
})

test('tildar un concepto no se lo inventa a quien no lo tiene', () => {
  const sinHoras = fila('v', 'Vera', vacia)
  assert.equal(eleccionEnElLote(sinHoras, { horas: true }).horas, false)
  assert.equal(estadoDeOpcion([sinHoras], 'horas', { horas: true }), 'nadie')
})

test('estado de cada opción del checklist: todas, ninguna, y sólo cuentan los que tienen el concepto', () => {
  const con = fila('a', 'Ana', jornalero), sin = fila('v', 'Vera', vacia)
  assert.equal(estadoDeOpcion([con, sin], 'horas'), 'todas', 'Vera no tiene horas: no baja el estado a «algunas»')
  assert.equal(estadoDeOpcion([con, sin], 'horas', { horas: false }), 'ninguna')
  assert.equal(estadoDeOpcion([con], 'horas', { horas: false, efectivo: true }), 'ninguna')
  assert.equal(estadoDeOpcion([], 'horas'), 'nadie')
})

test('el panel de una persona y la vista previa del lote ofrecen EL MISMO checklist', () => {
  assert.match(fuente('./ArmarRecibo.tsx'), /const OPCIONES = OPCIONES_DEL_RECIBO/)
  const previa = fuente('./VistaPreviaDeRecibos.tsx')
  assert.match(previa, /OPCIONES_DEL_RECIBO\.map/)
  assert.match(previa, /armarLote\(filas, marcados, quincena, pesos, rotuloCategoria, cambios\)/)
  assert.deepEqual(OPCIONES_DEL_RECIBO.map((o) => o.clave), ['horas', 'horasRecibo', 'horasFuera', 'valorHora', 'banco', 'efectivo', 'pagado'])
})

test('la vista previa escala la hoja al ancho de un panel que RESERVA el lugar de la barra de scroll', () => {
  // 02/10/2026, reproducido en producción con barras reales: entre 791 y 800 px de alto de ventana el zoom de
  // la hoja cambiaba en cada cuadro (0,683 ↔ 0,669; 90 cambios en 1,5 s) porque la barra aparecía y se iba.
  // El ancho que se mide no puede depender del alto de lo que se dibuja con él.
  const aqui = new URL('.', import.meta.url).pathname
  const previa = readFileSync(`${aqui}VistaPreviaDeRecibos.tsx`, 'utf8')
  const drawer = readFileSync(`${aqui}../../../../../shared/components/ds/Drawer.tsx`, 'utf8')
  assert.match(previa, /zoom: escala/, 'la hoja sigue escalándose al ancho medido')
  assert.match(previa, /<Drawer[^>]*\bbarraEstable\b/, 'la vista previa pide la barra estable')
  assert.match(drawer, /barraEstable \? \{ scrollbarGutter: 'stable' \}/, 'y el panel la reserva en el cuerpo que scrollea')
  assert.match(drawer, /overflow-y-auto[^\n]*data-testid="drawer-cuerpo"/, 'en el mismo nodo que tiene el scroll')
})
