// C03 · CREAR PEGANDO LA PLANILLA — cómo se lee lo que viene del Sheet. PURO.
//
// La pestaña NUEVO de la obra tiene `#  Actividad  Uni  Cant  Comienzo  Fin  Días`. El nivel sale de
// la numeración (1 → Rubro · 1.1 → Épica · 1.1.1 → Historia · 1.1.1.1 → Tarea); una fila sin número
// es hija de la anterior (subtarea). Las fechas vienen como «24-ago» y se resuelven contra el
// calendario de la obra. Nada se escribe hasta «Crear»: acá sólo se reconoce y se avisa.
//
// Módulo puro (sin `@/`): lo usa la pantalla para la vista previa y la acción para escribir, así las
// dos leen lo mismo. Lo prueba `node --test` al lado.

import { diasHabilesEntre } from '../components/items/filasDeItems.ts'
import { ROTULO_NIVEL, type NivelEstructura } from './estructura.ts'

export interface FilaPlanilla {
  /** El número tal como vino («1.2.1»), o null para las filas sin número. */
  codigo: string | null
  nombre: string
  nivel: NivelEstructura
  /** 0 rubro · 1 épica · 2 historia · 3 tarea · 4 subtarea: la sangría. */
  profundidad: number
  /** El índice de la fila padre dentro de `filas`, o null para un rubro. */
  padre: number | null
  unidad: string | null
  cantidad: number | null
  inicio: string | null
  fin: string | null
  dias: number | null
  /** «revisar cantidad» · «sin número · subtarea» · null. */
  aviso: string | null
}

export interface LecturaPlanilla {
  filas: FilaPlanilla[]
  /** Cuántas líneas no vacías se pegaron (sin la cabecera). */
  filasPegadas: number
  /** Los avisos de «Cómo se leyó», en el orden del diseño. */
  avisos: { tono: 'warn' | 'ok'; texto: string }[]
  /** Cuántas fechas quedaron dentro del plazo de la obra, y cuántas tienen fecha. */
  fechasDentro: number
  conFecha: number
}

const MESES: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
}

/** «24-ago» · «24/08» · «24/08/2026» · «2026-08-24» → ISO, con el año del plazo de la obra. */
export function fechaDePlanilla(texto: string, anioBase: number): string | null {
  const t = texto.trim().toLowerCase()
  if (!t) return null
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{1,2})[-/. ]([a-záéíóú]{3})[a-záéíóú]*\.?(?:[-/. ](\d{2,4}))?$/)
  if (m) {
    const mes = MESES[m[2].normalize('NFD').replace(/[̀-ͯ]/g, '')]
    if (!mes) return null
    const anio = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : anioBase
    return `${anio}-${String(mes).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`
  }
  m = t.match(/^(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?$/)
  if (m) {
    const anio = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : anioBase
    return `${anio}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`
  }
  return null
}

const numero = (t: string): number | null => {
  const s = t.trim().replace(/\./g, '').replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const esCodigo = (t: string) => /^\d+(\.\d+)*$/.test(t.trim())

const NIVELES: NivelEstructura[] = ['rubro', 'epica', 'historia', 'tarea', 'subtarea']

/**
 * Lee el texto pegado. `plazo` es el de la obra: da el año de las fechas y decide qué queda dentro.
 */
export function leerPlanilla(texto: string, plazo: { inicio: string | null; fin: string | null }): LecturaPlanilla {
  const anioBase = plazo.inicio ? Number(plazo.inicio.slice(0, 4)) : new Date().getFullYear()
  const lineas = texto.split(/\r?\n/).map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim().length > 0)
  const filas: FilaPlanilla[] = []
  let filasPegadas = 0
  let sinNumero = 0
  let cantidadChica = 0
  const nombresSubtarea: string[] = []
  // Un índice por profundidad: el último padre visto en cada nivel.
  const ultimoPor: (number | null)[] = [null, null, null, null, null]

  for (const linea of lineas) {
    const celdas = linea.split('\t').map((c) => c.trim())
    if (celdas.length < 2 && !/\t/.test(linea)) continue
    const [c0, c1, c2 = '', c3 = '', c4 = '', c5 = '', c6 = ''] = celdas
    // La cabecera («#  Actividad …») no es una fila.
    if (/^#$/.test(c0) && /actividad/i.test(c1)) continue
    if (!c1 && !c0) continue
    filasPegadas++
    const codigo = esCodigo(c0) ? c0 : null
    let profundidad: number
    let padre: number | null
    if (codigo) {
      profundidad = Math.min(4, codigo.split('.').length - 1)
      padre = profundidad === 0 ? null : (ultimoPor[profundidad - 1] ?? null)
    } else {
      // Sin número: hija de la anterior con número.
      const anterior = [...filas].reverse().find((f) => f.codigo != null)
      const idx = anterior ? filas.indexOf(anterior) : -1
      padre = idx >= 0 ? idx : null
      profundidad = Math.min(4, (anterior?.profundidad ?? -1) + 1)
      sinNumero++
    }
    const nombre = (codigo ? c1 : (c1 || c0)).trim()
    const cantidad = numero(c3)
    const inicio = fechaDePlanilla(c4, anioBase)
    const fin = fechaDePlanilla(c5, anioBase)
    const dias = numero(c6) ?? (inicio && fin ? diasHabilesEntre(inicio, fin) : null)
    let aviso: string | null = null
    if (!codigo) aviso = 'sin número · subtarea'
    else if (cantidad != null && cantidad > 0 && cantidad < 1) { aviso = 'revisar cantidad'; cantidadChica++ }
    const nivel = NIVELES[profundidad]
    const fila: FilaPlanilla = {
      codigo, nombre, nivel, profundidad, padre,
      unidad: c2 || null, cantidad, inicio, fin, dias, aviso,
    }
    filas.push(fila)
    if (codigo) {
      ultimoPor[profundidad] = filas.length - 1
      for (let d = profundidad + 1; d < ultimoPor.length; d++) ultimoPor[d] = null
    } else if (padre != null) {
      nombresSubtarea.push(filas[padre].nombre)
    }
  }

  const conFecha = filas.filter((f) => f.inicio || f.fin)
  const dentro = conFecha.filter((f) => {
    const ini = f.inicio ?? f.fin!
    const fin = f.fin ?? f.inicio!
    return (!plazo.inicio || ini >= plazo.inicio) && (!plazo.fin || fin <= plazo.fin)
  })

  const avisos: LecturaPlanilla['avisos'] = []
  if (sinNumero > 0) {
    const padres = [...new Set(nombresSubtarea)]
    avisos.push({ tono: 'warn', texto: `${sinNumero} ${sinNumero === 1 ? 'fila sin número → subtarea' : 'filas sin número → subtareas'} de ${padres.map((p) => `«${p}»`).join(', ')}` })
  }
  for (const f of filas) {
    if (f.aviso === 'revisar cantidad') {
      avisos.push({ tono: 'warn', texto: `«${f.nombre}» ${f.cantidad!.toLocaleString('es-AR')} ${f.unidad ?? ''} · cantidad menor que la unidad`.replace('  ', ' ') })
    }
  }
  if (filas.length > 0) avisos.push({ tono: 'warn', texto: 'Ponderación: la planilla no la trae · se reparte por días teóricos' })
  if (conFecha.length > 0) {
    const plazoTxt = plazo.inicio && plazo.fin ? ` ${dm(plazo.inicio)} → ${dm(plazo.fin)}` : ''
    avisos.push({
      tono: dentro.length === conFecha.length ? 'ok' : 'warn',
      texto: dentro.length === conFecha.length
        ? `${dentro.length} fechas dentro del plazo${plazoTxt}`
        : `${conFecha.length - dentro.length} de ${conFecha.length} fechas fuera del plazo${plazoTxt}`,
    })
  }
  void cantidadChica
  return { filas, filasPegadas, avisos, fechasDentro: dentro.length, conFecha: conFecha.length }
}

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** «Rubro» · «Épica» · «Tarea»… para la columna Nivel de C03. */
export const rotuloNivel = (n: NivelEstructura) => ROTULO_NIVEL[n]

/** Cuántos ítems reconoció: todas las filas con nombre. */
export function itemsReconocidos(l: LecturaPlanilla): number {
  return l.filas.filter((f) => f.nombre.length > 0).length
}

/** «un · 4 · 5 d» (MC6). */
export function bajadaPlanilla(f: FilaPlanilla): string {
  const partes: string[] = []
  if (f.unidad) partes.push(f.unidad)
  if (f.cantidad != null) partes.push(f.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 2 }))
  if (f.dias != null) partes.push(`${f.dias} d`)
  return partes.join(' · ')
}
