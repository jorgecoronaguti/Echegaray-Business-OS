'use client'

// SIN MODELO DE LENGUAJE NO ES «PRESUPUESTOS CAÍDO» — es un estado, y se dibuja como estado.
//
// ═══ QUÉ SIGUE ANDANDO, DICHO ANTES DE QUE LO PREGUNTEN ═══
//
// Cómputo cargado, composiciones, precios, cascada, coeficiente, cola de excepciones, inspector y —
// sobre todo— el freno de congelado. Lo único que se cae es interpretar texto libre y documentos
// nuevos. Un «error inesperado» genérico haría creer que el módulo no sirve, cuando lo que no sirve
// es una de sus entradas.
//
// ═══ NINGÚN BOTÓN MUERTO ═══
//
// Sólo se ofrece como BOTÓN lo que tiene una acción real atrás: hoy, preguntar qué falta para
// enviar, que es una intención con gramática y tests (`blockers_query`). Confirmar en lote y
// actualizar precios vencidos NO existen como acción todavía, así que se ofrecen como ENLACE a la
// sección donde se hace a mano, con el motivo escrito. Un botón que no hace nada es peor que la
// ausencia del botón: enseña a desconfiar de todos los demás.

import Link from 'next/link'
import { C } from '@/shared/components/canon'

/** La frase canónica de `blockers_query`. Se manda tal cual: es la que la gramática entiende. */
export const PREGUNTA_BLOQUEOS = '¿qué me falta para enviar?'

export function BannerDeterministico() {
  return (
    <div
      data-testid="banner-deterministico"
      style={{
        flex: 'none', borderBottom: `1px solid ${C.linea}`, background: '#FFFDF3',
        padding: '14px 24px', display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 600, color: C.warn }}>Modo determinístico</span>
      <span style={{ fontSize: 12, color: C.tintaSuave, lineHeight: 1.65 }}>
        xsas está sin modelo de lenguaje. Sigue vivo todo lo que se calcula con los datos que ya
        están: cómputo cargado, composiciones, precios, cascada, coeficiente, la cola de excepciones
        y el freno de congelado. Lo que no puede hacer es interpretar texto libre ni documentos
        nuevos hasta que vuelva.
      </span>
    </div>
  )
}

export function AccionesDeterministicas({ onPreguntar, hrefAtencion, hrefCostos, pendiente }: {
  onPreguntar: (texto: string) => void
  hrefAtencion: string
  hrefCostos: string
  pendiente: boolean
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }} data-testid="acciones-deterministicas">
      <button
        type="button"
        disabled={pendiente}
        onClick={() => onPreguntar(PREGUNTA_BLOQUEOS)}
        data-testid="accion-det-bloqueos"
        style={{
          border: `1px solid ${C.linea}`, borderRadius: 14, background: C.superficieTenue,
          padding: '6px 11px', fontSize: 11.5, color: C.tintaSuave, cursor: 'pointer',
        }}
      >
        ver qué falta para enviar
      </button>

      <Enlace href={hrefAtencion} testid="accion-det-revisables">
        ver lo que hay para revisar
      </Enlace>
      <Enlace href={hrefCostos} testid="accion-det-precios">
        ver los precios que usa el presupuesto
      </Enlace>

      <span style={{ flexBasis: '100%', fontSize: 11, color: C.tenue, lineHeight: 1.6 }}>
        Confirmar en lote y actualizar los precios vencidos todavía no existen como acción del
        sistema: por eso van como enlace a donde se hace a mano, y no como un botón que no haría nada.
      </span>
    </div>
  )
}

function Enlace({ href, testid, children }: { href: string; testid: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      data-testid={testid}
      style={{
        border: `1px solid ${C.linea}`, borderRadius: 14,
        background: C.superficie, padding: '6px 11px', fontSize: 11.5, color: C.tintaSuave,
      }}
    >
      {children}
    </Link>
  )
}
