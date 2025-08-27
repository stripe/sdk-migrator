# Stripe SDK Migrator

The `sdk-migrator` is a tool that can modify Java and Python codebases that use the Stripe SDK. It will take code using older integration styles and output the same code but in the newer style.

Eg. In Stripe Java SDK v29.5.0 we introduced new `v1` namespace in StripeClient. Running the `v1-namespace` migration would convert all your StripeClient calls to support the newer code path.
```diff
class AcmeBusinessApp {
    public StripeCollection<Customer> fetchCustomerList(StripeClient client) {
-        return client.customers().list();
+        return client.v1().customers().list();
    }
}
```

> [!WARNING]
> `sdk-migrator` makes its best effort to migrate your code (especially with dynamic languages). Make sure you have all your code checked in a version control system (e.g. Git) before using this tool. Always review and test your code before deploying. 

## Installation

`sdk-migrator` is a Node.js-based package and can be installed globally as a CLI:

```
npm i -g @stripe/sdk-migrator
```

or used directly with `npx` (which comes pre-installed with `npm`):

```
npx @stripe/sdk-migrator
```

If you need Node.js installed, you can [follow these instructions](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) for your platform.

## Usage


> [!WARNING]
> SDK Migrator can modify files in your codebase. Make sure you have all your code checked in a version control system (e.g. Git) before using this tool. Always review and test your code before deploying. 

```bash
# Run V1 Namespace migration on a Java codebase in ~/stripe-integration
npx @stripe/sdk-migrator --language java -d ~/stripe-integration --migration v1-namespace
```


### Command Line Options

- `-h, --help`: Show help message
- `-v, --version`: Show version information
- `-d, --directory`: Code directory to process
- `-l, --language`: Programming language (java, python)
- `-m, --migration`: Migration name (e.g., v1-namespace)
- `-x, --execute`: Execute mode will modify files in your codebase
- `-u, --untyped`: Untyped mode for codebases that are not fully typed. Currently only available for Python (optional)

### Examples

```bash
# Show help
npx @stripe/sdk-migrator --help

# Show version
npx @stripe/sdk-migrator --version

# Run V1 Namespace migration in dry run mode(default). Dry run mode shows all the files that it will modify but does not persist it to disk. 
npx @stripe/sdk-migrator --language python -d ~/stripe-integration --migration v1-namespace

# Execute flag(-x or --execute) will make the migration changes and persist the files to disk.  
# Run V1 Namespace migration on a typed Python codebase in ~/stripe-integration
npx @stripe/sdk-migrator --language python -d ~/stripe-integration --migration v1-namespace --execute

# Run V1 Namespace migration on a untyped/paritally typed Python codebase in ~/stripe-integration
npx @stripe/sdk-migrator --language python -d ~/stripe-integration --migration v1-namespace --untyped --execute

# Run V1 Namespace migration on a Java codebase in ~/stripe-integration
npx @stripe/sdk-migrator --language java -d ~/stripe-integration --migration v1-namespace --execute
```

# Customization
If you extend/implement your own StripeClient in your codebase, you can change the regex in `src/{lang}/{migration}/configure.ts` to use the tool. 

# Development
[Contribution guidelines for this project](CONTRIBUTING.md)