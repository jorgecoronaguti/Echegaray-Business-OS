// Test hermético del plantel completo de «Nómina». Sin Sheet, sin Drive.
import {
  devengadoDeLosQueSeFueron, ubicarCuadros, celdasDesvinculados, celdasOficina,
  bloqueDeOficina, cargasDeUnGrupo, formulaDelSac, formulaBlancoMedido, colMes,
  ROTULO_DESVINCULADOS, ROTULO_OFICINA, ROTULO_SAC,
} from './nomina-plantel-completo.mjs'

let ok = 0, falla = 0
const check = (n, c) => { if (c) ok++; else { falla++; console.error(`  FALLA: ${n}`) } }

// ── LO QUE SE FUE ───────────────────────────────────────────────────────────────────────────────
const dev = new Map([
  ['perez', { meses: new Map([['2026-01', { importe: 100 }], ['2026-03', { importe: 50 }], ['2025-12', { importe: 999 }]]) }],
  ['gomez', { meses: new Map([['2026-01', { importe: 25 }]]) }],
])
const fuera = devengadoDeLosQueSeFueron(dev, [{ clave: 'perez', nombre: 'Perez' }, { clave: 'gomez', nombre: 'Gomez' }, { clave: 'nadie', nombre: 'Nadie' }])
check('suma por mes del año', fuera.porMes[0] === 125 && fuera.porMes[2] === 50)
// OTRO AÑO NO ENTRA: el cuadro es de 2026 y el devengado de diciembre pasado cobrado en enero ya
// está en la fila de enero de la planilla — contarlo otra vez lo duplica.
check('el año anterior queda afuera', fuera.porMes.reduce((a, b) => a + b, 0) === 175)
// UNA PERSONA SIN DEVENGADO MEDIBLE SE NOMBRA. Si se contara en cero, el renglón diría que esa
// persona no cobró, cuando lo cierto es que no se pudo medir.
check('el que no se puede medir se nombra', fuera.sinDato.length === 1 && fuera.sinDato[0] === 'Nadie')
check('el conteo de personas es el del grupo, no el de los medidos', fuera.personas === 3)
// UN MES EN CERO SE ESCRIBE VACÍO: los desvinculados dejaron de cobrar, no cobraron cero.
check('cero se escribe vacío', celdasDesvinculados(fuera)[1] === '' && celdasDesvinculados(fuera)[0] === 125)

// ── DÓNDE VAN ───────────────────────────────────────────────────────────────────────────────────
const grid = [
  ['Nómina'], [], [], ['Parámetros'], [], [], [],
  ['1 · NÓMINA 2026 · COBRADO Y PROYECTADO POR PERSONA'], ['Persona'], ['Aguero'], ['Zogbe'], ['TOTAL'], [],
  ['2 · CARGAS SOCIALES POR EMPLEADO'], ['Persona'], ['Aguero'], ['Zogbe'], ['TOTAL'], ['Real F931 + DDJJ UOCRA'],
]
const s = ubicarCuadros(grid)
check('ubica el cuadro 1', !s.error && s.uno.primera === 10 && s.uno.ultima === 11 && s.uno.total === 12)
check('ubica el cuadro 2', !s.error && s.dos.primera === 16 && s.dos.ultima === 17 && s.dos.total === 18)
// SIN TÍTULO NO SE ADIVINA: escribir en la fila equivocada de una pestaña hecha a mano la rompe.
check('sin el título no inventa una fila', Boolean(ubicarCuadros([['x']]).error))
// IDEMPOTENCIA: si mis filas ya están, la última persona las excluye en vez de contarlas como gente.
const conMias = [...grid]
conMias.splice(11, 0, [ROTULO_DESVINCULADOS], [ROTULO_OFICINA])
const s2 = ubicarCuadros(conMias)
check('reconoce sus propias filas', s2.yaEstan.length === 2 && s2.uno.ultima === 11)

// ── OFICINA SE ANCLA A SU CUADRO, NO AL PRIMER «Enero» QUE APAREZCA ─────────────────────────────
//
// En «Jornales por Quincena» los doce meses aparecen DOS veces: oficina en el cuadro 1.1 y los
// retiros de Dirección más abajo. Un MATCH sobre la columna entera traería el primero que encuentre,
// y el día que se inviertan los cuadros esta fila publicaría los retiros de los dueños como sueldos.
const gJor = [['Jornales'], ['1.1 · OFICINA · SUELDOS POR MES'], ['Mes'], ['Enero'], ['Febrero'], ['⇒ Oficina en el año'], ['1.2 · DIRECCIÓN'], ['Mes'], ['Enero']]
const b = bloqueDeOficina(gJor)
check('acota el cuadro de oficina', !b.error && b.desde === 3 && b.hasta === 5)
check('sin el título de oficina, no adivina', Boolean(bloqueDeOficina([['x']]).error))
const ofi = celdasOficina(['Enero'], { bloque: b })
check('oficina se ancla al rango del cuadro', ofi[0].includes('$A$3:$A$5') && !ofi[0].includes('$A$1:$A$80'))
check('oficina suma pagado y proyectado', ofi[0].includes('$C$3:$C$5') && ofi[0].includes('$H$3:$H$5'))

// ── LAS CARGAS DE UN GRUPO ──────────────────────────────────────────────────────────────────────
const cg = cargasDeUnGrupo('D27')
// SIN FECHA DE INGRESO, EL FONDO DE CESE VA PONDERADO — el mismo parámetro que usa «Cargas Sociales».
check('el FCL del grupo va ponderado', cg.includes('CARGAS_PROPORCION_PRIMER_ANIO*$J$5') && cg.includes('(1-CARGAS_PROPORCION_PRIMER_ANIO)*$K$5'))
// UN MES SIN PLATA NO PUBLICA CARGAS: el grupo dejó de cobrar, no cobró cero.
check('un mes vacío no devenga', cg.startsWith('=IF(N(D27)=0;"";'))
check('separador es_AR', !cg.includes(','))

// ── EL AGUINALDO ────────────────────────────────────────────────────────────────────────────────
const sac = formulaDelSac({ p0: 10, p1: 28 }, [1, 2, 3, 4, 5, 6])
// EL MEJOR MES DE CADA PERSONA, NO EL MEJOR MES DEL TOTAL: un mes alto por MÁS GENTE no le agranda
// el aguinaldo a nadie. `BYROW` mide fila por fila; un `MAX` sobre el rango entero mediría el pico.
check('mide fila por fila', sac.includes('BYROW(') && sac.includes('LAMBDA(r;MAX(r))'))
check('es medio sueldo', sac.includes(')))/2'))
check('toma el semestre que le toca', sac.includes('$D$10:$I$28'))
check('el segundo semestre es el otro', formulaDelSac({ p0: 10, p1: 28 }, [7, 8, 9, 10, 11, 12]).includes('$J$10:$O$28'))
check('colMes: enero es D y diciembre O', colMes(1) === 'D' && colMes(12) === 'O')

// ── EL «% EN BLANCO MEDIDO» ─────────────────────────────────────────────────────────────────────
const bm = formulaBlancoMedido({ filaTotal: 29 })
// LOS DOS LADOS NETOS. La remuneración del F931 es BRUTA: compararla contra el neto pagado —que es
// el error que tenía la celda vieja— da 50 % donde lo medido es 38,6 %.
check('lleva el bruto a neto', bm.includes('*(1-$D$5)'))
// ANCLADA AL RÓTULO, NO A LA CELDA J36: la otra pestaña crece y la referencia por fila se corre sola.
check('se ancla por rótulo', bm.includes('MATCH("Remuneración declarada"') && !bm.includes('J36'))
// LOS MESES LOS CUENTA EL DATO: en septiembre son ocho, en octubre nueve, sin tocar nada.
check('cuenta los meses con DDJJ', bm.includes('COUNT(') && bm.includes('MONTH(JORNALES_REAL_HASTA)<=COUNT('))
// LA MISMA POBLACIÓN EN LOS DOS LADOS (25/09): el neto sale de lo pagado a TODOS (quincenas + oficina),
// no del cuadro 1, que dejó afuera a los que se fueron y el F931 sí los declara.
check('neto de toda la gente, no del cuadro 1', bm.includes('JORNALES_REAL_TOTAL') && bm.includes('OFICINA_PAGADO') && !bm.includes('OFFSET($D$'))
check('separador es_AR', !bm.includes(','))

check('los rótulos son los tres', [ROTULO_DESVINCULADOS, ROTULO_OFICINA, ROTULO_SAC].every((r) => typeof r === 'string' && r.length > 3))

console.log(`nomina-plantel-completo.test: ${ok} OK, ${falla} FALLA`)
if (falla) process.exit(1)
