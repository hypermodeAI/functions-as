export class ProgramInfo {
  functions: FunctionSignature[];
  types: TypeDefinition[];
}

export class FunctionSignature {
  constructor(
    public name: string,
    public parameters: Parameter[],
    public returnType: TypeInfo,
  ) {}

  toString() {
    let params = "";
    for (let i = 0; i < this.parameters.length; i++) {
      const param = this.parameters[i]!;
      const defaultValue = param.default;
      params += `${param.name}: ${param.type.name}`;
      if (defaultValue !== undefined) {
        params += ` = ${JSON.stringify(defaultValue)}`;
      }
      params += ", ";
    }
    return `${this.name}(${params.endsWith(", ") ? params.slice(0, params.length - 2) : params}): ${this.returnType.name}`;
  }
}

export class TypeDefinition implements TypeInfo {
  constructor(
    public id: number,
    public size: number,
    public path: string,
    public name: string,
    public fields?: Field[],
  ) {}

  toString() {
    const s = this.name;
    if (!this.fields || this.fields.length === 0) {
      return s;
    }

    const fields = this.fields
      .map((f) => `${f.name}: ${f.type.name}`)
      .join(", ");
    return `${s} { ${fields} }`;
  }

  isHidden() {
    if (typeMap.has(this.path)) return true;
    if (this.path.startsWith("~lib/array/Array<")) return true;
    if (this.path.startsWith("~lib/map/Map<")) return true;
    if (this.path.startsWith("~lib/@hypermode/")) return true;

    return false;
  }
}

export interface TypeInfo {
  name: string;
  path: string;
}

export type JsonLiteral =
  | null
  | boolean
  | number
  | string
  | Array<JsonLiteral>
  | { [key: string]: JsonLiteral };

export interface Parameter {
  name: string;
  type: TypeInfo;
  default?: JsonLiteral;
}

interface Field {
  offset: number;
  name: string;
  type: TypeInfo;
}

export const typeMap = new Map<string, string>([
  ["~lib/string/String", "string"],
  ["~lib/array/Array", "Array"],
  ["~lib/map/Map", "Map"],
  ["~lib/date/Date", "Date"],
  ["~lib/wasi_date/wasi_Date", "Date"],
]);
