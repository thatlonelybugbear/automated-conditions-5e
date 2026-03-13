# Development Changelog (Local)

## Unreleased
## Development Notes

- Transient advantage world-setting follow-up (Date: 2026-03-12)
  - Scope:
    - `scripts/ac5e-helpers.mjs`
  - Advantage/disadvantage override semantics:
    - Adjusted custom world advantage handling so the advantage and disadvantage override formulas are interpreted independently.
    - If the override checkbox is enabled but only one formula is provided, AC5E now converts only that populated side.
    - Blank override formula values no longer suppress the native d20 mechanic for that side; they fall back to the system's normal advantage/disadvantage handling.

- Info / update workflow follow-up (Date: 2026-03-11)
  - Scope:
    - `scripts/ac5e-helpers.mjs`
    - `scripts/ac5e-hooks.mjs`
    - `scripts/ac5e-setpieces.mjs`
    - `lang/en.json`
    - `lang/cs.json`
    - `lang/fr.json`
    - `lang/it.json`
    - `lang/pl.json`
    - `lang/pt-BR.json`
    - `lang/ru.json`
  - DAE / flag-surface wiring:
    - Added `info` to the generated AC5E DAE flag/action-type lists so entries like `attack.info`, `damage.info`, `save.info`, and `use.info` are exposed without manual typing.
    - Added matching compatibility `ACTIONTYPE.info` generation.
  - Config persistence:
    - Added `subject.info` / `opponent.info` arrays to the base AC5E config shape.
    - Persisted `subject.info`, `opponent.info`, `pendingUses`, and `pendingUsesApplied` through safe-use config snapshots so pre-use evaluation can survive into later use/post-use hooks.
  - Validator / parser follow-up:
    - Added `update` to the keyword allowlist so supported `update=...` entries stop warning as unknown keywords.
    - Confirmed `info` remains a non-roll carrier mode rather than going through formula-part injection.
  - Use lifecycle fix:
    - Moved queued `update=...` / pending-use application out of `preUseActivity(...)` and into `postUseActivity(...)` so side effects only run after the activity actually activates.
    - Fixed the post-use hook guard to recognize the actual `postUse` hook name.
    - Fixed early-return behavior so pending uses can still apply even when no created chat message is available.
    - Made `_applyPendingUses(...)` return/await its queue promise so actor updates complete reliably instead of fire-and-forget.
  - Opt-in dialog follow-up:
    - Wired `info` entries into the relevant AC5E opt-in collection path so `attack.info | ... ;optin` style entries actually show as selectable.
    - Removed duplicate `info` sourcing after it appeared twice in roll dialogs from overlapping non-bonus + all-optin collection paths.
  - Tooltip / attribution follow-up:
    - Added a combined localized `Info` tooltip row that merges relevant subject/opponent info labels into one AC5E tooltip entry.
    - Added matching `Info` attribution output for Midi ability/check/save and attack tooltip branches.
    - Added localization keys for the new `Info` label and the non-roll opt-in description text.
