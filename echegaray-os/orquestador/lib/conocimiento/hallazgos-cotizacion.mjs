// LO QUE ESTÁ MAL EN LAS COTIZACIONES — el producto que es para el dueño, no para el motor.
//
// ═══ POR QUÉ VIVE SEPARADO DE LA PRÁCTICA ═══
//
// `practica-cotizacion.mjs` contesta «¿cómo cotizamos esto normalmente?». Este archivo contesta otra
// cosa: «¿dónde se está perdiendo plata?». Mezclarlos haría que el motor de cotización consulte una
// biblioteca donde conviven la costumbre y su defecto, y termine repitiendo el defecto porque es lo
// que más se repite.
//
// ═══ SIN CITA NO ES UN HALLAZGO ═══
//
// Cada uno lleva archivo, hoja y CELDA. Un «los coeficientes son inconsistentes» sin celda no se
// puede verificar ni corregir: es una opinión con tono de auditoría.
//
// ═══ CADA REGLA TIENE QUE PODER DAR ROJO ═══
//
// Todas las de acá se disparan con datos reales de la carpeta y todas tienen un test que construye
// la entrada por la ruta de producción. Una regla que nunca encontró nada no está probando que todo
// esté bien: está probando que no sabe mirar.
import { DISPERSION_MAXIMA, estadistica } from './promocion.mjs'
import { porcentajeDelRotulo } from './cotizacion-ecsas.mjs'

export const GRAVEDAD = Object.freeze({ ALTA: 'ALTA', MEDIA: 'MEDIA', BAJA: 'BAJA' })

export const TIPO = Object.freeze({
  OFERTA_ROTA: 'OFERTA_ROTA',
  IVA_ESCRITO_A_MANO: 'IVA_ESCRITO_A_MANO',
  SUBTOTAL_NO_CIERRA: 'SUBTOTAL_NO_CIERRA',
  TOTAL_NO_CIERRA: 'TOTAL_NO_CIERRA',
  ROTULO_CONTRADICE_COEFICIENTE: 'ROTULO_CONTRADICE_COEFICIENTE',
  COEFICIENTE_INESTABLE: 'COEFICIENTE_INESTABLE',
  UNIDAD_CONTRADICTORIA: 'UNIDAD_CONTRADICTORIA',
  PARTIDA_SIN_DATOS: 'PARTIDA_SIN_DATOS',
  DATOS_DE_OTRO_CLIENTE: 'DATOS_DE_OTRO_CLIENTE',
  INDIRECTO_SIEMPRE_EN_CERO: 'INDIRECTO_SIEMPRE_EN_CERO',
  COEFICIENTE_AJUSTE_SIN_CRITERIO: 'COEFICIENTE_AJUSTE_SIN_CRITERIO',
  COEFICIENTE_AJUSTE_IMPLAUSIBLE: 'COEFICIENTE_AJUSTE_IMPLAUSIBLE',
  REFERENCIA_ROTA: 'REFERENCIA_ROTA',
})

/** Cuánto puede desviarse una suma y seguir siendo redondeo. Un peso sobre millones es redondeo;
 *  más que eso es otro número. */
export const TOLERANCIA_PESOS = 1

/** Cuánto puede desviarse una alícuota calculada y seguir siendo la misma. */
export const TOLERANCIA_FRACCION = 0.0005

/** La alícuota general de IVA que la plantilla aplica en todas las ofertas medidas. Está acá para
 *  poder decir CUÁNTO se desvía un IVA tipeado, no para afirmar qué alícuota corresponde. */
export const ALICUOTA_IVA = 0.21

/** Hasta dónde un «coeficiente de ajuste» se puede leer como un multiplicador de riesgo o de plazo.
 *  Arriba de 3 o abajo de 0,5 ya no ajusta un precio: lo reemplaza, y lo más probable es que sea una
 *  cantidad tipeada en la columna equivocada. Medido: hay valores de 15 y de 1015. */
export const AJUSTE_PLAUSIBLE = Object.freeze({ min: 0.5, max: 3 })

/**
 * UN HALLAZGO. `monto` es EL DINERO EN JUEGO, no el dinero perdido — y la diferencia no es retórica:
 * el monto de una oferta rota es lo que esa oferta vale, y el de un rótulo que contradice su
 * coeficiente es la diferencia entre lo que dice y lo que aplica. Sumarlos daría un número que se
 * lee como una pérdida y no lo es. Por eso el resumen los agrupa POR TIPO y no los suma todos.
 */
const hallazgo = ({ tipo, gravedad, clave, afirmacion, evidencia = [], monto = null, porQue = null }) =>
  ({ tipo, gravedad, clave, afirmacion, evidencia, monto, porQue })

const suma = (xs) => xs.reduce((a, x) => a + x, 0)

/** La oferta cuyo cierre está en error: no tiene subtotal, ni IVA, ni total. PURA. */
export function ofertasRotas(cotizaciones = []) {
  const salida = []
  for (const c of cotizaciones) {
    const o = c.oferta
    if (!o?.ok) continue
    const rotas = ['subtotal', 'iva', 'total'].filter((k) => o[k]?.error)
    if (!rotas.length) continue
    const deberia = suma((o.items ?? []).map((i) => i.subtotal ?? (i.cantidad ?? 0) * i.precioUnitario).filter(Number.isFinite))
    salida.push(hallazgo({
      tipo: TIPO.OFERTA_ROTA, gravedad: GRAVEDAD.ALTA, clave: `${c.id}.oferta`,
      afirmacion: `la oferta de «${c.obra}» tiene el cierre en error de fórmula (${rotas.map((k) => `${k}: ${o[k].error}`).join(', ')}): el documento que ve el cliente no dice cuánto sale la obra`,
      monto: deberia || null,
      evidencia: rotas.map((k) => ({ cita: `${k.toUpperCase()} = ${o[k].error}`, ubicacion: `${c.nombre} · hoja OFERTA · ${o[k].celda}` })),
      porQue: `la suma de los ${o.items.length} ítems da ${deberia}, y ese número no aparece en ninguna parte de la oferta`,
    }))
  }
  return salida
}

/** El IVA escrito a mano al lado de un subtotal roto. PURA. */
export function ivaEscritoAMano(cotizaciones = []) {
  const salida = []
  for (const c of cotizaciones) {
    const o = c.oferta
    const celda = o?.iva?.celda
    if (!o?.ok || !celda || typeof o.iva.valor !== 'number') continue
    const formulas = c.formulas?.OFERTA ?? {}
    if (formulas[celda]) continue
    salida.push(hallazgo({
      tipo: TIPO.IVA_ESCRITO_A_MANO, gravedad: GRAVEDAD.ALTA, clave: `${c.id}.oferta.iva`,
      afirmacion: `el IVA de la oferta de «${c.obra}» es un número escrito a mano (${o.iva.valor}), no una fórmula sobre el subtotal`,
      monto: typeof o.subtotal?.valor === 'number' ? Math.abs(o.iva.valor - o.subtotal.valor * ALICUOTA_IVA) : o.iva.valor,
      evidencia: [{ cita: `IVA = ${o.iva.valor} sin fórmula`, ubicacion: `${c.nombre} · hoja OFERTA · ${celda}` }],
      porQue: o.subtotal?.error ? `y el SUB TOTAL de arriba está en ${o.subtotal.error}: el impuesto se tipeó al lado del error` : 'un impuesto tipeado no se recalcula cuando cambia el presupuesto',
    }))
  }
  return salida
}

/** La aritmética que no cierra adentro de una misma oferta. PURA. */
export function aritmeticaQueNoCierra(cotizaciones = []) {
  const salida = []
  for (const c of cotizaciones) {
    const o = c.oferta
    if (!o?.ok) continue
    const items = (o.items ?? []).map((i) => i.subtotal).filter((x) => typeof x === 'number')
    const sub = o.subtotal?.valor
    if (typeof sub === 'number' && items.length && Math.abs(suma(items) - sub) > TOLERANCIA_PESOS) {
      salida.push(hallazgo({
        tipo: TIPO.SUBTOTAL_NO_CIERRA, gravedad: GRAVEDAD.ALTA, clave: `${c.id}.oferta.subtotal`,
        afirmacion: `el SUB TOTAL de «${c.obra}» dice ${sub} y la suma de sus ${items.length} ítems da ${suma(items)}`,
        monto: Math.abs(suma(items) - sub),
        evidencia: [{ cita: `SUB TOTAL = ${sub}`, ubicacion: `${c.nombre} · hoja OFERTA · ${o.subtotal.celda}` }],
      }))
    }
    const iva = o.iva?.valor
    const total = o.total?.valor
    if (typeof sub === 'number' && typeof iva === 'number' && typeof total === 'number' && Math.abs(sub + iva - total) > TOLERANCIA_PESOS) {
      salida.push(hallazgo({
        tipo: TIPO.TOTAL_NO_CIERRA, gravedad: GRAVEDAD.ALTA, clave: `${c.id}.oferta.total`,
        afirmacion: `en «${c.obra}» el TOTAL (${total}) no es SUB TOTAL (${sub}) más IVA (${iva})`,
        monto: Math.abs(sub + iva - total),
        evidencia: [{ cita: `TOTAL = ${total}`, ubicacion: `${c.nombre} · hoja OFERTA · ${o.total.celda}` }],
      }))
    }
  }
  return salida
}

/**
 * EL RÓTULO PROMETE UN PORCENTAJE Y LA PLANILLA APLICA OTRO.
 *
 * «Libreria (0,15 % de CD)» con coeficiente 0,01 no es un redondeo: es 6,7 veces lo que el rótulo
 * dice, y nadie lo va a ver leyendo la planilla porque el rótulo es lo único que se lee.
 */
export function rotuloContradiceCoeficiente(cotizaciones = []) {
  const salida = []
  for (const c of cotizaciones) {
    const cd = c.gg?.hitos?.['COSTOS DIRECTOS (SIN IVA)']?.valores?.[0]?.valor ?? null
    for (const x of c.gg?.conceptos ?? []) {
      const prometido = x.prometidoPorElRotulo
      if (prometido === null || typeof x.aplicado !== 'number') continue
      if (Math.abs(prometido - x.aplicado) <= TOLERANCIA_FRACCION) continue
      salida.push(hallazgo({
        tipo: TIPO.ROTULO_CONTRADICE_COEFICIENTE, gravedad: GRAVEDAD.MEDIA,
        clave: `${c.id}.gg.${x.celdaRotulo}`,
        afirmacion: `en «${c.obra}» el rótulo «${x.concepto}» promete ${(prometido * 100).toFixed(2)}% y la planilla aplica ${(x.aplicado * 100).toFixed(2)}%`,
        monto: cd === null ? null : Math.abs(x.aplicado - prometido) * cd,
        evidencia: [
          { cita: x.concepto, ubicacion: `${c.nombre} · hoja GG · ${x.celdaRotulo}` },
          { cita: `coeficiente aplicado = ${x.aplicado}`, ubicacion: `${c.nombre} · hoja GG · ${x.celdaCoeficiente}` },
        ],
      }))
    }
  }
  return salida
}

/**
 * EL MISMO CONCEPTO CON COEFICIENTES MUY DISTINTOS ENTRE COTIZACIONES.
 *
 * Sólo mira los conceptos cuyo RÓTULO declara un porcentaje. En el bloque «Gastos Comunes de obra»
 * la misma columna guarda una CANTIDAD —meses de baño químico, raciones de comida—, y sin este
 * filtro el control denunciaba que «BAÑO QUIMICO se aplicó con coeficientes de 0,13 a 7,27»: dos
 * obras de distinta duración, no una inconsistencia. Un hallazgo falso gasta la credibilidad de los
 * verdaderos.
 */
export function coeficientesInestables(cotizaciones = []) {
  const por = new Map()
  for (const c of cotizaciones) {
    for (const x of c.gg?.conceptos ?? []) {
      if (typeof x.aplicado !== 'number' || x.prometidoPorElRotulo === null) continue
      const k = x.concepto
      if (!por.has(k)) por.set(k, [])
      por.get(k).push({ c, x })
    }
  }
  const salida = []
  for (const [concepto, casos] of por) {
    if (casos.length < 3) continue
    const est = estadistica(casos.map((y) => y.x.aplicado))
    if (est.dispersion === null || est.dispersion <= DISPERSION_MAXIMA) continue
    salida.push(hallazgo({
      tipo: TIPO.COEFICIENTE_INESTABLE, gravedad: GRAVEDAD.MEDIA, clave: `gg.${concepto}`,
      afirmacion: `«${concepto}» se aplicó con coeficientes de ${est.min} a ${est.max} en ${casos.length} cotizaciones (dispersión ${est.dispersion}) sin que el rótulo cambie`,
      evidencia: casos.map((y) => ({ cita: `coeficiente ${y.x.aplicado}`, ubicacion: `${y.c.nombre} · hoja GG · ${y.x.celdaCoeficiente}` })),
    }))
  }
  return salida
}

/** La misma partida medida con unidades distintas en cotizaciones distintas. PURA. */
export function unidadesContradictorias(cotizaciones = []) {
  const por = new Map()
  for (const c of cotizaciones) {
    const usados = new Set((c.presupuesto?.items ?? []).map((i) => i.codigo).filter(Boolean))
    for (const p of c.analisis?.partidas ?? []) {
      if (!usados.has(p.codigo) || !p.unidad) continue
      if (!por.has(p.codigo)) por.set(p.codigo, [])
      por.get(p.codigo).push({ c, p })
    }
  }
  const salida = []
  for (const [codigo, casos] of por) {
    const unidades = [...new Set(casos.map((y) => y.p.unidad))]
    if (unidades.length < 2) continue
    salida.push(hallazgo({
      tipo: TIPO.UNIDAD_CONTRADICTORIA, gravedad: GRAVEDAD.ALTA, clave: `partida.${codigo}.unidad`,
      afirmacion: `la partida ${codigo} «${casos[0].p.descripcion}» se midió en ${unidades.join(' y en ')} según la cotización: el mismo código no significa lo mismo en dos presupuestos`,
      evidencia: casos.map((y) => ({ cita: `${codigo} en ${y.p.unidad}`, ubicacion: `${y.c.nombre} · hoja Análisis · ${y.p.celda}` })),
    }))
  }
  return salida
}

/** Las filas «sin datos» que quedan en el presupuesto interno. PURA. */
export function partidasSinDatos(cotizaciones = []) {
  const salida = []
  for (const c of cotizaciones) {
    const vacias = (c.presupuesto?.items ?? []).filter((i) => /^SIN DATOS$/i.test(String(i.tarea ?? '').trim()))
    if (!vacias.length) continue
    salida.push(hallazgo({
      tipo: TIPO.PARTIDA_SIN_DATOS, gravedad: GRAVEDAD.BAJA, clave: `${c.id}.presupuesto.sin_datos`,
      afirmacion: `el presupuesto interno de «${c.obra}» tiene ${vacias.length} renglones «sin datos» que viajan con la planilla y ocupan lugar en la estructura del cómputo`,
      evidencia: vacias.slice(0, 5).map((v) => ({ cita: 'sin datos', ubicacion: `${c.nombre} · hoja Presupuesto · fila ${v.fila + 1}` })),
    }))
  }
  return salida
}

/** Ofertas de OTROS clientes guardadas en la misma hoja del archivo que se manda. PURA. */
export function datosDeOtroCliente(cotizaciones = []) {
  return cotizaciones.filter((c) => (c.oferta?.bloquesAjenos ?? 0) > 0).map((c) => hallazgo({
    tipo: TIPO.DATOS_DE_OTRO_CLIENTE, gravedad: GRAVEDAD.ALTA, clave: `${c.id}.oferta.bloques`,
    afirmacion: `la hoja OFERTA de «${c.obra}» guarda ${c.oferta.bloquesAjenos} bloque(s) de oferta a otros clientes en las columnas de al lado, con su nombre, su dirección y sus precios`,
    evidencia: [{ cita: `${c.oferta.bloquesAjenos} bloques a la derecha del que se cotiza`, ubicacion: `${c.nombre} · hoja OFERTA` }],
    porQue: 'la planilla se copia de la anterior en vez de partir de una limpia, y el archivo conserva lo que se le cotizó a otro',
  }))
}

/** Los conceptos de gastos generales que se listan siempre y se cotizan siempre en cero. PURA. */
export function indirectosSiempreEnCero(cotizaciones = [], { minimo = 5 } = {}) {
  const por = new Map()
  for (const c of cotizaciones) {
    for (const x of c.gg?.conceptos ?? []) {
      if (typeof x.importe !== 'number') continue
      if (!por.has(x.concepto)) por.set(x.concepto, { ceros: [], total: 0 })
      const e = por.get(x.concepto)
      e.total += 1
      if (x.importe === 0) e.ceros.push({ c, x })
    }
  }
  // Van en UN hallazgo y no en treinta: treinta renglones de gravedad media tapan los dos de
  // gravedad alta, y lo que el dueño tiene que ver es la LISTA, no treinta veces la misma frase.
  const siempreCero = [...por.entries()].filter(([, e]) => e.total >= minimo && e.ceros.length === e.total)
  if (!siempreCero.length) return []
  return [hallazgo({
    tipo: TIPO.INDIRECTO_SIEMPRE_EN_CERO, gravedad: GRAVEDAD.MEDIA, clave: 'gg.siempre_en_cero',
    afirmacion: `${siempreCero.length} conceptos de gastos generales aparecen en todas las cotizaciones y se cotizan en $ 0 en todas: o no se necesitan nunca, o se están regalando`,
    evidencia: siempreCero.map(([concepto, e]) => ({ cita: `${concepto} = 0 en ${e.total} cotizaciones`, ubicacion: `${e.ceros[0].c.nombre} · hoja GG · ${e.ceros[0].x.celdaImporte}` })),
  })]
}

/**
 * EL MULTIPLICADOR QUE NO DICE POR QUÉ.
 *
 * La columna «COEF. AJUSTE» del presupuesto interno vale 1 en casi todas las partidas. Donde no vale
 * 1, el precio de esa partida sale multiplicado sin que nada explique por cuánto ni por qué. Medido
 * en JAVIER SANCHEZ · Entrepiso: ESCALERA METALICA lleva 1,5 y ENTREPISO 1,4 — las DOS partidas
 * metálicas de la cotización, y las únicas ajustadas. Eso no es un error de tipeo: es que el
 * análisis de las partidas metálicas se sabe corto y se lo tapa con un multiplicador.
 */
export function coeficienteDeAjusteSinCriterio(cotizaciones = []) {
  const salida = []
  const plausible = (v) => v >= AJUSTE_PLAUSIBLE.min && v <= AJUSTE_PLAUSIBLE.max
  for (const c of cotizaciones) {
    const ajustadas = (c.presupuesto?.items ?? []).filter((i) => typeof i.coeficienteAjuste === 'number' && i.coeficienteAjuste !== 1 && i.coeficienteAjuste !== 0 && i.codigo)
    if (!ajustadas.length) continue
    const cita = (i) => ({ cita: `${i.codigo} «${i.tarea}» × ${i.coeficienteAjuste}`, ubicacion: `${c.nombre} · hoja Presupuesto · fila ${i.fila + 1}` })
    const multiplicadores = ajustadas.filter((i) => plausible(i.coeficienteAjuste))
    const disparatados = ajustadas.filter((i) => !plausible(i.coeficienteAjuste))
    if (multiplicadores.length) {
      // La plata acá SÍ se puede calcular: es la parte del precio que aporta el multiplicador.
      const monto = suma(multiplicadores.map((i) => (typeof i.subtotal === 'number' ? i.subtotal - i.subtotal / i.coeficienteAjuste : 0)))
      salida.push(hallazgo({
        tipo: TIPO.COEFICIENTE_AJUSTE_SIN_CRITERIO, gravedad: GRAVEDAD.MEDIA, clave: `${c.id}.presupuesto.coeficientes`,
        afirmacion: `en «${c.obra}» ${multiplicadores.length} partida(s) llevan un coeficiente de ajuste distinto de 1 (${multiplicadores.map((i) => `${i.codigo}: ${i.coeficienteAjuste}`).join(', ')}) y la planilla no dice por qué`,
        monto: monto || null,
        evidencia: multiplicadores.map(cita),
        porQue: 'el multiplicador entra al precio y no queda registrado como decisión: dentro de un año nadie va a poder decir si fue riesgo, plazo o un análisis que se sabía corto',
      }))
    }
    if (disparatados.length) {
      // Y acá NO se calcula. Un «coeficiente» de 1015 multiplicado por el subtotal daría una cifra
      // que se lee como plata y no lo es: lo que hay es una columna usada para otra cosa.
      salida.push(hallazgo({
        tipo: TIPO.COEFICIENTE_AJUSTE_IMPLAUSIBLE, gravedad: GRAVEDAD.ALTA, clave: `${c.id}.presupuesto.coeficientes_implausibles`,
        afirmacion: `en «${c.obra}» ${disparatados.length} partida(s) tienen en la columna COEF. AJUSTE un valor que no se puede leer como multiplicador (${disparatados.map((i) => `${i.codigo}: ${i.coeficienteAjuste}`).join(', ')})`,
        monto: null,
        evidencia: disparatados.map(cita),
        porQue: `fuera del rango ${AJUSTE_PLAUSIBLE.min}–${AJUSTE_PLAUSIBLE.max} lo más probable es que sea una cantidad tipeada en la columna equivocada; el precio de esa partida sale multiplicado por ese número igual`,
      }))
    }
  }
  return salida
}

/** Referencias rotas que quedaron dentro del presupuesto interno. PURA. */
export function referenciasRotas(cotizaciones = []) {
  const salida = []
  for (const c of cotizaciones) {
    const rotas = (c.presupuesto?.items ?? []).filter((i) => /^#(REF!|N\/A|VALUE!|NAME\?|DIV\/0!)$/.test(String(i.tarea ?? '').trim()))
    if (!rotas.length) continue
    salida.push(hallazgo({
      tipo: TIPO.REFERENCIA_ROTA, gravedad: GRAVEDAD.MEDIA, clave: `${c.id}.presupuesto.referencias`,
      afirmacion: `el presupuesto interno de «${c.obra}» arrastra ${rotas.length} fila(s) con la referencia rota (${[...new Set(rotas.map((r) => r.tarea))].join(', ')})`,
      evidencia: rotas.map((r) => ({ cita: String(r.tarea), ubicacion: `${c.nombre} · hoja Presupuesto · fila ${r.fila + 1}` })),
    }))
  }
  return salida
}

/** TODOS los hallazgos, ordenados por gravedad y por plata. PURA. */
export function hallazgos(cotizaciones = [], opciones = {}) {
  const orden = { ALTA: 0, MEDIA: 1, BAJA: 2 }
  return [
    ...ofertasRotas(cotizaciones),
    ...ivaEscritoAMano(cotizaciones),
    ...aritmeticaQueNoCierra(cotizaciones),
    ...rotuloContradiceCoeficiente(cotizaciones),
    ...coeficientesInestables(cotizaciones),
    ...unidadesContradictorias(cotizaciones),
    ...partidasSinDatos(cotizaciones),
    ...datosDeOtroCliente(cotizaciones),
    ...indirectosSiempreEnCero(cotizaciones, opciones),
    ...coeficienteDeAjusteSinCriterio(cotizaciones),
    ...referenciasRotas(cotizaciones),
  ].sort((a, b) => orden[a.gravedad] - orden[b.gravedad] || (b.monto ?? 0) - (a.monto ?? 0) || a.clave.localeCompare(b.clave))
}

/** El resumen por tipo, para el informe. PURA. */
export function resumen(lista = []) {
  const porTipo = {}
  const porGravedad = {}
  const montoPorTipo = {}
  for (const h of lista) {
    porTipo[h.tipo] = (porTipo[h.tipo] ?? 0) + 1
    porGravedad[h.gravedad] = (porGravedad[h.gravedad] ?? 0) + 1
    if (typeof h.monto === 'number') montoPorTipo[h.tipo] = Math.round(((montoPorTipo[h.tipo] ?? 0) + h.monto) * 100) / 100
  }
  return { total: lista.length, porTipo, porGravedad, montoPorTipo }
}

export { porcentajeDelRotulo }
