// LOS INVARIANTES QUE SE MUDARON A `_CAJA_ANEXO`, VERIFICADOS EN FRÍO.
//
// POR QUÉ ESTE ARCHIVO EXISTE (05/08/2026). Cuando CAJA pasó de 143 filas a 45, siete bloques de
// control se mudaron a la pestaña auxiliar. Cada uno de esos bloques tenía tests que probaban un
// defecto real y caro —el efectivo contado dos veces, la nómina que salía por los dos canales, el
// cheque endosado que el cash flow seguía esperando—. **Un invariante que se muda de archivo y no se
// muda de test es un invariante que se perdió**, y la mudanza habría dejado la pestaña más linda y más
// ciega. Estos tests son los mismos, apuntando a donde ahora vive el código.
import test from 'node:test'
import assert from 'node:assert/strict'
import { grillaAnexo, ANCHO_ANEXO } from './caja-anexo.mjs'
import { ANEXO, DESDE_CAJA } from './caja-anexo-nombres.mjs'
import { ESPECIE_ANEXO } from './caja-anexo-nombres.mjs'
import { VACIO } from './preservar-anotaciones.mjs'
import { MARCAS } from './cheques-cobertura.mjs'
// La fila donde arranca el registro de Cheques Emitidos NO se escribe a mano en un test: es lo que
// este cambio vino a cerrar. Ver lib/cheques-emitidos-geometria.mjs.
import { FILA_DATO0 } from './cheques-emitidos-geometria.mjs'

const vacia = (s) => s === '' || s === VACIO
const REFS = { bancoRaw: '_BANCO_RAW', cheques: 'Cheques Emitidos', tarjeta: 'Tarjeta de Credito', cierre: 60, inicio: 50, cab: 5 }
const CARTERA = { origen: 'test', enCartera: [{ numero: '00000514', emisor: 'Mineral Del Río' }], endosados: [{ numero: '00000313', beneficiario: 'ALUMETAL S.A' }] }
const construir = () => grillaAnexo({ refs: REFS, cartera: CARTERA, conceptosCiegos: ['descubierto', 'Comisiones', 'Impuesto al cheque'] })

const filaDe = (g, re) => g.filas.findIndex((f) => re.test(String(f?.[0] ?? '').trim())) + 1
const celda = (g, fila, col) => String(g.filas[fila - 1]?.[col] ?? '')

test('el anexo se construye sin red, sin base y sin escribir una celda', () => {
  const g = construir()
  assert.ok(g.filas.length > 60, 'el detalle entero tiene que estar')
  for (const f of g.filas) assert.equal(f.length, ANCHO_ANEXO, 'una fila más ancha que la tabla hace fallar el batch ENTERO')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL DESGLOSE DEL EFECTIVO — SE VE Y NO SUMA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('el desglose del efectivo está entero: los seis sumandos, cada uno en su renglón', () => {
  // Un total solo no se puede discutir: $19,7 millones de efectivo en un cajón es un número que hay que
  // poder abrir. Las fórmulas son LAS MISMAS que arma el neto (se importan de la lib, no se copian), así
  // que el desglose no puede decir otra cosa que el total.
  const g = construir()
  const renglones = [
    [/\(\+\) cobrado en efectivo después del arqueo/i, false],
    [/\(−\) pagado en efectivo después del arqueo/i, true],
    [/\(−\) jornales pagados en efectivo después del arqueo/i, true],
    [/\(−\) sueldos de OFICINA en efectivo después del arqueo/i, true],
    [/\(\+\) extraído del banco después del arqueo/i, false],
    [/\(−\) depositado en el banco después del arqueo/i, true],
  ]
  for (const [re, resta] of renglones) {
    const f = filaDe(g, re)
    assert.ok(f > 0, `falta el renglón del desglose: ${re}`)
    assert.match(celda(g, f, 2), /^=/, `${re}: el desglose tiene que ser fórmula`)
    // El desglose se VE y no SUMA: la columna de pesos va vacía o el mismo efectivo entraría dos veces.
    assert.ok(vacia(celda(g, f, 4)), `${re}: el desglose NO puede aportar valor en pesos`)
    if (resta) assert.match(celda(g, f, 2), /;-\(/, `${re}: una descarga tiene que ir restando`)
  }
})

test('la nómina en efectivo DESCARGA la caja física y la de banco NO: son canales distintos', () => {
  // El dueño, sobre el 31/07: cobranzas en efectivo, compras, y jornales pagados 50% en efectivo y 50%
  // por transferencia. Ni una mitad ni la otra bajaba ninguna disponibilidad: la nómina no es una compra
  // ni un cheque. La plata se pagaba y no salía de la pestaña.
  const g = construir()
  const efvo = celda(g, filaDe(g, /jornales pagados en efectivo después del arqueo/i), 2)
  assert.match(efvo, /JORNALES_REAL_ADELANTO/)
  assert.match(efvo, /JORNALES_REAL_RECIBO/)
  assert.ok(!efvo.includes('JORNALES_REAL_BANCO'), 'lo que salió por banco no puede salir también del cajón')
  const bco = celda(g, filaDe(g, /jornales pagados por transferencia después del corte/i), 2)
  assert.match(bco, /JORNALES_REAL_BANCO/)
  assert.ok(!/ADELANTO|RECIBO/.test(bco), 'lo que salió en billetes no puede salir también del banco')
})

test('la oficina DESCARGA los dos canales, cada uno del suyo', () => {
  const g = construir()
  const bco = celda(g, filaDe(g, /sueldos de OFICINA por transferencia/i), 2)
  assert.match(bco, /OFICINA_BANCO/)
  assert.ok(!bco.includes('OFICINA_EFECTIVO'), 'lo que salió en billetes no puede salir también del banco')
  const efvo = celda(g, filaDe(g, /sueldos de OFICINA en efectivo/i), 2)
  // El efectivo sale POR DIFERENCIA (Pagado − Banco): así los dos canales suman siempre lo pagado.
  assert.match(efvo, /N\(OFICINA_PAGADO\)-N\(OFICINA_BANCO\)/)
  assert.match(efvo, /ISNUMBER\(OFICINA_BANCO\)/, 'con la celda vacía no se asume "todo efectivo"')
})

test('la extracción SUMA al cajón — es el espejo del depósito, que resta', () => {
  // La caja física sólo sabía BAJAR hacia el banco y nunca subir desde él: una asimetría que sólo puede
  // dar de menos.
  const g = construir()
  const c = celda(g, filaDe(g, /extraído del banco después del arqueo/i), 2)
  assert.match(c, /extraccion/)
  assert.ok(!/;-\(/.test(c), 'la extracción CARGA la caja: no lleva signo negativo')
})

test('los dos netos incorporan la nómina y la oficina: el desglose no puede decir algo que el total no dice', () => {
  const g = construir()
  const neto = celda(g, filaDe(g, /NETO de efectivo posterior al arqueo/i), 2)
  assert.match(neto, /JORNALES_REAL_ADELANTO/, 'el neto de efectivo tiene que restar la nómina en billetes')
  assert.match(neto, /OFICINA_PAGADO/, 'y los sueldos de oficina')
  // Y el cajón de PESOS no se come los dólares: U$S 15.000 entrando como $15.000 es el importe correcto
  // en la moneda equivocada, que no da error y está mal por dos órdenes de magnitud.
  assert.match(neto, /"<>USD"/, 'la línea de pesos excluye explícitamente los cobros en dólares')
})

test('el canal no declarado se NOMBRA, no se adivina', () => {
  const g = construir()
  const monto = celda(g, filaDe(g, /sin declarar por qué canal/i), 2)
  assert.match(monto, /OFICINA_PAGADO/)
  assert.match(monto, /\(1-ISNUMBER\(OFICINA_BANCO\)\)/, 'sólo los meses SIN canal declarado')
  // Y no se reparte mitad y mitad porque suele ser así: eso sería fabricar el dato.
  assert.ok(!/0[,.]5|\/2/.test(monto))
})

test('las filas de oficina se llaman OFICINA, no administración', () => {
  // Son dos grupos con dos criterios distintos: **oficina son 2 empleados, 50% banco y 50% efectivo;
  // administración cobra TODA por banco.** Con el rótulo viejo, una diferencia de oficina se lee como un
  // faltante de administración y manda a buscar a un cuadro donde no está.
  const g = construir()
  const mal = g.filas.map((f) => String(f?.[0] ?? '')).filter((t) => /sueldos de administraci[oó]n/i.test(t))
  assert.deepEqual(mal, [], 'ninguna fila que lee OFICINA_* puede llamarse "de administración"')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA CARTERA — EL CANARIO Y EL CONTROL CONTRA OTRA FUENTE
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('cada valor en cartera trae su importe por FÓRMULA, no pegado', () => {
  // Acá se pegaba `e.importe` desde un array escrito a mano. Por eso CAJA mostraba $10.000.000 de
  // cartera teniendo $10.290.000: entró el cheque 514 a la base y a la réplica, y la celda siguió
  // mostrando lo de la semana pasada sin dar un solo error.
  const g = construir()
  const f = filaDe(g, /^Cheque 00000514/)
  assert.ok(f > 0, 'el detalle tiene que listar el cheque')
  assert.match(celda(g, f, 2), /^=SUMIFS/, 'el importe le pregunta a la réplica por SU cheque')
  assert.match(celda(g, f, 5), /^=IF\(COUNTIFS/, 'y la fecha también, devolviendo "" si el cheque no está')
})

test('el endosado se ve y NO suma: son los $20.000.000 que el cuadro creía tener', () => {
  const g = construir()
  const f = filaDe(g, /YA NO ES NUESTRO/)
  assert.ok(f > 0, 'un cheque endosado tiene que quedar a la vista')
  assert.ok(vacia(celda(g, f, 2)), 'pero sin importe: esa plata se le entregó a un tercero')
})

test('EL CONTROL DE LA CARTERA MIRA OTRA FUENTE QUE EL TOTAL, o no controla nada', () => {
  // El total sale de la réplica del banco; esta línea le pregunta lo mismo a COBRANZAS. Cobranzas sabe
  // que el echeq se cobró —y es cierto— pero no sabe qué pasó DESPUÉS con el valor: eso sólo lo sabe el
  // banco. La diferencia son cheques que se endosaron para pagarle a alguien.
  const g = construir()
  const fCtrl = filaDe(g, /Control: qué dice Cobranzas/)
  assert.match(celda(g, fCtrl, 2), /Cobranzas!/, 'el control tiene que salir de Cobranzas')
  assert.match(celda(g, g.fDifCartera, 2), new RegExp(DESDE_CAJA.cartera), 'y restarse contra el total de CAJA, por nombre')
  assert.ok(!celda(g, fCtrl, 2).includes('_CHEQUES_RAW'),
    'si el control saliera de la misma réplica que el total, daría cero por construcción')
})

test('el canario compara el detalle escrito contra la fuente viva', () => {
  // Las filas del detalle las escribe el generador; el total es una fórmula viva. Si entra un cheque y
  // el anexo no se regenera, el detalle listaría uno menos y NADIE lo vería: el total seguiría bien.
  const g = construir()
  const f = filaDe(g, /¿el detalle está al día\?/)
  assert.ok(f > 0)
  const v = celda(g, f, 6)
  assert.match(v, /COUNTIFS/, 'cuenta cuántos hay de verdad')
  assert.match(v, /⚠/, 'y avisa cuando no coinciden')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LOS CONTROLES DEL CALENDARIO — EL RIESGO DECLARADO
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('EL RIESGO DECLARADO: si cheques-cobertura no corrió, la pestaña lo dice en vez de mostrar $0', () => {
  // El término de cheques del calendario lee la MARCA que escribe `cheques-cobertura`. Si ese agente no
  // corrió, la columna está vacía, el término da $0 y el piso SUBE sin que se haya pagado nada — el mismo
  // modo de falla, "cero sin avisar", que este trabajo entero vino a matar.
  const g = construir()
  const f = filaDe(g, /riesgo: cheques no debitados SIN marca/i)
  assert.ok(f > 0, 'el control de cobertura tiene que existir')
  assert.match(celda(g, f, 3), new RegExp(`\\$M\\$${FILA_DATO0}:\\$M\\$400=""`), 'cuenta los cheques que todavía no tienen marca')
  assert.match(celda(g, f, 3), /<>"SI"/, 'entre los NO debitados: un cheque ya debitado no le importa al calendario')
})

test('el riesgo de los no marcados se parte en "falta correr el agente" y "falta el dato"', () => {
  // Eran $38.377.479 en un solo renglón rojo. Medido: el 90,6% sólo necesitaba que corriera el agente y
  // el 9,4% que una persona cargara el N° de comprobante. Verlos juntos hacía leer un agujero de $38,4M
  // donde el trabajo humano pendiente era $3,6M.
  const g = construir()
  const con = celda(g, filaDe(g, /con N° de comprobante ya cargado/i), 3)
  const sin = celda(g, filaDe(g, /SIN N° de comprobante/i), 3)
  assert.ok(con && sin, 'el riesgo volvió a ser un solo renglón inaccionable')
  for (const f of [con, sin]) {
    assert.match(f, new RegExp(`\\$M\\$${FILA_DATO0}:\\$M\\$400=""`))
    assert.match(f, new RegExp(`UPPER\\('Cheques Emitidos'!\\$K\\$${FILA_DATO0}:\\$K\\$400\\)<>"SI"`))
    assert.match(f, new RegExp(`\\$H\\$${FILA_DATO0}:\\$H\\$400`), 'la partición tiene que mirar la columna del N° de comprobante')
  }
  // Complementarios: si los dos usaran la misma condición, uno sería siempre cero y nadie se enteraría.
  assert.notEqual(con, sin)
  assert.ok(sin.includes('(1-('), 'el renglón "sin N°" tiene que ser la negación del otro')
})

test('LO QUE EL CALENDARIO EXCLUYE A PROPÓSITO SE PUBLICA CON SU MONTO', () => {
  // Una exclusión invisible es indistinguible de un olvido. Los $12.188.441 de cheques ya debitados se
  // dejan afuera porque el saldo del banco ya los tiene descontados — y eso tiene que poder leerse, con
  // su número, al lado del control hermano que mide los sin marca.
  const g = construir()
  const f = filaDe(g, /ya debitados y sin factura/)
  assert.ok(f > 0, 'la exclusión tiene que estar declarada')
  const v = celda(g, f, 3)
  assert.ok(v.includes('="SI"'), 'mide justamente los DEBITADOS, que es lo que el término excluye')
  assert.ok(v.includes(MARCAS.falta), 'y sólo los que no tienen factura en Compras')
})

test('los conceptos sin fuente con fecha se NOMBRAN, con su cero declarado', () => {
  // Un cero con nombre es una limitación conocida; un cero mudo es un bug. Los tres valen cero porque el
  // banco los debita solo, sin factura, y su único registro es el extracto — que sólo cubre el pasado.
  const g = construir()
  const f = filaDe(g, /concepto\(s\) del cash flow sin fuente con fecha/)
  assert.ok(f > 0, 'el control tiene que existir')
  assert.equal(g.filas[f - 1][3], 0, 'el monto declarado es cero, escrito')
  for (const n of ['descubierto', 'Comisiones', 'Impuesto al cheque']) {
    assert.ok(celda(g, f, 6).includes(n), `el control tiene que nombrar "${n}"`)
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// VENCIDO SIN CONCILIAR Y TRAZABILIDAD
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('EL CERO DEL BLOQUE DE VENCIDOS NO PUEDE QUEDAR MUDO', () => {
  // "Está todo conciliado" y "hace tres semanas que nadie carga un movimiento" se dibujan igual.
  const g = construir()
  const f = filaDe(g, /¿el cero es real\?/)
  assert.ok(f > 0)
  const dicta = celda(g, f, 6)
  const fUlt = filaDe(g, /Último cobro efectivamente registrado/)
  assert.ok(fUlt > 0, 'sin la fecha del último cobro no se puede distinguir orden de silencio')
  assert.ok(dicta.includes(`$F$${fUlt}`), 'el veredicto tiene que MIRAR esa fecha')
  assert.ok(dicta.includes('TODAY()-$F$'), 'y medir cuántos días pasaron')
  assert.ok(dicta.includes('NOT(ISNUMBER('), 'y si Cobranzas no tiene ninguna fecha usable, tampoco festeja')
})

test('los estados de Cobranzas NO se suman entre sí en el cuadro de vencidos', () => {
  // Un "Pendiente" vencido (factura emitida que no entró) se RECLAMA; un "Proyectado" vencido (una fecha
  // estimada que no se cumplió) se REPROYECTA. Sumarlos en una fila borra la diferencia.
  const g = construir()
  const filas = g.filas.filter((f) => /^Cobros en "/.test(String(f?.[0] ?? ''))).map((f) => String(f[2]))
  assert.equal(filas.length, 3, 'una fila por estado esperado: Pendiente, Facturado, Proyectado')
  for (const f of filas) {
    const cuantos = ['Pendiente', 'Proyectado', 'Facturado', 'Cobrado', 'CANCELAR'].filter((e) => f.includes(`="${e}"`))
    assert.equal(cuantos.length, 1, `una fila suma ${cuantos.length} estados: ${cuantos.join('+')}`)
  }
})

test('la trazabilidad es la IDENTIDAD COMPLETA: cobrado = depositado + gastado + cajón vivo', () => {
  // La ventana fosilizada (22/06–22/07, constantes de la captura) más los depósitos SIN ventana y
  // NINGÚN término de gasto publicaron $12,2M "sin explicar" que eran plata gastada y registrada
  // (dictamen 07/08). Ahora todo va a historia completa hasta HOY y la resta la cierra el cajón VIVO.
  const g = construir()
  const cob = celda(g, filaDe(g, /Cobrado en EFECTIVO — historia completa/), 4)
  const dep = celda(g, filaDe(g, /Depositado en efectivo al banco — historia completa/), 4)
  const gasto = celda(g, filaDe(g, /Pagado en efectivo — Compras/), 4)
  const cajon = celda(g, filaDe(g, /Efectivo en el cajón HOY/), 4)
  const sinExpl = celda(g, filaDe(g, /⇒ EFECTIVO SIN EXPLICAR/), 4)
  // Sin fechas clavadas: la única cota temporal es HOY (un "Cobrado" con fecha futura no es billete).
  assert.ok(![...cob.matchAll(/DATE\(\d+;\d+;\d+\)/g)].length, 'la ventana fosilizada volvió')
  assert.match(cob, /"Cobrado"/)
  assert.match(cob, /<=TODAY\(\)/)
  assert.ok(dep.includes('_BANCO_RAW'), 'los depósitos salen del extracto, no de un número pegado')
  // El gasto: Compras por MONTO PAGADO (los parciales también salieron) + jornales + oficina por caja.
  assert.match(gasto, /'Compras'!\$P\$4:\$P="Efectivo"/)
  assert.match(gasto, /N\('Compras'!\$T\$4:\$T\)/)
  // El cajón VIVO (arqueo ± posteriores), el mismo número de CAJA!B7 — no el arqueo crudo.
  assert.match(cajon, /N\(CAJA_ARQUEO_ARS\)\+N\(ANEXO_EFECTIVO_NETO\)/)
  // Y la resta usa los CINCO términos.
  assert.match(sinExpl, /^=E\d+-E\d+-E\d+-E\d+-E\d+$/)
})

test('la alerta de efectivo sin explicar cierra contra el CAJÓN VIVO, no el arqueo crudo', () => {
  // Con la identidad a historia completa (dictamen 07/08), lo que cierra la resta es lo que HAY hoy
  // en la caja física — arqueo ± movimientos posteriores, el mismo número de CAJA!B7 —, y ambos
  // términos van POR NOMBRE para sobrevivir a cualquier compactación del anexo.
  const g = construir()
  const f = filaDe(g, /^Efectivo en el cajón HOY/)
  assert.ok(f > 0)
  assert.match(celda(g, f, 4), /N\(CAJA_ARQUEO_ARS\)\+N\(ANEXO_EFECTIVO_NETO\)/)
  // Y LA FECHA VA GUARDADA CON ISNUMBER: `=CAJA_ARQUEO_ARS_FECHA` sobre una celda vacía devuelve 0, y el
  // 0 con formato de fecha se dibuja "30/12/1899". Es el defecto `fecha_cero` del auditor de pantalla.
  assert.match(celda(g, f, 5), /^=IF\(ISNUMBER\(/, 'una fecha vacía no puede dibujarse como 30/12/1899')
})

test('NINGUNA celda de fecha se escribe como una referencia cruda: el serial 0 es 30/12/1899', () => {
  // El auditor de pantalla lo reportaba como `fecha_cero`. La causa es siempre la misma: `=X` donde X
  // puede estar vacío devuelve 0, y 0 con formato de fecha es el 30 de diciembre de 1899.
  const g = construir()
  for (const [i, fila] of g.filas.entries()) {
    const v = String(fila?.[5] ?? '')
    if (!v.startsWith('=')) continue
    assert.ok(/ISNUMBER|IFERROR|TODAY|COUNTIFS|SUMIFS|MAX|""/.test(v),
      `fila ${i + 1}: la fecha "${v}" no está guardada — si la fuente está vacía va a dibujar 30/12/1899`)
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL CONTRATO DE NOMBRES — LO QUE HACE POSIBLE LA MUDANZA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('todos los nombres que CAJA cita se publican, y cada uno declara su especie', () => {
  // `rangos-nombrados.mjs` relee cada celda después de publicar y compara contra la ESPECIE prometida:
  // un nombre publicado sobre una celda vacía o sobre un texto es el defecto que dejó
  // `ARCA_COMPRAS_TOTAL` devolviendo un número de comprobante. Sin especie declarada, no se verifica.
  const g = construir()
  const publicados = new Set(g.destinos.map((d) => d.name))
  for (const n of Object.values(ANEXO)) {
    assert.ok(publicados.has(n), `${n} lo cita CAJA y el anexo no lo publica: quedaría en #NAME?`)
  }
  for (const d of g.destinos) {
    assert.ok(d.especie ?? ESPECIE_ANEXO[d.name], `${d.name} se publica sin declarar especie: no se puede verificar`)
    assert.ok(Number.isFinite(d.fila) && d.fila >= 1, `${d.name} apunta a una fila inválida`)
    // Y la celda a la que apunta tiene que tener ALGO: un nombre sobre una celda vacía es tan mudo como
    // uno sobre un texto, y la API lo acepta con un 200.
    const v = g.filas[d.fila - 1]?.[d.col - 1]
    assert.ok(v !== undefined && !vacia(v), `${d.name} apunta a una celda vacía (fila ${d.fila}, col ${d.col})`)
  }
})

test('el anexo NUNCA cita a CAJA por celda: sólo por rango con nombre', () => {
  // Es la propiedad entera de este rediseño. Un intento anterior no movió el anexo porque los bloques de
  // arriba lo referenciaban por celda; si el anexo volviera a citar `Caja!$E$12`, la mudanza se
  // desharía sola en la primera corrida que mueva una fila.
  const g = construir()
  for (const [i, fila] of g.filas.entries()) {
    for (const c of fila) {
      const s = String(c ?? '')
      if (!s.startsWith('=')) continue
      assert.ok(!/'?Caja'?!\$?[A-Z]/.test(s), `fila ${i + 1}: el anexo cita a CAJA por celda:\n  ${s.slice(0, 120)}`)
    }
  }
})

test('ninguna fórmula del anexo usa la coma como separador de ARGUMENTOS (es_AR usa `;`)', () => {
  const g = construir()
  for (const [i, fila] of g.filas.entries()) {
    for (const [j, c] of fila.entries()) {
      if (j >= ANCHO_ANEXO - 1) continue
      const s = String(c ?? '')
      if (!s.startsWith('=')) continue
      const sospechosas = s.replace(/"[^"]*"/g, '""').replace(/(?<=\d),(?=\d)/g, '')
      assert.doesNotMatch(sospechosas, /,/, `fila ${i + 1} col ${j}: coma entre argumentos → #ERROR! en es-AR:\n  ${s}`)
    }
  }
})

test('la celda de CARGA del anexo sale AUSENTE cuando no se leyó nada', () => {
  // El "Dólar declarado" es lo único que una persona escribe acá. Una celda AUSENTE la preserva la
  // fusión; el centinela VACIO la BORRARÍA. La diferencia ya borró el conteo del dueño una vez.
  const g = construir()
  for (const col of [2, 5]) {
    assert.equal(g.filas[g.fDec - 1][col], undefined, 'sin dato no se sobrescribe: es el lado seguro')
  }
})

test('con el dólar declarado ya cargado, se RE-EMITE en su fila nueva', () => {
  const cargado = new Map([['Dólar declarado por la empresa (opcional)', { saldo: 1450, fecha: 46233, origen: 'banco' }]])
  const g = grillaAnexo({ refs: REFS, cartera: CARTERA, conceptosCiegos: [], cargado })
  assert.equal(g.filas[g.fDec - 1][2], 1450, 'el valor tiene que viajar con su bloque')
  assert.equal(g.filas[g.fDec - 1][5], 46233)
})


test('TEXTO EN UNA COLUMNA DE PLATA: sólo los encabezados que el formateador declara', () => {
  // Mismo invariante que CAJA. El formateador del anexo ubica sus encabezados por el rótulo de la
  // columna A y les devuelve el formato de TEXTO; cualquier otra constante en C, D o E se dibuja con
  // formato de moneda y hace desconfiar de la fila entera. La regex es la MISMA que la del formateador:
  // si alguien agrega un encabezado con otro rótulo, esto se pone rojo en vez de salir mal dibujado.
  const g = construir()
  const ES_CABECERA = /^(Concepto|Línea|Valor|Qué|Horizonte)/
  for (const [i, f] of g.filas.entries()) {
    for (const col of [2, 3, 4]) {
      const v = f[col]
      if (typeof v !== 'string' || vacia(v) || v.startsWith('=') || !Number.isNaN(Number(v))) continue
      assert.match(String(f[0] ?? ''), ES_CABECERA,
        `fila ${i + 1} col ${String.fromCharCode(65 + col)}: "${v}" es texto en una columna de plata fuera de un encabezado`)
    }
  }
})
