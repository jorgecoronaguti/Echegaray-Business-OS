// LO QUE SE PRUEBA ACÁ SON LOS TRES DEFECTOS QUE EL DUEÑO REPORTÓ EL 13/08, cada uno con el caso
// concreto que lo dispara — no la mecánica del cuadro.
//
//   1. la primera fila del 1.3 mostraba "Quincena 15/08 · Hasta 15/08 · Días — · Proyectado —";
//   2. los días se contaban de lunes a viernes y la obra trabaja hasta el sábado;
//   3. oficina y dirección no se podían sumar a las quincenas de obra.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COLS_CALENDARIO, colCalendario, diasLaborables, expresionDias, MASCARA_DOMINGO,
  formulaVentana, formulaShareEfectivo, formulaControlCalendario,
  formulaBajaNoRegistrada, formulaHaberesDelBanco,
} from './jornales-calendario.mjs'
import { diasHabilesObra } from './jornales-demanda-obras.mjs'

// LAS QUINCENAS REALES DE 2026, con la columna "Días hábiles" que la planilla JORNALES cargó de
// verdad (leída del registro de la pestaña viva el 13/08). Es el oráculo: no una opinión sobre qué
// días trabaja la obra, sino los días que la obra trabajó.
//
// FALTAN TRES DE LAS QUINCE, Y SE DICE CUÁLES: 16-31/01 (16 días cargados contra 14 de calendario),
// 16-31/03 (12 contra 14) y 01-15/04 (11 contra 13). Son feriados, paros y días extra que ningún
// calendario del Sheet conoce, y meterlos acá obligaría a aflojar la igualdad a una tolerancia — con
// lo cual el test dejaría de distinguir lun-sáb de lun-vie, que es exactamente lo que vino a medir.
// El sesgo que quedan sin cubrir es de días REALES, no de criterio, y va a los dos lados.
const REGISTRO = [
  ['2026-01-05', '2026-01-15', 10], ['2026-02-02', '2026-02-14', 12], ['2026-02-16', '2026-02-28', 12],
  ['2026-03-02', '2026-03-14', 12], ['2026-04-16', '2026-04-30', 13], ['2026-05-04', '2026-05-16', 12],
  ['2026-05-18', '2026-05-30', 12], ['2026-06-01', '2026-06-15', 13], ['2026-06-16', '2026-06-30', 13],
  ['2026-07-01', '2026-07-15', 13], ['2026-07-16', '2026-07-31', 14], ['2026-08-03', '2026-08-15', 12],
]
const d = (iso) => { const [y, m, x] = iso.split('-').map(Number); return new Date(y, m - 1, x) }
/** La fórmula SIN sus literales de texto: una coma en una frase es prosa, no un separador es-AR. */
const sinTextos = (f) => String(f).replace(/"[^"]*"/g, '""')
const lunVie = (a, b) => {
  let n = 0
  for (const x = new Date(a); x <= b; x.setDate(x.getDate() + 1)) if (x.getDay() >= 1 && x.getDay() <= 5) n++
  return n
}

test('EL CALENDARIO DE LA OBRA ES LUNES A SÁBADO — medido contra los días que la planilla cargó', () => {
  // ═══ EL DEFECTO, CON SU NÚMERO ═══
  // La proyección usaba `NETWORKDAYS(desde;hasta)` = lunes a viernes. Sobre estas doce quincenas eso
  // da 125 días contra los 148 que la planilla cargó: **la proyección de obra venía 15,5% por debajo**
  // sin dar un solo error. Y las horas por persona se MIDEN dividiendo por los días del registro
  // (lun-sáb), así que el producto además mezclaba dos calendarios distintos.
  let real = 0; let sab = 0; let vie = 0
  for (const [a, b, dias] of REGISTRO) {
    real += dias; sab += diasLaborables(d(a), d(b)); vie += lunVie(d(a), d(b))
    assert.equal(diasLaborables(d(a), d(b)), dias, `${a}→${b}: lun-sáb no reproduce los días cargados`)
  }
  assert.equal(sab, real, 'lun-sábado tiene que reproducir EXACTAMENTE los días que cargó la planilla')
  assert.ok(vie < real * 0.98, `lun-viernes (${vie}) tiene que quedar claramente por debajo de los ${real} reales`)
})

test('la fórmula que va al Sheet usa la MISMA máscara: sólo el domingo no es laborable', () => {
  // La mitad del defecto que no se ve en JavaScript: la celda podría seguir contando lun-vie aunque
  // la lib de acá contara bien. La máscara es lunes→domingo con 1 = no laborable.
  assert.equal(MASCARA_DOMINGO, '"0000001"')
  const f = expresionDias('A30', 'B30')
  assert.equal(f, 'NETWORKDAYS.INTL(A30;B30;"0000001")')
  assert.doesNotMatch(f, /NETWORKDAYS\(/, 'volvió el NETWORKDAYS de lunes a viernes')
  assert.doesNotMatch(f, /,/, 'separador es-AR: punto y coma')
})

test('UNA SOLA DEFINICIÓN DE "DÍA DE OBRA": no hay dos funciones que cuenten días', () => {
  // El defecto original era justamente tener dos calendarios: la demanda de obras repartía por
  // lun-sáb y el convenio proyectaba por lun-vie, y el MAX comparaba peras con manzanas.
  assert.equal(diasLaborables, diasHabilesObra)
})

test('el encabezado del calendario tiene OCHO columnas y la letra sale de él, nunca a mano', () => {
  // Nueve columnas dejarían la pestaña con tres anchos de grilla y el auditor de patrón lo marca:
  // es el defecto que el dueño llama "descuadrado".
  assert.equal(COLS_CALENDARIO.length, 8)
  assert.equal(colCalendario('Obreros'), 'D')
  assert.equal(colCalendario('TOTAL'), 'G')
  assert.throws(() => colCalendario('Días hábiles'), /no tiene la columna/)
  // "Quincena" NO: la primera fila puede ser el RESTO de la quincena en curso, y ése era el rótulo
  // que hacía leer una quincena de un día.
  assert.equal(COLS_CALENDARIO[0], 'Período')
})

test('LAS VENTANAS SON CONTIGUAS Y DISJUNTAS: ni un mes afuera, ni un mes dos veces', () => {
  const arg = (celdaDesde, celdaHasta) => formulaVentana({
    rangoImporte: '$H$50:$H$61', rangoFecha: '$E$50:$E$61', celdaDesde, celdaHasta,
  })
  // La PRIMERA no tiene piso: lo vencido o anterior al primer tramo tiene que entrar igual.
  const primera = arg(null, '$C$31')
  assert.equal(primera, '=SUMIFS($H$50:$H$61;$E$50:$E$61;"<"&$C$31)')
  assert.doesNotMatch(primera, />=/, 'la primera fila puso piso: lo anterior al primer tramo se pierde')
  // La ÚLTIMA no tiene techo: diciembre no se puede caer del calendario.
  const ultima = arg('$C$39', null)
  assert.equal(ultima, '=SUMIFS($H$50:$H$61;$E$50:$E$61;">="&$C$39)')
  assert.doesNotMatch(ultima, /"<"/, 'la última fila puso techo: lo de fin de año queda afuera')
  // Y las del medio cierran contra la fila SIGUIENTE, no contra una fecha escrita: el piso de una es
  // el techo de la anterior, así que ningún importe puede caer en dos ventanas.
  assert.equal(arg('$C$32', '$C$33'), '=SUMIFS($H$50:$H$61;$E$50:$E$61;">="&$C$32;$E$50:$E$61;"<"&$C$33)')
  assert.doesNotMatch(arg('$C$32', '$C$33'), /<=/, 'el techo inclusivo hace que un mes entre en dos ventanas')
})

test('la fracción de efectivo se MIDE sobre el registro, en la ventana del parámetro', () => {
  const f = formulaShareEfectivo({ banco: 'H', total: 'K', hasta: 'B' }, 107, 120)
  // Es 1 − banco/total, no (adelanto+recibo)/total: lo que el registro no prueba que salió por
  // transferencia se cuenta como efectivo. Con la otra forma, las quincenas donde los canales no
  // cierran dejan plata sin clasificar y los dos porcentajes no suman 100%.
  assert.match(f, /^=IFERROR\(1-SUMPRODUCT\(/)
  assert.match(f, /N\(\$H\$107:\$H\$120\)/, 'la fracción dejó de medirse contra la columna Banco')
  assert.match(f, /EDATE\(TODAY\(\);-JORNALES_MESES_BASE\)/, 'la ventana tiene que ser el parámetro, no un número')
  assert.match(f, /\$B\$107:\$B\$120<=TODAY\(\)/, 'entran quincenas que todavía no cerraron')
  assert.doesNotMatch(f, /0[.,]\d/, 'apareció un porcentaje escrito a mano: el canal de pago se mide, no se supone')
  assert.doesNotMatch(f, /,/, 'separador es-AR')
})

test('el control del calendario grita con el importe cuando el reparto no cierra', () => {
  const f = formulaControlCalendario({
    oficina: 'E40', direccion: 'F40', totalOficina: '$H$59', totalDireccion: '$H$84',
  })
  // Compara contra el total del bloque, que se calcula por el OTRO camino (SUM de la columna). Un
  // control que se validara contra la misma suma no probaría nada.
  assert.match(f, /ROUND\(E40-\$H\$59;0\)=0/)
  assert.match(f, /ROUND\(F40-\$H\$84;0\)=0/)
  assert.match(f, /⚠ el calendario no cierra/)
  assert.match(f, /✓ oficina y dirección cierran/)
  // La única coma admitida es la del patrón de miles de TEXT("#,##0"), que no es un separador de
  // argumentos: fuera de ella, es-AR manda punto y coma.
  assert.doesNotMatch(sinTextos(f), /,/, 'separador es-AR')
})

test('LA BAJA NO REGISTRADA: la pestaña dice cuánto cuesta seguir proyectando a alguien que se fue', () => {
  // ═══ EL CASO MEDIDO (13/08) ═══
  // Navarro cobró su liquidación final. El plantel base es la última quincena CERRADA, donde todavía
  // figura: Σ $/hora base $85.900 contra $80.400 de la quincena en curso — los $5.500 de su jornal, al
  // peso. La proyección lo sigue pagando hasta diciembre y NADA en la pestaña lo decía.
  const f = formulaBajaNoRegistrada({
    personasBase: '$B$19', sigmaBase: '$C$19', personasCurso: '$E$111', sigmaCurso: '$L$111',
    totalObra: '$D$41',
  })
  // Calla cuando no falta nadie: un control que habla siempre se vuelve invisible al mes.
  assert.match(f, /IF\(OR\(N\(\$C\$19\)=0;N\(\$B\$19\)-N\(\$E\$111\)<=0\);""/)
  // Y el importe sale de la RELACIÓN de las dos Σ, no de un jornal escrito a mano.
  assert.match(f, /\(1-N\(\$L\$111\)\/N\(\$C\$19\)\)\*N\(\$D\$41\)/)
  assert.match(f, /hasta \$/, 'con el MAX de la demanda el exceso es un techo, y el rótulo tiene que decirlo')
  assert.match(f, /sacalas de la planilla JORNALES/, 'sin decir dónde se arregla, el control no es accionable')
  assert.doesNotMatch(sinTextos(f), /,/, 'separador es-AR')
})

test('LO QUE EL BANCO PAGÓ POR HABERES Y NINGUNA NÓMINA EXPLICA — control contra OTRA fuente', () => {
  // Una liquidación final no es una quincena y no cabe en el registro: sin esta línea, la caja paga
  // $239.790,94 que la pestaña no explica en ningún lado. Y el lote del 31/07 fue $6.067.921,10
  // contra $3.336.233,42 declarados por banco en el registro.
  const { importe, glosa } = formulaHaberesDelBanco({
    bancoObra: '$H$110:$H$120', pagoObra: '$C$110:$C$120',
    bancoOfi: '$F$50:$F$61', pagoOfi: '$E$50:$E$61',
  })
  // Los egresos vienen negativos en la réplica: sin el menos, el control compara contra el opuesto.
  assert.match(importe, /^=IFERROR\(-SUMIFS\('_BANCO_RAW'!\$C\$4:\$C;'_BANCO_RAW'!\$F\$4:\$F;"Sueldos"\)/)
  // LA VENTANA ES LA DEL EXTRACTO, tomada de la propia réplica: comparar contra el registro entero
  // marcaría como "sin explicar" los meses que el banco simplemente no tiene.
  assert.match(glosa, /">="&MIN\('_BANCO_RAW'!\$A\$4:\$A\)/)
  assert.match(glosa, /\$F\$50:\$F\$61/, 'el banco de OFICINA también explica parte del lote')
  assert.match(glosa, /liquidaciones finales, SAC o sueldos fuera de la planilla/)
  assert.doesNotMatch(sinTextos(glosa), /,/, 'separador es-AR')
})
