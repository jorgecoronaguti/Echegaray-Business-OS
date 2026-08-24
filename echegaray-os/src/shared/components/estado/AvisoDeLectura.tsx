'use client'

// UNA LECTURA QUE FALLÓ, DICHA EN LENGUAJE DE PRODUCTO — el cartel de una solapa, no la pantalla caída.
//
// El 24/08/2026 la solapa Operación de quattropani mostraba «canceling statement due to statement
// timeout» tal cual lo devolvió Postgres. Quien lee eso no sabe qué pasó ni qué hacer. Acá el
// mensaje de la base pasa por el MISMO diagnóstico que usa `EstadoError` (permiso, sesión, red,
// demora, esquema), se ofrece Reintentar cuando reintentar sirve, y el texto crudo va a la consola:
// es para quien depura, no para quien opera.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Aviso, Boton } from '@/shared/components/ds'
import { diagnosticar } from './diagnostico'

export function AvisoDeLectura({
  mensaje,
  que,
  testid = 'aviso-lectura',
}: {
  /** Lo que devolvió la fuente. El texto crudo NO se dibuja: se diagnostica y se loguea. */
  mensaje: string
  /** Qué no se pudo leer, en palabras de la pantalla: «la operación de la obra». */
  que: string
  testid?: string
}) {
  const router = useRouter()
  const d = diagnosticar({ message: mensaje })

  useEffect(() => {
    console.error('[lectura fallida]', que, d.clave, mensaje)
  }, [que, d.clave, mensaje])

  return (
    <Aviso
      tono="neg"
      titulo={`No se pudo leer ${que}`}
      testid={testid}
      accion={
        d.sirveReintentar ? (
          <Boton variante="secundaria" onClick={() => router.refresh()} data-testid={`${testid}-reintentar`}>
            Reintentar
          </Boton>
        ) : undefined
      }
    >
      <span data-clave={d.clave}>
        {d.causa}
        {d.queHacer && <> {d.queHacer}</>}
        {' '}Lo que falta abajo no significa que no exista.
      </span>
    </Aviso>
  )
}
