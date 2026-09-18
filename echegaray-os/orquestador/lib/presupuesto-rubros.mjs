// EL PRESUPUESTO DE CADA OBRA, ABIERTO EN LOS CUATRO RUBROS, LEÍDO DEL DOCUMENTO DE DRIVE.
//
// ═══ POR QUÉ (dueño, 18/09/2026) ═══
//
// «Lo que tenés que buscar en los presupuestos son materiales, mano de obra, subcontratistas y en
// otros si hay alquileres de maquinarias, servicios, etc. Y quiero que cada cosa quede aclarada
// diciendo qué contiene cada uno en detalle.» La carga del 17/09 (`presupuestos-cotizados.mjs`) dejó
// MO / CS / MA por obra: tres columnas de la plantilla, no los cuatro rubros, y sin el detalle.
//
// Este módulo es PURO: sin red, sin base. Recibe las tres hojas de una cotización interna (.xlsm) ya
// leídas y devuelve, por rubro, el monto y la lista de insumos que lo componen, con la celda de la que
// sale cada número. Lo baja de Drive y lo escribe `scripts/cargar-presupuesto-rubros.mjs`.
//
// ═══ LOS CUATRO RUBROS — la misma definición que `rubro_de_compra` en la base ═══
//
// La regla vive dos veces a propósito, una por lado del dato (documento / Compras), y esta constante
// es la que la pantalla muestra. Si una cambia, cambia la otra (test `presupuesto-rubros.test.mjs`).
import XLSX from 'xlsx'
import { clasificarTipo, esError, numero, texto } from './base-maestra-xlsm.mjs'

export const RUBROS = Object.freeze(['mano_obra', 'materiales', 'subcontratistas', 'otros'])

export const DEFINICION_RUBRO = Object.freeze({
  mano_obra: 'Jornales del personal propio con sus cargas sociales. En la cotización, las horas de oficial y ayudante y sus cargas; en el gasto, las quincenas liquidadas (recibo + parte en negro).',
  materiales: 'Lo que se compra y queda en la obra o se consume haciéndola: áridos, hierro, hormigón, chapa, madera, sanitarios, ferretería, EPP.',
  subcontratistas: 'Trabajo contratado a terceros: proveedores marcados «Subcontratista» en Compras; en la cotización, insumos cotizados por unidad de obra en vez de por hora.',
  otros: 'Alquiler y uso de equipos (propios o alquilados), combustible, fletes y traslados, servicios de obra (baño, contenedor, agua, bomba), honorarios y servicios.',
})

export const ROTULO_RUBRO = Object.freeze({
  mano_obra: 'Mano de obra', materiales: 'Materiales', subcontratistas: 'Subcontratistas', otros: 'Otros',
})

/**
 * EL RUBRO DE UN INSUMO DE LA COTIZACIÓN, con el motivo al lado.
 *
 * Arranca del clasificador de la Base Maestra (`clasificarTipo`: la unidad manda, después familia,
 * división y nombre) y lo lleva a los cuatro rubros:
 *   mano_obra / carga_social → mano_obra
 *   equipo (MAQUINA, ALQUILER) → otros        · también «MAQUINA PROPIA» y los nombres que declaran
 *                                                flete, viaje, transporte, servicio o plataforma
 *   material → materiales
 *   otro por subcontrato → subcontratistas
 *   otro sin evidencia → otros, marcado `sinEvidencia` para que se vea, nunca escondido en materiales.
 */
export function rubroDeRecurso({ unidad = null, familia = null, division = null, nombre = null } = {}) {
  const { tipo, porque } = clasificarTipo({ unidad, familia, division, nombre })
  const n = (nombre ?? '').toUpperCase()
  const f = (familia ?? '').trim().toUpperCase()
  const d = (division ?? '').trim().toUpperCase()
  const u = (unidad ?? '').trim().toLowerCase()
  if (tipo === 'mano_obra' || tipo === 'carga_social') return { rubro: 'mano_obra', porque }
  if (/\b(FLETE|VIAJE|TRANSPORTE|SERVICIO|ALQUILER|PLATAFORMA)\b/.test(n)) {
    return { rubro: 'otros', porque: 'el nombre declara flete, viaje, servicio, alquiler o plataforma' }
  }
  // COMBUSTIBLE VA A OTROS, como en Compras (`rubro_de_compra`: familia «Combustible de obra»): lo consume la
  // máquina, no queda en la obra. La Base Maestra lo llama material; acá manda la regla de los cuatro rubros.
  if (f === 'COMBUSTIBLE' || d === 'COMBUSTIBLE' || /\b(NAFTA|GAS ?OIL)\b/.test(n)) return { rubro: 'otros', porque: 'combustible: lo consume el equipo' }
  if (/DOLAR BCO NACION/.test(n)) return { rubro: 'otros', porque: 'línea de conversión a pesos de un equipo cotizado en dólares' }
  if (tipo === 'equipo' || f === 'MAQUINA PROPIA') return { rubro: 'otros', porque: tipo === 'equipo' ? porque : 'familia MAQUINA PROPIA: uso de equipo propio' }
  if (tipo === 'material') return { rubro: 'materiales', porque }
  if (/subcontrat/i.test(porque) || f === 'SUBCONTRATISTA' || f === 'CONTRATISTA') return { rubro: 'subcontratistas', porque }
  // SIN FAMILIA NI DIVISIÓN, la unidad de medida de un material (kg, m, m², m³, lt, un…) alcanza para
  // llamarlo material; se dice que fue por la unidad. Una unidad rara sigue sin evidencia.
  if (!f && !d && /^(kg|m|ml|m2|m3|lt|l|un|u|bolsa|batea|rollo|caja|gl|pza|par|juego)$/.test(u)) {
    return { rubro: 'materiales', porque: `por la unidad «${unidad}» (sin familia en Recursos)` }
  }
  return { rubro: 'otros', porque: `sin evidencia (${porque}): va a otros y se informa`, sinEvidencia: true }
}

// ═══ LAS HOJAS DE LA PLANTILLA (verificado en las 12 .xlsm del 18/09/2026) ═══
//
//   Presupuesto  fila 7 encabezado · ítems desde la 8 hasta «COSTO DIRECTO TOTAL» en C
//                A rótulo · B código de análisis (T####) · C tarea · D unidad · E cantidad · F costo
//                unitario (= Análisis!G de la tarea) · G coeficiente · H subtotal (E×F×G) ·
//                O MO · P MA · Q CS (las tres columnas que la plantilla suma por SUMIF)
//   Análisis     fila 5 encabezado · desde la 7: fila con A = tarea (código, C descripción, D unidad,
//                G costo por unidad); filas siguientes con B = insumo (C nombre, D unidad, E cantidad
//                por unidad de tarea, F costo, G total = E×F)
//   Recursos     fila 4 encabezado · desde la 5: A código · B insumo · C unidad · G familia · H división

export const ENCABEZADO_PRESUPUESTO = Object.freeze({ B: /^id$/i, C: /^tarea$/i, E: /^cant/i, G: /^coef/i, H: /^subtotal$/i })
// COSTO MO / MA / CS NO TIENEN LETRA FIJA: en la cotización están en O/P/Q; en la planilla de «Horas Hombre»
// (misma plantilla, sin las columnas de precio) están en J/K/L. Se buscan por su texto en la fila 7; si una
// no está, es un problema (no se lee a ciegas).
export const COSTOS_PRESUPUESTO = Object.freeze({ mo: /^costo mo$/i, ma: /^costo ma$/i, cs: /^costo cs$/i })
export const ENCABEZADO_ANALISIS = Object.freeze({ A: /^cod ?t$/i, B: /^cod ?r$/i, D: /^un$/i, E: /^cantidad$/i, G: /^total$/i })
export const ENCABEZADO_RECURSOS = Object.freeze({ A: /^codigo$/i, B: /^insumo$/i, C: /^unidad$/i, G: /^familia$/i, H: /^division$/i })

/** Una celda: su valor, o `{error}` si Excel la dejó en error. Nunca un número que no está. */
export function celda(ws, col, fila) {
  const c = ws?.[`${col}${fila}`]
  if (!c) return null
  if (c.t === 'e') return { error: c.w ?? '#ERROR' }
  return c.v ?? null
}

const ultimaFila = (ws) => (ws?.['!ref'] ? XLSX.utils.decode_range(ws['!ref']).e.r + 1 : 0)

/** El código de una tarea o de un insumo, normalizado igual en las tres hojas (`1.0` → `1`, `t1098` → `T1098`). */
export const codigoNorm = (x) => {
  const t = texto(x)
  if (t === null) return null
  return t.replace(/\.0+$/, '').toUpperCase()
}

/** La hoja por nombre sin acentos ni mayúsculas: «Análisis» y «Analisis» son la misma. */
export function hoja(wb, nombre) {
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
  const k = wb.SheetNames.find((s) => norm(s) === norm(nombre))
  return k ? wb.Sheets[k] : null
}

function verificar(ws, fila, esperado, nombre) {
  const problemas = []
  for (const [col, re] of Object.entries(esperado)) {
    const visto = texto(celda(ws, col, fila)) ?? ''
    if (!re.test(visto)) problemas.push(`${nombre}!${col}${fila} dice «${visto || '∅'}» y se esperaba ${re}`)
  }
  return problemas
}

/** `Recursos` → Map código → {nombre, unidad, familia, division}. */
export function leerRecursos(ws) {
  const problemas = verificar(ws, 4, ENCABEZADO_RECURSOS, 'Recursos')
  const recursos = new Map()
  for (let f = 5; f <= ultimaFila(ws); f++) {
    const cod = codigoNorm(celda(ws, 'A', f))
    if (cod === null) continue
    const r = { codigo: cod, nombre: texto(celda(ws, 'B', f)), unidad: texto(celda(ws, 'C', f)), familia: texto(celda(ws, 'G', f)), division: texto(celda(ws, 'H', f)), fila: f }
    recursos.set(cod, r)
    // UN INSUMO SIN CÓDIGO EN ANÁLISIS (fila tipeada a mano) se busca por nombre: es la única pista.
    if (r.nombre && !recursos.has(`nombre:${r.nombre.toUpperCase()}`)) recursos.set(`nombre:${r.nombre.toUpperCase()}`, r)
  }
  return { recursos, problemas }
}

/** `Análisis` → Map código de tarea → {descripcion, unidad, costoUnitario, insumos:[{codigo, nombre, unidad, cantidad, costo, total, fila}]}. */
export function leerAnalisis(ws) {
  const problemas = verificar(ws, 5, ENCABEZADO_ANALISIS, 'Análisis')
  const tareas = new Map()
  let actual = null
  for (let f = 7; f <= ultimaFila(ws); f++) {
    const codT = codigoNorm(celda(ws, 'A', f))
    const codR = codigoNorm(celda(ws, 'B', f))
    // LA CABECERA DE UNA TAREA TIENE A Y NO TIENE B. Una fila con A y B es un insumo con un rótulo al
    // lado («Correa», «0.1»): la trampa 4 de la Base Maestra. No se lee la nomenclatura T####: manda la
    // forma de la fila.
    if (codT !== null && codR === null) {
      actual = { codigo: codT, descripcion: texto(celda(ws, 'C', f)), unidad: texto(celda(ws, 'D', f)), costoUnitario: numero(celda(ws, 'G', f)), fila: f, insumos: [] }
      tareas.set(codT, actual)
      continue
    }
    if (!actual) continue
    // UN INSUMO SIN CÓDIGO (fila tipeada: nombre, unidad y total) también es un insumo: la plantilla lo
    // suma por SUMIF de la unidad, así que si no se lee acá el ítem no cierra.
    const nombre = texto(celda(ws, 'C', f))
    const unidad = texto(celda(ws, 'D', f))
    if (codR === null && !(nombre && (unidad || numero(celda(ws, 'G', f)) !== null))) continue
    const g = celda(ws, 'G', f)
    actual.insumos.push({
      codigo: codR, nombre, unidad,
      cantidad: numero(celda(ws, 'E', f)), costo: numero(celda(ws, 'F', f)), total: numero(g), enError: esError(g), fila: f,
    })
  }
  return { tareas, problemas }
}

/** `Presupuesto` → los ítems con cantidad y subtotal, hasta «COSTO DIRECTO TOTAL». `filas` acota. */
export function leerPresupuesto(ws, { filas = null } = {}) {
  const problemas = verificar(ws, 7, ENCABEZADO_PRESUPUESTO, 'Presupuesto')
  const col = {}
  const ancho = ws?.['!ref'] ? XLSX.utils.decode_range(ws['!ref']).e.c : 0
  for (const [k, re] of Object.entries(COSTOS_PRESUPUESTO)) {
    for (let c = 8; c <= ancho && !col[k]; c++) {
      const l = XLSX.utils.encode_col(c)
      if (re.test(texto(celda(ws, l, 7)) ?? '')) col[k] = l
    }
    if (!col[k]) problemas.push(`Presupuesto!fila 7 no tiene la columna «${re.source.replace(/[\^$]/g, '').toUpperCase()}»`)
  }
  const items = []
  let fin = null
  const [desde, hasta] = filas ?? [8, ultimaFila(ws)]
  for (let f = 8; f <= ultimaFila(ws); f++) {
    const c = texto(celda(ws, 'C', f)) ?? ''
    if (/^COSTO DIRECTO/i.test(c)) { fin = f; break }
    if (f < desde || f > hasta) continue
    const codigo = codigoNorm(celda(ws, 'B', f))
    const h = celda(ws, 'H', f)
    const subtotal = numero(h)
    if (codigo === null && !(subtotal > 0)) continue
    items.push({
      fila: f, rotulo: texto(celda(ws, 'A', f)), codigo, tarea: c || null, unidad: texto(celda(ws, 'D', f)),
      cantidad: numero(celda(ws, 'E', f)) ?? 0, costoUnitario: numero(celda(ws, 'F', f)), coef: numero(celda(ws, 'G', f)) ?? 1,
      subtotal: subtotal ?? 0, subtotalEnError: esError(h),
      mo: numero(celda(ws, col.mo, f)) ?? 0, ma: numero(celda(ws, col.ma, f)) ?? 0, cs: numero(celda(ws, col.cs, f)) ?? 0,
    })
  }
  if (fin === null) problemas.push('Presupuesto: no se encontró la fila «COSTO DIRECTO TOTAL»')
  return { items, fin, problemas }
}

const r2 = (v) => Math.round(v * 100) / 100

/** Un ítem sin análisis sólo tiene su descripción: si ella declara el rubro, se toma; si no, `null`. */
export function rubroPorDescripcion(descripcion) {
  const d = (descripcion ?? '').toUpperCase()
  if (/^MATERIAL/.test(d)) return { rubro: 'materiales', porque: 'la descripción del ítem empieza con «Materiales»' }
  if (/\b(FLETE|ALQUILER|SERVICIO|TRASLADO)\b/.test(d)) return { rubro: 'otros', porque: 'la descripción del ítem declara flete, alquiler, servicio o traslado' }
  if (/\bSUBCONTRAT/.test(d)) return { rubro: 'subcontratistas', porque: 'la descripción del ítem declara un subcontrato' }
  return null
}

/**
 * LA EXPLOSIÓN DE UN LIBRO: cada ítem del Presupuesto, abierto en sus insumos por el Análisis, y cada
 * insumo con su rubro. `importe = cantidad × coeficiente × total por unidad del insumo`; la suma de los
 * insumos de un ítem tiene que dar su subtotal H (control: se informa la diferencia, no se tapa).
 *
 * Un ítem SIN análisis (sin código, o con código que no está en la hoja) no dice de qué está hecho:
 * entra entero como una línea con el rubro que `sinAnalisis[fila]` declare, o a «otros» marcado
 * `sinEvidencia`.
 *
 * @returns {{lineas: object[], items: object[], controles: string[], problemas: string[]}}
 */
export function explotarLibro(wb, { filas = null, sinAnalisis = {} } = {}) {
  const wsP = hoja(wb, 'Presupuesto')
  const wsA = hoja(wb, 'Análisis')
  const wsR = hoja(wb, 'Recursos')
  const problemas = []
  if (!wsP || !wsA || !wsR) problemas.push(`faltan hojas: ${[!wsP && 'Presupuesto', !wsA && 'Análisis', !wsR && 'Recursos'].filter(Boolean).join(', ')}`)
  if (problemas.length) return { lineas: [], items: [], controles: [], problemas }
  const P = leerPresupuesto(wsP, { filas })
  const A = leerAnalisis(wsA)
  const R = leerRecursos(wsR)
  problemas.push(...P.problemas, ...A.problemas, ...R.problemas)
  const controles = []
  const lineas = []
  for (const it of P.items) {
    const tarea = it.codigo ? A.tareas.get(it.codigo) : null
    const factor = it.cantidad * it.coef
    // UN COEFICIENTE DE 100 O MÁS ES UN TIPO DE CAMBIO, NO UNA CANTIDAD (auditoría 18/09, D6). La plantilla
    // cotiza el alquiler del Bobcat en dólares y pone el dólar (1.450) en «COEF. AJUSTE»: multiplica el
    // precio, no las horas. «OFICIAL ESPECIALIZADO - EN DOLARES» salía con 46.400 hs cuando el documento
    // dice 32. El importe (cantidad × coeficiente × costo) no cambia; la cantidad no lleva el dólar.
    // Un coeficiente chico (1,4 · 1,5 · 4 galpones) sí escala la cantidad, como lo usa la plantilla.
    const esCambio = it.coef >= 100
    const factorCantidad = esCambio ? it.cantidad : factor
    if (it.subtotalEnError) { controles.push(`Presupuesto!H${it.fila} en error: el ítem «${it.tarea}» no entra`); continue }
    if (!tarea || !tarea.insumos.length) {
      const decl = sinAnalisis[it.fila] ?? rubroPorDescripcion(it.tarea ?? it.rotulo)
      lineas.push({
        itemFila: it.fila, item: it.tarea ?? it.rotulo ?? `fila ${it.fila}`, rotulo: it.rotulo, insumo: it.tarea ?? it.rotulo ?? `ítem fila ${it.fila}`,
        unidad: it.unidad, cantidad: it.cantidad, importe: r2(it.subtotal), rubro: decl?.rubro ?? 'otros',
        porque: decl?.porque ?? `ítem sin análisis de costos (${it.codigo ? `código ${it.codigo} no está en Análisis` : 'sin código'}): no dice de qué está hecho`,
        sinEvidencia: !decl, enOferta: false, celda: `Presupuesto!H${it.fila}`,
      })
      continue
    }
    let suma = 0
    const porRubro = {}
    const delItem = []
    for (const ins of tarea.insumos) {
      if (ins.enError || ins.total === null) { controles.push(`Análisis!G${ins.fila} (${ins.nombre}) en error o vacío: se toma 0`); continue }
      const rec = (ins.codigo !== null ? R.recursos.get(ins.codigo) : null) ?? (ins.nombre ? R.recursos.get(`nombre:${ins.nombre.toUpperCase()}`) : null) ?? null
      const unidad = ins.unidad ?? rec?.unidad ?? null
      const { rubro, porque, sinEvidencia } = rubroDeRecurso({ unidad, familia: rec?.familia, division: rec?.division, nombre: ins.nombre ?? rec?.nombre })
      const importe = r2(factor * ins.total)
      suma += importe
      porRubro[rubro] = (porRubro[rubro] ?? 0) + importe
      delItem.push({
        itemFila: it.fila, item: it.tarea, rotulo: it.rotulo, insumo: ins.nombre ?? rec?.nombre ?? ins.codigo, codigo: ins.codigo,
        unidad, cantidad: r2(factorCantidad * (ins.cantidad ?? 0)), importe, rubro,
        porque: esCambio ? `${porque}; ítem cotizado en dólares (coeficiente ${it.coef} = tipo de cambio: multiplica el precio, no la cantidad)` : porque,
        sinEvidencia: !!sinEvidencia,
        // LA OFERTA SÓLO MO (Presupuesto!R = O + Q) lleva adentro lo que la plantilla suma por unidad «hs» y
        // «hr» —incluidas las máquinas por hora, que su SUMIF cuenta como cargas—; el resto queda afuera.
        enOferta: /^h[sr]$/i.test((unidad ?? '').trim()),
        celda: `Análisis!G${ins.fila} × Presupuesto!E${it.fila}×G${it.fila}`,
      })
    }
    lineas.push(...delItem)
    const dif = r2(it.subtotal - suma)
    if (Math.abs(dif) > Math.max(1, Math.abs(it.subtotal) * 0.0005)) {
      // EL SUBTOTAL TIPEADO NO CIERRA CON SU ANÁLISIS: la diferencia va al rubro principal del ítem, dicha
      // como ajuste. Es una inferencia y el rubro queda marcado estimado; nunca se esconde en «otros».
      const principal = Object.entries(porRubro).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'otros'
      controles.push(`Presupuesto!H${it.fila} «${it.tarea}» = ${it.subtotal} pero sus insumos suman ${r2(suma)} (dif ${dif} → ${principal})`)
      lineas.push({
        itemFila: it.fila, item: it.tarea, rotulo: it.rotulo, insumo: `ajuste del ítem «${it.tarea}»: su subtotal (H${it.fila}) no cierra con su análisis`,
        unidad: null, cantidad: null, importe: dif, rubro: principal, porque: 'diferencia entre el subtotal tipeado del ítem y la suma de sus insumos, asignada al rubro principal del ítem',
        sinEvidencia: false, ajuste: true, enOferta: false,
        celda: `Presupuesto!H${it.fila} − Σ Análisis`,
      })
    }
  }
  return { lineas, items: P.items, controles, problemas }
}

/** Σ importes por rubro, y el detalle agregado por insumo (nombre + unidad), del más caro al más barato. */
export function agregarPorRubro(lineas, { parte = null } = {}) {
  const out = {}
  for (const r of RUBROS) out[r] = { monto: 0, detalle: [], sinEvidencia: 0 }
  const claves = new Map()
  for (const l of lineas) {
    const b = out[l.rubro]
    b.monto = r2(b.monto + l.importe)
    if (l.sinEvidencia) b.sinEvidencia = r2(b.sinEvidencia + l.importe)
    if (l.ajuste) b.ajustes = r2((b.ajustes ?? 0) + Math.abs(l.importe))
    const k = `${l.rubro}|${(l.insumo ?? '').toUpperCase()}|${(l.unidad ?? '').toLowerCase()}|${l.enOferta ? 1 : 0}`
    let d = claves.get(k)
    if (!d) {
      d = { item: l.insumo, unidad: l.unidad, cantidad: 0, importe: 0, porque: l.porque, items: [], enOferta: !!l.enOferta, ...(parte ? { parte } : {}), ...(l.sinEvidencia ? { sin_evidencia: true } : {}), ...(l.ajuste ? { ajuste: true } : {}) }
      claves.set(k, d)
      b.detalle.push(d)
    }
    d.cantidad = l.cantidad === null ? d.cantidad : r2(d.cantidad + l.cantidad)
    d.importe = r2(d.importe + l.importe)
    if (l.item && !d.items.includes(l.item)) d.items.push(l.item)
  }
  for (const r of RUBROS) {
    out[r].detalle.sort((a, b) => b.importe - a.importe)
    for (const d of out[r].detalle) {
      d.n_items = d.items.length
      d.items = d.items.slice(0, 6)
      if (d.cantidad === 0 && d.unidad === null) delete d.cantidad
    }
  }
  return out
}

// ═══ QUÉ DOCUMENTO ES EL PRESUPUESTO DE CADA OBRA ═══
//
// Los mismos archivos que `presupuestos-cotizados.mjs` (17/09/2026) tomó como presupuesto aprobado,
// con las mismas decisiones de alcance:
//   · quattropani y entrepiso: la oferta es SÓLO mano de obra (Presupuesto!R = O+Q). Los materiales,
//     equipos y fletes que la cotización computó igual quedan FUERA del precio y se listan como tales
//     (`fuera_de_oferta`), sin monto. En Quattropani, el presupuesto de materiales es el fondo del
//     contrato (cláusula 4), no la columna P.
//   · le-comedor: obra + adicional, dos libros.
//   · messina-bsa: la recotización 2026 aprobada no tiene costo cotizado → sin presupuesto, con motivo.
//   · messina-pisos-120-rampa: el .xlsm fue reescrito después del PDF (41,8 m²); no se lee. Se toman las
//     partidas cargadas el 17/09 (INFERENCIA, escaladas) y se dicen estimadas.
//   · el adicional del playón de dilución de ácido está cotizado y NO aprobado: no entra.
export const MOTIVO_BSA = 'la recotización 2026 aprobada no tiene costo cotizado (nota «Presupuestar Piso para Planta BSA … Falta»); la cotización de 2024 (drive 1rKUCSYZHeUsFWOjbOySCOoueqqz7kWRi) está reemplazada y no se escala'

export const OBRAS = Object.freeze([
  {
    obra: 'quattropani', fecha: '2026-07-27',
    libros: [{ drive: '19rYSz2s1oFs0DIHyEFh9qV_bY0ZwTNKC', nombre: 'Cotizacion Final.xlsm', parte: 'obra', filas: [10, 43], soloManoObra: true }],
    materialesDelContrato: {
      monto: 44110169.31,
      item: 'Fondo administrado de materiales del contrato (cláusula 4, Anexo II). El Anexo II no figura en el .docx leído: el detalle por material no está disponible.',
      cita: 'CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA.docx drive 1glixkTWr5HDDKdzsniqoBJLZias5DLn9 · cláusula 4 «Administración y compra de materiales»: $ 44.110.169,31 destinados exclusivamente a los materiales del Anexo II; «no constituye el costo total de los materiales»',
    },
    motivoFueraDeOferta: 'la oferta es sólo mano de obra (OFERTA!F43 = U$S 63.000 sobre Presupuesto!R); lo que la cotización computó de este rubro quedó fuera del precio y lo paga el cliente',
  },
  {
    obra: 'le-comedor', fecha: '2025-12-15',
    libros: [
      { drive: '11vyK-T_DdoxYPwsYI4SLIIO3zX-1VGWs', nombre: 'COTIZACION INTERNA CON PANELES version 2.xlsm', parte: 'obra' },
      { drive: '1M_p-AQaFXRY0UF8ccH_NKHV4SM5DlMht', nombre: 'ADICIONALES.xlsm', parte: 'adicional' },
    ],
  },
  { obra: 'messina-bsa', sinPresupuesto: MOTIVO_BSA },
  { obra: 'messina-playon-azufre', fecha: '2026-07-30', libros: [{ drive: '1HiGyOFW85G45G2NFM_rHGit9AzqhdS_D', nombre: 'PLATEA DE HORMIGON - AGOSTO 2026.xlsm', parte: 'obra' }] },
  { obra: 'messina-playon-dilucion-acido', fecha: '2026-08-28', libros: [{ drive: '1_1Si2IKXMBTgFdXYo1eXdz8ACbIOwRz-', nombre: 'Cotizacion.xlsm', parte: 'obra' }] },
  { obra: 'messina-adicional-tercer-muro', fecha: '2026-08-27', libros: [{ drive: '1MFtUGWLGVk_qnAeeapwdiz99xZ9AA8yV', nombre: 'ADICIONAL MURO.xlsm', parte: 'obra' }] },
  { obra: 'instalacion-electrica', fecha: '2026-07-21', libros: [{ drive: '1uXVe7ffIgYS5srgTwFtUGlRjYV9pR7Eu', nombre: 'Cotizacion Interna - Instalacion Electrica.xlsm', parte: 'obra' }] },
  // PISOS INDUSTRIALES: EL HORMIGONADO ES DE UN SUBCONTRATISTA (18/09/2026). La cotización vendida
  // (1iKAAbLs6vdk9jnzgRYS4Bo16g-1wrgdF, Presupuesto!H53 = 32.406.752) modela los 3.610 m² de T1107.1 como
  // «OFICIAL 0,9 hs/m²» con las cargas sociales anuladas (Análisis!E1017 = E1012*0): leída así era mano de obra
  // propia y subcontratistas quedaba en 0. La planilla hermana «Horas Hombre - Pisos Industriales.xlsm» (misma
  // carpeta, modificada el mismo 21/08) re-analiza la MISMA oferta —mismas tareas y cantidades— con el recurso
  // PEDRO TELLO (M2, $4.300, fuente SUBCONTRATISTA) + 0,079 hs/m² de oficial propio: Presupuesto!H53 =
  // 32.414.224,70 (0,02 % arriba de la vendida) e I53 = 1.083,6 horas. Se lee ésa. El subcontrato firmado
  // (`subcontrato`: PEDRO TELLO, 3.610 m² × $4.400 = $15.884.000) es el gasto, no el presupuesto.
  {
    obra: 'pisos-industriales', fecha: '2026-06-09',
    libros: [{
      drive: '1qCcsSD2oe15d9JCP2-TqfGqyxRp48Ydb', nombre: 'Horas Hombre - Pisos Industriales.xlsm', parte: 'obra',
      nota: 'misma oferta que Cotizacion interna - Pisos Industriales.xlsm drive 1iKAAbLs6vdk9jnzgRYS4Bo16g-1wrgdF, re-analizada con el subcontrato de PEDRO TELLO',
    }],
  },
  {
    obra: 'entrepiso-y-escalera', fecha: '2026-07-22',
    libros: [{ drive: '1nvMcrRwjfCBsedDI5IANuS18TsmKwnqB', nombre: 'Entrepiso y escalera.xlsm', parte: 'obra', filas: [10, 13], soloManoObra: true }],
    motivoFueraDeOferta: 'la oferta es sólo mano de obra (OFERTA!F19 = Presupuesto!R10:R13); los materiales los provee el cliente y lo que la cotización computó de este rubro quedó fuera del precio',
  },
  {
    obra: 'messina-pisos-120-rampa', fecha: '2026-06-11', desdePartidas: true, estimado: true,
    fuente: { drive: '1cBQuKoPSYEtrnRDI8q72qy38PVQkdAV6', nombre: 'Cotizacion piso 120m2.xlsm' },
    cita: 'INFERENCIA: el .xlsm (drive 1cBQuKoPSYEtrnRDI8q72qy38PVQkdAV6) fue reescrito con 41,8 m² después del PDF (drive 1d-u515rso_v01m8csfy8-Df2g1-fR5Pz); se toman las partidas cargadas el 17/09/2026 (Presupuesto!O/P/Q escaladas a las cantidades del PDF, y la rampa de obras-datos.mjs). Sin detalle por insumo.',
    // LAS HORAS: Análisis del .xlsm (hs por unidad, conservadas desde junio: los precios unitarios de los dos PDF
    // son costo × 2,2056 × coeficiente) × las cantidades de los PDF vendidos. El coeficiente es el que reproduce
    // el precio unitario del PDF: 3 en T1107.3 (Presupuesto!G15) y 0,7 en la rampa (T1101 y T1107.1).
    horas: {
      drive: '1cBQuKoPSYEtrnRDI8q72qy38PVQkdAV6', nombre: 'Cotizacion piso 120m2.xlsm',
      cantidades: [
        { codigo: 'T1142', cantidad: 60, coef: 1, cita: 'PDF piso 11/06 drive 1d-u515rso_v01m8csfy8-Df2g1-fR5Pz' },
        { codigo: 'T1101', cantidad: 12, coef: 1, cita: 'PDF piso 11/06 drive 1d-u515rso_v01m8csfy8-Df2g1-fR5Pz' },
        { codigo: 'T1126', cantidad: 8, coef: 1, cita: 'PDF piso 11/06 drive 1d-u515rso_v01m8csfy8-Df2g1-fR5Pz' },
        { codigo: 'T1100', cantidad: 8, coef: 1, cita: 'PDF piso 11/06 drive 1d-u515rso_v01m8csfy8-Df2g1-fR5Pz' },
        { codigo: 'T1107.1', cantidad: 120, coef: 1, cita: 'PDF piso 11/06 drive 1d-u515rso_v01m8csfy8-Df2g1-fR5Pz' },
        { codigo: 'T1107.3', cantidad: 12.6, coef: 3, cita: 'PDF piso 11/06 drive 1d-u515rso_v01m8csfy8-Df2g1-fR5Pz' },
        { codigo: 'T1101', cantidad: 14.4, coef: 0.7, cita: 'PDF rampa 19/08 drive 1QioaEfc-FDbareikGjc2W0TzJ8wPclWr' },
        { codigo: 'T1100', cantidad: 8, coef: 1, cita: 'PDF rampa 19/08 drive 1QioaEfc-FDbareikGjc2W0TzJ8wPclWr' },
        { codigo: 'T1107.1', cantidad: 41.8, coef: 0.7, cita: 'PDF rampa 19/08 drive 1QioaEfc-FDbareikGjc2W0TzJ8wPclWr' },
        { codigo: 'T1107.3', cantidad: 8, coef: 3, cita: 'PDF rampa 19/08 drive 1QioaEfc-FDbareikGjc2W0TzJ8wPclWr' },
      ],
    },
  },
])

/** El rubro de una partida de `partidas_presupuesto` (sólo para las obras `desdePartidas`). */
export function rubroDePartida(codigo) {
  const c = (codigo ?? '').toUpperCase().split('-').at(-1)
  if (c === 'MO' || c === 'CS' || c === 'MOCS') return 'mano_obra'
  if (c === 'MA') return 'materiales'
  if (c === 'EQ') return 'otros'
  return 'otros'
}

/**
 * LOS RUBROS DE UNA OBRA a partir de sus libros ya explotados.
 *
 * @param {object} cfg           la entrada de `OBRAS`
 * @param {Array<{libro, explosion}>} explosiones  una por libro, en el orden de `cfg.libros`
 * @returns {{rubros: Record<string, {monto, motivo, detalle, estimado, cita}>, costoDirecto, controles, problemas}}
 */
export function rubrosDeObra(cfg, explosiones) {
  const controles = []
  const problemas = []
  const rubros = {}
  for (const r of RUBROS) rubros[r] = { monto: 0, motivo: null, detalle: [], estimado: false, cita: [] }
  for (const { libro, explosion } of explosiones) {
    problemas.push(...explosion.problemas.map((p) => `${libro.nombre}: ${p}`))
    controles.push(...explosion.controles.map((p) => `${libro.nombre}: ${p}`))
    const agg = agregarPorRubro(explosion.lineas, { parte: cfg.libros.length > 1 ? libro.parte : null })
    const filas = libro.filas ? `filas ${libro.filas[0]}–${libro.filas[1]}` : `filas 8–${(explosion.items.at(-1)?.fila ?? '?')}`
    const cita = `${libro.nombre} drive ${libro.drive} · Presupuesto ${filas} abierto por Análisis${libro.nota ? ` (${libro.nota})` : ''}`
    for (const r of RUBROS) {
      const b = rubros[r]
      b.cita.push(cita)
      if (agg[r].ajustes > 0) b.estimado = true
      if (agg[r].sinEvidencia > 0) controles.push(`${libro.nombre}: ${r} incluye ${agg[r].sinEvidencia} sin evidencia de rubro`)
      if (!libro.soloManoObra) {
        b.monto = r2(b.monto + agg[r].monto)
        b.detalle.push(...agg[r].detalle.map(({ enOferta, ...d }) => d))
        continue
      }
      // OFERTA SÓLO MANO DE OBRA: entra lo que la plantilla sumó en O y Q (unidad hs/hr); lo demás se
      // lista como «fuera de la oferta», sin sumarse a ningún monto.
      for (const { enOferta, ...d } of agg[r].detalle) {
        if (enOferta) { b.monto = r2(b.monto + d.importe); b.detalle.push(d) } else { b.detalle.push({ ...d, fuera_de_oferta: true }); b.fuera = r2((b.fuera ?? 0) + d.importe) }
      }
    }
  }
  for (const r of RUBROS) {
    const b = rubros[r]
    b.cita = [...new Set(b.cita)].join(' | ')
    b.detalle.sort((a, c) => c.importe - a.importe)
    if (b.monto === 0 && b.fuera > 0 && !b.detalle.some((d) => !d.fuera_de_oferta)) { b.monto = null; b.motivo = cfg.motivoFueraDeOferta }
    delete b.fuera
    if (b.monto === 0 && !b.detalle.length && b.motivo === null) {
      b.motivo = r === 'subcontratistas' ? 'la cotización no prevé subcontratos: toda la mano de obra es propia'
        : `la cotización no computa ningún insumo de este rubro`
    }
  }
  if (cfg.materialesDelContrato) {
    const m = cfg.materialesDelContrato
    rubros.materiales.monto = m.monto
    rubros.materiales.motivo = null
    rubros.materiales.detalle.unshift({ item: m.item, unidad: 'ARS', cantidad: 1, importe: m.monto, porque: 'fondo del contrato', items: [], n_items: 0 })
    rubros.materiales.cita = `${m.cita} | ${rubros.materiales.cita}`
  }
  const costoDirecto = r2(RUBROS.reduce((a, r) => a + (rubros[r].monto ?? 0), 0))
  return { rubros, costoDirecto, controles, problemas, hh: horasDelDocumento(explosiones.map((x) => x.explosion)) }
}

/**
 * LAS HORAS QUE IMPLICA EL COSTO COTIZADO (D6): Σ de las cantidades en «hs» de mano de obra —oficial,
 * ayudante, oficial especializado—. Las cargas sociales van en «hr» y no son horas; tampoco las máquinas
 * por hora («HR»). Con la cantidad ya corregida del tipo de cambio.
 */
export function horasDelDocumento(explosiones) {
  let h = 0
  let hay = false
  for (const ex of explosiones) {
    for (const l of ex.lineas) {
      if (l.rubro === 'mano_obra' && /^hs$/i.test((l.unidad ?? '').trim()) && l.cantidad != null) { h += l.cantidad; hay = true }
    }
  }
  return hay ? r2(h) : null
}

/**
 * LAS HORAS DE UNA OBRA CUYA PLANILLA FUE REESCRITA (Pisos 120 m²): el Análisis conserva las horas por unidad
 * de cada tarea; las cantidades vendidas están en otro documento (el PDF). Σ (hs de mano de obra propia por
 * unidad × cantidad × coeficiente), con la misma convención que `explotarLibro` (un coeficiente < 100 escala la
 * cantidad). Es un CÁLCULO sobre dos documentos, no una lectura directa: quien lo usa lo marca así.
 * Una tarea que no está en el Análisis NO se completa con cero: `hh` queda null y `faltan` la nombra.
 *
 * @param {Map} tareas  `leerAnalisis(...).tareas`
 * @param {Array<{codigo, cantidad, coef, cita}>} cantidades
 * @returns {{hh: number|null, detalle: object[], faltan: string[]}}
 */
export function horasPorCantidades(tareas, cantidades) {
  const detalle = []
  const faltan = []
  let hh = 0
  for (const c of cantidades) {
    const t = tareas.get(codigoNorm(c.codigo))
    if (!t) { faltan.push(c.codigo); continue }
    const coef = c.coef ?? 1
    const factor = c.cantidad * (coef >= 100 ? 1 : coef)
    let porUnidad = 0
    for (const ins of t.insumos) {
      if (!/^hs$/i.test((ins.unidad ?? '').trim()) || ins.cantidad == null) continue
      if (rubroDeRecurso({ unidad: ins.unidad, nombre: ins.nombre }).rubro !== 'mano_obra') continue
      porUnidad += ins.cantidad
    }
    const horas = r2(factor * porUnidad)
    hh += horas
    detalle.push({ codigo: t.codigo, tarea: t.descripcion, cantidad: c.cantidad, coef, hs_por_unidad: r2(porUnidad), horas, cita: c.cita })
  }
  return { hh: faltan.length ? null : r2(hh), detalle, faltan }
}

/** Los rubros de una obra `desdePartidas`: las partidas del presupuesto aprobado, mapeadas por código. */
export function rubrosDesdePartidas(cfg, partidas) {
  const rubros = {}
  for (const r of RUBROS) rubros[r] = { monto: 0, motivo: null, detalle: [], estimado: true, cita: cfg.cita }
  for (const p of partidas) {
    const r = rubroDePartida(p.codigo)
    rubros[r].monto = r2(rubros[r].monto + Number(p.monto))
    rubros[r].detalle.push({ item: p.descripcion, unidad: null, importe: Number(p.monto), porque: `partida ${p.codigo}`, items: [], n_items: 0 })
  }
  for (const r of RUBROS) {
    if (rubros[r].monto === 0 && !rubros[r].detalle.length) {
      rubros[r].motivo = r === 'subcontratistas' ? 'la cotización no prevé subcontratos: toda la mano de obra es propia' : 'la cotización no computa ningún insumo de este rubro'
    }
  }
  const costoDirecto = r2(RUBROS.reduce((a, r) => a + (rubros[r].monto ?? 0), 0))
  return { rubros, costoDirecto, controles: [], problemas: [] }
}
