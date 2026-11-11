import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { pageAnalysis } from '../src/modules/scanning/dom.rules.js';

// The page function is serialized into the browser. Transpilers such as esbuild
// (tsx) wrap named function expressions with a __name helper that the page does
// not have, so the analysis would abort. Named function bindings are forbidden.
describe('Page analysis source constraints', () => {
  it('creates no named function bindings inside the evaluated page function', () => {
    const source = `(${pageAnalysis.toString()})`;
    const file = ts.createSourceFile(
      'page.ts',
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const bindings: string[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) ||
          ts.isFunctionExpression(node.initializer))
      ) {
        bindings.push(node.name.getText(file));
      }
      if (ts.isFunctionDeclaration(node) && node.name) {
        bindings.push(node.name.getText(file));
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    expect(bindings).toEqual([]);
    expect(source).not.toContain('__name');
  });
});
