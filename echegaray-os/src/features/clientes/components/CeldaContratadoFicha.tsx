// LA CELDA «CONTRATADO» DE LA LISTA DE TRABAJOS DE LA FICHA.
//
// Vivía dentro de `ListasClienteV2.tsx`. Salió cuando la obra mayor empezó a declarar el consolidado
// de sus adicionales: ese archivo estaba en 499 líneas y el repo no agrega al montón de los que
// pasan las 500. Lo que quedó allá es la rama SIN PERMISO, que es la que el canónico 26 vigila.
//
// ═══ EL CONSOLIDADO NO REEMPLAZA AL NÚMERO DE LA FILA ═══
//
// Mismo criterio que en la cartera (`CeldasDeContrato.tsx`): arriba lo PROPIO —porque la columna
// tiene que seguir sumando el contratado del cliente, que es la cifra que publica `cliente_economia`
// y la pestaña OBRAS— y debajo, en una línea corta, el consolidado con su desglose. Poner los
// $112,5 M del Playón de Azufre arriba haría que el adicional se cuente dos veces al leer la columna.

import { plata } from '@/features/obras/components/formato'
import { V } from '@/shared/components/v2/patron'
import { millones } from '@/shared/components/canon/formato'
import { SIN_PRECIO_EN_OBRAS } from '../services/economiaObras'
import type { Consolidado } from '../services/obrasAdicionales'

/** «+ $ 10,0 M · 1 adicional = $ 112,5 M», o qué falta para poder decirlo. */
export function frase(c: Consolidado): string | null {
  if (!c.n) return null
  const cuantos = `${c.n} adicional${c.n > 1 ? 'es' : ''}`
  if (c.total === null || c.adicionales === null) return `+ ${cuantos} sin precio`
  return `+ ${millones(c.adicionales)} · ${cuantos} = ${millones(c.total)}`
}

export function ContratadoDeLaFicha({ contratado, cerrada, consolidado }: {
  contratado: number | null
  /** Una obra terminada sin precio no bloquea nada: dice «—» y se calla. */
  cerrada: boolean
  consolidado: Consolidado
}) {
  const linea = frase(consolidado)
  return (
    <span
      className="grid justify-items-end"
      data-testid="contratado-obra-cliente"
      data-adicionales={consolidado.n || undefined}
      title={consolidado.n
        ? `Este trabajo tiene ${consolidado.n} adicional(es) con su propia OC. Arriba va SÓLO lo suyo —para que la columna siga sumando el contratado del cliente— y debajo el consolidado.`
        : undefined}
    >
      <span
        className={`truncate ${contratado == null ? '' : 'font-mono tabular-nums'}`}
        style={{
          fontSize: contratado == null && !cerrada ? '11.5px' : '12px', textAlign: 'right',
          color: contratado == null ? (cerrada ? V.tenue : V.warn) : V.tinta,
        }}
      >
        {contratado == null ? (cerrada ? '—' : SIN_PRECIO_EN_OBRAS) : plata(contratado)}
      </span>
      {linea && (
        <span
          data-testid="consolidado-obra-cliente"
          className="truncate font-mono tabular-nums"
          style={{ fontSize: '10.5px', color: V.tenue, textAlign: 'right' }}
        >
          {linea}
        </span>
      )}
    </span>
  )
}
