import { EsqueletoJefe } from '@/features/jefe/components/EsqueletoJefe'

// EL FALLBACK DEL GRUPO `(jefe)` — el que atrapa la ENTRADA al producto.
//
// ═══ POR QUÉ ADEMÁS HAY UNO POR PANTALLA ═══
//
// Este archivo abre una frontera de Suspense adentro de `(jefe)/layout.tsx`. Eso alcanza para el
// primer documento —el marco y este esqueleto salen por streaming mientras el servidor termina— pero
// NO para la navegación entre las seis pantallas: en una transición, React sigue mostrando el
// contenido de una frontera YA MONTADA, no su fallback. El que se ve es el fallback de la frontera
// que se monta NUEVA, y eso es el `loading.tsx` co-locado con la página a la que se entra. Por eso
// están los dos, que es lo mismo que ya hace `(main)`: uno arriba y uno por pantalla.
//
// Las seis páginas son `dynamic = 'force-dynamic'` y cada una hace un `Promise.all` de entre 3 y 7
// lecturas. Hasta hoy no había ninguna frontera: en el teléfono, tocar una pestaña dejaba la
// pantalla anterior intacta y muda hasta que volvía la última consulta. Con señal de obra eso se
// lee como una aplicación colgada, y la reacción es tocar de nuevo.
export default function Cargando() {
  return <EsqueletoJefe metricas paneles={2} />
}
