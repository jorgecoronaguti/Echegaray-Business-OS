// LA LECTURA DEL PLANO — de la estructura de `razonar()` a los pasos dibujables.
//
// «Presupuestos v5 · Lectura del plano»: el cómputo no es una lista que xsas escupe — es la
// consecuencia de leer el plano en un orden, y cada paso deja evidencia y nombra lo que falta.
// El motor produce la estructura (orquestador/lib/plano/razonamiento.mjs) y viaja con la
// cotización (`cotizaciones.razonamiento`); acá SOLO se ordena para la pantalla. PURA.
//
// La regla de siempre: el estado de un paso se DERIVA de sus datos — «firme» cuando todo tiene
// cita, «sin dato» cuando el propio motor nombró un faltante, «revisar» cuando el barrido dejó
// documentos sin leer. Ningún estado se inventa acá, y lo que el plano no dice nunca es un cero.

export type FilaLectura = {
  k: string
  d: string
  sub: string | null
  n: string
  u: string
  v: string | null
  falta: boolean
}

export type PasoLectura = {
  id: string
  /** El orden del razonamiento del dueño: 1 · 2 · x (excavaciones) · 3 · 4 · 5 · 6. */
  etiqueta: string
  titulo: string
  pregunta: string
  estado: 'firme' | 'sin dato' | 'revisar'
  resumen: string
  filas: FilaLectura[]
  faltan: string[]
}

type Grupo = {
  tipo?: unknown
  nombre?: unknown
  cantidad?: unknown
  sinCantidad?: unknown
  seccion?: { texto?: unknown } | null
  laminas?: unknown
  faltan?: unknown
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const textos = (v: unknown): string[] => lista(v).map(txt).filter((x): x is string => x !== null)
const N = (v: number, d = 0) =>
  v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d })

/** Un grupo de elementos del mismo tipo (B0, B1, VF10…) como fila. */
function filaDeGrupo(g: Grupo, unidad = 'un'): FilaLectura {
  const cantidad = num(g.cantidad)
  const sinCantidad = g.sinCantidad === true || cantidad === null
  const seccion = txt(g.seccion?.texto)
  const laminas = textos(g.laminas)
  return {
    k: txt(g.tipo) ?? 's/d',
    d: txt(g.nombre) ?? txt(g.tipo) ?? 's/d',
    sub: seccion ? `sección ${seccion}` : 'sección sin cita en el plano',
    n: sinCantidad ? (cantidad ? `${N(cantidad)} (incompleto)` : '?') : N(cantidad ?? 0),
    u: unidad,
    v: laminas.length ? laminas.join(' · ') : null,
    falta: sinCantidad,
  }
}

function grupos(v: unknown): Grupo[] {
  return lista(v).filter((g): g is Grupo => !!g && typeof g === 'object')
}

const conteo = (gs: Grupo[]) => gs.reduce((a, g) => a + (num(g.cantidad) ?? 0), 0)

function estadoDe(filas: FilaLectura[], faltan: string[]): 'firme' | 'sin dato' {
  return faltan.length || filas.some((f) => f.falta) ? 'sin dato' : 'firme'
}

/** Los pasos del razonamiento, en el orden del dueño. Estructura desconocida ⇒ []. */
export function pasosDeLectura(rz: unknown): PasoLectura[] {
  if (!rz || typeof rz !== 'object') return []
  const r = rz as Record<string, unknown>
  const sup = (r.superficies ?? {}) as Record<string, unknown>
  const bas = (r.bases ?? {}) as Record<string, unknown>
  const exc = (r.excavaciones ?? {}) as Record<string, unknown>
  const fun = (r.fundacionLineal ?? {}) as Record<string, unknown>
  const col = (r.columnas ?? {}) as Record<string, unknown>
  const luc = (r.luces ?? {}) as Record<string, unknown>
  const bar = (r.barrido ?? {}) as Record<string, unknown>
  if (![sup, bas, fun, col, luc, bar, exc].some((x) => Object.keys(x).length)) return []

  const pasos: PasoLectura[] = []

  // ── 1 · SUPERFICIES ──
  {
    const cubierta = sup.cubiertaDeclarada as { area?: unknown; lamina?: unknown } | null | undefined
    const filas: FilaLectura[] = []
    if (cubierta && num(cubierta.area) !== null) {
      filas.push({
        k: txt(cubierta.lamina) ?? 's/d', d: 'Superficie cubierta declarada', sub: null,
        n: N(num(cubierta.area)!), u: 'm²', v: null, falta: false,
      })
    }
    for (const d of lista(sup.declaradas) as { que?: unknown; area?: unknown; lamina?: unknown }[]) {
      const area = num(d?.area)
      if (area === null) continue
      filas.push({ k: txt(d.lamina) ?? 's/d', d: txt(d.que) ?? 'Superficie declarada', sub: null, n: N(area), u: 'm²', v: null, falta: false })
    }
    for (const i of lista(sup.improntas) as { area?: unknown; lamina?: unknown; calculo?: unknown }[]) {
      const area = num(i?.area)
      if (area === null) continue
      filas.push({ k: txt(i.lamina) ?? 's/d', d: 'Impronta (CÁLCULO declarado)', sub: txt(i.calculo), n: N(area, 1), u: 'm²', v: null, falta: false })
    }
    const faltan = textos(sup.faltan)
    pasos.push({
      id: 'superficies', etiqueta: '1', titulo: 'Superficies',
      pregunta: '¿Cuánto cubre, cuánto semicubre y cuánta impronta ocupa?',
      estado: estadoDe(filas, faltan),
      resumen: filas.length
        ? filas.map((f) => `${f.d.toLowerCase()}: ${f.n} ${f.u}`).join(' · ')
        : 'Ninguna superficie con cita en la documentación leída.',
      filas, faltan,
    })
  }

  // ── 2 · BASES Y MUERTOS DE ANCLAJE ──
  {
    const bases = grupos(bas.bases)
    const muertos = grupos(bas.muertos)
    const filas = [...bases.map((g) => filaDeGrupo(g)), ...muertos.map((g) => filaDeGrupo(g))]
    const faltan = [...bases, ...muertos].flatMap((g) => textos(g.faltan))
    pasos.push({
      id: 'bases', etiqueta: '2', titulo: 'Bases y muertos de anclaje',
      pregunta: '¿Cuántas bases por tipo, de qué sección? ¿Cuántos muertos de anclaje?',
      estado: bases.length || muertos.length ? estadoDe(filas, faltan) : 'sin dato',
      resumen: bases.length || muertos.length
        ? `${N(conteo(bases))} base(s) en ${bases.length} tipo(s) · ${muertos.length ? `${N(conteo(muertos))} muerto(s) de anclaje` : 'sin muertos de anclaje detectados'}`
        : 'Ninguna base detectada en la documentación leída.',
      filas, faltan,
    })
  }

  // ── x · EXCAVACIONES: SABER PROFUNDIDADES ──
  {
    const todas = lista(exc.excavaciones) as { elemento?: unknown; profundidad?: unknown; cantidad?: unknown; volumenBanco?: unknown; formula?: unknown; falta?: unknown }[]
    const filas: FilaLectura[] = todas.map((e) => {
      const vol = num(e?.volumenBanco)
      const prof = num(e?.profundidad)
      return {
        k: txt(e?.elemento) ?? 's/d',
        d: prof !== null ? `Cota de fondo −${N(prof, 2)} m` : 'Sin profundidad en la documentación',
        sub: txt(e?.formula) ?? (txt(e?.falta) ? `falta: ${txt(e?.falta)}` : null),
        n: num(e?.cantidad) !== null ? N(num(e?.cantidad)!) : '—',
        u: 'un',
        v: vol !== null ? `${N(vol, 1)} m³ en banco` : 'sin volumen',
        falta: vol === null,
      }
    })
    const faltan = textos(exc.faltan)
    const conVolumen = lista(exc.conVolumen).length
    pasos.push({
      id: 'excavaciones', etiqueta: 'x', titulo: 'Excavaciones y profundidades',
      pregunta: 'Punto por punto: ¿hasta qué cota se excava?',
      estado: estadoDe(filas, faltan),
      resumen: todas.length
        ? `${conVolumen} de ${todas.length} excavación(es) con volumen computable — sin profundidad citada no hay m³, nunca una típica.`
        : 'La documentación leída no declara excavaciones — las profundidades hay que pedirlas.',
      filas, faltan,
    })
  }

  // ── 3 · FUNDACIÓN LINEAL ──
  {
    const vf = grupos(fun.vigasFundacion)
    const ar = grupos(fun.arriostramientos)
    const vc = grupos(fun.vigasCarga)
    const filas = [...vf, ...ar, ...vc].map((g) => filaDeGrupo(g))
    const sismica = (fun.sismica ?? {}) as { declarada?: unknown; cita?: unknown; nota?: unknown }
    const faltan = [...vf, ...ar, ...vc].flatMap((g) => textos(g.faltan))
    if (sismica.declarada !== true && txt(sismica.nota)) faltan.push(txt(sismica.nota)!)
    pasos.push({
      id: 'fundacion-lineal', etiqueta: '3', titulo: 'Vigas de fundación, arriostramiento y carga',
      pregunta: '¿Cuántas vigas de fundación? ¿Arriostramientos? ¿De carga? ¿Hay exigencia sísmica?',
      estado: vf.length || ar.length || vc.length ? estadoDe(filas, faltan) : 'sin dato',
      resumen: `${N(conteo(vf))} de fundación · ${N(conteo(ar))} arriostramiento(s) · ${N(conteo(vc))} de carga`
        + (sismica.declarada === true && txt(sismica.cita) ? ` · sísmica mencionada: «${txt(sismica.cita)}»` : ''),
      filas, faltan,
    })
  }

  // ── 4 · VERTICALES ──
  {
    const cols = grupos(col.columnas)
    const enc = grupos(col.encadenados)
    const filas = [...cols, ...enc].map((g) => filaDeGrupo(g))
    const faltan = [...cols, ...enc].flatMap((g) => textos(g.faltan))
    pasos.push({
      id: 'verticales', etiqueta: '4', titulo: 'Columnas y encadenados',
      pregunta: '¿Cuántas columnas de carga? ¿Va encadenado?',
      estado: cols.length || enc.length ? estadoDe(filas, faltan) : 'sin dato',
      resumen: cols.length || enc.length
        ? `${N(conteo(cols))} columna(s) en ${cols.length} tipo(s) · ${enc.length ? `${N(conteo(enc))} encadenado(s)` : 'sin encadenados detectados'}`
        : 'Ninguna columna detectada en la documentación leída.',
      filas, faltan,
    })
  }

  // ── 5 · LUCES ENTRE APOYOS ──
  {
    const declaradas = lista(luc.luces) as { lamina?: unknown; luces?: unknown }[]
    const vigas = lista(luc.vigas) as { tipo?: unknown; largoUnitario?: unknown; lamina?: unknown }[]
    const filas: FilaLectura[] = [
      ...declaradas.map((l) => ({
        k: txt(l?.lamina) ?? 's/d', d: 'Luces entre ejes declaradas', sub: null,
        n: lista(l?.luces).map((x) => (num(x) !== null ? N(num(x)!, 2) : String(x))).join(' · '),
        u: 'm', v: null, falta: false,
      })),
      ...vigas.map((v) => ({
        k: txt(v?.tipo) ?? 's/d', d: 'Largo unitario citado', sub: null,
        n: num(v?.largoUnitario) !== null ? N(num(v?.largoUnitario)!, 2) : '?',
        u: 'm', v: txt(v?.lamina), falta: num(v?.largoUnitario) === null,
      })),
    ]
    const faltan = textos(luc.faltan)
    pasos.push({
      id: 'luces', etiqueta: '5', titulo: 'Luces entre columna y columna',
      pregunta: '¿Cuánto mide la viga entre columna y columna?',
      estado: estadoDe(filas, faltan),
      resumen: filas.length
        ? `${declaradas.length} grilla(s) con luces declaradas · ${vigas.length} largo(s) unitario(s) citado(s)`
        : 'Ninguna lámina declara luces entre ejes ni largos unitarios.',
      filas, faltan,
    })
  }

  // ── 6 · BARRIDO DEL PLANO ──
  {
    const laminas = lista(bar.laminas) as { lamina?: unknown; archivo?: unknown; vistas?: unknown; elementos?: unknown; dimensionesTotales?: unknown }[]
    const noLegibles = textos(bar.noLegibles)
    const filas: FilaLectura[] = [
      ...laminas.map((l) => ({
        k: txt(l?.lamina) ?? txt(l?.archivo) ?? 's/d',
        d: textos(l?.vistas).join(' · ') || 'Lámina leída',
        sub: txt(l?.dimensionesTotales) ? `dimensiones totales ${txt(l?.dimensionesTotales)}` : null,
        n: num(l?.elementos) !== null ? N(num(l?.elementos)!) : '0',
        u: 'elem', v: null, falta: false,
      })),
      ...noLegibles.map((nombre) => ({
        k: '—', d: nombre, sub: 'no legible (DWG/CAD u otro formato que el OS no abre)',
        n: '—', u: '', v: 'sin leer', falta: true,
      })),
    ]
    pasos.push({
      id: 'barrido', etiqueta: '6', titulo: 'Barrido del plano',
      pregunta: '¿Quedó algo dibujado sin contar?',
      estado: noLegibles.length ? 'revisar' : laminas.length ? 'firme' : 'sin dato',
      resumen: `${laminas.length} lámina(s) leídas` + (noLegibles.length ? ` · ${noLegibles.length} documento(s) NO legibles: el barrido no los pudo mirar` : ' · todo lo legible quedó contado'),
      filas,
      faltan: noLegibles.map((nombre) => `${nombre}: no legible — el barrido no lo pudo mirar`),
    })
  }

  return pasos
}

/** La lectura que viene adentro de una respuesta de XSAS (`datos.razonamiento`). */
export function lecturaDeRespuesta(r: unknown): PasoLectura[] {
  if (!r || typeof r !== 'object') return []
  const datos = (r as { datos?: unknown }).datos
  if (!datos || typeof datos !== 'object') return []
  return pasosDeLectura((datos as { razonamiento?: unknown }).razonamiento)
}
