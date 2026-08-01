// EL CICLO DEL TESORERO INVERSOR IA — la rutina que corre sola, sin conversación abierta.
//
// ═══ POR QUÉ ESTO NO ES UN PROMPT LARGO ═══
//
// Un agente que existe sólo mientras alguien tiene una terminal abierta no es una capacidad del OS:
// es una sesión. Este ciclo es una función que el scheduler del OS ya existente dispara, sin Claude
// Code, sin terminal y —salvo que se le pida narrativa— sin una sola llamada a la API de Anthropic.
// Toda la aritmética financiera es determinística: el modelo no suma.
//
// ═══ CONCURRENCIA ═══
//
// Un lock de Postgres, no un archivo: dos corridas simultáneas contra la MISMA sesión de Chrome se
// pisan la pestaña y devuelven datos de la pantalla equivocada. `pg_try_advisory_lock` falla rápido
// y la segunda corrida se omite en vez de encolarse — un análisis de tesorería atrasado no sirve.
//
// ═══ IDEMPOTENCIA ═══
//
// La clave de una recomendación es (bloque, día, instrumento). Correr dos veces el mismo día con el
// mismo resultado no duplica: reemplaza. Lo que NUNCA se pisa son las observaciones de mercado, que
// son el histórico con el que después se audita si el agente decidió con el dato que había.

import { EVIDENCIA } from './contratos.mjs'
import { leerFlujoDeFondos, vencidoComercialDe } from './lectura-flujo.mjs'
import { reconstruirPosicion } from './posicion-caja.mjs'
import { proyectarLiquidez } from './proyeccion-liquidez.mjs'
import { calcularExcedente } from './excedente.mjs'
import { normalizarInstrumento, extraerDeTexto, esAptoTesoreria } from './instrumentos.mjs'
import { compararAlternativas } from './comparar.mjs'
import { evaluarRiesgo, PERFILES } from './riesgo.mjs'
import { generarRecomendaciones, recomendarAplicarADeuda } from './recomendacion.mjs'
import { validarLote } from './validar.mjs'
import { formatoPropuesta, formatoAplicarADeuda, formatoSesionRequerida, esCambioMaterial } from './formato-mattermost.mjs'

/**
 * Rutas informativas de Balanz. Todas pasan igual por la barrera: la lista no es una autorización.
 *
 * CAUCIONES ENTRA POR LA ALLOWLIST DE RUTA EXACTA (`balanz-denylist.NAVEGACION_INFORMATIVA`), no
 * porque se haya aflojado el patrón: `/mercado/caucionar` y `/mercado/cauciones/operar` siguen
 * bloqueados, y el botón "Caucionar" de esa misma pantalla también. Se puede mirar, no tocar.
 */
export const RUTAS_INFORMATIVAS = [
  '/fondos', '/fondos/money-market', '/fondos/renta-fija',
  '/mercado/letras', '/mercado/bonos', '/mercado/obligaciones-negociables',
  '/mercado/cauciones',
]

const LOCK_KEY = 738201 // arbitrario y estable: identifica ESTE ciclo entre los advisory locks del OS

/** Toma el lock. Si no lo consigue, la corrida se omite: no se encola ni se espera. */
async function tomarLock(query) {
  const { rows } = await query('select pg_try_advisory_lock($1) as ok', [LOCK_KEY])
  return Boolean(rows?.[0]?.ok)
}
const soltarLock = (query) => query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {})

/** Resumen comparable entre corridas — la entrada de `esCambioMaterial`. */
export function resumirCorrida({ posicion, excedente, comparacion, sesionRequerida }) {
  const mejor = (comparacion?.rankings || []).flatMap((r) => r.ranking || [])[0] || null
  const invertible = (excedente?.ventanas || [])
    .filter((v) => ['A', 'B', 'C', 'D', 'E'].includes(v.bloque))
    .reduce((max, v) => Math.max(max, Number(v.monto_maximo) || 0), 0)
  return {
    en_descubierto: Boolean(posicion?.en_descubierto),
    excedente: invertible,
    mejor_tasa: mejor?.rendimiento_neto_periodo ?? 0,
    mejor_instrumento: mejor?.instrumento ?? null,
    sesion_requerida: Boolean(sesionRequerida),
  }
}

/**
 * EL CICLO. Devuelve todo lo que hizo, publique o no. Las dependencias entran por parámetro para que
 * el test lo corra entero sin Google, sin Postgres, sin Chrome y sin Mattermost.
 *
 * @param {object} deps {google, query, relevar, publicar, ahora}
 * @param {object} [opts] {dias, politica, publicarSiempre, rutas}
 */
export async function correrCiclo(deps = {}, opts = {}) {
  const ahora = deps.ahora ? new Date(deps.ahora) : new Date()
  const query = deps.query
  const traza = []
  const paso = (n, estado, detalle = null) => { traza.push({ paso: n, estado, detalle }); return estado }

  if (query && !(await tomarLock(query))) {
    return { estado: 'omitida', motivo: 'ya hay una corrida en curso', traza }
  }

  try {
    // 1-3 · Leer y validar el Flujo de Caja (SKILL 1).
    const flujo = await leerFlujoDeFondos(deps, { hoy: ahora, dias: opts.dias ?? 90 })
    paso('leer_flujo', flujo.estado, flujo.estado === 'ok' ? `${flujo.movimientos.length} movimientos` : flujo.motivo)
    if (flujo.estado !== 'ok') {
      return { estado: 'sin_dato', motivo: flujo.motivo, flujo, traza }
    }

    // 4 · Posición de caja (SKILL 2).
    // La deuda comercial vencida sale de los movimientos YA leídos: si no se la pasa, el modelo la
    // deja en "sin dato" y el excedente cuenta plata que ya tiene dueño.
    const posicion = await reconstruirPosicion(deps, {
      hoy: ahora,
      filaReserva: opts.filaReserva ?? null,
      filaRestringida: opts.filaRestringida ?? null,
      composicionAnterior: opts.composicionAnterior ?? null,
      extractorValidado: Boolean(opts.extractorValidado),
      mercadoFresco: Boolean(opts.mercadoFresco),
      vencidoComercial: vencidoComercialDe(flujo),
    })
    paso('posicion', posicion.estado, posicion.estado === 'ok' ? `caja ${posicion.caja_real}` : posicion.motivo)

    // 5 · Proyección (SKILL 3).
    const proyeccion = proyectarLiquidez(flujo, { cajaInicial: posicion.caja_real })
    paso('proyeccion', proyeccion.estado)

    // 6 · Excedente invertible (SKILL 4).
    const excedente = await calcularExcedente(posicion, proyeccion, { hoy: ahora, dias: flujo.dias })
    paso('excedente', excedente.estado, `${excedente.ventanas.length} ventanas · ${excedente.etiqueta_monto}${excedente.deuda_cancelable?.monto ? ` · deuda $${excedente.deuda_cancelable.monto}` : ''}`)

    // ── EL ATAJO QUE AHORRA PLATA Y CRÉDITOS ──────────────────────────────────
    // Sin ninguna ventana con monto no hay nada que buscar en Balanz. Y si hay deuda que cancela toda
    // la caja libre, tampoco: esa porción va a la línea, que rinde el CFT sin riesgo.
    const sinVentanas = excedente.ventanas.every((v) => !(Number(v.monto_maximo) > 0))
    if (sinVentanas) {
      const rec = recomendarAplicarADeuda(posicion, excedente.tasa_de_corte, ahora, excedente.deuda_cancelable?.monto ?? 0)
      paso('mercado', 'omitido', 'sin excedente: no se releva el mercado')
      const resumen = resumirCorrida({ posicion, excedente, comparacion: null, sesionRequerida: false })
      const publicar = opts.publicarSiempre ? { publicar: true, motivo: 'forzado' } : esCambioMaterial(resumen, opts.anterior, opts.umbrales)
      const texto = formatoAplicarADeuda(rec, posicion)
      if (publicar.publicar && deps.publicar) await deps.publicar(texto)
      return {
        estado: 'ok', sin_excedente: true, posicion, proyeccion, excedente,
        recomendacion_estructural: rec, publicado: publicar.publicar, motivo_publicacion: publicar.motivo,
        texto, resumen, traza,
      }
    }

    // 7-10 · Mercado: sesión, relevamiento, normalización (SKILL 5).
    const relevar = deps.relevar
    let mercado = { estado: 'omitido', paginas: [], bloqueos: [] }
    if (relevar) mercado = await relevar({ rutas: opts.rutas ?? RUTAS_INFORMATIVAS })
    paso('mercado', mercado.estado, mercado.motivo ?? `${mercado.paginas?.length ?? 0} páginas`)

    if (mercado.estado === 'session_required') {
      const texto = formatoSesionRequerida(mercado.motivo)
      if (deps.publicar) await deps.publicar(texto)
      return {
        estado: 'session_required', motivo: mercado.motivo,
        posicion, proyeccion, excedente, bloqueos: mercado.bloqueos, publicado: true, texto, traza,
      }
    }

    const instrumentos = (opts.instrumentos || [])
      .map((i) => normalizarInstrumento(i, { observadoEn: ahora.toISOString() }))
      .concat((mercado.paginas || []).flatMap((p) => extraerDeTexto(p.texto || '', { url: p.url, observadoEn: ahora.toISOString() })))
    const aptos = instrumentos.filter((i) => esAptoTesoreria(i.categoria))
    paso('instrumentos', 'ok', `${instrumentos.length} relevados · ${aptos.length} aptos para tesorería`)

    // 11-12 · Comparar (SKILL 6) y evaluar riesgo (SKILL 7).
    const ventanas = excedente.ventanas.filter((v) => Number(v.monto_maximo) > 0)
    const comparacion = compararAlternativas(aptos, ventanas, excedente.tasa_de_corte)
    const riesgos = {}
    for (const i of aptos) riesgos[i.id] = evaluarRiesgo(i, PERFILES.caja_operativa, { ahora })
    paso('comparacion', 'ok', comparacion.rankings.map((r) => `${r.bloque}:${r.ranking.length}`).join(' '))

    // 13 · Recomendar (SKILL 8).
    const generadas = generarRecomendaciones(comparacion, ventanas, {
      hoy: ahora, tasa_de_corte: excedente.tasa_de_corte, riesgos,
      accionable: Boolean(posicion.accionable),
      bloqueos: posicion.bloqueos_accionabilidad ?? [],
      fuente_caja: posicion.fuente, fuente_mercado: `Balanz — ${mercado.observado_en ?? ahora.toISOString()}`,
    })
    paso('recomendaciones', 'ok', `${generadas.propuestas.length} propuestas · ${generadas.sin_propuesta.length} bloques sin propuesta`)

    // 14 · Revisión independiente (SKILL 9). Lo que no pasa, NO se publica.
    const val = validarLote(generadas.propuestas, { posicion, excedente, proyeccion, instrumentos: aptos, ahora })
    paso('validacion', 'ok', `${val.publicables.length} publicables · ${val.rechazadas.length} rechazadas`)

    // 15-16 · Comparar contra la corrida anterior y publicar sólo lo material.
    const resumen = resumirCorrida({ posicion, excedente, comparacion, sesionRequerida: false })
    const publicar = opts.publicarSiempre ? { publicar: true, motivo: 'forzado' } : esCambioMaterial(resumen, opts.anterior, opts.umbrales)
    const textos = val.publicables.map((r) => formatoPropuesta(r, posicion, {
      fecha_caja: posicion.fecha, fecha_mercado: mercado.observado_en ?? null,
    }))
    if (publicar.publicar && deps.publicar) for (const t of textos) await deps.publicar(t)
    paso('publicacion', publicar.publicar ? 'publicado' : 'omitido', publicar.motivo)

    return {
      estado: 'ok',
      posicion, proyeccion, excedente, instrumentos, comparacion, riesgos,
      recomendaciones: val.publicables,
      rechazadas: val.rechazadas,
      validaciones: val.validaciones,
      sin_propuesta: generadas.sin_propuesta,
      bloqueos: mercado.bloqueos || [],
      publicado: publicar.publicar,
      motivo_publicacion: publicar.motivo,
      textos, resumen, traza,
      evidencia: EVIDENCIA.CALCULO,
    }
  } finally {
    if (query) await soltarLock(query)
  }
}

export const VERSION_CICLO = '1.1.0'
