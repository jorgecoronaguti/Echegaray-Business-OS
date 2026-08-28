// LA PRÁCTICA DE COTIZACIÓN DE ECSAS — «así se viene haciendo», que no es «así se debe hacer».
//
// ═══ LA DISTINCIÓN QUE GOBIERNA TODO ESTE ARCHIVO ═══
//
// El dueño lo dijo con todas las letras: «tenés que aprender cómo se han estado haciendo las
// cotizaciones, lo que no significa que estén en lo correcto». Entonces lo que sale de acá es una
// DESCRIPCIÓN de la costumbre, con cuántas cotizaciones la sostienen y cuánto varía — nunca una
// regla. Por eso todo entra `EXPERIENCIA_ECSAS` + `CANDIDATO`, y jamás `NORMA` ni `BASE_MAESTRA`.
//
// ═══ UNA VEZ NO ES UNA PRÁCTICA ═══
//
// La escala del repo —A observación aislada · B recurrencia · C patrón probable · D conocimiento
// interno validado— es la misma que usa `promocion.mjs`, y se reusa entera en vez de inventar otra.
// Una práctica que aparece en UNA cotización sale igual, pero sale marcada A: negarla sería perder
// el dato, y promoverla sería fabricar una regla con un caso.
//
// ═══ NADA SE PROMEDIA SIN DECIR CUÁNTOS Y CUÁNTO VARÍAN ═══
//
// Cada práctica numérica lleva su `estadistica` completa (n, media, mín, máx, desvío, dispersión).
// Un coeficiente que va de 0,006 a 0,04 entre cotizaciones no tiene media útil: tiene un problema, y
// eso lo dice la dispersión, no el promedio.
import { ESTADO, PROCEDENCIA, conocimiento } from './biblioteca.mjs'
import { candidato, estadistica, madurezDe } from './promocion.mjs'

/** La confianza que se declara según la madurez de la muestra. Una práctica vista una vez no puede
 *  declararse ALTA por más que el número sea preciso. PURA. */
export const CONFIANZA_POR_MADUREZ = Object.freeze({ A: 'BAJA', B: 'BAJA', C: 'MEDIA', D: 'ALTA', E: 'ALTA' })

/** Lo que se le agrega a toda práctica para que nadie la lea como una regla. */
export const ADVERTENCIA = 'práctica observada en cotizaciones internas de ECSAS: describe cómo se viene cotizando, NO que sea correcto'

const slug = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60)

/** Una práctica observada, con sus casos y su madurez. PURA. */
export function practica({ clave, afirmacion, casos = [], unidad = null, valorTextual = null }) {
  const valores = casos.map((c) => c.valor).filter((v) => typeof v === 'number' && Number.isFinite(v))
  const obras = [...new Set(casos.map((c) => String(c.obra ?? c.cotizacion)))]
  const est = estadistica(valores)
  const madurez = madurezDe({ n: casos.length, obrasDistintas: obras.length, dispersion: est.dispersion })
  return {
    clave, afirmacion, unidad, valorTextual,
    casos, obras, obrasDistintas: obras.length,
    estadistica: est, madurez,
    confianza: CONFIANZA_POR_MADUREZ[madurez] ?? 'BAJA',
  }
}

/** Qué hojas trae la plantilla, y en cuántas cotizaciones aparece cada una. PURA. */
export function practicasDePlantilla(cotizaciones = []) {
  const porHoja = new Map()
  for (const c of cotizaciones) {
    for (const h of c.pestanas ?? []) {
      if (!porHoja.has(h)) porHoja.set(h, [])
      porHoja.get(h).push({ cotizacion: c.id, obra: c.obra, valor: 1, cita: `pestaña «${h}»`, ubicacion: `${c.nombre} · pestaña ${h}` })
    }
  }
  const total = cotizaciones.length
  return [...porHoja.entries()]
    .filter(([, casos]) => casos.length >= 2)
    .map(([hoja, casos]) => practica({
      clave: `cotizacion.plantilla.hoja.${slug(hoja)}`,
      afirmacion: `la plantilla de cotización interna de ECSAS trae la pestaña «${hoja}» en ${casos.length} de ${total} cotizaciones estudiadas`,
      casos, valorTextual: hoja,
    }))
}

/** Lo que la oferta le muestra al cliente: alícuota de IVA aplicada, forma de pago y notas. PURA. */
export function practicasDeOferta(cotizaciones = []) {
  const salida = []
  const iva = []
  const pago = []
  const notas = []
  for (const c of cotizaciones) {
    const o = c.oferta
    if (!o?.ok) continue
    const sub = o.subtotal?.valor
    const im = o.iva?.valor
    if (typeof sub === 'number' && sub !== 0 && typeof im === 'number') {
      iva.push({ cotizacion: c.id, obra: c.obra, valor: Math.round((im / sub) * 10000) / 10000, cita: `SUB TOTAL ${sub} · IVA ${im}`, ubicacion: `${c.nombre} · hoja OFERTA · ${o.subtotal.celda} y ${o.iva.celda}` })
    }
    if (o.formaDePago?.texto) pago.push({ cotizacion: c.id, obra: c.obra, valor: null, cita: o.formaDePago.texto, ubicacion: `${c.nombre} · hoja OFERTA · ${o.formaDePago.celda}` })
    for (const n of o.notas ?? []) notas.push({ cotizacion: c.id, obra: c.obra, valor: null, cita: n.texto, ubicacion: `${c.nombre} · hoja OFERTA · ${n.celda}` })
  }
  if (iva.length) {
    salida.push(practica({
      clave: 'cotizacion.oferta.iva.alicuota',
      afirmacion: `ECSAS le agrega el IVA al subtotal de la oferta: la alícuota que resulta de dividir IVA sobre SUB TOTAL da ${estadistica(iva.map((x) => x.valor)).media} en ${iva.length} cotizaciones`,
      casos: iva, unidad: 'fracción',
    }))
  }
  if (pago.length) {
    salida.push(practica({
      clave: 'cotizacion.oferta.forma_de_pago',
      afirmacion: `ECSAS escribe la forma de pago como una línea de texto libre al pie de la oferta, no como un campo: ${pago.length} cotizaciones la traen`,
      casos: pago, valorTextual: pago.map((p) => p.cita).join(' | ').slice(0, 400),
    }))
  }
  if (notas.length) {
    salida.push(practica({
      clave: 'cotizacion.oferta.alcance_por_notas',
      afirmacion: `ECSAS declara el alcance y las exclusiones de la oferta en notas de prosa numeradas al pie ("Nota 1", "Nota 2"…), no en una lista estructurada: ${notas.length} notas en ${new Set(notas.map((n) => n.cotizacion)).size} cotizaciones`,
      casos: notas,
    }))
  }
  return salida
}

/** Los RUBROS con los que ECSAS parte una obra, y en cuántas cotizaciones aparece cada uno. PURA. */
export function practicasDeRubro(cotizaciones = []) {
  const por = new Map()
  for (const c of cotizaciones) {
    for (const r of c.presupuesto?.rubros ?? []) {
      const k = slug(r.nombre)
      if (!k) continue
      if (!por.has(k)) por.set(k, { nombre: r.nombre, casos: [] })
      por.get(k).casos.push({ cotizacion: c.id, obra: c.obra, valor: null, cita: `rubro «${r.nombre}»`, ubicacion: `${c.nombre} · hoja Presupuesto · ${r.celda}` })
    }
  }
  return [...por.entries()].filter(([, v]) => v.casos.length >= 2).map(([k, v]) => practica({
    clave: `cotizacion.rubro.${k}`,
    afirmacion: `ECSAS agrupa el presupuesto bajo el rubro «${v.nombre}» en ${v.casos.length} cotizaciones`,
    casos: v.casos, valorTextual: v.nombre,
  }))
}

/** Qué columnas ve el cliente en la oferta. Es el contrato visual de ECSAS con quien compra. PURA. */
export function practicaDeColumnasDeOferta(cotizaciones = []) {
  const casos = []
  for (const c of cotizaciones) {
    const cols = Object.keys(c.oferta?.encabezado?.columnas ?? {})
    if (!cols.length) continue
    casos.push({ cotizacion: c.id, obra: c.obra, valor: null, cita: cols.join(' · '), ubicacion: `${c.nombre} · hoja OFERTA · fila ${c.oferta.encabezado.fila + 1}` })
  }
  if (!casos.length) return []
  const formas = [...new Set(casos.map((x) => x.cita))]
  return [practica({
    clave: 'cotizacion.oferta.columnas',
    afirmacion: formas.length === 1
      ? `la oferta que ve el cliente tiene siempre las mismas columnas: ${formas[0]}`
      : `la oferta que ve el cliente tiene ${formas.length} juegos de columnas distintos entre cotizaciones: ${formas.join(' || ')}`,
    casos, valorTextual: formas.join(' || '),
  })]
}

/** El rótulo del hito de GG que arma el precio, y en qué columna vive cada parte del beneficio. */
const HITOS_DE_PRECIO = Object.freeze([
  { clave: 'cotizacion.precio.beneficio', rotulo: 'BENEFICIO', partes: ['neto', 'ingresos_brutos', 'total'] },
])

/** El beneficio y los gastos generales: los coeficientes con los que se arma el precio. PURA. */
export function practicasDePrecio(cotizaciones = []) {
  const salida = []
  for (const { clave, rotulo, partes } of HITOS_DE_PRECIO) {
    partes.forEach((parte, i) => {
      const casos = []
      for (const c of cotizaciones) {
        const hito = c.gg?.hitos?.[rotulo]
        const v = hito?.valores?.[i]
        if (!hito || !v || typeof v.valor !== 'number') continue
        casos.push({ cotizacion: c.id, obra: c.obra, valor: v.valor, cita: `${rotulo} · ${parte} = ${v.valor}`, ubicacion: `${c.nombre} · hoja GG · ${v.celda}` })
      }
      if (!casos.length) return
      const est = estadistica(casos.map((x) => x.valor))
      salida.push(practica({
        clave: `${clave}.${parte}`,
        afirmacion: `ECSAS aplica ${parte.replace('_', ' ')} del beneficio = ${est.media} (mín ${est.min}, máx ${est.max}) en ${casos.length} cotizaciones`,
        casos, unidad: 'fracción',
      }))
    })
  }
  return [...salida, ...practicasDeIndirectos(cotizaciones)]
}

/** Cada concepto de gastos generales con el coeficiente que se le aplicó, cotización por cotización. */
export function practicasDeIndirectos(cotizaciones = []) {
  const porConcepto = new Map()
  for (const c of cotizaciones) {
    for (const x of c.gg?.conceptos ?? []) {
      if (typeof x.aplicado !== 'number') continue
      const k = slug(x.concepto)
      if (!k) continue
      if (!porConcepto.has(k)) porConcepto.set(k, { rotulo: x.concepto, casos: [] })
      porConcepto.get(k).casos.push({ cotizacion: c.id, obra: c.obra, valor: x.aplicado, cita: `${x.concepto} → coeficiente ${x.aplicado}`, ubicacion: `${c.nombre} · hoja GG · ${x.celdaCoeficiente}` })
    }
  }
  return [...porConcepto.entries()]
    .filter(([, v]) => v.casos.length >= 2)
    .map(([k, v]) => {
      const est = estadistica(v.casos.map((x) => x.valor))
      return practica({
        clave: `cotizacion.indirectos.${k}`,
        afirmacion: `ECSAS aplica «${v.rotulo}» con coeficiente ${est.media} en promedio sobre ${v.casos.length} cotizaciones (mín ${est.min}, máx ${est.max}, dispersión ${est.dispersion ?? 'sin calcular'})`,
        casos: v.casos, unidad: 'fracción',
      })
    })
}

/** Los códigos de partida que se USARON para cotizar. El catálogo entero viaja copiado en todas las
 *  planillas; lo que dice cómo cotiza ECSAS es lo que efectivamente entró al presupuesto. PURA. */
export function codigosUsados(cotizacion) {
  return new Set((cotizacion.presupuesto?.items ?? []).map((i) => i.codigo).filter(Boolean))
}

/**
 * LA UNIDAD Y EL RENDIMIENTO CON LOS QUE SE COTIZA CADA PARTIDA USADA.
 *
 * Sólo salen las partidas usadas en DOS o más cotizaciones. Con una sola no hay práctica que
 * describir: hay un caso, y un caso ya está en el archivo del que salió.
 */
export function practicasDePartida(cotizaciones = [], { minimoCotizaciones = 2 } = {}) {
  const porCodigo = new Map()
  for (const c of cotizaciones) {
    const usados = codigosUsados(c)
    for (const p of c.analisis?.partidas ?? []) {
      if (!usados.has(p.codigo)) continue
      if (!porCodigo.has(p.codigo)) porCodigo.set(p.codigo, [])
      porCodigo.get(p.codigo).push({ cotizacion: c, partida: p })
    }
  }
  const salida = []
  for (const [codigo, apariciones] of porCodigo) {
    if (apariciones.length < minimoCotizaciones) continue
    const desc = apariciones[0].partida.descripcion
    salida.push(...practicasDeUnCodigo(codigo, desc, apariciones))
  }
  return salida
}

/** Las tres prácticas de un código: con qué unidad se mide y cuántas horas se le cargan. PURA. */
function practicasDeUnCodigo(codigo, descripcion, apariciones) {
  const caso = (a, valor, cita) => ({ cotizacion: a.cotizacion.id, obra: a.cotizacion.obra, valor, cita, ubicacion: `${a.cotizacion.nombre} · hoja Análisis · ${a.partida.celda}` })
  const unidades = apariciones.filter((a) => a.partida.unidad).map((a) => caso(a, null, `${codigo} «${a.partida.descripcion}» se mide en ${a.partida.unidad}`))
  const distintas = [...new Set(apariciones.map((a) => a.partida.unidad).filter(Boolean))]
  const salida = []
  if (unidades.length) {
    salida.push(practica({
      clave: `cotizacion.partida.${slug(codigo)}.unidad`,
      afirmacion: distintas.length === 1
        ? `ECSAS mide «${descripcion}» (${codigo}) en ${distintas[0]} en las ${unidades.length} cotizaciones donde la usó`
        : `ECSAS midió «${descripcion}» (${codigo}) con ${distintas.length} unidades distintas entre cotizaciones: ${distintas.join(', ')}`,
      casos: unidades, valorTextual: distintas.join('|'),
    }))
  }
  for (const [campo, etiqueta] of [['oficialHPorUnidad', 'oficial'], ['ayudanteHPorUnidad', 'ayudante']]) {
    const casos = apariciones.filter((a) => typeof a.partida[campo] === 'number').map((a) => caso(a, a.partida[campo], `${codigo} · ${etiqueta} ${a.partida[campo]} h por ${a.partida.unidad ?? 'unidad'}`))
    if (casos.length < 2) continue
    const est = estadistica(casos.map((x) => x.valor))
    salida.push(practica({
      clave: `cotizacion.partida.${slug(codigo)}.${etiqueta}_h_por_unidad`,
      afirmacion: `ECSAS le carga a «${descripcion}» (${codigo}) ${est.media} h de ${etiqueta} por ${distintas[0] ?? 'unidad'} (mín ${est.min}, máx ${est.max}) en ${casos.length} cotizaciones`,
      casos, unidad: `h/${distintas[0] ?? 'unidad'}`,
    }))
  }
  return salida
}

/** TODAS las prácticas, de una carpeta de cotizaciones. PURA. */
export function practicas(cotizaciones = [], opciones = {}) {
  return [
    ...practicasDePlantilla(cotizaciones),
    ...practicasDeOferta(cotizaciones),
    ...practicaDeColumnasDeOferta(cotizaciones),
    ...practicasDeRubro(cotizaciones),
    ...practicasDePrecio(cotizaciones),
    ...practicasDePartida(cotizaciones, opciones),
  ]
}

/**
 * DE PRÁCTICA A CONOCIMIENTO DE BIBLIOTECA.
 *
 * Todo sale `EXPERIENCIA_ECSAS` + `CANDIDATO`, con la advertencia en `condicion` y con la cita
 * textual del primer caso más el recuento de los demás. `incorporar()` reconstruye cada entrada con
 * `conocimiento()`, así que lo que no pase el constructor no llega al disco.
 */
export function aConocimientos(lista = [], { fecha = null } = {}) {
  return lista.map((p) => conocimiento({
    clave: p.clave,
    afirmacion: p.afirmacion,
    procedencia: PROCEDENCIA.EXPERIENCIA_ECSAS,
    estado: ESTADO.CANDIDATO,
    valor: p.estadistica.n ? p.estadistica.media : p.valorTextual,
    unidad: p.unidad,
    condicion: ADVERTENCIA,
    confianza: p.confianza,
    area: 'practica-de-cotizacion',
    fecha,
    evidencia: {
      textoLiteral: p.casos[0]?.cita ?? p.valorTextual ?? p.afirmacion,
      ubicacion: p.casos[0]?.ubicacion ?? null,
      casos: p.casos.length,
      obras: p.obras,
      madurez: p.madurez,
      estadistica: p.estadistica,
      citas: p.casos.slice(0, 8).map((c) => ({ cita: c.cita, ubicacion: c.ubicacion })),
    },
  }))
}

export { candidato }
