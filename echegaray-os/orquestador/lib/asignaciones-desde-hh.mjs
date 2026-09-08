// Historial de obra de cada persona reconstruido desde las horas de JORNALES (`registros_hh`,
// `fuente_legacy = 'sheet:jornales'`). Lógica pura: sin base, sin fechas del sistema. Todo lo que
// escribe está en `orquestador/scripts/asignaciones-desde-jornales.mjs`.
//
// UN TRAMO es un período en el que la persona estuvo en UNA obra: días con horas trabajadas
// (`normal`, `extra*`) en la misma obra, separados como mucho por `maxHueco` días hábiles sin
// registro (fines de semana no cuentan). Cambio de obra = tramo nuevo. Las ausencias y licencias
// no eligen obra: heredan la del tramo en curso y lo mantienen vivo (quien está de licencia sigue
// siendo de su obra). Un día con dos obras va al tramo de la obra con más horas y se reporta.
//
// EL ÚLTIMO TRAMO QUEDA ABIERTO sólo si la persona está en la empresa y su último día cae en la
// quincena en curso o en la anterior. Si no, se cierra en su último día. Y NUNCA compite con lo
// que la web ya dice: `conciliar` recorta o cierra el tramo frente a una asignación vigente creada
// por una persona (ver abajo). Las asignaciones existentes no se tocan jamás.

export const MARCA_JORNALES = 'historial reconstruido desde JORNALES (sheet)'
export const NOTAS_JORNALES = `${MARCA_JORNALES} · 08/09/2026`
export const TIPOS_TRABAJADOS = /^(normal|extra)/
export const MAX_HUECO_HABIL = 7

const DIA_MS = 86_400_000
const aUtc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
const aIso = (ms) => new Date(ms).toISOString().slice(0, 10)
export const fechaIso = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10))
export const sumarDias = (iso, n) => aIso(aUtc(iso) + n * DIA_MS)
const esFinDeSemana = (ms) => { const d = new Date(ms).getUTCDay(); return d === 0 || d === 6 }

/** Días hábiles (lun–vie) estrictamente entre dos fechas. */
export function diasHabilesEntre(a, b) {
  let n = 0
  for (let ms = aUtc(a) + DIA_MS; ms < aUtc(b); ms += DIA_MS) if (!esFinDeSemana(ms)) n++
  return n
}

/** Primer día de la quincena ANTERIOR a la que contiene `hoy`: desde ahí un último día «es reciente». */
export function umbralQuincena(hoy) {
  const y = +hoy.slice(0, 4), m = +hoy.slice(5, 7), d = +hoy.slice(8, 10)
  if (d <= 15) {
    const prev = new Date(Date.UTC(y, m - 2, 16))
    return prev.toISOString().slice(0, 10)
  }
  return `${hoy.slice(0, 7)}-01`
}

const esTrabajada = (tipo) => TIPOS_TRABAJADOS.test(String(tipo ?? ''))

/**
 * Arma los tramos por persona.
 * @param filas  [{ persona_id, fecha, obra_id, horas, tipo_hora }] — cualquier orden.
 * @param opts   { hoy: 'YYYY-MM-DD', activos: Set<persona_id>, maxHueco?: number }
 * @returns { tramos: [{ persona_id, obra_id, desde, hasta, dias, horas, abierto }], dobles: [...] }
 */
export function armarTramos(filas, { hoy, activos, maxHueco = MAX_HUECO_HABIL }) {
  const umbral = umbralQuincena(hoy)
  const porPersonaDia = new Map()
  for (const f of filas) {
    if (!f.persona_id || !f.fecha) continue
    const fecha = fechaIso(f.fecha)
    const clave = `${f.persona_id}|${fecha}`
    let dia = porPersonaDia.get(clave)
    if (!dia) { dia = { persona_id: f.persona_id, fecha, obras: new Map(), ausencia: false }; porPersonaDia.set(clave, dia) }
    if (esTrabajada(f.tipo_hora) && f.obra_id) {
      dia.obras.set(f.obra_id, (dia.obras.get(f.obra_id) ?? 0) + Number(f.horas ?? 0))
    } else {
      dia.ausencia = true
    }
  }

  const dobles = []
  const porPersona = new Map()
  for (const dia of porPersonaDia.values()) {
    if (dia.obras.size > 1) {
      const orden = [...dia.obras.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      dobles.push({
        persona_id: dia.persona_id, fecha: dia.fecha,
        elegida: orden[0][0], horas_elegida: orden[0][1],
        descartadas: orden.slice(1).map(([obra_id, horas]) => ({ obra_id, horas })),
      })
      dia.obra = orden[0][0]
      dia.horas = orden[0][1]
    } else if (dia.obras.size === 1) {
      const [[obra, horas]] = dia.obras.entries()
      dia.obra = obra
      dia.horas = horas
    } else {
      dia.obra = null // ausencia/licencia: hereda
      dia.horas = 0
    }
    if (!porPersona.has(dia.persona_id)) porPersona.set(dia.persona_id, [])
    porPersona.get(dia.persona_id).push(dia)
  }

  const tramos = []
  for (const [persona_id, dias] of porPersona) {
    dias.sort((a, b) => a.fecha.localeCompare(b.fecha))
    let actual = null
    for (const dia of dias) {
      const corta = actual && diasHabilesEntre(actual.hasta, dia.fecha) > maxHueco
      if (dia.obra === null) {
        // Ausencia sin tramo en curso (o tras un hueco largo): no hay obra que heredar.
        if (!actual || corta) continue
        actual.hasta = dia.fecha
        continue
      }
      if (!actual || corta || actual.obra_id !== dia.obra) {
        actual = { persona_id, obra_id: dia.obra, desde: dia.fecha, hasta: dia.fecha, dias: 0, horas: 0, abierto: false }
        tramos.push(actual)
      }
      actual.hasta = dia.fecha
      actual.dias += 1
      actual.horas += dia.horas
    }
    if (actual && activos.has(persona_id) && actual.hasta >= umbral) actual.abierto = true
  }
  for (const t of tramos) t.horas = Math.round(t.horas * 100) / 100
  tramos.sort((a, b) => a.persona_id.localeCompare(b.persona_id) || a.desde.localeCompare(b.desde))
  return { tramos, dobles, umbral }
}

const esDePrueba = (a) => /PRUEBA|ZZ-E2E/i.test(a.notas ?? '') || /^ZZ/i.test(a.obra_id ?? '')
const esDeJornales = (a) => (a.notas ?? '').includes(MARCA_JORNALES)
const seSolapan = (a, b) =>
  (!a.desde || !b.hasta || a.desde <= b.hasta) && (!b.desde || !a.hasta || b.desde <= a.hasta)

/**
 * Cruza los tramos con lo que ya hay en `obra_asignacion`. Nunca propone tocar una fila existente.
 * @param tramos      salida de `armarTramos`
 * @param existentes  [{ id, persona_id, obra_id, desde, hasta, notas }] tal como están en la base
 * @returns { insertar, omitidos, recortados, cerrados }
 *   - ya existe una fila de JORNALES con la misma persona+obra+desde → `omitidos` (ya_importado)
 *   - una asignación WEB de la MISMA obra se solapa: si empieza después del tramo, el tramo se
 *     recorta al día anterior (`recortados`); si no, no se inserta (`omitidos`, solapa_web)
 *   - la persona tiene una asignación WEB vigente (hasta null) en OTRA obra → el tramo abierto se
 *     cierra en su último día (`cerrados`). La obra de hoy la dice la web, no el histórico.
 */
export function conciliar(tramos, existentes, { conjunto = false } = {}) {
  const previas = existentes.filter((a) => !esDePrueba(a)).map((a) => ({
    ...a, desde: a.desde ? fechaIso(a.desde) : null, hasta: a.hasta ? fechaIso(a.hasta) : null,
  }))
  const web = previas.filter((a) => !esDeJornales(a))
  const jornales = previas.filter(esDeJornales)
  const insertar = [], omitidos = [], recortados = [], cerrados = []

  for (const t0 of tramos) {
    const t = { ...t0, hasta_original: t0.hasta }
    const rango = { desde: t.desde, hasta: t.abierto ? null : t.hasta }

    if (!conjunto && jornales.some((a) => a.persona_id === t.persona_id && a.obra_id === t.obra_id && a.desde === t.desde)) {
      omitidos.push({ tramo: t, motivo: 'ya_importado' })
      continue
    }

    const mismaObra = web.filter((a) => a.persona_id === t.persona_id && a.obra_id === t.obra_id && seSolapan(rango, a))
    let descartar = null
    for (const a of mismaObra.sort((x, y) => String(x.desde).localeCompare(String(y.desde)))) {
      if (a.desde && a.desde > t.desde) {
        const nuevoHasta = sumarDias(a.desde, -1)
        if (rango.hasta === null || nuevoHasta < rango.hasta) {
          rango.hasta = nuevoHasta
          t.abierto = false
          recortados.push({ tramo: t, contra: a, hasta: nuevoHasta })
        }
      } else {
        descartar = a
        break
      }
    }
    if (descartar) { omitidos.push({ tramo: t, motivo: 'solapa_web', contra: descartar }); continue }

    if (t.abierto) {
      const otraVigente = web.find((a) => a.persona_id === t.persona_id && a.obra_id !== t.obra_id && a.hasta === null)
      if (otraVigente) {
        t.abierto = false
        rango.hasta = t.hasta
        cerrados.push({ tramo: t, contra: otraVigente })
      }
    }
    insertar.push({
      persona_id: t.persona_id, obra_id: t.obra_id, rol: 'integrante',
      desde: rango.desde, hasta: t.abierto ? null : rango.hasta,
      dias: t.dias, horas: t.horas, notas: NOTAS_JORNALES,
    })
  }
  return { insertar, omitidos, recortados, cerrados }
}

// ═══ RECALCULAR COMO CONJUNTO, NO COMO INSERTS SUELTOS (08/09/2026) ═══
//
// `conciliar` sólo sabe INSERTAR: si un tramo cambia de fecha porque se corrigió la obra de un día,
// la fila vieja queda y la nueva se agrega al lado — la persona termina con dos historiales que se
// contradicen. El 08/09 hubo que borrar 105 filas y reinsertar 212 a mano por esto.
//
// Acá el historial de JORNALES se trata como lo que es: un DERIVADO de `registros_hh`. Se calcula
// entero, se compara con lo que hay, y la diferencia se aplica. Lo que NO es de JORNALES no se mira
// siquiera, y lo que empieza de hoy en adelante (lo que el dueño acaba de fijar) queda intocable
// aunque el histórico no lo produzca.
const claveTramo = (a) => `${a.persona_id}|${a.obra_id}|${a.desde}|${a.hasta ?? ''}`

/**
 * @param tramos      salida de `armarTramos`
 * @param existentes  TODAS las filas de `obra_asignacion` tal como están en la base
 * @param opts        { hoy: 'YYYY-MM-DD' } — nada con `desde >= hoy` se borra ni se duplica
 * @returns { insertar, borrar, conservar, protegidas, omitidos, recortados, cerrados }
 */
export function planDeConjunto(tramos, existentes, { hoy }) {
  const { insertar: deseadas, omitidos, recortados, cerrados } = conciliar(tramos, existentes, { conjunto: true })
  const previas = existentes
    .filter((a) => !esDePrueba(a) && esDeJornales(a))
    .map((a) => ({ ...a, desde: a.desde ? fechaIso(a.desde) : null, hasta: a.hasta ? fechaIso(a.hasta) : null }))
  const quiere = new Set(deseadas.map(claveTramo))
  const vivas = new Set(); const borrar = []; const conservar = []; const protegidas = []
  for (const a of previas) {
    const k = claveTramo(a)
    if (a.desde && hoy && a.desde >= hoy) { protegidas.push(a); vivas.add(k); continue }
    if (quiere.has(k) && !vivas.has(k)) { vivas.add(k); conservar.push(a) } else borrar.push(a)
  }
  const insertar = deseadas.filter((d) => !vivas.has(claveTramo(d)))
  return { insertar, borrar, conservar, protegidas, omitidos, recortados, cerrados }
}
