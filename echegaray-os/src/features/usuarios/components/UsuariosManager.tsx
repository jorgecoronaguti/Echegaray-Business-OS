'use client'

// LA LISTA DE CUENTAS — cinco columnas y un panel. Nada más.
//
// CUENTA · NIVEL · OBRAS CON ACCESO · ÚLTIMO INGRESO · ESTADO. No hay tarjetas por persona, no hay
// contadores arriba y no hay gráficos: son diez filas, la pregunta es «quién ve qué» y se contesta
// leyendo la fila, no interpretando un tablero.
//
// ═══ LA CUENTA ES EL CORREO, NO EL NOMBRE ═══
//
// El correo es con lo que se entra al sistema y es lo único único: dos personas pueden llamarse
// igual y el nombre del perfil puede faltar. Por eso va arriba, y el nombre debajo. Cuando el perfil
// no tiene nombre se escribe —«sin persona vinculada»—, porque una cuenta que puede entrar y no se
// sabe de quién es, es exactamente lo que esta pantalla existe para que no pase.
//
// El buscador y el filtro no consultan al servidor: la lista entera son todas las cuentas de la
// empresa y viaja completa. Filtrar en el cliente es instantáneo y no agrega un estado que se pueda
// desincronizar con lo que se ve.

import { useMemo, useState } from 'react'
import { Boton, Estado, Filtros, IconoBuscar, Nulo, Num, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import { ROL_LABEL, type Rol } from '@/features/auth/types'
import { ultimoIngresoDicho, veTodasLasObras } from '../services/reglas'
import { AltaUsuario } from './AltaUsuario'
import { PanelUsuario } from './PanelUsuario'
import type { ObraElegible, PersonaVinculable, UsuarioGestion } from '../types'

type Filtro = 'todos' | 'administracion' | 'obras' | 'sin_acceso'

const FILTROS: readonly { value: Filtro; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'administracion', label: 'Administración' },
  { value: 'obras', label: 'Obras' },
  { value: 'sin_acceso', label: 'Sin acceso' },
]

const normal = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function coincide(u: UsuarioGestion, texto: string, filtro: Filtro): boolean {
  const t = normal(texto.trim())
  const enTexto = t === '' || normal(`${u.nombre ?? ''} ${u.email ?? ''}`).includes(t)
  const enFiltro =
    filtro === 'todos' ? true
      : filtro === 'sin_acceso' ? u.estado === 'sin_acceso'
        // Una cuenta sin acceso no cuenta como parte de su área: no ve nada, esté donde esté.
        : u.area === filtro && u.estado === 'activo'
  return enTexto && enFiltro
}

/** Las obras a las que entra. Quien entra a TODAS no las enumera: la lista mentiría por omisión el
 *  día que se agregue una obra nueva. Y quién entra a todas se pregunta con el mismo criterio que
 *  usa `ve_obra()` en la base, no con el área de navegación — ver `veTodasLasObras`. */
function CeldaObras({ u }: { u: UsuarioGestion }) {
  if (veTodasLasObras(u.rol)) return <span className="text-[12px] text-muted">todas las obras</span>
  if (u.obras.length === 0) return <Nulo>sin obras asignadas</Nulo>
  return (
    <span className="flex flex-wrap gap-x-1.5 gap-y-0.5">
      {u.obras.map((o) => (
        <span key={o.asignacionId} className="text-[11.5px] text-ink-soft">{o.obraNombre}</span>
      ))}
    </span>
  )
}

export function UsuariosManager({
  usuarios, obras, personas, actorId, rolActor,
}: {
  usuarios: UsuarioGestion[]
  obras: ObraElegible[]
  /** El plantel para vincular una cuenta con su persona. Es lo que llena «Mi cuenta». */
  personas: PersonaVinculable[]
  /** Quién está mirando. Viene del servidor: es lo que apaga los controles sobre la propia cuenta. */
  actorId: string
  /** Con qué rol mira. Viene del servidor por el mismo motivo: sólo Dirección regenera claves. */
  rolActor: Rol | null
}) {
  const [texto, setTexto] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [elegido, setElegido] = useState<string | null>(null)
  const [alta, setAlta] = useState(false)

  const visibles = useMemo(() => usuarios.filter((u) => coincide(u, texto, filtro)), [usuarios, texto, filtro])
  // La cuenta elegida se busca en la lista COMPLETA y en cada render: después de guardar, el
  // servidor manda las filas nuevas y el panel tiene que mostrar lo guardado, no lo que había
  // cuando se abrió.
  const usuario = usuarios.find((u) => u.id === elegido) ?? null

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      {/* Con el panel cerrado la tabla se acota: cinco columnas estiradas a 1536 dejan la cuenta y
          su estado en dos extremos que el ojo no relaciona. */}
      <div className={`min-w-0 flex-1 ${alta || usuario ? '' : 'lg:max-w-[1160px]'}`}>
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
          {/* La anatomía es la del DS —hairline inferior, lupa de 13px, sin caja— y la lupa es
              literalmente la del DS. Se arma acá y no con `<Buscador>` porque este listado filtra
              en el navegador sobre una lista ya cargada: el `data-testid` y el `aria-label` son
              propios de la cuenta, no de una lista genérica. */}
          <div className="flex min-w-0 items-center gap-2 border-b border-line sm:w-[220px]">
            <IconoBuscar />
            <input
              type="search" value={texto} onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar cuenta" aria-label="Buscar cuenta" data-testid="buscar-usuario"
              className="h-control min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint max-lg:h-control-movil"
            />
          </div>
          <Filtros
            testid="filtros-usuarios"
            opciones={FILTROS.map((f) => ({
              label: f.label, onClick: () => setFiltro(f.value), activo: filtro === f.value,
              testid: `filtro-usuarios-${f.value}`,
            }))}
          />
          <Boton
            variante="primaria" className="ml-auto"
            onClick={() => { setAlta(true); setElegido(null) }}
            data-testid="abrir-alta"
          >+ Invitar usuario</Boton>
        </div>

        {visibles.length === 0 ? (
          <div data-testid="sin-usuarios"><Vacio>Ninguna cuenta coincide con lo que buscás.</Vacio></div>
        ) : (
          <Tabla testid="tabla-usuarios" minWidth={880}>
            <THead>
              <Th>Cuenta</Th>
              <Th>Nivel</Th>
              <Th>Obras con acceso</Th>
              <Th>Último ingreso</Th>
              <Th>Estado</Th>
            </THead>
            <tbody>
              {visibles.map((u) => {
                const ingreso = ultimoIngresoDicho(u.ultimoIngreso)
                return (
                  <Tr
                    key={u.id}
                    onClick={() => { setElegido(u.id); setAlta(false) }}
                    seleccionada={u.id === elegido}
                    data-testid={`fila-${u.email ?? u.id}`}
                  >
                    <Td fuerte className="w-[300px]">
                      <span className="block truncate text-[13px] text-ink">{u.email ?? 'sin correo'}</span>
                      <span className="block truncate text-[11px] text-faint">
                        {u.nombre ?? 'sin persona vinculada'}
                      </span>
                    </Td>
                    <Td className="w-[170px]">
                      {u.rol ? ROL_LABEL[u.rol] : <span className="text-warn">sin nivel asignado</span>}
                    </Td>
                    <Td><CeldaObras u={u} /></Td>
                    <Td className="w-[150px]">
                      {ingreso ? <Num className="text-muted">{ingreso}</Num> : <Nulo>nunca ingresó</Nulo>}
                    </Td>
                    <Td className="w-[90px]">
                      {u.estado === 'activo'
                        ? <span data-estado="activa" className="text-[12px] text-muted">activa</span>
                        : <Estado tono="warn" clave="sin_acceso">sin acceso</Estado>}
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </Tabla>
        )}

        {/* NO ES UNA PREFERENCIA DE INTERFAZ, Y SE DICE. `usuario_obra` es la tabla que consulta
            `ve_obra()`, la función que citan las policies de obras, actividades, asignaciones,
            documentos y las cuatro tablas de Operación. Lo que se toca acá cambia lo que esa persona
            puede LEER de la base, con esta pantalla abierta o sin ella. */}
        <p className="mt-4 max-w-[760px] text-[11px] leading-relaxed text-faint" data-testid="aviso-permisos">
          Asignar una obra acá le abre esa obra a la persona en la base. Quitarla se la cierra: no es
          una preferencia de interfaz.
        </p>
      </div>

      {alta && <AltaUsuario alCerrar={() => setAlta(false)} />}
      {!alta && usuario && (
        <PanelUsuario
          usuario={usuario}
          obras={obras}
          personas={personas}
          esUnoMismo={usuario.id === actorId}
          rolActor={rolActor}
          alCerrar={() => setElegido(null)}
        />
      )}
    </div>
  )
}
