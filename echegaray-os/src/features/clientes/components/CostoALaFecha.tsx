// EL COSTO A LA FECHA EN LA TABLA DE TRABAJOS: el rótulo que lo dice y la fila de lo que no tiene obra.
//
// ═══ POR QUÉ (dueño, 13/09/2026) ═══
//
// «Quiero que las columnas de Materiales y Mano de obra muestren los costos hasta el momento […] no
// lo presupuestado». Dos piezas que `ListasClienteV2.tsx` —ya en el tope de líneas— no puede cargar:
//
//   ROTULO     «MATERIALES» arriba y «a la fecha» debajo. En una línea no entra: a 11px en mayúsculas
//              «MATERIALES A LA FECHA» mide ~170px y la pista 112px, y un rótulo con puntos
//              suspensivos se lee como otra columna. Dos líneas entran en los 30px del encabezado.
//   SIN OBRA   lo que Compras le imputa al cliente sin nombrar una de sus obras (columna K). Va en
//              UNA fila al pie, con su importe en la columna de materiales y los detalles más grandes
//              en el `title`. NUNCA repartido entre las obras: repartir sería inventar a qué obra fue.

import { V } from '@/shared/components/v2/patron'
import { plata } from '@/features/obras/components/formato'
import { ROTULO_SIN_OBRA, importeSinObra, tituloSinObra, type GastoSinObra, tituloSubcontratosSinObra } from '../services/costosDeObra'

/** La segunda línea del rótulo de una columna de costo, debajo de su `RotuloCol`. */
export function ALaFecha() {
  return (
    <span style={{ fontSize: '10px', lineHeight: '11px', color: V.tenue, textAlign: 'right', whiteSpace: 'nowrap' }}>
      a la fecha
    </span>
  )
}

/** «MATERIALES / a la fecha»: el nombre de la columna y, debajo, el corte que lo define. */
export function RotuloACorte({ texto, titulo }: { texto: string; titulo: string }) {
  return (
    <span className="grid justify-items-end" title={titulo} style={{ lineHeight: '12px', minWidth: 0 }}>
      <span style={{
        fontSize: '11px', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
        color: V.tenue, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
      }}>
        {texto}
      </span>
      <span style={{ fontSize: '10px', color: V.tenue, whiteSpace: 'nowrap' }}>a la fecha</span>
    </span>
  )
}

/**
 * LA FILA «GASTOS DEL CLIENTE SIN OBRA ASIGNADA». Usa la MISMA grilla que la tabla (`columnas`) para
 * que el importe caiga debajo de la columna de materiales.
 *
 * Callada cuando no hay nada que decir: sin gastos sin obra no se dibuja una fila de «—». Y cuando no
 * se pudo leer (`legible: false`) tampoco: la tabla de arriba ya calla sus celdas en ese caso.
 */
export function FilaGastosSinObra({ gasto, columnas, sangria, visible }: {
  gasto: GastoSinObra | null
  columnas: string
  sangria: number
  /** Quien no ve economía no ve costo: la misma puerta que las celdas de la tabla. */
  visible: boolean
}) {
  const importe = importeSinObra(gasto)
  if (!visible || importe == null) return null
  return (
    <div
      data-testid="fila-sin-obra-cliente"
      className={`grid items-center ${columnas}`}
      title={tituloSinObra(gasto) ?? undefined}
      style={{ minHeight: 40, paddingLeft: sangria, borderBottom: `1px solid ${V.lineaFila}` }}
    >
      <span className="truncate" style={{ fontSize: '12.5px', color: V.apagado }}>{ROTULO_SIN_OBRA}</span>
      {/* INICIO (se suelta al angostar, igual que en la tabla) y HH: esta fila no tiene ninguna. */}
      <span className="max-[1199px]:hidden" />
      <span />
      <span
        data-testid="materiales-sin-obra-cliente"
        className="truncate font-mono tabular-nums"
        style={{ fontSize: '12px', color: V.tintaSuave, textAlign: 'right' }}
      >
        {plata(gasto?.materiales ?? null)}
      </span>
      {/* LOS SUBCONTRATOS SIN OBRA, EN SU COLUMNA (20260915T0810): no se suman en Materiales. */}
      <span
        data-testid="subcontratos-sin-obra-cliente"
        className="truncate font-mono tabular-nums"
        title={tituloSubcontratosSinObra(gasto) ?? undefined}
        style={{ fontSize: '12px', color: V.tintaSuave, textAlign: 'right' }}
      >
        {plata(gasto?.subcontratos ?? null)}
      </span>
      {/* MANO DE OBRA y CONTRATADO: las horas siempre tienen obra, y lo sin obra no tiene precio. */}
      <span />
      <span aria-hidden />
    </div>
  )
}
