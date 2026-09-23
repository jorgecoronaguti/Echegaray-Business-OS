'use client'

// LA TABLA DE SESIONES — una fila por sesión abierta, «Cerrar» en cada una que no sea ésta.
// Cerrar es un clic sin diálogo: la consecuencia es que ese dispositivo tenga que volver a entrar,
// y el resultado se ve en la misma tabla (la fila desaparece al refrescar).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Boton, Estado, Nulo, Num, Tabla, THead, Th, Tr, Td } from '@/shared/components/ds'
import { cerrarOtrasSesiones, cerrarSesion } from '../services/sesionesActions'

export interface SesionVista {
  id: string
  esActual: boolean
  equipo: string | null
  ip: string | null
  ultimaActividad: string | null
  creada: string | null
  dosPasos: boolean
}

export function SesionesLista({ sesiones }: { sesiones: SesionVista[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const otras = sesiones.filter((s) => !s.esActual).length

  const correr = (fn: () => Promise<{ ok: boolean; error?: string; cerradas?: number }>, ok: (n: number) => string) => empezar(async () => {
    setError(null); setAviso(null)
    const r = await fn()
    if (!r.ok) setError(r.error ?? 'No se pudo.')
    else { setAviso(ok(r.cerradas ?? 0)); router.refresh() }
  })

  return (
    <div>
      <Tabla testid="tabla-sesiones" minWidth={640}>
        <THead>
          <Th>Dispositivo</Th>
          <Th className="w-[130px]">IP</Th>
          <Th num className="w-[130px]">Última actividad</Th>
          <Th num className="w-[130px]">Abierta el</Th>
          <Th className="w-[110px]">Estado</Th>
          <Th className="w-[80px]"> </Th>
        </THead>
        <tbody>
          {sesiones.map((s) => (
            <Tr key={s.id}>
              <Td fuerte>
                {s.equipo ?? <Nulo>navegador sin identificar</Nulo>}
                {s.dosPasos && <span className="ml-2 text-[11px] font-normal text-faint">con dos pasos</span>}
              </Td>
              {/* NO SE GEOLOCALIZA: la IP es un dato; una ciudad deducida de ella es una adivinanza. */}
              <Td>{s.ip ? <Num>{s.ip}</Num> : <Nulo>sin registro</Nulo>}</Td>
              <Td num>{s.ultimaActividad ? <Num>{s.ultimaActividad}</Num> : <Nulo>sin registro</Nulo>}</Td>
              <Td num>{s.creada ? <Num>{s.creada}</Num> : <Nulo>sin registro</Nulo>}</Td>
              <Td>{s.esActual ? <Estado tono="pos" clave="actual">Esta sesión</Estado> : <Estado tono="nulo" clave="otra">Abierta</Estado>}</Td>
              <Td>
                {!s.esActual && (
                  <Boton
                    variante="discreta"
                    disabled={pendiente}
                    data-testid={`cerrar-sesion-${s.id}`}
                    onClick={() => correr(() => cerrarSesion(s.id), () => 'Sesión cerrada.')}
                  >
                    Cerrar
                  </Boton>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Tabla>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {otras > 0 && (
          <Boton
            variante="secundaria"
            disabled={pendiente}
            data-testid="cerrar-otras"
            onClick={() => correr(cerrarOtrasSesiones, (n) => `${n} ${n === 1 ? 'sesión cerrada' : 'sesiones cerradas'}. Ésta sigue abierta.`)}
          >
            Cerrar todas las demás ({otras})
          </Boton>
        )}
        {aviso && <span className="text-[12px] text-pos" data-testid="sesiones-aviso">{aviso}</span>}
        {error && <span role="alert" className="text-[12px] text-neg" data-testid="sesiones-error">{error}</span>}
      </div>
    </div>
  )
}
