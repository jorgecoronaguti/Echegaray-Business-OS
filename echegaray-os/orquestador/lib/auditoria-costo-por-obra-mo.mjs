// LOS HALLAZGOS DE MANO DE OBRA Y DE HORAS — la otra mitad de «MO, MA, SUB por obra».
//
// Viven aparte de `auditoria-costo-por-obra-hallazgos.mjs` porque son OTRA cañería: las horas no
// entran por la pestaña Compras sino por JORNALES y por la app, se valorizan con `costo_mo_quincena`
// y las lee `hh_de_obra`. No comparten una sola función con la conciliación de materiales, y tenerlos
// juntos hacía un archivo de 558 líneas donde nadie encontraba nada.
//
// Puro: recibe filas y devuelve hallazgos. El IO vive en el script.

import { TOLERANCIA, dia, diferencia } from './auditoria-costo-por-obra.mjs'

const h = (tipo, o) => ({ tipo, obra: null, fila: null, importe: 0, detalle: '', causa: '', correccion: '', ...o })
const num = (x) => Number(x ?? 0)

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
 * 20 · MO Y MA NO VIVEN EN EL MISMO NIVEL DE OBRA, Y ASÍ NINGÚN MARGEN POR OBRA ES USABLE.
 *
 * Las horas llegan por el alias de JORNALES, que nombra al CLIENTE («SAN FRANCISCO»), y caen en la
 * obra paraguas. Los materiales llegan por la columna L de Compras, que nombra la sub-obra
 * («SF - PISOS INDUSTRIALES»). Resultado: la obra paraguas publica 12.117 h y $40.000 de materiales,
 * y la sub-obra publica materiales y casi ninguna hora. Las dos cifras son correctas por separado y
 * la resta entre ellas no significa nada.
 */
export function nivelesDistintos(obras, app, mo, umbral = 1_000_000) {
  const out = []
  for (const o of obras) {
    const a = app.get(o.id)
    const materia = num(a?.materiales) + num(a?.subcontratos)
    const manoObra = num(a?.mano_obra)
    const horas = num(mo.get(o.id)?.horas)
    if (manoObra > umbral && materia <= umbral) {
      out.push(h('mo_sin_materiales', {
        obra: o.codigo, importe: manoObra,
        detalle: `${horas} h y ${manoObra} de mano de obra contra ${materia} de materiales y subcontratos`,
        causa: 'las horas entran por el alias de JORNALES (que nombra al cliente) y los materiales por la columna L (que nombra la sub-obra)',
        correccion: 'imputar las horas a la sub-obra, o consolidar el margen a nivel cliente; hoy el margen por obra no se puede leer',
      }))
      continue
    }
    if (materia > umbral && manoObra === 0 && horas === 0) {
      out.push(h('materiales_sin_mo', {
        obra: o.codigo, importe: materia,
        detalle: `${materia} de materiales y subcontratos sin una sola hora imputada`,
        causa: 'la obra recibió compras pero sus horas quedaron en la obra paraguas del cliente',
        correccion: 'la misma: decidir a qué nivel se mide la obra y llevar las dos mitades ahí',
      }))
    }
  }
  return out
}


/**
 * 22 · `hh_de_obra()` CONTRA LAS HORAS QUE DE VERDAD CUESTAN.
 *
 * La pantalla de HH llama a `hh_de_obra(obra, desde)`, que acota la ventana al período de la obra;
 * el costo de mano de obra sale de `costo_mo_quincena`, que NO la acota. Cuando una obra tiene horas
 * fuera de su ventana declarada, la pantalla muestra menos horas de las que está pagando — y el
 * peso por hora que alguien calcule dividiendo una por la otra sale mal.
 */
export function hhDeObraVsLasQueCuestan(obras, hhRpc, porObra, tol = 0.5) {
  const cuentan = new Map(porObra.map((r) => [r.obra_id, num(r.horas_que_cuentan)]))
  const out = []
  for (const o of obras) {
    const j = hhRpc.get(o.id)
    if (!j) continue
    const suma = (j.periodos ?? []).reduce((a, p) => a + num(p.hh), 0)
    const real = cuentan.get(o.id) ?? 0
    if (Math.abs(suma - real) <= tol) continue
    out.push(h('hh_de_obra_recorta_la_ventana', {
      obra: o.codigo, importe: 0,
      detalle: `hh_de_obra publica ${suma} h entre ${j.desde} y ${j.hasta}; las que cuestan a la obra son ${real}`,
      causa: '`hh_de_obra` acota la ventana al período declarado de la obra y `costo_mo_quincena` no',
      correccion: 'que las dos usen la misma ventana, o que la pantalla declare que hay horas fuera del período',
    }))
  }
  return out
}
