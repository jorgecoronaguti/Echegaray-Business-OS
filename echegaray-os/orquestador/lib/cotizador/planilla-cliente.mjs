// LA GRILLA LA IMPONE EL CLIENTE. Puro, determinístico, sin modelo y sin red.
//
// ═══ POR QUÉ EXISTE ═══
//
// Quattropani entra por PLANOS: se mide el DWG y de ahí salen los elementos. ARCOR no manda planos:
// manda SU PLANILLA —«ARSJ Planilla de cotización - …»— con las partidas ya escritas, la unidad ya
// elegida y la cantidad ya computada. Medido sobre el corpus real: de los 57 documentos de ARCOR,
// 49 son planillas y 8 son Word; **ninguno necesita un modelo para abrirse**.
//
// `conocimiento/planilla-semantica.mjs` ya sabe leer esa grilla venga en la fila 6 o en la 7 y con
// las columnas donde estén. Lo que faltaba es el PUENTE: convertir sus ítems en los cómputos que
// `plano/seleccion.mjs` espera, para que la partida la siga decidiendo el código.
//
// ═══ LA REGLA QUE GOBIERNA TODO ESTE ARCHIVO ═══
//
// **Una fila que no se pudo leer entera NO se convierte en cómputo: se convierte en hueco.** Un
// cómputo sin unidad no tiene con qué filtrar candidatos y uno sin cantidad no tiene qué multiplicar.
// Dejarlos pasar con `null` los manda al motor como partidas fantasma que salen $ 0 y engordan el
// conteo de «mapeadas» sin cotizar nada.
//
// ═══ LOS TRES DEFECTOS QUE ESTE ARCHIVO ATRAPA, MEDIDOS EN ARCOR ═══
//
// 1. **El ítem 1.10 que Excel guardó como 1.1.** En «ARSJ Planilla de computo - Filtro Sanitario
//    ESTRUCTURAS METALICAS - FINAL FINAL.xlsx» la columna ÍTEM es NUMÉRICA: el décimo ítem del rubro
//    1 se escribió `1.10` y quedó guardado como el número `1.1`, que ya lo usaba el primero. Dos
//    filas distintas con la misma etiqueta: cualquier cosa que agrupe por ítem las pisa.
// 2. **Ese mismo ítem 1.10 no tiene unidad ni cantidad**, así que `clasificarFila` —que distingue
//    rubro de ítem justamente por la unidad— lo lee como RUBRO y desaparece del cómputo. La planilla
//    tiene 2 rubros y el lector cuenta 3. Un ítem perdido no es un ítem cotizado en $ 0: es una
//    partida que el cliente pidió y que la oferta no menciona.
// 3. **Una fila sin número de ítem.** En «PEDIDO DE COTIZACION.xlsx» la demolición de muro (6 m²)
//    viene sin código. Se computa igual —la cantidad está— pero sin etiqueta no se la puede citar en
//    la respuesta al cliente, y eso se declara.
//
// Ninguno de los tres se corrige acá inventando el dato que falta. Los tres se DECLARAN.

import { issue, TIPO_ISSUE, SEVERIDAD } from './contrato.mjs'

/** El id de un cómputo nacido de una planilla. Lleva hoja y fila porque la cita es el producto:
 *  «lo dice tu planilla, pestaña X, fila 19» es lo que se le contesta al cliente. PURA. */
export const idDeItem = ({ item, hoja, fila }) =>
  `ARSJ-${item ?? 's/n'}-${String(hoja ?? 'h').replace(/\s+/g, '_')}-f${fila}`

/** Un ítem cuya etiqueta tiene parte decimal es un ítem, no un rubro: en la grilla ARSJ el rubro se
 *  numera `1` y el ítem `1.4`. Sirve para reconocer los que perdieron su unidad. PURA. */
export const pareceItem = (etiqueta) => /^\d+[.,]\d/.test(String(etiqueta ?? '').trim())

/**
 * LAS FILAS QUE EL LECTOR CONTÓ COMO RUBRO Y NO LO SON. PURA.
 *
 * `clasificarFila` decide por la UNIDAD, y esa decisión es correcta: la numeración se rompe con las
 * fórmulas y la unidad la escribe una persona. Pero cuando el que falta ES la unidad, un ítem cae
 * del lado equivocado. Acá no se cambia esa regla —se la usa al revés— para nombrar exactamente lo
 * que quedó afuera, con su fila.
 */
export function itemsPerdidosEnRubros(rubros = []) {
  return rubros.filter((r) => pareceItem(r?.item)).map((r) => ({
    item: String(r.item), hoja: r.hoja ?? null, fila: r.fila,
    descripcion: String(r.titulo ?? ''),
    porQue: 'la fila tiene descripción pero no tiene unidad ni cantidad, así que se leyó como rubro: es una partida que el cliente pidió y que el cómputo no tiene',
  }))
}

/** Las etiquetas de ítem que aparecen más de una vez, con todas sus filas. PURA. */
export function itemsRepetidos(filas = []) {
  const porEtiqueta = new Map()
  for (const f of filas) {
    if (f.item === null || f.item === undefined || f.item === '') continue
    const k = String(f.item)
    porEtiqueta.set(k, [...(porEtiqueta.get(k) ?? []), f])
  }
  return [...porEtiqueta.entries()].filter(([, v]) => v.length > 1)
    .map(([item, v]) => ({ item, filas: v.map((x) => x.fila), descripciones: v.map((x) => String(x.descripcion ?? x.titulo ?? '').slice(0, 90)) }))
}

/**
 * UN ÍTEM DE LA GRILLA → UN CÓMPUTO DE `plano/seleccion.mjs`. PURA.
 *
 * El `nombre` es la descripción ENTERA del cliente y no un resumen: el selector puntúa por
 * vocabulario y por atributos técnicos (sección, espesor, material), y todos viven en el párrafo
 * largo —«perfil sección 100x100x2,50mm»—. Recortarlo a las primeras palabras le saca al código
 * justo lo que necesita para decidir sin modelo.
 *
 * El precio que el cliente (o una oferta anterior) dejó en la fila NO entra al cómputo. Viaja
 * aparte, en `precioEnLaPlanilla`, y sólo sirve para comparar contra lo que da nuestro costo. Si
 * entrara acá, el motor estaría cotizando con el número de la planilla y llamando a eso «su» precio.
 */
export function computoDeItem(item, { hoja = null, documento = null } = {}) {
  return {
    id: idDeItem({ item: item.item, hoja: item.hoja ?? hoja, fila: item.fila }),
    nombre: String(item.descripcion ?? ''),
    unidad: item.unidad,
    sistema: null,
    cantidad: { valor: item.cantidad, fuente: 'DATO_REAL' },
    material: null,
    especificacion: null,
    evidencia: {
      documento, hoja: item.hoja ?? hoja, fila: item.fila,
      textoLiteral: String(item.descripcion ?? ''),
      rubro: item.rubro ?? null,
    },
    // Referencia, nunca insumo del costo.
    precioEnLaPlanilla: {
      material: item.material ?? null, manoDeObra: item.manoDeObra ?? null,
      unitario: item.precioUnitario ?? null, importe: item.importe ?? null,
    },
  }
}

/** Por qué una fila con descripción no puede ser un cómputo. PURA. Devuelve `null` si sí puede. */
export function porQueNoEsComputo(item) {
  const sinUnidad = !item?.unidad
  const sinCantidad = item?.cantidad === null || item?.cantidad === undefined
  if (sinUnidad && sinCantidad) return 'la fila no trae ni unidad ni cantidad'
  if (sinUnidad) return `la fila trae cantidad (${item.cantidad}) y no trae unidad: sin unidad no hay ninguna partida de la Base Maestra con la que compararla`
  if (sinCantidad) return `la fila trae unidad (${item.unidad}) y no trae cantidad${item.sinCantidad ? ` — ${item.sinCantidad}` : ''}`
  return null
}

/**
 * LA PLANILLA DEL CLIENTE, CONVERTIDA EN CÓMPUTOS Y EN HUECOS. PURA.
 *
 * `lectura` es lo que devuelve `leerLibro()` de `conocimiento/planilla-semantica.mjs`. Que la
 * entrada sea esa lectura y no el archivo es lo que mantiene UNA sola definición de «qué es un ítem
 * de cotización» para Excel, para una tabla de Word y para lo que venga después.
 *
 * Devuelve SIEMPRE la misma forma, incluso cuando la planilla no se pudo leer.
 */
export function computosDePlanilla(lectura, { documento = null } = {}) {
  if (!lectura?.ok) {
    return {
      ok: false, computos: [], huecos: [], conflictos: [],
      porQue: lectura?.porQue ?? 'no se pudo leer la planilla',
      resumen: { items: 0, computos: 0, sinUnidad: 0, sinCantidad: 0, perdidos: 0, repetidos: 0, sinEtiqueta: 0 },
    }
  }
  const items = lectura.items ?? []
  const computos = []
  const huecos = []
  for (const it of items) {
    const porQue = porQueNoEsComputo(it)
    if (porQue) { huecos.push({ tipo: 'ITEM_SIN_COMPUTO', item: it.item ?? null, hoja: it.hoja, fila: it.fila, descripcion: it.descripcion, importe: it.importe ?? null, porQue }); continue }
    computos.push(computoDeItem(it, { hoja: lectura.hoja, documento }))
  }
  const perdidos = itemsPerdidosEnRubros(lectura.rubros)
  for (const p of perdidos) huecos.push({ tipo: 'ITEM_LEIDO_COMO_RUBRO', importe: null, ...p })
  for (const s of items.filter((i) => !i.item)) {
    huecos.push({
      tipo: 'ITEM_SIN_ETIQUETA', item: null, hoja: s.hoja, fila: s.fila, descripcion: s.descripcion, importe: s.importe ?? null,
      porQue: 'la fila no tiene número de ítem: se computa, pero no se la puede citar por su código en la respuesta al cliente',
    })
  }
  const repetidos = itemsRepetidos([...items, ...perdidos])
  return {
    ok: true, computos, huecos, hoja: lectura.hoja ?? null,
    conflictos: repetidos.map(conflictoDeEtiqueta),
    porQue: `${computos.length} cómputo(s) de ${items.length} ítem(s) · ${huecos.length} hueco(s) · ${repetidos.length} conflicto(s)`,
    resumen: {
      items: items.length, computos: computos.length,
      sinUnidad: items.filter((i) => !i.unidad).length,
      sinCantidad: items.filter((i) => i.cantidad === null || i.cantidad === undefined).length,
      perdidos: perdidos.length, repetidos: repetidos.length,
      sinEtiqueta: items.filter((i) => !i.item).length,
    },
  }
}

/** Una etiqueta repetida, dicha como se le dice a una persona. PURA. */
const conflictoDeEtiqueta = (r) => ({
  tipo: 'ITEM_REPETIDO', item: r.item, filas: r.filas, descripciones: r.descripciones,
  porQue: `la etiqueta «${r.item}» aparece en las filas ${r.filas.join(' y ')}: en una columna numérica el ítem 1.10 se guarda como 1.1 y choca con el primero. Dos filas con la misma etiqueta se pisan al agrupar`,
})

/** Cuánta plata de la planilla del cliente queda fuera del cómputo. PURA. `null` cuando la fila
 *  perdida tampoco trae importe: no saber cuánto vale un hueco no lo vuelve inofensivo, pero
 *  escribir 0 lo manda al fondo de la cola, que es donde no tiene que estar. */
export const plataDelHueco = (h) => (typeof h?.importe === 'number' && Number.isFinite(h.importe) && h.importe !== 0 ? h.importe : null)

/**
 * LOS HUECOS Y CONFLICTOS DE LA PLANILLA, COMO ISSUES DE LA COLA. PURA.
 *
 * Un ítem que el cliente pidió y el cómputo no tiene es ALTA, no MEDIA: la oferta sale incompleta y
 * el cliente lo va a ver al comparar contra su propia planilla. Una etiqueta repetida es CONFLICTO
 * BLOQUEANTE porque no lo cierra el sistema — lo cierra quien tenga el archivo original.
 */
export function issuesDePlanilla(resultado, { documento = null } = {}) {
  const donde = (h) => `${documento ? `${documento} · ` : ''}${h.hoja ?? 'hoja'} f${h.fila}`
  const deHueco = (h) => issue({
    type: TIPO_ISSUE.FALTA_DATO,
    severity: h.tipo === 'ITEM_SIN_ETIQUETA' ? SEVERIDAD.BAJA : SEVERIDAD.ALTA,
    entity: `planilla:${h.item ?? 's/n'}@${donde(h)}`,
    impact: plataDelHueco(h),
    evidence: { documento, hoja: h.hoja, fila: h.fila, textoLiteral: String(h.descripcion ?? '').slice(0, 300) },
    detalle: h.porQue,
    recommended_action: 'evidence_query',
  })
  const deConflicto = (c) => issue({
    type: TIPO_ISSUE.CONFLICTO, severity: SEVERIDAD.BLOQUEANTE,
    entity: `planilla:item-repetido:${c.item}`,
    evidence: { documento, filas: c.filas, descripciones: c.descripciones },
    detalle: c.porQue,
    // No hay botón que arregle una etiqueta que el archivo original ya trae repetida.
    recommended_action: null,
  })
  return [...(resultado?.huecos ?? []).map(deHueco), ...(resultado?.conflictos ?? []).map(deConflicto)]
}
