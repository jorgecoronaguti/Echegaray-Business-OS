// QUÉ REHACE EL AGENTE DEL FLUJO DE CAJA, Y QUÉ PESTAÑA DEJA CADA PASO.
//
// POR QUÉ ESTÁ ACÁ Y NO ADENTRO DEL AGENTE (21/07). La tercera columna —qué pestañas deja cada
// script— es lo que permite contestar "¿queda alguna pestaña derivada que no mantiene nadie?" sin
// que alguien se acuerde de mirar. Así apareció Recurrentes: el Cash Flow Mensual leía de ella su
// proyección y no la rehacía ningún script. Para que el auditor pueda leer esta lista sin ejecutar
// el agente entero, la lista vive en su propio archivo.
//
// EL ORDEN NO ES COSMÉTICO: cada paso lee lo que escribió el anterior.

export const PASOS = [
  // PRIMERO DE TODOS: los jornales entran al archivo desde OTRO Sheet (JORNALES). Si el espejo no
  // se refresca, todo lo que sigue calcula sobre una foto vieja y ningún control lo ve — pasó el
  // 21/07: la quincena en curso quedó $1.231.963 por debajo de la real.
  ['espejar-jornales.mjs', 'espejo del archivo JORNALES (_J_OBREROS y _J_OFICINA)', ['_J_OBREROS', '_J_OFICINA']],
  // La escala UOCRA de Jornales leía sus básicos pegados a mano —contenido huérfano que se quedaba un
  // mes atrás sin avisar—. Ahora los toma de _UOCRA_RAW por fórmula, con alerta de vigencia.
  ['jornales-escala-uocra.mjs', 'Jornales por Quincena — el bloque ESCALA UOCRA leído de _UOCRA_RAW', ['Jornales por Quincena']],
  // SEGUNDO: devolver la fórmula a las celdas calculadas que alguien pisó pegando un valor. Va
  // antes de todo cálculo porque una celda pisada no grita: muestra un número creíble que dejó de
  // actualizarse. El 21/07 había cuatro, y dos de ellas hacían que dos cobros de $16.200.000
  // quedaran fuera de cualquier filtro por mes.
  ['columnas-calculadas.mjs', 'devolver la fórmula a las celdas calculadas pisadas a mano', []],
  // La réplica de ARCA va ANTES de Impuestos: esa pestaña la referencia con fórmulas y necesita que
  // los comprobantes ya estén en el archivo. Es el mismo orden que el espejo de JORNALES.
  ['banco-raw-pestana.mjs', '_BANCO_RAW — el extracto del Santander dentro del Sheet', ['_BANCO_RAW']],
  ['arca-raw-pestana.mjs', '_ARCA_RAW — los comprobantes de ARCA dentro del Sheet', ['_ARCA_RAW']],
  ['rubro-caja-sheet.mjs', 'la columna "Rubro de caja" de Compras — de acá cuelga todo lo demás', []],
  // Recurrentes va ANTES del cash flow: el cuadro lee de ella su proyección y necesita que exista.
  ['recurrentes-pestana.mjs', 'Recurrentes — servicios fijos, sin proyectar meses ya cerrados', ['Recurrentes']],
  ['cash-flow-rehacer.mjs', 'Cash Flow Semanal y Mensual', ['Cash Flow Semanal', 'Cash Flow Mensual']],
  // LOS NOMBRES SON LOS DE HOY. Declaraba las cuatro pestañas del diseño viejo —"Proveedores —
  // Deuda", "Proveedores — Cuenta Corriente"…— que dejaron de existir cuando el bloque se unificó en
  // una sola pestaña "Proveedores". Con nombres que no existen, el control de "todo se actualiza
  // solo" daba a Proveedores por huérfana aunque este script la rehaga en cada corrida.
  ['proveedores-materiales-pestana.mjs', 'Proveedores (deuda, cuenta corriente, control y ARCA) + Materiales', ['Proveedores', 'Materiales']],
  ['estructura-pestana.mjs', 'pestaña Estructura con su proyección', ['Estructura']],
  ['impuestos-pestana.mjs', 'Impuestos y Financieros — IVA real de ARCA', ['Impuestos y Financieros']],
  // ═══ CARGAS SOCIALES: UN SOLO DUEÑO (23/07) ═══
  //
  // Antes eran TRES scripts escribiendo la misma pestaña —f931-sheet el bloque 1, cargas-planes los
  // planes, cargas-proyeccion la proyección—, cada uno con su ancho de grilla y ubicando su bloque
  // por rótulo. De ahí salían los cinco anchos mezclados, los bloques sin número y —lo peor— dos
  // bloques huérfanos que ningún script reclamaba y que quedaron rotos en #VALUE! sin que nadie se
  // enterara. Ahora f931-sheet sólo mantiene la réplica _F931_RAW (el insumo) y la PESTAÑA entera
  // la escribe un único generador.
  ['f931-sheet.mjs', 'la réplica _F931_RAW — las DDJJ F931 leídas de los PDF del data room', ['_F931_RAW']],
  ['cargas-sociales-pestana.mjs', 'Cargas Sociales — la pestaña entera: declarado, pagado, proyección, caja, SAC y planes', ['Cargas Sociales']],
  ['cobranzas-control.mjs', 'Cobranzas — detector de duplicados', []],
  ['cheques-cobertura-sheet.mjs', 'Cash Flow Mensual — qué cheques y tarjeta faltan cargar en Compras', []],
  // EL REGISTRO DECLARA LA PESTAÑA QUE ESCRIBE, SIEMPRE. Estos tres pasos la dejaban en blanco, así
  // que el censo de dueños las daba por HUÉRFANAS aunque un agente las mantenía todos los días. Un
  // registro incompleto es peor que no tenerlo: contesta que no hay dueño cuando sí lo hay.
  ['tarjeta-control.mjs', 'Tarjeta de Credito — el cruce contra el resumen del banco y la disponibilidad que ve CAJA', ['Tarjeta de Credito']],
  // RESUMEN va DESPUÉS de proveedores, cheques, jornales y tarjeta: es un tablero que apunta con
  // fórmula a los totales de esas cuatro pestañas, así que necesita que ya existan. Reemplazó dos
  // tablas dinámicas nativas huérfanas que duplicaban Proveedores y que ningún agente mantenía.
  // ═══ RESUMEN: LA BORRÓ EL DUEÑO Y SE RESPETA (23/07) ═══
  //
  // El censo de dueños la reportó como "declarada por un paso pero NO EXISTE en el archivo": el
  // dueño eliminó la pestaña y el agente venía fallando cada dos horas intentando reescribirla.
  // La regla es clara —"si yo decido una eliminación, revisar antes de cambiar algo y respetarla"—
  // así que el paso se retira. El script sigue en el repo por si se decide volver a tenerla.
  //   ['resumen-pestana.mjs', 'RESUMEN — el tablero "LO QUE VIENE A PAGAR"', ['RESUMEN']],
  // ANTES del tablero: sincronizar el DEBITADO de los echeq contra el banco (fuente única). El banco
  // sabe si un echeq ya se pagó o sigue vivo; la marca a mano se atrasa (tenía el 305 en "No" cuando
  // ya estaba pagado, inflando el outstanding). Idempotente.
  // SINCRONIZA UNA COLUMNA, NO ESCRIBE LA PESTAÑA. Declararla lo hacía figurar como segundo dueño de
  // Cheques Emitidos —y "varios dueños" es justo el defecto que se está persiguiendo—. El dueño del
  // layout es uno solo: el tablero.
  ['cheques-emitidos-sync-banco.mjs', 'Cheques Emitidos — DEBITADO de los echeq sincronizado con el banco', []],
  // Registro de cheques emitidos al estándar minimalista/clase mundial: titular de outstanding (no
  // debitados) + piel de statement. Formato PROPIO — el formateador general la saltea, así que se
  // re-aplica sola en cada corrida del macro sin que nada la pise.
// FALTABA EN EL REGISTRO Y POR ESO NO CORRÍA EN EL AGENTE. La pestaña existía, tenía su generador y
  // su fuente (la pantalla eCHEQ del Santander), pero nadie la ejecutaba: se actualizaba sólo cuando
  // alguien corría el script a mano. Es la forma más silenciosa de que una pestaña envejezca.
  ['cheques-recibidos-pestana.mjs', 'Cheques Recibidos — el registro de operaciones eCHEQ recibidas', ['Cheques Recibidos']],
  ['cheques-emitidos-tablero.mjs', 'Cheques Emitidos — outstanding no debitado + piel de statement', ['Cheques Emitidos']],
  // Va última: ubica las líneas del Cash Flow por rótulo, así que necesita el cuadro ya escrito.
  // 'Caja' con minúsculas era el nombre viejo de la pestaña: quedó declarado y el censo lo reportaba
  // como una pestaña fantasma. Un nombre que sobrevive a su renombre apunta al vacío para siempre.
  ['caja-pestana.mjs', 'CAJA — disponibilidades, cheques emitidos y margen de tarjeta', ['CAJA']],
  // El núcleo Postgres, para que la web y el chat vean lo mismo que la planilla y no un mes atrás.
  // ÚLTIMO ANTES DEL NÚCLEO: unificar el formato de las catorce pestañas. Va al final porque cada
  // script anterior acaba de reescribir la suya, y una pasada de formato hecha antes se pierde.
  ['formato-pestanas.mjs', 'unificar tipografía, barra de título y filas congeladas en las 14 pestañas', []],
  // DESPUÉS de unificar el formato: el control de CÓMO SE VE. No arregla nada —arreglar cada
  // defecto es trabajo de la pestaña que lo produce— pero deja el número a la vista en cada corrida.
  // Sin él, la única forma de enterarse de un "30/12/99" repetido 22 veces era que el dueño lo viera.
  // ANTES de auditar: devolverle su formato a las celdas que quedaron con el de la columna. Es
  // reparación por CONTENIDO —si adentro hay una frase, no es un importe— y por eso no se
  // desincroniza cuando un bloque crece una fila, que es lo que pasa con los formatos por coordenada.
  ['reparar-pantalla.mjs', 'devolver su formato a las celdas que quedaron con el de la columna', []],
  // LA REGLA DE ORO, MEDIDA EN CADA CORRIDA. Cuenta cuántos números de cada pestaña calculada están
  // PEGADOS en vez de ser fórmula o celda derramada. Sin este censo, la única forma de enterarse era
  // que el dueño abriera una celda y mirara la barra de fórmulas — que es exactamente lo que pasó.
  ['censo-numeros-pegados.mjs', 'regla de oro: cuántos números están pegados en vez de calculados', []],
  // ÚLTIMO ENTRE LOS QUE ESCRIBEN: cada script pone los anchos que declara, así que ensanchar antes
  // de que corran no sirve de nada. Lo que este paso arregla es lo que ningún script dueño puede
  // saber solo: si el texto que le tocó a esta corrida entra o no.
  ['reparar-textos.mjs', 'Que todo texto se pueda leer entero (ensancha o manda a nota)', []],
  // 2ª pasada de clase mundial: una regla condicional por pestaña calculada que pinta en rojo toda
  // celda con error. Un modelo roto grita en la pantalla en vez de esperar al auditor.
  ['formato-condicional.mjs', 'formato condicional "error en rojo" en las pestañas calculadas', []],
  ['auditar-pantalla.mjs', 'control de defectos de pantalla en las 14 pestañas', []],
  ['sync-compras.mjs', 'núcleo: Compras → costos_obra', []],
  ['sync-caja-nucleo.mjs', 'núcleo: quincenas de jornales e instrumentos de pago', []],
]
