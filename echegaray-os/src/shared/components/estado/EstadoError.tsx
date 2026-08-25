'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Boton, BotonEnlace } from '@/shared/components/ds'
import { diagnosticar, type ErrorDeRuta } from './diagnostico'
import { leerSelloDatoBueno, textoDatoBueno } from './frescura'
import { ubicarPantalla } from './ubicacion'

// LA PANTALLA QUE SE CAYÓ — `design/screens/gestion-obras-v5.md` §13, literal:
// *«Loading / vacío / error visualmente distintos. El error nunca se parece a un vacío: regla roja,
// qué falló, Reintentar, hora del último dato bueno.»*
//
// LAS CUATRO COSAS ESTÁN, Y NINGUNA ES DECORATIVA:
//
//   · REGLA ROJA a la izquierda. Es lo que hace que se distinga de un vacío A UN METRO de la
//     pantalla, sin leer. Un vacío del sistema es texto `muted` sin borde; esto es una barra `neg`
//     de 2px. Nunca se pintó el fondo entero de rojo: en un teléfono al sol eso tapa el texto, que
//     es justamente lo único que sirve.
//   · QUÉ FALLÓ, con el mensaje real de la fuente debajo. El diagnóstico traduce; no reemplaza.
//   · REINTENTAR es el `reset()` de Next, que vuelve a montar el segmento sin recargar la app. Es la
//     primaria de esta pantalla —la única acción que puede resolverla— y cuando el diagnóstico dice
//     que reintentar no sirve (permisos, sesión vencida) el botón SIGUE estando, pero la primaria
//     pasa a ser el paso que sí sirve. Un botón que se sabe inútil no se disfraza de solución.
//   · HORA DEL ÚLTIMO DATO BUENO, para saber si lo que ya se vio todavía vale.
//
// UN ERROR NO SE DIBUJA COMO UN VACÍO, y tampoco al revés: acá no hay «no hay datos», no hay
// esqueleto y no hay barra de carga. Son tres estados y se ven distinto.

// El sello no cambia mientras el error está en pantalla: no hay a qué suscribirse, y una función
// declarada fuera del componente mantiene la misma referencia entre renders.
const sinCambios = () => () => {}

export function EstadoError({
  error,
  mensaje,
  reset,
  que,
  testid = 'estado-error',
}: {
  /** El error tal cual lo entrega Next a un `error.tsx`. */
  error?: ErrorDeRuta | null
  /** El mensaje de la fuente, cuando quien dibuja ya lo tiene como texto (páginas de servidor). */
  mensaje?: string | null
  /** El `reset()` de Next. Sin él, Reintentar vuelve a pedir la ruta al servidor. */
  reset?: () => void
  /** Cómo se nombra la pantalla. Por defecto sale del pathname. */
  que?: string
  testid?: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const ubicacion = ubicarPantalla(pathname)
  const d = diagnosticar(error ?? (mensaje ? { message: mensaje } : null))

  // EL SELLO SE LEE CON `useSyncExternalStore` y no con un efecto que escribe estado: `sessionStorage`
  // es una fuente externa al render, y en el servidor no existe. La instantánea del servidor es
  // `null` —«sin lectura previa»—, y React vuelve a preguntar del lado del cliente sin que el HTML
  // de las dos partes tenga que coincidir.
  const sello = useSyncExternalStore(
    sinCambios,
    () => leerSelloDatoBueno(pathname ?? ''),
    () => null,
  )
  const frescura = textoDatoBueno(sello, new Date())

  // El error ya ocurrió: dejarlo en la consola es lo único que permite reconstruirlo desde el
  // navegador de quien lo sufrió, porque el mensaje de un Server Component no viaja al cliente.
  // EL TEXTO CRUDO VA A LA CONSOLA SIEMPRE —también cuando llega como `mensaje` desde una página de
  // servidor—; en pantalla sólo se dibuja cuando el diagnóstico no lo supo explicar. Un «canceling
  // statement due to statement timeout» al lado de «la consulta tardó más de lo que la base
  // permite» no informa: asusta (auditoría 24/08/2026).
  useEffect(() => {
    if (error || mensaje) console.error('[pantalla caída]', pathname, d.clave, error ?? mensaje)
  }, [error, mensaje, pathname, d.clave])
  const detalleEnPantalla = d.clave === 'desconocido' ? d.detalle : null

  const reintentar = () => (reset ? reset() : router.refresh())

  return (
    <div className="min-h-screen bg-canvas" data-testid={testid} data-clave={d.clave} role="alert">
      <div className="w-full px-4 py-6 lg:px-10">
        <div className="max-w-[680px] border-l-2 border-neg pl-4">
          <div className="text-[11px] font-medium tracking-[0.04em] text-neg">ERROR</div>
          <h1 className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">
            No se pudo cargar {que ?? ubicacion.que}
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-neg" data-testid="error-causa">
            {d.causa}
          </p>

          {detalleEnPantalla && (
            <p
              className="mt-3 overflow-x-auto rounded-card bg-surface-sunken px-3 py-2.5 font-mono text-[12px] leading-relaxed text-muted"
              data-testid="error-detalle"
            >
              {detalleEnPantalla}
            </p>
          )}
          {d.queHacer && <p className="mt-3 text-[12.5px] leading-relaxed text-muted">{d.queHacer}</p>}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Boton
              variante={d.sirveReintentar ? 'primaria' : 'secundaria'}
              onClick={reintentar}
              data-testid="reintentar"
            >
              Reintentar
            </Boton>
            {ubicacion.volver && (
              <BotonEnlace
                href={ubicacion.volver.href}
                variante={d.sirveReintentar ? 'secundaria' : 'primaria'}
                data-testid="error-volver"
              >
                {ubicacion.volver.texto}
              </BotonEnlace>
            )}
          </div>

          <p className="mt-4 text-[11.5px] text-faint" data-testid="ultimo-dato-bueno">
            Último dato bueno: {frescura.texto}
            {d.digest && detalleEnPantalla && <> · código {d.digest}</>}
          </p>
        </div>
      </div>
    </div>
  )
}
