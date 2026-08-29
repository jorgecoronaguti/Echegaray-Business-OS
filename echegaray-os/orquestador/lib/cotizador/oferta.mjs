// LA OFERTA SALE DE LO CONGELADO, Y LA REVISIÓN NO LA TOCA (§25, §26).
//
// ═══ ADAPTER, NO SEGUNDO MOTOR ═══
//
// La oferta al cliente es una VISTA de la versión congelada, no un cálculo nuevo. En cuanto existe
// un segundo motor que produce los números del cliente, existen dos precios de la misma obra y
// nadie sabe cuál mandó. Por eso `ofertaDesde` sólo LEE la versión congelada, suma, oculta y
// renombra — no vuelve a valorizar nada.
//
// ═══ CERO LÍNEAS HUÉRFANAS ═══
//
// Cada línea de la oferta conserva de qué partida congelada salió (`genealogy`). El cliente no lo
// ve; el que defiende la oferta sí. Sin eso, «¿de dónde salió este renglón de $12 M?» tres semanas
// después no tiene respuesta, y una oferta que no se puede explicar no se puede sostener en una
// negociación.
//
// ═══ LO QUE EL CLIENTE NO VE ═══
//
// Costos, HH, márgenes, coeficiente y el cómputo interno. **La relación se conserva igual**: la
// línea de la oferta sabe cuánto costó, sólo que ese campo no se serializa hacia afuera. Es la
// diferencia entre ocultar y borrar, y la segunda haría imposible la revisión.
//
// ═══ LA REVISIÓN NO MUTA (§26, §42 REVISION ≠ MUTACIÓN) ═══
//
// Documentación nueva ⇒ una REVISIÓN, y la versión ofertada queda intacta. La revisión produce DOS
// vistas y no se mezclan nunca:
//
//   (A) IMPACTO DE ALCANCE — qué cambió de obra, valorizado A LOS PRECIOS Y LA POLÍTICA DE LA
//       OFERTA ORIGINAL. Contesta «¿cuánto más es este trabajo?» y es la base de un adicional.
//   (B) VALOR ACTUAL — la obra de hoy a los precios de hoy. Contesta «¿cuánto vale esto ahora?».
//
// Mezclarlas produce el número que no significa nada: parte del cambio es más obra y parte es
// inflación, y cobrarle al cliente el segundo como si fuera el primero es lo que rompe una relación
// comercial.

import { ESTADO } from './contrato.mjs'
import { cascada } from './comercial.mjs'
import { diferenciaDeHuellas } from './freeze.mjs'

const redondear = (n, d = 2) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 10 ** d) / 10 ** d)

/**
 * LA OFERTA. PURA. Lanza si la versión no está congelada.
 *
 * Que sea una excepción es el punto: §25 dice «desde la versión congelada, no del draft», y un
 * valor de retorno se puede ignorar. Un borrador que sale como oferta es una oferta que cambia
 * después de haberse enviado.
 */
export function ofertaDesde({ congelada, partidas = [], cliente = null, numero = null, validezDias = 15 } = {}) {
  if (!congelada || congelada.esBorrador !== false) {
    throw new Error('la oferta sale de la versión CONGELADA, no del borrador: un borrador que sale como oferta cambia después de enviado')
  }
  // ═══ EL PRORRATEO ES POR PARTICIPACIÓN, NO POR EL COEFICIENTE ═══
  //
  // Multiplicar cada costo por `coeficienteSinIva` parece lo mismo y no lo es: el coeficiente que
  // se publica está redondeado a seis decimales, y sobre $40 M eso deja $4,77 de diferencia entre
  // la suma de las líneas y el total ofertado. Un presupuesto cuyas líneas no suman el total es un
  // presupuesto que el cliente va a sumar con la calculadora y va a devolver.
  //
  // Se prorratea por PARTICIPACIÓN en el costo directo, y el residuo de redondeo se asigna a la
  // última línea. La alternativa —dejar el residuo sin asignar— es exactamente el descuadre.
  const totalOfertado = redondear(congelada.cascada.ventaSinIva)
  const baseCosto = partidas.reduce((a, p) => a + (Number(p.subtotal) || 0), 0)
  const precios = partidas.map((p) => (baseCosto > 0 ? redondear(totalOfertado * ((Number(p.subtotal) || 0) / baseCosto)) : 0))
  const residuo = redondear(totalOfertado - precios.reduce((a, v) => a + v, 0))
  if (precios.length) precios[precios.length - 1] = redondear(precios.at(-1) + residuo)

  const lineas = partidas.map((p, i) => Object.freeze({
    orden: i + 1,
    rubro: p.rubro ?? null,
    descripcion: p.descripcion ?? p.codigo,
    unidad: p.unidad ?? null,
    cantidad: p.cantidad ?? null,
    precio: precios[i],
    // ═══ LA GENEALOGÍA POR LÍNEA. El cliente no la ve; el que defiende la oferta, sí ═══
    genealogy: Object.freeze({
      partida: p.codigo ?? p.id ?? null,
      tareaTipoId: p.tareaTipoId ?? null,
      versionCongelada: congelada.version,
      huella: congelada.huella?.sha256 ?? null,
      // Se CONSERVA la relación: el campo existe y no se serializa hacia afuera.
      costoInterno: p.subtotal ?? null,
      hhInternas: p.hh ?? null,
      evidencia: p.evidencia ?? null,
    }),
  }))

  const huerfanas = lineas.filter((l) => !l.genealogy.partida)
  if (huerfanas.length) throw new Error(`${huerfanas.length} línea(s) de la oferta no dicen de qué partida salieron: una oferta con líneas huérfanas no se puede defender`)

  return Object.freeze({
    numero, cliente,
    emitidaDesdeVersion: congelada.version,
    huella: congelada.huella?.sha256 ?? null,
    lineas: Object.freeze(lineas),
    total: totalOfertado,
    iva: redondear(congelada.cascada.iva),
    totalConIva: redondear(congelada.cascada.ventaFinal),
    validezDias,
    estado: ESTADO.VALIDADO,
  })
}

/**
 * LA OFERTA COMO LA VE EL CLIENTE. PURA.
 *
 * Es una PROYECCIÓN, no una mutación: la oferta original queda con toda su genealogía. Ésta es la
 * que se serializa a un PDF o a un mail.
 */
export function paraElCliente(oferta) {
  return Object.freeze({
    numero: oferta.numero, cliente: oferta.cliente, validezDias: oferta.validezDias,
    lineas: Object.freeze(oferta.lineas.map((l) => Object.freeze({
      orden: l.orden, rubro: l.rubro, descripcion: l.descripcion,
      unidad: l.unidad, cantidad: l.cantidad, precio: l.precio,
    }))),
    total: oferta.total, iva: oferta.iva, totalConIva: oferta.totalConIva,
  })
}

/** ¿Esta salida al cliente filtra algo que no debería? PURA. El gate del §25, ejecutable.
 *  Se prueba sobre el JSON serializado y no sobre las llaves de primer nivel: una genealogía
 *  colgada tres niveles adentro se serializa igual y se lee igual. */
export const CAMPOS_INTERNOS = Object.freeze(['costoInterno', 'hhInternas', 'genealogy', 'coeficienteSinIva', 'margenSobrePrecioPct', 'beneficio', 'costoDirecto', 'huella'])

export function fugaEnLaSalida(salida) {
  const texto = JSON.stringify(salida ?? {})
  const encontrados = CAMPOS_INTERNOS.filter((c) => texto.includes(`"${c}"`))
  return { limpia: encontrados.length === 0, filtrados: encontrados }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA REVISIÓN (§26)
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * UNA REVISIÓN CONTRA UNA OFERTA YA EMITIDA. PURA — no toca `congelada` ni `oferta`.
 *
 * Devuelve las DOS vistas, separadas y con nombres que no se confunden. Y devuelve el PUENTE:
 * cuánto de la diferencia es más obra y cuánto es que los precios cambiaron. Sin ese puente, las
 * dos vistas juntas siguen sin contestar la pregunta que importa.
 */
export function revisar({ congelada, partidasNuevas = [], costoDirectoNuevo = null, politicaHoy = null, huellaHoy = null } = {}) {
  if (!congelada || congelada.esBorrador !== false) throw new Error('una revisión se hace CONTRA una versión congelada')

  // ── VISTA A · el alcance nuevo, a los precios y la política de la OFERTA ORIGINAL
  const costoAlcanceNuevo = partidasNuevas.reduce((a, p) => (p.subtotalAPreciosDeLaOferta === null || p.subtotalAPreciosDeLaOferta === undefined ? a : a + Number(p.subtotalAPreciosDeLaOferta)), 0)
  const faltanValorizar = partidasNuevas.filter((p) => p.subtotalAPreciosDeLaOferta === null || p.subtotalAPreciosDeLaOferta === undefined)
  const vistaA = faltanValorizar.length
    ? Object.freeze({ nombre: 'IMPACTO DE ALCANCE', valor: null, estado: ESTADO.FALTA_DATO, porQue: `${faltanValorizar.length} partida(s) nueva(s) no se pudieron valorizar a los precios de la oferta`, base: 'precios y política de la oferta original' })
    : Object.freeze({
      nombre: 'IMPACTO DE ALCANCE',
      valor: redondear(cascada({ costoDirecto: costoAlcanceNuevo, politica: congelada.cascada.politica }).ventaSinIva),
      costoDirecto: redondear(costoAlcanceNuevo),
      estado: ESTADO.CALCULADO,
      base: 'precios y política de la oferta original',
      porQue: 'lo que hay que cobrar por el trabajo AGREGADO, sin mezclar la variación de precios',
    })

  // ── VISTA B · la obra de hoy a los precios de hoy
  const c = cascada({ costoDirecto: costoDirectoNuevo, politica: politicaHoy ?? congelada.cascada.politica })
  const vistaB = Object.freeze({
    nombre: 'VALOR ACTUAL',
    valor: c.ventaSinIva,
    costoDirecto: c.costoDirecto,
    estado: c.estado,
    base: politicaHoy ? 'precios y política de hoy' : 'precios de hoy, política de la oferta',
    porQue: c.porQue ?? 'cuánto vale la obra completa hoy',
  })

  // ── EL PUENTE. No es una tercera vista: es la descomposición de la diferencia.
  const puente = (vistaB.valor !== null && congelada.cascada.ventaSinIva !== null && vistaA.valor !== null)
    ? Object.freeze({
      diferenciaTotal: redondear(vistaB.valor - congelada.cascada.ventaSinIva),
      porMasObra: vistaA.valor,
      porVariacionDePrecios: redondear(vistaB.valor - congelada.cascada.ventaSinIva - vistaA.valor),
      porQue: 'cobrarle al cliente la variación de precios como si fuera más obra es lo que rompe una relación comercial',
    })
    : null

  return Object.freeze({
    // ═══ REVISION ≠ MUTACIÓN: la versión ofertada sale IGUAL a como entró ═══
    versionOfertada: congelada,
    ofertaAlterada: false,
    vistaA, vistaB, puente,
    queCambio: huellaHoy ? diferenciaDeHuellas(congelada.huella, huellaHoy) : null,
    partidasNuevas: Object.freeze([...partidasNuevas]),
  })
}
