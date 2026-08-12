# Evaluation State Hook API

Applies to version: `14.533.15`

Integrations can set supported boolean evaluation-state entries before AC5E evaluates effects.

```js
Hooks.on("automated-conditions-5e.prepareEvaluationState", (extensionState, { activity } = {}) => {
  if (activity?.flags?.your-module?.magical) extensionState.isMagical = true;
});
```

The hook receives `(extensionState, { subjectToken, opponentToken, options, activity, item })`.

Only boolean values for the following entries are applied: `isMagical`, `isSpell`, `isCantrip`, `isScroll`, `isHeal`, `isAoE`, `hasAttack`, `hasDamage`, `hasHealing`, `hasSave`, `hasCheck`, `requiresSpellSlot`, `canMove`, `canSee`, `isSeen`, `isTurn`, `isOpponentTurn`, `isTargetTurn`, and `singleTarget`.
