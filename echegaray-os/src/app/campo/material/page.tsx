import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { Aviso, Vacio } from '@/shared/components/ds'
import { ListaMaterialTelefono } from '@/features/materiales/components/ListaMaterialTelefono'
import { agruparPedidos, hrefPedirTelefono } from '@/features/materiales/logica/pedidos'
import { MIGRACION, leerMaterial } from '@/features/materiales/services/pedidosService'
import { leerDatosCampo } from '../datos'
import { MarcoCampo } from '../marco'

// MATERIAL · TELÉFONO — lo pedido en mis obras y el botón para pedir. Es el destino de la tarjeta
// «Material» de `/campo` y de la fila «Material» de Herramientas en el teléfono.
//
// Hasta el 23/09 la tarjeta abría `/integraciones/pedidos-materiales`, la pantalla de ESCRITORIO del
// espejo de AppSheet: el jefe veía una tabla de ocho columnas en 390px y para pedir tenía que abrir
// otra app. Ahora pide acá, en la misma tabla, y la computadora (`/herramientas/material`) lo ve al
// instante. Mismo módulo, mismo nombre, en las dos caras.
//
// La lista es de MIS obras (las que devuelve `obra_canonica` bajo RLS, igual que en `/campo`). Con una
// sola obra no se dice cuál en cada tarjeta; con varias, sí.

export const dynamic = 'force-dynamic'

export default async function MaterialCampoPage({ searchParams }: { searchParams: Promise<{ obra?: string }> }) {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')

  const [campo, lectura, perfil] = await Promise.all([leerDatosCampo(supabase), leerMaterial(supabase), getPerfilActual(supabase)])
  // Borrar un pedido es de quien administra (la RPC lo exige igual); al operario no se le dibuja el botón.
  const puedeBorrar = perfil.data?.rol != null && perfil.data.rol !== 'campo' && perfil.data.rol !== 'cliente'
  const pedida = (await searchParams).obra
  const obra = campo.obras.length === 1 ? campo.obras[0] : campo.obras.find((o) => o.id === pedida) ?? null
  const ids = obra ? [obra.id] : campo.obras.map((o) => o.id)
  const titulo = 'Material'
  const subtitulo = obra ? obra.nombre : campo.obras.length > 1 ? `${campo.obras.length} obras` : undefined

  const pie = (
    <div className="sticky bottom-0 -mx-4 mt-6 border-t border-line bg-surface px-4 py-3.5">
      <Link
        href={hrefPedirTelefono(obra?.id)}
        data-testid="pedir-material"
        className="flex h-[48px] w-full items-center justify-center rounded-[8px] bg-marca text-[15px] font-semibold text-[color:var(--os-on-marca)]"
      >
        Pedir material
      </Link>
    </div>
  )

  if (lectura.estado === 'falta_migracion') {
    return (
      <MarcoCampo titulo={titulo} subtitulo={subtitulo}>
        <Aviso tono="warn" titulo="Todavía no se puede pedir desde acá." testid="falta-migracion">
          Falta la migración {MIGRACION}. Hasta entonces, lo pedido se ve en la ficha de la obra.
        </Aviso>
      </MarcoCampo>
    )
  }
  if (lectura.estado === 'error') {
    return (
      <MarcoCampo titulo={titulo} subtitulo={subtitulo}>
        <Aviso tono="neg" titulo="No se pudieron leer los pedidos." testid="material-error">
          {lectura.mensaje}
        </Aviso>
      </MarcoCampo>
    )
  }

  const grupos = agruparPedidos(lectura.pedidos.filter((p) => p.obra !== null && ids.includes(p.obra)))

  return (
    <MarcoCampo titulo={titulo} subtitulo={subtitulo}>
      {campo.error && (
        <div className="mb-4">
          <Aviso tono="neg" titulo="No se pudieron leer tus obras." testid="campo-error">
            {campo.error}
          </Aviso>
        </div>
      )}
      {grupos.length === 0 ? (
        <Vacio>Nada pedido todavía{obra ? ` para ${obra.nombre}` : ''}.</Vacio>
      ) : (
        <ListaMaterialTelefono grupos={grupos} variasObras={!obra && campo.obras.length > 1} puedeBorrar={puedeBorrar} />
      )}
      {pie}
    </MarcoCampo>
  )
}
