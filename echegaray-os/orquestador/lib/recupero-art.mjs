// EL RECUPERO DE ART — la plata que la aseguradora devuelve NO es una venta.
//
// ═══ POR QUÉ EXISTE (13/08/2026) ═══
//
// Prevención ART reintegró $914.612,42 por la Incapacidad Laboral Temporaria del siniestro 3012927
// (accidente in itínere del 08/06/2026). La plata entró al Santander el 11/08 y el OS la vio entrar
// SIN SABER QUÉ ERA: `banco_movimientos` la tiene como "Pago a proveedores recibido - Prevencion
// aseguradora de rie…", y ninguna pestaña ni tabla la explica.
//
// Los dos lugares donde se la podía meter, y por qué los dos están mal:
//
//   · COBRANZAS. Es la puerta de los ingresos, pero es la puerta de las VENTAS: mete el importe en la
//     facturación del mes y en el margen de una obra que no lo generó. La empresa no le vendió nada a
//     la ART. Inflaría la facturación y ensuciaría el margen — dos de las reglas de oro a la vez.
//   · MENOR EGRESO DE CAJA DE JUNIO/JULIO. Rompería la conciliación bancaria: esa plata SALIÓ en
//     junio y julio (los sueldos se pagaron enteros) y VOLVIÓ el 11 de agosto. Restarla del egreso de
//     los meses en que salió haría que el cash flow no cierre nunca contra el extracto.
//
// ═══ QUÉ ES DE VERDAD ═══
//
// Un reintegro de ILT es el RECUPERO DE UN COSTO LABORAL YA PAGADO. Durante la incapacidad, el
// empleador le sigue liquidando el haber al accidentado y la aseguradora se lo devuelve. Entonces:
//
//   CAJA (percibido) ....... ingreso del 11/08. Ya está: el saldo del extracto lo contiene. Este
//                            módulo NO emite un movimiento de caja — lo haría entrar dos veces.
//   DEVENGADO .............. MENOR COSTO DE NÓMINA de los meses TRABAJADOS que se recuperan (jun y
//                            jul 2026), nunca del mes en que se cobró.
//
// Es la misma separación que `20260731120000_jornal_quincena_fecha_pago.sql` ya dejó escrita para los
// jornales: caja por fecha de pago, devengamiento por el período trabajado. Un recupero no puede
// tener una convención propia.
//
// ═══ EL DESGLOSE NO ES DECORACIÓN: DECIDE QUÉ LÍNEA NETEA ═══
//
// La liquidación de la ART discrimina remuneración, SAC, no remunerativo y contribuciones. Los tres
// primeros recuperan la MASA SALARIAL (la línea `jornales` de `nomina_por_mes`); las contribuciones
// recuperan el F931 (la línea `cargas_sociales`). Tirar el total contra una sola línea daría el mismo
// costo total y dos líneas equivocadas — y esas líneas son las que se comparan contra la DDJJ.
//
// Este archivo es NÚCLEO PURO: no lee Google, no toca la base, no mira el reloj. Entra el documento
// de la aseguradora ya transcripto y salen renglones normalizados.

/**
 * LOS CONCEPTOS DE UNA LIQUIDACIÓN DE ILT, Y A QUÉ LÍNEA NETEA CADA UNO.
 *
 * El orden es el de la orden de pago de Prevención ART. `linea` es el nombre de la columna de
 * `public.nomina_por_mes` que el concepto reduce: una sola definición para la base y para el informe.
 */
export const CONCEPTOS_ILT = Object.freeze([
  { clave: 'remunerativo', nombre: 'Remuneración sujeta a aportes', linea: 'jornales' },
  { clave: 'sac', nombre: 'SAC', linea: 'jornales' },
  { clave: 'no_remunerativo', nombre: 'No remunerativo', linea: 'jornales' },
  { clave: 'contribuciones', nombre: 'Contribuciones remunerativas', linea: 'cargas_sociales' },
])

/** Las líneas de `nomina_por_mes` que un recupero puede netear. Nunca se inventa una tercera. */
export const LINEAS = Object.freeze(['jornales', 'cargas_sociales'])

/** Cómo se repartió el recupero entre los períodos. El método viaja con el dato, siempre. */
export const METODOS = Object.freeze(['liquidacion', 'prorrateo_dias', 'sin_imputar'])

const CLAVES = new Set(CONCEPTOS_ILT.map((c) => c.clave))

/** Centavos: la aritmética del reparto se hace en enteros y recién al final se vuelve a pesos. */
const aCent = (v) => Math.round(Number(v) * 100)
const aPeso = (c) => Math.round(c) / 100
const esNum = (v) => typeof v === 'number' && Number.isFinite(v)
const RE_PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * NÚCLEO PURO: valida y normaliza la liquidación de la aseguradora, o explota diciendo qué le falta.
 *
 * FALLA CERRADO, igual que `movimiento()` en el libro. Un recupero a medias no es "un registro
 * incompleto": es un neteo que reduce un costo real por un importe que nadie verificó. La guarda que
 * más importa es la última: **la suma de los conceptos tiene que dar exactamente lo liquidado**. Si no
 * da, o el desglose está mal transcripto o la orden de pago tiene un concepto que este módulo no
 * conoce — en los dos casos, registrar sería inventar.
 *
 * @param {object} doc lo que dice la orden de pago, transcripto
 * @returns {{cabecera:object, conceptos:Array, diferencia:number}}
 */
export function normalizarRecupero(doc = {}) {
  exigirCampos(doc)
  const desglose = doc.conceptos ?? {}
  const conceptos = CONCEPTOS_ILT
    .map((c) => ({ clave: c.clave, nombre: c.nombre, linea: c.linea, monto: Number(desglose[c.clave] ?? 0) }))
    .filter((c) => c.monto !== 0)
  const suma = conceptos.reduce((a, c) => a + aCent(c.monto), 0)
  if (suma !== aCent(doc.importe_liquidado)) {
    throw new Error('recupero-art: el desglose no cierra contra lo liquidado. Conceptos: '
      + `$${aPeso(suma)} · Liquidado: $${doc.importe_liquidado}. Diferencia $${aPeso(suma - aCent(doc.importe_liquidado))}. `
      + 'No se registra un neteo que no cierra: o el desglose está mal transcripto o la orden de pago '
      + 'trae un concepto que este módulo no conoce.')
  }
  // LO QUE LA ART NO PAGÓ TAMBIÉN ES INFORMACIÓN. La diferencia entre lo solicitado y lo liquidado
  // («se aplican los aumentos por paritarias correspondientes») es plata que la empresa pagó y no
  // recupera: no es un error de carga, es el costo real del siniestro que queda del lado de la empresa.
  const diferencia = esNum(doc.importe_solicitado)
    ? aPeso(aCent(doc.importe_solicitado) - aCent(doc.importe_liquidado))
    : null
  return { cabecera: cabeceraDe(doc, diferencia), conceptos, diferencia }
}

/** Las guardas de entrada, juntas: o están todas o no se registra nada. */
function exigirCampos(doc) {
  const txt = (v) => String(v ?? '').trim()
  const falta = []
  if (!txt(doc.siniestro)) falta.push('siniestro')
  if (!txt(doc.aseguradora)) falta.push('aseguradora')
  if (!txt(doc.trabajador)) falta.push('trabajador')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(txt(doc.fecha_cobro))) falta.push('fecha_cobro (YYYY-MM-DD)')
  if (!esNum(doc.importe_liquidado) || doc.importe_liquidado <= 0) falta.push('importe_liquidado')
  const desconocidos = Object.keys(doc.conceptos ?? {}).filter((k) => !CLAVES.has(k))
  if (desconocidos.length) falta.push(`conceptos que no existen en una liquidación de ILT: ${desconocidos.join(', ')}`)
  if (falta.length) {
    throw new Error(`recupero-art: no puedo registrar el recupero, falta ${falta.join(' · ')}. `
      + `Lo que llegó: ${JSON.stringify(doc).slice(0, 200)}`)
  }
}

/** La cabecera normalizada. El CUIT y el documento se guardan sin puntos: son los mismos dígitos con
 *  los que el crédito del banco y la base identifican a la aseguradora y a la persona. */
function cabeceraDe(doc, diferencia) {
  const txt = (v) => String(v ?? '').trim()
  const soloDigitos = (v) => txt(v).replace(/\D/g, '') || null
  return {
    siniestro: txt(doc.siniestro),
    aseguradora: txt(doc.aseguradora),
    cuit_aseguradora: soloDigitos(doc.cuit_aseguradora),
    trabajador: txt(doc.trabajador),
    documento: soloDigitos(doc.documento),
    contingencia: txt(doc.contingencia) || 'ilt',
    solicitud: txt(doc.solicitud) || null,
    // CADENA VACÍA, NO NULL: es parte de la clave que impide registrar dos veces el mismo reintegro, y
    // un único sobre NULL no restringe. Ver el comentario de la columna en la migración.
    orden_pago: txt(doc.orden_pago),
    fecha_cobro: txt(doc.fecha_cobro),
    cbu_acreditacion: txt(doc.cbu_acreditacion) || null,
    importe_solicitado: esNum(doc.importe_solicitado) ? doc.importe_solicitado : null,
    importe_liquidado: doc.importe_liquidado,
    diferencia,
    documento_origen: txt(doc.documento_origen) || null,
  }
}

/**
 * NÚCLEO PURO: reparte UN importe entre períodos con pesos enteros, sin perder ni inventar centavos.
 *
 * El resto de la división se le da al período de mayor peso (y ante empate, al primero). Repartir "a
 * ojo" y dejar que el redondeo se coma un centavo por concepto y por mes es cómo un neteo termina
 * dando una diferencia sin causa contra el importe cobrado.
 */
function repartir(montoCent, pesos) {
  const total = pesos.reduce((a, p) => a + p, 0)
  if (total <= 0) return pesos.map(() => 0)
  const partes = pesos.map((p) => Math.floor((montoCent * p) / total))
  let resto = montoCent - partes.reduce((a, p) => a + p, 0)
  const orden = pesos.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p || a.i - b.i)
  for (let k = 0; resto > 0; k = (k + 1) % orden.length) { partes[orden[k].i]++; resto-- }
  return partes
}

/**
 * NÚCLEO PURO: convierte el recupero en renglones imputados a los meses TRABAJADOS que recupera.
 *
 * ═══ LOS TRES MÉTODOS, Y POR QUÉ EL TERCERO NO ES UNA FALLA ═══
 *
 * · `liquidacion`     — la orden de pago trae el monto de cada período. Es un HECHO. Manda siempre.
 * · `prorrateo_dias`  — la orden trae los días de ILT de cada período pero no los montos. Se reparte
 *                       por días y el renglón queda marcado `es_estimacion`: los días de un mes no
 *                       valen lo mismo que los del otro si hubo aumento de paritaria en el medio.
 * · `sin_imputar`     — no hay ni montos ni días por período. El recupero se registra ENTERO (el
 *                       cobro es un hecho y no se pierde) con el período en blanco, y NO netea ningún
 *                       mes hasta que alguien complete el desglose.
 *
 * Prorratear sin dato sería inventar precisión, que es la regla de oro que este repo más veces pagó.
 * Un renglón sin imputar es visible y se puede completar; un prorrateo inventado se convierte en
 * "el costo de junio" y nadie vuelve a mirarlo.
 *
 * @param {object} recupero salida de normalizarRecupero
 * @param {Array<{periodo:string, monto?:number, dias?:number}>} periodos
 * @returns {{metodo:string, es_estimacion:boolean, renglones:Array, avisos:string[]}}
 */
export function imputar(recupero, periodos = []) {
  const { conceptos } = recupero
  const ps = (periodos ?? []).filter((p) => RE_PERIODO.test(String(p?.periodo ?? '')))
  const avisos = []
  if ((periodos ?? []).length !== ps.length) {
    avisos.push('hay períodos con formato inválido (se espera YYYY-MM): se ignoraron.')
  }
  const conMonto = ps.filter((p) => esNum(p.monto) && p.monto > 0)
  const conDias = ps.filter((p) => esNum(p.dias) && p.dias > 0)

  if (ps.length && conMonto.length === ps.length) return porLiquidacion(recupero, conMonto, avisos)
  if (ps.length && conDias.length === ps.length) return porDias(conceptos, conDias, avisos)
  if (ps.length) {
    avisos.push('los períodos vienen a medias (unos con monto y otros sin): no se mezcla un hecho con '
      + 'una estimación en el mismo recupero. Queda SIN IMPUTAR hasta tener el desglose completo.')
  } else {
    avisos.push('la orden de pago no trae el desglose por período: el recupero queda SIN IMPUTAR y no '
      + 'netea ningún mes. Completalo cuando tengas la liquidación por período.')
  }
  return {
    metodo: 'sin_imputar',
    es_estimacion: false,
    avisos,
    renglones: conceptos.map((c) => ({
      periodo: '', concepto: c.clave, concepto_nombre: c.nombre, linea: c.linea, monto: c.monto,
    })),
  }
}

/** El reparto exacto: cada período trae su monto y cada concepto se reparte con esos pesos. */
function porLiquidacion(recupero, conMonto, avisos) {
  const total = conMonto.reduce((a, p) => a + aCent(p.monto), 0)
  if (total !== aCent(recupero.cabecera.importe_liquidado)) {
    throw new Error(`recupero-art: los montos por período suman $${aPeso(total)} y lo liquidado es `
      + `$${recupero.cabecera.importe_liquidado}. Un reparto que no cierra contra el cobro es un neteo inventado.`)
  }
  const pesos = conMonto.map((p) => aCent(p.monto))
  return {
    metodo: 'liquidacion',
    es_estimacion: false,
    avisos,
    renglones: renglonesDe(recupero.conceptos, conMonto, pesos),
  }
}

/** El reparto por días: mismo mecanismo, pesos distintos, y el renglón sale marcado como estimación. */
function porDias(conceptos, conDias, avisos) {
  avisos.push('el reparto entre períodos es por DÍAS de ILT, no por la liquidación: es una ESTIMACIÓN. '
    + 'Si hubo aumento de paritaria entre los períodos, un día de cada mes no vale lo mismo.')
  return {
    metodo: 'prorrateo_dias',
    es_estimacion: true,
    avisos,
    renglones: renglonesDe(conceptos, conDias, conDias.map((p) => p.dias)),
  }
}

/** Un renglón por (período × concepto), con el reparto ya hecho en centavos. */
function renglonesDe(conceptos, periodos, pesos) {
  const out = []
  for (const c of conceptos) {
    const partes = repartir(aCent(c.monto), pesos)
    periodos.forEach((p, i) => {
      if (partes[i] === 0) return
      out.push({
        periodo: p.periodo,
        concepto: c.clave,
        concepto_nombre: c.nombre,
        linea: c.linea,
        monto: aPeso(partes[i]),
      })
    })
  }
  return out
}

/**
 * NÚCLEO PURO: ¿el extracto prueba que este recupero se cobró?
 *
 * LA EVIDENCIA ES DEL EFECTO. Un recupero registrado sin el crédito que lo respalda es una promesa de
 * la aseguradora, no plata. Se matchea por importe exacto y fecha (±`tolerancia` días, porque la fecha
 * de la orden de pago y la de acreditación pueden no ser el mismo día) y se devuelve la REFERENCIA del
 * banco, que es la clave que este repo ya usa para identificar un movimiento — nunca el saldo corrido.
 *
 * @param {{importe_liquidado:number, fecha_cobro:string}} cabecera
 * @param {Array<{fecha:string, importe:number|string, concepto?:string, referencia?:string}>} creditos
 */
export function respaldoDelCobro(cabecera, creditos = [], { tolerancia = 3 } = {}) {
  const objetivo = aCent(cabecera.importe_liquidado)
  const dia = (s) => Date.parse(`${String(s).slice(0, 10)}T00:00:00Z`)
  const base = dia(cabecera.fecha_cobro)
  const candidatos = (creditos ?? []).filter((m) => {
    if (aCent(m.importe) !== objetivo) return false
    const d = dia(m.fecha)
    return Number.isFinite(d) && Math.abs(d - base) <= tolerancia * 86400000
  })
  if (!candidatos.length) {
    return {
      respaldado: false,
      motivo: `ningún crédito del banco por $${cabecera.importe_liquidado} dentro de ${tolerancia} día(s) `
        + `del ${cabecera.fecha_cobro}`,
    }
  }
  if (candidatos.length > 1) {
    return {
      respaldado: false,
      motivo: `hay ${candidatos.length} créditos del banco por el mismo importe y la misma fecha: no se `
        + 'elige uno. Sin referencia única no hay prueba de cuál es éste.',
      candidatos: candidatos.map((m) => m.referencia ?? null),
    }
  }
  const m = candidatos[0]
  return { respaldado: true, referencia_banco: String(m.referencia ?? ''), fecha: String(m.fecha).slice(0, 10), concepto: m.concepto ?? '' }
}

const $ = (v) => `$${Number(v ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Texto legible del recupero ya imputado. PURO — lo usan el script y el chat. */
export function formatRecupero(recupero, imputacion, respaldo = null) {
  const c = recupero.cabecera
  const L = [`RECUPERO DE ART — siniestro ${c.siniestro} · ${c.trabajador}`, '']
  L.push(`  Aseguradora .......... ${c.aseguradora}`)
  L.push(`  Contingencia ......... ${String(c.contingencia).toUpperCase()}`)
  if (c.importe_solicitado != null) L.push(`  Solicitado ........... ${$(c.importe_solicitado)}`)
  L.push(`  Liquidado ............ ${$(c.importe_liquidado)} · cobrado el ${c.fecha_cobro}`)
  if (c.diferencia) {
    L.push(`  NO recuperado ........ ${$(c.diferencia)} — costo del siniestro que queda en la empresa`)
  }
  L.push('')
  L.push(respaldo?.respaldado
    ? `  Respaldo del banco ... referencia ${respaldo.referencia_banco} (${respaldo.fecha})`
    : `  ⚠ SIN RESPALDO ....... ${respaldo?.motivo ?? 'no se buscó el crédito en el extracto'}`)
  L.push('')
  L.push(`  IMPUTACIÓN (${imputacion.metodo}${imputacion.es_estimacion ? ' · ESTIMACIÓN' : ''})`)
  const porPeriodo = new Map()
  for (const r of imputacion.renglones) {
    const k = `${r.periodo || '(sin imputar)'}|${r.linea}`
    porPeriodo.set(k, (porPeriodo.get(k) ?? 0) + r.monto)
  }
  for (const [k, v] of [...porPeriodo.entries()].sort()) {
    const [per, linea] = k.split('|')
    L.push(`    ${per.padEnd(14)} ${linea.padEnd(16)} −${$(v)}`)
  }
  L.push('')
  L.push('  Netea el COSTO DEVENGADO de esos meses. En CAJA no cambia nada: el cobro ya está en el')
  L.push('  saldo del banco y volver a sumarlo lo contaría dos veces.')
  for (const a of imputacion.avisos ?? []) L.push(`  ⚠ ${a}`)
  return L.join('\n')
}
