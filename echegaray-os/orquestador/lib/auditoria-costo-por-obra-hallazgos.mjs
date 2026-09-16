// DE LOS DATOS CRUDOS A LOS HALLAZGOS — puro, sin red ni base, para poder probarlo con fixtures.
//
// Un hallazgo es siempre `{tipo, obra, fila, importe, detalle, causa, correccion}`. `importe` es la
// plata que el hallazgo pone en duda: es lo que ordena el informe y lo que hace que «19 hallazgos»
// signifique algo. Un hallazgo sin importe lleva 0 y se ordena por tipo, no se omite.
//
// `correccion` describe qué habría que hacer y NUNCA se aplica desde acá: esta auditoría es de sólo
// lectura por mandato, y una corrección automática sobre una imputación de obra es exactamente el
// tipo de escritura que el dueño tiene que firmar.

import {
  TOLERANCIA, aLaFecha, dia, diferencia, duplicadosProbables, esFilaViva, huellaDeObra,
  norm, otraObraNombrada, parseObraCelda, pesos,
} from './auditoria-costo-por-obra.mjs'

const h = (tipo, o) => ({ tipo, obra: null, fila: null, importe: 0, detalle: '', causa: '', correccion: '', ...o })
const num = (x) => Number(x ?? 0)

/** El catálogo de obras con su huella, listo para `otraObraNombrada`. */
export const catalogoDeObras = (obras) => obras
  .map((o) => ({ ...o, huella: huellaDeObra(o.nombre) }))
  .filter((o) => o.huella)

/** 1 · LA PESTAÑA VIVA CONTRA SU ESPEJO. Cualquier diferencia es el sync atrasado o roto. */
export function espejoDesfasado(sheetPorDestino, espejoPorDestino, tol = TOLERANCIA) {
  const out = []
  for (const clave of new Set([...sheetPorDestino.keys(), ...espejoPorDestino.keys()])) {
    const a = sheetPorDestino.get(clave); const b = espejoPorDestino.get(clave)
    for (const campo of ['materiales', 'subcontratos']) {
      const d = diferencia(campo, num(a?.[campo]), num(b?.[campo]), tol)
      if (!d) continue
      out.push(h('espejo_desfasado', {
        obra: clave, importe: d.dif,
        detalle: `${campo}: la pestaña dice ${d.izquierda} y compra_sheet ${d.derecha}`,
        causa: 'el sync de Compras no corrió después de la última edición, o abortó',
        correccion: 'correr `node orquestador/scripts/sync-compras.mjs` y volver a medir',
      }))
    }
  }
  return out
}

/**
 * 2 · LA FILA QUE EL DUEÑO VE Y LA APP NO SUMA.
 *
 * `esCostoDeObra` exige `total > 0`: toda NOTA DE CRÉDITO imputada a una obra se cae del costo. El
 * efecto es unidireccional y siempre en contra — la app cobra de más.
 */
export function filasQueNoLleganAlCosto(filas) {
  return filas
    .filter((f) => esFilaViva(f) && parseObraCelda(f.obra_celda).tipo === 'obra' && !f.en_costos_obra)
    .map((f) => h('fila_no_llega_al_costo', {
      obra: parseObraCelda(f.obra_celda).clave, fila: f.fila, importe: pesos(f.total),
      detalle: `${f.proveedor ?? '—'} ${f.comprobante ?? ''} · ${pesos(f.total)} · ${f.tipo ?? ''}`.trim(),
      causa: pesos(f.total) <= 0
        ? 'esCostoDeObra() exige total > 0: la nota de crédito no llega a costos_obra y la app no la resta'
        : 'la fila no tiene «Cliente / Asignación» (J) y esCostoDeObra() la descarta',
      correccion: pesos(f.total) <= 0
        ? 'cambiar el corte de `orquestador/lib/compras-costo-de-obra.mjs` a `Number(total) !== 0`'
        : 'completar la columna J de la fila, o hacer que la regla mire la columna L en vez de J',
    }))
}

/** 3 · LA COLUMNA L DICE UNA OBRA Y LA ASIGNACIÓN QUE CONSUME LA APP DICE OTRA. */
export function asignacionDistintaDeLaColumna(filas) {
  return filas
    .filter((f) => esFilaViva(f) && f.obra_id && f.asignada_obra && f.obra_id !== f.asignada_obra)
    .map((f) => h('asignacion_distinta_de_la_columna', {
      obra: parseObraCelda(f.obra_celda).clave, fila: f.fila, importe: pesos(f.total),
      detalle: `la columna L dice ${f.obra_id} y compra_obra_asignada dice ${f.asignada_obra} (vía ${f.via})`,
      causa: 'la asignación no se recalculó después de que el dueño editó la columna L',
      correccion: 'volver a correr el sync; si persiste, la regla de `compras-obra-asignada.mjs` ignora la fila',
    }))
}

/** 4 · LA RPC CONTRA EL RECUENTO INDEPENDIENTE SOBRE EL ESPEJO. */
export function rpcVsRecuento(obras, rpc, recuento, tol = TOLERANCIA) {
  const out = []
  for (const o of obras) {
    const a = rpc.get(o.id); const b = recuento.get(o.id)
    for (const campo of ['materiales', 'subcontratos']) {
      const d = diferencia(campo, num(a?.[campo]), num(b?.[campo]), tol)
      if (!d) continue
      out.push(h('rpc_vs_recuento', {
        obra: o.codigo, importe: d.dif,
        detalle: `${campo}: costo_de_obras_a_la_fecha dice ${d.izquierda} y el recuento sobre compra_sheet ${d.derecha}`,
        causa: 'costos_obra quedó viejo respecto del espejo, o la RPC filtra algo que la regla no declara',
        correccion: 'comparar `costos_obra` contra `compra_sheet` fila por fila para esa obra',
      }))
    }
  }
  return out
}

/**
 * 5 · EL PUENTE ENTRE LO QUE EL DUEÑO VE Y LO QUE LA APP SUMA — obra por obra, con nombre y apellido.
 *
 * Cada fila que la columna L manda a una obra o entra al costo o tiene un MOTIVO. Los motivos no son
 * todos iguales: tres son reglas de negocio declaradas (estructura, área, futuro) y tres son
 * DEFECTOS —la fila desaparece sin que nadie la haya decidido—. El residuo, si queda alguno, es el
 * peor hallazgo posible: plata que se fue por un camino que la auditoría no conoce.
 */
export const MOTIVOS_DECLARADOS = Object.freeze(['unidad_estructura', 'destino_estructura', 'area_personas',
  'area_contabilidad_legales', 'area_administracion_finanzas'])
export const MOTIVOS_DEFECTO = Object.freeze(['importe_no_positivo', 'sin_cliente_en_J', 'sin_asignacion'])

/**
 * Por qué esta fila no llega al costo de su obra. `null` = sí llega. El orden es la atribución: los
 * motivos DECLARADOS se evalúan primero, así un defecto nunca se reporta sobre una fila que de todas
 * formas salía por una regla de negocio.
 *
 * `sinObra` cambia qué significa «asignada»: en el cajón «Sin obra – CLIENTE» la fila llega con
 * `obra_id` nulo y `via = 'sin_obra'` —eso ES su asignación—, y leerlo como falta de asignación
 * marcaba 211 filas y $75 M de defecto inexistente.
 */
export function motivoDeExclusion(f, hoy, { sinObra = false } = {}) {
  if (!esFilaViva(f)) return 'anulada'
  const u = String(f.unidad_negocio ?? '').trim().toUpperCase()
  if (['ESTRUCTURA', 'IMPUESTOS', 'FINANCIERO'].includes(u)) return 'unidad_estructura'
  const d = String(f.destino ?? '')
  if (['estructura_admin', 'estructura_taller', 'ES-ADM', 'ES-TAL', 'IMP', 'FIN'].includes(d)) return 'destino_estructura'
  const area = String(f.area_calculada ?? '')
  if (['personas', 'contabilidad_legales', 'administracion_finanzas'].includes(area)) return `area_${area}`
  if (pesos(f.total) <= 0) return 'importe_no_positivo'
  if (!f.obra_texto) return 'sin_cliente_en_J'
  if (sinObra ? f.via !== 'sin_obra' : !f.asignada_obra) return 'sin_asignacion'
  return null
}

/** El puente de UNA obra: total de la columna L, cada motivo con su plata, y el residuo. */
export function puenteDeObra(filasDeLaObra, appTotal, hoy, opciones = {}) {
  const motivos = new Map()
  let bruto = 0; let entra = 0; let porVencer = 0
  for (const f of filasDeLaObra) {
    const { a_la_fecha: t, por_vencer: pv } = aLaFecha(f, hoy)
    const m = motivoDeExclusion(f, hoy, opciones)
    if (m === 'anulada') continue
    bruto = pesos(bruto + t)
    if (m === null) { entra = pesos(entra + t); porVencer = pesos(porVencer + pv); continue }
    if (!motivos.has(m)) motivos.set(m, { motivo: m, importe: 0, filas: [] })
    const g = motivos.get(m); g.importe = pesos(g.importe + t); g.filas.push(f.fila)
  }
  return { bruto, entra, por_vencer: porVencer, motivos: [...motivos.values()], residuo: pesos(entra - pesos(appTotal)) }
}

/** El puente de todas las obras, convertido en hallazgos. */
export function conciliacionPorObra(obras, filas, app, hoy, tol = TOLERANCIA) {
  const out = []
  for (const o of obras) {
    const suyas = filas.filter((f) => parseObraCelda(f.obra_celda).codigo === o.codigo)
    if (!suyas.length) continue
    const a = app.get(o.id)
    const p = puenteDeObra(suyas, num(a?.materiales) + num(a?.subcontratos), hoy)
    for (const m of p.motivos.filter((x) => MOTIVOS_DEFECTO.includes(x.motivo))) {
      out.push(h('app_no_suma_lo_que_el_dueno_ve', {
        obra: o.codigo, fila: m.filas.join(', '), importe: m.importe,
        detalle: `${m.importe} en ${m.filas.length} fila(s) salen del costo por «${m.motivo}», que no es una regla declarada`,
        causa: m.motivo === 'importe_no_positivo'
          ? 'esCostoDeObra() exige total > 0 y descarta las notas de crédito de la obra'
          : 'la fila no llega a `compra_obra_asignada` porque la columna J está vacía',
        correccion: m.motivo === 'importe_no_positivo'
          ? 'en `compras-costo-de-obra.mjs`, cambiar `Number(total) > 0` por `Number(total) !== 0`'
          : 'completar la columna J, o asignar por la columna L cuando J esté vacía',
      }))
    }
    if (Math.abs(p.residuo) > tol) {
      out.push(h('conciliacion_incompleta', {
        obra: o.codigo, importe: p.residuo,
        detalle: `la columna L manda ${p.bruto}; descontando los motivos conocidos quedan ${p.entra} y la app publica ${pesos(num(a?.materiales) + num(a?.subcontratos))}`,
        causa: 'hay un filtro en el camino que esta auditoría no modela — es el hallazgo más grave posible',
        correccion: 'no tocar ningún dato hasta entender el camino; el número de la pantalla no es explicable',
      }))
    }
  }
  return out
}

/** El puente completo, para el informe (no es un hallazgo: es la evidencia de los que sí lo son). */
export function puentes(obras, filas, app, hoy) {
  return obras.map((o) => {
    const suyas = filas.filter((f) => parseObraCelda(f.obra_celda).codigo === o.codigo)
    const a = app.get(o.id)
    return { codigo: o.codigo, nombre: o.nombre, ...puenteDeObra(suyas, num(a?.materiales) + num(a?.subcontratos), hoy) }
  }).filter((p) => p.bruto !== 0 || p.entra !== 0)
}

/** 6 · LA VISTA VIEJA `obra_costo_real`, que empareja POR TEXTO. Se mide para saber quién la lee. */
export function vistaViejaDiscrepa(obras, rpc, vista, tol = TOLERANCIA) {
  const out = []
  for (const o of obras) {
    const a = rpc.get(o.id); const v = vista.get(o.id)
    const app = num(a?.materiales) + num(a?.subcontratos)
    const d = diferencia('costo_real', num(v?.costo_real), app, tol)
    if (!d) continue
    out.push(h('vista_vieja_discrepa', {
      obra: o.codigo, importe: d.dif,
      detalle: `obra_costo_real dice ${d.izquierda} y la RPC ${d.derecha}`,
      causa: '`obra_costo_real` empareja por `norm_obra(obra_texto)` contra `obra_alias`, no por la columna L; '
        + '`obra_panel.costo_real` sale de ahí y es lo que muestra la pantalla de la OBRA (TitularObra/TabEconomia), '
        + 'mientras la ficha del CLIENTE muestra la RPC: dos números distintos para la misma obra',
      correccion: 'reescribir `obra_costo_real` sobre `compra_obra_asignada` (una sola definición) y retirar la vieja',
    }))
  }
  return out
}

/** 7 · EL TEXTO DE LA FILA NOMBRA OTRA OBRA — el defecto de «Galpón 5». */
export function otraObraEnElTexto(filas, catalogo) {
  const out = []
  for (const f of filas) {
    if (!esFilaViva(f) || parseObraCelda(f.obra_celda).tipo !== 'obra') continue
    const m = otraObraNombrada(f, catalogo)
    if (!m) continue
    out.push(h('otra_obra_nombrada', {
      obra: parseObraCelda(f.obra_celda).clave, fila: f.fila, importe: pesos(f.total),
      detalle: `L dice «${f.obra_celda}» y el texto nombra «${m.huella}» (${m.obra.codigo} ${m.obra.nombre})`,
      causa: 'la columna L se cargó sin mirar el detalle de la fila',
      correccion: `revisar con el comprobante y, si corresponde, mover la fila ${f.fila} a ${m.obra.codigo}`,
    }))
  }
  return out
}

/** 8 · EL CLIENTE DE LA COLUMNA J NO ES EL CLIENTE DE LA OBRA DE LA COLUMNA L. */
export function clienteContradiceObra(filas, obrasPorCodigo) {
  return filas
    .filter((f) => esFilaViva(f) && f.cliente_fila && parseObraCelda(f.obra_celda).tipo === 'obra')
    .filter((f) => {
      const o = obrasPorCodigo.get(parseObraCelda(f.obra_celda).codigo)
      return o?.cliente_canonico && o.cliente_canonico !== f.cliente_fila
    })
    .map((f) => {
      const o = obrasPorCodigo.get(parseObraCelda(f.obra_celda).codigo)
      return h('cliente_contradice_obra', {
        obra: o.codigo, fila: f.fila, importe: pesos(f.total),
        detalle: `J dice «${f.obra_texto}» (${f.cliente_fila}) y ${o.codigo} es de ${o.cliente_canonico}`,
        causa: 'la columna J y la columna L se cargaron en momentos distintos y nadie las cruzó',
        correccion: 'decidir cuál manda y corregir la otra; el costo va a la obra de L, la ficha del cliente a J',
      })
    })
}

/** 9 · LA UNIDAD DE NEGOCIO CONTRADICE EL DESTINO — lo que el propio espejo ya marcó. */
export function unidadContradiceDestino(filas) {
  return filas
    .filter((f) => esFilaViva(f) && f.obra_inconsistencia)
    .map((f) => h('unidad_contradice_destino', {
      obra: parseObraCelda(f.obra_celda).clave, fila: f.fila, importe: pesos(f.total),
      detalle: f.obra_inconsistencia,
      causa: 'la columna «Unidad de Negocio» (K del bloque viejo) y la columna «Obra» (L) dicen cosas distintas',
      correccion: 'corregir la unidad o la obra en la pestaña; hoy manda L y la unidad puede sacar la fila del costo',
    }))
}

/** 10 · UN SUBCONTRATISTA SIN OBRA. Un subcontrato siempre se ejecuta en una obra. */
export function subcontratistaSinObra(filas) {
  return filas
    .filter((f) => esFilaViva(f) && f.es_subcontrato && parseObraCelda(f.obra_celda).tipo !== 'obra')
    .map((f) => h('subcontratista_sin_obra', {
      obra: parseObraCelda(f.obra_celda).clave, fila: f.fila, importe: pesos(f.total),
      detalle: `${f.proveedor} · ${pesos(f.total)} · columna L: «${f.obra_celda ?? '(vacía)'}»`,
      causa: 'la fila quedó en el cajón del cliente o en estructura en vez de en su obra',
      correccion: 'imputar la fila a la obra donde se ejecutó el subcontrato',
    }))
}

/** 11 · DOS FILAS IGUALES: misma fecha, mismo proveedor, mismo importe. */
export function duplicados(filas) {
  return duplicadosProbables(filas).map((d) => h('duplicado_probable', {
    obra: d.obras.join(' · '), fila: d.filas.join(', '), importe: d.importe_en_riesgo,
    detalle: `${d.fecha} · ${d.proveedor} · ${d.total} × ${d.filas.length}`
      + (d.mismo_comprobante ? ' · MISMO N° de comprobante' : ` · comprobantes ${d.comprobantes.join(' / ')}`),
    causa: d.mismo_comprobante ? 'el mismo comprobante se cargó dos veces' : 'dos comprobantes distintos coinciden en fecha e importe',
    correccion: d.mismo_comprobante ? 'anular una de las dos filas con «ELIMINADO»' : 'verificar contra los dos papeles antes de tocar nada',
  }))
}

/** 12 · LA TABLA `subcontrato` CONTRA LAS COMPRAS DE ESE PROVEEDOR EN ESA OBRA. */
export function subcontratoSinRespaldo(subcontratos, tol = TOLERANCIA) {
  const out = []
  for (const s of subcontratos) {
    const enLaObra = num(s.facturado_en_la_obra); const total = num(s.facturado_total)
    if (enLaObra <= tol && total > tol) {
      out.push(h('subcontrato_facturado_en_otra_obra', {
        obra: s.obra_id, importe: total,
        detalle: `«${s.nombre}» (${s.proveedor_nombre ?? s.proveedor_texto}) contratado en ${s.precio_contratado}: `
          + `0 facturado en ${s.obra_id} y ${total} facturado en otras obras`,
        causa: 'el contrato cuelga de una obra y las compras de ese proveedor están imputadas a otra',
        correccion: 'decidir cuál es la obra real y mover el contrato o las filas de Compras, no las dos',
      }))
      continue
    }
    if (enLaObra > num(s.precio_contratado) + tol) {
      out.push(h('subcontrato_excedido', {
        obra: s.obra_id, importe: pesos(enLaObra - num(s.precio_contratado)),
        detalle: `«${s.nombre}»: contratado ${s.precio_contratado}, facturado en la obra ${enLaObra}`,
        causa: 'hay un adicional no cargado, o compras de otro concepto del mismo proveedor caen acá',
        correccion: 'cargar el adicional en `subcontrato` o separar las compras que no son del contrato',
      }))
    }
  }
  return out
}

/** 13 · LA MANO DE OBRA DE LA RPC CONTRA LA SUMA DE SUS QUINCENAS. */
export function moRpcVsQuincenas(obras, rpc, porQuincena, tol = TOLERANCIA) {
  const out = []
  for (const o of obras) {
    const a = rpc.get(o.id); const q = porQuincena.get(o.id)
    if (a?.mano_obra == null && q == null) continue
    const d = diferencia('mano_obra', num(a?.mano_obra), num(q?.costo_total), tol)
    if (d) {
      out.push(h('mo_rpc_vs_quincenas', {
        obra: o.codigo, importe: d.dif,
        detalle: `la RPC dice ${d.izquierda} y la suma de costo_mo_quincena ${d.derecha}`,
        causa: 'la RPC arranca las quincenas en el mes de la PRIMERA hora de la obra; las anteriores no entran',
        correccion: 'generar las quincenas desde el primer registro de HH de la empresa, no de la obra',
      }))
    }
    const horasSinTarifa = num(a?.horas_sin_tarifa)
    if (horasSinTarifa > 0) {
      out.push(h('mo_falta_dato', {
        obra: o.codigo, importe: 0,
        detalle: `${horasSinTarifa} h sin tarifa en ${num(a?.personas_sin_tarifa)} persona(s): el costo de esas horas es NULL`,
        causa: 'la persona no tiene `persona_tarifa` ni recibo del período',
        correccion: 'cargar la tarifa; hasta entonces la MO de la obra está SUBVALUADA y no lo dice en pantalla',
      }))
    }
  }
  return out
}

/** 14 · HH: lo que la vista cuenta, lo que saca, y lo que quedó sin obra. */
export function hallazgosDeHH({ porObra, despuesDelCierre, enObraFusionada }, obrasPorId) {
  const out = []
  for (const r of porObra) {
    if (r.obra_id === null) {
      out.push(h('hh_sin_obra', {
        obra: '(sin obra)', importe: 0,
        detalle: `${num(r.horas_crudas)} h en ${r.filas_sin_persona} fila(s) sin persona y sin obra canónica`,
        causa: 'el alias de la obra de JORNALES no resolvió, o la carga de la app no eligió obra',
        correccion: 'cargar el alias faltante; esas horas hoy no están en el costo de ninguna obra',
      }))
      continue
    }
    if (num(r.horas_de_jefe) > 0) {
      out.push(h('hh_de_jefe_en_obra', {
        obra: obrasPorId.get(r.obra_id)?.codigo ?? r.obra_id, importe: 0,
        detalle: `${num(r.horas_de_jefe)} h de jefe de obra cargadas en la obra; la vista las saca del costo`,
        causa: 'el jefe carga sus horas en la obra y la regla del 14/09 manda su costo entero a Estructura',
        correccion: 'ninguna en el dato: la pantalla de HH debería decir que esas horas no cuestan a la obra',
      }))
    }
  }
  for (const r of despuesDelCierre) {
    out.push(h('hh_despues_del_cierre', {
      obra: r.codigo, importe: 0,
      detalle: `${num(r.horas)} h en ${r.filas} fila(s) entre ${dia(r.desde)} y ${dia(r.hasta)}, con fin ${dia(r.fin)}`,
      causa: 'o la obra no está cerrada de verdad, o las horas son de otra obra',
      correccion: 'corregir la fecha de fin o reimputar las horas; hoy suman costo a una obra cerrada',
    }))
  }
  for (const r of enObraFusionada) {
    out.push(h('hh_en_obra_fusionada', {
      obra: r.codigo, importe: 0,
      detalle: `${num(r.horas)} h en ${r.filas} fila(s) apuntan a una obra fusionada en ${r.fusionada_en}`,
      causa: 'la fusión no reescribió `registros_hh.obra_canonica_id`',
      correccion: 'reapuntar los registros a la obra destino; hoy su costo no aparece en ninguna de las dos',
    }))
  }
  return out
}

/**
 * 15 · LO POR VENCER QUE PUBLICA LA APP, CONTRA EL QUE SALE DE LA PESTAÑA.
 *
 * Es el control de la regla nueva del dueño (15/09/2026: costo a la fecha = pagado + vencido). La
 * app lo calcula sobre `costos_obra` en SQL; acá se calcula sobre la columna L en JS. Si los dos
 * caminos no dan el mismo peso, la regla está implementada de dos maneras y una de las dos miente.
 */
export function porVencerDiscrepa(obras, filas, app, hoy, tol = TOLERANCIA) {
  const out = []
  for (const o of obras) {
    const suyas = filas.filter((f) => parseObraCelda(f.obra_celda).codigo === o.codigo)
    if (!suyas.length) continue
    const p = puenteDeObra(suyas, 0, hoy)
    const a = app.get(o.id)
    const publicado = num(a?.materiales_por_vencer) + num(a?.subcontratos_por_vencer)
    const d = diferencia('por_vencer', p.por_vencer, publicado, tol)
    if (!d) continue
    out.push(h('por_vencer_discrepa', {
      obra: o.codigo, importe: d.dif,
      detalle: `la pestaña deja ${d.izquierda} por vencer y la app publica ${d.derecha}`,
      causa: 'la «REGLA A LA FECHA» de `costo_de_obra_filas` y la lectura de la pestaña no coinciden',
      correccion: 'unificar la regla en un solo lugar y consumirla desde ahí',
    }))
  }
  return out
}

/** 16 · «Pagado / Total» con un monto pagado que no es el total de la fila. */
export function pagadoTotalNoCoincide(filas, tol = TOLERANCIA) {
  return filas
    .filter((f) => esFilaViva(f)
      && String(f.estado ?? '').trim().toLowerCase() === 'pagado'
      && String(f.pago_total_o_parcial ?? '').trim().toLowerCase() === 'total'
      && pesos(f.monto_pagado) !== 0
      && Math.abs(pesos(f.total) - pesos(f.monto_pagado)) > tol)
    .map((f) => h('pagado_total_no_coincide', {
      obra: parseObraCelda(f.obra_celda).clave, fila: f.fila,
      importe: pesos(pesos(f.total) - pesos(f.monto_pagado)),
      detalle: `dice «Pagado / Total» con total ${pesos(f.total)} y monto pagado ${pesos(f.monto_pagado)}`,
      causa: 'la fila se pagó con retención, con descuento, o el monto pagado quedó viejo',
      correccion: 'si hubo retención, la fila es «Parcial»; si no, corregir el monto pagado',
    }))
}

/** 17 · LA FILA SIN NINGUNA OBRA NI DESTINO: no está en ningún costo, ni de obra ni de estructura. */
export function filaSinDestino(filas) {
  return filas
    .filter((f) => esFilaViva(f) && parseObraCelda(f.obra_celda).tipo === 'vacia')
    .map((f) => h('fila_sin_destino', {
      obra: '(vacía)', fila: f.fila, importe: pesos(f.total),
      detalle: `${f.proveedor ?? '—'} ${f.comprobante ?? ''} · ${pesos(f.total)}`.trim(),
      causa: 'la columna «Obra» quedó vacía al cargar la fila',
      correccion: 'imputar la fila; hoy su costo no aparece en ninguna obra ni en estructura',
    }))
}

/** 18 · EL CAJÓN «Sin obra – CLIENTE»: no es una obra, pero su plata tiene que cuadrar igual. */
export function conciliacionSinObra(clientes, filas, sinObra, hoy, tol = TOLERANCIA) {
  const out = []
  for (const c of clientes) {
    const clave = `sin-obra:${norm(c.cliente_canonico)}`
    const suyas = filas.filter((f) => parseObraCelda(f.obra_celda).clave === clave)
    if (!suyas.length) continue
    const a = sinObra.get(c.cliente_id)
    const p = puenteDeObra(suyas, num(a?.materiales) + num(a?.subcontratos), hoy, { sinObra: true })
    for (const m of p.motivos.filter((x) => MOTIVOS_DEFECTO.includes(x.motivo))) {
      out.push(h('app_no_suma_lo_que_el_dueno_ve', {
        obra: `Sin obra – ${c.cliente_canonico}`, fila: m.filas.join(', '), importe: m.importe,
        detalle: `${m.importe} en ${m.filas.length} fila(s) salen del cajón del cliente por «${m.motivo}»`,
        causa: 'la misma regla `esCostoDeObra` que descarta las notas de crédito de las obras',
        correccion: 'en `compras-costo-de-obra.mjs`, cambiar `Number(total) > 0` por `Number(total) !== 0`',
      }))
    }
    if (Math.abs(p.residuo) > tol) {
      out.push(h('conciliacion_incompleta', {
        obra: `Sin obra – ${c.cliente_canonico}`, importe: p.residuo,
        detalle: `la columna L manda ${p.bruto}; con los motivos conocidos quedan ${p.entra} y la app publica ${pesos(num(a?.materiales) + num(a?.subcontratos))}`,
        causa: 'hay un filtro en el camino que esta auditoría no modela',
        correccion: 'no tocar ningún dato hasta entender el camino',
      }))
    }
  }
  return out
}

/** 19 · UNA CLÁUSULA DE LA RPC QUE NUNCA PUEDE SER FALSA. Un control que no puede decir que no. */
export function reglaMuerta(destinos, esperados = ['estructura_admin', 'estructura_taller', 'ES-ADM', 'ES-TAL', 'IMP', 'FIN']) {
  const vistos = destinos.map((d) => d.destino)
  if (esperados.some((e) => vistos.includes(e))) return []
  return [h('regla_muerta', {
    obra: '(todas)', importe: 0,
    detalle: `costo_de_obras_a_la_fecha filtra destino not in (${esperados.join(', ')}) y compra_sheet.destino `
      + `sólo toma ${vistos.join(', ')}: la cláusula nunca excluye una fila`,
    causa: 'la migración 20260915T0815 supuso los códigos de la columna L y la tabla guarda otros nombres',
    correccion: 'usar los valores reales (`estructura_admin`, `estructura_taller`) o borrar la cláusula; '
      + 'hoy el único filtro efectivo de estructura es `unidad_negocio`, y una unidad vacía pasa',
  })]
}
