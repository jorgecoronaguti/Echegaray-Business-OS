// LO QUE SE PRUEBA ACÁ SON LOS TRES DEFECTOS QUE EL DUEÑO REPORTÓ EL 13/08, cada uno con el caso
// concreto que lo dispara — no la mecánica del cuadro.
//
//   1. la primera fila del 1.3 mostraba "Quincena 15/08 · Hasta 15/08 · Días — · Proyectado —";
//   2. los días se contaban de lunes a viernes y la obra trabaja hasta el sábado;
//   3. oficina y dirección no se podían sumar a las quincenas de obra.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COLS_CALENDARIO, colCalendario, diasLaborables, expresionDias, MASCARA_FIN_DE_SEMANA,
  formulaVentana, formulaShareEfectivo, formulaGlosaShareEfectivo, formulaControlCalendario,
  formulaBajaNoRegistrada, LINEA_SABADOS, shareEfectivoAnual, MIN_QUINCENAS_SHARE,
  formulaAcuerdoDeclarado, acuerdoDeclarado, formulaAcuerdoMensual, acuerdoMensual,
} from './jornales-calendario.mjs'
import { diasHabilesObra } from './jornales-demanda-obras.mjs'
// El tope de una glosa y el texto que el lector VE adentro de una fórmula: las dos cosas viven en el
// auditor de patrón, y se importan en vez de copiarse — una copia del criterio se queda atrás.
import { LARGO_NOTA, textoVisible } from './patron-pestana.mjs'

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

test('LA SEMANA DE OBRA ES LUNES A VIERNES — y lo que queda afuera se declara, no se calcula', () => {
  // ═══ EL ERROR QUE ESTE TEST FIJA, Y NO ES EL QUE PARECE ═══
  //
  // Medí que la planilla carga 148 días donde lunes-viernes cuenta 125 y concluí que la obra trabaja
  // los sábados. El dueño: "las obras trabajan hasta el viernes". La medición era buena y la
  // conclusión estaba mal: esos ~23 días son sábados de HORAS EXTRA, no la semana normal. Convertir
  // un dato observado en supuesto de cálculo movía $9,6M de proyección sin que nadie lo decidiera.
  //
  // Lo que se fija acá es el criterio del dueño, no la medición.
  assert.equal(diasLaborables(d('2026-08-16'), d('2026-08-31')), 11, 'agosto 16-31: 11 días lunes a viernes')
  assert.equal(diasLaborables(d('2026-07-16'), d('2026-07-31')), 12)
  for (const [a, b] of REGISTRO.map((x) => [x[0], x[1]])) {
    assert.equal(diasLaborables(d(a), d(b)), lunVie(d(a), d(b)), `${a}→${b}: dejó de contar lunes a viernes`)
  }
  // Y el sábado no desaparece del relato: la pestaña declara que la proyección no lo ve.
  //
  // LA DECLARACIÓN PASÓ DE 167 CARACTERES A 35 (13/08). "la proyección cuenta días de LUNES A VIERNES"
  // decía por qué falta el sábado; el rótulo nuevo dice QUÉ falta, que es lo que el lector necesita
  // para no sumar mal. Lo que este test protege es lo mismo de siempre: que los sábados y las horas
  // extra queden NOMBRADOS —si el rótulo se cae, la proyección se lee como si los incluyera— y que la
  // línea siga siendo una declaración y no un número estimado.
  assert.match(LINEA_SABADOS, /⊘/, 'el símbolo de "no entra acá" es lo que marca la exclusión')
  assert.match(LINEA_SABADOS, /sábados/i)
  assert.match(LINEA_SABADOS, /horas extra/)
  assert.doesNotMatch(LINEA_SABADOS, /\d/, 'la línea DECLARA; si trae un número volvió a ser un cálculo')
})

test('la fórmula que va al Sheet usa la MISMA máscara: sólo el domingo no es laborable', () => {
  // La mitad del defecto que no se ve en JavaScript: la celda podría seguir contando lun-vie aunque
  // la lib de acá contara bien. La máscara es lunes→domingo con 1 = no laborable.
  // La máscara es lunes→domingo con 1 = no laborable: "0000011" = sábado y domingo. Se escribe
  // explícita —y no `NETWORKDAYS` a secas— para que el criterio viva en UN lugar: el día que la
  // semana de obra cambie, se mueven juntas la fórmula del Sheet y el reparto de la demanda.
  assert.equal(MASCARA_FIN_DE_SEMANA, '"0000011"')
  const f = expresionDias('A30', 'B30')
  assert.equal(f, 'NETWORKDAYS.INTL(A30;B30;"0000011")')
  assert.doesNotMatch(f, /,/, 'separador es-AR: punto y coma')
})

test('UNA SOLA DEFINICIÓN DE "DÍA DE OBRA": no hay dos funciones que cuenten días', () => {
  // El defecto era el DESACUERDO, no el día: la demanda repartía por lun-sáb y el convenio proyectaba
  // por lun-vie, y el MAX comparaba peras con manzanas. Ahora las dos salen de la misma función.
  assert.equal(diasLaborables, diasHabilesObra)
})

test('el encabezado del calendario tiene OCHO columnas y la letra sale de él, nunca a mano', () => {
  // Nueve columnas dejarían la pestaña con tres anchos de grilla y el auditor de patrón lo marca:
  // es el defecto que el dueño llama "descuadrado".
  assert.equal(COLS_CALENDARIO.length, 8)
  assert.equal(colCalendario('Obreros'), 'D')
  // CAMBIO DE CONTRATO (14/08): «TOTAL» salió y entró «Por banco». El dueño pidió cuatro veces las
  // DOS mitades del acuerdo 50/50 en la proyección, y el calendario publicaba sólo el efectivo. El
  // TOTAL era la suma de las tres columnas que tenía al lado: se recompone de un vistazo y no
  // decidía nada por sí solo. El ancho de 8 no se movió, que es lo que este test protege.
  assert.equal(colCalendario('Por banco'), 'G')
  assert.throws(() => colCalendario('TOTAL'), /no tiene la columna/)
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

// ═══ EL CANAL DE PAGO — LAS QUINCENAS REALES DE 2026, LEÍDAS DEL REGISTRO VIVO EL 13/08 ═══
//
// [hasta, banco, total, pagado el]. Las catorce primeras están pagadas; la última (03/08–15/08) está
// EN CURSO: tiene $4.473.400 cargados, cero por banco y ninguna fecha de pago. Es el caso del dueño.
const CANALES = [
  ['2026-01-15', 1380275, 4888075, '2026-01-16'], ['2026-01-31', 0, 8161000, '2026-02-02'],
  ['2026-02-14', 0, 8337250, '2026-02-16'], ['2026-02-28', 0, 9038100, '2026-03-02'],
  ['2026-03-14', 0, 7948200, '2026-03-16'], ['2026-03-31', 0, 6796619, '2026-04-01'],
  ['2026-04-15', 0, 6772479, '2026-04-16'], ['2026-04-30', 4150650, 9939650, '2026-05-01'],
  ['2026-05-16', 489600, 10105210, '2026-05-18'], ['2026-05-30', 0, 8593590, '2026-06-03'],
  ['2026-06-15', 5060000, 9393250, '2026-06-16'], ['2026-06-30', 0, 9384100, '2026-07-01'],
  ['2026-07-15', 3775150, 7227250, '2026-07-17'], ['2026-07-31', 3336233, 8469500, '2026-08-03'],
  ['2026-08-15', 0, 4473400, null],
].map(([hasta, banco, total, pagado]) => ({
  hasta: new Date(`${hasta}T00:00:00`), banco, total,
  pagado: pagado ? new Date(`${pagado}T00:00:00`) : null,
}))
const HOY = new Date('2026-08-13T00:00:00')

test('EL % DE EFECTIVO ES EL PROMEDIO DEL AÑO, NO EL DE LA VENTANA DE HORAS', () => {
  // El dueño: "el adelanto es algo q no se puede proyectar asi como está, se tiene q hacer un calculo
  // promedio del año". Medido sobre las quincenas reales: 14 pagadas, $18.191.908 por banco sobre
  // $115.054.273 pagados ⇒ 84,19% en billetes. La ventana vieja de 3 meses (las últimas seis) daba
  // 76,19%: ocho puntos, y ninguna de las dos daba error.
  const r = shareEfectivoAnual(CANALES, HOY)
  assert.equal(r.quincenas, 14, 'entraron las quincenas que no están pagadas, o se perdió alguna')
  assert.equal(r.banco, 18191908)
  assert.equal(r.total, 115054273)
  assert.equal(Number((r.share * 100).toFixed(2)), 84.19)
  // Las últimas SEIS quincenas —la muestra que la pestaña usaba— dan otro número. Si algún día esta
  // igualdad se rompe es porque alguien volvió a la ventana corta.
  const tresMeses = shareEfectivoAnual(CANALES.slice(8, 14), HOY)
  assert.equal(Number((tresMeses.share * 100).toFixed(2)), 76.19)
})

test('LA QUINCENA EN CURSO NO PUEDE MOVER EL PORCENTAJE PROYECTADO', () => {
  // EL DEFECTO QUE MOTIVA TODO. La quincena que está corriendo tiene TOTAL cargado y BANCO en cero
  // —el lote de haberes sale recién el día de pago—, así que contarla la hace ver 100% en billetes y
  // empuja el promedio hacia arriba un poco más cada día que se carga una jornada.
  const base = shareEfectivoAnual(CANALES, HOY).share
  // Se cargan tres jornadas más en la quincena en curso: $4,47M → $7,5M. NADA puede moverse.
  const conMasHoras = CANALES.map((f) => (f.pagado ? f : { ...f, total: 7500000 }))
  assert.equal(shareEfectivoAnual(conMasHoras, HOY).share, base,
    'cargar horas de la quincena en curso movió el % que proyecta el efectivo')
  // Y el mismo día 15/08, cuando la quincena YA CERRÓ pero todavía no se pagó (se paga el 17/08), el
  // criterio viejo `hasta<=TODAY()` la habría dejado entrar: 84,19% → 84,78%.
  const alCierre = shareEfectivoAnual(CANALES, new Date('2026-08-15T00:00:00')).share
  assert.equal(alCierre, base, 'una quincena cerrada y NO pagada entró: el canal todavía no es un hecho')
  const siEntrara = 1 - 18191908 / (115054273 + 4473400)
  assert.notEqual(Number((siEntrara * 100).toFixed(2)), Number((base * 100).toFixed(2)))
})

test('ES UNA RAZÓN DE IMPORTES, NO UN PROMEDIO DE PORCENTAJES', () => {
  // Cinco quincenas chicas 100% efectivo y una grande 100% banco. El promedio de porcentajes diría
  // 83%; la razón de importes dice 5%, que es la plata que realmente hay que tener en billetes.
  const chicas = Array.from({ length: 5 }, (_, i) => ({
    hasta: new Date(2026, 0, 15 + i), pagado: new Date(2026, 0, 16 + i), banco: 0, total: 100000,
  }))
  const grande = { hasta: new Date(2026, 5, 30), pagado: new Date(2026, 6, 1), banco: 9500000, total: 9500000 }
  const r = shareEfectivoAnual([...chicas, grande], HOY)
  assert.equal(Number(r.share.toFixed(4)), 0.05, 'promedió porcentajes: una quincena chica pesa igual que una grande')
  assert.notEqual(Number(r.share.toFixed(4)), Number((5 / 6).toFixed(4)), 'esto es AVERAGE de los share por quincena')
})

test('SIN HISTORIA SUFICIENTE NO SE PROYECTA — SE DECLARA', () => {
  const pocas = CANALES.filter((f) => f.pagado).slice(0, MIN_QUINCENAS_SHARE - 1)
  assert.equal(shareEfectivoAnual(pocas, HOY).share, null,
    `con menos de ${MIN_QUINCENAS_SHARE} quincenas pagadas se inventó un porcentaje`)
  assert.notEqual(shareEfectivoAnual(CANALES.filter((f) => f.pagado).slice(0, MIN_QUINCENAS_SHARE), HOY).share, null)
  // El 02/01, con el registro del año nuevo vacío: cero quincenas, ningún número plausible.
  assert.equal(shareEfectivoAnual(CANALES, new Date('2027-01-02T00:00:00')).share, null,
    'el año nuevo arrancó proyectando con las quincenas del año pasado')
})

test('la fórmula del Sheet transcribe el MISMO criterio: año, pagadas y piso de quincenas', () => {
  const f = formulaShareEfectivo({ banco: 'H', total: 'K', hasta: 'B', pagado: 'N' }, 113, 127)
  // Es 1 − banco/total, no (adelanto+recibo)/total: lo que el registro no prueba que salió por
  // transferencia se cuenta como efectivo. Con la otra forma, las quincenas donde los canales no
  // cierran dejan plata sin clasificar y los dos porcentajes no suman 100%.
  assert.match(f, /1-SUMPRODUCT\(/)
  assert.match(f, /N\(\$H\$113:\$H\$127\)/, 'la fracción dejó de medirse contra la columna Banco')
  assert.match(f, /\$B\$113:\$B\$127>=DATE\(YEAR\(TODAY\(\)\);1;1\)/, 'la ventana dejó de ser el año en curso')
  assert.match(f, /N\(\$N\$113:\$N\$127\)>0/, 'entran quincenas sin fecha de pago: el canal todavía no es un hecho')
  assert.doesNotMatch(f, /EDATE\(TODAY\(\);-JORNALES_MESES_BASE\)/,
    'volvió la ventana de las HORAS: el canal de pago no es un ritmo de trabajo')
  assert.match(f, new RegExp(`<${MIN_QUINCENAS_SHARE};""`), 'sin base suficiente la celda tiene que quedar VACÍA')
  assert.doesNotMatch(f, /IFERROR/, 'un IFERROR devuelve un número plausible donde no hay base')
  assert.doesNotMatch(f, /0[.,]\d/, 'apareció un porcentaje escrito a mano: el canal de pago se mide, no se supone')
  assert.doesNotMatch(f, /,/, 'separador es-AR')
})

test('el rótulo declara el criterio en dos datos, sin una sola explicación', () => {
  const g = formulaGlosaShareEfectivo({ total: 'K', hasta: 'B', pagado: 'N' }, 113, 127)
  assert.match(g, /quincenas pagadas del año/)
  assert.match(g, /⊘ sin base/, 'sin base suficiente el rótulo no dice por qué la columna está vacía')
  // "Muchas palabras y frases y explicaciones que nadie lee" fue el rechazo del dueño a esta pestaña.
  // El texto más largo que esta celda puede mostrar son 28 caracteres.
  const textos = [...g.matchAll(/"([^"]*)"/g)].map((m) => m[1])
  assert.ok(Math.max(...textos.map((t) => t.length)) <= 28, `rótulo largo: ${textos.join('|')}`)
  assert.doesNotMatch(g.replace(/"[^"]*"/g, ''), /,/, 'separador es-AR')
})

test('el control del calendario grita con el importe cuando el reparto no cierra', () => {
  const f = formulaControlCalendario({
    oficina: 'E40', direccion: 'F40', totalOficina: '$H$59', totalDireccion: '$H$84',
  })
  // Compara contra el total del bloque, que se calcula por el OTRO camino (SUM de la columna). Un
  // control que se validara contra la misma suma no probaría nada.
  assert.match(f, /ROUND\(E40-\$H\$59;0\)=0/)
  assert.match(f, /ROUND\(F40-\$H\$84;0\)=0/)
  assert.match(f, /▲ el calendario no cierra/)
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
  // "Si son bajas, sacalas de la planilla JORNALES — el OS no puede distinguir una baja de una
  // ausencia" salió de la celda el 13/08 y quedó como comentario en `formulaBajaNoRegistrada`. El
  // control sigue siendo accionable porque nombra las dos cifras que deciden: CUÁNTAS personas de más
  // y CUÁNTA plata cuesta hasta diciembre. Sin la cantidad, el aviso no se puede contrastar con nada.
  assert.match(f, /persona\(s\) menos que el plantel base/, 'el aviso dejó de decir cuántas personas sobran')
  assert.doesNotMatch(sinTextos(f), /,/, 'separador es-AR')
})


// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL ACUERDO 50/50 DECLARADO CONTRA LO QUE LA PLANILLA REGISTRA (14/08)
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('LA CONTRADICCIÓN SE MIDE, NO SE TAPA: 15,8% por banco contra un acuerdo del 50%', () => {
  // Las quincenas pagadas de 2026 tal como las tiene el registro: $18.191.908 por banco sobre
  // $115.054.273, y NUEVE de quince con la columna Banco en cero. El dueño declara 50/50; la planilla
  // dice otra cosa. El número que importa para decidir es la distancia, y son los dos a la vez: el
  // faltante en pesos y cuántas quincenas ni siquiera tienen el canal cargado.
  const hoy = new Date(2026, 7, 14)
  const d = (dia, mes) => new Date(2026, mes - 1, dia)
  // Quince quincenas pagadas: seis con banco (suman $18.191.908) y nueve en cero.
  const conBanco = [3031984.66, 3031984.66, 3031984.66, 3031984.67, 3031984.67, 3031984.68]
  const filas = [
    ...conBanco.map((b, i) => ({ hasta: d(15, i + 1), pagado: d(20, i + 1), banco: b, total: 7670284.87 })),
    ...Array.from({ length: 9 }, (_, i) => ({
      hasta: d(28, ((i % 6) + 1)), pagado: d(2, ((i % 6) + 2)), banco: 0, total: 7670284.86,
    })),
  ]
  const r = acuerdoDeclarado(filas, hoy)
  assert.equal(r.quincenas, 15)
  assert.equal(r.enCero, 9, 'nueve quincenas pagadas sin un peso por banco')
  assert.equal(Math.round(r.porBanco * 1000) / 10, 15.8, 'el 15,8% medido, no el 50% declarado')
  // Y LA DISTANCIA EN PESOS, que es lo accionable: la mitad de lo pagado menos lo que salió por banco.
  // Se compara contra el fixture y no contra una constante tipeada: si mañana cambia una quincena, el
  // test sigue midiendo la MISMA regla en vez de romperse por un peso de redondeo.
  const { banco, total } = shareEfectivoAnual(filas, hoy)
  assert.equal(Math.round(r.faltaParaElAcuerdo), Math.round(total / 2 - banco))
  assert.ok(Math.abs(r.faltaParaElAcuerdo - (115054273 / 2 - 18191908)) < 5,
    'el orden de magnitud medido en el archivo vivo: ~$39,3M para llegar al acuerdo declarado')
})

test('la línea del acuerdo DERIVA del share que ya se mide — no calcula un segundo porcentaje', () => {
  const cols = { banco: 'H', total: 'K', hasta: 'B', pagado: 'N' }
  const { valor, glosa } = formulaAcuerdoDeclarado(cols, 116, 130, 16)
  // Deriva de la celda del share: dos fórmulas para el mismo canal se separan el día que una cambia.
  assert.equal(valor, '=IF($B$16="";"";1-$B$16)')
  assert.match(glosa, /faltan \$/)
  assert.match(glosa, /en \$0/)
  // `ΣTOTAL/2` y NUNCA un literal decimal: en es_AR la coma es el decimal y el `;` el separador de
  // argumentos, así que un `0,5` suelto parte la fórmula en dos argumentos.
  assert.doesNotMatch(glosa, /0,5/)
  assert.match(glosa, /\/2-/)
  // El patrón de TEXT va en US aunque los argumentos vayan en locale — la otra mitad de la regla.
  assert.match(glosa, /"#,##0"/)
  // Y NO SE FABRICA EL 50%: la celda del valor publica lo medido, nunca el acuerdo.
  assert.doesNotMatch(valor, /0,5|\b50\b/)
})

test('LA GLOSA DEL ACUERDO ENTRA EN LA GRILLA: 78 caracteres desparramaban la fila entera', () => {
  // ═══ EL DEFECTO, VISTO EN EL PDF DE LA PESTAÑA VIVA (14/08) ═══
  //
  // «acuerdo 50% · faltan $39.335.228 por banco · 8 de 14 quincenas con banco en $0» mide 78 y va en
  // la columna C: `auditarPatron` lo marcó `nota-en-el-medio` (el tope es LARGO_NOTA = 60) y en el PDF
  // el texto se derramaba sobre las columnas de la derecha, corriendo los encabezados «Dirección» y
  // «TOTAL» del calendario. Un control que desalinea el cuadro que controla no está terminado.
  //
  // Se mide sobre el texto que el lector VE —el literal más largo adentro de la fórmula—, que es la
  // única forma de cazarlo sin escribir el Sheet: en frío, el valor de una fórmula es la fórmula.
  const cols = { banco: 'H', total: 'K', hasta: 'B', pagado: 'N' }
  const largo = (f) => textoVisible(f).length
  const quincenal = formulaAcuerdoDeclarado(cols, 116, 130, 16)
  const mensual = formulaAcuerdoMensual({ banco: 'F', pagado: 'C' }, 37, 48, 20)
  for (const [quien, g] of [['obra', quincenal.glosa], ['oficina', mensual.glosa]]) {
    assert.ok(largo(g) <= LARGO_NOTA, `la glosa de ${quien} mide ${largo(g)} y el tope es ${LARGO_NOTA}: ${textoVisible(g)}`)
  }
  // Lo que se fue es lo que ya dice el rótulo de la columna A, no el dato: los pesos que faltan y los
  // períodos sin un peso por banco siguen ahí.
  assert.match(mensual.glosa, /faltan \$/)
  assert.match(mensual.glosa, /en \$0/)
})

test('OFICINA MIDE EL MISMO ACUERDO QUE OBRA, sobre la ventana de SU bloque', () => {
  // El dueño: *"quiero q la tabla de 'oficina' sea igual que la de 'obreros' dado q el acuerdo es el
  // mismo 50% por banco (recibo de sueldo), 50% efectivo"*. El acuerdo es el mismo, así que el control
  // es el mismo: la fracción sale del share que ya se mide y la brecha se publica al lado.
  const { valor, glosa } = formulaAcuerdoMensual({ banco: 'F', pagado: 'C' }, 37, 48, 20)
  assert.equal(valor, '=IF($B$20="";"";1-$B$20)', 'oficina calcula su propio porcentaje en vez de derivarlo')
  // LA VENTANA ES LA DE SU BLOQUE: meses con «Pagado» cargado. Oficina no tiene columna «Pagado el»
  // —se liquida por mes— y exigirle esa marca dejaría el control mudo para siempre.
  assert.match(glosa, /--\(N\(\$C\$37:\$C\$48\)>0\)/)
  assert.match(glosa, /\$F\$37:\$F\$48/)
  assert.doesNotMatch(glosa, /TODAY/, 'oficina no filtra por fecha: su ventana es la del bloque')
  // Mismo locale y mismo patrón que la línea de obra: `/2` y nunca `0,5`, `TEXT` en US.
  assert.doesNotMatch(glosa, /0,5/)
  assert.match(glosa, /"#,##0"/)
})

test('EL MISMO CRITERIO EN JAVASCRIPT: la brecha mensual se puede afirmar sin leer la celda', () => {
  // Un test sobre un string prueba que la fórmula dice lo que quisimos escribir, nunca que el número
  // sale bien. Acá la aritmética se prueba con números.
  const meses = [
    { pagado: 1000, banco: 400 }, { pagado: 1000, banco: 0 },
    { pagado: 2000, banco: 0 }, { pagado: 0, banco: 0 },
  ]
  const r = acuerdoMensual(meses)
  assert.equal(r.meses, 3, 'el mes sin pagar no entra: no hay canal que medir')
  assert.equal(r.enCero, 2, 'dos meses pagados sin un peso por banco')
  assert.equal(r.porBanco, 400 / 4000)
  assert.equal(r.faltaParaElAcuerdo, 4000 / 2 - 400)
  // SIN UN SOLO MES PAGADO NO SE OPINA. Un 0% sería un número fabricado por una guarda.
  assert.equal(acuerdoMensual([{ pagado: 0, banco: 0 }]).porBanco, null)
})
