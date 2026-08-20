// EL REPASO DE CARTERA — qué plata espera la empresa y qué no muestra el cuadro. Vive aparte desde
// el 15/08.
//
// POR QUÉ SE MUDÓ: `cobranzas-en-cashflow.mjs` es el CUADRE (Cobranzas contra las líneas del Cash
// Flow) y creció al partir la comparación por lado. El repaso de cartera contesta otra pregunta —"qué
// estoy esperando y desde cuándo"— y no lo usa el cuadre: se movió lo que NO se estaba tocando, para
// que el archivo que se toca quede solo. `cobranzas-en-cashflow.mjs` lo re-exporta, así que ningún
// llamador cambia.
//
// La dirección de la dependencia es cuadre → repaso, nunca al revés: acá viven los dos predicados que
// parten el universo de cobros, y los importa el cuadre. Escritos de los dos lados serían dos
// definiciones de "cobrado", que es exactamente lo que el cuadre vino a auditar.

/** La condición exacta con la que el cuadro cuenta un cobro como YA COBRADO. */
export const esCobrado = (c) => String(c.estado).toLowerCase() === 'cobrado'
/** Y la de la línea de esperadas: ni cobrado ni endosado. */
export const esPendiente = (c) => !esCobrado(c) && String(c.estado).toLowerCase() !== 'endosado' && !c.endosado

/** El primero del mes de una fecha, en UTC. */
export const primeroDelMes = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))

/**
 * NÚCLEO PURO: el repaso de Cobranzas que pidió el dueño — "repasar todo cobranzas e ir viendo el
 * tema de caja a fin de cada semana y mes".
 *
 * LOS CUATRO HUECOS QUE BUSCA, Y POR QUÉ CADA UNO ES PLATA QUE EL CUADRO NO MUESTRA:
 *
 *   sinFecha — un pendiente sin fecha de cobro NI de venta no cae en ninguna columna. No aparece en
 *     ninguna semana ni en ningún mes: es invisible para el cuadro y para la decisión.
 *
 *   invisiblesAlCuadro — EL HUECO CARO Y SILENCIOSO. La línea de esperadas lleva el corte
 *     `(col >= EOMONTH(TODAY();-1)+1)` para no inflar un mes ya cerrado con un cobro que no entró, y
 *     eso está bien. Pero el efecto es que un pendiente FECHADO ANTES del mes en curso desaparece de
 *     las dos líneas: no es cobrado (no entró) y su columna está apagada. La empresa sigue esperando
 *     esa plata y el cuadro no la muestra en ningún lado. NO se corrige acá: dónde debe reaparecer
 *     —el mes en curso, una línea de vencidos, o nada hasta renegociar la fecha— es una decisión del
 *     dueño con efecto económico. Acá se mide y se declara.
 *
 *   vencidos — pendientes con fecha pasada que siguen pendientes. Incluye a los invisibles y además
 *     a los del mes en curso, que el cuadro sí muestra pero como si fueran a entrar.
 *
 *   cobradosAFuturo — marcados "Cobrado" con fecha de cobro POSTERIOR a hoy. El cash flow es
 *     percibido: no se puede haber cobrado algo que se cobra la semana que viene. O la fecha está
 *     mal, o el estado se adelantó; en cualquier caso el mes de ese cobro está afirmando un hecho
 *     que todavía no ocurrió.
 *
 * @param {Array<object>} cobros salida de leerCobro
 * @param {{hoy: Date|string|number}} opciones
 */
export function repasar(cobros = [], { hoy } = {}) {
  const h = new Date(hoy)
  const inicioMes = primeroDelMes(h)
  const pendientes = cobros.filter(esPendiente)
  const sinFecha = pendientes.filter((c) => !c.fecha)
  const conFecha = pendientes.filter((c) => c.fecha)
  const suma = (l) => l.reduce((s, c) => s + c.monto, 0)
  return {
    total: cobros.length,
    montoTotal: suma(cobros),
    cobrados: cobros.filter(esCobrado).length,
    pendientes: pendientes.length,
    montoPendiente: suma(pendientes),
    sinFecha,
    vencidos: conFecha.filter((c) => c.fecha < h).sort((a, b) => a.fecha - b.fecha),
    invisiblesAlCuadro: conFecha.filter((c) => c.fecha < inicioMes).sort((a, b) => a.fecha - b.fecha),
    cobradosAFuturo: cobros.filter((c) => esCobrado(c) && c.fechaCobro && c.fechaCobro > h),
    montos: {
      sinFecha: suma(sinFecha),
      vencidos: suma(conFecha.filter((c) => c.fecha < h)),
      invisiblesAlCuadro: suma(conFecha.filter((c) => c.fecha < inicioMes)),
      cobradosAFuturo: suma(cobros.filter((c) => esCobrado(c) && c.fechaCobro && c.fechaCobro > h)),
    },
  }
}

/**
 * NÚCLEO PURO: reconstruye, mes por mes, las DOS líneas de ingreso del cuadro desde Cobranzas.
 *
 * Es la contraprueba de las dos líneas hecha en JavaScript con la misma regla de la fórmula, para
 * poder contestar "¿la línea de cobranzas de este mes se puede reconstruir?" sin preguntarle al
 * cuadro. Un control validado contra la misma fórmula que produce el número no es un control.
 *
 * OJO CON EL CORTE: acá se replica el `(col >= EOMONTH(TODAY();-1)+1)` de la fórmula de BLOQUES, que
 * es la que consumen los repasos de cartera. El cuadre de la matriz (`auditar`) NO usa ese corte
 * porque la matriz cuenta el VENCIDO dentro de la línea proyectada — ver `ladoDeCobro`.
 *
 * @param {Array<object>} cobros · @param {{hoy: Date|string|number}} opciones
 * @returns {Map<string,{cobrado:number, esperado:number}>} clave AAAA-MM
 */
export function porMes(cobros = [], { hoy } = {}) {
  const corte = primeroDelMes(new Date(hoy))
  const acc = new Map()
  for (const c of cobros) {
    // `mes` y `fechaCobro`, no `fecha`: el mes de imputación es el de la fecha de cobro y sólo ése
    // (ver `leerCobro`). Un cobro que sólo tiene Fecha de Venta no cae en ninguna columna acá, igual
    // que no produce movimiento en el libro.
    if (!c.mes || c.endosado) continue
    if (!acc.has(c.mes)) acc.set(c.mes, { cobrado: 0, esperado: 0 })
    if (esCobrado(c)) acc.get(c.mes).cobrado += c.monto
    // El corte de la fórmula: un esperado de un mes ya cerrado NO suma. Se replica tal cual para que
    // la comparación mida el dato, no una diferencia de criterio inventada acá.
    else if (esPendiente(c) && c.fechaCobro >= corte) acc.get(c.mes).esperado += c.monto
  }
  return acc
}
