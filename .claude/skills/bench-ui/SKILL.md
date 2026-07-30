---
name: bench-ui
description: The Bench design system — type scale, spacing rhythm, neutral ramp, button specs, and layout rules. Load before adding or changing any UI in this app so new screens match the existing ones.
---

# Bench UI

Bench is a desktop instrument. It should feel like a well-made tool: quiet,
dense enough to be efficient, and predictable. Every value below is a decision
already made — use it rather than inventing a new one. If something genuinely
isn't covered, extend the scale, don't sidestep it.

The failure mode this exists to prevent: arbitrary pixel values scattered
through components, three different button heights on one screen, and headings
that differ by 1px for no reason. That reads as amateur even when the colours
are fine.

## 1. Type scale

Six sizes. There is no seventh.

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `text-title` | 20px / 26px | 600, `-0.015em` | Page title, one per screen |
| `text-section` | 15px / 20px | 600 | Panel and group headings |
| `text-body` | 13px / 19px | 400 | Default. Descriptions, list rows |
| `text-small` | 12px / 17px | 400 | Secondary and helper text |
| `text-label` | 11px / 14px | 500, `0.06em`, uppercase, mono | Field labels, column headers |
| `text-data` | 12px / 17px | 450, tabular, mono | Machine values |

**Never go below 11px.** The old UI used 10px for most labels; it looked cramped
and cheap and was genuinely hard to read.

**Two families, one rule.** Archivo for anything a human wrote. IBM Plex Mono
for anything a machine produced — URLs, paths, timecodes, resolutions, byte
counts, codecs, percentages, log lines. Mono is a signal that the value is
literal, not a decoration.

Weight carries hierarchy; size is the second lever and colour the third. Do not
use all three at once — a 20px 600-weight title in full-strength ink does not
also need an accent colour.

## 2. Spacing

4px base. Allowed steps: **4, 8, 12, 16, 24, 32, 48**. Nothing else — no `p-5`,
no `gap-7`, no `mt-[13px]`.

| Gap | Between |
|---|---|
| 4 | Icon and its label; tightly bound pairs |
| 8 | Sibling controls in a row; label and its field |
| 12 | Rows inside a panel |
| 16 | Groups inside a panel; panel padding |
| 24 | Panels within a section |
| 32 | Page padding; major sections |

Uniform spacing everywhere is not rhythm, it is a flat list. If two things are
related, put them 8 apart and push the next group to 24. That difference is what
makes a layout readable.

Content column is `max-w-[720px]`. Wider than that and line lengths get hard to
scan; the window can be any size.

## 3. Colour

A nine-step neutral ramp plus one accent. Surfaces step up as they come forward.

| Token | Hex | Use |
|---|---|---|
| `bg` | `#14171C` | App background, the plane behind everything |
| `surface` | `#1A1E24` | Panels |
| `raised` | `#22272F` | Controls on a panel, hover states |
| `overlay` | `#2A303A` | Pressed states, active nav |
| `line` | `#313845` | Default hairline |
| `line-strong` | `#414A59` | Hover borders, dividers needing emphasis |
| `ink-faint` | `#6E7887` | Disabled text, timestamps |
| `ink-dim` | `#9AA4B2` | Secondary text |
| `ink` | `#E8ECF1` | Primary text |

**Accent — `signal` `#E8A33D`.** Amber, from a VU meter. Hover `#F0B155`,
active `#D3902F`. It marks *the one thing you would do next on this screen* and
current selection. That is all.

**Data colours never decorate.** `ok #4FB286`, `warn #E8A33D`, `bad #D9534F` may
only encode a measured fact — native vs upscaled, saved vs failed. A green tick
because green is friendly is a misuse.

Contrast floor: body text ≥ 4.5:1 on its background, labels ≥ 3:1. `ink` on
`surface` is ~13:1; `ink-dim` ~6:1; `ink-faint` ~3.4:1 and is therefore for
non-essential text only.

## 4. Buttons

Three heights, and the padding is fixed per height. This is the single biggest
source of "weird sizing" — a button's width should come from its label, not from
a hand-tuned class.

| Size | Height | Padding-x | Gap | Text |
|---|---|---|---|---|
| `sm` | 28px | 10px | 6px | `text-small` |
| `md` | 34px | 14px | 8px | `text-body` |
| `lg` | 40px | 20px | 8px | `text-body` |

Radius is **6px** on every control. Icons inside buttons are **14px** at `md`
and `lg`, **12px** at `sm`.

Variants:
- **`primary`** — `signal` fill, `#1A1206` text. **One per screen.** If you want
  two, one of them is not primary.
- **`secondary`** — `raised` fill, `line` border. The default.
- **`ghost`** — transparent, `ink-dim` text. Toolbar and inline actions.
- **`danger`** — `bad` text and border, transparent fill.

**Do not stretch buttons to full width by default.** A 720px-wide amber bar is
loud and looks unfinished. Put actions in a right-aligned footer row at their
natural width. Full width is acceptable only inside a narrow card (< 320px) or
when the button genuinely is the entire content of its container.

Disabled means `opacity-50` and `cursor-not-allowed`, never a colour change that
could be mistaken for a different state.

## 5. Panels and structure

A panel is `surface`, a `line` hairline, 8px radius, 16px padding. One inset
top highlight (`inset 0 1px 0 rgb(255 255 255 / 0.03)`) so it reads as a raised
plane. **No drop shadows** — this is a flat, lit-from-above surface, not a card
floating over a page.

Group related fields inside one panel with a 1px `line` divider between groups,
not separate panels. Separate panels mean separate concerns.

Every panel that isn't self-evident gets a `text-label` header.

## 6. Motion

150ms for colour and background transitions, 200ms for size and position.
Standard easing `cubic-bezier(0.2, 0.7, 0.3, 1)`.

Animate on state change, not on arrival — a panel that fades in every time you
switch tabs becomes tiring within a minute. The one orchestrated moment is the
format ladder resolving.

`prefers-reduced-motion: reduce` must collapse all of it.

## 7. Non-negotiables

- Visible keyboard focus on every interactive element: 2px `signal` outline,
  2px offset. Never `outline: none` without a replacement.
- Nothing below 11px, ever.
- Icon-only buttons need `aria-label`.
- Toggle-style controls need `aria-pressed`.
- No horizontal page scroll at 720px window width. Wide content (tables, logs)
  scrolls inside its own container.
- Empty states say what to do next; error states say what happened and how to
  fix it. Neither is a shrug.

## 8. Writing

Sentence case everywhere. No UPPERCASE except `text-label`.

Name the action, not the mechanism: "Fetch formats", not "Submit". The verb on
the button matches the verb in the result — "Download" produces "Downloaded",
not "Transfer complete".

Errors give the real reason. Passing through a backend's actual message beats a
polished sentence that says nothing.

Numbers get units and thousands separators. Timecodes are `hh:mm:ss`. File
sizes are MB/GB with one decimal below 10.
