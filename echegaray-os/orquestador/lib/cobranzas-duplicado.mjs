// LA CLAVE DE UN COBRO DUPLICADO — DEFINIDA UNA SOLA VEZ.
//
// POR QUÉ EXISTE (21/07). Hasta hoy había DOS definiciones de "duplicado" en el archivo: el detector
// de la pestaña Cobranzas usaba cliente+monto+fecha+comprobante+OC+concepto, y el control de efectivo
// de CAJA usaba ID+monto. Dos definiciones del mismo concepto en dos lugares es exactamente lo que la
// regla de fuente única prohíbe, y se cobró sola el mismo día:
//
// Al devolverle la fórmula autonumerada a la columna A —que alguien había pisado pegando "47" en dos
// celdas— los IDs pasaron a ser únicos por construcción. La definición basada en ID quedó en CERO en
// el acto: el duplicado de $16.200.000 de San Francisco, que se veía el día anterior, se volvió
// invisible. Arreglar un dato rompió un control que dependía de que el dato estuviera roto.
//
// ═══ QUÉ SE PUEDE Y QUÉ NO SE PUEDE DETECTAR ═══
//
// Los dos casos reales del archivo se parecen y no son lo mismo:
//
//   Filas 39 y 40 — LA ESTRELLA, $10.000.000 cada una, mismo día, IDÉNTICAS en todo, las dos sin
//   concepto. El dueño confirmó que son DOS COBROS DISTINTOS. El Sheet no tiene con qué distinguirlos
//   porque nadie escribió el concepto: no es un duplicado, es un dato incompleto.
//
//   Filas 50 y 54 — San Francisco, $16.200.000, mismo día, misma forma, mismo estado. Difieren sólo
//   en cómo está redactado el concepto: "Pago efectivo — julio 2026" contra "Cobro efectivo - pago
//   total julio". Son la MISMA operación escrita dos veces. El dueño lo confirmó.
//
// Ninguna fórmula puede leer esas dos frases y decidir que dicen lo mismo. Por eso la clave de acá NO
// afirma "esto es un duplicado": afirma "estos dos cobros son indistinguibles por los datos duros y
// alguien tiene que mirarlos". Prometer más sería precisión falsa.
//
// EL CONTROL QUE SÍ ES CONCLUYENTE está en CAJA y es físico: lo cobrado en efectivo tiene que
// aparecer depositado en el banco o declarado en la caja. Ese no depende de cómo alguien redactó un
// concepto. Los dos controles se complementan; ninguno reemplaza al otro.

/** Las columnas de Cobranzas que definen la identidad DURA de un cobro. El concepto queda afuera a
 *  propósito: es texto libre y dos redacciones distintas de lo mismo lo harían inútil. */
export const CLAVE = {
  cliente: 'G',
  monto: 'M',
  formaCobro: 'N',
  estado: 'O',
  fechaCobro: 'Q',
}

/**
 * NÚCLEO PURO: el COUNTIFS que cuenta cuántas filas comparten la identidad dura de cada fila.
 * `>1` significa "hay otra igual". Es la única definición de esto en todo el OS.
 *
 * @param {string} pestana normalmente 'Cobranzas'
 * @param {number} f0 primera fila de datos
 * @param {number} f1 última
 */
export function countifsClave(pestana = 'Cobranzas', f0 = 5, f1 = 400) {
  const r = (col) => `${pestana}!$${col}$${f0}:$${col}$${f1}`
  return Object.values(CLAVE).map((c) => `${r(c)};${r(c)}`).join(';')
}

/** NÚCLEO PURO: la condición "esta fila tiene al menos otra idéntica en los datos duros". */
export function esIndistinguible(pestana = 'Cobranzas', f0 = 5, f1 = 400) {
  return `COUNTIFS(${countifsClave(pestana, f0, f1)})>1`
}

/**
 * NÚCLEO PURO: la plata en juego si cada grupo de indistinguibles fuera un duplicado.
 *
 * SE DIVIDE POR 2 porque de cada par sobraría uno. Es una ESTIMACIÓN del riesgo, no un monto a
 * corregir: un trío de filas idénticas la sobreestimaría, y sólo quien conoce el cobro sabe cuál
 * sobra. Se dice así en el rótulo, no se disimula.
 */
export function plataEnJuego(pestana = 'Cobranzas', f0 = 5, f1 = 400) {
  const m = `${pestana}!$${CLAVE.monto}$${f0}:$${CLAVE.monto}$${f1}`
  return `SUMPRODUCT((${esIndistinguible(pestana, f0, f1)})*IF(ISNUMBER(${m});${m};0))/2`
}

/**
 * NÚCLEO PURO: los grupos indistinguibles de una lista de filas ya leídas.
 * La versión en JavaScript de la misma definición, para los scripts y los tests.
 *
 * @param {Array<{fila:number, cliente:string, monto:number, forma:string, estado:string, fechaCobro:string}>} filas
 */
export function gruposIndistinguibles(filas = []) {
  const k = (f) => [f.cliente, f.monto, f.forma, f.estado, f.fechaCobro]
    .map((x) => String(x ?? '').trim().toUpperCase()).join('|')
  const acc = new Map()
  for (const f of filas) {
    if (!(Number(f.monto) > 0)) continue
    const key = k(f)
    if (!acc.has(key)) acc.set(key, [])
    acc.get(key).push(f)
  }
  return [...acc.values()]
    .filter((g) => g.length > 1)
    .map((g) => ({
      filas: g.map((f) => f.fila),
      cliente: g[0].cliente,
      monto: Number(g[0].monto),
      fechaCobro: g[0].fechaCobro,
      // Si TODAS tienen el mismo concepto (o ninguna tiene), no hay nada que las distinga ni siquiera
      // en texto. Si difieren, puede ser que sean cobros distintos mal redactados — o el mismo
      // escrito dos veces. Se informa la diferencia, no se falla.
      conceptos: [...new Set(g.map((f) => String(f.concepto ?? '').trim()))].filter(Boolean),
      enJuego: Number(g[0].monto) * (g.length - 1),
    }))
    .sort((a, b) => b.enJuego - a.enJuego)
}
