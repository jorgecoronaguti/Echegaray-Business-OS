// EL LENGUAJE VISUAL DE UNA CARTERA — el de Obras «Ver: Tabla», escrito UNA vez para las dos listas.
//
// ═══ POR QUÉ EXISTE (dueño, 25/09/2026) ═══
//
// «Unificar diseño, sólo UI, de cómo se ve Obras a cómo se ve Admin Clientes: que se vea como Obras
// vista tabla.» Las dos pantallas son la misma pregunta —qué le estoy haciendo a cada cliente— y se
// dibujaban con dos lenguajes: Obras con el porte literal de `erp-obras/01.html` / `M01.html`, Clientes
// con el patrón v2 de agosto. Con los valores copiados a mano en cada una, se separan en el primer
// retoque; por eso viven acá y `CarteraObras` los importa de este mismo archivo.
//
// NO ES UNA PALETA NUEVA: cada valor es el que `features/obras/components/canon/tokens.ts` transcribió
// del zip, repetido acá porque `shared` no importa de una feature. Si uno cambia allá, cambia acá.
//
// MÓDULO NEUTRAL, SIN `'use client'`: son objetos de estilo, no componentes. Clientes se dibuja en el
// servidor y un valor importado de un módulo `use client` le llegaría como referencia de cliente —el
// React #441 del 23/09—. Ver `orquestador/lib/frontera-servidor-cliente.test.mjs`.
//
// ═══ DOS CORTES, UNA MEDIDA ═══
//
// Obras decide el teléfono en el cliente (`useAnchoVentana`, < 640px) y elige el objeto `…Telefono`.
// Clientes se dibuja en el servidor y no sabe el ancho: usa el objeto de escritorio en línea y las
// clases `CLASE_…_TELEFONO` (`max-md:!…`) que pisan esos mismos valores bajo 768px. Cada clase está
// escrita al lado del objeto que reproduce: si se toca uno, se ve el otro.

import type { CSSProperties } from 'react'

/** Los colores de la cartera, con el nombre que tienen en `obras/components/canon/tokens.ts`. */
export const K = {
  superficie: '#FFFFFF',
  tenueFondo: '#FAFAF8',
  borde: '#E7E6E2',
  bordeFuerte: '#D7D5CF',
  tinta: '#1F1F1E',
  tintaSuave: '#6B6B67',
  tenue: '#91918B',
  grafito: '#30302F',
  marca: '#FDC900',
  curso: '#175CD3',
  warn: '#B54708',
} as const

/** La mono del zip (IBM Plex Mono, servida por `layout.tsx`): rótulos de columna y conteos. */
export const MONO_CARTERA = "var(--font-plex-mono), 'IBM Plex Mono', monospace"

// ═══ EL MARCO Y EL ENCABEZADO FIJO ═══

/** El cuerpo blanco de la cartera: 26/30/34 en escritorio (01), 16 en el teléfono (M01). */
export const MARCO_CARTERA: CSSProperties = {
  background: K.superficie, padding: '26px 30px 34px', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1,
}
export const CLASE_MARCO_TELEFONO = 'max-md:!p-4 max-md:!gap-[18px]'

/**
 * EL ENCABEZADO QUEDA FIJO (dueño, 23/09/2026: «el header no puede actualizar siempre y debe quedar
 * fijo»): título, buscador y chips se pegan justo debajo de la barra de la app (44 px). Los márgenes
 * negativos absorben el padding del marco para que el fondo cubra de borde a borde.
 */
export const ENCABEZADO_FIJO: CSSProperties = {
  position: 'sticky', top: '44px', zIndex: 20, background: K.superficie, display: 'flex', flexDirection: 'column', gap: '20px',
  margin: '-26px -30px 0', padding: '26px 30px 14px', borderBottom: `1px solid ${K.borde}`,
}
export const ENCABEZADO_FIJO_TELEFONO: CSSProperties = {
  position: 'sticky', top: '44px', zIndex: 20, background: K.superficie, display: 'flex', flexDirection: 'column', gap: '18px',
  margin: '-16px -16px 0', padding: '16px 16px 12px', borderBottom: `1px solid ${K.borde}`,
}
export const CLASE_ENCABEZADO_TELEFONO = 'max-md:!gap-[18px] max-md:!-mx-4 max-md:!-mt-4 max-md:!px-4 max-md:!pt-4 max-md:!pb-3'

/** «Obras» / «Clientes»: 19px, 600. */
export const ESTILO_TITULO: CSSProperties = { fontSize: '19px', fontWeight: 600, letterSpacing: '-.01em', color: K.tinta }
/** La bajada con los conteos, debajo del título. En el teléfono no se dibuja (M01). */
export const ESTILO_BAJADA: CSSProperties = { fontSize: '13px', color: K.tintaSuave }

// ═══ EL BUSCADOR Y LA PRIMARIA ═══

/** La caja del buscador: 230×32 (01) · a todo el ancho y 44px (M01). */
export function estiloBuscador(telefono: boolean): CSSProperties {
  return {
    width: telefono ? undefined : '230px', flex: telefono ? 1 : undefined, height: telefono ? '44px' : '32px',
    padding: telefono ? '0 12px' : '0 11px', border: `1px solid ${K.bordeFuerte}`, borderRadius: '6px',
    background: K.superficie, display: 'flex', alignItems: 'center', gap: telefono ? '8px' : '7px', color: K.tenue,
  }
}
export const CLASE_BUSCADOR_TELEFONO = 'max-md:!w-full max-md:!h-11 max-md:!px-3 max-md:!gap-2'
export function estiloEntradaBuscador(telefono: boolean): CSSProperties {
  return {
    border: 'none', background: 'transparent', outline: 'none', fontFamily: 'inherit', width: '100%', padding: 0,
    fontSize: telefono ? '13.5px' : '13px', color: K.tinta,
  }
}

/** La primaria amarilla: 32px arriba a la derecha (01) · 48px al pie, sobre la barra (M01). */
export function estiloPrimaria(telefono: boolean): CSSProperties {
  return {
    height: telefono ? '48px' : '32px', padding: telefono ? 0 : '0 14px', borderRadius: '6px', background: K.marca,
    color: K.grafito, fontSize: telefono ? '14px' : '13px', fontWeight: 600, display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: telefono ? '8px' : '7px', textDecoration: 'none', whiteSpace: 'nowrap',
  }
}
/** La banda blanca que sostiene la primaria del teléfono encima de la barra de abajo (64px). */
export const BARRA_PRIMARIA_TELEFONO: CSSProperties = {
  position: 'fixed', left: 0, right: 0, bottom: '64px', padding: '12px 16px 18px', background: K.superficie,
  borderTop: `1px solid ${K.borde}`, zIndex: 19,
}

// ═══ LOS FILTROS: subrayados en escritorio (01), pastillas de 36px en el teléfono (M01) ═══

export function estiloFiltros(telefono: boolean): CSSProperties {
  return telefono
    ? { display: 'flex', gap: '8px', overflowX: 'auto', marginRight: '-16px', paddingRight: '16px', scrollbarWidth: 'none' }
    : { display: 'flex', alignItems: 'center', gap: '18px', fontSize: '12.5px' }
}
export const CLASE_FILTROS_TELEFONO = 'max-md:!gap-2 max-md:!overflow-x-auto max-md:!-mr-4 max-md:!pr-4 max-md:[scrollbar-width:none]'

export function estiloChip(activo: boolean, telefono: boolean): CSSProperties {
  return telefono ? {
    font: 'inherit', height: '36px', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '6px',
    whiteSpace: 'nowrap', border: `1px solid ${activo ? K.grafito : K.borde}`, borderRadius: '6px',
    fontSize: '12.5px', fontWeight: activo ? 500 : 400, color: activo ? K.tinta : K.tintaSuave,
    background: K.superficie, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
  } : {
    display: 'inline-flex', alignItems: 'center', gap: '6px', border: 'none', padding: 0, paddingBottom: '2px',
    background: 'none', font: 'inherit', fontFamily: 'inherit', fontSize: '12.5px', cursor: 'pointer',
    color: activo ? K.tinta : K.tintaSuave, fontWeight: activo ? 500 : 400,
    boxShadow: activo ? `inset 0 -1.5px 0 ${K.grafito}` : undefined,
  }
}
/** El subrayado se va y aparece la caja de 36px; el borde activo es grafito, el apagado `borde`. */
export const CLASE_CHIP_TELEFONO = 'max-md:!h-9 max-md:!px-3 max-md:!pb-0 max-md:!rounded-md max-md:!shadow-none max-md:whitespace-nowrap max-md:shrink-0'
export const CLASE_CHIP_TELEFONO_ACTIVO = 'max-md:!border max-md:!border-solid max-md:!border-accent'
export const CLASE_CHIP_TELEFONO_APAGADO = 'max-md:!border max-md:!border-solid max-md:!border-line'
export function estiloCuentaChip(telefono: boolean): CSSProperties {
  return telefono ? { fontFamily: MONO_CARTERA, fontSize: '11px', color: K.tenue } : { color: K.tenue, fontWeight: 400 }
}

// ═══ LA TABLA ═══

/** Los rótulos de columna: 40px, mono 10,5px en versalitas grises, filo inferior. Sin `gridTemplateColumns`. */
export const ESTILO_ROTULOS: CSSProperties = {
  display: 'grid', gap: '22px', height: '40px', alignItems: 'center',
  borderBottom: `1px solid ${K.borde}`, fontFamily: MONO_CARTERA, fontSize: '10.5px', letterSpacing: '.06em',
  color: K.tenue, textTransform: 'uppercase',
}

/** El encabezado del grupo —el cliente, «Messina 4»—: banda de 36px en escritorio, texto sobre filo en el teléfono. */
export function estiloCabeceraGrupo(telefono: boolean, conNombre: boolean): CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0,
    minHeight: telefono ? '40px' : '36px', padding: telefono ? '10px 0 4px' : '0',
    borderBottom: `1px solid ${K.borde}`, background: telefono ? undefined : K.tenueFondo,
    fontSize: telefono ? '12px' : '11.5px', fontWeight: 600, letterSpacing: '.02em', color: conNombre ? K.tinta : K.tenue,
  }
}
export const CLASE_CABECERA_GRUPO_TELEFONO = 'max-md:!min-h-10 max-md:!pt-[10px] max-md:!pb-1 max-md:!bg-transparent max-md:!text-[12px]'
/** El número al lado del nombre del grupo. */
export const ESTILO_CUENTA_GRUPO: CSSProperties = { fontFamily: MONO_CARTERA, fontSize: '11px', fontWeight: 400, color: K.tenue }

/** Una fila de 64px (01) · 62px en el teléfono (M01). Sin `gridTemplateColumns`. */
export const ESTILO_FILA: CSSProperties = {
  display: 'grid', gap: '22px', minHeight: '64px', alignItems: 'center',
  borderBottom: `1px solid ${K.borde}`, fontSize: '13.5px', color: K.tinta,
}
export const CLASE_FILA_TELEFONO = 'max-md:!min-h-[62px] max-md:!text-[14px] max-md:!gap-3'
/** El hover de la fila: el fondo tenue del encabezado de grupo (`K.tenueFondo`). */
export const HOVER_FILA_CARTERA = 'hover:bg-surface-quiet'

/** El nombre de la fila: 500, una línea con «…». */
export const ESTILO_NOMBRE_FILA: CSSProperties = {
  fontWeight: 500, color: K.tinta, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}
/** La línea de abajo del nombre (el estado, en Obras; lo que cuelga de la fila, en Clientes). */
export const ESTILO_SUBLINEA: CSSProperties = { fontSize: '12px', color: K.tintaSuave }
/** La sangría de la fila hija (el adicional) y su «└». */
export const SANGRIA_HIJA = 22
export const ESTILO_CODO: CSSProperties = { color: K.tenue, marginRight: '6px' }
