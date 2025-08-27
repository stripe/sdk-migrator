#!/usr/bin/env node

import { parse, SgRoot, registerDynamicLanguage } from '@ast-grep/napi';
import javaMigrate from './java/01-v1-namespace/migrate';
import pythonMigrate from './python/01-v1-namespace/migrate';
import pythonMigrateUntyped from './python/01-v1-namespace/migrate_untyped';
import java from '@ast-grep/lang-java';
import python from '@ast-grep/lang-python';
import { glob } from 'glob';
import fs from 'fs';
import path from 'path';
import packageJson from '../package.json';

interface CliOptions {
  help?: boolean;
  version?: boolean;
  directory?: string;
  language?: string;
  execute?: boolean;
  untyped?: boolean;
  migration?: string;
}

const migrations: Record<
  string,
  Record<string, Record<string, (root: SgRoot) => string | null>>
> = {
  'v1-namespace': {
    typed: {
      java: javaMigrate,
      python: pythonMigrate,
    },
    untyped: {
      python: pythonMigrateUntyped,
    },
  },
};

const languageGlobs: Record<string, string[]> = {
  java: ['**/*.java'],
  python: ['**/*.py'],
};

function showHelp(): void {
  console.log(`
Stripe SDK Migrator - A CLI tool for migrating Stripe SDK code

Usage: sdk-migrator [options]

Options:
  -h, --help       Show this help message
  -v, --version    Show version information
  -d, --directory  Code directory to process
  -l, --language   Programming language (java, python)
  -m, --migration  Migration name (e.g., v1-namespace)
  -x, --execute    Execute mode will modify files in your codebase (optional)
  -u, --untyped    Untyped mode for codebases that are not typed (optional)

Examples:
  npx @stripe/sdk-migrator --directory ./src --migration v1-namespace --language java
  npx @stripe/sdk-migrator --directory ./src --migration v1-namespace --language python
  npx @stripe/sdk-migrator --directory ./src --migration v1-namespace --language python --execute
  npx @stripe/sdk-migrator --help
`);
}

function showVersion(): void {
  console.log(
    `@stripe/sdk-migrator v${(packageJson as { version: string }).version}`
  );
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '-v':
      case '--version':
        options.version = true;
        break;
      case '-d':
      case '--directory':
        options.directory = args[++i];
        break;
      case '-l':
      case '--language':
        options.language = args[++i];
        break;
      case '-m':
      case '--migration':
        options.migration = args[++i];
        break;
      case '-x':
      case '--execute':
        options.execute = true;
        break;
      case '-u':
      case '--untyped':
        options.untyped = true;
        break;
      default:
    }
  }

  return options;
}

async function processFile(
  inputPath: string,
  language: string,
  migrationName: string,
  execute: boolean,
  untyped: boolean = false
): Promise<void> {
  try {
    const migrationType = untyped ? 'untyped' : 'typed';

    const migration = migrations[migrationName]?.[migrationType]?.[language];

    if (!migration) {
      console.error(
        `No migration called "${migrationName}" found for "${language}" in "${migrationType}" mode`
      );
      process.exit(1);
    }

    console.log(`Processing: ${inputPath}`);
    const files = await glob(languageGlobs[language], { cwd: inputPath });

    files.forEach((file: string) => {
      const filePath = path.resolve(inputPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const root = parse(language, content);

      // Run the migration over the source code in the file
      const migratedCode = migration(root);
      if (migratedCode) {
        if (execute) {
          fs.writeFileSync(filePath, migratedCode);
          console.log('Migrated file:', filePath);
        } else {
          console.log('Will migrate file:', filePath);
        }
      }
    });

    if (execute) {
      console.log(
        'Migration complete. Please review and test your code before deploying.'
      );
    } else {
      console.log('Dry run complete. Re-run this command with "--execute" flag to apply the changes.');
    }
  } catch (error) {
    console.error('Error processing file:', error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const options = parseArgs();
  registerDynamicLanguage({ java, python });

  if (options.help) {
    showHelp();
    return;
  }

  if (options.version) {
    showVersion();
    return;
  }

  if (!options.directory) {
    console.error('Error: Input directory is required');
    console.log('Use --help for usage information');
    process.exit(1);
  }

  if (!options.language) {
    console.error('Error: Language is required');
    console.log('Use --help for usage information');
    process.exit(1);
  }

  if (!options.migration) {
    console.error('Error: Migration Name is required');
    console.log('Use --help for usage information');
    process.exit(1);
  }

  try {
    await processFile(
      options.directory,
      options.language,
      options.migration,
      options.execute || false,
      options.untyped || false
    );
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the CLI
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { main, parseArgs, processFile };
