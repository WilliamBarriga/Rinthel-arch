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
    models+=Model |
    views+=View |
    themes+=Theme
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
    (elements+=Element | edges+=Edge | extensions+=Extend)*
  '}'
;

// `<origen> ["card"] -> ["card"] <destino>`; los extremos son ids cualificados.
// Los espacios alrededor de `->` son obligatorios: `-` es valido dentro de un Id.
Edge:
  from=Endpoint (fromCardinality=String)? '->' (toCardinality=String)? to=Endpoint
;

// Nodo por id cualificado (`a.b.c`) y, opcional, uno de sus Atributos (`a.b#col`).
Endpoint:
  node=Ref ('#' attribute=Id)?
;

Ref returns string:
  Id ('.' Id)*;

// `extend <nodo> { ... }`: anade hijos, Atributos y source a un Nodo declarado en
// otro archivo (o en otro bloque `model`).
Extend:
  'extend' target=Ref '{'
    (elements+=Element | attrs+=Attrs | sources+=Source)*
  '}'
;

// Theme -------------------------------------

// `theme <nombre> [extends <padre>] { palette { azul "#00f" } fonts { ... } tokens { ... } }`
// Un solo padre; el hex solo vive aqui (ADR 0006).
Theme:
  'theme' name=Id ('extends' parent=Id)? '{'
    parts+=ThemePart*
  '}'
;

ThemePart:
  ThemePalette | ThemeFonts | ThemeTokens;

ThemePalette:
  'palette' '{' entries+=ThemeEntry* '}';

ThemeFonts:
  'fonts' '{' entries+=ThemeEntry* '}';

ThemeTokens:
  'tokens' '{' entries+=ThemeEntry* '}';

ThemeEntry:
  key=Id ':'? value=String;

// View -------------------------------------

// `view <id> { type architecture|flow  include a.*, b.**  exclude c  depth N }`.
// Una Vista solo selecciona Nodos del Modelo; nunca declara entidades.
View:
  'view' name=Id '{'
    props+=ViewProperty*
  '}'
;

ViewProperty:
  ViewType | ViewInclude | ViewExclude | ViewDepth | ViewTheme | ViewDrill | ViewCollapsed | ViewExpanded | ViewLink | ViewSteps | NodeOverride;

ViewType:
  'type' value=Id;

ViewInclude:
  'include' selectors+=Selector (',' selectors+=Selector)*;

ViewExclude:
  'exclude' selectors+=Selector (',' selectors+=Selector)*;

ViewDepth:
  'depth' value=INT;

ViewTheme:
  'theme' value=Id;

// Drill-down: mecanismo por defecto, estado inicial de Grupos y enlaces a otra Vista.
ViewDrill:
  'drill' mode='collapse';

ViewCollapsed:
  'collapsed' targets+=Ref (',' targets+=Ref)*;

ViewExpanded:
  'expanded' targets+=Ref (',' targets+=Ref)*;

ViewLink:
  'link' node=Ref '->' view=Id;

// Pasos de revelado (ADR 0007): acumulativos; `show` revela y `hide` oculta.
// Un item es un selector de Nodos (`a`, `a.*`, `a.**`) o una Arista (`edge a -> b`, o `a -> b`).
// En un Paso, `a.*` y `a.**` abarcan tambien al propio Grupo `a` (revelar un Grupo completo).
ViewSteps:
  'steps' '{' steps+=Step* '}';

Step:
  'step' title=String '{' actions+=StepAction* '}';

StepAction:
  StepShow | StepHide;

StepShow:
  'show' items+=StepItem (',' items+=StepItem)*;

StepHide:
  'hide' items+=StepItem (',' items+=StepItem)*;

StepItem:
  StepEdge | StepSelector;

StepEdge:
  'edge'? from=Ref '->' to=Ref;

StepSelector:
  selector=Selector;

// Overrides de presentacion de un Nodo en esta Vista; nunca tocan el Modelo.
// `pin x,y` es la posicion relativa al Grupo padre (al lienzo si es raiz), aplicada tras el layout;
// `order N` se compila y se guarda, pero en v1 nada lo usa (ADR 0004: sin considerModelOrder);
// `color` es un nombre de Paleta.
NodeOverride:
  'node' node=Ref '{' props+=OverrideProperty* '}';

OverrideProperty:
  OverrideLabel | OverridePin | OverrideOrder | OverrideColor;

OverrideLabel:
  'label' value=String;

OverridePin:
  'pin' x=Coordinate ',' y=Coordinate;

Coordinate returns number:
  '-'? INT;

OverrideOrder:
  'order' value=INT;

OverrideColor:
  'color' value=PropertyValue;

// `a.b` un Nodo, `a.*` sus hijos directos, `a.**` sus descendientes, `*` y `**` a secas.
Selector returns string:
  Ref ('.' Wildcard)? | Wildcard;

Wildcard returns string:
  '*' | '**';

// `<tipo> <nombre> "titulo" "descripcion" { hijos }`
Element:
  type=Id name=Id
  (title=String
    (description=String)?
  )?
  ('{'
    (elements+=Element | attrs+=Attrs | sources+=Source)*
  '}')?
;

// `attrs { nombre: tipo "notas" }`; el orden se conserva.
Attrs:
  'attrs' '{' items+=Attribute* '}'
;

// `source { kind "ref" ... }`: referencias opacas; el `ref` siempre es cadena.
Source:
  'source' '{' items+=SourceItem* '}'
;

SourceItem:
  kind=Id ref=String
;

Attribute:
  name=Id ':' type=Id (notes=String)?
;

Id returns string:
  IdTerminal |
  'description' | 'icon' | 'style' | 'color' | 'attrs' | 'source' | 'view' | 'type' | 'include' | 'exclude' | 'depth' | 'label' | 'pin' | 'order' |
  'theme' | 'extends' | 'palette' | 'fonts' | 'tokens' |
  'drill' | 'collapse' | 'collapsed' | 'expanded' | 'link' |
  'steps' | 'step' | 'show' | 'hide' | 'edge';

// -------------------------
// Comments
hidden terminal BLOCK_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal LINE_COMMENT: /\/\/[^\n\r]*/;
hidden terminal WS: /[\t ]+/;
hidden terminal NL: /[\r\n]+/;

// -----------------------------------
// Terminals
terminal String: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/;
terminal INT returns number: /[0-9]+/;
terminal IdTerminal:  /([a-zA-Z]|_+[a-zA-Z0-9])[-\w]*/;
