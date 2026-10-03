# Pasos de revelado: bloque `steps` en la Vista, azucar sobre `visibility`

Una Vista puede declarar un bloque `steps` con Pasos ordenados. Es acumulativo: cada `step` agrega con `show` lo que se revela (y `hide` opcional lo oculta); lo anterior sigue visible. Nombrar un Nodo revela solo ese Nodo; un Grupo se revela con selector explicito (`a.b.*`). Una Arista se revela sola cuando ambos extremos son visibles, salvo que un paso posterior la nombre (`edge a -> b`) para revelarla despues. Se descarta anotar `#step` en cada elemento: ensucia el Modelo con presentacion y esconde el orden.

```
view overview {
  include rinthel.**
  steps {
    step "Entrada" { show rinthel.api }
    step "Auth"    { show rinthel.api.auth, rinthel.api.auth -> rinthel.db }
  }
}
```

## Consecuencias

- El layout de ELK se calcula una vez con todos los elementos de la Vista; los pasos solo cambian visibilidad, nunca geometria. No hay relayout por paso ni saltos de posicion; el costo es espacio vacio reservado en los primeros pasos.
- Una funcion pura `revealAt(view, position: number)` convierte un paso en el `visibility(id)` del contrato de render (ADR 0003): entero da 0/1 (slides), fraccion interpola con fundido (video). Los consumidores no reimplementan la logica.
- Sin `steps`, todo esta revelado. Un Grupo colapsado cuenta como visible si algun hijo esta revelado.
- El shell ofrece anterior/siguiente; el paso actual vive en el hash de URL, como el drill-down.
- Los codigos de error de validacion cubren pasos con ids o selectores inexistentes.
