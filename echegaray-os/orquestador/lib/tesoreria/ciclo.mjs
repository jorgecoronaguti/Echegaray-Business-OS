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
import {
  normalizarInstrumento, extraerDeTexto, extraerDeTabla, extraerDeTarjetas, esAptoTesoreria,
} from './instrumentos.mjs'
import { compararAlternativas } from './comparar.mjs'
import { tablaComparativa } from './tabla-instrumentos.mjs'
import { evaluarRiesgo, PERFILES } from './riesgo.mjs'
import { generarRecomendaciones, recomendarAplicarADeuda } from './recomendacion.mjs'
import { validarLote } from './validar.mjs'
import {
  formatoPropuesta, formatoAplicarADeuda, formatoSesionRequerida, esCambioMaterial,
  formatoExcedentePorPlazo, formatoTablaInstrumentos,
} from './formato-mattermost.mjs'
import { evaluarAccionabilidad } from './politicas.mjs'
import { medirLey25413, parametrosFiscales, CLAVE_POLITICA_FISCAL } from './impuestos-colocacion.mjs'
import { RUTAS_INFORMATIVAS, PANTALLAS_ACOTADAS, esDeTesoreria } from './universo-mercado.mjs'
import { mensajeNecesitaAutenticacion, mensajeNavegadorRoto } from './preparar-navegador.mjs'

/** Cuántas horas puede tener una observación de mercado antes de dejar de sostener una decisión. */
export const HORAS_MERCADO_FRESCO = 6

/**
 * ¿Hay datos de mercado frescos? Se responde con los instrumentos RELEVADOS, no con una variable de
 * entorno: la frescura es un hecho observable —la hora de la observación más vieja— y el evaluador de
 * riesgo ya rechaza por separado cualquier instrumento de más de 24 horas.
 */
/**
 * DÍAS HÁBILES ENTRE DOS FECHAS (sábados y domingos afuera). No conoce feriados: por eso el criterio
 * de abajo admite UN día hábil de atraso, que es lo que absorbe un feriado suelto sin abrir la puerta
 * a un dato de la semana pasada.
 */
export function diasHabilesEntre(desdeISO, hasta) {
  const a = new Date(desdeISO)
  const b = new Date(hasta)
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return null
  const d0 = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const d1 = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  if (d1 < d0) return 0
  let n = 0
  const cur = new Date(d0)
  while (cur < d1) {
    cur.setDate(cur.getDate() + 1)
    const dia = cur.getDay()
    if (dia !== 0 && dia !== 6) n += 1
  }
  return n
}

/** Cuántos días hábiles de atraso admite una cotización que sólo trae FECHA (sin hora del día). */
export const DIAS_HABILES_MERCADO_FRESCO = 1

export function frescuraDeMercado(instrumentos = [], ahora = new Date()) {
  // ═══ DOS VARAS, PORQUE LA PANTALLA PUBLICA DOS COSAS DISTINTAS ═══
  //
  // Se mide `cotizado_en` —cuándo cotizó el mercado— y NO `observado_en`, que lo estampa el propio
  // extractor con la hora de la corrida: medir eso contra `ahora` daba 0,0 h SIEMPRE, un control
  // comparándose contra la información que él mismo produce. Sobre el relevamiento real había una ON
  // cotizada por última vez el 20/11/2018 informada como "de hace 0,0 h".
  //
  // Arreglar eso midiendo HORAS creó el defecto simétrico, y también verificado: las seis tablas
  // reales publican FECHA sin hora del día ("31/07/2026"). Parseada a medianoche, "¿tiene menos de 6
  // horas?" da falso desde las 06:00 — y el timer corre 09:15 y 15:30. La compuerta pasaba de estar
  // siempre abierta a no poder abrirse nunca: el mismo defecto de diseño, del otro lado.
  //
  // Entonces la vara depende de lo que la pantalla haya declarado:
  //   · con hora del día  → horas, contra HORAS_MERCADO_FRESCO;
  //   · sólo con fecha    → DÍAS HÁBILES, contra DIAS_HABILES_MERCADO_FRESCO. A las 09:15 de un lunes
  //     el mercado no abrió todavía: el último precio que existe ES el del viernes, y llamarlo viejo
  //     sería exigir un dato que no puede existir.
  //
  // Y la pregunta es "¿hay datos de HOY con los que decidir?", no "¿está todo fresco?": medir por el
  // dato más viejo deja al conjunto rehén de cualquier especie ilíquida —que `riesgo.mjs` ya excluye
  // una por una—. Los viejos y los sin fecha se cuentan aparte y bajan la confianza de la propuesta.
  const conFecha = instrumentos.filter((i) => Number.isFinite(Date.parse(i?.cotizado_en)))
  const sinFecha = instrumentos.length - conFecha.length
  if (!conFecha.length) {
    return {
      fresco: false,
      n: 0,
      sin_fecha: sinFecha,
      viejos: 0,
      motivo: instrumentos.length
        ? `ninguno de los ${instrumentos.length} instrumentos declara cuándo cotizó: no se puede afirmar que el dato sea de hoy`
        : 'no se relevó ningún instrumento',
    }
  }

  /** ¿Esta cotización está dentro de la vara que le corresponde? */
  const vigente = (i) => {
    if (i.cotizado_precision === 'dia') {
      const d = diasHabilesEntre(i.cotizado_en, ahora)
      return d != null && d <= DIAS_HABILES_MERCADO_FRESCO
    }
    return (ahora.getTime() - Date.parse(i.cotizado_en)) / 3600000 <= HORAS_MERCADO_FRESCO
  }

  const frescos = conFecha.filter(vigente)
  const viejos = conFecha.length - frescos.length
  const masNueva = Math.max(...conFecha.map((i) => Date.parse(i.cotizado_en)))
  const horas = (ahora.getTime() - masNueva) / 3600000
  const soloFecha = conFecha.some((i) => i.cotizado_precision === 'dia')
  return {
    fresco: frescos.length > 0,
    horas: Math.round(horas * 10) / 10,
    dias_habiles: soloFecha ? diasHabilesEntre(new Date(masNueva).toISOString(), ahora) : null,
    n: conFecha.length,
    frescos: frescos.length,
    sin_fecha: sinFecha,
    viejos,
    motivo: frescos.length
      ? `${frescos.length} instrumento(s) con cotización vigente (${viejos} con dato viejo, ${sinFecha} sin fecha)`
      : soloFecha
        ? `la cotización más reciente es de hace ${diasHabilesEntre(new Date(masNueva).toISOString(), ahora)} día(s) hábil(es) y el máximo es ${DIAS_HABILES_MERCADO_FRESCO}`
        : `ni la cotización más reciente es de hoy: tiene ${horas.toFixed(1)} h y el máximo son ${HORAS_MERCADO_FRESCO}`,
  }
}

// Rutas informativas de Balanz. Todas pasan igual por la barrera: la lista no es una autorización, y
// CAUCIONES entra por la allowlist de ruta exacta (`balanz-denylist.NAVEGACION_INFORMATIVA`) —
// `/mercado/caucionar` y el botón "Caucionar" de esa misma pantalla siguen bloqueados.
//
// QUÉ PANTALLAS SON Y CUÁLES SE DEJAN AFUERA vive en `universo-mercado.mjs`, con la medición que lo
// justifica. Se re-exporta porque los consumidores (y los tests) ya lo importaban desde acá.
export { RUTAS_INFORMATIVAS, PANTALLAS_ACOTADAS }

// Arbitrario y estable: identifica ESTE ciclo entre los advisory locks del OS. Se EXPORTA porque el
// explorador maneja la misma pestaña de Chrome y tiene que pedir el mismo lock: dos procesos
// navegando la misma pestaña se pisan y cada uno atribuye a su ruta lo que dibujó el otro.
export const LOCK_CICLO = 738201
const LOCK_KEY = LOCK_CICLO

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
    // ── EL ATRASO TÍPICO DE CADA CLIENTE, ANTES DE LEER EL CALENDARIO ─────────
    //
    // Las cobranzas del Cash Flow traen la fecha PROMETIDA. Este repo ya midió que los clientes pagan
    // tarde —para eso existe `aprendizaje-cobranzas`— y proyectar un cobro en su fecha nominal es
    // proyectarlo en el día en que no va a entrar. No se reimplementa nada: se pasan los perfiles y el
    // calendario reproyecta. Si la base no está, se sigue con las fechas nominales y se declara.
    let perfilesCobro = opts.perfilesCobro ?? null
    if (!perfilesCobro && query) {
      const { perfilesDeCobroDesdeDB } = await import('../aprendizaje-cobranzas.mjs')
      perfilesCobro = await perfilesDeCobroDesdeDB({ query }).catch(() => null)
    }
    paso('atraso_cobranzas', perfilesCobro?.n_clientes ? 'ok' : 'sin_dato',
      perfilesCobro?.n_clientes
        ? `${perfilesCobro.n_clientes} cliente(s) con perfil · atraso global ${perfilesCobro.global?.atraso_mediano ?? '?'}d`
        : 'sin historia de cobros: las cobranzas caen en su fecha nominal')

    // 1-3 · Leer y validar el Flujo de Caja (SKILL 1).
    const flujo = await leerFlujoDeFondos(deps, { hoy: ahora, dias: opts.dias ?? 90, spreadsheetId: opts.spreadsheetId, perfilesCobro })
    paso('leer_flujo', flujo.estado, flujo.estado === 'ok' ? `${flujo.movimientos.length} movimientos` : flujo.motivo)
    if (flujo.estado !== 'ok') {
      return { estado: 'sin_dato', motivo: flujo.motivo, flujo, traza }
    }

    // 4 · Posición de caja (SKILL 2).
    // La deuda comercial vencida sale de los movimientos YA leídos: si no se la pasa, el modelo la
    // deja en "sin dato" y el excedente cuenta plata que ya tiene dueño.
    const posicion = await reconstruirPosicion(deps, {
      hoy: ahora,
      spreadsheetId: opts.spreadsheetId,
      filaReserva: opts.filaReserva ?? null,
      filaRestringida: opts.filaRestringida ?? null,
      composicionAnterior: opts.composicionAnterior ?? null,
      extractorValidado: Boolean(opts.extractorValidado),
      mercadoFresco: Boolean(opts.mercadoFresco),
      vencidoComercial: vencidoComercialDe(flujo),
      // Para el control de doble conteo cheque ↔ factura de Compras vencida: sale de los movimientos
      // YA leídos, no de una segunda lectura del Sheet.
      movimientosVencidos: flujo.movimientos.filter((m) => m.status === 'vencido' && m.direction === 'out'),
    })
    paso('posicion', posicion.estado, posicion.estado === 'ok' ? `caja ${posicion.caja_real}` : posicion.motivo)

    // 5 · Proyección (SKILL 3).
    const proyeccion = proyectarLiquidez(flujo, { cajaInicial: posicion.caja_real })
    paso('proyeccion', proyeccion.estado)

    // 6 · Excedente invertible (SKILL 4).
    const excedente = await calcularExcedente(posicion, proyeccion, { hoy: ahora, dias: flujo.dias })
    paso('excedente', excedente.estado, `${excedente.ventanas.length} ventanas · ${excedente.etiqueta_monto}${excedente.deuda_cancelable?.monto ? ` · deuda $${excedente.deuda_cancelable.monto}` : ''}`)

    // ═══ EL ATAJO QUE SE SACÓ, Y POR QUÉ ═══
    //
    // Hasta el 03/08/2026, sin ninguna ventana con monto el ciclo devolvía `mercado: omitido — sin
    // excedente` y terminaba. Parecía ahorro y era ceguera: con el excedente mal calculado en cero —lo
    // estaba, ver `excedente-ventana.mjs`— el agente NUNCA miró Balanz. Un defecto de la mitad de caja
    // apagaba la otra mitad entera, y el dueño rechazó dos corridas seguidas por eso.
    //
    // Además el atajo era malo por sí mismo: saber que el mercado paga 40% cuando el descubierto cuesta
    // 62,78% es una decisión (no colocar, cancelar línea) y hay que poder mostrarla con números. El
    // relevamiento es informativo y read-only; el costo de mirar es bajo y el de no mirar ya se pagó.
    //
    // Lo único que se conserva es la recomendación estructural: si no hay ventana con monto, la
    // propuesta es aplicar a la deuda, y eso se dice igual — junto a la tabla, no en lugar de ella.
    const sinVentanas = excedente.ventanas.every((v) => !(Number(v.monto_maximo) > 0))
    const recEstructural = sinVentanas
      ? recomendarAplicarADeuda(posicion, excedente.tasa_de_corte, ahora, excedente.deuda_cancelable?.monto ?? 0)
      : null
    paso('mercado_previo', sinVentanas ? 'sin_excedente' : 'con_excedente',
      sinVentanas ? 'no hay ventana con monto: se releva el mercado igual, para poder mostrar contra qué se compara'
        : `${excedente.ventanas.filter((v) => Number(v.monto_maximo) > 0).length} ventana(s) con monto`)

    // ── 7 · EL NAVEGADOR, ANTES DEL MERCADO ───────────────────────────────────
    //
    // Hasta acá el tramo de caja ya está hecho y es válido pase lo que pase con Balanz. Lo que sigue
    // puede fallar de varias maneras distintas, y cada una pide algo distinto de una persona: una
    // sesión vencida se arregla desde el celular en veinte segundos; un navegador caído, no. Mandar
    // el mensaje equivocado manda al dueño a mirar una pantalla negra.
    if (deps.prepararNavegador) {
      const prep = await deps.prepararNavegador()
      paso('navegador', prep.estado, prep.detalle)
      if (!prep.listo) {
        const esSesion = prep.estado === 'SESSION_REQUIRED'
        // El enlace se pide SÓLO cuando hace falta: no se generan enlaces al escritorio "por las
        // dudas", y si no se puede generar, el aviso sale igual diciendo que falta el secreto.
        const enlace = esSesion && deps.enlaceRemoto ? await deps.enlaceRemoto().catch(() => null) : null
        // LA MITAD QUE SÍ SE PUDO HACER SE PUBLICA IGUAL. Que Balanz no abra no invalida el excedente
        // por plazo, que es la mitad que más decide: sin esto, un navegador caído dejaba al dueño sin
        // el análisis de caja que ya estaba terminado y bien.
        const texto = [
          esSesion
            ? mensajeNecesitaAutenticacion({ enlace, detalle: prep.detalle, ahora })
            : mensajeNavegadorRoto({ detalle: prep.detalle, acciones: prep.acciones, ahora }),
          '',
          formatoExcedentePorPlazo(excedente),
        ].join('\n')
        if (deps.publicar) await deps.publicar(texto)
        return {
          estado: esSesion ? 'session_required' : 'browser_error',
          motivo: prep.detalle,
          // La caja SE DEVUELVE IGUAL. Perder el análisis que ya estaba bien hecho porque el
          // navegador no abrió es convertir una falla parcial en una falla total.
          posicion, proyeccion, excedente, publicado: Boolean(deps.publicar), texto, traza,
        }
      }
    }

    // 8-10 · Mercado: sesión, relevamiento, normalización (SKILL 5).
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

    // ═══ DE DÓNDE SALEN LOS INSTRUMENTOS, Y POR QUÉ EN ESTE ORDEN ═══
    //
    // Hasta el 02/08/2026 la única fuente era `extraerDeTexto` sobre el texto plano de la pantalla.
    // Contra la app real de Balanz eso devolvía DOS instrumentos, los dos llamados `"TNA: +"`, los
    // dos con categoría `otro` y por lo tanto los dos descartados por `esAptoTesoreria`. O sea: cero
    // instrumentos leídos de una pantalla con diez fondos, sin un solo error en el camino.
    //
    // El motivo es que `extraerDeTexto` trabaja por RENGLÓN y necesita el nombre y la tasa en el
    // mismo, y las pantallas reales no son así: las de cotizaciones son `<table>` con `<th>` (para
    // eso ya existía `extraerDeTabla`, que hasta hoy era código muerto) y la de fondos son tarjetas
    // con pares etiqueta→valor.
    //
    // El texto plano queda como ÚLTIMO recurso y sólo cuando la página no trajo ni tabla ni
    // tarjetas: sirve para no quedarse ciego si Balanz cambia el DOM otra vez, y su evidencia sigue
    // siendo `estimacion`.
    const obs = { observadoEn: ahora.toISOString() }
    const instrumentos = (opts.instrumentos || [])
      // Un instrumento declarado A MANO (una oferta de plazo fijo que trajo una persona) no salió de
      // ninguna pantalla, así que no tiene columna "Hora": cotiza al momento en que se lo declara,
      // salvo que quien lo declara diga otra cosa. Los que SÍ salen de una pantalla no reciben este
      // default: si el bróker no dijo cuándo cotizó, eso se marca como riesgo y no se rellena.
      .map((i) => normalizarInstrumento({ cotizado_en: obs.observadoEn, ...i }, obs))
      .concat((mercado.paginas || []).flatMap((p) => {
        if (p.estado !== 'ok') return []
        // LA CATEGORÍA LA DECIDE LA PANTALLA, no sólo el nombre de la fila. En /cauciones TODAS las
        // filas son cauciones, pero `categorizar()` sólo reconoce las que se llaman así: la fila de
        // pesos dice "CAUCION PESOS" y cae bien, la de dólares dice "DOLARES" y caía en `otro`. El
        // cotejo de la muestra viva lo encontró: el mismo instrumento, en la misma tabla, clasificado
        // de dos formas distintas según cómo lo hubiera bautizado el bróker. Y con la categoría mal,
        // la regla del plazo de la caución tampoco corre: quedaba además sin plazo de rescate.
        const categoriaDePantalla = /\/cauciones(\?|$)/.test(p.url) ? 'caucion' : null
        const deTabla = p.tabla?.filas?.length
          ? extraerDeTabla(p.tabla, { url: p.url, categoria: categoriaDePantalla, ...obs }).instrumentos : []
        const deTarjetas = p.tarjetas?.length
          ? extraerDeTarjetas(p.tarjetas, { url: p.url, ...obs }) : []
        if (deTabla.length || deTarjetas.length) return [...deTabla, ...deTarjetas]
        return extraerDeTexto(p.texto || '', { url: p.url, ...obs })
      }))
    const aptos = instrumentos.filter((i) => esAptoTesoreria(i.categoria))

    // ═══ UN RELEVAMIENTO TRUNCADO NO ES UN RELEVAMIENTO — PERO TRUNCADO ¿DE QUÉ? ═══
    //
    // `relevar` ya marcaba `relevamiento_completo` por página, y nadie lo leía: no bajaba la
    // confianza, no aparecía en el mensaje y no quedaba en la traza. El flag existía; el camino
    // hasta la decisión, no.
    //
    // Pero después el control se pasó para el otro lado: cualquier pantalla truncada dejaba el
    // mercado "parcial" y eso bloquea la accionabilidad. Cedears y corporativos truncaban con el tope
    // viejo, y ninguna de las dos aporta un solo instrumento apto para tesorería (0 de 320 y 0 de
    // 787, medido en el ledger). O sea: el agente se declaraba ciego por no terminar de leer algo
    // que, terminado, no le habría cambiado una coma. Ver `universo-mercado.mjs` para la medición.
    //
    // Desde acá, TRUNCADO ES UN DEFECTO sólo dentro del universo de tesorería. Afuera es una
    // decisión declarada, y se informa como tal — no desaparece, cambia de nombre.
    const cortadas = (mercado.paginas || []).filter((p) => p.estado === 'ok' && p.relevamiento_completo === false)
    const paginasTruncadas = cortadas.filter((p) => esDeTesoreria(p.url)).map((p) => p.url)
    const paginasConError = (mercado.paginas || [])
      .filter((p) => p.estado === 'error' && esDeTesoreria(p.url)).map((p) => p.url)
    // El barrido de controles también tiene tope por pantalla. No cambia qué instrumentos se leyeron,
    // pero sí significa que la barrera NO clasificó todo lo que había: es parte de la cobertura y se
    // informa igual.
    const paginasSinBarrer = (mercado.paginas || [])
      .filter((p) => p.estado === 'ok' && p.controles?.barrido_completo === false)
      .map((p) => p.url)
    const mercadoCompleto = paginasTruncadas.length === 0 && paginasConError.length === 0
    paso('cobertura_mercado', mercadoCompleto ? 'ok' : 'parcial',
      mercadoCompleto
        ? `${(mercado.paginas || []).length} pantallas relevadas enteras`
        : [
          paginasTruncadas.length ? `${paginasTruncadas.length} truncada(s): ${paginasTruncadas.join(' · ')}` : null,
          paginasConError.length ? `${paginasConError.length} con error: ${paginasConError.join(' · ')}` : null,
        ].filter(Boolean).join(' | '))
    if (paginasSinBarrer.length) {
      paso('barrido_controles', 'parcial', `${paginasSinBarrer.length} pantalla(s) con más controles que el tope: ${paginasSinBarrer.join(' · ')}`)
    }
    // LO EXCLUIDO SE DICE, NO SE OMITE. Un universo acotado que no se declara es indistinguible de un
    // universo mal relevado, y ésa es justo la confusión que este paso viene a deshacer.
    const acotadasVistas = cortadas.filter((p) => !esDeTesoreria(p.url)).map((p) => p.url)
    paso('universo_mercado', 'acotado',
      [`${PANTALLAS_ACOTADAS.length} pantalla(s) fuera del universo por decisión declarada: ${PANTALLAS_ACOTADAS.map((p) => p.ruta).join(' · ')}`,
        acotadasVistas.length ? `(${acotadasVistas.length} de ellas además quedó truncada, y no cuenta como defecto)` : null,
      ].filter(Boolean).join(' '))
    paso('instrumentos', 'ok', `${instrumentos.length} relevados · ${aptos.length} aptos para tesorería`)

    // ── LOS IMPUESTOS, ANTES DE COMPARAR ──────────────────────────────────────
    //
    // No es una capa de presentación: el impuesto al cheque se lleva 1,2% del capital y sobre 30 días
    // eso ordena el ranking distinto que el rendimiento bruto. Si se aplicara sólo al publicar, el
    // ganador de la comparación no sería el que más deja.
    //
    // La alícuota NO se cita de memoria: se contrasta contra lo que el banco efectivamente cobró.
    const medicionLey = query ? await medirLey25413(query).catch((e) => ({ estado: 'sin_dato', motivo: String(e?.message ?? e).slice(0, 120) })) : null
    const politicaFiscal = query ? await import('./ledger.mjs').then((m) => m.politicaVigente(query, CLAVE_POLITICA_FISCAL)).catch(() => null) : null
    const fiscal = parametrosFiscales({ medicion: medicionLey, politica: politicaFiscal })
    paso('impuestos', fiscal.ley_25413.estado === 'conocido' ? 'ok' : 'parcial',
      [`Ley 25.413: ${fiscal.ley_25413.estado}`, `IIBB: ${fiscal.iibb.estado}`, `Ganancias: ${fiscal.ganancias.estado}`].join(' · '))

    // 11-12 · Comparar (SKILL 6) y evaluar riesgo (SKILL 7).
    const ventanas = excedente.ventanas.filter((v) => Number(v.monto_maximo) > 0)
    const comparacion = compararAlternativas(aptos, ventanas, excedente.tasa_de_corte, fiscal)
    const riesgos = {}
    for (const i of aptos) riesgos[i.id] = evaluarRiesgo(i, PERFILES.caja_operativa, { ahora })
    paso('comparacion', 'ok', comparacion.rankings.map((r) => `${r.bloque}:${r.ranking.length}`).join(' '))

    // 13 · Recomendar (SKILL 8).
    // ── LA ACCIONABILIDAD SE RE-EVALÚA DESPUÉS DEL MERCADO ────────────────────
    //
    // `posicion` se calcula en el paso 4 y el relevamiento es el paso 7: cuando la posición decide si
    // hay datos de mercado frescos, todavía no se miró el mercado. La segunda auditoría lo midió: con
    // la reserva aprobada, la caja restringida declarada y el extractor validado, TODO seguía
    // NO_ACCIONABLE por "no hay datos de mercado frescos", y ningún archivo del repo podía ponerlo en
    // true. Una compuerta que nadie puede abrir no es una compuerta: es una pared.
    const frescura = frescuraDeMercado(aptos, ahora)
    const accionabilidad = evaluarAccionabilidad({
      reserva: posicion.reserva,
      restringida: posicion.caja_restringida,
      extractorValidado: Boolean(opts.extractorValidado),
      mercadoFresco: frescura.fresco,
      mercadoCompleto,
    })
    paso('accionabilidad', accionabilidad.accionable ? 'accionable' : 'no_accionable',
      accionabilidad.bloqueos.join(' · ') || frescura.motivo)

    const generadas = generarRecomendaciones(comparacion, ventanas.map((v) => ({ ...v, accionable: accionabilidad.accionable })), {
      hoy: ahora, tasa_de_corte: excedente.tasa_de_corte, riesgos, frescura,
      accionable: accionabilidad.accionable,
      bloqueos: accionabilidad.bloqueos,
      fuente_caja: posicion.fuente, fuente_mercado: `Balanz — ${mercado.observado_en ?? ahora.toISOString()}`,
    })
    paso('recomendaciones', 'ok', `${generadas.propuestas.length} propuestas · ${generadas.sin_propuesta.length} bloques sin propuesta`)

    // 14 · Revisión independiente (SKILL 9). Lo que no pasa, NO se publica.
    const val = validarLote(generadas.propuestas, { posicion, excedente, proyeccion, instrumentos: aptos, ahora, fiscal })
    paso('validacion', 'ok', `${val.publicables.length} publicables · ${val.rechazadas.length} rechazadas`)

    // ═══ 14 bis · LA TABLA COMPARATIVA — lo que el dueño pidió y no estaba ═══
    //
    // `comparacion` produce un ranking por bloque, y con 0 ventanas con monto produce cero rankings:
    // el dueño se quedaba sin ver una sola opción. La tabla se arma IGUAL, con monto 0 si hace falta,
    // porque la pregunta "¿qué paga hoy el mercado contra el 62,78% que me cuesta el descubierto?"
    // tiene respuesta aunque no haya un peso para colocar.
    const ventanasTabla = ventanas.length ? ventanas : (excedente.ventanas_por_plazo || [])
      .filter((v) => v.estado === 'ok')
      .map((v) => ({
        bloque: null, titulo: `Referencia a ${v.dias} días (sin monto colocable hoy)`, moneda: 'ARS',
        dias_libres: v.dias, monto_maximo: 0,
        // La derivación viaja también en la tabla de referencia: cuando el colocable da cero, la
        // pregunta "¿por qué cero?" es MÁS importante, no menos.
        derivacion: v.derivacion ?? null,
      }))
    const tablaComparacion = tablaComparativa(aptos, ventanasTabla, {
      hurdleAnual: Number(excedente.tasa_de_corte?.valor) || 0, riesgos, fiscal,
    })
    const sospechosas = comparacion.rankings.flatMap((r) => (r.excluidos || []).filter((e) => e.sospechosa))
    paso('tabla_instrumentos', 'ok',
      `${tablaComparacion.tablas.length} tabla(s) · ${tablaComparacion.tablas.reduce((s, t) => s + t.viables.length, 0)} opción(es) viable(s)`
      + (sospechosas.length ? ` · ${sospechosas.length} tasa(s) por encima del techo de cordura` : ''))

    // 15-16 · Comparar contra la corrida anterior y publicar sólo lo material.
    const resumen = resumirCorrida({ posicion, excedente, comparacion, sesionRequerida: false })
    const publicar = opts.publicarSiempre ? { publicar: true, motivo: 'forzado' } : esCambioMaterial(resumen, opts.anterior, opts.umbrales)
    const textos = [
      // EL EXCEDENTE POR PLAZO VA PRIMERO Y VA SIEMPRE: es la mitad que decide.
      formatoExcedentePorPlazo(excedente),
      ...tablaComparacion.tablas.map((t) => formatoTablaInstrumentos(t)),
      ...(recEstructural ? [formatoAplicarADeuda(recEstructural, posicion)] : []),
      ...val.publicables.map((r) => formatoPropuesta(r, posicion, {
        fecha_caja: posicion.fecha, fecha_mercado: mercado.observado_en ?? null,
      })),
    ]
    // ═══ `publicado` ES LO QUE SE ENVIÓ, NO LO QUE SE DECIDIÓ ENVIAR ═══
    //
    // La versión anterior escribía `publicado: publicar.publicar`, o sea la DECISIÓN de publicar, sin
    // mirar si había algo que mandar. Con 0 propuestas publicables —el caso normal mientras falte la
    // reserva mínima— `textos` viene vacío, no sale un solo mensaje, y el ledger igual registraba
    // `publicado=true`. Verificado en la primera corrida productiva: la corrida quedó con
    // `publicado=true` y el último post en el canal era de siete minutos antes.
    //
    // Es la falla que el repo llama "un log que felicita sin haber escrito": el registro que existe
    // para responder *¿se le avisó al dueño?* contestaba que sí sin haber avisado.
    let enviados = 0
    if (publicar.publicar && deps.publicar) {
      for (const t of textos) { await deps.publicar(t); enviados += 1 }
    }
    const seEnvio = enviados > 0
    paso('publicacion', seEnvio ? 'publicado' : 'omitido',
      seEnvio ? `${enviados} mensaje(s) · ${publicar.motivo}`
        : textos.length === 0 ? 'nada que publicar: ninguna propuesta pasó la validación'
          : publicar.motivo)

    return {
      estado: 'ok',
      posicion, proyeccion, excedente, instrumentos, comparacion, riesgos,
      tabla_instrumentos: tablaComparacion,
      tasas_sospechosas: sospechosas,
      sin_excedente: sinVentanas,
      recomendacion_estructural: recEstructural,
      recomendaciones: val.publicables,
      rechazadas: val.rechazadas,
      validaciones: val.validaciones,
      // ═══ TODO LO QUE SE GENERÓ, NO SÓLO LO QUE SE PUBLICA ═══
      //
      // El ledger recibía únicamente `val.publicables`, así que una propuesta rechazada por la
      // validación NUNCA llegaba a `tesoreria.recomendaciones` — y su validación tampoco, porque el
      // ledger descarta las validaciones sin recomendación persistida. Resultado medido el
      // 03/08/2026: el ciclo informaba "1 propuesta · 1 rechazada" y las dos tablas estaban en 0
      // filas. Nadie podía contestar por qué se rechazó una decisión de plata.
      //
      // La rechazada no se publica (eso no cambia: lo que no pasa la revisión no se le manda al
      // dueño) pero SÍ se guarda, con estado 'rechazada' y sus fallas.
      generadas: generadas.propuestas,
      fiscal,
      sin_propuesta: generadas.sin_propuesta,
      bloqueos: mercado.bloqueos || [],
      publicado: seEnvio,
      mensajes_enviados: enviados,
      motivo_publicacion: publicar.motivo,
      accionabilidad, frescura_mercado: frescura,
      textos, resumen, traza,
      evidencia: EVIDENCIA.CALCULO,
    }
  } finally {
    if (query) await soltarLock(query)
  }
}

export const VERSION_CICLO = '1.1.0'
