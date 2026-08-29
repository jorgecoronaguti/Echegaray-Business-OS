// LA DEMANDA DE OBRAS SE PRUEBA CON FIXTURES: la lib es pura y las obras llegan por parámetro —
// nada acá toca red, Sheets ni lib/obras-datos.mjs (que puede no existir en esta rama).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  demandaPorQuincena, costoDemanda, proyeccionQuincena, formulaProyectadoQuincena, glosaDemanda,
  diasHabilesObra, claveQuincena, ESCALON_RESPALDO, TARIFA_CARGAS_EXPLOSION,
} from './jornales-demanda-obras.mjs'
import { factorUocraEntre } from './uocra-paritaria.mjs'

/** Una obra del shape acordado con lib/obras-datos.mjs. */
const obra = (extra = {}) => ({
  clave: 'OBRA-1',
  cliente: 'Cliente SA',
  obra: 'Nave industrial',
  inicio: '2026-08-18',
  fin: '2026-09-30',
  horas: { oficialEspecializado: 100, oficial: 200, ayudante: 300 },
  moCargasPesos: 0,
  plantelFullTime: 5,
  plantelTemporales: 3,
  notas: '',
  ...extra,
})

const q = (quincenas, clave) => quincenas.find((x) => x.clave === clave)

test('días hábiles de obra son lun-VIERNES: agosto 16-31 de 2026 tiene 11', () => {
  // CAMBIÓ EL 13/08 POR CRITERIO DEL DUEÑO ("las obras trabajan hasta el viernes"). Antes contaba
  // lunes a sábado sobre la observación de que la planilla carga días de sábado — que son horas
  // extra, no la semana normal. El reparto de la demanda pesa cada quincena por estos días, así que
  // el criterio tiene que ser UNO solo en toda la cadena.
  assert.equal(diasHabilesObra(new Date(2026, 7, 16), new Date(2026, 7, 31)), 11)
  // Y la mitad de arranque de la obra del fixture: 18-31/08.
  assert.equal(diasHabilesObra(new Date(2026, 7, 18), new Date(2026, 7, 31)), 10)
})

test('la clave de quincena parte el mes en el 15, y una fila que arranca a mitad de tramo cae en la misma clave', () => {
  assert.equal(claveQuincena(new Date(2026, 7, 7)), '2026-08-1')
  assert.equal(claveQuincena(new Date(2026, 7, 15)), '2026-08-1')
  assert.equal(claveQuincena(new Date(2026, 7, 18)), '2026-08-2')
})

test('reparto por días hábiles: la obra que empieza un 18 le deja a la 2ª quincena de agosto SU parte (10/32), no una quincena entera', () => {
  // La obra 18/08→30/09 tiene 32 días hábiles lun-VIERNES: 10 en ago-2, 11 en sep-1 y 11 en sep-2.
  // Eran 38 (12/13/13) mientras el criterio era lun-sáb; lo cambió el dueño el 13/08.
  const { quincenas, sinFechas } = demandaPorQuincena([obra()], { desde: new Date(2026, 7, 1), hastaMeses: 3 })
  assert.equal(sinFechas.length, 0)
  assert.equal(q(quincenas, '2026-08-1').nObras, 0, 'la obra no empezó: la 1ª quincena de agosto no la ve')
  const ago2 = q(quincenas, '2026-08-2')
  assert.equal(ago2.nObras, 1)
  assert.ok(Math.abs(ago2.obras[0].fraccion - 10 / 32) < 1e-12)
  assert.ok(Math.abs(ago2.horas.oficial - 200 * (10 / 32)) < 1e-9)
  assert.equal(ago2.plantel, 8, 'plantel requerido = fullTime + temporales de las obras activas')
  assert.ok(Math.abs(q(quincenas, '2026-09-1').obras[0].fraccion - 11 / 32) < 1e-12)
  assert.ok(Math.abs(q(quincenas, '2026-09-2').obras[0].fraccion - 11 / 32) < 1e-12)
  assert.equal(q(quincenas, '2026-10-1').nObras, 0, 'la obra terminó el 30/09')
  // Las fracciones de la obra suman 1: no se pierde ni se duplica una sola hora en el reparto.
  const suma = quincenas.flatMap((x) => x.obras).reduce((s, o) => s + o.fraccion, 0)
  assert.ok(Math.abs(suma - 1) < 1e-12)
})

test('una obra sin fechas queda AFUERA y se reporta — no se le inventa calendario, y no contamina a las demás', () => {
  const conFechas = obra()
  const sinFin = obra({ clave: 'OBRA-SIN-FIN', fin: null })
  const sinNada = obra({ clave: 'OBRA-SIN-NADA', inicio: null, fin: null })
  const { quincenas, sinFechas } = demandaPorQuincena([conFechas, sinFin, sinNada], { desde: new Date(2026, 7, 1), hastaMeses: 2 })
  assert.deepEqual(sinFechas.map((x) => x.clave), ['OBRA-SIN-FIN', 'OBRA-SIN-NADA'])
  assert.match(sinFechas[0].motivo, /sin fecha de fin/)
  assert.match(sinFechas[1].motivo, /sin inicio ni fin/)
  // La obra con fechas sigue entrando igual.
  assert.equal(q(quincenas, '2026-08-2').nObras, 1)
})

test('revaluación por tramo: una quincena de octubre paga más que una de agosto con las MISMAS horas, y viene rotulada como proyección', () => {
  const horas = { oficialEspecializado: 0, oficial: 100, ayudante: 0 }
  const ago = costoDemanda({ periodo: '2026-08', horas }, ESCALON_RESPALDO, [])
  const oct = costoDemanda({ periodo: '2026-10', horas }, ESCALON_RESPALDO, [])
  assert.equal(ago.factor, 1, 'el mes base no se ajusta a sí mismo')
  assert.equal(ago.mesesProyectados, 0)
  assert.ok(oct.total > ago.total)
  // Sin acuerdo después de agosto, sep y oct repiten el último tramo firmado (1,9%): ×1,019².
  assert.ok(Math.abs(oct.factor - 1.019 ** 2) < 1e-12)
  assert.equal(oct.mesesProyectados, 2, 'los dos meses sin acuerdo se declaran proyectados')
  assert.ok(Math.abs(oct.jornales - 100 * 6348 * 1.019 ** 2) < 1e-6)
  assert.ok(Math.abs(oct.cargas - 100 * TARIFA_CARGAS_EXPLOSION.oficial * 1.019 ** 2) < 1e-6)
})

test('una categoría con horas y sin escala NO entra valuada en $0: se reporta en sinEscala', () => {
  const escalaCoja = { periodo: '2026-08', categorias: { Oficial: { basico: 6348 } } }
  const c = costoDemanda({ periodo: '2026-08', horas: { oficialEspecializado: 50, oficial: 100, ayudante: 0 } }, escalaCoja, [])
  assert.deepEqual(c.sinEscala, ['Oficial Especializado'])
  assert.equal(c.jornales, 100 * 6348, 'el total sólo lleva lo que SÍ se pudo valuar')
})

test('MAX piso/demanda con los dos lados ganando — y el empate va al piso', () => {
  assert.deepEqual(proyeccionQuincena(100, 60), { proyectado: 100, manda: 'piso', piso: 100, demanda: 60 })
  assert.deepEqual(proyeccionQuincena(100, 150), { proyectado: 150, manda: 'demanda', piso: 100, demanda: 150 })
  assert.equal(proyeccionQuincena(100, 100).manda, 'piso', 'con empate la demanda no agregó nada')
})

test('la suma de la demanda ≈ Σ moCargasPesos revaluado quincena a quincena (tolerancia 1%)', () => {
  // El insumo del dueño se construye COHERENTE con horas × (básico + carga) a valores de agosto:
  //   120×(7420+6200) + 400×(6348+6200) + 600×(5399+5200) = 13.013.000.
  // Con eso la identidad es exacta módulo flotante — costo(q) = fracción × factor(mes) × moCargas,
  // porque el reparto es lineal y el factor multiplica igual a jornales y cargas (misma base ago-26).
  // El 1% de tolerancia declarado cubre el caso real: el moCargasPesos del dueño viene redondeado en
  // sus explosiones, no derivado exacto de las horas.
  const horas = { oficialEspecializado: 120, oficial: 400, ayudante: 600 }
  const moCargasPesos = 120 * (7420 + 6200) + 400 * (6348 + 6200) + 600 * (5399 + 5200)
  const o = obra({ inicio: '2026-08-01', fin: '2026-10-31', horas, moCargasPesos })
  const { quincenas } = demandaPorQuincena([o], { desde: new Date(2026, 7, 1), hastaMeses: 4 })
  let demandaTotal = 0
  let esperado = 0
  for (const x of quincenas) {
    if (!x.nObras) continue
    const c = costoDemanda(x, ESCALON_RESPALDO, [])
    assert.equal(c.sinEscala.length, 0)
    demandaTotal += c.total
    const f = factorUocraEntre('2026-08', x.periodo, []).factor
    esperado += x.obras[0].fraccion * moCargasPesos * f
  }
  assert.ok(demandaTotal > moCargasPesos, 'revaluada hacia adelante, la demanda supera el insumo a valores de agosto')
  assert.ok(Math.abs(demandaTotal - esperado) / esperado < 0.01, `demanda ${demandaTotal} vs esperado ${esperado}`)
})

test('sin demanda, la fórmula es el piso de convenio tal cual lo pasó el llamador — nada más', () => {
  const piso = { convenio: 'SIG*$B$28*DIAS', celdaPago: 'C40' }
  assert.equal(formulaProyectadoQuincena(piso, null), '=IFERROR(SIG*$B$28*DIAS;"")')
  assert.equal(formulaProyectadoQuincena(piso, { jornales: 0 }), '=IFERROR(SIG*$B$28*DIAS;"")')
})

test('LA LIB NO ESCRIBE NINGUNA LETRA DE COLUMNA: el layout es del llamador', () => {
  // Decía `G${r}*F${r}*D${r}` con las letras del layout de agosto. El rediseño del calendario (13/08)
  // sacó tres de esas columnas y movió las otras: la misma fórmula habría seguido multiplicando tres
  // celdas —ahora "Oficina", "Dirección" y "TOTAL"— y devolviendo un número plausible sin dar error.
  const f = formulaProyectadoQuincena({ convenio: 'X', celdaPago: 'C7' }, { jornales: 10 })
  assert.doesNotMatch(f.replace(/C7/g, ''), /\b[A-Z]\d+\b/, `la lib volvió a escribir una letra de columna: ${f}`)
})

test('EL MAX CONTRA LA DEMANDA NO VUELVE: la proyección es el 100% del convenio sobre el plantel actual', () => {
  // ═══ CAMBIO DE CONTRATO (14/08) ═══
  //
  // Esto exigía `MAX(convenio; demanda de obra)`. Con esa regla la columna cambiaba de NATURALEZA fila
  // por fila: de agosto a septiembre publicaba lo que piden las obras vendidas ($18,7M–$21,5M) y de
  // octubre en adelante lo que obliga el convenio ($7,2M–$8,8M). El dueño: *"esas proyecciones no
  // puedn ser asi, no dan confianza"* · *"q mierda estas haciendo con las proyecciones de obreros"* ·
  // *"hace lo solicitado CON EL PLANTEL ACTUAL"*.
  //
  // Y tenía razón por aritmética: esos $18,7M equivalen a ~38 personas con la Σ $/hora del convenio,
  // contra las 16 del plantel. El número no describía ni a su gente ni a su escala.
  const conDemanda = formulaProyectadoQuincena({ convenio: 'SIG*HS*DIAS', celdaPago: 'C41' }, { jornales: 1234567.89 })
  const sinDemanda = formulaProyectadoQuincena({ convenio: 'SIG*HS*DIAS', celdaPago: 'C41' }, null)
  assert.equal(conDemanda, sinDemanda, 'la demanda de obra volvió a pisar el convenio')
  assert.equal(conDemanda, '=IFERROR(SIG*HS*DIAS;"")')
  assert.ok(!conDemanda.includes('MAX'), 'volvió el MAX contra la demanda')
  assert.ok(!conDemanda.includes('1234568'), 'la demanda se coló como constante en la fórmula')
  assert.ok(!conDemanda.includes(','), 'separador es-AR: punto y coma, nunca coma')
})

test('la glosa habla sólo cuando alguna quincena lleva demanda, y dice cuántas obras la empujan', () => {
  assert.equal(glosaDemanda(null), '')
  assert.equal(glosaDemanda({ porQuincena: new Map(), nObras: 7 }), '')
  const g = glosaDemanda({ porQuincena: new Map([['2026-09-1', {}]]), nObras: 7 })
  // ═══ LA GLOSA DESCRIBÍA UNA FÓRMULA QUE LA CELDA YA NO TENÍA (29/08) ═══
  //
  // Decía `Proyectado = MAX(convenio; demanda de 7 obras)` y se escribía EN LA PESTAÑA. El MAX se
  // había ido el 14/08 —el test de arriba lo prueba: `assert.ok(!conDemanda.includes('MAX'))`— así
  // que durante dos semanas la línea afirmó, en el Sheet, un criterio que la fórmula de al lado no
  // usaba. Dos tests del MISMO archivo se contradecían y los dos estaban en verde.
  //
  // Lo que se exige ahora: que nombre cuántas obras hay —el dato sigue siendo útil— y que diga que
  // NO entran en el número. Y que no vuelva a nombrar el MAX, que es lo que lo hacía falso.
  assert.match(g, /7 obras/)
  assert.match(g, /no la demanda/, 'la glosa dejó de decir que la demanda NO entra en la columna')
  assert.doesNotMatch(g, /MAX/, 'volvió a anunciar en la pestaña un MAX que la fórmula no tiene')
})
