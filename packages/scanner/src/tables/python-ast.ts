/** What the Django and SQLAlchemy readers share: the Python grammar and small helpers over its syntax tree. */
import { type SyntaxNode, loadSyntax } from '../tree-sitter';

export const loadPython = () => loadSyntax('tree-sitter-python/tree-sitter-python.wasm');

/** A call as written: the dotted function name, positional arguments and keyword arguments. */
export interface Call {
  /** `models.ForeignKey`. */
  name: string;
  /** Last segment of `name`: `ForeignKey`. */
  last: string;
  args: SyntaxNode[];
  kwargs: Map<string, SyntaxNode>;
}

export function callOf(node: SyntaxNode | null | undefined): Call | undefined {
  if (node === null || node === undefined || node.type !== 'call') return undefined;
  const name = node.childForFieldName('function')?.text ?? '';
  const args: SyntaxNode[] = [];
  const kwargs = new Map<string, SyntaxNode>();
  for (const arg of node.childForFieldName('arguments')?.namedChildren ?? []) {
    if (arg === null || arg.type === 'comment') continue;
    const value = arg.childForFieldName('value');
    const key = arg.childForFieldName('name');
    if (arg.type === 'keyword_argument' && key !== null && value !== null) kwargs.set(key.text, value);
    else args.push(arg);
  }
  return { name, last: name.slice(name.lastIndexOf('.') + 1), args, kwargs };
}

/** The value of a plain string literal (not an f-string, not concatenated). */
export function stringOf(node: SyntaxNode | null | undefined): string | undefined {
  if (node === null || node === undefined || node.type !== 'string') return undefined;
  const match = /^([a-zA-Z]*)("""|'''|"|')([\s\S]*)\2$/.exec(node.text);
  return match === null || /f/i.test(match[1] as string) ? undefined : (match[3] as string);
}

export const boolOf = (node: SyntaxNode | null | undefined): boolean | undefined =>
  node?.type === 'true' ? true : node?.type === 'false' ? false : undefined;

/** A class of a file with the statements of its body. */
export interface PyClass {
  name: string;
  /** Base class expressions as written (`models.Model`). */
  bases: string[];
  line: number;
  assignments: Assignment[];
  /** Nested classes by name (`Meta`). */
  nested: Map<string, PyClass>;
}

export interface Assignment {
  name: string;
  /** The text of the annotation (`Mapped[int]`), if any. */
  annotation: string | undefined;
  value: SyntaxNode;
  line: number;
}

/** Classes at the top of the module (also under decorators); their assignments are `name = value` or `name: T = value`. */
export function classesOf(root: SyntaxNode): PyClass[] {
  const result: PyClass[] = [];
  for (const statement of root.namedChildren) {
    const node = statement?.type === 'decorated_definition' ? statement.childForFieldName('definition') : statement;
    if (node?.type === 'class_definition') result.push(readClass(node));
  }
  return result;
}

function readClass(node: SyntaxNode): PyClass {
  const bases = (node.childForFieldName('superclasses')?.namedChildren ?? []).flatMap((base) =>
    base === null || base.type === 'keyword_argument' || base.type === 'comment' ? [] : [base.text],
  );
  const pyClass: PyClass = { name: node.childForFieldName('name')?.text ?? '', bases, line: node.startPosition.row + 1, assignments: [], nested: new Map() };
  for (const statement of node.childForFieldName('body')?.namedChildren ?? []) {
    if (statement?.type === 'class_definition') {
      const inner = readClass(statement);
      pyClass.nested.set(inner.name, inner);
    } else if (statement?.type === 'expression_statement') {
      const assignment = statement.namedChildren[0];
      const left = assignment?.childForFieldName('left');
      const right = assignment?.childForFieldName('right');
      if (assignment?.type === 'assignment' && left?.type === 'identifier' && right !== null && right !== undefined) {
        pyClass.assignments.push({
          name: left.text,
          annotation: assignment.childForFieldName('type')?.text,
          value: right,
          line: statement.startPosition.row + 1,
        });
      }
    }
  }
  return pyClass;
}

/** An argument's value copied out of the tree, to be used after the file's tree is freed. */
export interface Value {
  text: string;
  /** The string literal's value, if it is one. */
  string: string | undefined;
  bool: boolean | undefined;
}

export interface PlainCall {
  last: string;
  args: Value[];
  kwargs: Map<string, Value>;
}

const valueOf = (node: SyntaxNode): Value => ({ text: node.text, string: stringOf(node), bool: boolOf(node) });

export function plain(call: Call): PlainCall {
  return { last: call.last, args: call.args.map(valueOf), kwargs: new Map([...call.kwargs].map(([key, node]) => [key, valueOf(node)])) };
}
