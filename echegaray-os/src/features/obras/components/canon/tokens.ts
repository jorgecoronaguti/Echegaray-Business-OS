// LOS VALORES MEDIDOS EN «renovac diseño.zip» — no una reinterpretación del design system.
//
// ═══ POR QUÉ EXISTE ESTE ARCHIVO ═══
//
// Las cuatro entregas anteriores del rediseño se hicieron traduciendo los mockups al sistema de
// componentes (`shared/components/ds`), y el dueño las rechazó las cuatro con la misma frase:
// «estructura parecida, aspecto distinto». La causa es mecánica: el DS tiene SUS valores
// (`text-[12.5px]`, `border-line`) y el zip tiene los suyos, y cada traducción perdía dos o tres
// píxeles por regla hasta que la pantalla dejaba de ser la del mockup.
//
// Acá los valores viajan tal como están escritos en los `.dc.html`, con el archivo y el elemento de
// donde salió cada uno. Cambiar uno de estos números sin abrir el mockup es volver a empezar.
//
// NO ES UN TEMA NI UNA PALETA NUEVA: es la transcripción de una fuente externa. El día que el zip
// se actualice, este archivo se vuelve a medir contra él — por eso vale la pena que estén juntos y
// no repartidos en veinte componentes.

import type { CSSProperties } from 'react'

/** Los colores, tal como aparecen en los `style=` de los mockups 01–06. */
export const C = {
  /** `body { background:#F7F7F5 }` en los seis mockups. */
  lienzo: '#F7F7F5',
  superficie: '#FFFFFF',
  /** El fondo de encabezado de tabla y de barra de sub-navegación. */
  tenueFondo: '#FAFAF8',
  /** El borde de todas las tarjetas y del encabezado de tabla. */
  borde: '#E7E6E2',
  /** El divisor entre filas de una tabla (más claro que el borde de la tarjeta). */
  bordeFila: '#F1F0EC',
  /** El divisor entre filas de una lista dentro de una tarjeta. */
  bordeLista: '#F5F4F0',
  /** El divisor entre la cabecera de una tarjeta y su cuerpo. */
  bordeTarjeta: '#EFEEEA',
  /** Bordes de control en hover. */
  bordeFuerte: '#D7D5CF',

  tinta: '#1F1F1E',
  tintaMedia: '#3A3A38',
  tintaSuave: '#6B6B67',
  tenue: '#91918B',
  /** Texto sobre fondo grafito y números apagados dentro de un chip activo. */
  apagado: '#B9B7B1',
  /** Guiones y chevrons decorativos. */
  fantasma: '#C9C4C2',

  marca: '#FDC900',
  marcaHover: '#EEBE00',
  /** El fondo de fila seleccionada del árbol y del avance masivo. */
  marcaSuave: '#FEF9E6',
  grafito: '#30302F',

  pos: '#067647',
  posFondo: '#F1F9F4',
  posBorde: '#D6EBDF',

  curso: '#175CD3',
  cursoFondo: '#EFF5FF',
  cursoBorde: '#D6E4FB',

  warn: '#B54708',
  warnFondo: '#FDF6EE',
  warnBorde: '#F0E1CD',

  neg: '#B42318',
  negFondo: '#FEF6F5',
  negBorde: '#F3DDDA',

  /** El canal vacío de toda barra de progreso del zip. */
  barraCanal: '#EAE7E6',
  /** La pista de una barra de Gantt todavía sin arrancar. */
  pistaPlan: '#F0EFEB',
  /** El bloque REAL del panel de tarea (04): fondo, borde y rótulo. */
  realFondo: '#F5FAF7',
  realBorde: '#E2EFE8',
  realRotulo: '#67857A',
} as const

/** La familia mono del zip (`fontFamily:'IBM Plex Mono',monospace`), servida por `layout.tsx`. */
export const MONO = "var(--font-plex-mono), 'IBM Plex Mono', monospace"

/** El estilo de una pastilla de estado: mismo shape en 01, 02, 03 y 04. */
export interface Pastilla {
  t: string
  c: string
  f: string
  b: string
}

/** Los cuatro tonos de pastilla del zip, con sus tres colores. */
export const PASTILLA = {
  pos: { c: C.pos, f: C.posFondo, b: C.posBorde },
  curso: { c: C.curso, f: C.cursoFondo, b: C.cursoBorde },
  warn: { c: C.warn, f: C.warnFondo, b: C.warnBorde },
  neg: { c: C.neg, f: C.negFondo, b: C.negBorde },
  /** «Previo», «Pendiente», «Sin plan»: gris sobre gris, sin color semántico. */
  neutro: { c: C.tintaSuave, f: C.tenueFondo, b: C.borde },
} as const

export type TonoPastilla = keyof typeof PASTILLA

/**
 * LOS COLORES DE UN CHIP DE FILTRO, MEDIDOS EN «03 · Obra Tareas.dc.html» (línea 646–649):
 * activo `borde/fondo #30302F`, texto `#FFFFFF`, conteo `#B9B7B1`; apagado `#FFFFFF` con borde
 * `#E7E6E2`, texto `#3A3A38` y conteo `#91918B`.
 *
 * `secundario` NO ESTÁ EN EL MOCKUP Y POR ESO EXISTE. El 03 dibuja cuatro filtros; el código sostiene
 * dos más —«Atrasadas» y «Sin asignar»—, y el comentario que los agregó prometió que iban «detrás,
 * apagadas». No lo estaban: los seis salían idénticos. El apagado es el `#6B6B67` con el que ese
 * mismo mockup pinta lo secundario (la sub-solapa inactiva y el conmutador de dependencias), y NO un
 * gris nuevo. El conteo se queda en `faint`: dice cuántas actividades hay atrasadas y eso es un dato,
 * no un adorno.
 *
 * Es una función y no tres ternarios adentro del JSX porque es lo único de la pastilla que se puede
 * probar sin navegador.
 */
export function colorDeChip({ activo, secundario = false }: { activo: boolean; secundario?: boolean }) {
  if (activo) {
    return { borde: C.grafito, fondo: C.grafito, texto: C.superficie, cuenta: C.apagado }
  }
  return {
    borde: C.borde,
    fondo: C.superficie,
    texto: secundario ? C.tintaSuave : C.tintaMedia,
    cuenta: C.tenue,
  }
}

// ═══ LOS DOS ESTILOS DE BOTÓN VIVEN EN UN MÓDULO NEUTRAL ═══
//
// Estaban en `Piezas.tsx`, que lleva `'use client'`, y la cabecera de la obra los usa desde un
// Server Component: importar un VALOR de un módulo `use client` desde el servidor es lo que
// `orquestador/lib/frontera-servidor-cliente.test.mjs` prohíbe. Son objetos de estilo, no
// componentes: no tienen por qué cruzar esa frontera.

/** EL BOTÓN AMARILLO — la única primaria de cada pantalla del zip. */
export const ESTILO_PRIMARIA: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '6px', background: C.marca, color: C.tinta,
  fontSize: '12.5px', fontWeight: 600, borderRadius: '6px', padding: '6px 11px', cursor: 'pointer',
  border: 'none', fontFamily: 'inherit', lineHeight: 1.4, whiteSpace: 'nowrap',
}

/** EL BOTÓN SECUNDARIO — blanco con borde (03 «Rubro», 04 «Vincular actividad»). */
export const ESTILO_SECUNDARIA: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '6px', background: C.superficie,
  border: `1px solid ${C.borde}`, color: C.tintaMedia, fontSize: '12.5px', borderRadius: '6px',
  padding: '6px 11px', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.4, whiteSpace: 'nowrap',
}

