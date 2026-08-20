import { Estado, Eyebrow, Nulo, Plegable, Tabla, THead, Th, Tr, Td, Vacio, type TonoEstado } from '@/shared/components/ds'
import { ESTADO_LABEL, GUIA_CONEXION, ordenar, type Integracion } from '../types'
import { fechaCorta } from '@/shared/utils/fecha'

// DE DÓNDE SALE LO QUE MUESTRAN LAS OTRAS TRES VISTAS.
//
// Pedidos, Herramientas y Movimientos son el espejo en Postgres de sistemas que viven afuera. Esta
// vista dice si ese espejo está vivo, cuándo se actualizó por última vez y —cuando no lo está— qué
// paso concreto falta y quién tiene que darlo. Es la contracara de la regla de error: una lista
// vacía nunca se dibuja como «no hay datos», y acá se ve POR QUÉ podría estar vacía.
//
// El estado y la salud salen de `public.integraciones`, que escribe el orquestador. La guía de
// conexión vive en código (`GUIA_CONEXION`): es conocimiento operativo estable y versionado.

const TONO_ESTADO: Record<Integracion['estado'], TonoEstado> = {
  vivo: 'pos',
  en_curso: 'curso',
  planeado: 'pendiente',
  bloqueado: 'neg',
}

const SALUD: Record<Integracion['salud'], { tono: TonoEstado; label: string }> = {
  ok: { tono: 'pos', label: 'sana' },
  degradada: { tono: 'warn', label: 'degradada' },
  sin_datos: { tono: 'nulo', label: 'sin datos' },
  desconocida: { tono: 'nulo', label: 'sin medir' },
}

const QUIEN: Record<string, string> = {
  dueño: 'Lo tiene que hacer el dueño',
  os: 'Lo puede avanzar el OS',
  automatico: 'Automático',
}

export function FuentesLista({ integraciones }: { integraciones: Integracion[] }) {
  const lista = ordenar(integraciones)
  const pendientes = lista.filter((i) => i.estado !== 'vivo' && GUIA_CONEXION[i.slug])

  if (lista.length === 0) {
    return <Vacio>No hay ninguna fuente registrada. Las registra el orquestador en `public.integraciones`.</Vacio>
  }

  return (
    <div className="space-y-6">
      <Tabla testid="tabla-fuentes" minWidth={760}>
        <THead>
          <Th>Fuente</Th>
          <Th>Qué trae</Th>
          <Th className="w-[140px]">Estado</Th>
          <Th className="w-[120px]">Salud</Th>
          <Th className="w-[120px]">Último sync</Th>
        </THead>
        <tbody>
          {lista.map((i) => {
            const salud = SALUD[i.salud] ?? SALUD.desconocida
            return (
              <Tr key={i.slug} data-testid={`integracion-${i.slug}`}>
                <Td fuerte>{i.nombre}</Td>
                <Td>{i.dato ?? <Nulo>sin declarar</Nulo>}</Td>
                <Td>
                  <Estado tono={TONO_ESTADO[i.estado]} clave={i.estado}>
                    {ESTADO_LABEL[i.estado]}
                  </Estado>
                </Td>
                <Td>
                  <Estado tono={salud.tono} clave={i.salud}>
                    {salud.label}
                  </Estado>
                </Td>
                <Td num>{i.ultimo_sync ? fechaCorta(i.ultimo_sync) : <Nulo>nunca</Nulo>}</Td>
              </Tr>
            )
          })}
        </tbody>
      </Tabla>

      {pendientes.length > 0 && (
        <section className="space-y-1">
          <Eyebrow>Qué falta para conectarlas</Eyebrow>
          {pendientes.map((i) => {
            const g = GUIA_CONEXION[i.slug]
            return (
              <Plegable
                key={i.slug}
                testid={`guia-${i.slug}`}
                titulo={i.nombre}
                alerta={i.estado === 'bloqueado' ? 'bloqueada' : undefined}
              >
                <div className="space-y-2 pb-3 text-[12.5px] text-ink-soft">
                  <p>{g.como}</p>
                  {g.accion && <p className="font-medium text-ink">→ {g.accion}</p>}
                  {g.pasos.length > 0 && (
                    <ol className="list-decimal space-y-1 pl-5 text-muted">
                      {g.pasos.map((p, k) => (
                        <li key={k}>{p}</li>
                      ))}
                    </ol>
                  )}
                  <p className="text-[11px] tracking-[0.04em] text-faint">{QUIEN[g.quien]}</p>
                </div>
              </Plegable>
            )
          })}
        </section>
      )}
    </div>
  )
}
