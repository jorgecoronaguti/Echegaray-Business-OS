// EL RÓTULO «ADICIONAL» — la marca de la fila hija, una sola vez para las dos tablas.
//
// La cartera de `/clientes` y la ficha del cliente dibujan la misma jerarquía. Con el rótulo escrito
// en cada una, la palabra y el tono se separan en el primer retoque y el mismo hecho se dice de dos
// formas en dos pantallas del mismo módulo.
//
// ═══ POR QUÉ NO ES UNA PÍLDORA DE COLOR ═══
//
// El amarillo de la marca da 1,6:1 sobre blanco y el ámbar significa PROBLEMA en todo el OS. Que un
// trabajo sea un adicional no es un problema ni un estado: es su lugar en el árbol, y el lugar ya lo
// dice la sangría. El rótulo sólo lo nombra, en el tono de los metadatos y sin fondo — como los
// rótulos de columna, que es exactamente la misma jerarquía de lectura.
//
// ═══ EL HUÉRFANO NO VA EN ÁMBAR ═══
//
// Un adicional cuya obra mayor no está a la vista (`bsa-adicional` está cerrada y su madre activa)
// tiene un hueco real, pero dibujarlo en ámbar sería una alarma que nadie puede apagar sobre un
// trabajo terminado — el mismo error que ya se corrigió con «sin precio en OBRAS» en el grupo de
// cerradas. Lo dice el `title`, que es donde vive la trazabilidad bajo demanda.

import { V } from '@/shared/components/v2/patron'
import { ROTULO_ADICIONAL, SIN_OBRA_MAYOR } from '../services/obrasAdicionales'

const AYUDA = 'Este trabajo es un ADICIONAL de la obra de arriba: tiene su propia orden de compra y '
  + 'su propio precio, y se factura aparte. La relación y su evidencia están en '
  + 'docs/engineering/OBRAS-ADICIONALES-2026-09-11.md.'

export function MarcaAdicional({ huerfano = false }: { huerfano?: boolean }) {
  return (
    <span
      data-testid="marca-adicional"
      data-huerfano={huerfano ? '' : undefined}
      title={huerfano
        ? `${AYUDA} Su obra mayor NO está en esta lista (suele estar en el otro grupo, terminados o en curso).`
        : AYUDA}
      style={{
        fontSize: '10.5px', letterSpacing: '0.06em', textTransform: 'uppercase',
        color: V.tenue, flexShrink: 0, whiteSpace: 'nowrap',
      }}
    >
      {huerfano ? SIN_OBRA_MAYOR : ROTULO_ADICIONAL}
    </span>
  )
}
