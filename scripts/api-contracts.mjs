import { createHash } from 'node:crypto';
import { relative, resolve, sep } from 'node:path';

import ts from '@permitio/compiler-tools';

const verbs = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
const printer = ts.createPrinter({ removeComments: true });
const print = (node) => printer.printNode(ts.EmitHint.Unspecified, node, node.getSourceFile());
export const compareStrings = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const privateMember = (node) =>
  node.modifiers?.some((modifier) =>
    [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword].includes(modifier.kind),
  );

function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node))
    return node.text;
  throw new Error(`Unsupported computed property at ${node.getSourceFile().fileName}.`);
}

/** Sorts object keys without changing array order or literal values. */
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => compareStrings(a, b))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}

export const digest = (value) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');

function signature(node, checker) {
  return {
    parameters: node.parameters.map((parameter) => ({
      name: print(parameter.name),
      optional: Boolean(parameter.questionToken || parameter.initializer),
      initializer: parameter.initializer ? print(parameter.initializer) : null,
      type: parameter.type ? print(parameter.type) : '(inferred)',
    })),
    returns: node.type
      ? print(node.type)
      : checker.typeToString(
          checker.getReturnTypeOfSignature(checker.getSignatureFromDeclaration(node)),
          undefined,
          ts.TypeFormatFlags.NoTruncation,
        ),
    generics: node.typeParameters?.map(print) ?? [],
  };
}

function staticPath(expression) {
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === 'replace'
  )
    return staticPath(expression.expression.expression);
  throw new Error(`Generated route is no longer static: ${print(expression)}.`);
}

/** Extracts routes and public call chains from TypeScript syntax and resolved symbols. */
export function extractSdk(root) {
  const configPath = resolve(root, 'tsconfig.build.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error('Cannot read SDK compiler configuration.');
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  if (parsed.errors.length) throw new Error('SDK compiler configuration is invalid.');
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  if (program.getSyntacticDiagnostics().length)
    throw new Error('SDK source contains syntax errors.');
  const checker = program.getTypeChecker();
  const sourcePrefix = resolve(root, 'src') + sep;
  const files = program.getSourceFiles().filter((file) => file.fileName.startsWith(sourcePrefix));
  const location = (node) => ({
    file: relative(root, node.getSourceFile().fileName).split(sep).join('/'),
    line: node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1,
  });
  const classes = [];
  const generated = new Map();
  const leaves = new Map();
  const modelShapes = {};
  const authoredShapes = {};
  const generatedRequestShapes = {};
  const functionShapes = {};
  const initializationShapes = {};
  const implementationShapes = {};
  const authoredClassShapes = {};
  const generatedSupportShapes = {};
  for (const file of files) {
    if (
      file.fileName.includes(`${sep}openapi${sep}`) &&
      !file.fileName.includes(`${sep}openapi${sep}types${sep}`) &&
      !file.fileName.includes(`${sep}openapi${sep}api${sep}`)
    )
      generatedSupportShapes[location(file).file] = digest(print(file));
    for (const statement of file.statements) {
      if (ts.isClassDeclaration(statement) && statement.name) {
        classes.push(statement);
        if (!file.fileName.includes(`${sep}openapi${sep}`)) {
          authoredClassShapes[`${location(statement).file}:${statement.name.text}`] = digest(
            print(statement),
          );
          for (const member of statement.members) {
            if (
              ts.isConstructorDeclaration(member) ||
              (ts.isPropertyDeclaration(member) && member.initializer)
            ) {
              const name = ts.isConstructorDeclaration(member) ? 'constructor' : print(member.name);
              const isStatic = member.modifiers?.some(
                (m) => m.kind === ts.SyntaxKind.StaticKeyword,
              );
              const key = `${location(member).file}:${statement.name.text}.${isStatic ? 'static:' : ''}${name}`;
              initializationShapes[key] = digest(print(member));
            }
          }
        }
      }
      const generatedModel = file.fileName.includes(`${sep}openapi${sep}types${sep}`);
      const generatedRequest = file.fileName.includes(`${sep}openapi${sep}api${sep}`);
      const shapes = generatedModel
        ? modelShapes
        : generatedRequest
          ? generatedRequestShapes
          : authoredShapes;
      const prefix =
        generatedModel || generatedRequest
          ? ''
          : relative(root, file.fileName).split(sep).join('/') + ':';
      if (generatedModel || generatedRequest || !file.fileName.includes(`${sep}openapi${sep}`)) {
        if (ts.isFunctionDeclaration(statement) && statement.body && statement.name) {
          functionShapes[prefix + statement.name.text] = {
            signature: signature(statement, checker),
            implementationSha256: digest(print(statement.body)),
          };
        }
        if (ts.isEnumDeclaration(statement)) {
          shapes[prefix + statement.name.text] = {
            kind: 'enum',
            members: statement.members.map(print),
          };
        } else if (ts.isInterfaceDeclaration(statement)) {
          shapes[prefix + statement.name.text] = {
            kind: 'interface',
            extends: statement.heritageClauses?.map(print) ?? [],
            members: statement.members.map(print).sort(),
          };
        } else if (ts.isTypeAliasDeclaration(statement)) {
          shapes[prefix + statement.name.text] = { kind: 'type', type: print(statement.type) };
        } else if (generatedModel && ts.isVariableStatement(statement)) {
          for (const declaration of statement.declarationList.declarations) {
            if (declaration.initializer)
              shapes[`value:${propertyName(declaration.name)}`] = print(declaration.initializer);
          }
        }
      }
      if (!ts.isVariableStatement(statement)) continue;
      if (!file.fileName.includes(`${sep}openapi${sep}`)) {
        for (const declaration of statement.declarationList.declarations) {
          const key = `${location(declaration).file}:${print(declaration.name)}`;
          initializationShapes[key] = digest(print(declaration));
        }
      }
      for (const declaration of statement.declarationList.declarations) {
        if (
          !ts.isIdentifier(declaration.name) ||
          !declaration.name.text.endsWith('AxiosParamCreator') ||
          !declaration.initializer
        )
          continue;
        const className = declaration.name.text.slice(0, -'AxiosParamCreator'.length);
        const returned = declaration.initializer.body?.statements?.find(ts.isReturnStatement);
        if (!returned?.expression || !ts.isObjectLiteralExpression(returned.expression))
          throw new Error(`Cannot extract parameter creator ${className}.`);
        for (const property of returned.expression.properties) {
          if (!ts.isPropertyAssignment(property) || !ts.isArrowFunction(property.initializer))
            throw new Error(`Unsupported generated operation in ${className}.`);
          let path;
          let method;
          let body;
          visit(property.initializer.body, (node) => {
            if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
              if (node.name.text === 'localVarPath') path = staticPath(node.initializer);
              if (node.name.text === 'localVarRequestOptions') {
                const field = node.initializer?.properties?.find(
                  (entry) => entry.name && propertyName(entry.name) === 'method',
                );
                if (field?.initializer && ts.isStringLiteralLike(field.initializer))
                  method = field.initializer.text;
              }
            }
            if (
              ts.isCallExpression(node) &&
              ts.isIdentifier(node.expression) &&
              node.expression.text === 'serializeDataIfNeeded'
            )
              body = print(node.arguments[0]);
          });
          if (!path?.startsWith('/') || !verbs.has(method?.toLowerCase()))
            throw new Error(`Missing generated HTTP route for ${className}.${property.name.text}.`);
          const key = `${className}.${propertyName(property.name)}`;
          if (generated.has(key)) throw new Error(`Duplicate generated method ${key}.`);
          const route = {
            method,
            path,
            body: body ?? null,
            implementationSha256: digest(print(property.initializer.body)),
            input: signature(property.initializer, checker),
            source: location(property),
            generatedMethod: key,
          };
          generated.set(key, route);
          leaves.set(property.initializer, route);
        }
      }
    }
  }
  if (!generated.size || !Object.keys(modelShapes).length)
    throw new Error('Generated operation or model inventory is empty.');
  const authored = classes.filter(
    (clazz) => !clazz.getSourceFile().fileName.includes(`${sep}openapi${sep}`),
  );
  const symbolDeclaration = (expression) => {
    let symbol = checker.getSymbolAtLocation(expression);
    if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    return symbol?.valueDeclaration ?? symbol?.declarations?.[0];
  };
  const instances = new Map();
  const controlPlaneClients = new Set();
  const controlPlaneRoutes = new WeakSet();
  const transports = {};
  const httpClients = new Map();
  for (const clazz of authored) {
    visit(clazz, (node) => {
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(node.left) &&
        node.left.expression.kind === ts.SyntaxKind.ThisKeyword &&
        ts.isNewExpression(node.right)
      ) {
        const target = symbolDeclaration(node.right.expression);
        if (target && ts.isClassDeclaration(target)) {
          const clientKey = `${clazz.name.text}.${node.left.name.text}`;
          instances.set(clientKey, target);
          const configuration = node.right.arguments?.[0];
          const configurationClass =
            configuration && ts.isNewExpression(configuration)
              ? symbolDeclaration(configuration.expression)
              : undefined;
          const options = configuration?.arguments?.[0];
          const base =
            options && ts.isObjectLiteralExpression(options)
              ? options.properties.find(
                  (property) =>
                    ts.isPropertyAssignment(property) && propertyName(property.name) === 'basePath',
                )?.initializer
              : undefined;
          if (
            location(target).file.startsWith('src/openapi/api/') &&
            configurationClass &&
            ts.isClassDeclaration(configurationClass) &&
            location(configurationClass).file === 'src/openapi/configuration.ts' &&
            base &&
            ts.isPropertyAccessExpression(base) &&
            base.name.text === 'apiUrl' &&
            ts.isPropertyAccessExpression(base.expression) &&
            base.expression.name.text === 'config' &&
            base.expression.expression.kind === ts.SyntaxKind.ThisKeyword
          )
            controlPlaneClients.add(clientKey);
        }
      }
    });
  }
  for (const clazz of authored) {
    visit(clazz, (node) => {
      if (ts.isNewExpression(node) && node.expression.getText() === 'Configuration') {
        const base = node.arguments?.[0]?.properties?.find(
          (property) => property.name && propertyName(property.name) === 'basePath',
        );
        if (base?.initializer) transports[`${clazz.name.text}.basePath`] = print(base.initializer);
      }
      if (
        ts.isBinaryExpression(node) &&
        ts.isPropertyAccessExpression(node.left) &&
        node.left.expression.kind === ts.SyntaxKind.ThisKeyword &&
        ts.isCallExpression(node.right)
      ) {
        const factory = symbolDeclaration(node.right.expression);
        const ownedTransport =
          factory &&
          ts.isFunctionDeclaration(factory) &&
          factory.name?.text === 'createOwnedTransport' &&
          location(factory).file === 'src/utils/http-transport.ts';
        if (!ownedTransport && node.right.expression.getText() !== 'axios.create') return;
        let options = node.right.arguments[0];
        if (ownedTransport) {
          if (!options || !ts.isObjectLiteralExpression(options))
            throw new Error('SDK transport options must be a checked object literal.');
          options = options.properties.find(
            (property) => property.name && propertyName(property.name) === 'defaults',
          )?.initializer;
          if (!options || !ts.isObjectLiteralExpression(options))
            throw new Error('SDK transport routing defaults must be a checked object literal.');
        }
        const base = options?.properties?.find(
          (property) => property.name && propertyName(property.name) === 'baseURL',
        );
        if (!base?.initializer) throw new Error('Axios client has no declared base URL.');
        const key = `${clazz.name.text}.${node.left.name.text}`;
        let expression = base.initializer;
        if (ts.isIdentifier(expression)) expression = symbolDeclaration(expression)?.initializer;
        if (!expression) throw new Error(`Unresolved client base URL ${key}.`);
        const baseText = print(expression);
        let target;
        if (ts.isTemplateExpression(expression) && baseText.includes('this.config.pdp'))
          target = 'pdp';
        if (
          ts.isCallExpression(expression) &&
          expression.expression.getText() === 'buildOpaBaseUrl'
        ) {
          target = 'opa';
          transports.opaBaseUrl = print(symbolDeclaration(expression.expression).body);
        }
        if (!target) throw new Error(`Unclassified HTTP transport ${key}: ${baseText}.`);
        httpClients.set(key, target);
        transports[key] = baseText;
      }
    });
  }
  function implementation(clazz, name) {
    const method = checker.getTypeAtLocation(clazz).getProperty(name);
    return method?.declarations?.find((node) => ts.isMethodDeclaration(node) && node.body);
  }
  function concreteCall(call, owner) {
    if (
      ts.isPropertyAccessExpression(call.expression) &&
      ts.isPropertyAccessExpression(call.expression.expression) &&
      call.expression.expression.expression.kind === ts.SyntaxKind.ThisKeyword
    ) {
      const target =
        owner && instances.get(`${owner.name.text}.${call.expression.expression.name.text}`);
      if (target) return implementation(target, call.expression.name.text);
    }
    const symbol = checker.getSymbolAtLocation(call.expression);
    return (
      symbol?.declarations?.find((node) => ts.isMethodDeclaration(node) && node.body) ??
      checker.getResolvedSignature(call)?.declaration
    );
  }
  function alternatives(expression, receiver = false) {
    if (ts.isStringLiteralLike(expression)) return [{ value: expression.text, conditions: {} }];
    if (
      receiver &&
      ts.isPropertyAccessExpression(expression) &&
      expression.expression.kind === ts.SyntaxKind.ThisKeyword
    )
      return [{ value: expression.name.text, conditions: {} }];
    if (ts.isConditionalExpression(expression)) {
      return [true, false].flatMap((condition) =>
        alternatives(condition ? expression.whenTrue : expression.whenFalse, receiver).map(
          (entry) => ({
            ...entry,
            conditions: { ...entry.conditions, [print(expression.condition)]: condition },
          }),
        ),
      );
    }
    if (ts.isIdentifier(expression)) {
      const declaration = symbolDeclaration(expression);
      if (declaration?.initializer) return alternatives(declaration.initializer, receiver);
    }
    throw new Error(`Unresolved HTTP ${receiver ? 'receiver' : 'route'}: ${print(expression)}.`);
  }
  function nativeJsonInput(expression) {
    if (
      ts.isCallExpression(expression) &&
      expression.arguments.length === 1 &&
      ts.isPropertyAccessExpression(expression.expression) &&
      expression.expression.name.text === 'stringify' &&
      ts.isIdentifier(expression.expression.expression) &&
      expression.expression.expression.text === 'JSON' &&
      checker
        .getSymbolAtLocation(expression.expression.expression)
        ?.declarations?.some((declaration) =>
          program.isSourceFileDefaultLibrary(declaration.getSourceFile()),
        )
    )
      return expression.arguments[0];
    return undefined;
  }
  function requestBody(expression) {
    const nativeInput = nativeJsonInput(expression);
    if (nativeInput) return print(nativeInput);
    if (ts.isCallExpression(expression)) {
      const serializer = checker.getResolvedSignature(expression)?.declaration;
      if (
        serializer &&
        ts.isMethodDeclaration(serializer) &&
        serializer.name.getText() === 'serializeInput' &&
        serializer.parent.name?.text === 'Enforcer' &&
        location(serializer).file === 'src/enforcement/enforcer.ts'
      ) {
        const inputs = [];
        visit(serializer.body, (node) => {
          const input = nativeJsonInput(node);
          if (input) inputs.push(input);
        });
        if (inputs.length !== 1 || !ts.isIdentifier(inputs[0]))
          throw new Error('Enforcer serializer must stringify exactly one checked input.');
        const index = serializer.parameters.findIndex(
          (parameter) =>
            checker.getSymbolAtLocation(parameter.name) === checker.getSymbolAtLocation(inputs[0]),
        );
        if (index < 0 || !expression.arguments[index])
          throw new Error('Enforcer serializer must stringify its structural input argument.');
        return print(expression.arguments[index]);
      }
    }
    return print(expression);
  }
  function routesFor(method, seen = new Set()) {
    if (seen.has(method)) return [];
    seen.add(method);
    if (leaves.has(method)) return [leaves.get(method)];
    if (ts.isPropertyAssignment(method)) return routesFor(method.initializer, seen);
    if (!method?.body || !method.getSourceFile().fileName.startsWith(sourcePrefix)) return [];
    if (
      !ts.isMethodDeclaration(method) &&
      !ts.isArrowFunction(method) &&
      !ts.isFunctionDeclaration(method)
    )
      return [];
    let owner = method.parent;
    while (owner && !ts.isClassDeclaration(owner)) owner = owner.parent;
    if (!method.getSourceFile().fileName.includes(`${sep}openapi${sep}`)) {
      const name = method.name ? propertyName(method.name) : '(arrow)';
      const key = `${location(method).file}:${owner?.name?.text ?? ''}.${name}`;
      implementationShapes[key] = digest(print(method));
    }
    const routes = [];
    visit(method.body, (node) => {
      if (!ts.isCallExpression(node)) return;
      const call = node.expression;
      const axiosCall =
        (ts.isPropertyAccessExpression(call) || ts.isElementAccessExpression(call)) &&
        checker.getTypeAtLocation(call.expression).getSymbol()?.getName() === 'AxiosInstance';
      // Generated parameter creators supply the route to the shared request dispatcher.
      if (axiosCall && location(node).file === 'src/openapi/common.ts') return;
      if (axiosCall && (!ts.isPropertyAccessExpression(call) || !verbs.has(call.name.text)))
        throw new Error(`Unsupported Axios dispatch: ${print(node)}.`);
      if (axiosCall) {
        for (const path of alternatives(node.arguments[0])) {
          for (const receiver of alternatives(call.expression, true)) {
            if (
              Object.entries(path.conditions).some(
                ([key, value]) => key in receiver.conditions && receiver.conditions[key] !== value,
              )
            )
              continue;
            const target = httpClients.get(`${owner.name.text}.${receiver.value}`);
            if (!target) throw new Error(`Unknown HTTP client ${receiver.value}.`);
            routes.push({
              method: call.name.text.toUpperCase(),
              path: `/${path.value.replace(/^\//, '')}`,
              target,
              conditions: { ...path.conditions, ...receiver.conditions },
              body: node.arguments[1] ? requestBody(node.arguments[1]) : null,
              response: node.typeArguments?.map(print) ?? [],
              source: location(node),
            });
          }
        }
      } else {
        const declaration = concreteCall(node, owner);
        if (declaration) {
          const resolved = routesFor(declaration, seen);
          const explicitControlPlane =
            owner &&
            ts.isPropertyAccessExpression(call) &&
            ts.isPropertyAccessExpression(call.expression) &&
            call.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
            controlPlaneClients.has(`${owner.name.text}.${call.expression.name.text}`);
          routes.push(
            ...resolved.map((route) => {
              if (!explicitControlPlane) return route;
              const direct = { ...route };
              controlPlaneRoutes.add(direct);
              return direct;
            }),
          );
        }
      }
    });
    if (owner?.name?.text === 'BasePermitApi' && method.name?.text === 'setContextFromApiKey')
      return routes.map((route) => ({ ...route, supporting: true }));
    return routes;
  }
  const generatedMethods = [];
  for (const clazz of classes) {
    if (!clazz.getSourceFile().fileName.includes(`${sep}openapi${sep}api${sep}`)) continue;
    for (const member of clazz.members.filter(ts.isMethodDeclaration)) {
      const key = `${clazz.name.text}.${propertyName(member.name)}`;
      const routes = routesFor(member);
      if (routes.length !== 1)
        throw new Error(`Generated dispatch ${key} must resolve one route, got ${routes.length}.`);
      generatedMethods.push({
        ...routes[0],
        generatedMethod: key,
        dispatchSha256: digest(print(member.body)),
        output: signature(member, checker),
      });
    }
  }
  function factsProxy(clazz) {
    if (clazz.name.text === 'BaseFactsPermitAPI') return true;
    const parent = clazz.heritageClauses?.find(
      (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
    );
    const declaration = parent && symbolDeclaration(parent.types[0].expression);
    return declaration && ts.isClassDeclaration(declaration) ? factsProxy(declaration) : false;
  }
  const methods = [];
  const helpers = [];
  function expose(clazz, exposedType, prefix, seen = new Set()) {
    if (seen.has(clazz)) throw new Error(`Recursive SDK exposure at ${prefix}.`);
    const nested = new Set([...seen, clazz]);
    for (const symbol of exposedType.getProperties()) {
      const name = symbol.getName();
      const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
      if (!declaration || privateMember(declaration)) continue;
      const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
      if (!type.getCallSignatures().length) {
        const instance = instances.get(`${clazz.name.text}.${name}`);
        if (instance) expose(instance, type, `${prefix}.${name}`, nested);
        continue;
      }
      const method = implementation(clazz, name);
      if (!method) throw new Error(`Public method ${prefix}.${name} has no implementation.`);
      const routes = routesFor(method);
      const unique = new Map();
      for (const route of routes)
        unique.set(`${route.target ?? 'api'} ${route.method} ${route.path}`, route);
      const dispatches = routes.filter((route) => !route.supporting);
      const entry = {
        name: `${prefix}.${name}`,
        deprecated:
          method.parent.name.text === 'DeprecatedApiClient' ||
          ts.getJSDocDeprecatedTag(method) !== undefined,
        signature: signature(method, checker),
        publicSignatures: type
          .getCallSignatures()
          .map((entry) =>
            checker.signatureToString(entry, undefined, ts.TypeFormatFlags.NoTruncation),
          ),
        factsProxy:
          factsProxy(clazz) &&
          (dispatches.length === 0 || dispatches.some((route) => !controlPlaneRoutes.has(route))),
        source: location(method),
        routes: [...unique.values()],
      };
      if (entry.routes.length) methods.push(entry);
      else helpers.push(entry);
    }
  }
  const permit = authored.find((clazz) => clazz.name.text === 'Permit');
  if (!permit) throw new Error('Public Permit entry point is missing.');
  expose(permit, checker.getTypeAtLocation(permit), 'permit');
  if (!methods.length) throw new Error('Public HTTP method inventory is empty.');
  return canonical({
    generated: generatedMethods,
    methods: methods.sort((a, b) => compareStrings(a.name, b.name)),
    helpers: helpers.sort((a, b) => compareStrings(a.name, b.name)),
    modelShapes,
    authoredShapes,
    generatedRequestShapes,
    functionShapes,
    initializationShapes,
    implementationShapes,
    authoredClassShapes,
    generatedSupportShapes,
    transports,
  });
}
