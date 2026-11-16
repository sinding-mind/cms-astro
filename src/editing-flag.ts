// Folds `isCmsEditing()` into a literal at every call site, at build time.
//
// `isCmsEditing()` is a function in `attrs.ts`. When two page scripts import it, Rolldown (Vite 8) puts it in a
// shared chunk (`var e=()=>!1`) and keeps the calls, so every script that checks it changes, and the production
// build is no longer what the site would be without the CMS. A function call cannot be replaced with Vite's
// `define`, so the integration's Vite plugin rewrites the calls instead: in every module that imports
// `isCmsEditing` from "@sindingmind/cms-astro/attrs", each call `isCmsEditing()` (also under an `as` name) becomes
// `false` in a build. The import is then unused, the bundler drops `attrs.ts`, and the minifier removes the dead
// branch, so the script is exactly what it would be with the check written as `false`.
//
// What is not folded (it still works, through the function): `isCmsEditing` used as a value (`const f =
// isCmsEditing`), a namespace import (`import * as attrs`), and a call with arguments.

export const ATTRS_SPECIFIER = "@sindingmind/cms-astro/attrs";

type Node = { type: string; start: number; end: number; [key: string]: unknown };
/** The parser of the bundler's plugin context (`this.parse`): ESTree with `start`/`end` offsets. */
export type Parse = (code: string) => unknown;

/**
 * Returns `code` with every `isCmsEditing()` call replaced by `value` (as a literal), or undefined if the module does
 * not import `isCmsEditing` from the attrs module (or there is nothing to replace).
 */
export function foldEditingCalls(code: string, parse: Parse, value: boolean): string | undefined {
  if (!code.includes("isCmsEditing") || !code.includes(ATTRS_SPECIFIER)) return undefined;
  const program = parse(code) as Node;
  const names = new Set<string>();
  for (const stmt of program.body as Node[]) {
    if (stmt.type !== "ImportDeclaration" || (stmt.source as { value?: unknown }).value !== ATTRS_SPECIFIER) continue;
    for (const s of stmt.specifiers as Node[]) {
      const imported = s.imported as { name?: string; value?: string } | undefined;
      if (s.type === "ImportSpecifier" && (imported?.name ?? imported?.value) === "isCmsEditing") names.add((s.local as { name: string }).name);
    }
  }
  if (!names.size) return undefined;

  const calls: Node[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const n = node as Node;
    if (n.type === "CallExpression" && (n.arguments as unknown[]).length === 0 && !n.optional) {
      const callee = n.callee as Node;
      if (callee.type === "Identifier" && names.has(callee.name as string)) {
        calls.push(n);
        return;
      }
    }
    for (const key of Object.keys(n)) if (key !== "type" && key !== "start" && key !== "end" && key !== "range" && key !== "loc") visit(n[key]);
  };
  visit(program.body);
  if (!calls.length) return undefined;

  // Replace from the end so the earlier offsets stay valid. The literal is wrapped in parentheses, so it is an
  // expression wherever the call was (`isCmsEditing().toString()` stays valid).
  let out = code;
  for (const call of calls.sort((a, b) => b.start - a.start)) out = `${out.slice(0, call.start)}(${value})${out.slice(call.end)}`;
  return out;
}
