## ACCESSIBILITY

`axe-core via the a11y addon` · 14 кейсов, расписано 4

| id | Дано | Когда | Тогда |
|---|---|---|---|
| `a11y.roles` ⏳ | interactive elements (Button, Toggle, Input) | axe scans the DOM | correct role/name/state; WCAG violations fail the run |
| `a11y.focus-order` ⏳ | a form-like scene | tabbed through | focus order is logical; every focusable has a visible ring |
| `a11y.contrast` ⏳ | text on every surface + both themes | measured | meets AA; the muted grey is not below threshold |
| `a11y.motion` ⏳ | prefers-reduced-motion on | the settle animation | is reduced/instant, not forced |
