import type { SgRoot, SgNode, Edit } from '@ast-grep/napi';
import { StripeClientRegex } from './configure';

/**
 * Updates method calls to use v1 namespace for a given client variable
 */
function updateMethodsInClientCalls(
  method: SgNode,
  clientVariableName: string
): Array<Edit> {
  const edits: Edit[] = [];

  // Find and replace all instances of client from non-namespaced to v1-namespaced
  method
    .findAll({
      rule: {
        kind: 'call',
        has: {
          field: 'function',
          kind: 'attribute',
          has: {
            stopBy: 'end',
            field: 'object',
            any: [
              {
                kind: 'identifier',
                pattern: clientVariableName,
              },
              {
                kind: 'attribute',
                has: {
                  field: 'object',
                  kind: 'identifier',
                  pattern: clientVariableName,
                },
              },
            ],
          },
          not: {
            has: {
              stopBy: 'end',
              kind: 'identifier',
              any: [
                {
                  pattern: 'v1',
                },
                {
                  pattern: 'v2',
                },
              ],
            },
          },
        },
      },
    })
    .forEach(clientCall => {
      const methodCallStack = clientCall.text().split('.');
      methodCallStack.splice(1, 0, 'v1');

      const edit = clientCall.replace(methodCallStack.join('.'));
      edits.push(edit);
    });

  return edits;
}

/**
 * Finds functions that accept stripe as a parameter and updates their client calls
 */
function updateClientCallsInParameterFunctions(rootNode: SgNode): Array<Edit> {
  const edits: Edit[] = [];

  const functionsWithStripeParameter = rootNode.findAll({
    rule: {
      kind: 'function_definition',
      any: [
        {
          has: {
            stopBy: 'end',
            kind: 'typed_parameter',
            has: {
              stopBy: 'end',
              kind: 'identifier',
              regex: StripeClientRegex,
            },
          },
        },
        {
          has: {
            stopBy: 'end',
            kind: 'typed_default_parameter',
            has: {
              stopBy: 'end',
              kind: 'identifier',
              regex: StripeClientRegex,
            },
          },
        },
      ],
    },
  });

  for (const func of functionsWithStripeParameter) {
    const stripeClientVarName = func.find({
      rule: {
        kind: 'identifier',
        inside: {
          any: [
            {
              kind: 'typed_parameter',
              has: {
                kind: 'type',
                field: 'type',
                regex: StripeClientRegex,
              },
            },
            {
              kind: 'typed_default_parameter',
              has: {
                kind: 'type',
                field: 'type',
                regex: StripeClientRegex,
              },
            },
          ],
        },
      },
    });
    if (stripeClientVarName) {
      edits.push(
        ...updateMethodsInClientCalls(func, stripeClientVarName.text())
      );
    }
  }

  return edits;
}

/**
 * Finds functions that instantiate stripe locally and updates their client calls
 */
function updateClientCallsInLocalInstantiations(rootNode: SgNode): Array<Edit> {
  const edits: Edit[] = [];

  const functionsWithStripeInstantiations = rootNode.findAll({
    rule: {
      kind: 'function_definition',
      has: {
        stopBy: 'end',
        kind: 'assignment',
        any: [
          {
            has: {
              field: 'right',
              kind: 'call',
              any: [
                {
                  has: {
                    field: 'function',
                    kind: 'attribute',
                    regex: StripeClientRegex,
                  },
                },
                {
                  has: {
                    field: 'function',
                    kind: 'identifier',
                    regex: StripeClientRegex,
                  },
                },
              ],
            },
          },
          {
            has: {
              field: 'type',
              kind: 'type',
              regex: 'StripeClient',
            },
          },
        ],
        inside: {
          stopBy: 'end',
          kind: 'function_definition',
        },
      },
    },
  });

  for (const func of functionsWithStripeInstantiations) {
    func
      .findAll({
        rule: {
          kind: 'identifier',
          inside: {
            kind: 'assignment',
            any: [
              {
                all: [
                  {
                    has: {
                      field: 'left',
                      kind: 'identifier',
                    },
                  },
                  {
                    has: {
                      field: 'type',
                      has: {
                        kind: 'identifier',
                        regex: StripeClientRegex,
                      },
                    },
                  },
                ],
              },
              {
                all: [
                  {
                    has: {
                      field: 'left',
                      kind: 'identifier',
                    },
                  },
                  {
                    has: {
                      field: 'right',
                      kind: 'call',
                      has: {
                        field: 'function',
                        any: [
                          {
                            kind: 'identifier',
                            regex: StripeClientRegex,
                          },
                          {
                            kind: 'attribute',
                            all: [
                              {
                                has: {
                                  field: 'object',
                                  kind: 'identifier',
                                  regex: '^stripe$',
                                },
                              },
                              {
                                has: {
                                  field: 'attribute',
                                  kind: 'identifier',
                                  regex: StripeClientRegex,
                                },
                              },
                            ],
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            ],
            inside: {
              stopBy: 'end',
              kind: 'function_definition',
            },
          },
        },
      })
      .forEach(clientVariableName => {
        // Check if this identifier is assigned a stripe client
        const assignment = clientVariableName.parent();
        if (assignment && assignment.kind() === 'assignment') {
          const assignmentText = assignment.text();
          // Simple check if the assignment contains stripe() call
          if (assignmentText.includes('StripeClient(')) {
            edits.push(
              ...updateMethodsInClientCalls(func, clientVariableName.text())
            );
          }
        }
      });
  }

  return edits;
}

/**
 * Finds classes with stripe field declarations and updates their client calls
 */
function updateClientCallsInClassFields(rootNode: SgNode): Array<Edit> {
  const edits: Edit[] = [];

  const classesWithStripeFields = rootNode.findAll({
    rule: {
      kind: 'class_definition',
      has: {
        kind: 'block',
        has: {
          kind: 'expression_statement',
          has: {
            kind: 'assignment',
            any: [
              {
                has: {
                  field: 'right',
                  kind: 'call',
                  has: {
                    field: 'function',
                    any: [
                      {
                        kind: 'attribute',
                        all: [
                          {
                            has: {
                              field: 'object',
                              kind: 'identifier',
                              regex: '^stripe$',
                            },
                          },
                          {
                            has: {
                              field: 'attribute',
                              kind: 'identifier',
                              regex: StripeClientRegex,
                            },
                          },
                        ],
                      },
                      {
                        kind: 'identifier',
                        regex: StripeClientRegex,
                      },
                    ],
                  },
                },
              },
              {
                has: {
                  field: 'type',
                  kind: 'type',
                  has: {
                    any: [
                      {
                        kind: 'identifier',
                        regex: StripeClientRegex,
                      },
                      {
                        kind: 'attribute',
                        all: [
                          {
                            has: {
                              field: 'object',
                              kind: 'identifier',
                              regex: '^stripe$',
                            },
                          },
                          {
                            has: {
                              field: 'attribute',
                              kind: 'identifier',
                              regex: StripeClientRegex,
                            },
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    },
  });

  for (const classDef of classesWithStripeFields) {
    const stripeFieldNames = classDef.findAll({
      rule: {
        kind: 'identifier',
        inside: {
          kind: 'assignment',
          has: {
            field: 'left',
            kind: 'identifier',
          },
          inside: {
            kind: 'expression_statement',
            inside: {
              kind: 'block',
              inside: {
                kind: 'class_definition',
              },
            },
          },
          not: {
            inside: {
              kind: 'function_definition',
            },
          },
          any: [
            {
              has: {
                field: 'right',
                kind: 'call',
                has: {
                  field: 'function',
                  any: [
                    {
                      kind: 'attribute',
                      all: [
                        {
                          has: {
                            field: 'object',
                            kind: 'identifier',
                            regex: '^stripe$',
                          },
                        },
                        {
                          has: {
                            field: 'attribute',
                            kind: 'identifier',
                            regex: StripeClientRegex,
                          },
                        },
                      ],
                    },
                    {
                      kind: 'identifier',
                      regex: StripeClientRegex,
                    },
                  ],
                },
              },
            },
            {
              has: {
                field: 'type',
                kind: 'type',
                has: {
                  any: [
                    {
                      kind: 'identifier',
                      regex: StripeClientRegex,
                    },
                    {
                      kind: 'attribute',
                      all: [
                        {
                          has: {
                            field: 'object',
                            kind: 'identifier',
                            regex: '^stripe$',
                          },
                        },
                        {
                          has: {
                            field: 'attribute',
                            kind: 'identifier',
                            regex: StripeClientRegex,
                          },
                        },
                      ],
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    });

    for (const fieldName of stripeFieldNames) {
      const methodsUsingField = classDef.findAll({
        rule: {
          any: [
            {
              kind: 'function_definition',
              has: {
                stopBy: 'end',
                kind: 'attribute',
                pattern: `self.${fieldName.text()}`,
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
 * Finds global variables of type StripeClient and updates their client calls
 */
function updateClientCallsInGlobalScope(rootNode: SgNode): Array<Edit> {
  const edits: Edit[] = [];

  rootNode
    .findAll({
      rule: {
        kind: 'identifier',
        inside: {
          kind: 'assignment',
          has: {
            field: 'left',
            kind: 'identifier',
          },
          inside: {
            kind: 'expression_statement',
            inside: {
              kind: 'module',
            },
          },
          not: {
            inside: {
              any: [
                {
                  kind: 'function_definition',
                },
                {
                  kind: 'class_definition',
                },
              ],
            },
          },
          any: [
            {
              has: {
                field: 'right',
                kind: 'call',
                has: {
                  field: 'function',
                  any: [
                    {
                      kind: 'identifier',
                      regex: StripeClientRegex,
                    },
                    {
                      kind: 'attribute',
                      all: [
                        {
                          has: {
                            field: 'object',
                            kind: 'identifier',
                            regex: '^stripe$',
                          },
                        },
                        {
                          has: {
                            field: 'attribute',
                            kind: 'identifier',
                            regex: StripeClientRegex,
                          },
                        },
                      ],
                    },
                  ],
                },
              },
            },
            {
              has: {
                field: 'type',
                kind: 'type',
                any: [
                  {
                    kind: 'identifier',
                    regex: StripeClientRegex,
                  },
                  {
                    kind: 'attribute',
                    all: [
                      {
                        has: {
                          field: 'object',
                          kind: 'identifier',
                          regex: '^stripe$',
                        },
                      },
                      {
                        has: {
                          field: 'attribute',
                          kind: 'identifier',
                          regex: StripeClientRegex,
                        },
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },
    })
    .forEach(variableName => {
      edits.push(...updateMethodsInClientCalls(rootNode, variableName.text()));
    });

  return edits;
}
/**
 * Main transformation function that orchestrates the migration process
 *
 * Limitations:
 * 1. You implement or extend your own version of stripe client.
 * 2. Assumes stripe is imported as 'stripe' and not aliased (common convention).
 */
export default function transform(root: SgRoot): string | null {
  const rootNode = root.root();
  const edits: Edit[] = [];

  // Step 1: Update client calls in functions that accept stripe as a parameter
  edits.push(...updateClientCallsInParameterFunctions(rootNode));

  // Step 2: Update client calls in functions that instantiate stripe locally
  edits.push(...updateClientCallsInLocalInstantiations(rootNode));

  // Step 3: Update client calls in classes with stripe field declarations
  edits.push(...updateClientCallsInClassFields(rootNode));

  // Step 4: Update client calls defined outside of classes and methods
  edits.push(...updateClientCallsInGlobalScope(rootNode));

  return edits.length > 0 ? rootNode.commitEdits(edits) : null;
}
