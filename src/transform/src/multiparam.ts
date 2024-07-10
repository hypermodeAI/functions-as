import {
  ArrayLiteralExpression,
  BlockStatement,
  CommonFlags,
  FloatLiteralExpression,
  FunctionDeclaration,
  IdentifierExpression,
  IntegerLiteralExpression,
  LiteralExpression,
  LiteralKind,
  NewExpression,
  Node,
  NodeKind,
  ObjectLiteralExpression,
  ParameterKind,
  ParameterNode,
  Parser,
  Range,
  Source,
  SourceKind,
  StringLiteralExpression,
  Token,
  Tokenizer,
  ExportStatement,
} from "assemblyscript/dist/assemblyscript.js";
import { Parameter } from "./types.js";
import { BaseVisitor } from "visitor-as/dist/index.js";

class OptionalParam {
  param: Parameter;
  defaultValue: string | null = null;
}

/**
 * Overrides the default multi-param generated by ASC
 * By default, you must have optional params declared in sequential order
 * In GraphQL that is not the case.
 *
 * This takes a function like this:
 *
 * ```js
 * fn createVec(x: i32 = 1, y: i32 = 2, z: i32 = 3) {}
 * ```
 *
 * And transforms it into
 *
 * ```js
 * fn createVec(x: i32, y: i32, z: i32, __SUPPLIED_PARAMS: u64) {
 *  if ((__SUPPLIED_PARAMS & 1) == 0) x = 1;
 *  if (((__SUPPLIED_PARAMS >> 1) & 1) == 0) y = 2;
 *  if (((__SUPPLIED_PARAMS >> 2) & 1) == 0) z = 3;
 * }
 * ```
 *
 * This works by using bitwise operations to construct a mask (__SUPPLIED_PARAMS) on the runtime-side
 *
 * `0b011` means that z was not defined, so z = 3
 *
 * `0b000` means that no params were defined, so x = 1, y = 2, z = 3
 *
 * `0b010` means that x and z were not defined, so z = 1 and z = 3
 *
 * Note that the mask is Little Endian so the order would be reversed
 */
export class MultiParamGen {
  static SN: MultiParamGen = new MultiParamGen();
  public required_fns: string[] = [];
  public optional_fns = new Map<string, OptionalParam[]>();
  static init(): MultiParamGen {
    if (!MultiParamGen.SN) MultiParamGen.SN = new MultiParamGen();
    return MultiParamGen.SN;
  }
  visitExportStatement(node: ExportStatement): void {
    const source = node.range.source;
    if (source.sourceKind != SourceKind.UserEntry) return;
    for (const member of node.members) {
      const name = member.localName.text;
      this.required_fns.push(name);
    }
  }
  visitFunctionDeclaration(node: FunctionDeclaration) {
    const source = node.range.source;
    let name = node.name.text;
    if (!node.body && node.decorators?.length) {
      const decorator = node.decorators.find(
        (e) => (e.name as IdentifierExpression).text === "external",
      );
      if (
        decorator.args.length > 1 &&
        decorator.args[1].kind === NodeKind.Literal
      ) {
        name = (decorator.args[1] as StringLiteralExpression).value.toString();
      }
    }
    if (
      source.sourceKind != SourceKind.UserEntry &&
      !this.required_fns.includes(name)
    )
      return;
    if (node.flags != CommonFlags.Export && !this.required_fns.includes(name))
      return;
    if (node.signature.parameters.length > 63) {
      throw new Error("Functions exceeding 64 parameters not allowed!");
    }
    const params: OptionalParam[] = [];
    for (const param of node.signature.parameters) {
      const defaultValue = getDefaultValue(param);
      params.push({
        param: {
          name: param.name.text,
          type: {
            name: "UNINITIALIZED_VALUE",
            path: "UNINITIALIZED_VALUE",
          },
          optional: !!param.initializer,
        },
        defaultValue,
      });
    }

    this.optional_fns.set(name, params);

    initDefaultValues(node);

    if (node.body == null) {
      let name = node.name.text;
      if (!node.body && node.decorators?.length) {
        const decorator = node.decorators.find(
          (e) => (e.name as IdentifierExpression).text === "external",
        );
        if (
          decorator.args.length > 1 &&
          decorator.args[1].kind === NodeKind.Literal
        ) {
          name = (
            decorator.args[1] as StringLiteralExpression
          ).value.toString();
        }
      }
      const params: OptionalParam[] = [];
      for (const param of node.signature.parameters) {
        const defaultValue = getDefaultValue(param);
        params.push({
          param: {
            name: param.name.text,
            type: {
              name: "UNINITIALIZED_VALUE",
              path: "UNINITIALIZED_VALUE",
            },
            optional: !!param.initializer,
          },
          defaultValue,
        });
        if (param.initializer) param.initializer = null;
      }
      this.optional_fns.set(name, params);
    }
  }
  visitSource(node: Source) {
    if (node.isLibrary) return;
    for (const stmt of node.statements) {
      if (stmt.kind === NodeKind.Export) {
        this.visitExportStatement(stmt as ExportStatement);
      }
    }
    for (const stmt of node.statements) {
      if (stmt.kind === NodeKind.FunctionDeclaration) {
        this.visitFunctionDeclaration(stmt as FunctionDeclaration)
      }
    }
  }
}

function getDefaultValue(param: ParameterNode): string | null {
  if (!param.initializer) {
    return null;
  }

  switch (param.initializer.kind) {
    case NodeKind.Null:
      return "null";
    case NodeKind.True:
      return "true";
    case NodeKind.False:
      return "false";
    case NodeKind.New:
      if ((param.initializer as NewExpression).args.length) {
        return "{...}";
      } else {
        return "{}";
      }
    case NodeKind.Literal: {
      const literal = param.initializer as LiteralExpression;
      switch (literal.literalKind) {
        case LiteralKind.String:
          return (literal as StringLiteralExpression).value;
        case LiteralKind.Integer:
          return (literal as IntegerLiteralExpression).value.toString();
        case LiteralKind.Float:
          return (literal as FloatLiteralExpression).value.toString();
        case LiteralKind.Array:
          if ((literal as ArrayLiteralExpression).elementExpressions.length) {
            return "[...]";
          } else {
            return "[]";
          }
        case LiteralKind.Object: {
          const objLiteral = literal as ObjectLiteralExpression;
          if (objLiteral.values.length || objLiteral.names.length) {
            return "{...}";
          } else {
            return "{}";
          }
        }
      }
    }
  }

  return "...";
}

const parser = new Parser();
function newIntegerLiteral(
  num: number,
  range: Range,
): IntegerLiteralExpression {
  const source = new Source(
    SourceKind.User,
    range.source.normalizedPath,
    num.toString(),
  );
  const tokenizer = new Tokenizer(source);
  parser.currentSource = source;
  const int = parser.parseExpression(tokenizer) as IntegerLiteralExpression;
  int.range = range;
  return int;
}

function initDefaultValues(node: FunctionDeclaration) {
  if (
    node.signature.parameters.find(
      (v) => v.parameterKind === ParameterKind.Optional,
    )
  ) {
    let body: BlockStatement;
    if (node.body.kind != NodeKind.Block) {
      body = Node.createBlockStatement([node.body], node.range);
    } else {
      body = node.body as BlockStatement;
    }
    node.signature.parameters.push(
      Node.createParameter(
        ParameterKind.Default,
        Node.createIdentifierExpression("__SUPPLIED_PARAMS", node.range, false),
        Node.createNamedType(
          Node.createSimpleTypeName("u64", node.range),
          [],
          false,
          node.range,
        ),
        null,
        node.range,
      ),
    );
    let first = true;
    for (let i = 0; i < node.signature.parameters.length; i++) {
      const param = node.signature.parameters[i];
      if (param.parameterKind != ParameterKind.Optional) continue;
      const stmt = Node.createIfStatement(
        Node.createBinaryExpression(
          Token.Equals_Equals,
          Node.createParenthesizedExpression(
            Node.createBinaryExpression(
              Token.Ampersand,
              first
                ? ((first = false),
                  Node.createIdentifierExpression(
                    "__SUPPLIED_PARAMS",
                    node.range,
                  ))
                : Node.createParenthesizedExpression(
                    Node.createBinaryExpression(
                      Token.GreaterThan_GreaterThan,
                      Node.createIdentifierExpression(
                        "__SUPPLIED_PARAMS",
                        node.range,
                      ),
                      newIntegerLiteral(i, node.range),
                      node.range,
                    ),
                    node.range,
                  ),
              newIntegerLiteral(1, node.range),
              node.range,
            ),
            node.range,
          ),
          newIntegerLiteral(0, node.range),
          node.range,
        ),
        Node.createExpressionStatement(
          Node.createBinaryExpression(
            Token.Equals,
            Node.createIdentifierExpression(param.name.text, node.range, false),
            param.initializer,
            node.range,
          ),
        ),
        null,
        node.range,
      );
      body.statements.unshift(stmt);
      if (param.initializer) param.initializer = null;
    }
  }
}
