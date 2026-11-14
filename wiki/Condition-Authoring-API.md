# Condition Authoring API

`ac5e.conditions` provides standalone condition authoring for modules and macros. It does not require an Active Effect, an AC5E flag, or an action integration. AC5E does not save the expression or execute the caller's actions.

## Availability and capabilities

The API is published after AC5E finishes setup, together with `ac5e.evaluationData` and `ac5e.safeEval`. Listen for `ac5e.ready` or use the API immediately if it already exists. With Midi-QOL active, setup waits for `midi-qol.midiReady`; another module's `ready` callback alone does not guarantee availability.

```js
function connect(ac5e) {
  if (ac5e.conditions?.version !== 1) return;
  if (!ac5e.conditions.capabilities.editor) return;
  // Enable your condition-editor control here.
}
if (globalThis.ac5e?.conditions) connect(globalThis.ac5e);
else Hooks.once('ac5e.ready', connect);
```

Version 1 exposes these capabilities:

```js
ac5e.conditions.version === 1;
ac5e.conditions.capabilities;
// { editor: true, syntaxValidation: true, autocomplete: true,
//   contextualEntries: true }
```

## Public signatures

```js
ac5e.conditions.openEditor({ expression = '', context = {}, title = '' } = {});
// Promise<string|null>: accepted text, or null for Cancel, Escape, or window close.

ac5e.conditions.validate({ expression = '', context = {} } = {});
// { valid: boolean, diagnostics: Array<{ severity: 'error', code, message }> }

ac5e.conditions.getAutocompleteEntries({ context = {} } = {});
// Array<{ identifier: string, label: string, source: string, hint: string }>
```

The editor reuses AC5E's pill-based expression assistance, operator buttons, and syntax diagnostics. Typing and keyboard completion use the same assistance as the normal expanded AC5E editors; there is no separate dropdown. Invalid expressions cannot be accepted. An accepted empty string means the caller should treat its condition as unconditional; it is distinct from cancellation. The caller owns storage, including saving or discarding the returned string.

Validation compiles the expression without invoking it. It does not build an evaluation sandbox, read runtime values, roll dice, or run helpers. Diagnostic codes are `syntax-error`, `restricted-identifier`, and `invalid-type`. Invalid context metadata throws `TypeError`. Engine syntax messages can vary; use the code for programmatic handling.

Syntax validity does not guarantee successful runtime evaluation. Missing data, unavailable distances, or helper failures belong to evaluation through `ac5e.safeEval`, not syntax diagnostics. Unknown identifiers are allowed at authoring time, matching AC5E's contextual expressions. This API does not provide unknown-variable or type checking.

## Context extensions

Supply `context.entries` as data paths, optionally with plain-text hints:

```js
const context = {
  entries: [
    { identifier: 'aa5e', hint: 'Current action result context' },
    { identifier: 'aa5e.hit', hint: 'Whether this attack hit this recipient' },
    'aa5e.recipientCount'
  ]
};
const expression = await ac5e.conditions.openEditor({
  expression: 'aa5e.hit && rollingActor.attributes.hp.pct < 50',
  title: 'Action condition',
  context
});
if (expression !== null) {
  // Save expression in your module's own configuration.
}
```

Entries extend AC5E suggestions for that call only. They do not register globals, bind values, add functions, or change the runtime sandbox. Paths must use dotted identifiers; reserved members and global access paths are rejected. Hints are text, never HTML. Returned metadata is copied on each call. Editor classes are not part of the public API.

The calling module supplies the matching data when it evaluates its condition. Prefer a module namespace with plain data and do not replace AC5E helpers or pass globals, documents, or unrestricted function references as extensions:

```js
const sandbox = ac5e.evaluationData({
  subjectToken,
  opponentToken,
  sourceActor,
  targetActor,
  options
});
sandbox.aa5e = { hit: true, recipientCount: 1 };
const eligible = !expression.trim() || ac5e.safeEval({
  expression,
  sandbox,
  mode: 'condition'
});
```

Build this sandbox fresh at the relevant result stage, only for conditional actions. It may be reused for expressions within the same evaluation event. The editor and validator do not process AC5E effects or add any post-roll hooks. The existing `safeEval` restrictions continue to apply, including the prohibition on `game` and `canvas` identifiers outside quoted text. This API is not a security boundary for arbitrary untrusted JavaScript.
