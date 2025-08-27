import type { SgRoot, SgNode, Edit } from '@ast-grep/napi';
import { StripeClientRegex } from './configure';

/**
 * Updates method calls to use v1 namespace for a given client variable
 */
function updateMethodsInClientCalls(
  method: SgNode,
  clientVariableName: string
): Array<Edit> {
  // Find and replace all instances of client from non-namespaced to v1-namespaced
  return method
    .findAll({
      rule: {
        kind: 'method_invocation',
        has: {
          field: 'object',
          kind: 'identifier',
          pattern: clientVariableName,
        },
        not: {
          any: [
            { has: { field: 'name', kind: 'identifier', pattern: 'v2' } },
            { has: { field: 'name', kind: 'identifier', pattern: 'v1' } },
          ],
        },
      },
    })
    .map((clientCall: SgNode): Edit => {
      const stripeServiceName = clientCall
        .text()
        .replace(/[()]/g, '')
        .split('.')
        .slice(-1);
      return clientCall.replace(
        `${clientVariableName}.v1().${stripeServiceName}()`
      );
    });
}

/**
 * Finds methods that accept StripeClient as a parameter and updates their client calls
 */
function updateClientCallsInParameterMethods(rootNode: SgNode): Array<Edit> {
  const edits: Edit[] = [];

  const methodsWithStripeClientParameter = rootNode.findAll({
    rule: {
      kind: 'method_declaration',
      has: {
        stopBy: 'end',
        kind: 'formal_parameter',
        has: {
          kind: 'type_identifier',
          regex: StripeClientRegex,
        },
      },
    },
  });

  for (const method of methodsWithStripeClientParameter) {
    const stripeClientVarName = method.find({
      rule: {
        kind: 'identifier',
        follows: { kind: 'type_identifier', regex: StripeClientRegex },
      },
    });
    if (stripeClientVarName) {
      edits.push(
        ...updateMethodsInClientCalls(method, stripeClientVarName.text())
      );
    }
  }

  return edits;
}

/**
 * Finds methods that instantiate StripeClient locally and updates their client calls
 */
function updateClientCallsInLocalInstantiations(rootNode: SgNode): Array<Edit> {
  const edits: Edit[] = [];

  const methodsWithStripeClientInstantiations = rootNode.findAll({
    rule: {
      kind: 'method_declaration',
      has: {
        stopBy: 'end',
        kind: 'variable_declarator',
        follows: {
          kind: 'type_identifier',
          regex: StripeClientRegex,
        },
      },
    },
  });

  for (const method of methodsWithStripeClientInstantiations) {
    method
      .findAll({
        rule: {
          kind: 'identifier',
          nthChild: 1,
          inside: {
            kind: 'variable_declarator',
            has: { field: 'name', kind: 'identifier' },
            inside: {
              stopBy: 'end',
              kind: 'local_variable_declaration',
              has: {
                field: 'type',
                kind: 'type_identifier',
                regex: StripeClientRegex,
              },
            },
          },
        },
      })
      .forEach(clientVariableName => {
        edits.push(
          ...updateMethodsInClientCalls(method, clientVariableName.text())
        );
      });
  }

  return edits;
}

/**
 * Finds classes with StripeClient field declarations and updates their client calls
 */
function updateClientCallsInClassFields(rootNode: SgNode): Array<Edit> {
  const edits: Edit[] = [];

  const classesWithStripeClientFields = rootNode.findAll({
    rule: {
      kind: 'class_body',
      has: {
        kind: 'field_declaration',
        stopBy: 'end',
        has: {
          kind: 'type_identifier',
          regex: StripeClientRegex,
        },
      },
    },
  });

  for (const classBody of classesWithStripeClientFields) {
    const stripeClientFieldNames = classBody.findAll({
      rule: {
        kind: 'identifier',
        inside: {
          kind: 'field_declaration',
          stopBy: 'end',
          has: { kind: 'type_identifier', regex: StripeClientRegex },
        },
      },
    });

    for (const fieldName of stripeClientFieldNames) {
      const fieldNameRegex = fieldName.text();
      const methodsUsingField = classBody.findAll({
        rule: {
          any: [
            {
              kind: 'method_declaration',
              all: [
                {
                  has: {
                    stopBy: 'end',
                    kind: 'identifier',
                    regex: fieldNameRegex,
                  },
                },
                {
                  not: {
                    any: [
                      {
                        has: {
                          stopBy: 'end',
                          kind: 'formal_parameter',
                          has: {
                            kind: 'identifier',
                            regex: fieldNameRegex,
                          },
                        },
                      },
                      {
                        has: {
                          stopBy: 'end',
                          kind: 'variable_declarator',
                          has: {
                            kind: 'identifier',
                            regex: fieldNameRegex,
                          },
                        },
                      },
                    ],
                  },
                },
              ],
            },
            {
              kind: 'constructor_declaration',
            },
          ],
          all: [
            {
              has: {
                stopBy: 'end',
                kind: 'identifier',
                regex: fieldNameRegex,
              },
            },
            {
              not: {
                has: {
                  stopBy: 'end',
                  kind: 'formal_parameter',
                  has: {
                    kind: 'identifier',
                    regex: fieldNameRegex,
                  },
                },
              },
            },
          ],
        },
      });

      methodsUsingField.forEach(method => {
        edits.push(...updateMethodsInClientCalls(method, fieldName.text()));
      });
    }
  }

  return edits;
}

/**
 * Main transformation function that orchestrates the migration process
 */
export default function transform(root: SgRoot): string | null {
  const rootNode = root.root();
  const edits: Edit[] = [];

  // Step 1: Update client calls in methods that accept StripeClient as a parameter
  edits.push(...updateClientCallsInParameterMethods(rootNode));

  // Step 2: Update client calls in methods that instantiate StripeClient locally
  edits.push(...updateClientCallsInLocalInstantiations(rootNode));

  // Step 3: Update client calls in classes with StripeClient field declarations
  edits.push(...updateClientCallsInClassFields(rootNode));

  return edits.length > 0 ? rootNode.commitEdits(edits) : null;
}
