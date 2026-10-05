// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.
//
// Derivado de packages/language-server/src/like-c4.langium de LikeC4
// (https://github.com/likec4/likec4, MIT; ver LICENSE-LIKEC4 en este paquete).
// Copia recortada y adaptada a este repo (ADR 0001): se omiten `deployment`,
// vistas dinamicas, temas incrustados, niveles C4 fijos, imports, tags y
// propiedades de estilo; el `kind` del Nodo pasa a ser un Tipo de nodo
// declarado en `specification`.

grammar Diagramas

entry Documento:
  (
    specifications+=Specification |
    models+=Model
  )*
;

// Specification -------------------------------------

Specification:
  name='specification' '{'
    nodeTypes+=NodeTypeDecl*
  '}';

NodeTypeDecl:
  'node' name=Id ('{'
    props+=NodeTypeProperty*
  '}')?;

NodeTypeProperty:
  key=('description' | 'icon' | 'style' | 'color') ':'? value=PropertyValue ';'?;

// Cadena, o un identificador (p. ej. un nombre de Paleta: `color blue`).
PropertyValue returns string:
  String | Id;

// Model -------------------------------------

Model:
  name='model' '{'
    (elements+=Element | edges+=Edge)*
  '}'
;

// `<origen> ["card"] -> ["card"] <destino>`; los extremos son ids cualificados.
// Los espacios alrededor de `->` son obligatorios: `-` es valido dentro de un Id.
Edge:
  from=Ref (fromCardinality=String)? '->' (toCardinality=String)? to=Ref
;

Ref returns string:
  Id ('.' Id)*;

// `<tipo> <nombre> "titulo" "descripcion" { hijos }`
Element:
  type=Id name=Id
  (title=String
    (description=String)?
  )?
  ('{'
    elements+=Element*
  '}')?
;

Id returns string:
  IdTerminal |
  'description' | 'icon' | 'style' | 'color';

// -------------------------
// Comments
hidden terminal BLOCK_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal LINE_COMMENT: /\/\/[^\n\r]*/;
hidden terminal WS: /[\t ]+/;
hidden terminal NL: /[\r\n]+/;

// -----------------------------------
// Terminals
terminal String: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/;
terminal IdTerminal:  /([a-zA-Z]|_+[a-zA-Z0-9])[-\w]*/;
