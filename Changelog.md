## What's changed.
### v12.330331.1 (31/07/2024)
- System compatibility for v12.330 stable.
- Added migration scripts for new auto ranged settings, which can be found under a combined menu. Your settings should migrate and to one of the following options:
  - `Off`: No distance calculations for ranged attacks.
  - `Range checks only`: AC5e will suggest disadvantage for using ranged weapons in long range, and fail for distances longer than that.
  - `Range + Nearby foes`: AC5e will automate the aforementioned range calculation and also the rules for firing a ranged weapon when a hostile creature is adjacent, suggesting disadvantage on the attack roll.
- Changes to `_getDistance()` to cater for v12 changes and to respect the core's diagonal rules. Special thanks to [Illandril](https://github.com/illandril), cause I am using some of the relevant code from [Illandril's Token Tooltips](https://github.com/illandril/FoundryVTT-token-tooltips) module!

- Versioning explainer. Foundry compatible version `12.330`, followed by system version without dots `331` and an incremental module version number `1` => `12.330331.1`
