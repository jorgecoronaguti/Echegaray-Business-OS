// EL LIBRO DEL DUEÑO, REPLICADO TAL CUAL — para poder MEDIR la distancia con el código.
//
// `comercial.mjs::cascada()` es el modelo del OS. Esto NO lo reemplaza ni compite con él: es la
// regla del `.xlsm` escrita aparte, con sus redondeos y todo, para que la diferencia entre los dos
// sea un NÚMERO y no una opinión. Si algún día divergen, el que grita es el test, no una cotización
// entregada al cliente.
//
// ═══ POR QUÉ EXISTE EL ROUNDUP ═══
//
// La hoja Presupuesto aplica `ROUNDUP(x;1)` —redondeo HACIA ARRIBA a un decimal— en cinco
// escalones: beneficio (H68), ganancias (H75), subtotal (H77), impuesto al cheque (H79) y venta sin
// IVA (H81), más el IVA (H83). El código productivo no lo hace. Sobre la cotización de $187,4 M que
// el libro trae cacheada eso vale $0,34 — pero es la ÚNICA diferencia que existe entre los dos
// modelos, y sin escribirla no se podía afirmar que fuera la única.
//
// Fuente medida: `Planilla para Cotizar.xlsm` · Drive `1GBgblLgp_ns7C5nm9alSMvigCZkWdtH9`
// (`administracion/PRESUPUESTOS - CLIENTES/`, la plantilla madre) · hoja Presupuesto B62:H89.

/** ROUNDUP de Excel: SIEMPRE hacia arriba, nunca al par ni al más cercano. El epsilon está porque
 *  `0.1*3` en binario da `0.30000000000000004` y `Math.ceil` lo subiría un décimo entero de más. */
export function roundUp(x, decimales = 1) {
  if (!Number.isFinite(Number(x))) return null
  const f = 10 ** decimales
  return Math.ceil(Number(x) * f - 1e-9) / f
}

/** Los seis escalones donde el libro redondea hacia arriba, en el orden en que los aplica. */
export const ESCALONES_CON_ROUNDUP = Object.freeze(['beneficio', 'ganancias', 'subtotal', 'impuestoCheque', 'ventaSinIva', 'iva'])

/**
 * LA CASCADA DEL LIBRO, CELDA POR CELDA. PURA.
 *
 * Tres bases distintas, y ése es todo el asunto: los porcentajes NO se suman.
 *   H62 costo directo
 *   H64 = E64 × H62                      GG sobre el COSTO DIRECTO
 *   H66 = H62 + H64                      costo industrial
 *   H68 = ROUNDUP(E68 × H66; 1)          beneficio sobre el INDUSTRIAL
 *   H69 = H66 + H68
 *   H71 = E71 × H66 × F71                financiero sobre el INDUSTRIAL × factor de medio período
 *   H73 = E73 × H69                      IIBB sobre INDUSTRIAL+BENEFICIO — NO sobre el financiero
 *   H75 = ROUNDUP(E75 × H69; 1)          ganancias, misma base que IIBB
 *   H77 = ROUNDUP(H69 + H73 + H75 + H71; 1)
 *   H79 = ROUNDUP(E79 × H77; 1)          impuesto al cheque sobre el SUBTOTAL
 *   H81 = ROUNDUP(H77 + H79; 1)          venta sin IVA
 *   H83 = ROUNDUP(E83 × H81; 1)
 *   H86 = H81 + H83                      venta final
 *   H89 = H86 / H62                      «COEFICIENTE RESUMEN» — es el CON IVA, no el sin IVA
 *
 * NO hay escalón de riesgo ni de contingencia: entre H62 y H89 no existe ninguna fila que los
 * nombre. Verificado sobre la plantilla madre, no asumido.
 */
export function cascadaDelLibro({ costoDirecto, politica } = {}) {
  if (!politica) throw new Error('la cascada del libro necesita los ocho porcentajes')
  const cd = Number(costoDirecto)
  if (!Number.isFinite(cd)) throw new Error('el costo directo del libro no es un número')
  const p = politica
  const gastosGenerales = cd * p.pctGastosGenerales
  const costoIndustrial = cd + gastosGenerales
  const beneficio = roundUp(p.pctBeneficio * costoIndustrial)
  const industrialMasBeneficio = costoIndustrial + beneficio
  const financiero = p.pctFinanciero * costoIndustrial * p.factorFinanciero
  const iibb = p.pctIibb * industrialMasBeneficio
  const ganancias = roundUp(p.pctGanancias * industrialMasBeneficio)
  const subtotal = roundUp(industrialMasBeneficio + iibb + ganancias + financiero)
  const impuestoCheque = roundUp(p.pctCheque * subtotal)
  const ventaSinIva = roundUp(subtotal + impuestoCheque)
  const iva = roundUp(p.pctIva * ventaSinIva)
  const ventaFinal = ventaSinIva + iva
  return Object.freeze({
    costoDirecto: cd, gastosGenerales, costoIndustrial, beneficio, industrialMasBeneficio,
    financiero, iibb, ganancias, subtotal, impuestoCheque, ventaSinIva, iva, ventaFinal,
    // El libro llama «COEFICIENTE RESUMEN» al de CON IVA y es el que multiplica cada renglón
    // (L = H × $H$89). El `coeficienteDe()` de comercial.mjs devuelve el SIN IVA: son dos números
    // distintos separados por un 21 %, y confundirlos es lo mismo que regalar el IVA.
    coeficienteConIva: cd > 0 ? ventaFinal / cd : null,
    coeficienteSinIva: cd > 0 ? ventaSinIva / cd : null,
  })
}

/**
 * EL COSTO UNITARIO DE UN ANÁLISIS SEGÚN EL LIBRO. PURA.
 *
 * `G = SUM(G_lineas)` y cada `G_linea = F × E` con `F = VLOOKUP(recurso; Recursos; 10)`. La columna
 * 10 del libro YA trae el desperdicio incorporado (`J = D×(1+I)`), así que acá NO se vuelve a
 * aplicar: hacerlo lo contaría dos veces.
 *
 * Un recurso REPETIDO dentro del mismo análisis SUMA — el libro pone una fila por etapa (armadura,
 * encofrado, colado) y todas caen dentro del mismo `SUM`. Quedarse con la última en vez de sumarlas
 * es la trampa que este archivo existe para detectar.
 */
export function costoUnitarioDelLibro(lineas, precioDe) {
  if (!Array.isArray(lineas)) return null
  let total = 0
  for (const l of lineas) {
    const precio = typeof precioDe === 'function' ? precioDe(l.recurso) : precioDe?.[l.recurso]
    if (!Number.isFinite(Number(precio)) || !Number.isFinite(Number(l.cantidad))) return null
    total += Number(precio) * Number(l.cantidad)
  }
  return total
}

/** Agrupa las líneas por recurso SUMANDO las cantidades — la lectura correcta de un bloque con
 *  etapas repetidas. Devuelve un Map recurso → cantidad total. */
export function cantidadesPorRecurso(lineas) {
  const m = new Map()
  for (const l of lineas ?? []) m.set(String(l.recurso), (m.get(String(l.recurso)) ?? 0) + Number(l.cantidad))
  return m
}
