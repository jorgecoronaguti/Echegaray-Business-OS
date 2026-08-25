// SESIONES — desde dónde está abierta mi cuenta.
//
// ═══ LA LISTA DE DISPOSITIVOS NO SE PUEDE MOSTRAR, Y SE DICE ═══
//
// El handoff pide `dispositivo · lugar · cuándo · cerrar una o todas`. Esa tabla vive en
// `auth.sessions`, que es un esquema interno de Supabase Auth: PostgREST no lo publica y el SDK no
// tiene un `listSessions()`. Se puede llegar con la clave de servicio por la API de administración,
// y NO se hace: traer la lista de sesiones de todos los usuarios al servidor para mostrarle la suya
// a uno es abrir un privilegio de administrador en una pantalla que cualquiera abre.
//
// Entonces se muestra lo que SÍ es cierto —esta sesión, con el navegador que la abrió y cuándo
// entró— y se dice por qué no están las otras. Una tabla con un dispositivo inventado o con «Chrome
// · Windows» adivinado sería peor que la ausencia: alguien buscaría ahí una sesión intrusa que la
// tabla nunca podría mostrar.
//
// ═══ LO QUE SÍ FUNCIONA DE VERDAD ═══
//
// «Cerrar todas» invalida los refresh tokens de TODAS las sesiones (`scope: 'global'`), incluida
// ésta. Es la acción que resuelve el caso real —«me olvidé la sesión abierta en la máquina del
// obrador»— y no necesita listar nada para funcionar.

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { MiCuentaShell } from '@/features/mi-cuenta/components/MiCuentaShell'
import { CerrarSesiones } from '@/features/mi-cuenta/components/CerrarSesiones'
import { Aviso, Ayuda, Estado, Nulo, Num, Tabla, THead, Th, Tr, Td } from '@/shared/components/ds'

export const dynamic = 'force-dynamic'

/** El navegador y el sistema, sacados del `user-agent`. Es una lectura aproximada y se rotula como
 *  «este navegador», no como un inventario de dispositivos. */
function navegador(ua: string | null): string | null {
  if (!ua) return null
  const so = /Windows/i.test(ua) ? 'Windows'
    : /Android/i.test(ua) ? 'Android'
      : /iPhone|iPad/i.test(ua) ? 'iOS'
        : /Mac OS X/i.test(ua) ? 'macOS'
          : /Linux/i.test(ua) ? 'Linux' : null
  const nav = /Edg\//i.test(ua) ? 'Edge'
    : /OPR\//i.test(ua) ? 'Opera'
      : /Chrome\//i.test(ua) ? 'Chrome'
        : /Firefox\//i.test(ua) ? 'Firefox'
          : /Safari\//i.test(ua) ? 'Safari' : null
  if (!nav && !so) return null
  return [nav, so].filter(Boolean).join(' · ')
}

export default async function SesionesPage() {
  const supabase = await createClient()
  // AL SERVIDOR DE AUTH, COMO `/mi-cuenta/seguridad` y por el mismo motivo: `last_sign_in_at` no
  // viaja en el JWT. El resto del OS resuelve la identidad verificando la firma en el proceso
  // (`getUsuarioActual`), que no trae ese campo — y una pantalla que dice «entraste el 20/08 14:32»
  // no puede inventarlo.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return <MiCuentaShell titulo="Sesiones"><Aviso tono="neg">Tu sesión venció. Volvé a entrar.</Aviso></MiCuentaShell>

  const h = await headers()
  const equipo = navegador(h.get('user-agent'))
  const desde = user.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
        timeZone: 'America/Argentina/Buenos_Aires',
      })
    : null

  return (
    <MiCuentaShell titulo="Sesiones" descripcion="Desde dónde está abierta tu cuenta.">
      <Tabla testid="tabla-sesiones" minWidth={560}>
        <THead>
          <Th>Dispositivo</Th>
          <Th className="w-[180px]">Lugar</Th>
          <Th num className="w-[150px]">Última entrada</Th>
          <Th className="w-[120px]">Estado</Th>
        </THead>
        <tbody>
          <Tr>
            <Td fuerte>{equipo ?? <Nulo>navegador sin identificar</Nulo>}</Td>
            {/* NO SE GEOLOCALIZA POR IP. Una ciudad deducida de la IP acierta a veces y falla otras,
                y en esta pantalla un lugar equivocado hace que alguien crea que le entraron. */}
            <Td><Nulo>no se registra</Nulo></Td>
            <Td num>{desde ? <Num>{desde}</Num> : <Nulo>sin registro</Nulo>}</Td>
            <Td><Estado tono="pos">Esta sesión</Estado></Td>
          </Tr>
        </tbody>
      </Tabla>

      {/* 22/08/2026 · LO QUE HAY QUE HACER SE QUEDA; EL PORQUÉ TÉCNICO BAJA. Cuatro líneas
          permanentes explicando en qué esquema vive el listado de dispositivos no ayudan a nadie a
          decidir: la única acción posible es «cerrar todas», y eso es lo que tiene que estar a la
          vista. El límite se sigue declarando —no se afirma que ésta sea la única sesión—. */}
      <p className="mt-3 max-w-[820px] text-[11px] leading-relaxed text-faint">
        Sólo se puede mostrar la sesión desde la que estás mirando. Si sospechás que quedó una
        abierta en otro lado, cerrá todas: es lo que de verdad la corta.
      </p>
      <Ayuda titulo="Por qué no se listan los otros dispositivos" testid="ayuda-sesiones">
        El listado vive en el esquema interno de autenticación y llegar ahí exige privilegios de
        administrador, que no se abren en una pantalla personal.
      </Ayuda>

      <div className="mt-8 max-w-[460px] border-t border-[#EFEEEA] pt-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Cerrar todas las sesiones</div>
        <p className="mb-3 mt-1.5 text-[12px] leading-relaxed text-muted">
          Vas a tener que volver a entrar en cada dispositivo, incluido éste. Tus datos no se tocan.
        </p>
        <CerrarSesiones />
      </div>
    </MiCuentaShell>
  )
}
