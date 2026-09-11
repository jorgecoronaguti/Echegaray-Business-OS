import { PantallaEsqueleto, EncabezadoEsqueleto, Bloque } from '@/shared/components/carga'

// EL FALLBACK DE TODO EL GRUPO `(main)` — el que atrapa a las pantallas que no tienen el suyo.
//
// Cada página de este grupo es `dynamic = 'force-dynamic'`: hasta que el servidor no termina, el
// navegador no pinta NADA. Un `loading.tsx` abre una frontera de Suspense y el documento se manda
// por streaming: el marco y este esqueleto salen primero y el contenido llega después, en vez de un
// blanco hasta que la última consulta vuelve.
//
// ═══ LO QUE ESTO **NO** HACE, MEDIDO EL 11/09/2026 ═══
//
// Acá estaba escrito que «navegando, el router muestra este esqueleto apenas se hace clic». **Es
// falso**, y se comprobó contra el build de producción con la respuesta RSC retrasada 6 s a propósito
// y un contexto de navegador nuevo por caso: al hacer clic en un enlace de las barras de navegación
// NO se monta ningún `loading.tsx` —ni éste ni el de la sección—; el router deja la pantalla anterior
// tal cual hasta que llega el payload.
//
// La causa es `prefetch={false}` en esas barras: sin precarga el router no tiene el árbol de la ruta
// y no sabe qué frontera montar. Next 16 sólo precarga hasta el `loading.tsx` más cercano cuando el
// destino es dinámico, y eso es justo lo que ahí está apagado — a propósito, porque en las LISTAS la
// precarga costaba decenas de renders de servidor (ver `prefetch-en-listas.test.ts`).
//
// Lo que cubre la navegación por clic es `IndicadorNavegacion`: barra fina arriba y, a los 500 ms, el
// cartel «Cargando…». Medido en producción sobre 20 navegaciones reales, aparece entre 34 y 536 ms
// sin una sola excepción.
//
// Se prefiere SIEMPRE un esqueleto con la forma de la pantalla real. Éste es el piso, no el techo.
export default function Cargando() {
  return (
    <PantallaEsqueleto>
      <EncabezadoEsqueleto />
      <div className="grid gap-3">
        <Bloque className="h-24 motion-safe:animate-pulse" />
        <Bloque className="h-56 motion-safe:animate-pulse" />
      </div>
    </PantallaEsqueleto>
  )
}
