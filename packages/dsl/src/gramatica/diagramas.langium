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
    themes+=Theme |
    parts+=PartDecl
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

// `<origen> ["card"] -> ["card"] <destino> ["etiqueta"]`; los extremos son ids cualificados.
// Los espacios alrededor de `->` son obligatorios: `-` es valido dentro de un Id.
Edge:
  from=Endpoint (fromCardinality=String)? '->' (toCardinality=String)? to=Endpoint (label=String)?
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
// Un solo padre; el hex solo vive aqui (ADR 0002).
Theme:
  'theme' name=Id ('extends' parent=Id)? '{'
    parts+=ThemePart*
  '}'
;

ThemePart:
  ThemePalette | ThemeFonts | ThemeTokens | ThemeNode | ThemeEdge;

ThemePalette:
  'palette' '{' entries+=ThemeEntry* '}';

ThemeFonts:
  'fonts' '{' entries+=ThemeEntry* '}';

ThemeTokens:
  'tokens' '{' entries+=ThemeEntry* '}';

ThemeEntry:
  key=Id ':'? value=EntryValue;

// Cadena (`"#00f"`, `"16px"`) o numero (los `tokens` numericos: `gap 8`).
EntryValue returns string:
  String | Num;

Num returns string:
  DIGITS ('.' DIGITS)?;

// `node { layer fondo solid { color azul }  slots { title attrs }  type servicio { ... }  state hover { ... } }`
// Bloque de dibujo del Nodo (ADR 0008): una pila de Capas, de abajo hacia arriba, los
// Slots que se pintan, en orden, y parches por Tipo de nodo (`type`) y por estado (`state`).
ThemeNode:
  'node' '{' items+=NodeItem* '}';

NodeItem:
  ThemeLayer | ThemeSlots | ThemeUse | ThemeType | ThemeState | ThemeTransition | ThemeEnter | ThemeExit | ThemeStagger;

ThemeType:
  'type' name=Id '{' items+=PatchItem* '}';

// Los parches de estado no pueden tocar las Metricas; `slots` se acepta aqui solo para
// que el catalogo lo rechace con un error claro (E_THEME_STATE_TOUCHES_METRICS).
ThemeState:
  'state' name=Id '{' items+=StateItem* '}';

PatchItem:
  ThemeLayer | ThemeUse;

StateItem:
  ThemeLayer | ThemeUse | ThemeSlots | ThemeTransition;

// `part <nombre> { layer ... }`: parche reutilizable sin Tema, que se incluye con `use` (nombre unico en el Workspace).
PartDecl:
  'part' name=Id '{' items+=PatchItem* '}';

ThemeUse:
  'use' name=Id;

// Un solo verbo de Capa (ADR 0008). `layer <nombre> [<primitiva>] [before|after <otra>] [over] [{ props }]`
// define, cambia o anade segun exista o no en el nivel de abajo; `layer <nombre> none` la quita.
// La primitiva es un identificador plano (nunca una palabra clave) para no confundirla con `over`/`none`.
ThemeLayer:
  'layer' name=Id (remove?='none' | (primitive=IdTerminal)? (placement=('before' | 'after') target=Id)? (over?='over')? ('{' (animations+=LayerAnimation | props+=LayerProp)* '}')?);

// Animacion declarativa (ADR 0008). Dentro de una Capa: `motion pulso 1.2s ease-in-out intensity 0.4`,
// `motion none` (quita el heredado) o `keyframes opacity 2s { 0 1  50 0.4  100 1 }`. En el bloque `node`:
// `transition 120ms ease-out`, `enter fundido 300ms`, `exit escala 200ms`, `stagger 60ms`; `transition`
// tambien dentro de un `state`. Los parametros son palabras cerradas (no colisionan con las propiedades).
LayerAnimation:
  ThemeMotion | ThemeKeyframes;

ThemeMotion:
  'motion' (remove?='none' | name=IdTerminal params+=AnimParam*);

ThemeKeyframes:
  'keyframes' property=IdTerminal params+=AnimParam* '{' steps+=KeyframeStep* '}';

KeyframeStep:
  at=Num value=SignedNum;

ThemeTransition:
  'transition' params+=AnimParam*;

ThemeEnter:
  'enter' effect=IdTerminal params+=AnimParam*;

ThemeExit:
  'exit' effect=IdTerminal params+=AnimParam*;

ThemeStagger:
  'stagger' amount=Duracion;

AnimParam:
  duration=Duracion | 'delay' delay=Duracion | 'intensity' intensity=Num | 'reduced' reduced=IdTerminal | easing=Easing;

// Numero seguido de su unidad (`ms` o `s`); la unidad se valida al compilar.
Duracion:
  amount=Num unit=IdTerminal;

Easing returns string:
  'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out';

SignedNum returns string:
  '-'? DIGITS ('.' DIGITS)?;

LayerProp:
  key=Id value=LayerValue;

// Numero, `$token`, nombre de Paleta, `nombre/alfa` o `mix(a, b, t)`; el catalogo de `tema` lo interpreta.
LayerValue returns string:
  MixValue | LayerAtom ('/' Num)?;

LayerAtom returns string:
  String | Id | TokenRef | Num;

MixValue returns string:
  'mix' '(' Id ',' Id ',' Num ')';

// Cada Slot puede llevar su estilo de texto: `slots { title { weight 600 color ink }  attrs }`.
ThemeSlots:
  'slots' '{' entries+=SlotEntry* '}';

SlotEntry:
  name=Id ('{' props+=LayerProp* '}')?;

// `edge { layer glow line { color ORIGEN/0.3 width 6 }  start dot  end arrow { size 10 }  label { pad 6 fill paper } }`
// Bloque de dibujo de la Arista (ADR 0008): pila de trazos, marcadores de extremo y etiqueta con modelo de caja.
ThemeEdge:
  'edge' '{' items+=EdgeItem* '}';

EdgeItem:
  ThemeLayer | ThemeUse | ThemeMarker | ThemeLabel;

// `start|end <marcador> [{ props }]` o `start|end none`.
ThemeMarker:
  side=('start' | 'end') (remove?='none' | kind=IdTerminal ('{' props+=LayerProp* '}')?);

ThemeLabel:
  'label' '{' props+=LayerProp* '}';

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
  'depth' value=Natural;

ViewTheme:
  'theme' value=Id ('{' items+=PatchItem* '}')?;

// Drill-down: mecanismo por defecto, estado inicial de Grupos y enlaces a otra Vista.
ViewDrill:
  'drill' mode='collapse';

ViewCollapsed:
  'collapsed' targets+=Ref (',' targets+=Ref)*;

ViewExpanded:
  'expanded' targets+=Ref (',' targets+=Ref)*;

ViewLink:
  'link' node=Ref '->' view=Id;

// Pasos de revelado (ADR 0002): acumulativos; `show` revela y `hide` oculta.
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
// `order N` se compila y se guarda, pero en v1 nada lo usa (ADR 0003: sin considerModelOrder);
// `color` es un nombre de Paleta.
NodeOverride:
  'node' node=Ref '{' props+=OverrideProperty* '}';

OverrideProperty:
  OverrideLabel | OverridePin | OverrideOrder | OverrideColor;

OverrideLabel:
  'label' value=String;

OverridePin:
  'pin' x=Coordinate ',' y=Coordinate;

Natural returns number:
  DIGITS;

Coordinate returns number:
  '-'? DIGITS;

OverrideOrder:
  'order' value=Natural;

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
  'layer' | 'slots' | 'state' | 'part' | 'use' | 'before' | 'after' | 'over' | 'none' | 'mix' |
  'motion' | 'keyframes' | 'transition' | 'enter' | 'exit' | 'stagger' | 'delay' | 'intensity' | 'reduced' |
  'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' |
  'drill' | 'collapse' | 'collapsed' | 'expanded' | 'link' |
  'steps' | 'step' | 'show' | 'hide' | 'edge' | 'start' | 'end' |
  'model' | 'node' | 'specification';

// -------------------------
// Comments
hidden terminal BLOCK_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal LINE_COMMENT: /\/\/[^\n\r]*/;
hidden terminal WS: /[\t ]+/;
hidden terminal NL: /[\r\n]+/;

// -----------------------------------
// Terminals
terminal String: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/;
// Texto, no numero, y no se llama INT (Langium convertiria a numero por nombre): `Num` concatena sus digitos y un numero perderia los ceros a la izquierda (0.05 -> 0.5).
terminal DIGITS: /[0-9]+/;
terminal TokenRef: /\$[a-zA-Z_][-\w]*/;
terminal IdTerminal:  /([a-zA-Z]|_+[a-zA-Z0-9])[-\w]*/;
