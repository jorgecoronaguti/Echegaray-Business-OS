import { PantallaEsqueleto, EncabezadoEsqueleto, Bloque } from '@/shared/components/carga'

// EL FALLBACK DE TODO EL GRUPO `(main)` — el que atrapa a las pantallas que no tienen el suyo.
//
// Cada página de este grupo es `dynamic = 'force-dynamic'`: hasta que el servidor no termina, el
// navegador no pinta NADA. Un `loading.tsx` abre una frontera de Suspense y da vuelta las dos cosas
// que hacían que eso se sintiera como una aplicación colgada:
//
//   · NAVEGANDO   el router muestra este esqueleto apenas se hace clic, en vez de dejar la pantalla
//                 anterior intacta y muda.
//   · ENTRANDO    el documento se manda por streaming: el marco y este esqueleto salen primero y el
//                 contenido llega después, en vez de un blanco hasta que la última consulta vuelve.
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
