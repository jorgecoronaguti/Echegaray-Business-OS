// LA TABLA DE PAQUETES — una fila por subcontrato de la obra (Design canónico 23/08, pantalla 10).
//
// Proveedor · Trabajo · Estado · Avance · Plazo · Contrato. El alcance dejó de ser columna: es el
// mismo dato que el panel ya publica con su unidad y su partida de origen, y acá sólo servía para
// empujar el avance fuera de la pantalla del que mira seis paquetes.
//
// La columna CONTRATO existe sólo para quien ve economía. No se dibuja en gris ni con un candado:
// no se dibuja. Un lugar vacío donde va la plata invita a preguntar por qué, y la respuesta —«no
// tenés permiso»— no le sirve a nadie en el medio de una tabla. El comparador, en cambio, SÍ dice
// «sin permiso», porque ahí la fila existe y la comparación se entiende sin el número.
//
// EL ESTADO QUE SE MUESTRA ES EL EFECTIVO, no el guardado: un paquete «en curso» sin ART dice «ART
// sin cargar» en rojo. Ver `estadoDelPaquete`.
//
// ═══ EL BLOQUEO SE VE COMO BLOQUEO ═══
//
// El papel que falta no es una palabra más en la columna de estado: lleva el icono de bloqueo del
// sistema al lado. Un jefe que barre la lista de arriba abajo no lee seis estados, ve dónde hay un
// símbolo — y eso es lo que decide a cuál entra primero.

'use client'

import { BarraAvance, Estado, FilaTotal, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import { IconoBloqueo, IconoProveedor } from '@/shared/components/iconos'
import { plata, porcentaje } from './formato'
import { resumenContratado } from '../services/subcontratosReglas'
import type { Paquete } from '../services/subcontratosService'

/** El nombre corto del trabajo: el rubro cuando existe, si no el nombre del paquete. */
const trabajoDe = (p: Paquete) => p.vinculos[0]?.actividad ?? p.rubro ?? p.nombre

export function TablaSubcontratos({
  paquetes, seleccionado, economia, onSeleccionar,
}: {
  paquetes: Paquete[]
  seleccionado: string | null
  economia: boolean
  onSeleccionar: (id: string) => void
}) {
  if (paquetes.length === 0) {
    // Una línea y accionable: quien mira esto ya sabe que no hay nada; lo que no sabe es por dónde
    // se carga. La definición de «paquete» era un párrafo permanente y se leía una sola vez.
    return <Vacio>Ningún paquete subcontratado. Se carga con «Nuevo paquete», acá arriba.</Vacio>
  }
  const { total: contratado, sinPrecio } = resumenContratado(paquetes)

  return (
    <Tabla testid="tabla-subcontratos" minWidth={economia ? 720 : 600}>
      <THead>
        <tr>
          <Th>Proveedor</Th>
          <Th>Trabajo</Th>
          <Th>Estado</Th>
          <Th>Avance</Th>
          <Th num>Plazo</Th>
          {economia && <Th num>Contrato</Th>}
        </tr>
      </THead>
      <tbody>
        {paquetes.map((p) => {
          const bloqueado = p.revision.bloqueos.length > 0
          return (
            <Tr
              key={p.id}
              seleccionada={p.id === seleccionado}
              onClick={() => onSeleccionar(p.id)}
              data-testid={`fila-paquete-${p.id}`}
            >
              <Td fuerte>
                <span className="flex min-w-0 items-center gap-2">
                  <IconoProveedor className="h-[15px] w-[15px] shrink-0 text-faint" />
                  <span className="truncate">{p.proveedor ?? 'sin subcontratista'}</span>
                </span>
              </Td>
              <Td>{trabajoDe(p)}</Td>
              <Td>
                <span className="flex items-center gap-1.5">
                  <Estado tono={p.estadoLegible.tono} clave={p.estadoLegible.clave}>
                    {p.estadoLegible.label}
                  </Estado>
                  {bloqueado && (
                    /* El `title` va en el envoltorio: los iconos del sistema sólo aceptan
                       `className` y son `aria-hidden` — el rótulo lo pone quien los usa. */
                    <span
                      title={`No puede iniciar: ${p.revision.bloqueos.join(' · ')}`}
                      aria-label={`No puede iniciar: ${p.revision.bloqueos.join(' · ')}`}
                      className="flex shrink-0 text-neg"
                    >
                      <IconoBloqueo className="h-[14px] w-[14px]" />
                    </span>
                  )}
                </span>
              </Td>
              <Td>
                {/* NULL NO ES CERO: sin medición no hay barra, hay el motivo. Una pista vacía al
                    lado de un 0 % afirma una fracción que nadie calculó. */}
                {p.avance.pct == null
                  ? <span className="text-[12px] text-faint">{p.avance.base}</span>
                  : (
                    <span className="flex items-center gap-2">
                      <BarraAvance pct={p.avance.pct} alto={4} />
                      <span className="w-[38px] shrink-0 text-right font-mono text-[11.5px] tabular-nums text-ink-soft">
                        {porcentaje(p.avance.pct)}
                      </span>
                    </span>
                  )}
              </Td>
              <Td num className="whitespace-nowrap">{p.plazo.texto}</Td>
              {economia && (
                <Td num>{p.precio_contratado == null
                  ? <span className="text-faint">sin precio</span>
                  : plata(p.precio_contratado)}</Td>
              )}
            </Tr>
          )
        })}
        {economia && (
          /* EL TOTAL SÓLO SUMA LO QUE TIENE PRECIO, y dice cuántos quedaron afuera. Sumar en
             silencio los que valen `null` como si valieran cero publica un contratado más chico
             que el real, y nada en la pantalla avisaría. */
          <FilaTotal>
            <Td colSpan={4}>Contratado</Td>
            <Td num className="whitespace-nowrap text-[11.5px] font-normal text-faint">
              {sinPrecio > 0 ? `${sinPrecio} sin precio` : ''}
            </Td>
            <Td num fuerte>{plata(contratado)}</Td>
          </FilaTotal>
        )}
      </tbody>
    </Tabla>
  )
}
