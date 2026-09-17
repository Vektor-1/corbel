# Redesign and Compare test report

## Designs tested

1. Clean modern residential plan
2. Degraded/rotated residential scan
3. Historic residential plan
4. Kitchen remodel plan

## Tested behavior

- Starting Redesign creates a deep-cloned immutable ghost plan.
- The foreground begins empty while retaining the source dimensions and scale.
- The wall tool is activated for the learner.
- Foreground walls can be added without mutating ghost geometry.
- Ghost opacity clamps to the supported 0-1 range.
- The visibility button toggles the ghost between hidden and 25% opacity.
- Undo removes foreground edits without changing the ghost plan.
- Ghost geometry renders before foreground rooms, objects, walls and openings.
- Ghost shapes are non-interactive.
- The normal blank-sheet prompt is suppressed when a ghost reference exists.

All four designs passed the state-isolation and foreground-editing matrix.

## Defects corrected during testing

- Import previously assigned the reconstructed plan to both ghost and foreground, hiding the tracing-paper behavior beneath identical solid geometry.
- Ghost window rendering used a client-side `require()` despite an existing static import.
- Ghost opacity accepted values outside 0-1.
- There was no explicit show/hide comparison toggle.
- The empty-plan onboarding message obscured a redesign ghost before the learner drew foreground geometry.

## Remaining limitations

- Compare state is session-only and does not survive a page refresh.
- Ghost comparison currently appears only in Plan view, not the 3D viewport.
- Save and Export remain visual-only.
- Automated visual regression should be added once browser automation is reliably attached.
