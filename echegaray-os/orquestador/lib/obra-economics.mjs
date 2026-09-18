// CUADRO ECONÓMICO POR OBRA — la misma lectura que app.ecsas.com.ar (18/09/2026).
//
// ═══ POR QUÉ SE REESCRIBIÓ ═══
//
// Dueño, 18/09/2026: «necesito que los datos estén perfectos leyendo de los mismos lugares en todo
// app.ecsas.com.ar». Hasta hoy este módulo leía las tablas LEGACY (`public.obras` por uuid,
// `presupuestos`, `costos_reales`, `adicionales`, `movimientos_caja`) y daba números distintos de los
// de la app (Galpones «contratado $ 204 M» en legacy; la app trabaja sobre `obra_canonica`).
//
// ═══ FUENTE ÚNICA (migraciones 20260918T0900 y T0905) ═══
//
//   `obra_canonica`                 el padrón: id (slug), nombre, estado, cliente. Sin fusionadas ni pruebas.
//   `obra_economia_rubros`          por obra: CONTRATADO (`contratado_de_obra`, la misma regla que el CRM,
//                                   la ficha y `obra_panel`) con su origen, y el PRESUPUESTO abierto en los
//                                   cuatro rubros con documento, fecha y cita — o el motivo de «sin presupuesto».
//   `costo_de_obras_por_rubro(...)` lo CONSUMIDO por rubro a la fecha, neto de IVA, con el detalle (familias,
//                                   proveedores, quincenas). Misma base que `costo_de_obras_a_la_fecha`.
//   `obra_economia`                 adicionales aprobados, certificado, facturado, cobrado.
//
// Los cuatro rubros y su definición vienen de `presupuesto-rubros.mjs` (una sola definición, la que
// también muestra la pantalla). Acá no se define nada: se ensambla y se rotula.
//
// ═══ DISCIPLINA DE EVIDENCIA (regla de oro: nunca fabricar) ═══
//
//   DATO         leído de la fuente (contratado del contrato, presupuesto del documento, comprobante).
//   CÁLCULO      derivado de dos datos (queda / excedido, margen).
//   INFERENCIA   parte estimada (quincenas de mano de obra valorizadas por tarifa estimada).
//   DESCONOCIDO  no hay dato: se dice el motivo, nunca un cero que parezca dato.
//
// Lo FACTURADO nunca se suma como precio. Un contratado de origen `suma-viva` (Σ viva de Cobranzas)
// se muestra como lo que es —no es precio— y no se usa para calcular margen.
import { query } from './db.mjs'
import { DEFINICION_RUBRO, ROTULO_RUBRO, RUBROS } from './presupuesto-rubros.mjs'

const fmtArs = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const fmtNum = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const ars = (n) => (n == null || Number.isNaN(Number(n)) ? 'sin dato' : fmtArs.format(Number(n)))
const usd = (n) => (n == null ? 'sin dato' : `U$S ${fmtNum.format(Number(n))}`)
const pct = (n) => (n == null || !Number.isFinite(Number(n)) ? 'sin dato' : `${(Number(n) * 100).toFixed(1)}%`)
const num = (v) => (v == null || v === '' ? null : Number(v))
const fecha = (d) => {
  if (!d) return null
  const x = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(x.getTime())) return String(d)
  // Fecha civil: `date` de Postgres llega como medianoche local; se formatea sin corrimiento de zona.
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}`
}
const CERRADA = new Set(['cerrada', 'terminada', 'finalizada'])
const esEnCurso = (estado) => !CERRADA.has(String(estado || '').toLowerCase())

/** Lo que dice cada origen de contratado, en palabras del dueño. `esPrecio` = sirve para margen. */
export const ORIGEN_CONTRATADO = Object.freeze({
  contrato: { texto: 'según contrato', esPrecio: true },
  presupuesto: { texto: 'según presupuesto (oferta aprobada)', esPrecio: true },
  oc: { texto: 'según OC', esPrecio: true },
  'oc-pesos': { texto: 'según OC (en pesos)', esPrecio: true },
  'oc-cliente': { texto: 'según OC del cliente', esPrecio: true },
  'oc-usd-x-tc': { texto: 'según OC en U$S al tipo de cambio', esPrecio: true },
  'suma-viva': { texto: 'suma viva de Cobranzas, no es precio', esPrecio: false },
  formulario: { texto: 'formulario de la obra', esPrecio: true },
})

// ── FILTRO DE PADRÓN — la misma regla en las tres lecturas ─────────────────────────────────────
const SIN_PRUEBAS = `nombre not ilike '[PRUEBA%' and nombre not ilike 'ZZ-%'`
const sinAcento = (col) => `translate(lower(${col}), 'áéíóúñ', 'aeioun')`

/** Busca obras canónicas por nombre, id (slug) o cliente, sin acentos ni mayúsculas. Devuelve [] si
 *  ninguna coincide. Excluye fusionadas y obras de prueba. */
export async function findObras(nombre) {
  const like = `%${String(nombre || '').trim().replace(/\s+/g, '%')}%`
  const { rows } = await query(
    `select id, nombre, estado, cliente_texto
       from public.obra_canonica
      where fusionada_en is null and ${SIN_PRUEBAS}
        and ($1 = '%%'
             or ${sinAcento('nombre')} ilike ${sinAcento('$1')}
             or ${sinAcento('id')} ilike ${sinAcento('$1')}
             or ${sinAcento("coalesce(cliente_texto, '')")} ilike ${sinAcento('$1')})
      order by (lower(estado) = 'activa') desc, nombre`,
    [like],
  )
  return rows
}

// ── LECTURA DE LAS FUENTES, una vez por lote de obras ──────────────────────────────────────────

/** Trae, para un conjunto de ids canónicos, las tres fuentes. Un solo viaje por fuente. */
async function leerFuentes(ids) {
  if (!ids.length) return { rubros: new Map(), consumo: new Map(), econ: new Map() }
  const [{ rows: rub }, { rows: cons }, { rows: eco }] = await Promise.all([
    query(`select * from public.obra_economia_rubros where obra_canonica_id = any($1::text[])`, [ids]),
    query(`select obra_id, rubro, monto, monto_estimado, n, detalle
             from public.costo_de_obras_por_rubro($1::text[], null, null, true)`, [ids]),
    query(`select obra_id, adicionales_aprobados, n_adicionales_aprobados, certificado, facturado, cobrado, n_cobranzas
             from public.obra_economia where obra_id = any($1::text[])`, [ids]),
  ])
  const rubros = new Map(rub.map((r) => [r.obra_canonica_id, r]))
  const consumo = new Map()
  for (const c of cons) {
    if (!consumo.has(c.obra_id)) consumo.set(c.obra_id, {})
    consumo.get(c.obra_id)[c.rubro] = {
      monto: num(c.monto), estimado: num(c.monto_estimado), n: Number(c.n || 0),
      detalle: Array.isArray(c.detalle) ? c.detalle : [],
    }
  }
  const econ = new Map(eco.map((r) => [r.obra_id, r]))
  return { rubros, consumo, econ }
}

/** Junta los números económicos de UNA obra a partir de las fuentes ya leídas. */
function armar(obra, fuentes) {
  const r = fuentes.rubros.get(obra.id) || null
  const consumo = fuentes.consumo.get(obra.id) || {}
  const e = fuentes.econ.get(obra.id) || null
  const origen = r?.contratado_origen || null
  const presupRubros = r?.presupuesto_rubros && typeof r.presupuesto_rubros === 'object' ? r.presupuesto_rubros : {}
  const presup = r && r.presupuesto_estado
    ? {
        estado: r.presupuesto_estado,
        motivo: r.presupuesto_motivo || null,
        total: num(r.presupuestado_total),
        moneda: r.presupuesto_moneda || 'ARS',
        estimado: Boolean(r.presupuesto_estimado),
        fuente: r.presupuesto_fuente_nombre || null,
        fecha: r.presupuesto_fecha || null,
        hh: num(r.presupuesto_hh),
        rubros: Object.fromEntries(RUBROS.map((k) => {
          const x = presupRubros[k] || null
          const columna = num(r[`presupuestado_${k}`])
          return [k, {
            monto: x ? num(x.monto) : columna,
            motivo: x?.motivo || null,
            estimado: Boolean(x?.estimado),
            detalle: Array.isArray(x?.detalle) ? x.detalle : [],
          }]
        })),
      }
    : null
  const consumoConocido = RUBROS.filter((k) => consumo[k] && consumo[k].monto != null)
  const consumidoTotal = consumoConocido.length ? consumoConocido.reduce((s, k) => s + consumo[k].monto, 0) : null
  return {
    obra,
    enCurso: esEnCurso(obra.estado ?? r?.estado),
    contratado: r
      ? {
          monto: num(r.contratado), usd: num(r.contratado_usd), origen,
          esPrecio: origen ? (ORIGEN_CONTRATADO[origen]?.esPrecio ?? true) : false,
          referencia: r.contratado_referencia || null, fuente: r.contrato_fuente_nombre || null,
          cita: r.contrato_cita || null, tipoCambio: num(r.tipo_cambio),
          manoObra: num(r.contrato_mano_obra), materiales: num(r.contrato_materiales),
          // D1 (18/09/2026): el margen cotizado lo define la base, una sola vez, y acá se lee.
          margenCotizado: num(r.margen_cotizado), gastosGenerales: num(r.gastos_generales_cotizados),
        }
      : null,
    presup,
    consumo,
    consumidoTotal,
    // Sin fila de mano de obra el consumido NO incluye jornales: todo cálculo que lo use es parcial.
    consumoSinManoObra: !consumo.mano_obra,
    econ: e
      ? {
          adicionales: num(e.adicionales_aprobados), nAdicionales: Number(e.n_adicionales_aprobados || 0),
          certificado: num(e.certificado), facturado: num(e.facturado), cobrado: num(e.cobrado),
          nCobranzas: Number(e.n_cobranzas || 0),
        }
      : null,
  }
}

async function ensamblar(obra) {
  return armar(obra, await leerFuentes([obra.id]))
}

// ── FORMATO ─────────────────────────────────────────────────────────────────────────────────────

const recortar = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

function lineaContratado(c) {
  if (!c || (c.monto == null && c.usd == null)) return '• Contratado: **sin dato** _(DESCONOCIDO — no hay contrato, OC, presupuesto ni formulario con precio)_'
  const o = ORIGEN_CONTRATADO[c.origen] || { texto: c.origen ? `origen «${c.origen}»` : 'origen sin declarar', esPrecio: true }
  const partes = []
  if (c.usd != null) {
    // D6 (18/09/2026): «U$S 63.000 = $ 139 M a TC 1.511» era falso: 63.000 × 1.511 son $ 95 M; el resto es
    // el fondo de materiales, que el contrato pacta en pesos. Se dice cada parte con su moneda.
    partes.push(`**${usd(c.usd)}**`)
    if (c.manoObra != null && c.materiales != null && c.materiales > 0 && c.monto != null) {
      partes.push(`de mano de obra (= ${ars(c.manoObra)}${c.tipoCambio ? ` a TC ${fmtNum.format(c.tipoCambio)}` : ''}) + ${ars(c.materiales)} de materiales en pesos = ${ars(c.monto)}`)
    } else if (c.monto != null) {
      partes.push(`= ${ars(c.monto)}${c.tipoCambio ? ` a TC ${fmtNum.format(c.tipoCambio)}` : ''}`)
    }
  } else {
    partes.push(`**${ars(c.monto)}**`)
  }
  const fuente = c.fuente ? ` «${c.fuente}»` : c.referencia ? ` (${c.referencia})` : ''
  const etiqueta = o.esPrecio ? '_(DATO)_' : '_(DATO — no es precio: no sirve para margen)_'
  const L = [`• Contratado: ${partes.join(' ')} · ${o.texto}${fuente}  ${etiqueta}${o.esPrecio ? '' : ' ⚠️'}`]
  if (c.manoObra != null && c.materiales != null && c.materiales > 0) {
    L.push(`   ↳ mano de obra ${ars(c.manoObra)} · materiales ${ars(c.materiales)}${c.cita ? ` — ${recortar(c.cita, 160)}` : ''}`)
  } else if (c.cita) {
    L.push(`   ↳ ${recortar(c.cita, 160)}`)
  }
  return L.join('\n')
}

function bloquePresupuesto(p) {
  if (!p) return ['• Presupuesto: **sin lectura cargada** _(DESCONOCIDO — correr cargar-presupuesto-rubros para esta obra)_']
  if (p.estado !== 'leido') return [`• Presupuesto: **sin presupuesto** _(DESCONOCIDO)_ — ${p.motivo || 'sin motivo declarado'}`]
  const moneda = p.moneda === 'USD' ? usd : ars
  const fuente = p.fuente ? ` · «${p.fuente}»${p.fecha ? ` del ${fecha(p.fecha)}` : ''}` : ''
  const L = [`• Presupuestado (costo directo): **${moneda(p.total)}**${fuente}  _(${p.estimado ? 'ESTIMACIÓN' : 'DATO'})_`]
  for (const k of RUBROS) {
    const x = p.rubros[k]
    if (x.monto == null) L.push(`   – ${ROTULO_RUBRO[k]}: sin presupuesto _(DESCONOCIDO)_${x.motivo ? ` — ${x.motivo}` : ''}`)
    else {
      const extra = []
      if (k === 'mano_obra' && p.hh != null) extra.push(`${fmtNum.format(p.hh)} HH`)
      if (x.monto === 0 && x.motivo) extra.push(x.motivo)
      if (x.estimado) extra.push('estimado')
      L.push(`   – ${ROTULO_RUBRO[k]}: ${moneda(x.monto)}${extra.length ? ` (${extra.join(' · ')})` : ''}`)
    }
  }
  return L
}

function lineaConsumoRubro(k, c, presupMonto, enCurso) {
  if (!c || c.monto == null) {
    return k === 'mano_obra'
      ? `   – ${ROTULO_RUBRO[k]}: sin quincenas valorizadas _(DESCONOCIDO)_`
      : `   – ${ROTULO_RUBRO[k]}: sin comprobantes imputados _(DATO: $ 0)_`
  }
  const partes = [`${ars(c.monto)}`]
  if (k === 'mano_obra') {
    partes.push(`${c.n} quincena${c.n === 1 ? '' : 's'}`)
    if (c.estimado) partes.push(`de las cuales ${ars(c.estimado)} estimadas _(INFERENCIA)_`)
  } else {
    partes.push(`${c.n} comprobante${c.n === 1 ? '' : 's'}`)
    const top = [...c.detalle].sort((a, b) => Number(b.monto || 0) - Number(a.monto || 0)).slice(0, 3)
    if (top.length) partes.push(top.map((g) => `${g.grupo} ${ars(g.monto)}`).join(', '))
  }
  let cierre = ''
  if (presupMonto != null) {
    const dif = presupMonto - c.monto
    if (presupMonto === 0) cierre = c.monto > 0 ? ` → **excedido ${ars(c.monto)}** (presupuesto $ 0) _(CÁLCULO)_ ⚠️` : ''
    else if (dif >= 0) cierre = ` → queda ${ars(dif)} (${pct(dif / presupMonto)}${enCurso ? '' : ', obra cerrada'}) _(CÁLCULO)_`
    else cierre = ` → **excedido ${ars(-dif)}** (${pct(-dif / presupMonto)}) _(CÁLCULO)_ ⚠️`
  }
  return `   – ${ROTULO_RUBRO[k]}: ${partes.join(' · ')}${cierre}`
}

/** Cuadro económico legible de una obra. `d` = salida de ensamblar(). */
function formatCuadro(d) {
  const { obra, contratado, presup, consumo, enCurso } = d
  const L = []
  L.push(`**${obra.nombre}** (${obra.id}) · estado: ${obra.estado || '?'}${enCurso ? ' (en curso → cifras a la fecha, parciales)' : ' (cerrada → cifras finales)'}${obra.cliente_texto ? ` · cliente: ${obra.cliente_texto}` : ''}`)
  L.push('')
  L.push(lineaContratado(contratado))
  L.push(...bloquePresupuesto(presup))

  // Consumido a la fecha, por rubro, neto de IVA (la misma función que la ficha y Analíticas).
  const hayConsumo = RUBROS.some((k) => consumo[k])
  const presupLeido = presup && presup.estado === 'leido'
  if (!hayConsumo) {
    L.push('• Consumido a la fecha: **sin comprobantes ni quincenas imputados a esta obra** _(DESCONOCIDO)_')
  } else {
    const total = d.consumidoTotal
    L.push(`• Consumido a la fecha (neto de IVA): **${ars(total)}**${d.consumoSinManoObra ? ' — sin mano de obra' : ''}  _(DATO)_`)
    for (const k of RUBROS) {
      const presupMonto = presupLeido ? presup.rubros[k].monto : null
      L.push(lineaConsumoRubro(k, consumo[k], presupMonto, enCurso))
    }
  }

  // Cálculos: sólo con las dos patas y sólo sobre un contratado que sea precio.
  const precio = contratado && contratado.esPrecio && contratado.monto != null ? contratado.monto : null
  const calc = []
  // D1 (18/09/2026): el margen cotizado NO se calcula acá. Lo define `obra_economia_rubros.margen_cotizado`
  // (contratado − costo directo presupuestado − gastos generales) y es la misma cifra que la ficha.
  if (contratado && contratado.margenCotizado != null) {
    const m = contratado.margenCotizado
    calc.push(`→ Margen cotizado: **${ars(m)}** (${pct(precio ? m / precio : null)})  _(DATO de la base = contratado − presupuestado − gastos generales${contratado.gastosGenerales != null ? ` ${ars(contratado.gastosGenerales)}` : ''})_`)
  } else if (precio != null && presupLeido && presup.total != null) {
    calc.push('→ Margen cotizado: sin dato — la cotización no tiene gastos generales cargados en `presupuestos`.  _(DESCONOCIDO)_')
  }
  // Total consumido y margen a la fecha: SÓLO con mano de obra adentro. Sin jornales, «contratado −
  // compras» no es un margen y decirlo con dos decimales sería precisión falsa: se compara por rubro.
  if (hayConsumo && d.consumoSinManoObra) {
    calc.push('→ Sin mano de obra consumida no hay consumo total ni margen a la fecha comparables: la comparación válida es por rubro (arriba).')
  } else if (d.consumidoTotal != null) {
    if (presupLeido && presup.total != null && presup.moneda !== 'USD') {
      const dif = presup.total - d.consumidoTotal
      calc.push(dif >= 0
        ? `→ Del presupuesto queda ${ars(dif)} (${pct(presup.total ? dif / presup.total : null)})  _(CÁLCULO)_`
        : `→ Presupuesto **excedido en ${ars(-dif)}** (${pct(presup.total ? -dif / presup.total : null)})  _(CÁLCULO)_ ⚠️`)
    }
    if (precio != null) {
      const margenReal = precio - d.consumidoTotal
      calc.push(`→ Margen ${enCurso ? 'a la fecha (parcial)' : 'real'}: **${ars(margenReal)}** (${pct(precio ? margenReal / precio : null)})  _(CÁLCULO = contratado − consumido)_`)
    }
  }
  if (contratado && !contratado.esPrecio && contratado.monto != null) {
    calc.push('→ Sin margen: lo contratado es una suma viva de Cobranzas, no un precio. Falta el contrato o la OC de esta obra.')
  }
  if (calc.length) L.push('', ...calc)

  // Adicionales, certificado, cobrado (obra_economia).
  const e = d.econ
  if (e) {
    const partes = []
    if (e.nAdicionales > 0) partes.push(`adicionales aprobados ${ars(e.adicionales)} (${e.nAdicionales})`)
    if (e.certificado != null) partes.push(`certificado ${ars(e.certificado)}`)
    if (e.facturado != null) partes.push(`facturado ${ars(e.facturado)}`)
    if (e.cobrado != null) partes.push(`cobrado ${ars(e.cobrado)}${e.nCobranzas ? ` (${e.nCobranzas} cobranzas)` : ''}`)
    L.push('')
    L.push(partes.length
      ? `• ${partes.join(' · ')}  _(DATO — lo facturado no es precio)_`
      : '• Adicionales / certificado / cobrado: sin registros ligados a esta obra _(DESCONOCIDO)_')
  }

  const faltas = []
  if (!presupLeido) faltas.push('presupuesto por rubro')
  if (d.consumoSinManoObra) faltas.push('mano de obra consumida')
  if (faltas.length) L.push('', `_Falta ${faltas.join(' y ')} para el cuadro completo._`)

  L.push('', '_Qué contiene cada rubro:_')
  for (const k of RUBROS) L.push(`_${ROTULO_RUBRO[k]}: ${DEFINICION_RUBRO[k]}_`)
  return L.join('\n')
}

// ── DESVÍOS ──────────────────────────────────────────────────────────────────────────────────────

/** Desvíos económicos YA CALCULADOS de todas las obras, para la vigilancia autónoma y el briefing.
 *  Misma fuente que el cuadro (obra_economia_rubros + costo_de_obras_por_rubro). Devuelve strings
 *  «Obra (estado[, en curso→parcial]): flag; flag». [] si no hay desvío material o falta dato.
 *  - por rubro: consumido > presupuestado × (1 + sobreCostoMin), o consumo sin presupuesto (presup 0);
 *  - total y margen: sólo cuando el consumo incluye mano de obra (si no, el total es parcial y no compara);
 *  - margen: sólo obras cerradas y contratado que sea precio (nunca una suma viva). */
export async function desviosObras({ margenGapMin = 0.03, sobreCostoMin = 0.05, soloCerradas = false } = {}) {
  const { rows: obras } = await query(
    `select id, nombre, estado, cliente_texto from public.obra_canonica
      where fusionada_en is null and ${SIN_PRUEBAS} order by nombre`)
  const fuentes = await leerFuentes(obras.map((o) => o.id))
  const alerts = []
  for (const obra of obras) {
    const d = armar(obra, fuentes)
    if (!RUBROS.some((k) => d.consumo[k])) continue // sin consumo cargado → nada que comparar aún
    if (soloCerradas && d.enCurso) continue
    if (!d.presup || d.presup.estado !== 'leido' || d.presup.moneda === 'USD') continue // sin presupuesto en pesos no hay contra qué medir
    const flags = []
    for (const k of RUBROS) {
      const p = d.presup.rubros[k].monto
      const c = d.consumo[k]?.monto
      if (p == null || c == null) continue
      if (p === 0 && c > 0) flags.push(`${ROTULO_RUBRO[k].toLowerCase()} sin presupuesto: consumido ${ars(c)}`)
      else if (p > 0 && (c - p) / p > sobreCostoMin) flags.push(`${ROTULO_RUBRO[k].toLowerCase()} excedido ${pct((c - p) / p)} (consumido ${ars(c)} vs presup ${ars(p)})`)
    }
    if (!d.consumoSinManoObra && d.presup.total > 0 && d.consumidoTotal != null) {
      const desvio = (d.consumidoTotal - d.presup.total) / d.presup.total
      if (desvio > sobreCostoMin) flags.push(`sobre-costo total ${pct(desvio)} (consumido ${ars(d.consumidoTotal)} vs presup ${ars(d.presup.total)})`)
      const precio = d.contratado?.esPrecio && d.contratado.monto ? d.contratado.monto : null
      if (!d.enCurso && precio) {
        const margenReal = (precio - d.consumidoTotal) / precio
        // D1: el margen cotizado es el de la base (con gastos generales), no una resta local.
        if (d.contratado?.margenCotizado == null) continue
        const margenCot = d.contratado.margenCotizado / precio
        const gap = margenReal - margenCot
        if (gap < -margenGapMin) flags.push(`margen real ${pct(margenReal)} vs cotizado ${pct(margenCot)} (${pct(gap)})`)
      }
    }
    if (flags.length) alerts.push(`${obra.nombre} (${obra.estado}${d.enCurso ? ', en curso→parcial' : ''}): ${flags.join('; ')}`)
  }
  return alerts
}

/** APRENDIZAJE DE POST-MORTEM (0 API): los desvíos REALES y el cambio sugerido de cotización de
 *  las obras YA CERRADAS, leídos de public.post_mortems. Distinto de desviosObras: esto trae el
 *  aprendizaje RICO que ya se documentó al cerrar (ej. Galpones: HH +19%, costo +23%, "ajustar
 *  coeficientes de rendimiento Civil"). `post_mortems.obra_id` apunta a la tabla legacy `obras`:
 *  se lee sólo el nombre. Es lo que hace que cada obra cerrada mejore la próxima cotización. */
export async function aprendizajesPostMortem() {
  const { rows } = await query(
    `select coalesce(o.nombre,'obra') nombre, to_char(p.fecha_cierre,'DD/MM/YYYY') cierre,
            p.causas_desvio, p.cambios_sugeridos_cotizacion
       from public.post_mortems p left join public.obras o on o.id = p.obra_id
      where p.estado = 'cerrado' order by p.fecha_cierre desc nulls last limit 6`)
  return rows.map((r) => {
    const causa = String(r.causas_desvio || '').replace(/\s+/g, ' ').trim()
    const cambio = String(r.cambios_sugeridos_cotizacion || '').replace(/\s+/g, ' ').trim()
    const causaCorta = causa.slice(0, 190) // inicio de las causas (trae los % de desvío HH/costo)
    return `${r.nombre} (cerrada ${r.cierre}): ${causaCorta}${cambio ? ' → Cambio para cotizar: ' + cambio.slice(0, 240) : ''}`
  })
}

// ── API ─────────────────────────────────────────────────────────────────────────────────────────

const norm = (s) => String(s || '').trim().toLowerCase().replace(/[áéíóúñ]/g, (c) => 'aeioun'['áéíóúñ'.indexOf(c)])

/** API principal: cuadro económico. Sin nombre → lista todas las obras con 1 línea c/u.
 *  Con nombre → cuadro completo de la que coincide (o desambigua si hay varias). */
export async function cuadroEconomico(nombre) {
  const obras = await findObras(nombre)
  if (!obras.length) {
    return nombre
      ? `No encontré ninguna obra que coincida con "${nombre}". Probá con parte del nombre, o pedime "lista de obras".`
      : 'No hay obras cargadas todavía.'
  }
  // Preferencia por match EXACTO (nombre o id): si coincide exacto con una obra, es esa, aunque
  // otras la contengan como substring (ej. "ME - BSA" vs "ME - BSA ADICIONAL").
  const pedido = norm(nombre)
  const exacta = nombre ? obras.find((o) => norm(o.nombre) === pedido || norm(o.id) === pedido) : null
  if (exacta) return formatCuadro(await ensamblar(exacta))
  if (nombre && obras.length === 1) return formatCuadro(await ensamblar(obras[0]))
  if (nombre) {
    const nombres = obras.map((o) => `"${o.nombre}"`).join(', ')
    return `Hay varias obras que coinciden con "${nombre}": ${nombres}. ¿Cuál querés?`
  }
  // Sin nombre → resumen de todas, con las mismas fuentes (un viaje por fuente).
  const fuentes = await leerFuentes(obras.map((o) => o.id))
  const lines = ['**Cuadro económico — todas las obras**  _(contratado · presupuestado · consumido neto de IVA a la fecha; parcial donde falta dato)_', '']
  for (const o of obras) {
    const d = armar(o, fuentes)
    const c = d.contratado
    const contr = !c || (c.monto == null && c.usd == null) ? 'sin contratado'
      : `contratado ${c.usd != null ? usd(c.usd) : ars(c.monto)}${c.esPrecio ? '' : ' (suma viva, no es precio)'}`
    const pres = d.presup?.estado === 'leido' ? `presup. ${ars(d.presup.total)}` : 'sin presup.'
    const cons = d.consumidoTotal != null ? `consumido ${ars(d.consumidoTotal)}${d.consumoSinManoObra ? ' (sin MO)' : ''}` : 'sin consumo'
    lines.push(`• **${o.nombre}** (${o.estado || '?'}): ${contr} · ${pres} · ${cons}`)
  }
  lines.push('', 'Pedime el cuadro de una obra puntual (ej. "cómo va Quattropani económicamente") para el detalle por rubro.')
  return lines.join('\n')
}
