// 00 · ADMINISTRACIÓN — LA ENTRADA DEL ÁREA ES LA SECCIÓN CLIENTES. NO HAY DOS.
//
// ═══ POR QUÉ ESTA PANTALLA DEJÓ DE DIBUJARSE (09/09/2026, orden del dueño) ═══
//
// «Hay mezcla de pantalla con información; dejá, en lo que respecta a módulo Administración sección
// Clientes, UNA pantalla que contenga la info de las dos y permita cubrir todas las funciones que
// tiene que cubrir la sección Clientes.»
//
// Esta entrada dibujaba `CarteraHome`: los mismos cinco clientes y las mismas nueve obras que
// `/clientes`, con las columnas económicas de OBRAS. Y decían cosas distintas del MISMO cliente
// —$156.174.253 contratado acá, «sin contrato» allá— porque cada una leía una fuente distinta del
// mismo concepto. Eso no es una vista alternativa: es la definición de lo que REALIDAD ÚNICA
// prohíbe. La tabla económica se mudó a `/clientes` y `CarteraHome` se eliminó.
//
// ═══ REDIRECT Y NO UNA RUTA BORRADA ═══
//
// `/administracion` es el ATERRIZAJE de todos los roles después de entrar (`aterrizajeDeIngreso`),
// y está enlazada desde la barra de nivel 1, desde `ubicacion.ts` y desde media docena de tests.
// Borrar la ruta rompería todo eso; redirigir la deja llegando a la única pantalla que existe.
//
// LO QUE SE PIERDE, DICHO: la barra de nivel 2 se dibujaba acá CON contadores
// (`homeAdministracion.getConteosHome`) y en el resto del área sin ellos (`NavAdministracion`).
// Después del redirect ya no hay ninguna pantalla que los muestre. Los conteos siguen calculándose
// —`getConteosHome` y `areasDeAdministracion` no se tocaron— y volver a encenderlos es pasarle
// `areas` con cuenta a `BarraAreas` desde donde el dueño decida. No se hizo acá porque poner ocho
// lecturas más en la pantalla que ya hace nueve es pagar el aterrizaje de todos los días para
// dibujar cuatro números que nadie pidió.

// ═══ QUIÉN REDIRIGE DE VERDAD, DESDE EL 12/09/2026 ═══
//
// El middleware, y no esta función. Un `redirect()` acá llega TARDE: el layout de `(main)` ya empezó
// a mandar el documento por streaming, Next no puede contestar un 307 con los encabezados afuera, y
// se cae a `<meta http-equiv="refresh" content="1;url=/clientes">` — un segundo de pantalla quieta
// más un documento entero de 20 kB que no dibuja nada. Medido: ver
// `features/auth/types/areas.ts · ENTRADA_DE_ADMINISTRACION`, donde vive el destino y el porqué.
//
// ESTO SE QUEDA COMO RED, NO COMO SEGUNDA DEFINICIÓN: lee la MISMA constante que el middleware, así
// que no hay dos lugares que puedan decir destinos distintos. Si el middleware alguna vez no corriera
// —matcher roto, runtime caído—, el aterrizaje de dirección, administración y jefe de obra sigue
// llegando a Clientes en vez de dar 404. Lento, pero no roto.

import { redirect } from 'next/navigation'
import { ENTRADA_DE_ADMINISTRACION } from '@/features/auth/types/areas'

export default function AdministracionPage() {
  redirect(ENTRADA_DE_ADMINISTRACION)
}
