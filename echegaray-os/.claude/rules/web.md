---
paths:
  - "src/**/*.tsx"
  - "src/app/**"
---

# Pantallas

No hay usuarios externos: no hay checkout, ni landing de conversión, ni onboarding. Los usuarios son
el dueño, jefes de obra y administración. Una pantalla existe para que alguien decida o cargue algo,
no para mostrar.

## Antes de agregar una vista

- ¿Qué decisión cambia si este número cambia? Sin respuesta, no es prioritario.
- El dato sale de la **fuente única** en Postgres, no de una consulta propia. La web ya mostró obras
  legacy pausadas mientras el chat mostraba las activas: dos verdades para el mismo concepto.

## Verificación

Una pantalla no se da por buena por compilar. Se mira: el agente `qa-visual` la recorre con un
navegador real, autenticado y por rol. Un test de tipos no ve un layout roto.

Y **verificar autenticado, no anónimo**: la vista anónima puede devolver 200 con cero filas mientras
la autenticada tira 500.
