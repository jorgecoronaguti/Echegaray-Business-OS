// 00 · ADMINISTRACIÓN — LA ENTRADA DEL ÁREA. NO ES UN ÍNDICE TEXTUAL.
//
// ═══ QUÉ CAMBIÓ EL 23/08/2026 (Design canónico, pantalla 00) ═══
//
// La pantalla decía dos veces lo mismo: la barra de nivel 2 nombraba las secciones arriba y, abajo,
// una lista de «maestros» repetía cada nombre con una frase explicándolo («Ficha, contactos,
// actividad, documentos y sus obras»). Diez renglones de prosa para decir a dónde lleva un enlace que
// ya estaba dibujado. Ahora:
//
//   · el contador y el ⚠ viven ADENTRO de la barra, que es donde el nombre del área ya estaba;
//   · lo accionable es una fila de chips, cada uno con su número y con el FILTRO donde se corrige;
//   · debajo queda la entidad activa —la cartera de clientes— para abrir una ficha.
//
// ═══ POR QUÉ LAS DIECISÉIS LECTURAS VAN EN UNA SOLA TANDA ═══
//
// El perfil hace falta para decidir QUÉ áreas se dibujan, pero pedirlo antes de contar convertiría la
// pantalla en dos viajes encadenados. Se lanza todo junto y se descarta después: lo que el rol no
// puede ver lo cierra la base, no el orden de las consultas.
//
// ═══ SE FUERON EL H1 Y EL BUSCADOR GLOBAL (24/08/2026, auditoría lado a lado del canónico) ═══
//
// La pantalla arrancaba con «Administración» a 22px y un buscador global de 300px a la derecha. El
// mockup 00 no dibuja ninguno de los dos: la primera línea del contenido ES la barra de áreas, y
// abajo la banda de atención. El título repetía la solapa de nivel 1 —«Administración» ya está
// encendida arriba— y el buscador global vive en la LUPA de la barra de la aplicación, no dentro de
// la página; tenerlo acá lo convertía en un buscador de Administración disfrazado de global, que
// desaparecía apenas alguien entraba a Personas.
//
// LO QUE ESTO SE LLEVA, DICHO: `buscarGlobal` —cliente + persona + proveedor en una consulta— queda
// sin puerta en la interfaz. El servicio y su prueba siguen en `entradaService`: lo que falta es la
// lupa de la barra de aplicación, que no es de esta pantalla.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import {
  getClientes, getObrasEnEjecucion, getObrasPorCliente,
} from '@/features/clientes/services/clientesService'
import { separarArchivados } from '@/features/clientes/services/cartera'
import { ListaClientes, type ObraEnCurso } from '@/features/clientes/components/ListaClientes'
import { PageShell } from '@/shared/components/ui'
import { Aviso, BotonEnlace, TituloPantalla, Vacio } from '@/shared/components/ds'
import { BarraAreas } from '@/features/administracion/components/BarraAreas'
import { BarraAtencion } from '@/features/administracion/components/BarraAtencion'
import {
  areasDeAdministracion, atencionNoLeida, chipsDeAtencion, getConteosHome,
} from '@/features/administracion/services/homeAdministracion'

export const dynamic = 'force-dynamic'

export default async function AdministracionPage() {
  const supabase = await createClient()
  const [conteos, cartera, perfil, enEjecucion, todasLasObras] = await Promise.all([
    getConteosHome(supabase),
    getClientes(supabase),
    getPerfilActual(supabase),
    // LAS DOS LECTURAS DEL PANEL. Van en la MISMA tanda que las dieciséis de arriba —no encadenadas
    // detrás de la cartera— y son de toda la cartera de una vez, no una por cliente tocado: la
    // selección en el panel tiene que ser instantánea o deja de ser un panel.
    getObrasEnEjecucion(supabase),
    getObrasPorCliente(supabase),
  ])

  const rol = perfil.data?.rol ?? null
  const vePrecio = veEconomia(rol)
  const areas = areasDeAdministracion(conteos, rol)
  const chips = chipsDeAtencion(conteos, rol)
  const { activos } = separarArchivados(cartera.data ?? [])

  return (
    // SIN ENCABEZADO DE PÁGINA: el canónico arranca en la barra de áreas. El `h1` que había decía
    // «Administración» a 60px de la solapa «Administración» de la barra de aplicación, ya encendida.
    <PageShell title="Administración" encabezado={false}>
      <BarraAreas areas={areas} />
      <BarraAtencion chips={chips} noLeida={atencionNoLeida(conteos)} />

      {/* EL ÚNICO `h1` DE LA PANTALLA. Sin el encabezado de página, el título de la lista es el
          título: una pantalla sin `h1` deja al lector de pantalla sin punto de entrada. */}
      <TituloPantalla className="mb-3">Clientes</TituloPantalla>

      {/* UNA LISTA VACÍA POR ERROR NO SE DIBUJA COMO «NO HAY DATOS» (INTERACTION.md §Error). */}
      {cartera.error ? (
        <Aviso tono="neg" titulo="No pude leer los clientes">{cartera.error}</Aviso>
      ) : activos.length === 0 ? (
        <Vacio accion={<Link href="/clientes?nuevo=1" className="text-ink underline underline-offset-2">Cargar el primero</Link>}>
          Todavía no hay clientes activos.
        </Vacio>
      ) : (
        // ES LA MISMA CARTERA DE `/clientes`, NO UNA SEGUNDA. Acá vivía `TablaClientesHome`: cuatro
        // columnas escritas aparte que terminaron siendo las mismas cuatro del canónico 25, con sus
        // propios «—» y su propio criterio de qué es «en ejecución». Dos tablas del mismo maestro se
        // contradicen el día que una aprende una columna, y el mockup 00 dibuja exactamente ésta —con
        // avatar de iniciales, razón social debajo y el panel de 372px al costado.
        <ListaClientes
          clientes={activos}
          enEjecucion={Object.fromEntries(enEjecucion) as Record<string, ObraEnCurso[]>}
          obrasPorCliente={Object.fromEntries(todasLasObras)}
          veEconomia={vePrecio}
          // El alta vive en `/clientes`: un segundo formulario del mismo cliente sería una segunda
          // puerta al mismo maestro. Acá se ofrece la puerta, no una copia.
          accion={
            <BotonEnlace href="/clientes?nuevo=1" variante="primaria" data-testid="ir-alta-cliente" className="shrink-0">
              + Nuevo cliente
            </BotonEnlace>
          }
        />
      )}
    </PageShell>
  )
}
