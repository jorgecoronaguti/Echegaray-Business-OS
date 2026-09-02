// LA COTIZACIÓN QUE SALE DE UN PLANO — escrita en las tablas que ya existen, no en unas nuevas.
//
// ═══ POR QUÉ NO HAY UN «PRESUPUESTO XSAS» APARTE ═══
//
// `cotizaciones` + `cotizacion_partida` + `cotizacion_partida_composicion` + la vista
// `cotizacion_cascada` ya son el motor de cotización de la empresa: la cascada
// directo → GG → industrial → beneficio → financiero → IIBB → Ganancias → cheque → IVA está
// verificada contra el libro real (coeficiente 1,68197 sin IVA). Una cotización de XSAS que se
// guardara en otro lado tendría que reimplementar esa cascada, y en el momento en que existieran
// dos el número de la empresa dejaría de ser uno.
//
// Y hay una razón más, que es la que pidió el piloto: la cotización tiene que conservar los IDs
// para que después COTIZACIÓN APROBADA → ADJUDICACIÓN → CREAR OBRA funcione. Eso ya está cableado
// sobre `cotizaciones.convertida_obra_id`. Guardar en otra tabla sería cortar ese tramo antes de
// construirlo.
//
// ═══ `public.computo` ES LA GENEALOGÍA, Y ESTABA VACÍA ═══
//
// La tabla existía con `documento_drive_id`, `documento_nombre`, `elemento`, `origen` y `criterio`,
// y su CHECK ya aceptaba `origen = 'plano'`: alguien la diseñó para exactamente esto y nunca hubo
// quién la llenara, porque no había forma de leer un plano. Es la fila que contesta «¿de dónde
// salió esta cantidad?» apuntando al archivo de Drive y a la lámina.

import { FUENTE } from './fuente.mjs'

/** El rubro de una partida sale del SISTEMA CONSTRUCTIVO del elemento, no del nombre de la tarea.
 *  Es la agrupación con la que se lee un presupuesto de obra y la que después se compara contra el
 *  histórico: «estructura metálica» es un rubro, «columnas» no. */
export const RUBRO_DE_SISTEMA = Object.freeze({
  movimiento_suelo: 'MOVIMIENTO DE SUELOS Y FUNDACIONES',
  hormigon_armado: 'ESTRUCTURA DE HORMIGÓN ARMADO',
  estructura_metalica: 'ESTRUCTURA METÁLICA',
  mamposteria: 'MAMPOSTERÍA',
  cubierta: 'CUBIERTA Y CERRAMIENTOS',
  piso: 'PISOS Y CONTRAPISOS',
  carpinteria: 'CARPINTERÍAS',
  terminacion: 'TERMINACIONES',
  instalacion: 'INSTALACIONES',
  otro: 'OTROS',
})

const redondear = (n, d = 4) => (n === null || n === undefined ? null : Math.round(Number(n) * 10 ** d) / 10 ** d)

/**
 * LAS PARTIDAS DE LA COTIZACIÓN, agrupadas. Dos elementos que caen en la misma tarea de la Base
 * Maestra son UNA partida con la cantidad sumada y DOS líneas de cómputo: así la partida se cotiza
 * una vez y cada elemento conserva su propia evidencia. Separarlas produciría un presupuesto con
 * «COLUMNAS METALICAS» repetido cuatro veces, que es como se leen los presupuestos mal armados.
 * PURA.
 */
export function agruparPartidas(mapeos = []) {
  const porTarea = new Map()
  const candidatas = []
  for (const m of mapeos) {
    if (m.estado !== 'MAPEADA') { candidatas.push(m); continue }
    const k = m.tarea.id
    const p = porTarea.get(k) ?? {
      tarea: m.tarea,
      rubro: RUBRO_DE_SISTEMA[m.computo.sistema] ?? RUBRO_DE_SISTEMA.otro,
      cantidad: 0, lineas: [],
    }
    p.cantidad = redondear(p.cantidad + Number(m.computo.cantidad.valor))
    p.lineas.push({
      elemento: m.computo.id,
      nombre: m.computo.nombre,
      cantidad: redondear(Number(m.computo.cantidad.valor)),
      unidad: m.computo.unidad,
      documento: m.computo.archivo,
      documentoId: m.computo.evidencia?.archivoId ?? null,
      lamina: m.computo.lamina,
      criterio: m.computo.cantidad.formula,
      entradas: m.computo.cantidad.entradas,
      textoLiteral: m.computo.evidencia?.textoLiteral ?? null,
      vista: m.computo.evidencia?.vista ?? null,
      porQuePartida: m.porQue,
    })
    porTarea.set(k, p)
  }
  const partidas = [...porTarea.values()].sort((a, b) => (a.rubro === b.rubro ? a.tarea.codigo.localeCompare(b.tarea.codigo) : a.rubro.localeCompare(b.rubro)))
  return { partidas, candidatas }
}

/** El costo directo y las HH de una partida a partir de su composición unitaria y su cantidad.
 *  Un solo recurso sin precio deja la partida SIN costo: la regla ya está en `cadenaDeCosto` y acá
 *  se respeta igual, porque un total al que le falta un renglón engaña más que un total ausente. */
export function valorizar(partida, composicion = []) {
  if (!composicion.length) return { costoUnitario: null, hsUnitarias: null, subtotal: null, sinPrecio: ['la tarea no tiene composición cargada'] }
  const sinPrecio = composicion.filter((l) => l.costoUnitario === null).map((l) => l.nombre)
  const costoUnitario = sinPrecio.length ? null : composicion.reduce((a, l) => a + l.cantidad * l.costoUnitario * (1 + (l.desperdicio ?? 0)), 0)
  const hsUnitarias = composicion.filter((l) => l.tipo === 'mano_obra').reduce((a, l) => a + l.cantidad, 0)
  return {
    costoUnitario: redondear(costoUnitario, 6),
    hsUnitarias: redondear(hsUnitarias, 6),
    subtotal: costoUnitario === null ? null : redondear(costoUnitario * partida.cantidad, 2),
    sinPrecio,
  }
}

/** El desglose por tipo de recurso — materiales, HH, cargas, equipos, subcontratos. Es lo que el
 *  piloto pide mostrar por partida y lo que después se compara contra el histórico. */
export function desglose(partida, composicion = []) {
  const por = (t) => composicion.filter((l) => l.tipo === t).reduce((a, l) => a + l.cantidad * (l.costoUnitario ?? 0) * (1 + (l.desperdicio ?? 0)), 0) * partida.cantidad
  return {
    materiales: redondear(por('material'), 2),
    manoObra: redondear(por('mano_obra'), 2),
    cargasSociales: redondear(por('carga_social'), 2),
    equipos: redondear(por('equipo'), 2),
    subcontrato: redondear(por('subcontrato'), 2),
  }
}

/** La cotización completa, todavía en memoria. `persistir` la escribe; esto la ARMA, y es puro. */
export function armar({ cliente, obraNombre, partidas = [], composiciones = new Map(), candidatas = [] } = {}) {
  const items = partidas.map((p, i) => {
    const comp = composiciones.get(p.tarea.id) ?? []
    const v = valorizar(p, comp)
    return {
      orden: i + 1, rubro: p.rubro, codigo: p.tarea.codigo, descripcion: p.tarea.nombre,
      unidad: p.tarea.unidad, cantidad: p.cantidad, tareaTipoId: p.tarea.id,
      ...v, desglose: desglose(p, comp), composicion: comp, lineas: p.lineas,
      fuenteCantidad: FUENTE.CALCULADO, fuentePartida: FUENTE.BASE_MAESTRA,
      fuentePrecio: comp.length ? FUENTE.BASE_MAESTRA : FUENTE.FALTA_DATO,
    }
  })
  const conCosto = items.filter((i) => i.subtotal !== null)
  return {
    cliente: cliente ?? null,
    obraNombre: obraNombre ?? null,
    partidas: items,
    candidatas,
    costoDirecto: conCosto.length ? redondear(conCosto.reduce((a, i) => a + i.subtotal, 0), 2) : null,
    hh: redondear(items.reduce((a, i) => a + (i.hsUnitarias ?? 0) * i.cantidad, 0), 2),
    sinCosto: items.filter((i) => i.subtotal === null).map((i) => ({ codigo: i.codigo, porQue: i.sinPrecio })),
  }
}

/**
 * ESCRIBIRLA. Devuelve los IDs, que son la genealogía: `cotizacion_id` es lo que después toma
 * ADJUDICACIÓN → CREAR OBRA, y cada fila de `public.computo` apunta al archivo de Drive del que
 * salió la cantidad. No toca ninguna cotización existente: siempre inserta una nueva.
 */
export async function persistir({ query }, cotizacion, { numero, origen = 'xsas:plano', notas = null, parametroComercialId = null, razonamiento = null } = {}) {
  const p = parametroComercialId ?? (await query(`select id from public.parametro_comercial where vigente order by version desc limit 1`)).rows[0]?.id ?? null
  const c = await query(
    `insert into public.cotizaciones (cliente, obra_nombre, estado, fecha_cotizacion, numero, version, vigente, origen, notas, razonamiento, parametro_comercial_id,
        pct_gastos_generales, pct_beneficio, pct_financiero, factor_financiero, pct_iibb, pct_ganancias, pct_cheque, pct_iva)
     select $1,$2,'borrador',current_date,$3,1,true,$4,$5,$6,pc.id,
        pc.pct_gastos_generales, pc.pct_beneficio, pc.pct_financiero, pc.factor_financiero, pc.pct_iibb, pc.pct_ganancias, pc.pct_cheque, pc.pct_iva
       from public.parametro_comercial pc where pc.id = $7
     returning id`,
    [cotizacion.cliente, cotizacion.obraNombre, numero, origen, notas, razonamiento === null ? null : JSON.stringify(razonamiento), p])
  const cotizacionId = c.rows[0].id

  for (const item of cotizacion.partidas) {
    const a = await query(`select id from public.analisis where tarea_tipo_id = $1 and vigente limit 1`, [item.tareaTipoId])
    const r = await query(
      `insert into public.cotizacion_partida (cotizacion_id, orden, rubro, codigo, descripcion, cantidad, unidad, tarea_tipo_id, analisis_id, metodo_medicion, nota)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'cantidad',$10) returning id`,
      [cotizacionId, item.orden, item.rubro, item.codigo, item.descripcion, item.cantidad, item.unidad, item.tareaTipoId, a.rows[0]?.id ?? null, item.lineas.map((l) => l.porQuePartida)[0] ?? null])
    const partidaId = r.rows[0].id
    for (const l of item.lineas) {
      await query(
        `insert into public.computo (cotizacion_partida_id, documento_drive_id, documento_nombre, revision, elemento, sector, unidad, cantidad, origen, criterio)
         values ($1,$2,$3,null,$4,$5,$6,$7,'plano',$8)`,
        [partidaId, l.documentoId, l.documento, `${l.elemento} — ${l.nombre}`, l.lamina, l.unidad, l.cantidad,
          `${l.criterio} · entradas ${JSON.stringify(l.entradas)} · el plano dice «${l.textoLiteral}»${l.vista ? ` (${l.vista})` : ''}`])
    }
  }
  return { cotizacionId, numero }
}

/** La cascada calculada por la vista canónica para una cotización recién escrita. */
export async function cascadaDe({ query }, cotizacionId) {
  const r = await query(
    `select costo_directo, gastos_generales, costo_industrial, beneficio, financiero, iibb, ganancias,
            subtotal, impuesto_cheque, venta_sin_iva, iva, venta_final, hh_previstas, n_partidas,
            n_sin_analisis, coeficiente_sin_iva
       from public.cotizacion_cascada where id = $1`, [cotizacionId])
  return r.rows[0] ?? null
}
