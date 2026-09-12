// EL MULTIPLICADOR DE LA HORA, DERIVADO DE LO QUE LA EMPRESA DECLARÓ Y PAGÓ — no de una norma.
//
// ═══ QUÉ ES Y QUÉ NO ES ═══
//
// Esto es una INFERENCIA declarada, no la alícuota legal de cada concepto. No dice «la contribución
// patronal es del 24,10 %»: dice «las contribuciones que esta empresa declaró en estos meses fueron
// el 24,10 % de la remuneración que declaró en los mismos meses». La diferencia importa porque las
// alícuotas legales cambian y porque acá entran cosas que ninguna alícuota explica —mínimos por
// trabajador, la zona, el SAC, los ajustes de una rectificativa—.
//
// Ninguna alícuota se cita de memoria y ninguna se presenta como vigente. Las dos fuentes son PDF
// firmados: la DDJJ F931 y la DDJJ Nominativa de UOCRA, las dos ya leídas por el OS.
//
// ═══ EL DENOMINADOR ES EL BOLSILLO IMPUTADO, Y ESO NO ES UN DETALLE ═══
//
// `multiplicador_de_costo` multiplica `horas × valor_hora` de los registros imputados a una obra. Si
// el porcentaje se derivara sobre la remuneración BRUTA declarada y después se aplicara sobre el
// bolsillo, el resultado estaría escalado por la razón entre las dos bases — hoy 0,87 — y saldría un
// número plausible. El denominador tiene que ser EXACTAMENTE lo que la fórmula multiplica:
//
//   Σ (horas imputadas a una obra × el $/h sellado de esa persona en esa quincena)
//
// ═══ POR QUÉ `base = 'total'` Y NO `'declarado'` ═══
//
// `base = 'declarado'` hace que el porcentaje pese sólo `proporcionDeclarada` veces. Eso es correcto
// para una alícuota LEGAL, que se aplica sobre lo que va por recibo. Pero estos porcentajes ya están
// medidos sobre TODO el bolsillo —la parte declarada y la que no—: volver a ponderarlos por la
// proporción declarada los descontaría dos veces. `base = 'total'` es lo que el comentario de la
// columna llama «sobre todo lo pagado», y hace el resultado independiente de `proporcionDeclarada`,
// que es la verdad: la medición no depende de ese parámetro.
//
// Consecuencia visible: en la pantalla «El costo real de una hora» el multiplicador «entero» y el
// «mitad» van a dar lo mismo. Es correcto y es informativo — dice que el número se midió sobre el
// total, no que el arreglo mitad-recibo no exista.
//
// ═══ APORTES DEL TRABAJADOR: VAN ADENTRO, Y NO ES DOBLE CONTEO ═══
//
// Los códigos 301 y 302 son retenciones al trabajador: salen del bruto, no se suman arriba. Pero el
// bolsillo —`liquidacion_linea.cobra`, horas × $/h— es NETO de esas retenciones: la persona se lleva
// a la mano el acuerdo, y el bruto que la empresa declara es mayor. Medido jun–ago 2026: bruto
// declarado 43,49 M · aportes 8,09 M · neto blanco 35,39 M, contra un bolsillo de 49,72 M. Así que
// los aportes SÍ son costo por encima del bolsillo, y dejarlos afuera subestimaría la hora un 16 %.
//
// ═══ IERIC Y FODECO NO SE SUMAN APARTE ═══
//
// Las dos boletas son el 1 % cada una del Fondo de Cese depositado, y el FICS de la DDJJ de UOCRA es
// el 2 % de la misma base y por el mismo importe (medido: FICS 07/2026 = 26.382,38 = 2 × 13.191,19).
// Sumar las boletas además del FICS contaría la misma plata dos veces. Entra por el `total
// determinado` de UOCRA, que es la cifra de la boleta.

/** Los cinco conceptos del CHECK de `costo_hora_alicuota`. Importados acá para no repetir la lista. */
export const CONCEPTOS = Object.freeze([
  'cargas_sociales', 'art', 'fondo_cese', 'seguro_vida_sepelio', 'no_trabajado_pago',
])

/**
 * COTAS ESTRUCTURALES, NO NORMATIVAS.
 *
 * No codifican una alícuota: codifican lo que es IMPOSIBLE. Un concepto que se lleve más de la mitad
 * de la remuneración declarada, o un costo total que más que duplique el bruto declarado, no es una
 * alícuota alta: es un error de unidad o de ventana (el caso típico, el acumulado anual contra una
 * base mensual). Cruzar una cota NO es una señal para bajar el número — es para no cargarlo.
 */
export const COTAS = Object.freeze({
  maxPorConceptoSobreDeclarado: 50,
  minCostoSobreDeclarado: 1,
  maxCostoSobreDeclarado: 2,
})

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/**
 * LA BOLETA QUE VALE DE CADA PERÍODO: la rectificativa le gana a la original.
 *
 * En Drive conviven «2026-07 UOCRA.pdf» y «2026-07 UOCRA (R).pdf», las dos con el mismo período y
 * distinto total determinado ($649.940,06 contra $1.261.611,38). Sumar las dos duplicaría el Fondo de
 * Cese de julio y agregaría $612 k de aportes que nunca existieron.
 *
 * @param {Array<{periodo:string, tipo_boleta?:string}>} boletas
 */
export function boletaVigente(boletas) {
  const porPeriodo = new Map()
  for (const b of boletas) {
    if (!b?.periodo) continue
    const rect = /rectificativa/i.test(String(b.tipo_boleta ?? ''))
    const ya = porPeriodo.get(b.periodo)
    // Sin rectificativa manda la original; con rectificativa manda ella, venga antes o después en la
    // lista (el orden lo pone el nombre del archivo, que no es un criterio).
    if (!ya || (rect && !/rectificativa/i.test(String(ya.tipo_boleta ?? '')))) {
      porPeriodo.set(b.periodo, b)
    }
  }
  return porPeriodo
}

/**
 * LO DECLARADO DE LA VENTANA, REPARTIDO EN LOS CUATRO CONCEPTOS DE PLATA.
 *
 * Un período sin su F931 o sin su boleta de UOCRA NO se completa con cero: se devuelve en `faltan` y
 * quien llama decide. Un cero acá diría «ese mes no tuvo cargas», que es lo contrario de «no lo pude
 * leer», y bajaría el multiplicador de todos los meses.
 *
 * @param {Array<object>} f931    declaraciones ya parseadas (`parseF931`)
 * @param {Array<object>} uocra   boletas ya parseadas (`leerUocra`)
 * @param {string[]} periodos     ['2026-01', …] — la ventana, explícita
 */
export function declaradoDeLaVentana(f931, uocra, periodos) {
  const porF931 = new Map(f931.filter((d) => d?.periodo).map((d) => [d.periodo, d]))
  const porUocra = boletaVigente(uocra)

  const faltan = []
  const detalle = []
  const acum = {
    aportes: 0, contribuciones: 0, art: 0, scvo: 0,
    uocraTotal: 0, uocraSeguroVida: 0, fondoCese: 0, remuneracion: 0,
  }
  for (const p of periodos) {
    const f = porF931.get(p)
    const u = porUocra.get(p)
    if (!f) faltan.push(`F931 ${p}`)
    if (!u) faltan.push(`DDJJ UOCRA ${p}`)
    if (!f || !u) continue
    // LA REMUNERACIÓN ES LA MISMA EN LAS DOS DDJJ, y si no lo fuera habría que mirarlo antes de
    // derivar nada: son dos declaraciones de la misma nómina ante dos organismos.
    const difRem = Math.abs(n(f.remuneracion) - n(u.remuneraciones))
    const fila = {
      periodo: p,
      remuneracion: n(f.remuneracion),
      remuneracionUocra: n(u.remuneraciones),
      discrepanciaRemuneracion: difRem > 1 ? difRem : 0,
      aportes: n(f.conceptos?.aportes_ss) + n(f.conceptos?.aportes_os),
      contribuciones: n(f.conceptos?.contrib_ss) + n(f.conceptos?.contrib_os),
      art: n(f.conceptos?.lrt),
      scvo: n(f.conceptos?.scvo),
      uocraTotal: n(u.total_determinado),
      uocraSeguroVida: n(u.seguro_vida),
      fondoCese: n(u.fondo_cese_devengado),
      tipoBoletaUocra: u.tipo_boleta ?? null,
    }
    detalle.push(fila)
    acum.remuneracion += fila.remuneracion
    acum.aportes += fila.aportes
    acum.contribuciones += fila.contribuciones
    acum.art += fila.art
    acum.scvo += fila.scvo
    acum.uocraTotal += fila.uocraTotal
    acum.uocraSeguroVida += fila.uocraSeguroVida
    acum.fondoCese += fila.fondoCese
  }

  // EL RESTO DE UOCRA es la boleta menos el seguro de vida: cuota sindical, FICS y los «otros
  // conceptos» de la rectificativa. Va a `cargas_sociales` porque los cinco conceptos del CHECK no
  // tienen un casillero «gremiales», y repartirlo a ojo entre los que hay sería inventar.
  const uocraResto = acum.uocraTotal - acum.uocraSeguroVida
  return {
    faltan,
    detalle,
    remuneracionDeclarada: acum.remuneracion,
    porConcepto: {
      cargas_sociales: acum.aportes + acum.contribuciones + uocraResto,
      art: acum.art,
      fondo_cese: acum.fondoCese,
      seguro_vida_sepelio: acum.scvo + acum.uocraSeguroVida,
    },
    componentes: { ...acum, uocraResto },
  }
}

/**
 * LAS CINCO FILAS DE `costo_hora_alicuota`, Y EL CHEQUEO QUE PUEDE DECIR QUE NO.
 *
 * `no_trabajado_pago` sale de las horas, no de una boleta: es la parte del bolsillo que se pagó y no
 * se imputó a ninguna obra (lluvia, feriado, una hora sin obra cargada). Se expresa sobre el bolsillo
 * imputado porque es sobre eso que la fórmula la va a aplicar.
 *
 * @returns {{ok:boolean, filas:Array, motivos:string[], multiplicador:number|null, razonabilidad:object}}
 */
export function alicuotasDerivadas({
  declarado, bolsilloImputado, bolsilloPagado, rigeDesde, etiquetaVentana,
}) {
  const motivos = [...declarado.faltan.map((f) => `falta ${f}: no derivo sobre una ventana incompleta`)]
  const bi = n(bolsilloImputado)
  const bp = n(bolsilloPagado)
  if (bi <= 0) motivos.push('el bolsillo imputado a obras es cero: no hay denominador')
  // IMPUTADO > PAGADO ES IMPOSIBLE y hay que frenar, no recortar a cero: significa que las horas y
  // la liquidación no están hablando de la misma gente o del mismo período.
  if (bi > 0 && bp < bi) {
    motivos.push(`el bolsillo imputado (${bi.toFixed(2)}) supera el pagado (${bp.toFixed(2)}): las dos fuentes no cierran`)
  }
  for (const [c, v] of Object.entries(declarado.porConcepto)) {
    if (!Number.isFinite(v) || v < 0) motivos.push(`${c} no es un importe válido`)
  }
  if (motivos.length) return { ok: false, filas: [], motivos, multiplicador: null, razonabilidad: null }

  const pct = (v) => (v / bi) * 100
  const filas = [
    ...Object.entries(declarado.porConcepto).map(([concepto, monto]) => ({
      concepto, monto, porcentaje: pct(monto),
    })),
    {
      concepto: 'no_trabajado_pago',
      monto: bp - bi,
      porcentaje: pct(bp - bi),
    },
  ].map((f) => ({
    ...f,
    desde: rigeDesde,
    base: 'total',
    fuente: `derivada de lo declarado y pagado ${etiquetaVentana}: $${Math.round(f.monto).toLocaleString('es-AR')}`
      + ` sobre un bolsillo imputado a obras de $${Math.round(bi).toLocaleString('es-AR')}`,
  }))

  const multiplicador = 1 + filas.reduce((s, f) => s + f.porcentaje / 100, 0)

  // ═══ LA RAZONABILIDAD SE MIDE CONTRA LA BASE DECLARADA, NO CONTRA EL BOLSILLO ═══
  //
  // Porque es la única base contra la que los porcentajes tienen un orden de magnitud conocido: la
  // remuneración imponible es sobre lo que se calculan las contribuciones, la ART y el Fondo de Cese.
  // El costo sobre el bruto declarado —que NO incluye los aportes, que ya están dentro del bruto— es
  // el número comparable con la realidad del sector.
  const rem = declarado.remuneracionDeclarada
  const sobreDeclarado = rem > 0
    ? {
      contribuciones: (declarado.componentes.contribuciones / rem) * 100,
      art: (declarado.componentes.art / rem) * 100,
      fondo_cese: (declarado.componentes.fondoCese / rem) * 100,
      uocra: (declarado.componentes.uocraTotal / rem) * 100,
      aportes: (declarado.componentes.aportes / rem) * 100,
      scvo: (declarado.componentes.scvo / rem) * 100,
    }
    : null
  // LOS APORTES NO ENTRAN EN ESTE COCIENTE: ya están ADENTRO del bruto declarado, que es el
  // denominador. Sumarlos arriba los contaría dos veces y el número dejaría de ser comparable.
  const costoSobreDeclarado = rem > 0
    ? 1 + (declarado.componentes.contribuciones + declarado.componentes.art + declarado.componentes.scvo
      + declarado.componentes.fondoCese + declarado.componentes.uocraTotal) / rem
    : null

  const fueraDeCota = []
  if (sobreDeclarado) {
    for (const [k, v] of Object.entries(sobreDeclarado)) {
      if (v > COTAS.maxPorConceptoSobreDeclarado) {
        fueraDeCota.push(`${k} = ${v.toFixed(2)} % de la remuneración declarada, más de ${COTAS.maxPorConceptoSobreDeclarado} %: es un error de unidad o de ventana, no una alícuota`)
      }
    }
  }
  if (costoSobreDeclarado != null
    && (costoSobreDeclarado < COTAS.minCostoSobreDeclarado || costoSobreDeclarado > COTAS.maxCostoSobreDeclarado)) {
    fueraDeCota.push(`el costo sobre el bruto declarado da ${costoSobreDeclarado.toFixed(4)}, fuera de [${COTAS.minCostoSobreDeclarado}, ${COTAS.maxCostoSobreDeclarado}]`)
  }
  // El CHECK de la base rechaza > 100 y se llevaría la transacción entera: se frena acá y se dice cuál.
  for (const f of filas) {
    if (f.porcentaje < 0 || f.porcentaje > 100) {
      fueraDeCota.push(`${f.concepto} = ${f.porcentaje.toFixed(4)} %, fuera del CHECK [0, 100] de costo_hora_alicuota`)
    }
  }

  return {
    ok: fueraDeCota.length === 0,
    filas,
    motivos: fueraDeCota,
    multiplicador,
    razonabilidad: {
      remuneracionDeclarada: rem,
      bolsilloImputado: bi,
      bolsilloPagado: bp,
      sobreDeclarado,
      costoSobreDeclarado,
      razonBrutoSobreBolsillo: bp > 0 ? rem / bp : null,
    },
  }
}
