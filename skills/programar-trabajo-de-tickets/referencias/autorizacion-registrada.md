# La aprobación delegada se registra

La línea del plan es lo que el motor exige para mover el ticket, y el
`valmen gate-decide --id <ID> --receipt <GR-…> --decision approve --actor "<nombre> (delegación, <fecha>)" --reason "<qué quedó en banda y por qué se recomienda>"`
es lo que deja la decisión en el recibo. Sin ese registro el recibo queda con la decisión en
blanco: el registro sigue contando esa compuerta como esperando a una persona —en un ticket ya
cerrado— y el relé de Hermes la vuelve a avisar. El motor no lo exige para avanzar (sólo
`qa-mechanical` bloquea una transición), así que un eslabón que aprueba «en prosa» avanza
igual y deja el hueco: por eso lo pide la plantilla, y por eso el recibo **no se puede
re-decidir** después (responde «ya tiene una decisión humana registrada»): la primera vez es
la que vale.
