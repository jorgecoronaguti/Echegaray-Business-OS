// LA COLA DE NOMBRES QUE TODAVÍA NO SON NADIE — `22 · Proveedores v2.dc.html`, líneas 208-232.
//
// `Compras!E` del Sheet es texto libre y su espejo en Postgres (`costos_obra.proveedor`) tenía 875
// comprobantes con 115 grafías distintas: 33 coinciden EXACTAMENTE con un proveedor del maestro y
// las otras 82 no son nadie (medido el 25/08/2026 contra la base). Cada una de esas 82 es un gasto
// que queda fuera de la cuenta de su proveedor.
//
// Ordenada por cantidad de comprobantes —así la publica la vista— porque la lista es una COLA DE
// TRABAJO: resolver el nombre que aparece 58 veces mueve mucho más costo de obra que el que aparece
// una sola. Y arriba de la lista hay cosas que NO son proveedores —SUELDOS, ARCA, SINDICATOS,
// BANCO—, que es exactamente por lo que no puede existir un botón de «vincular todo lo parecido»:
// un emparejador por similitud las habría colgado del proveedor de nombre más cercano.

import Link from 'next/link'
import { pesos } from '@/shared/components/canon/formato'
import { BotonAccion, type ResultadoAccion } from '@/shared/components/ui'
import { ALTO_V2, ENCABEZADO, FILO_ELEGIDA, RotuloCol, RotuloPanel, V } from './proveedores/patron'
import type { NombrePendiente, NombreResuelto } from '../types'

/** `22v2:449-451`. En angosto se suelta COMPROB., nunca el texto que hay que resolver. */
const COLS
  = 'grid-cols-[minmax(220px,1.6fr)_minmax(0,90px)_minmax(0,140px)_minmax(0,110px)]'
  + ' max-[1249px]:grid-cols-[minmax(200px,1.6fr)_minmax(0,1fr)_minmax(0,104px)]'
const SOLO_ANCHO = 'max-[1249px]:hidden'

export function TablaNombres({ pendientes, seleccionado, hrefDe }: {
  pendientes: NombrePendiente[]
  seleccionado?: string
  hrefDe: (nombreNorm: string) => string
}) {
  if (pendientes.length === 0) {
    return (
      <p data-testid="cola-vacia" style={{ padding: '24px 2px', fontSize: '12.5px', color: V.apagado }}>
        Todos los nombres de Compras tienen proveedor. No hay nada que resolver.
      </p>
    )
  }

  return (
    <div data-testid="cola-nombres">
      <div className={`grid gap-[14px] ${COLS}`} style={ENCABEZADO}>
        <RotuloCol>Texto de Compras</RotuloCol>
        <span className={`grid ${SOLO_ANCHO}`}><RotuloCol derecha>Comprob.</RotuloCol></span>
        <RotuloCol derecha>Total</RotuloCol>
        <span style={{ paddingBottom: 6 }} />
      </div>

      {pendientes.map((n) => {
        const elegido = n.nombre_norm === seleccionado
        return (
          <div
            key={n.nombre_norm}
            role="row"
            data-testid="nombre-pendiente"
            data-seleccionada={elegido ? '' : undefined}
            className={`relative grid items-center gap-[14px] ${COLS} ${elegido ? '' : 'hover:bg-[#F2F1ED]'}`}
            style={{
              height: ALTO_V2.fila,
              borderBottom: `1px solid ${V.lineaFila}`,
              background: elegido ? V.seleccion : undefined,
              boxShadow: elegido ? FILO_ELEGIDA : undefined,
            }}
          >
            <Link
              href={hrefDe(n.nombre_norm)}
              data-testid="abrir-nombre"
              className="min-w-0 truncate font-mono after:absolute after:inset-0 after:content-['']"
              style={{ fontSize: '12.5px', color: V.tinta }}
            >
              {n.nombre_origen}
            </Link>
            <span className={`font-mono tabular-nums ${SOLO_ANCHO}`} style={{ fontSize: '12px', textAlign: 'right', color: V.apagado }}>
              {n.comprobantes}
            </span>
            <span className="font-mono tabular-nums" style={{ fontSize: '12px', textAlign: 'right', color: V.tinta }}>
              {/* Un nombre sin importe NO es $ 0: la suma de la vista puede venir en cero porque los
                  comprobantes no traen total, y eso no significa que no costaran nada. */}
              {Number(n.total ?? 0) > 0 ? pesos(n.total) : 'sin importe'}
            </span>
            <span style={{ fontSize: '12.5px', fontWeight: 500, color: V.tinta, textAlign: 'right', paddingRight: 2 }}>
              Vincular →
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * LO YA RESUELTO A MANO, CON SU DESHACER.
 *
 * No está en el mockup y se conserva a propósito: un vínculo equivocado que no se puede sacar es
 * peor que el pendiente, porque el costo queda imputado a un proveedor que nunca facturó eso y
 * nadie vuelve a mirarlo. Sacarlo por fidelidad habría borrado la única marcha atrás de la única
 * pantalla que escribe imputaciones. Va en la gramática del v2 —filos, sin caja— para que no se lea
 * como un pedazo de otra pantalla.
 */
export function NombresResueltos({ resueltos, deshacer }: {
  resueltos: NombreResuelto[]
  deshacer: (aliasId: string) => Promise<ResultadoAccion>
}) {
  const manuales = resueltos.filter((r) => r.alias_id)
  if (manuales.length === 0) return null

  return (
    <section style={{ marginTop: 28 }}>
      <RotuloPanel cuenta={manuales.length}>Resueltos a mano</RotuloPanel>
      <div data-testid="cola-resueltos">
        {manuales.map((r) => (
          <div
            key={r.nombre_norm}
            data-testid="nombre-resuelto"
            style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '8px 0', borderBottom: `1px solid ${V.lineaPanel}` }}
          >
            <span className="min-w-0 flex-1 truncate font-mono" style={{ fontSize: '12px', color: V.tinta }}>{r.nombre_norm}</span>
            <span style={{ fontSize: '12px', color: r.estado === 'no_es_proveedor' ? V.tenue : V.tintaSuave }}>
              {r.estado === 'no_es_proveedor' ? 'no es un proveedor' : (r.proveedor_nombre ?? 'sin proveedor')}
            </span>
            <span className="font-mono tabular-nums" style={{ fontSize: '11.5px', color: V.tenue }}>{r.comprobantes}</span>
            {r.alias_id && (
              <BotonAccion accion={deshacer} args={[r.alias_id]} testid="deshacer-resolucion">Deshacer</BotonAccion>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
