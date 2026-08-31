// LA COSTURA: la cascada nueva con la forma exacta que `costo.mjs` YA consume.
//
// ═══ POR QUÉ UN ADAPTADOR Y NO UN CAMBIO EN `costo.mjs` ═══
//
// `costo.mjs` llama `precioVigente(codigo, observaciones, { hoy })` y usa nueve campos del objeto
// que vuelve. Reescribir ese archivo para que llame a la cascada nueva sería un cambio de forma en
// un archivo que otro frente está tocando, y esos dos cambios chocan en el merge.
//
// Este módulo devuelve una FUNCIÓN CON LA MISMA FIRMA DE TRES ARGUMENTOS y el mismo objeto de
// salida. Con eso, engancharlo es una línea: `costoDePartida` recibe el resolvedor como parámetro
// opcional con `precioVigente` de default, y quien arma la corrida decide cuál usa. Si el
// parámetro no se pasa, el comportamiento de hoy no cambia en absoluto.
//
// ═══ EL PROBLEMA DEL HUEVO Y LA GALLINA, Y CÓMO SE RESUELVE ═══
//
// La materialidad de un recurso es `cantidad × precio ÷ costo total`, o sea que para saber cuánto
// pesa hace falta el precio, y para decidir el precio hace falta saber cuánto pesa. No se resuelve
// adivinando: se resuelve pasando los pesos DESDE AFUERA, calculados una vez con los precios que
// haya (`pesosDeCotizacion` en la cáscara). Un peso calculado con precios viejos sigue siendo un
// peso válido: el orden de magnitud de «este recurso es el 30% de la obra» no cambia porque los
// precios sean de 2022, mientras la inflación los mueva a todos.
//
// Sin `pesos`, cada recurso sale con materialidad desconocida y la vigencia cae al piso de
// ignorancia del 5%. Eso es MÁS exigente que la regla vieja de 180 días, no menos: el adaptador no
// afloja nada por no saber.

import { ESTADO } from './contrato.mjs'
import { ORIGEN, RESULTADO, candidatoDePrecio, resolverPrecio } from './precio-resolucion.mjs'
import { comprasDeRecurso } from './compras-precio.mjs'
import { candidatoComparable } from './precio-comparable.mjs'

/** Qué `ESTADO` del contrato le corresponde a cada resultado. `costo.mjs` decide con esto —vía
 *  `sumable()`— si el número entra al total, así que el mapeo vive acá y no repartido. */
export const ESTADO_DE_RESULTADO = Object.freeze({
  VIGENTE: ESTADO.EXTRAIDO,
  ACTUALIZADO: ESTADO.EXTRAIDO,
  NECESITA_HUMANO: ESTADO.HISTORICO,   // hay número, no cierra una oferta solo
  SIN_PRECIO: ESTADO.FALTA_DATO,       // no hay número. NO es cero
})

/**
 * FABRICAR EL RESOLVEDOR. Devuelve una función `(recursoCodigo, observaciones, { hoy })` que se
 * puede usar donde hoy va `precioVigente`, sin tocar una línea más.
 *
 * `recursos` es un `Map` de código → `{tipo, familia, unidad, nombre}`, que es lo que la cascada
 * necesita para clasificar (un jornal de convenio no vence como un material). Un recurso que no
 * esté en el mapa se resuelve igual, con la clase por defecto, y eso queda dicho en el `porQue`.
 */
export function resolvedorDePrecios({
  compras = [], pesos = {}, recursos = new Map(), tramoParitariaHasta = null,
  /**
   * LOS PASOS 3 Y 4, QUE SON OPCIONALES A PROPÓSITO.
   *
   * `comparables` son las observaciones de los OTROS recursos —una por recurso, la más reciente—
   * con las que `precio-comparable.mjs` arma la cohorte. `preciosWeb` es un `Map` código →
   * candidato YA investigado: la red se usa antes, en una pasada aparte, porque esta función es
   * SÍNCRONA y `costo.mjs` la llama en el medio de una suma.
   *
   * Sin ninguno de los dos, la cascada es exactamente la que había. Eso es el §13: el camino
   * determinístico no depende de que haya internet ni de que alguien haya preparado comparables.
   */
  comparables = [], preciosWeb = new Map(),
} = {}) {
  return function precioResuelto(recursoCodigo, observaciones = [], { hoy = new Date() } = {}) {
    const recurso = recursos.get(recursoCodigo) ?? { codigo: recursoCodigo }
    const serie = observaciones
      .filter((o) => o.recursoCodigo === recursoCodigo && o.precio !== null && o.observadoEn)
      .map((o) => ({ precio: Number(o.precio), moneda: o.moneda ?? 'ARS', fuente: o.fuente, observadoEn: o.observadoEn }))

    const candidatos = []
    const meter = (f) => { try { candidatos.push(f()) } catch { /* un dato indefendible no entra, y su ausencia se ve en el resultado */ } }
    for (const o of serie) {
      meter(() => candidatoDePrecio({
        recursoCodigo, valor: o.precio, moneda: o.moneda, origen: ORIGEN.INTERNO,
        observadoEn: o.observadoEn, detalleFuente: o.fuente,
        evidencia: { tabla: 'public.recurso_precio', fuente: o.fuente },
      }))
    }
    for (const c of comprasDeRecurso({ recurso: { ...recurso, codigo: recursoCodigo }, filas: compras }).observaciones) {
      meter(() => candidatoDePrecio({
        recursoCodigo, valor: c.precio, moneda: 'ARS', origen: ORIGEN.COMPRA_ECSAS,
        observadoEn: c.observadoEn, proveedor: c.proveedor, confianza: c.confianza, evidencia: c.evidencia,
        detalleFuente: `${c.evidencia.tabla} fila ${c.evidencia.fila} · ${c.proveedor ?? 'sin proveedor'} · ${c.porQue}`,
      }))
    }

    // ── PASO 3 · COMPARABLE ───────────────────────────────────────────────────────────────────
    // El comparable se construye SIEMPRE que la cohorte lo permita, aunque el precio interno esté
    // vigente: `resolverPrecio` recorre la cascada en orden y no va a bajar a COMPARABLE si arriba
    // hay algo. Construirlo igual tiene un efecto que se quiere — el recorrido muestra que el paso
    // se probó, en vez de decir «no había ningún precio de origen COMPARABLE».
    if (comparables.length) {
      const c = candidatoComparable({ recurso: { ...recurso, codigo: recursoCodigo }, frescos: comparables })
      if (c.candidato) candidatos.push(c.candidato)
    }

    // ── PASO 4 · WEB ──────────────────────────────────────────────────────────────────────────
    // Ya investigado y ya validado por `candidatoWeb`. Acá no se abre ninguna conexión.
    const web = preciosWeb.get?.(recursoCodigo) ?? null
    if (web) candidatos.push(web)

    const f = pesos[recursoCodigo] ?? null
    const p = resolverPrecio({
      recurso: { ...recurso, codigo: recursoCodigo }, candidatos, serie, hoy, tramoParitariaHasta,
      impacto: f === null ? null : f, costoConocido: f === null ? null : 1,
    })
    return aFormaVieja(p, recursoCodigo, candidatos.length)
  }
}

/**
 * DE LA RESOLUCIÓN NUEVA A LOS NUEVE CAMPOS QUE `costo.mjs` LEE. PURA.
 *
 * `valor` sale `null` cuando no hay precio, igual que `precioVigente`. La resolución completa viaja
 * en `resolucion` para quien la quiera —la cola de issues, el informe— sin que nadie que sólo
 * necesitaba el número tenga que saber que existe.
 */
export function aFormaVieja(p, recursoCodigo, totalCandidatos = 0) {
  return Object.freeze({
    recursoCodigo,
    valor: p.resultado === RESULTADO.SIN_PRECIO ? null : p.valor,
    moneda: p.moneda,
    // `costo.mjs` muestra este campo como «de dónde salió»: va el detalle citable, no el enum.
    fuente: p.detalleFuente,
    observadoEn: p.fecha,
    estado: ESTADO_DE_RESULTADO[p.resultado],
    antiguedadDias: p.fecha === null ? null : Math.floor((Date.parse(`${p.provenance.decididoEn}T00:00:00Z`) - Date.parse(`${p.fecha}T00:00:00Z`)) / 86_400_000),
    porQue: p.resultado === RESULTADO.VIGENTE || p.resultado === RESULTADO.ACTUALIZADO ? null : p.porQue,
    descartadas: Math.max(0, totalCandidatos - 1),
    /** La resolución entera: vigencia derivada, recorrido de la cascada, evidencia y provenance. */
    resolucion: p,
  })
}
