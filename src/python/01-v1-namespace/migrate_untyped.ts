import type { SgRoot, SgNode, Edit } from '@ast-grep/napi';
import { serviceMethods } from './helper/service_methods';

function transform(root: SgRoot): string | null {
  const rootNode = root.root();

  const edits: Edit[] = [];

  // Matches:
  // client.customers.list()
  // stripe_client.accounts.capabilities.retrieve('cap_123')
  // client.v2.core.accounts.list()
  const regexPattern = `\\.(?<method>${serviceMethods.join('|')})\\(`;

  rootNode
    .findAll({
      rule: {
        kind: 'call',
        regex: regexPattern,
      },
    })
    .forEach((statement: SgNode) => {
      if (
        statement.text().includes('.v2.') ||
        statement.text().includes('.v1.')
      ) {
        // 1. Ensuring idempotent migrations
        // 2. Ignore v2 namespaced matches
        return;
      }

      const match = statement.text().match(regexPattern);
      if (!match || !match.groups) {
        return;
      }
      const serviceMethod = match.groups['method'];

      if (serviceMethod) {
        const statementWithV1Namespace = statement
          .text()
          .replace(match.groups['method'], `v1.${serviceMethod}`);

        edits.push(statement.replace(statementWithV1Namespace));
      }
    });

  return edits.length > 0 ? rootNode.commitEdits(edits) : null;
}

export default transform;
