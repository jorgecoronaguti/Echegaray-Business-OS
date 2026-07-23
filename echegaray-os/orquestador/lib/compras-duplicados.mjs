// UN COMPROBANTE CARGADO DOS VECES EN "Compras" — Y CÓMO DISTINGUIRLO DE UNA FACTURA PARTIDA.
//
// ═══ POR QUÉ EXISTE (23/07) ═══
//
// Al cargar un fajo de comprobantes aparecieron 21 grupos de filas que comparten proveedor y N° de
// comprobante. Cada grupo es una de dos cosas, y la diferencia vale plata:
//
//   · una FACTURA PARTIDA a propósito: una sola factura repartida en varios renglones porque el
//     gasto se imputa a dos obras, dos rubros o dos vehículos. Está bien y hay que decirlo.
//   · un DOBLE CONTEO: la misma factura cargada dos veces. Infla el costo de la obra, infla el
//     crédito fiscal de IVA y le debe de más al proveedor.
//
// Mirando sólo el Sheet las dos se ven IGUAL. El árbitro es ARCA: el comprobante fiscal tiene UN
// importe. Si las filas del Sheet SUMAN ese importe, es una factura partida. Si lo SUPERAN, hay
// doble conteo y el exceso es exactamente la plata de más.
//
// Este archivo NO borra nada: `Compras` es carga manual del dueño. Marca y cuantifica; decide él.
//
// ═══ EL PRECEDENTE QUE OBLIGA A HACERLO BIEN ═══
//
// Esta empresa ya se comió contar dos veces: las notas de crédito de ARCA se sumaban como compras
// ($41,9M de error, $7,2M de IVA sin declarar) y había $19,1M de facturas ANULADAS cargadas como
// compras. Por eso acá el signo del comprobante NO se asume: se pregunta a `comprobante-arca.mjs`,
// que ya es la única definición de "esto suma o resta" en todo el OS.
//
// ═══ LO QUE NO SE PUEDE AFIRMAR ═══
//
// `comprobantes_arca` está sincronizado hasta una fecha de corte. Para un comprobante POSTERIOR a
// ese corte, "no está en ARCA" no prueba absolutamente nada — y decir "duplicado" ahí sería
// inventar. El veredicto en ese caso es `no_concluyente`, con la señal que lo hizo sospechoso a la
// vista, para que un humano mire el papel. Prometer más sería precisión falsa.

import { signo } from './comprobante-arca.mjs'

/** Tolerancia en pesos: dos importes que difieren menos que esto son el mismo importe.
 *  Un centavo de diferencia entre el Sheet y ARCA es redondeo, no un hallazgo. */
export const TOLERANCIA = 1

/** Encabezado de la columna que el OS agrega a Compras. Se mapea POR NOMBRE, nunca por letra. */
export const COL_MARCA = '¿Comprobante repetido? (OS)'

/** Minúsculas, sin acentos, espacios colapsados. Misma normalización que el resto del OS. */
export function normalizar(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * NÚCLEO PURO: la clave canónica de un comprobante, "puntoVenta-numero" sin ceros a la izquierda.
 *
 * ES LA MISMA REGLA QUE `public.norm_comprobante` EN LA BASE, y existe acá para que el JS y el SQL
 * no tengan dos versiones de lo mismo. ARCA guarda el punto de venta y el número por separado y sin
 * relleno ("8", "333"); el Sheet los escribe juntos y rellenados ("0008-0000333").
 *
 * @param {string} pv punto de venta (o el string completo del Sheet, si `nro` viene vacío)
 * @param {string} [nro]
 * @returns {string} '' si no hay con qué formar la clave
 */
export function claveComprobante(pv, nro) {
  let a = String(pv ?? '').trim()
  let b = String(nro ?? '').trim()
  if (!b && a.includes('-')) { const i = a.indexOf('-'); b = a.slice(i + 1); a = a.slice(0, i) }
  const limpio = (s) => String(s).replace(/\D/g, '').replace(/^0+/, '')
  const A = limpio(a); const B = limpio(b)
  if (!A && !B) return ''
  return `${A}-${B}`
}

/** NÚCLEO PURO: la identidad de una fila de Compras a los efectos de "esto ya está cargado". */
export function claveFila(f) {
  const c = claveComprobante(f?.numero)
  return c ? `${normalizar(f?.proveedor)}|${c}` : ''
}

/**
 * NÚCLEO PURO: agrupa las filas de Compras que comparten proveedor + N° de comprobante.
 * Las filas SIN número quedan afuera: sin número no hay identidad, y agrupar por importe sería
 * inventar duplicados donde puede haber dos compras iguales de verdad.
 *
 * @param {Array<{fila:number, proveedor:string, numero:string, total:number, neto:number, iva:number, obra:string}>} filas
 * @returns {Array<{clave:string, proveedor:string, numero:string, filas:number[], total:number, neto:number, iva:number, items:object[]}>}
 */
export function agrupar(filas = []) {
  const g = new Map()
  for (const f of filas) {
    const k = claveFila(f)
    if (!k) continue
    if (!g.has(k)) g.set(k, [])
    g.get(k).push(f)
  }
  const suma = (l, campo) => l.reduce((s, x) => s + (Number(x[campo]) || 0), 0)
  return [...g.entries()]
    .filter(([, l]) => l.length > 1)
    .map(([clave, l]) => ({
      clave,
      proveedor: l[0].proveedor,
      numero: l[0].numero,
      filas: l.map((x) => x.fila),
      total: suma(l, 'total'),
      neto: suma(l, 'neto'),
      iva: suma(l, 'iva'),
      items: l,
    }))
    .sort((a, b) => a.filas[0] - b.filas[0])
}

/**
 * NÚCLEO PURO: el veredicto de UN grupo contra su comprobante de ARCA.
 *
 * ═══ CONTRA QUÉ IMPORTE SE COMPARA, Y POR QUÉ NO CONTRA EL TOTAL ═══
 *
 * La tentación es comparar la suma del Sheet contra `imp_total` de ARCA. Está MAL y produce
 * acusaciones falsas: `imp_total` incluye conceptos que la pestaña Compras no carga nunca —el ITC
 * de los combustibles, percepciones de IVA e Ingresos Brutos—. Medido sobre los datos reales, esa
 * comparación declaraba "carga incompleta" en dos grupos (Barcelo 103-3024 por $13.506,97 y
 * SIDERAGRO 7-892 por $111.242,31) cuyo Importe y cuyo IVA coinciden con ARCA AL CENTAVO.
 *
 * Por eso se compara contra lo que el Sheet efectivamente carga: **neto gravado + IVA**. La
 * diferencia contra `imp_total` no se esconde: se informa aparte como "otros conceptos del
 * comprobante", que es lo que realmente es.
 *
 * Para un comprobante sin IVA discriminado (Factura C, tipo 11) no hay neto gravado con qué
 * comparar: ahí sí manda `imp_total`.
 *
 * @param {object} grupo salida de `agrupar`
 * @param {object|null} arca fila de comprobantes_arca ({imp_total, neto_gravado, total_iva, tipo_comprobante})
 * @param {{corteArca?:string}} [opts] fecha (YYYY-MM-DD) hasta la que ARCA está sincronizado
 *
 * Veredictos posibles:
 *   `factura_partida`     las filas suman EXACTAMENTE el comprobante → está bien.
 *   `doble_conteo`        superan al comprobante y el exceso es una fila entera.
 *   `exceso_sin_explicar` superan al comprobante y el exceso no coincide con ninguna fila.
 *   `carga_incompleta`    suman MENOS que el comprobante: falta cargar, no sobra.
 *   `no_concluyente`      ARCA no puede opinar (no está / posterior al corte / no es una compra).
 */
export function veredicto(grupo, arca, { corteArca } = {}) {
  const senales = senalesDe(grupo)
  const base = { exceso: 0, excesoIva: 0, filaSobrante: null, candidatas: [], otrosConceptos: 0, senales }

  if (!arca) {
    const posterior = corteArca && grupo.items.some((i) => (i.fechaISO || '') > corteArca)
    return {
      ...base,
      veredicto: 'no_concluyente',
      motivo: posterior
        ? `el comprobante es posterior al corte de ARCA (${corteArca}): "no está en ARCA" no prueba nada`
        : 'el comprobante no aparece en ARCA: no hay árbitro fiscal para este grupo',
    }
  }
  // Una nota de crédito RESTA. Compararla como si sumara es el error de $41,9M de julio.
  if (signo(arca.tipo_comprobante) !== 1) {
    return { ...base, veredicto: 'no_concluyente', motivo: `el comprobante de ARCA es tipo ${arca.tipo_comprobante} (no suma como compra): hay que mirarlo a mano` }
  }

  const arcaNeto = round2(arca.neto_gravado)
  const arcaIva = round2(arca.total_iva)
  const arcaTotal = round2(arca.imp_total)
  // Con IVA discriminado se compara neto contra neto; sin él (Factura C), total contra total.
  const conNeto = arcaNeto > 0
  const sheetBase = conNeto ? round2(grupo.neto) : round2(grupo.total)
  const arcaBase = conNeto ? arcaNeto : arcaTotal
  const etiqueta = conNeto ? 'Importe (neto gravado)' : 'Total'
  const dif = round2(sheetBase - arcaBase)
  const difIva = conNeto ? round2(grupo.iva - arcaIva) : 0
  // Lo que el comprobante tiene y el Sheet no carga nunca: ITC, percepciones. No es un faltante.
  const otrosConceptos = conNeto ? round2(arcaTotal - arcaNeto - arcaIva) : 0

  if (Math.abs(dif) <= TOLERANCIA && Math.abs(difIva) <= TOLERANCIA) {
    return {
      ...base,
      otrosConceptos,
      veredicto: 'factura_partida',
      motivo: `las ${grupo.filas.length} filas suman $${fmt(sheetBase)} de ${etiqueta}${conNeto ? ` y $${fmt(grupo.iva)} de IVA` : ''}: exactamente el comprobante de ARCA`,
    }
  }
  if (dif < -TOLERANCIA) {
    return {
      ...base,
      otrosConceptos,
      exceso: dif,
      excesoIva: difIva,
      veredicto: 'carga_incompleta',
      motivo: `el Sheet carga $${fmt(-dif)} MENOS de ${etiqueta} que ARCA ($${fmt(arcaBase)}): falta cargar, no sobra`,
    }
  }

  // Sobra plata. ¿El exceso es exactamente una de las filas? Entonces esa fila está de más.
  //
  // Cuando DOS filas son idénticas, las dos "explican" el exceso y el OS no puede saber cuál es la
  // buena: se informan las dos y se señala la ÚLTIMA cargada como la sospechosa, porque el error
  // real observado es una recarga posterior de algo que ya estaba. No se borra ninguna: decide el dueño.
  const campo = conNeto ? 'neto' : 'total'
  const candidatas = grupo.items.filter((i) => Math.abs(round2(i[campo]) - dif) <= TOLERANCIA)
  const excesoIva = difIva > TOLERANCIA ? difIva : 0
  if (candidatas.length) {
    const sobrante = Math.max(...candidatas.map((c) => c.fila))
    return {
      ...base,
      otrosConceptos,
      veredicto: 'doble_conteo',
      exceso: dif,
      excesoIva,
      filaSobrante: sobrante,
      candidatas: candidatas.map((c) => c.fila),
      motivo: candidatas.length > 1
        ? `el Sheet suma $${fmt(dif)} de ${etiqueta} de más sobre ARCA ($${fmt(arcaBase)}); las filas ${candidatas.map((c) => c.fila).join(' y ')} son idénticas y sobra UNA — la última cargada es la ${sobrante}`
        : `el Sheet suma $${fmt(dif)} de ${etiqueta} de más sobre ARCA ($${fmt(arcaBase)}), y ese exceso es exactamente la fila ${sobrante}`,
    }
  }
  return {
    ...base,
    otrosConceptos,
    veredicto: 'exceso_sin_explicar',
    exceso: dif,
    excesoIva,
    motivo: `el Sheet suma $${fmt(dif)} de ${etiqueta} de más sobre ARCA ($${fmt(arcaBase)}) y el exceso no coincide con ninguna fila entera`,
  }
}

/**
 * NÚCLEO PURO: las señales que hacen sospechoso a un grupo SIN necesidad de ARCA.
 * No son veredictos — son lo que un humano tiene que mirar cuando el fisco no puede opinar.
 */
export function senalesDe(grupo) {
  const s = []
  const totales = grupo.items.map((i) => round2(Number(i.total) || 0))
  if (new Set(totales).size < totales.length) s.push('dos filas con el MISMO importe')
  const casi = totales.some((a, i) => totales.some((b, j) => j > i && a !== b && Math.abs(a - b) <= 1))
  if (casi) s.push('dos filas con importes que difieren en centavos (retipeo del mismo papel)')
  const ivas = grupo.items.map((i) => round2(Number(i.iva) || 0)).filter((v) => v > 0)
  if (ivas.length > 1 && new Set(ivas).size === 1) s.push('el MISMO IVA repetido en más de una fila')
  const obras = [...new Set(grupo.items.map((i) => String(i.obra ?? '').trim()).filter(Boolean))]
  if (obras.length > 1) s.push(`imputado a ${obras.length} destinos distintos (${obras.join(' · ')})`)
  // La columna Total es `=Importe+IVA`. Si no coincide, alguien pegó un número encima de la
  // fórmula — y el Cash Flow lee ESA columna, así que la plata que sale del cuadro es la pegada.
  for (const i of grupo.items) {
    const propio = round2((Number(i.neto) || 0) + (Number(i.iva) || 0))
    const t = round2(i.total)
    if (propio > 0 && Math.abs(t - propio) > TOLERANCIA) {
      s.push(`fila ${i.fila}: Total $${fmt(t)} ≠ Importe+IVA $${fmt(propio)} (fórmula pisada por un número pegado)`)
    }
  }
  return s
}

/**
 * NÚCLEO PURO: la fórmula viva que marca el repetido en la propia pestaña, de acá en adelante.
 *
 * Es una ARRAYFORMULA —no un número pegado— así que se mantiene sola cuando el dueño carga una fila
 * nueva. No afirma "duplicado": afirma "este N° ya está en otra fila", que es lo único que el Sheet
 * puede saber sin ARCA.
 *
 * es-AR: separador de argumentos `;`.
 */
export function formulaMarca({ prov = 'E', num = 'H', fila0 = 4 } = {}) {
  const P = `$${prov}$${fila0}:$${prov}`
  const N = `$${num}$${fila0}:$${num}`
  return `=ARRAYFORMULA(IF((${P}="")+(${N}="");"";IF(COUNTIFS(${P};${P};${N};${N})>1;"⚠ N° repetido";"")))`
}

/**
 * NÚCLEO PURO: ¿algún valor rompería a COUNTIFS en silencio?
 * COUNTIFS interpreta `*`, `?` y `~` como comodines: un proveedor llamado "X * Y" haría que la
 * fórmula devuelva un número MAL sin ningún error visible. Por eso se verifica antes de confiar.
 */
export function valoresQueRompenCountifs(filas = []) {
  return filas
    .filter((f) => /[*?~]/.test(String(f.proveedor ?? '')) || /[*?~]/.test(String(f.numero ?? '')))
    .map((f) => ({ fila: f.fila, proveedor: f.proveedor, numero: f.numero }))
}

/** NÚCLEO PURO: el resumen que va al informe y al control. */
export function resumen(veredictos = []) {
  const por = (v) => veredictos.filter((x) => x.veredicto === v)
  const suma = (l, c) => round2(l.reduce((s, x) => s + (Number(x[c]) || 0), 0))
  const dobles = por('doble_conteo')
  return {
    grupos: veredictos.length,
    partidas: por('factura_partida').length,
    dobleConteo: dobles.length,
    excesoSinExplicar: por('exceso_sin_explicar').length,
    cargaIncompleta: por('carga_incompleta').length,
    noConcluyentes: por('no_concluyente').length,
    plataDeMas: suma([...dobles, ...por('exceso_sin_explicar')], 'exceso'),
    ivaDeMas: suma([...dobles, ...por('exceso_sin_explicar')], 'excesoIva'),
    faltaCargar: round2(-suma(por("carga_incompleta"), "exceso")) || 0,
  }
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const fmt = (n) => Math.abs(round2(n)).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
