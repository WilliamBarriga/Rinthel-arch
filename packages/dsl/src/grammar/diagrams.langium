// SPDX-License-Identifier: MIT
//
// Copyright (c) 2023-2026 Denis Davydkov
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
//
// Portions of this file have been modified by NVIDIA CORPORATION & AFFILIATES.
//
// Derived from packages/language-server/src/like-c4.langium of LikeC4
// (https://github.com/likec4/likec4, MIT; see LICENSE-LIKEC4 in this package).
// Trimmed and adapted copy (ADR 0001).

grammar Diagrams

entry DiagramFile:
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

// String, or an identifier (e.g. a Palette name: `color blue`).
PropertyValue returns string:
  String | Id;

// Model -------------------------------------

Model:
  name='model' '{'
    (interactions+=Interaction | elements+=Element | edges+=Edge | extensions+=Extend)*
  '}'
;

// `interaction <id> ["Title"] ["Description"] [planned] { messages }`. Its id lives in its own namespace;
// `interaction` is still valid as a Node id. `planned` (ADR 0011) marks all its Messages.
Interaction:
  'interaction' name=Id (title=String (description=String)?)? (planned?='planned')? '{'
    items+=InteractionItem*
  '}'
;

InteractionItem:
  Fragment | Note | InteractionRef | Message;

// `note left of X "t"`, `note right of X "t"`, `note over X[, Y] "t"`.
Note:
  'note' (anchor=('left' | 'right') 'of' targets+=Ref | anchor='over' targets+=Ref (',' targets+=Ref)*) text=String
;

// `ref <interaction>`: cycles are valid; it is not expanded.
InteractionRef:
  'ref' interaction=Id
;

// `opt|loop|break|critical ["guard"] { }`, `alt ["guard"] { } else ["guard"] { }`, `par { } and { }`.
// The parser accepts any operator with `else`/`and` in any amount; `canonical` emits
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

// `[id:] [async|reply|create|destroy] source -> target ["label"] ["description"]`; `source == target` is a self Message.
// `async`, `reply`, `create` and `destroy` are also valid as Node ids (`reply -> other`).
Message:
  (alias=Id ':')? (kind=('async' | 'reply' | 'create' | 'destroy'))? from=Ref '->' to=Ref (label=String (description=String)?)?
;

// `<source> ["card"] -> ["card"] <target> ["label"]`; the ends are qualified ids.
// Spaces around `->` are required: `-` is valid inside an Id.
// ER: the final word `identifying` marks the relation as identifying; `planned` (ADR 0011, after `identifying`),
// as a proposal.
Edge:
  from=Endpoint (fromCardinality=String)? '->' (toCardinality=String)? to=Endpoint (label=String)? (identifying?='identifying')? (planned?='planned')?
;

// Node by qualified id (`a.b.c`) and, optionally, one of its Attributes (`a.b#col`).
Endpoint:
  node=Ref ('#' attribute=Id)?
;

Ref returns string:
  Id ('.' Id)*;

// `extend <node> { ... }`: adds children, Attributes and source to a Node declared in
// another file (or in another `model` block).
Extend:
  'extend' target=Ref '{'
    (elements+=Element | attrs+=Attrs | attributes+=Attribute | sources+=Source)*
  '}'
;

// Theme -------------------------------------

// `theme <name> [extends <parent>] { palette { blue "#00f" } fonts { ... } tokens { ... } }`
// A single parent; hex only lives here.
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

// String (`"#00f"`, `"16px"`) or number (numeric `tokens`: `gap 8`).
EntryValue returns string:
  String | Num;

Num returns string:
  DIGITS ('.' DIGITS)?;

// `node { layer background solid { color blue }  slots { title attrs }  type servicio { ... }  state hover { ... } }`
// Layers from bottom to top, Slots in order and patches per Node kind (`type`) and per state (`state`).
ThemeNode:
  'node' '{' items+=NodeItem* '}';

NodeItem:
  ThemeLayer | ThemeSlots | ThemeUse | ThemeType | ThemeState | ThemeDiagram | ThemeTransition | ThemeEnter | ThemeExit | ThemeStagger;

// `group { layer box rect { radius 16 }  slots row gap 6 { icon title }  padding 8 16 16  type ...  state collapsed { ... } }`
// The same as `node` plus the `padding` of the children area (1, 2 or 4 values as in CSS). `state collapsed`
// is the closed Group, which behaves like a leaf Node (it can change `slots` and the box).
ThemeGroup:
  'group' '{' items+=GroupItem* '}';

GroupItem:
  NodeItem | GroupPadding;

GroupPadding:
  'padding' values+=Num+;

// `diagram flow { ... }`: patch per Diagram type inside `node`, `group` or `edge`, between the base Theme and the
// Node kind. It can change the Metrics. The name is validated when compiling.
ThemeDiagram:
  'diagram' name=Id '{' items+=DiagramItem* '}';

DiagramItem:
  ThemeLayer | ThemeUse | ThemeSlots | GroupPadding | ThemeMarker | ThemeLabel;

ThemeType:
  'type' name=Id '{' items+=PatchItem* '}';

// State patches cannot touch the Metrics; `slots` is accepted here only so that
// the catalog rejects it with a clear error (theme-state-touches-metrics).
ThemeState:
  'state' name=Id '{' items+=StateItem* '}';

PatchItem:
  ThemeLayer | ThemeUse;

StateItem:
  ThemeLayer | ThemeUse | ThemeSlots | ThemeTransition;

// `part <name> { layer ... }`: reusable patch without a Theme, included with `use` (name unique in the Workspace).
PartDecl:
  'part' name=Id '{' items+=PatchItem* '}';

ThemeUse:
  'use' name=Id;

// `layer <name> [<primitive>] [before|after <other>] [over] [{ props }]`
// defines, changes or adds depending on whether it exists in the level below; `layer <name> none` removes it.
// The primitive is a plain identifier (never a keyword) so it is not confused with `over`/`none`.
ThemeLayer:
  'layer' name=Id (remove?='none' | (primitive=IdTerminal)? (placement=('before' | 'after') target=Id)? (over?='over')? ('{' (animations+=LayerAnimation | props+=LayerProp)* '}')?);

// In a Layer: `motion pulse 1.2s ease-in-out intensity 0.4`, `motion none` (removes the inherited one) or
// `keyframes opacity 2s { 0 1  50 0.4  100 1 }`. In `node`: `transition`, `enter`, `exit`, `stagger`;
// `transition` also in a `state`. The parameters are closed words (they do not collide with the properties).
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
  'stagger' amount=Duration;

AnimParam:
  duration=Duration | 'delay' delay=Duration | 'intensity' intensity=Num | 'reduced' reduced=IdTerminal | easing=Easing;

// Number followed by its unit (`ms` or `s`); the unit is validated when compiling.
Duration:
  amount=Num unit=IdTerminal;

Easing returns string:
  'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out';

SignedNum returns string:
  '-'? DIGITS ('.' DIGITS)?;

// `offset x y` takes two values (`second`); any other key with a second value is an error when compiling.
LayerProp:
  key=Id value=LayerValue (second=SignedNum)?;

// Number, `$token`, Palette name, `name/alpha` or `mix(a, b, t)`; the `theme` catalog interprets it.
LayerValue returns string:
  MixValue | LayerAtom ('/' Num)?;

LayerAtom returns string:
  String | Id | TokenRef | SignedNum;

MixValue returns string:
  'mix' '(' Id ',' Id ',' Num ')';

// `slots [row|column] [gap N] [pad N] [align A] { children }`; without a direction it is a column. A child is a Slot
// (with its style in braces) or a nested `row`/`column` box.
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

// `edge { layer glow line { color ORIGIN/0.3 width 6 }  start dot  end arrow { size 10 }  label { pad 6 fill paper } }`
// Stroke stack, end markers and a label with a box model.
ThemeEdge:
  'edge' '{' items+=EdgeItem* '}';

EdgeItem:
  ThemeLayer | ThemeUse | ThemeMarker | ThemeLabel | ThemeDiagram | EdgeIdentifying | ThemeState;

// `identifying { ... }`: patch of the stroke of the identifying Edges of an ER View.
EdgeIdentifying:
  'identifying' '{' items+=PatchItem* '}';

// `start|end <marker> [{ props }]` or `start|end none`.
ThemeMarker:
  side=('start' | 'end') (remove?='none' | kind=IdTerminal ('{' props+=LayerProp* '}')?);

ThemeLabel:
  'label' '{' props+=LayerProp* '}';

// `row { layer background solid { color paper }  height 28  alternate { layer background { color gray } }  name { weight 600 }
//   key { fill blue }  key pk { layer background { color green } }  optional { layer background { color gray } } }`
// ER table row: `alternate` patches the odd rows; `key pk|fk|uk` and `optional` patch per key
// mark and per optional Attribute. It only paints, except `height`.
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

// It only paints, like the `node` states.
RowState:
  'state' name=Id '{' items+=PatchItem* '}';

// The text name (`name`, `type`, `key`) is validated when compiling.
RowText:
  slot=Id '{' props+=LayerProp* '}';

// `message { layer line line { color ink }  end arrow { size 9 }  gap 36  kind reply { layer line { style dashed } } }`
// Sequence Elements. Patches per variant: `kind <type>` in message, `op <operator>` in fragment. What each one
// accepts is validated by the `theme` catalog; the style, Metric and variant names are validated when compiling.
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

// `page { layer background solid { color paper }  layer dots dots { color ink/0.1 size 22 }  fixed }`
// Page background, under Groups, Edges and Nodes. Without `fixed` the pattern moves and scales with pan/zoom; with `fixed` it stays fixed to the viewport.
ThemePage:
  'page' '{' items+=PageItem* '}';

PageItem:
  ThemeLayer | ThemeUse | PageFixed;

PageFixed:
  fixed?='fixed';

// View -------------------------------------

// `view <id> { type architecture|flow  include a.*, b.**  exclude c  depth N }`.
// A View only selects Nodes of the Model; it never declares entities.
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

// Drill-down: default mechanism, initial state of Groups and links to another View.
ViewDrill:
  'drill' mode='collapse';

ViewCollapsed:
  'collapsed' targets+=Ref (',' targets+=Ref)*;

ViewExpanded:
  'expanded' targets+=Ref (',' targets+=Ref)*;

ViewLink:
  'link' node=Ref '->' view=Id;

// Sequence View: the Interaction it projects and the (partial) order of its Lifelines.
ViewInteraction:
  'interaction' value=Id;

ViewOrder:
  'order' targets+=Ref (',' targets+=Ref)*;

// Numbers the Messages projected by the sequence View.
ViewAutonumber:
  {infer ViewAutonumber} 'autonumber';

// Cumulative reveal Steps; `show` reveals and `hide` hides.
// An item is a Node selector (`a`, `a.*`, `a.**`) or an Edge (`edge a -> b`, or `a -> b`).
// In a Step, `a.*` and `a.**` also cover the Group `a` itself (revealing a whole Group).
// `steps each` (sequence only): one Step per projected Message.
ViewSteps:
  'steps' (each?='each' | '{' steps+=Step* '}');

Step:
  'step' title=String '{' actions+=StepAction* '}';

StepAction:
  StepShow | StepHide | StepUpto;

// Sequence only: the Step shows the Interaction up to that Message (by its id), included.
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

// Presentation overrides of a Node in this View; they never touch the Model.
// `pin x,y` is the position relative to the parent Group (to the canvas if it is a root), applied after layout;
// `order N` is compiled and stored, but the layout does not use it;
// `color` is a Palette name.
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

// `a.b` a Node, `a.*` its direct children, `a.**` its descendants, `*` and `**` alone.
Selector returns string:
  Ref ('.' Wildcard)? | Wildcard;

Wildcard returns string:
  '*' | '**';

// `<kind> <name> "title" "description" [planned] { children }`; `planned` (ADR 0011) also marks the descendants.
Element:
  type=Id name=Id
  (title=String
    (description=String)?
  )?
  (planned?='planned')?
  ('{'
    (elements+=Element | attrs+=Attrs | attributes+=Attribute | sources+=Source)*
  '}')?
;

// `attrs { name: type "notes" }`; the order is kept. An Attribute can also go loose in the body
// of the Node (`name: type`), which is the usual form in ER.
Attrs:
  'attrs' '{' items+=Attribute* '}'
;

// `source { path "src/api"  spec "prd.md#2" }`: opaque references `<kind> "<ref>"`; the `ref` is always a string.
Source:
  'source' '{' items+=SourceItem* '}'
;

SourceItem:
  kind=Id ref=String
;

// ER: `?` attached to the type is `optional`; `pk`, `fk` and `uk` (in any order) are the key marks and `planned`
// (ADR 0011), the proposal mark, among them.
Attribute:
  name=Id ':' type=Id (optional?='?')? (keys+=KeyMark)* (planned?='planned')? (keys+=KeyMark)* (notes=String)?
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
  'upto' | 'each' | 'pk' | 'fk' | 'uk' | 'identifying' | 'planned' | 'height' | 'key' | 'optional' | 'alternate' |
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
// Text, not a number, and not named INT (Langium would convert to a number by name): `Num` concatenates its digits and a number would lose its leading zeros (0.05 -> 0.5).
terminal DIGITS: /[0-9]+/;
terminal TokenRef: /\$[a-zA-Z_][-\w]*/;
terminal IdTerminal:  /([a-zA-Z]|_+[a-zA-Z0-9])[-\w]*/;
