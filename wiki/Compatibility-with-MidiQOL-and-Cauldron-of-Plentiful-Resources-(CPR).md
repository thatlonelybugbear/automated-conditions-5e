Generally, they can all work together, but I would recommend some settings adjustments:
- Automate D&D5e statuses: Choose either CPR + MidiQOL flags integration or AC5e 
- Range checks: Choose either MidiQOL or AC5e
- Visibility checks: Choose either MidiQOL optional visibility rules or AC5E visibility checks
- AC5E opt-ins require roll dialogs to be configurable. If another module forces `dialog.configure = false`, optional AC5E selections cannot be shown.
- AC5E `enforceMode` is reflected in MidiQOL attribution, so overridden d20-state reasons are hidden in favor of the final forced roll mode.
- AC5E `modifyDC` updates visible MidiQOL save/check item-card DC labels after resolution. When a shared card represents mixed per-target DCs, the shared label is marked with `(*)` and the per-target attribution remains the detailed source of truth.

## Automate d&d5e statuses
### AC5e
You can enable or disable the Automate D&D5e statuses setting, at the very top.

<img width="533" height="98" alt="image" src="https://github.com/user-attachments/assets/4ea6e298-e88f-41bb-b779-dfaa6cbc6a56" />

### CPR 
For CPR, you can find the relevant setting in Game Mechanic Options, second from the top:

<img width="779" height="75" alt="image" src="https://github.com/user-attachments/assets/6b8a3ef7-25b5-4c3a-84f2-8ef7c7a75566" />

## Automate Range Checks
### AC5e
You can enable or disable specific Range checks from the:

<img width="538" height="269" alt="image" src="https://github.com/user-attachments/assets/4ca51c16-4e1f-45f5-b9c1-ff40f221335f" />

### MidiQOL
For MidiQOL range checks, you need to go into settings > Workflow settings > Mechanics tab:

<img width="801" height="174" alt="image" src="https://github.com/user-attachments/assets/d45315ec-4aed-4833-bc68-a2123719ad84" />

For the MidiQOL nearby foes equivalent you can go into settings > Workflow settings > Rules tab, and in Optional Game Rules:

<img width="791" height="80" alt="image" src="https://github.com/user-attachments/assets/6c98163a-ccf2-4cfc-a1cc-2238668871f1" />

Practical note:

- If MidiQOL is handling range checks, AC5E range flags will no longer try to apply their own long-range disadvantage or out-of-range fail logic on top of Midi's result.
- If you want AC5E range flags such as `short=...`, `reach=...`, or `noLongDisadvantage` to drive the outcome, keep AC5E as the range-check owner.

## Visibility Checks
### AC5e
AC5E exposes a dedicated `Visibility checks` setting. When enabled, AC5E drives the `Cannot See Target` / `Target Cannot See Attacker` style roll-state logic and related opt-ins.

Recommendation:

- If you want AC5E to own visibility automation and opt-ins, keep AC5E `Visibility checks` enabled and disable the overlapping MidiQOL optional visibility rules.

### MidiQOL
MidiQOL can also apply overlapping visibility logic through its optional rules for things like hidden attackers and invisibility-related attack handling.

Recommendation:

- If MidiQOL is handling those optional visibility rules, disable AC5E `Visibility checks` to avoid duplicate or competing visibility reasons.

Practical rule:

- Range checks and visibility checks should each have one owner. Pick AC5E or MidiQOL for each category rather than enabling both sides of the same automation.
