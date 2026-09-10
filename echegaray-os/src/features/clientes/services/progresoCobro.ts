// CUÁNTO SE COBRÓ DE LO QUE SE CONTRATÓ — la barra de la fila de cada obra.
//
// Pedido del dueño (10/09/2026): «quiero que agregues a cada obra una barra de progreso de lo
// cobrado que sólo sea visible si tenés nivel de usuario admin dentro de esa vista».
//
// ═══ LAS DOS FUENTES, Y POR QUÉ SON LAS QUE SON ═══
//
//   COBRADO      `public.obra_cobranza` en la fila de la OBRA y `public.cliente_economia` en la del
//                CLIENTE. Las dos deciden qué está cobrado con el MISMO predicado —la función SQL
//                `public.es_cobrada(estado, fecha_cobro)`, desde el 10/09/2026— así que no pueden
//                discrepar. Es criterio PERCIBIDO: lo que entró. NUNCA se mezcla con facturado, que
//                es devengado y vive en otra pregunta.
//   CONTRATADO   `obra_economia_cartera` — la MISMA fuente que la columna «Contratado» de esta
//                tabla. Si la barra usara otro denominador, la fila diría dos verdades del mismo
//                número, que es el defecto que ya costó `CarteraHome`.
//
// ═══ SIN CONTRATADO NO HAY BARRA, Y SIN COBRADO TAMPOCO ES CERO ═══
//
// Una obra sin precio en OBRAS no está cobrada al 0 %: no hay contra qué medirla. Y una obra sin
// ninguna cobranza imputada tampoco cobró cero — puede ser que el cobro exista y esté anotado
// contra el cliente y no contra la obra, que es exactamente lo que pasa hoy (ver el pie).

/** El progreso listo para dibujar. `null` = no hay barra que dibujar, y se dice por qué. */
export interface ProgresoDeCobro {
  /** 0–100. Nunca pasa de 100: lo cobrado de más se dice con palabras, no con una barra rota. */
  pct: number
  /** `true` cuando se cobró MÁS que lo contratado. Pasa con adicionales que no entraron al precio. */
  excede: boolean
  /** Cuánto de más, en pesos. `null` si no excede. */
  exceso: number | null
}

/**
 * LA REGLA, PURA. `null` cuando falta cualquiera de los dos números: una barra necesita numerador
 * Y denominador, y dibujar una vacía afirma que se midió y dio cero.
 *
 * Contratado en 0 o negativo tampoco produce barra: dividir por cero da infinito, y un contrato por
 * $ 0 no es un contrato.
 */
export function progresoDeCobro(
  cobrado: number | null | undefined,
  contratado: number | null | undefined,
): ProgresoDeCobro | null {
  if (cobrado == null || contratado == null) return null
  if (!(contratado > 0)) return null
  const crudo = (cobrado / contratado) * 100
  const excede = cobrado > contratado
  return {
    pct: Math.max(0, Math.min(100, Math.round(crudo))),
    excede,
    exceso: excede ? cobrado - contratado : null,
  }
}

/** Cómo se escribe un peso en el `title`. Sin centavos: la barra es una proporción, no un recibo. */
function money(v: number): string {
  return `$${Math.round(v).toLocaleString('es-AR')}`
}

/**
 * LO QUE DICE LA BARRA AL PASAR EL MOUSE. Es donde vive la trazabilidad: la regla del OS es que un
 * número no lleva un párrafo permanente debajo, pero tampoco puede quedarse sin decir de dónde sale.
 *
 * `facturado` entra sólo si existe. Es DEVENGADO y por eso va al final y nombrado: la barra mide
 * percibido, y las dos ventanas no se suman ni se restan.
 *
 * ═══ EL ÁMBITO NO ES COSMÉTICO: DICE DE QUÉ UNIVERSO SON LOS DOS NÚMEROS ═══
 *
 * En la fila de una OBRA los dos salen de esa obra (`obra_cobranza` / `obra_economia_cartera`). En
 * la del CLIENTE los dos son del cliente entero y ACUMULADOS —`cliente_economia.cobrado_neto_total`
 * sobre `cliente_economia.contratado`, todas sus obras no fusionadas—, porque `cobranzas` anota el
 * cobro contra el CLIENTE y no contra la obra: una fracción con el cobro de todas las obras arriba y
 * el contrato de las en curso abajo no sería un porcentaje de nada. La frase lo dice para que nadie
 * lea el % del cliente como si fuera el de su obra en marcha.
 */
export function tituloDeCobro(
  { cobrado, contratado, facturado = null, ambito = 'obra', obrasSinPrecio = null }:
  {
    cobrado: number | null
    contratado: number | null
    facturado?: number | null
    ambito?: 'obra' | 'cliente'
    /**
     * CUÁNTAS OBRAS DEL CLIENTE NO TIENEN PRECIO EN OBRAS (`cliente_economia.n_obras_sin_precio`).
     *
     * Mientras haya una, el porcentaje no existe: arriba va el cobro de TODAS sus obras y abajo el
     * contrato de las que tienen precio. San Francisco publicaba «100 % cobrado» dividiendo
     * $132.415.646 —de sus 5 obras— por $109.592.102 —de 4—. El importe cobrado sigue siendo un
     * hecho y se publica; el porcentaje no se publica y esta frase dice por qué.
     */
    obrasSinPrecio?: number | null
  },
): string {
  const deCliente = ambito === 'cliente'
  if (contratado == null) {
    return deCliente
      ? 'Ninguna de sus obras tiene precio en OBRAS: no hay contra qué medir el cobro. No es 0 % cobrado.'
      : 'Sin precio en OBRAS: no hay contra qué medir el cobro. No es 0 % cobrado.'
  }
  if (cobrado == null) {
    // NO ES «NO COBRÓ NADA». Cobranzas anota la fila contra el cliente o la unidad de negocio, no
    // contra la obra: mientras eso sea así, esta obra no tiene cobro IMPUTADO, que es otra cosa.
    return deCliente
      ? `Sin cobranzas registradas para este cliente (contratado ${money(contratado)}). `
        + 'No es que no haya cobrado: es que ninguna fila de Cobranzas quedó atada a su ficha.'
      : `Sin cobranzas imputadas a esta obra (contratado ${money(contratado)}). `
        + 'No significa que no se haya cobrado: Cobranzas registra el cobro por cliente, no por obra.'
  }
  if (deCliente && obrasSinPrecio != null && obrasSinPrecio > 0) {
    return `Cobrado ${money(cobrado)} sin IVA (acumulado, todas sus obras). SIN PORCENTAJE: `
      + `${obrasSinPrecio} de sus obras no tienen precio en OBRAS, así que lo contratado `
      + `(${money(contratado)}) no cubre lo que se cobró y la fracción no mediría nada.`
  }
  const p = progresoDeCobro(cobrado, contratado)
  const base = deCliente
    ? `cobrado ${money(cobrado)} sin IVA de ${money(contratado)} contratado en todas sus obras`
    : `cobrado ${money(cobrado)} de ${money(contratado)} contratado`
  const exceso = p?.exceso != null ? ` · ${money(p.exceso)} por encima de lo contratado` : ''
  const fact = facturado != null ? ` · facturado ${money(facturado)} (devengado)` : ''
  return `${base}${exceso}${fact}`
}

// LO QUE ESTA BARRA NO PUEDE DIBUJAR TODAVÍA (medido el 10/09/2026 contra la base):
// `cobranzas.obra_cliente` guarda una etiqueta de CLIENTE —«messina», «arcor», «imotor san
// francisco javi sanchez»—, y `obra_alias` la resuelve a una obra sólo cuando esa etiqueta nombra
// una obra. Resultado: de las 96 filas de Cobranzas, las cobradas se agrupan en TRES obra_id
// (`messina`, `arcor`, `quattropani`), y ninguna de las obras que tienen contratado en
// `obra_economia_cartera` tiene cobro imputado. La barra está construida y probada; hoy dice «—»
// con su motivo en todas las filas. Lo que falta no es código: es que Cobranzas diga de qué OBRA es
// cada cobro (o que se carguen los alias por obra que ya existen para otras).
