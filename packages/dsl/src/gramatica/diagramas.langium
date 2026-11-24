// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.
//
// Derivado de packages/language-server/src/like-c4.langium de LikeC4
// (https://github.com/likec4/likec4, MIT; ver LICENSE-LIKEC4 en este paquete).
// Copia recortada y adaptada (ADR 0001).

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
    (interactions+=Interaction | elements+=Element | edges+=Edge | extensions+=Extend)*
  '}'
;

// `interaction <id> ["Titulo"] ["Descripcion"] { mensajes }`. Su id vive en un espacio de nombres propio;
// `interaction` sigue valiendo como id de Nodo.
Interaction:
  'interaction' name=Id (title=String (description=String)?)? '{'
    items+=InteractionItem*
  '}'
;

InteractionItem:
  Fragment | Note | InteractionRef | Message;

// `note left of X "t"`, `note right of X "t"`, `note over X[, Y] "t"`.
Note:
  'note' (anchor=('left' | 'right') 'of' targets+=Ref | anchor='over' targets+=Ref (',' targets+=Ref)*) text=String
;

// `ref <interaccion>`: los ciclos son validos; no se expande.
InteractionRef:
  'ref' interaction=Id
;

// `opt|loop|break|critical ["guarda"] { }`, `alt ["guarda"] { } else ["guarda"] { }`, `par { } and { }`.
// El parser acepta cualquier operador con `else`/`and` en cualquier cantidad; `canonico` emite
// `invalid-fragment-operand`, no `syntax-error`.
Fragment:
  operator=('opt' | 'loop' | 'break' | 'critical' | 'alt' | 'par') operands+=FirstOperand operands+=NextOperand*
;

FirstOperand:
  (guard=String)? '{' items+=InteractionItem* '}'
;

NextOperand:
  separator=('else' | 'and') (guard=String)? '{' items+=InteractionItem* '}'
;

// `[id:] [async|reply|create|destroy] origen -> destino ["etiqueta"] ["descripcion"]`; `origen == destino` es un Mensaje propio.
// `async`, `reply`, `create` y `destroy` tambien valen como id de Nodo (`reply -> otro`).
Message:
  (alias=Id ':')? (kind=('async' | 'reply' | 'create' | 'destroy'))? from=Ref '->' to=Ref (label=String (description=String)?)?
;

// `<origen> ["card"] -> ["card"] <destino> ["etiqueta"]`; los extremos son ids cualificados.
// Los espacios alrededor de `->` son obligatorios: `-` es valido dentro de un Id.
// ER: la palabra final `identifying` marca la relacion como identificante.
Edge:
  from=Endpoint (fromCardinality=String)? '->' (toCardinality=String)? to=Endpoint (label=String)? (identifying?='identifying')?
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
    (elements+=Element | attrs+=Attrs | attributes+=Attribute | sources+=Source)*
  '}'
;

// Theme -------------------------------------

// `theme <nombre> [extends <padre>] { palette { azul "#00f" } fonts { ... } tokens { ... } }`
// Un solo padre; el hex solo vive aqui.
Theme:
  'theme' name=Id ('extends' parent=Id)? '{'
    parts+=ThemePart*
  '}'
;

ThemePart:
  ThemePalette | ThemeFonts | ThemeTokens | ThemeNode | ThemeGroup | ThemeEdge | ThemePage | ThemeRow | ThemeSequence;

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
// Capas de abajo hacia arriba, Slots en orden y parches por Tipo de nodo (`type`) y por estado (`state`).
ThemeNode:
  'node' '{' items+=NodeItem* '}';

NodeItem:
  ThemeLayer | ThemeSlots | ThemeUse | ThemeType | ThemeState | ThemeDiagram | ThemeTransition | ThemeEnter | ThemeExit | ThemeStagger;

// `group { layer caja rect { radius 16 }  slots row gap 6 { icon title }  padding 8 16 16  type ...  state collapsed { ... } }`
// Lo mismo que `node` mas el `padding` de la zona de hijos (1, 2 o 4 valores como en CSS). `state collapsed`
// es el Grupo cerrado, que se comporta como un Nodo hoja (puede cambiar `slots` y la caja).
ThemeGroup:
  'group' '{' items+=GroupItem* '}';

GroupItem:
  NodeItem | GroupPadding;

GroupPadding:
  'padding' values+=Num+;

// `diagram flow { ... }`: parche por Tipo de diagrama dentro de `node`, `group` o `edge`, entre el Tema base y el
// Tipo de nodo. Puede cambiar las Metricas. El nombre se valida al compilar.
ThemeDiagram:
  'diagram' name=Id '{' items+=DiagramItem* '}';

DiagramItem:
  ThemeLayer | ThemeUse | ThemeSlots | GroupPadding | ThemeMarker | ThemeLabel;

ThemeType:
  'type' name=Id '{' items+=PatchItem* '}';

// Los parches de estado no pueden tocar las Metricas; `slots` se acepta aqui solo para
// que el catalogo lo rechace con un error claro (theme-state-touches-metrics).
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

// `layer <nombre> [<primitiva>] [before|after <otra>] [over] [{ props }]`
// define, cambia o anade segun exista o no en el nivel de abajo; `layer <nombre> none` la quita.
// La primitiva es un identificador plano (nunca una palabra clave) para no confundirla con `over`/`none`.
ThemeLayer:
  'layer' name=Id (remove?='none' | (primitive=IdTerminal)? (placement=('before' | 'after') target=Id)? (over?='over')? ('{' (animations+=LayerAnimation | props+=LayerProp)* '}')?);

// En una Capa: `motion pulso 1.2s ease-in-out intensity 0.4`, `motion none` (quita el heredado) o
// `keyframes opacity 2s { 0 1  50 0.4  100 1 }`. En `node`: `transition`, `enter`, `exit`, `stagger`;
// `transition` tambien en un `state`. Los parametros son palabras cerradas (no colisionan con las propiedades).
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

// `offset x y` lleva dos valores (`second`); cualquier otra clave con segundo valor es un error al compilar.
LayerProp:
  key=Id value=LayerValue (second=SignedNum)?;

// Numero, `$token`, nombre de Paleta, `nombre/alfa` o `mix(a, b, t)`; el catalogo de `tema` lo interpreta.
LayerValue returns string:
  MixValue | LayerAtom ('/' Num)?;

LayerAtom returns string:
  String | Id | TokenRef | SignedNum;

MixValue returns string:
  'mix' '(' Id ',' Id ',' Num ')';

// `slots [row|column] [gap N] [pad N] [align A] { hijos }`; sin direccion es una columna. Un hijo es un Slot
// (con su estilo entre llaves) o una caja anidada `row`/`column`.
ThemeSlots:
  'slots' direction=SlotDirection? props+=LayerProp* '{' children+=SlotChild* '}';

SlotDirection returns string:
  'row' | 'column';

SlotChild:
  SlotBox | SlotEntry;

SlotBox:
  direction=SlotDirection props+=LayerProp* '{' children+=SlotChild* '}';

SlotEntry:
  name=Id ('{' props+=LayerProp* '}')?;

// `edge { layer glow line { color ORIGEN/0.3 width 6 }  start dot  end arrow { size 10 }  label { pad 6 fill paper } }`
// Pila de trazos, marcadores de extremo y etiqueta con modelo de caja.
ThemeEdge:
  'edge' '{' items+=EdgeItem* '}';

EdgeItem:
  ThemeLayer | ThemeUse | ThemeMarker | ThemeLabel | ThemeDiagram | EdgeIdentifying;

// `identifying { ... }`: parche del trazo de las Aristas identificantes de una Vista ER.
EdgeIdentifying:
  'identifying' '{' items+=PatchItem* '}';

// `start|end <marcador> [{ props }]` o `start|end none`.
ThemeMarker:
  side=('start' | 'end') (remove?='none' | kind=IdTerminal ('{' props+=LayerProp* '}')?);

ThemeLabel:
  'label' '{' props+=LayerProp* '}';

// `row { layer fondo solid { color papel }  height 28  alternate { layer fondo { color gris } }  name { weight 600 }
//   key { fill azul }  key pk { layer fondo { color verde } }  optional { layer fondo { color gris } } }`
// Fila de una tabla ER: `alternate` parchea las filas impares; `key pk|fk|uk` y `optional` parchean por marca de
// clave y por Atributo opcional. Solo pinta, salvo `height`.
ThemeRow:
  'row' '{' items+=RowItem* '}';

RowItem:
  ThemeLayer | ThemeUse | RowHeight | RowKeyPatch | RowOptional | RowAlternate | RowState | RowText;

RowHeight:
  'height' value=Num;

RowKeyPatch:
  'key' name=Id '{' items+=PatchItem* '}';

RowOptional:
  'optional' '{' items+=PatchItem* '}';

RowAlternate:
  'alternate' '{' items+=PatchItem* '}';

// Solo pinta, como los estados de `node`.
RowState:
  'state' name=Id '{' items+=PatchItem* '}';

// El nombre del texto (`name`, `type`, `key`) se valida al compilar.
RowText:
  slot=Id '{' props+=LayerProp* '}';

// `message { layer linea line { color tinta }  end arrow { size 9 }  gap 36  kind reply { layer linea { style dashed } } }`
// Elementos de secuencia. Parches por variante: `kind <tipo>` en message, `op <operador>` en fragment. Que admite
// cada uno lo valida el catalogo de `tema`; los nombres de estilo, Metrica y variante se validan al compilar.
ThemeSequence:
  element=('lifeline' | 'activation' | 'message' | 'fragment' | 'note') '{' items+=SequenceItem* '}';

SequenceItem:
  ThemeLayer | ThemeUse | ThemeMarker | ThemeState | SequencePatch | SequenceMetric | SequenceText;

SequencePatch:
  word=('kind' | 'op') name=Id '{' items+=SequencePatchItem* '}';

SequencePatchItem:
  ThemeLayer | ThemeUse | ThemeMarker;

SequenceMetric:
  key=Id value=SignedNum;

SequenceText:
  slot=Id '{' props+=LayerProp* '}';

// `page { layer fondo solid { color paper }  layer puntos dots { color ink/0.1 size 22 }  fixed }`
// Fondo de pagina, bajo Grupos, Aristas y Nodos. Sin `fixed` el patron se mueve y escala con el pan/zoom; con `fixed` queda fijo al visor.
ThemePage:
  'page' '{' items+=PageItem* '}';

PageItem:
  ThemeLayer | ThemeUse | PageFixed;

PageFixed:
  fixed?='fixed';

// View -------------------------------------

// `view <id> { type architecture|flow  include a.*, b.**  exclude c  depth N }`.
// Una Vista solo selecciona Nodos del Modelo; nunca declara entidades.
View:
  'view' name=Id '{'
    props+=ViewProperty*
  '}'
;

ViewProperty:
  ViewType | ViewInclude | ViewExclude | ViewDepth | ViewTheme | ViewDrill | ViewCollapsed | ViewExpanded | ViewLink | ViewSteps | ViewInteraction | ViewOrder | ViewAutonumber | NodeOverride;

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

// Vista de secuencia: la Interaccion que proyecta y el orden (parcial) de sus Lifelines.
ViewInteraction:
  'interaction' value=Id;

ViewOrder:
  'order' targets+=Ref (',' targets+=Ref)*;

// Numera los Mensajes proyectados por la Vista de secuencia.
ViewAutonumber:
  {infer ViewAutonumber} 'autonumber';

// Pasos de revelado acumulativos; `show` revela y `hide` oculta.
// Un item es un selector de Nodos (`a`, `a.*`, `a.**`) o una Arista (`edge a -> b`, o `a -> b`).
// En un Paso, `a.*` y `a.**` abarcan tambien al propio Grupo `a` (revelar un Grupo completo).
// `steps each` (solo secuencia): un Paso por Mensaje proyectado.
ViewSteps:
  'steps' (each?='each' | '{' steps+=Step* '}');

Step:
  'step' title=String '{' actions+=StepAction* '}';

StepAction:
  StepShow | StepHide | StepUpto;

// Solo secuencia: el Paso muestra la Interaccion hasta ese Mensaje (por su id), incluido.
StepUpto:
  'upto' target=Ref;

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
// `order N` se compila y se guarda, pero el layout no lo usa;
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
    (elements+=Element | attrs+=Attrs | attributes+=Attribute | sources+=Source)*
  '}')?
;

// `attrs { nombre: tipo "notas" }`; el orden se conserva. Un Atributo tambien puede ir suelto en el cuerpo
// del Nodo (`nombre: tipo`), que es la forma habitual en ER.
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

// ER: `?` pegado al tipo es `optional`; `pk`, `fk` y `uk` (en cualquier orden) son las marcas de clave.
Attribute:
  name=Id ':' type=Id (optional?='?')? (keys+=KeyMark)* (notes=String)?
;

KeyMark returns string:
  'pk' | 'fk' | 'uk';

Id returns string:
  IdTerminal |
  'description' | 'icon' | 'style' | 'color' | 'attrs' | 'source' | 'view' | 'type' | 'include' | 'exclude' | 'depth' | 'label' | 'pin' | 'order' |
  'theme' | 'extends' | 'palette' | 'fonts' | 'tokens' |
  'layer' | 'slots' | 'row' | 'column' | 'state' | 'part' | 'use' | 'before' | 'after' | 'over' | 'none' | 'mix' |
  'motion' | 'keyframes' | 'transition' | 'enter' | 'exit' | 'stagger' | 'delay' | 'intensity' | 'reduced' |
  'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' |
  'drill' | 'collapse' | 'collapsed' | 'expanded' | 'link' |
  'steps' | 'step' | 'show' | 'hide' | 'edge' | 'start' | 'end' | 'page' | 'fixed' | 'group' | 'padding' | 'diagram' |
  'model' | 'node' | 'specification' | 'interaction' | 'autonumber' | 'async' | 'reply' | 'create' | 'destroy' |
  'opt' | 'loop' | 'break' | 'critical' | 'alt' | 'par' | 'else' | 'and' | 'note' | 'left' | 'right' | 'of' | 'ref' |
  'upto' | 'each' | 'pk' | 'fk' | 'uk' | 'identifying' | 'height' | 'key' | 'optional' | 'alternate' |
  'lifeline' | 'activation' | 'message' | 'fragment' | 'kind' | 'op';

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
