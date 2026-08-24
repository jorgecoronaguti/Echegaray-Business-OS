// CÓMO SE VE UN FRENTE EN J01 — la traducción de un hecho a los colores medidos en el mockup.
//
// ═══ POR QUÉ ES UN MÓDULO PURO Y NO ESTILOS ADENTRO DEL JSX ═══
//
// El mockup no pinta «rojo si hay problema»: pinta CUATRO combinaciones distintas de texto, fondo y
// borde según el estado, y además cambia el borde de la tarjeta y el color de la barra sólo en uno
// de los cuatro casos (`parado`). Escrito en el JSX, eso son cuatro ternarios anidados que nadie
// puede verificar sin abrir un navegador; escrito acá, cada regla es una línea con su test.
//
// Los valores salen de `J01 · Jefe Hoy.dc.html`, función `est(t)` y el `map` de `frentes`:
//
//   parado      texto #B42318 · fondo #FEF6F5 · borde #F3DDDA · barra #B42318 · borde tarjeta #F3DDDA
//   sin gente   texto #B54708 · fondo #FDF6EE · borde #F0E1CD
//   subcontrato texto #6B6B67 · fondo #FAFAF8 · borde #E7E6E2
//   en curso    texto #175CD3 · fondo #EFF5FF · borde #D6E4FB
//
// ═══ LO QUE NO SE PUDO PORTAR, Y ESTÁ DICHO ═══
//
// El mockup tiene un quinto estado, «Subcontrato», que sale de un campo que el modelo no tiene: no
// existe marca de subcontrato en `obra_actividad`. Su paleta queda escrita porque es la que usa el
// estado «sin horas hoy» —gris, no alarma— y ése sí es un hecho: nadie imputó todavía.

import { estadoDelFrente } from './dia.ts'
import type { FrenteDelDia } from './dia.ts'

export interface Paleta {
  texto: string
  fondo: string
  borde: string
}

export const PALETA: Record<'neg' | 'warn' | 'ink' | 'faint', Paleta> = {
  neg: { texto: '#B42318', fondo: '#FEF6F5', borde: '#F3DDDA' },
  warn: { texto: '#B54708', fondo: '#FDF6EE', borde: '#F0E1CD' },
  ink: { texto: '#175CD3', fondo: '#EFF5FF', borde: '#D6E4FB' },
  faint: { texto: '#6B6B67', fondo: '#FAFAF8', borde: '#E7E6E2' },
}

export interface AspectoDeFrente {
  /** La palabra del estado, con mayúscula inicial como la escribe la pastilla del mockup. */
  palabra: string
  paleta: Paleta
  /** El borde de la TARJETA. Sólo el frente parado tiñe su contorno; el resto queda en hairline. */
  bordeTarjeta: string
  /** El relleno de la barra: rojo si está parado, azul si se movió, gris si sigue en cero. */
  barra: string
}

const GRIS_BARRA = '#D7D5CF'

export function aspectoDeFrente(f: FrenteDelDia): AspectoDeFrente {
  const { palabra, tono } = estadoDelFrente(f)
  const paleta = PALETA[tono]
  const parado = tono === 'neg'
  return {
    palabra: palabra.charAt(0).toUpperCase() + palabra.slice(1),
    paleta,
    bordeTarjeta: parado ? paleta.borde : '#E7E6E2',
    barra: parado ? paleta.texto : (f.pct ?? 0) > 0 ? PALETA.ink.texto : GRIS_BARRA,
  }
}

/**
 * EL RENGLÓN DE DOTACIÓN — «6 de 8» en el mockup.
 *
 * ═══ DESVÍO DECLARADO: NO HAY TOPE DE FRENTE EN EL MODELO ═══
 *
 * «6 de 8» es dotación real sobre tope del frente. El tope NO existe: `obra_asignacion` asigna
 * personas a la OBRA y ninguna tabla declara cuánta gente entra en un frente. Inventarle un
 * denominador sería fabricar el dato con el que el jefe decide si manda más gente.
 *
 * Se publica lo que SÍ es un hecho, en el mismo lugar y con el mismo peso visual: cuántas personas
 * imputaron horas hoy contra alguna tarea del frente. Cuando ninguna tarea abierta tiene cuadrilla
 * prevista, se dice «sin cuadrilla» —que es la decisión de planificación que falta— y se enciende
 * en ámbar, igual que el mockup enciende su «sin cuadrilla».
 */
export function dotacionDeFrente(f: FrenteDelDia): { texto: string; color: string } {
  if (f.sinCuadrilla) return { texto: 'sin cuadrilla', color: PALETA.warn.texto }
  if (f.personasHoy > 0) {
    return {
      texto: `${f.personasHoy} con horas hoy`,
      color: '#6B6B67',
    }
  }
  return { texto: `${f.abiertas} ${f.abiertas === 1 ? 'tarea abierta' : 'tareas abiertas'}`, color: '#6B6B67' }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// J02 · EL ESTADO DE UNA TAREA EN UN SOLO ICONO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Los iconos que J02 usa para el estado. Los nombres son los del mapa `P` del mockup. */
export type IconoDeTarea = 'ok' | 'bloqueo' | 'alerta' | 'reloj' | 'pendiente'

export interface AspectoDeTarea {
  icono: IconoDeTarea
  color: string
  /** Lo que dice el `title` del icono: la palabra que el mockup pone en el tooltip. */
  titulo: string
  /** El relleno de la barra de esa fila. */
  barra: string
  /** El color del porcentaje: verde al 100 %, gris cuando no hay medición. */
  colorValor: string
}

/**
 * EL ESTADO DE LA TAREA, EN EL ORDEN EN QUE EL MOCKUP LO DECIDE.
 *
 * Terminada gana sobre todo lo demás —una tarea hecha con un impedimento viejo abierto está hecha—,
 * después el impedimento (es lo único que alguien puede destrabar hoy), después los dos huecos de
 * planificación que el mockup dibuja como «Sin cuadrilla» y «Sin análisis», y recién ahí el curso.
 *
 * `avance_pct` en `null` NO pinta barra y su número dice «—»: cero afirma que no se empezó y null
 * dice que nadie lo midió. Es la nota literal de J02: «Sin plan no es 0».
 */
export function aspectoDeTarea(a: {
  estado_operativo: string
  impedimentos_abiertos: number
  metodo_avance: string | null
  cuadrilla_prevista: string | null
  avance_pct: number | null
}): AspectoDeTarea {
  const terminada = a.estado_operativo === 'hecha' || a.estado_operativo === 'terminada'
  const colorValor = a.avance_pct == null ? '#91918B' : a.avance_pct >= 100 ? '#067647' : '#1F1F1E'
  if (terminada) return { icono: 'ok', color: '#067647', titulo: 'Hecha', barra: '#067647', colorValor }
  if (a.impedimentos_abiertos > 0) {
    return { icono: 'bloqueo', color: '#B42318', titulo: 'Parada', barra: '#B42318', colorValor }
  }
  const barra = (a.avance_pct ?? 0) > 0 ? PALETA.ink.texto : GRIS_BARRA
  if (a.metodo_avance == null) {
    return { icono: 'alerta', color: '#B54708', titulo: 'Sin análisis', barra, colorValor }
  }
  if (!a.cuadrilla_prevista) {
    return { icono: 'alerta', color: '#B54708', titulo: 'Sin cuadrilla', barra, colorValor }
  }
  if (a.estado_operativo === 'en_curso') {
    return { icono: 'reloj', color: PALETA.ink.texto, titulo: 'En curso', barra, colorValor }
  }
  return { icono: 'pendiente', color: '#C9C4C2', titulo: 'Pendiente', barra, colorValor }
}

/** El renglón del parte: verde con tilde cuando alguien declaró hasta dónde llegó hoy, ámbar si no. */
export function parteDeFrente(f: FrenteDelDia): { texto: string; color: string; icono: 'ok' | 'reloj' } {
  return f.parteHoy
    ? { texto: 'parte cargado', color: '#067647', icono: 'ok' }
    : { texto: 'sin parte', color: PALETA.warn.texto, icono: 'reloj' }
}
