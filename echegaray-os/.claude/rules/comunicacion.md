---
paths:
  - "orquestador/comunicacion/**"
---

# El bot @os y el chat

## Lo que hay que saber antes de tocar el ruteo

- **Las capacidades salen de un registro, no de una lista escrita a mano.**
  `registro-especialistas.mjs` barre `especialistas/*.mjs`. Para que algo aparezca en "qué sabés
  hacer" se agrega un archivo, no se edita un texto.
- **Un área con especialistas debe resolver a exactamente uno preferido.** Declarar
  `preferidoDeArea: false` en el único de su área deja el canal sin dueño; hay tests que lo cazan.
- **El voseo rompe las listas de verbos.** "fijate", "revisá", "mirá", "agregá" no matchean ningún
  infinitivo: se buscan **raíces**.
- **Las detecciones de LECTURA secuestran las de ACCIÓN.** Toda detección read-only tiene que llevar
  su negación de intención de escritura, o "escribime esto en el documento" se contesta leyendo.

## Costo

Llegar por canal no puede disparar el trabajo caro. Un especialista que releva el mercado tarda
minutos y gasta API: se dispara con un pedido explícito, no porque alguien escribió en su canal.

## Callbacks de Mattermost

Las acciones interactivas **no traen token de identidad**. El secreto viaja en la query de la URL
de integración, que Mattermost no le muestra al cliente.
