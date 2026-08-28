import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { MOVIMIENTOS, MOVIMIENTOS_DIA, CUENTA, TARJETA, ACUERDO, verificarCadena, verificarResumenTarjeta, verificarCuotasAVencer, porTipo, ingresosPorNaturaleza, naturalezaIngreso, enCartera, endosados, totalEcheqs, antiguedadDias, clasificarMovimiento, verificarTripletesBancarios, NAT, compromisosPorBeneficiario } from './banco-santander.mjs'
import { DESTINOS } from './impacto-bancario.mjs'
import { GRUPOS } from './conciliacion-por-naturaleza.mjs'

// EL TEST QUE HACE CONFIABLE LA TRANSCRIPCIÓN. El extracto es una cadena: saldo(n) = saldo(n−1) +
// importe(n). Si tipeé mal un dígito, la cadena se rompe y esto falla. Sin este test, los 71
// movimientos serían una lista de números que PARECEN ciertos, que es exactamente lo que la regla
// de oro prohíbe.
test('la transcripción del extracto encadena y termina en el último saldo del detalle', () => {
  const { rotas, saldoFinal } = verificarCadena()
  assert.deepEqual(rotas, [], 'hay filas donde el saldo no cierra: la transcripción tiene un error')
  // El detalle cierra en el saldo del último movimiento (Vono, 22/07). El saldo DECLARADO del día es
  // menor (cheque Nº 221 + transf. a Katsuda + $143.500 sin detalle, neto de la recibida de
  // Manufacturas): esos dos números son distintos a propósito. Saldo de la descarga de las 15:50.
  assert.equal(saldoFinal, CUENTA.saldoUltimoMovimiento)
  assert.equal(CUENTA.saldoPesos, 4985898.23)
  assert.ok(Math.abs((CUENTA.saldoUltimoMovimiento - CUENTA.saldoPesos) - -CUENTA.saldoPendienteConciliar) < 0.01)
})

test('los movimientos del día encadenan desde el cierre del detalle hasta el saldo declarado', () => {
  // _BANCO_RAW los anexa después de MOVIMIENTOS; el último saldo tiene que ser el DECLARADO, que es lo
  // que CAJA muestra como disponibilidad. Sin esto, la caja mostraría el último saldo corrido del
  // detalle ($5.595.130,74) y no lo que el banco realmente tiene hoy.
  let saldo = CUENTA.saldoUltimoMovimiento
  for (const m of MOVIMIENTOS_DIA) {
    saldo = Math.round((saldo + m.importe) * 100) / 100
    assert.equal(saldo, m.saldo, `el saldo corrido de "${m.concepto}" no cierra`)
  }
  assert.equal(MOVIMIENTOS_DIA.at(-1).saldo, CUENTA.saldoPesos)
  // El tramo sin detalle tiene su propio bucket, para no ensuciar la conciliación por naturaleza.
  assert.equal(clasificarMovimiento('Diferencia sin detalle del banco (hold intradia)'), 'Ajuste sin detalle del banco')
})

test('cada movimiento tiene fecha, concepto e importe', () => {
  for (const m of MOVIMIENTOS) {
    assert.match(m.fecha, /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(m.concepto.trim().length > 3)
    assert.ok(Number.isFinite(m.importe) && m.importe !== 0)
  }
})

// EL FONDO DE CESE LABORAL NO ES UN PAGO A PROVEEDORES (19/08/2026). El 18/08 el banco debitó 36
// acreditaciones "fondo desempleo" por $2.481.098, una por obrero: es el fondo de cese laboral de la
// construcción (ley 22.250), o sea COSTO LABORAL. Sin regla propia caían en «Transferencias a
// proveedores» —el cajón de sastre—, inflando los pagos a proveedores y dejando el costo laboral del
// mes $2,48M por debajo de lo que salió. Es el mismo defecto del 15/08 con «haber» en singular.
test('el fondo de cese laboral es carga social, no un pago a proveedores ni un jornal', () => {
  const real = 'Pagos personalizados acred cuenta - Acreditacion fondo desempleo  000000 - cuit 30716304643              260818507'
  assert.equal(clasificarMovimiento(real), 'Cargas sociales (fondo de cese laboral)')
  // Las dos formas en que el mismo concepto aparece rotulado, y la raíz que las cubre a las dos.
  assert.equal(clasificarMovimiento('Deposito fondo de cese laboral uocra'), 'Cargas sociales (fondo de cese laboral)')
  assert.equal(clasificarMovimiento('Acreditacion fondo de desempleo'), 'Cargas sociales (fondo de cese laboral)')
  // NO se lo lleva Sueldos: el control de la quincena se compara contra lo que liquida Jornales, y el
  // fondo de cese se deposita aparte. Mezclarlos haría que ese control cerrara mal todos los meses.
  assert.notEqual(clasificarMovimiento(real), 'Sueldos')
  assert.equal(clasificarMovimiento('Pago de haberes - 260814507'), 'Sueldos')
})

// UN ECHEQ QUE ENTRA NO ES UN CHEQUE QUE SALE (28/07). "Deposito E-cheq Int Misma Plaza" es un
// echeq de tercero acreditado: plata que ENTRA. Antes matcheaba /e-?cheq/ y caía en el bucket
// "Cheques y echeq" —que es de SALIDAS y cuyo destino es la columna DEBITADO de Cheques Emitidos—,
// registrando un ingreso como una salida. En la data real eran $58.940.000 que dejaban ese bucket
// en +$38M: un grupo de egresos en positivo es la señal exacta de que la clasificación está mal.
// Ahora un crédito se resuelve por su naturaleza ANTES del bucket de cheques.
test('un echeq acreditado es un traslado que ENTRA, no un cheque que sale', () => {
  // El crédito se clasifica como traslado (plata propia cambiando de lugar), NUNCA como cheque.
  assert.equal(clasificarMovimiento('Deposito e-cheq int misma plaza'), 'Traslados de fondos propios (no es ingreso)')
  assert.equal(clasificarMovimiento('Deposito e-cheq int ots plazas'), 'Traslados de fondos propios (no es ingreso)')
  // Las SALIDAS de echeq siguen en el bucket de cheques: el banco las debita contra Cheques Emitidos.
  assert.equal(clasificarMovimiento('Echeq clearing recibido 48hs'), 'Cheques y echeq')
  assert.equal(clasificarMovimiento('Canje interno recibido 24 hs'), 'Cheques y echeq')
  assert.equal(clasificarMovimiento('Echeq canje interno recibido 24hs'), 'Cheques y echeq')
  assert.equal(clasificarMovimiento('Cheque debitado - Nº 221'), 'Cheques y echeq')
  // Y las variantes de escritura de la MISMA salida: el banco cambia mayúsculas, espacios y el
  // pegado de "24hs" entre descargas. Con el literal viejo, cualquiera de éstas caía en
  // "Transferencias a proveedores" y el cheque quedaba figurando como vencido sin debitar.
  assert.equal(clasificarMovimiento('CANJE  INTERNO   RECIBIDO 24HS'), 'Cheques y echeq')
  assert.equal(clasificarMovimiento('Canje interno recibído 24 horas'), 'Cheques y echeq')
  // El bucket de cheques, mirando SÓLO lo que sale, no puede dar positivo.
  const soloSalidas = MOVIMIENTOS.filter((m) => clasificarMovimiento(m.concepto) === 'Cheques y echeq')
  assert.ok(soloSalidas.every((m) => m.importe < 0), 'el bucket de cheques quedó con un crédito adentro')
})

test('los créditos se agrupan por su naturaleza, no como "Ingresos" a secas', () => {
  const t = porTipo()
  const prov = t.find((x) => x.tipo === 'Transferencias a proveedores')
  assert.ok(prov.monto < 0, 'un grupo de pagos a proveedores no puede dar positivo')
  // Desde el 21/07 los créditos ya no se agrupan como "Ingresos" a secas: un crédito puede ser un
  // cobro, un traslado de plata propia o un rescate de inversión, y mezclarlos hizo que el OS
  // reportara $11,9M "faltantes" que eran del rescate de Balanz. En la ventana de referencia los
  // traslados son 3 depósitos de efectivo + 2 depósitos de e-cheq acreditados = 5.
  assert.equal(t.find((x) => x.tipo === 'Traslados de fondos propios (no es ingreso)').cantidad, 5)
  assert.equal(t.find((x) => x.tipo === 'Rescates de inversión y financiero').cantidad, 1)
  assert.equal(t.find((x) => x.tipo === 'Ingresos'), undefined, 'un crédito no es automáticamente un ingreso')
})

// Una compra en el exterior con tarjeta (Google Workspace, tarj nro. 6077) es un consumo de tarjeta,
// no un pago a proveedor por transferencia. Sin esto inflaba "Transferencias a proveedores".
test('la compra en el exterior con tarjeta es consumo de tarjeta, no pago a proveedor', () => {
  assert.equal(clasificarMovimiento('Compra en el exterior - Google workspace ecsas.co - tarj nro. 6077'), 'Compras con tarjeta de débito')
})

test('el rescate de Balanz NO se cuenta como cobranza', () => {
  // El caso que originó la distinción: $11.913.568 del 16/07, CUIT 30710630670. Es plata de la
  // empresa que estaba invertida y volvió a la cuenta: contarla como cobro infla el cash flow.
  const i = ingresosPorNaturaleza()
  assert.equal(i.totales.financiero, 11913568.24)
  // Depósitos de efectivo ($9,96M) + dos echeq acreditados ($10M el 16/07 + $15M el 01/07) + la
  // reversa de impuesto de $294,78 (que el banco generó, no un cliente).
  assert.equal(i.totales.traslado, 9960000 + 10000000 + 15000000 + 294.78, 'plata propia y ajustes del banco, no cobros')
  assert.equal(i.totales.cobranza, 0, 'en la ventana del extracto no entró un peso por transferencia de un cliente')
})

test('un número de once cifras que no es CUIT no identifica a nadie', () => {
  // `extraer` valida el dígito verificador: un número de lote no puede hacerse pasar por contraparte.
  assert.equal(naturalezaIngreso({ concepto: 'Transferencia Recibida - Lote 12345678901', importe: 1 }), 'cobranza')
})

test('el impuesto al cheque y el costo del descubierto salen separados', () => {
  const t = porTipo()
  assert.ok(t.find((x) => x.tipo === 'Impuesto al cheque (Ley 25.413)').cantidad >= 10)
  assert.ok(t.find((x) => x.tipo === 'Costo financiero del descubierto').monto < 0)
})

test('la cartera de echeqs no mezcla lo entregado con lo propio', () => {
  assert.equal(totalEcheqs(enCartera()), 10000000)
  assert.equal(totalEcheqs(endosados()), 20000000)
  assert.equal(enCartera().length + endosados().length + 5, 8)
})

// El acuerdo y la tarjeta NO son caja. Que estén en el archivo es útil; que sumen sería el error que
// hace que una empresa se crea líquida el día antes de no poder pagar sueldos.
test('el acuerdo y la tarjeta tienen su costo y su vencimiento declarados', () => {
  assert.ok(ACUERDO.importe > 0 && ACUERDO.cft > 0)
  assert.match(ACUERDO.vence, /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(TARJETA.limite > 0 && TARJETA.vence)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// EL RESUMEN DE LA TARJETA CERRADO EL 20/08/2026 — LA IDENTIDAD QUE PRUEBA LA TRANSCRIPCIÓN
//
// Una constante pegada a mano no tiene quién la contradiga: si un dígito sale mal, el número igual
// se ve razonable y viaja hasta el Cash Flow. Lo único que lo caza es una identidad entre cifras que
// el banco imprimió en renglones distintos del PDF.

test('el resumen cierra: consumos + sellos + sellos P + RG 5617 = lo que el banco va a debitar', () => {
  const v = verificarResumenTarjeta()
  assert.equal(v.declarado, 2208958.42, 'el importe de "DEBITAREMOS DE SU C.C." es el ancla')
  assert.equal(v.suma, 2208958.42)
  assert.equal(v.diferencia, 0)
  assert.ok(v.cierra)
})

// EL CASO NEGATIVO: un control que no puede dar rojo no es un control. Se mueve UN sumando —un peso,
// que es el error más difícil de ver a ojo— y la identidad tiene que romperse.
test('el control del resumen se pone rojo si cualquiera de los cuatro sumandos se tipea mal', () => {
  const base = TARJETA
  const mutantes = [
    { ...base, consumidoPesos: base.consumidoPesos + 1 },
    { ...base, resumen: { ...base.resumen, sellos: base.resumen.sellos + 1 } },
    { ...base, resumen: { ...base.resumen, sellosProvinciales: base.resumen.sellosProvinciales - 0.01 } },
    { ...base, resumen: { ...base.resumen, rg5617: { ...base.resumen.rg5617, importe: 244755.1 } } },
    { ...base, resumen: { ...base.resumen, aDebitarPesos: 2208958.24 } },
  ]
  for (const m of mutantes) {
    const v = verificarResumenTarjeta(m)
    assert.equal(v.cierra, false, 'la identidad tendría que haber dado rojo')
    assert.notEqual(v.diferencia, 0)
  }
})

// LA PERCEPCIÓN VERIFICA LOS DÓLARES DESDE OTRA COLUMNA. La base de la RG 5617 está escrita en pesos
// y el consumo en dólares en otra moneda y en otro renglón: que 544,99 × 1.497,00 dé exactamente la
// base, y que el 30% dé el importe, es un control cruzado sobre un dato que nadie más contradice.
test('la percepción RG 5617 confirma el consumo en dólares desde el renglón de pesos', () => {
  const r = TARJETA.resumen.rg5617
  assert.equal(Math.round(TARJETA.consumidoDolares * r.tcDeducido * 100) / 100, r.base)
  // EL BANCO TRUNCA EL CENTAVO, NO REDONDEA: 815.850,03 × 30% = 244.755,009 y cobró 244.755,00.
  // Se mide con un centavo de tolerancia, que es la precisión que el propio documento tiene. Poner
  // igualdad exacta acá obligaría a "arreglar" el importe declarado por el banco, que es el hecho.
  assert.ok(Math.abs(r.base * r.alicuota - r.importe) <= 0.01, 'la percepción no es el 30% de la base')
})

// ═══ "A PARTIR DE MARZO/27 $1.421.653,32" ES UN TOTAL, NO UNA CUOTA ═══

test('la tabla de cuotas a vencer suma su total y la cola está guardada como total', () => {
  const v = verificarCuotasAVencer()
  assert.equal(v.declarado, 8454867.66)
  assert.equal(v.diferencia, 0)
  assert.ok(v.colaEsTotal, '1.421.653,32 = 4 × 355.413,33: si no cierra, se leyó como cuota mensual')
  // Y es el mismo número que la pestaña compara contra el registro.
  assert.equal(TARJETA.cuotasPendientes.restante, v.declarado)
})

test('leer la cola como cuota mensual pone el control en rojo', () => {
  // El error real: copiar 1.421.653,32 como si fuera la cuota de marzo/27 en adelante. Con `cuotas`
  // declarado, la identidad 4 × importe = total deja de cumplirse.
  const mal = { ...TARJETA, cuotasAVencer: { ...TARJETA.cuotasAVencer,
    desdeMarzo27: { ...TARJETA.cuotasAVencer.desdeMarzo27, importe: 1421653.32 } } }
  assert.equal(verificarCuotasAVencer(mal).colaEsTotal, false)
  // Y si además se suma cuatro veces —el efecto de tratarla como cuota— el total se va $4,26M arriba.
  const inflado = { ...TARJETA, cuotasAVencer: { ...TARJETA.cuotasAVencer,
    desdeMarzo27: { ...TARJETA.cuotasAVencer.desdeMarzo27, total: 1421653.32 * 4 } } }
  assert.equal(verificarCuotasAVencer(inflado).cierra, false)
})

// ═══ EL RESUMEN NO REEMPLAZA A LA CAPTURA DEL HOMEBANKING: DOS FUENTES, DOS FECHAS ═══
//
// El resumen liquida un período cerrado y NO publica el disponible, el cupo de adelanto ni lo
// pendiente de confirmar. Esos campos siguen siendo del 29/07 y tienen que decirlo: sin su fecha,
// un número de hace un mes se lee como si fuera del resumen.
test('lo que el resumen no trae conserva su propia fecha, y no se recalcula del límite', () => {
  assert.equal(TARJETA.al, '2026-08-20')
  for (const [campo, fecha] of [
    [TARJETA.disponible, TARJETA.disponibleAl],
    [TARJETA.pendienteDeConfirmacion, TARJETA.pendienteDeConfirmacionAl],
    [TARJETA.adelantoEfectivo.disponible, TARJETA.adelantoEfectivo.al],
    [TARJETA.cuotas.disponible, TARJETA.cuotas.al],
  ]) {
    assert.equal(typeof campo, 'number')
    assert.equal(fecha, '2026-07-29', 'un campo que no viene del resumen tiene que declarar SU fecha')
  }
  // Y no salió de una resta: límite − consumos del resumen daría otro número.
  assert.notEqual(TARJETA.disponible, TARJETA.limite - TARJETA.consumidoPesos)
})

// El débito del 01/09 es la única cifra de este archivo con fecha cierta: sale sola de la cuenta.
test('el débito automático tiene importe, fecha y cuenta declarados', () => {
  const r = TARJETA.resumen
  assert.equal(r.debitaEl, TARJETA.vence)
  assert.equal(r.debitaEl, '2026-09-01')
  assert.ok(r.cuentaDebito && r.aDebitarPesos > 0)
  // Los dólares se debitan EN DÓLARES: son los consumos del período, no una conversión a pesos.
  assert.equal(TARJETA.consumidoDolares, 544.99)
})

test('la foto sabe cuántos días tiene', () => {
  assert.equal(antiguedadDias(new Date(2026, 6, 22)), 0)
  assert.equal(antiguedadDias(new Date(2026, 6, 29)), 7)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// LOS COSTOS BANCARIOS QUE SE LEÍAN COMO PAGOS A PROVEEDORES (31/07)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// El cajón de sastre de `clasificarMovimiento` devolvía "Transferencias a proveedores" para todo lo que
// no matcheara una regla, y ahí caían los costos del banco. Cada caso de abajo se fija con SU IMPORTE
// REAL medido en public.banco_movimientos (170 movimientos, 22/06→31/07/2026): un test que sólo mira
// el rótulo no distingue una regla que funciona de una que matchea de casualidad.

test('cada comisión del banco es un costo bancario, no un pago a proveedor', () => {
  // Los cuatro cargos que el Santander debita sin factura, con el importe con el que aparecen.
  const casos = [
    ['Comision por servicio de cuenta', 69000],
    ['Comision mensual de movs clearing', 14400],
    ['Comision servicio cuenta dolares', 14960],
    ['Comision Compensacion Cheques Cfu', 117651.97],
  ]
  for (const [concepto, importe] of casos) {
    assert.equal(clasificarMovimiento(concepto), NAT.comisiones, `"${concepto}" (${importe}) es costo bancario`)
    assert.notEqual(clasificarMovimiento(concepto), NAT.transferencias, `"${concepto}" NO es un pago a proveedor`)
  }
  // "Comision Compensacion Cheques Cfu" dice "Cheques": tiene que ganar la regla de comisión, no la de
  // cheques emitidos. Si cayera ahí, un costo del banco se leería como un cheque propio debitado.
  assert.notEqual(clasificarMovimiento('Comision Compensacion Cheques Cfu'), NAT.cheques)
})

test('el IVA de una comisión va con la comisión; el del descubierto, con el descubierto', () => {
  // La alícuota es la que dice de qué es el impuesto: 21% = servicio bancario · 10,5% = interés.
  assert.equal(clasificarMovimiento('Iva 21% reg de transfisc ley27743'), NAT.comisiones)
  assert.equal(clasificarMovimiento('Iva percepcion rg 2408'), NAT.comisiones)
  assert.equal(clasificarMovimiento('Iva 10,5% reg trans fisc ley 27743'), NAT.descubierto)
  assert.equal(clasificarMovimiento('Iva percep rg 2408 alic reducida'), NAT.descubierto)
  assert.equal(clasificarMovimiento('Cobro de interes por descubierto - Del 08/06/26 al 07/07/26'), NAT.descubierto)
})

test('las percepciones RG 2408 de las comisiones ya no inflan el costo del descubierto', () => {
  // EL NÚMERO QUE MOTIVÓ LA CORRECCIÓN. En el extracto transcripto (junio) las tres percepciones RG
  // 2408 acompañan a las tres comisiones del 29/06 y valen $2.753,10 — que la regla vieja
  // (/iva percep/) sumaba al costo del descubierto. Sobre la base entera de 170 movimientos son
  // $9.233,46 (7 percepciones). El descubierto de julio queda en $282.621,15 exactos: interés
  // $252.340,32 + IVA 10,5% $26.495,73 + percepción 1,5% $3.785,10.
  const t = porTipo()
  const desc = t.find((x) => x.tipo === NAT.descubierto)
  assert.equal(Math.round(desc.monto * 100) / 100, -282621.15, 'el bucket del descubierto es SÓLO el interés y sus impuestos al 10,5%/1,5%')
  assert.equal(desc.cantidad, 3, 'tres movimientos: interés, IVA 10,5% y percepción alícuota reducida')
  const com = t.find((x) => x.tipo === NAT.comisiones)
  assert.equal(Math.round(com.monto * 100) / 100, -113794.80, 'junio: tres comisiones con su IVA 21% y su percepción 3%')
  assert.equal(com.cantidad, 9, 'tres tripletes de comisión + IVA + percepción')
})

test('los tripletes del banco cierran con su alícuota: la atribución se prueba, no se afirma', () => {
  // Esto es lo que hace defendible la separación descubierto/comisión: cada impuesto tiene que ser el
  // porcentaje exacto de un cargo del MISMO día. Un huérfano = un peso cuya clasificación es una
  // suposición, y es la señal de que el banco empezó a cobrar algo que la regla no conoce.
  const { cerrados, huerfanos } = verificarTripletesBancarios()
  assert.deepEqual(huerfanos, [], 'hay impuestos del banco que no son el % de ningún cargo del día')
  assert.equal(cerrados.length, 8, 'seis de comisión (junio) + dos del descubierto (14/07)')
  const delDescubierto = cerrados.filter((c) => c.cargo === 'interés del descubierto')
  assert.deepEqual(delDescubierto.map((c) => c.tasa).sort(), [0.015, 0.105])
})

test('la reversa del impuesto al cheque va con su impuesto, en positivo, no al cajón de sastre', () => {
  // "Anul imp ley 25.413" es un CRÉDITO de +$294,78 (01/07). Antes caía en "Transferencias a
  // proveedores": un ingreso sentado en un bucket de egresos, el mismo síntoma que delató el bucket de
  // cheques cuando tenía los echeq acreditados adentro.
  assert.equal(clasificarMovimiento('Anul imp ley 25.413 debito 0,6%'), NAT.impuestoCheque)
  const mov = MOVIMIENTOS.find((m) => /anul imp ley 25\.413/i.test(m.concepto))
  assert.equal(mov.importe, 294.78, 'es un crédito: el banco devuelve impuesto')
  assert.notEqual(clasificarMovimiento('Anul imp ley 25.413 debito 0,6%'), NAT.transferencias)
})

test('la percepción del 30% sobre la compra en el exterior va con la compra que la generó', () => {
  const c = 'Percep perc rg 5617 30% o suj - Google workspace ecsas.co - tarj nro. 6077'
  assert.equal(clasificarMovimiento(c), NAT.tarjetaDebito)
  assert.notEqual(clasificarMovimiento(c), NAT.transferencias)
  const mov = MOVIMIENTOS.find((m) => /percep perc rg 5617/i.test(m.concepto))
  assert.equal(mov.importe, -11203.92, 'el importe real medido; es pago a cuenta de Ganancias (gap declarado)')
  // Salió de la cuenta el mismo día y por la misma compra: $37.926 + $11.203,92 = $49.129,92.
  const compra = MOVIMIENTOS.find((m) => /compra en el exterior - google workspace/i.test(m.concepto))
  assert.equal(Math.round((Math.abs(compra.importe) + Math.abs(mov.importe)) * 100) / 100, 49129.92)
})

test('honorarios y débito de online banking son decisiones explícitas, no caídas al cajón', () => {
  // Los dos se quedan en "Transferencias a proveedores" —misma pestaña dueña (Compras)— pero por una
  // regla escrita, para que un movimiento de $2.000.000 no dependa de que nadie tocó el fallthrough.
  assert.equal(clasificarMovimiento('Pago de honorarios - 260702507 260702507'), NAT.transferencias)
  assert.equal(clasificarMovimiento('Debito transf. online banking emp - A pedro ward / - var / 23280102199'), NAT.transferencias)
  assert.equal(clasificarMovimiento('Debito transf. online banking emp - 00720567007000245843ars'), NAT.transferencias)
  // Y NO son sueldos: un honorario no lleva cargas sociales y su factura es de un tercero.
  assert.notEqual(clasificarMovimiento('Pago de honorarios - 260702507'), NAT.sueldos)
  const hon = MOVIMIENTOS.find((m) => /pago de honorarios/i.test(m.concepto))
  assert.equal(hon.importe, -2000000)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// EL GUARDIÁN: NINGUNA NATURALEZA SIN PESTAÑA DUEÑA — NI UNA QUE EL CÓDIGO EMITA A ESPALDAS DE NAT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// La red que ya existía (cash-flow-cobertura-naturalezas.test.mjs) compara COBERTURA contra NAT. El
// agujero: NAT es una constante escrita a mano, así que un `return 'Foo'` nuevo dentro de
// clasificarMovimiento producía una naturaleza que NADIE declaraba y que ningún SUMIF del Sheet
// referencia — o sea plata invisible, que es peor que plata mal clasificada. Esto lee los literales
// del propio código fuente y exige que cada uno esté en NAT, en DESTINOS y en GRUPOS.

test('toda naturaleza que clasificarMovimiento puede devolver está en NAT, en DESTINOS y con pestaña dueña', () => {
  const src = fs.readFileSync(new URL('./banco-santander.mjs', import.meta.url), 'utf8')
  const cuerpo = src.slice(src.indexOf('export function clasificarMovimiento'))
  const fn = cuerpo.slice(0, cuerpo.indexOf('\n}\n'))
  const literales = [...fn.matchAll(/return '([^']+)'/g)].map((m) => m[1])
  assert.ok(literales.length >= 14, `se encontraron ${literales.length} naturalezas literales: el escaneo del fuente sigue funcionando`)
  const enNat = new Set(Object.values(NAT))
  const enGrupos = new Set(GRUPOS.map((g) => g.naturaleza))
  for (const n of literales) {
    assert.ok(enNat.has(n), `clasificarMovimiento devuelve "${n}" y NAT no lo declara: ninguna fórmula del Sheet lo va a sumar`)
    assert.ok(DESTINOS[n], `"${n}" no tiene destino declarado en impacto-bancario.DESTINOS`)
    assert.ok(DESTINOS[n].pestaña, `"${n}" tiene entrada en DESTINOS pero sin pestaña dueña`)
  }
  // Los EGRESOS además tienen que tener grupo en la conciliación: es lo que arma el bloque 4.7 de CAJA,
  // cuya fila de control compara la suma de los grupos contra todo lo que el extracto dice que salió.
  // Una naturaleza de egreso sin grupo hace que esos dos números dejen de coincidir.
  const soloIngresos = new Set([NAT.cobranzas, NAT.rescates, NAT.traslados, NAT.ajusteSinDetalle])
  for (const n of literales.filter((x) => !soloIngresos.has(x))) {
    assert.ok(enGrupos.has(n), `"${n}" es un egreso sin grupo en conciliacion-por-naturaleza.GRUPOS: el control del bloque 4.7 de CAJA va a descuadrar`)
  }
})

// ── LA LISTA DE ECHEQ QUE MENTÍA (14/08) ─────────────────────────────────────────────────────────
// `ECHEQS_EMITIDOS` era la transcripción a mano de la captura del 22/07 y se quedó ahí: al 14/08
// afirmaba que el 307 seguía "Aceptado" —el banco lo pagó el 03/08— y que había 3 echeq vivos cuando
// la captura de ese día muestra 7 por $6.114.994,80. El estado de un cheque vive en `public.cheques`.
// Este test se pone rojo si alguien vuelve a poner un ESTADO VIVO adentro de esta foto del extracto.
test('el estado de los echeq NO vive en este archivo: no hay lista a mano ni default que la resucite', async () => {
  const mod = await import('./banco-santander.mjs')
  assert.equal('ECHEQS_EMITIDOS' in mod, false, 'volvió la lista a mano: la fuente es public.cheques')

  const src = fs.readFileSync(new URL('./banco-santander.mjs', import.meta.url), 'utf8')
  assert.equal(/estado:\s*'(Aceptado|Pagado|Repudiado|Anulado)'/i.test(src), false,
    'hay un estado de cheque escrito a mano en el archivo: eso envejece sin gritar')

  // Sin argumento no inventa una cartera: quien pregunta trae la lista viva.
  assert.deepEqual(mod.compromisosPorBeneficiario(), [])
})

test('compromisosPorBeneficiario suma lo vivo y descarta lo que ya salió', () => {
  // "Por aceptar" también es un compromiso: la plata está firmada aunque el beneficiario no lo aceptó
  // todavía. Es el mismo criterio que usa `debitadoDe` para marcar el DEBITADO en "No".
  const echeqs = [
    { beneficiario: 'NEUMAGOM SAS', cuit: '30691853825', importe: 317000, pago: '2026-10-03', estado: 'Aceptado' },
    { beneficiario: 'NEUMAGOM SAS', cuit: '30691853825', importe: 317000, pago: '2026-09-03', estado: 'Aceptado' },
    { beneficiario: 'NEUMAGOM SAS', cuit: '30691853825', importe: 317000, pago: '2026-08-03', estado: 'Pagado' },
    { beneficiario: 'DUBOS', cuit: '20287737824', importe: 469564.70, pago: '2026-08-25', estado: 'Por aceptar' },
  ]
  const c = compromisosPorBeneficiario(echeqs)
  assert.equal(c.length, 2)
  assert.equal(c[0].beneficiario, 'NEUMAGOM SAS')
  assert.equal(c[0].monto, 634000)          // el Pagado NO suma: ya salió de la cuenta
  assert.equal(c[0].proximo, '2026-09-03')  // el más cercano de los que quedan vivos
  assert.equal(c[1].monto, 469564.70)
})
