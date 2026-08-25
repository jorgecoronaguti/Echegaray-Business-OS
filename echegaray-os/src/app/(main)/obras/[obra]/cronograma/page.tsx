// 07 · OBRA CRONOGRAMA — esta URL ya no dibuja un cronograma propio: lleva al único que hay.
//
// ═══ POR QUÉ SE RETIRÓ LA PANTALLA QUE VIVÍA ACÁ (24/08/2026) ═══
//
// Había DOS cronogramas de obra. Éste calculaba las fechas DESDE LA SECUENCIA con el motor de camino
// crítico; el del workspace dibuja el plan COMO ESTÁ CARGADO. Convivían a propósito y con el porqué
// escrito. Lo que la convivencia no resistió es el dato: las obras tienen CERO dependencias
// cargadas, y sin dependencias el motor arranca TODAS las actividades el mismo día. O sea: esta
// pantalla dibujaba treinta y cinco barras apiladas sobre la primera semana de la obra y rotulaba
// eso «cronograma». Una barra que miente sobrevive a cualquier aviso escrito al lado.
//
// El camino crítico, la holgura, el arrastre simulado y los conflictos de cuadrilla vivían acá y no
// tienen pantalla desde hoy. NO se borró el motor (`cronogramaMotor.ts`, con sus tests, lo sigue
// usando la 08 · Dotación): lo que se retiró es la vista que publicaba su resultado como si fuera el
// plan de la obra. Volver a ofrecerlo exige antes que alguien cargue precedencias — y ésas se
// declaran en el panel de la actividad, en Tareas.
//
// La URL sigue viva porque está en marcadores, en links de chat y en los tests.

import { redirect } from 'next/navigation'

export default async function CronogramaObraPage({ params }: { params: Promise<{ obra: string }> }) {
  const { obra } = await params
  redirect(`/obras/${obra}?vista=cronograma`)
}
