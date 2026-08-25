// 00 · ADMINISTRACIÓN — LA ENTRADA DEL ÁREA. NO ES UN ÍNDICE TEXTUAL.
//
// ═══ QUÉ CAMBIÓ (00 · Home Navegación v2, zip del 25/08/2026) ═══
//
//   · La barra pasa de DIEZ tablas en fila a SIETE destinos en tres grupos separados por un filo.
//     Presupuestos sube a nivel 1 (es comercial) y Usuarios baja al menú de la cuenta; Pendientes y
//     Asistencia se absorben en «Trabajo», que es esta pantalla. Ninguna ruta se rompió.
//   · La banda de chips se convierte en un LIBRO MAYOR de siete señales: cada fila dice qué falta,
//     qué bloquea y trae su verbo. Un chip que sólo cuenta no hace que nadie deje lo que está
//     haciendo.
//   · La cartera dibuja las obras en ejecución COLGANDO de su cliente y compartiendo sus columnas.
//
// ═══ LAS SEIS LECTURAS VAN EN UNA SOLA TANDA, Y SON SEIS PORQUE ANTES ERAN DIECINUEVE ═══
//
// El perfil hace falta para decidir QUÉ destinos se dibujan, pero pedirlo antes de contar
// convertiría la pantalla en dos viajes encadenados. Se lanza todo junto y se descarta después: lo
// que el rol no puede ver lo cierra la base, no el orden de las consultas.
//
// Medido el 25/08 en producción (Navigation Timing, `respEnd − respStart`), esta pantalla tardaba
// 4.904 ms —la más lenta del OS— con el shell saliendo en 51 ms: los 4,85 s eran íntegramente el
// servidor esperando a la base. Lo que se hizo, en orden de efecto:
//
//   · quince conteos `head:true` → ocho lecturas (ver `homeAdministracion.getConteosHome`);
//   · `getObrasPorCliente` se fue entera: el panel lateral que la usaba ya no existe en v2;
//   · el conteo de clientes se fue: sale de la cartera que esta página ya trae.
//
// Lo que NO se hizo y sería el próximo salto: una sola función `security definer` que devuelva los
// once números en una fila. Está escrita en `supabase/migrations` y SIN APLICAR — una migración en
// el repo no es una migración aplicada, y aplicarla no es de este trabajo.

import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { getClientes } from '@/features/clientes/services/clientesService'
import { separarArchivados } from '@/features/clientes/services/cartera'
import { SelloDatoBueno } from '@/shared/components/estado/SelloDatoBueno'
import { Aviso } from '@/shared/components/ds'
import { C } from '@/shared/components/canon'
import { BarraAreas } from '@/features/administracion/components/BarraAreas'
import { LibroDeTrabajo } from '@/features/administracion/components/LibroDeTrabajo'
import { CarteraHome } from '@/features/administracion/components/CarteraHome'
import {
  areasDeAdministracion, atencionNoLeida, getConteosHome, senalesDeTrabajo, senalesVivas,
} from '@/features/administracion/services/homeAdministracion'
import {
  armarCartera, getCertificadosDeLaCartera, getObrasDeLaCartera, getUltimoParte, hoyEnLaEmpresa,
} from '@/features/administracion/services/homeCartera'

export const dynamic = 'force-dynamic'

export default async function AdministracionPage() {
  const supabase = await createClient()
  const [leidos, cartera, perfil, obras, partes, certificados] = await Promise.all([
    getConteosHome(supabase),
    getClientes(supabase),
    getPerfilActual(supabase),
    getObrasDeLaCartera(supabase),
    getUltimoParte(supabase),
    getCertificadosDeLaCartera(supabase),
  ])

  const rol = perfil.data?.rol ?? null
  const vePrecio = veEconomia(rol)
  const { activos } = separarArchivados(cartera.data ?? [])
  // EL CONTADOR DE CLIENTES SALE DE LA CARTERA QUE YA SE TRAJO. Un `count` aparte sería una consulta
  // más para decir lo mismo, y el día que una de las dos cambie de criterio dirían números distintos.
  const conteos = { ...leidos, clientes: cartera.error ? null : activos.length }
  const senales = senalesDeTrabajo(conteos, rol)
  const areas = areasDeAdministracion(conteos, rol, senalesVivas(conteos, rol))

  return (
    // SIN `PageShell` (porte 25/08, canónico 00 v2). El shell dibuja padding 16/24px y un ancho de
    // lectura; el canon dibuja la barra a sangre y el contenido con 20px de costado. Lo único del
    // shell que no se puede perder es `SelloDatoBueno`, que es lo que le da al `error.tsx` la hora
    // del último dato bueno.
    <div style={{ minHeight: '100vh', background: C.fondo, display: 'flex', flexDirection: 'column' }}>
      <SelloDatoBueno />
      <BarraAreas areas={areas} />
      <LibroDeTrabajo senales={senales} noLeida={atencionNoLeida(conteos)} />

      {/* UNA LISTA VACÍA POR ERROR NO SE DIBUJA COMO «NO HAY DATOS» (INTERACTION.md §Error). */}
      {cartera.error ? (
        <div style={{ padding: '30px 20px 24px' }}>
          <Aviso tono="neg" titulo="No pude leer los clientes">{cartera.error}</Aviso>
        </div>
      ) : (
        <CarteraHome
          clientes={armarCartera({ clientes: activos, obras, partes, certificados })}
          hoy={hoyEnLaEmpresa()}
          veEconomia={vePrecio}
          obrasNoLeidas={obras === null}
        />
      )}
    </div>
  )
}
