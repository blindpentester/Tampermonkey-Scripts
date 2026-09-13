<div align="center">

# 🔷 LinkedIn Promoted Post Blocker

### Hide promoted and sponsored posts from the LinkedIn feed.

[![Status](https://img.shields.io/badge/Status-Experimental_%2F_Tuning-D97706?style=flat-square)](#status)
[![Platform](https://img.shields.io/badge/Platform-LinkedIn-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/)

[← Social Feed Blockers](./README.md) · [Project Home](https://github.com/blindpentester/Tampermonkey-Scripts) · [Facebook](./Facebook-Feed-Filter.md) · [X](./X-Follow-Filter.md)

</div>

---

# 🎯 Purpose

The **LinkedIn Promoted Post Blocker** targets advertising disclosures in the main LinkedIn feed.

Known disclosure variants include:

```text
Promoted
```

```text
Promoted by Popl
```

```text
Promoted • Partnership with LinkedIn
```

Rather than maintaining an endless list of exact advertising phrases, newer detection logic is moving toward:

```text
header disclosure begins with "Promoted"
```

while explicitly excluding normal post-body text.

---

# 🧱 Feed-card boundary

Current LinkedIn captures expose a useful semantic outer boundary:

```html
<div role="listitem" ...>
```

Many feed cards also include:

```text
componentkey="update-card-focus..."
```

A useful post-specific validation signal is:

```css
button[aria-label^="Open control menu for post by"]
```

Example:

```text
Open control menu for post by Piper Phillips
```

This helps distinguish actual feed cards from unrelated `role="listitem"` elements elsewhere on the site.

---

# 📣 Advertising signals

## Primary: visible disclosure

Known examples:

```text
Promoted
Promoted by ...
Promoted • Partnership with ...
```

The current direction is to recognize short header disclosures beginning with:

```text
Promoted
```

while rejecting matching text inside:

```css
[data-testid="expandable-text-box"]
```

That prevents a normal user post such as:

```text
"I was promoted yesterday!"
```

from being incorrectly hidden.

---

## Secondary: accessibility marker

Some LinkedIn ad media exposes:

```text
View Sponsored Content
```

through attributes such as:

```html
alt="View Sponsored Content"
```

or:

```html
aria-label="View Sponsored Content"
```

This gives the blocker an independent backup signal.

---

# 🧠 Why the header/body distinction matters

Consider these two pieces of text:

### Advertising disclosure

```text
Promoted • Partnership with LinkedIn
```

### Normal post body

```text
I was promoted to Director this week.
```

A page-wide text search for `Promoted` would be dangerously broad.

The blocker therefore uses context:

```text
Promoted
    ↓
outside post body
    ↓
inside a validated LinkedIn feed card
    ↓
advertising disclosure
```

---

# 🧩 Split-text handling

LinkedIn may split a disclosure across nested elements:

```html
<span>
    Promoted • Partnership with
    <a>LinkedIn</a>
</span>
```

A text-node-only matcher may see only:

```text
Promoted • Partnership with
```

while the parent element's normalized text is:

```text
Promoted • Partnership with LinkedIn
```

For this reason, robust detection may inspect a few small ancestors around candidate text rather than requiring the entire phrase to exist in one text node.

---

# ⚡ Dynamic feed handling

Like the other platforms, LinkedIn continuously renders and mutates content.

The blocker uses:

```text
MutationObserver
      ↓
Identify affected feed card
      ↓
Queue it
      ↓
requestAnimationFrame
      ↓
Re-check advertising signals
```

This avoids reprocessing every visible post for every reaction counter or lazy-loaded image.

---

# ⚠️ Important current issue: feed virtualization

The current LinkedIn blocker is still being tuned.

A key observed symptom is:

> The feed can become shorter and stop loading additional content after promoted cards are hidden.

This likely means LinkedIn's infinite-scroll or virtualization logic may still count the hidden card's layout/position differently from what the script expects.

That makes this an important architectural issue—not just another missing `Promoted` phrase.

Potential areas to test include:

- whether hiding the outer `role="listitem"` interferes with scroll sentinels,
- whether the correct boundary is one wrapper above or below the current element,
- whether `display: none` causes LinkedIn's virtualizer to stop requesting more items,
- whether a collapsed placeholder is safer than removing layout entirely,
- and whether promoted posts should be replaced with a tiny zero-content spacer instead.

> [!WARNING]
> Until infinite scrolling is confirmed stable, this blocker should be considered experimental.

---

# 🛠 Debugging

Look for:

```text
[LinkedIn Promoted Blocker]
```

Useful helper commands in recent builds include:

```javascript
LinkedInPromotedBlocker.stats()
```

```javascript
LinkedInPromotedBlocker.inspect()
```

```javascript
LinkedInPromotedBlocker.rescan()
```

```javascript
LinkedInPromotedBlocker.test()
```

`inspect()` is particularly useful because it can show whether a feed card was:

- recognized as a post,
- recognized as promoted,
- assigned a disclosure string,
- and actually marked as blocked.

---

# 🧪 Useful missed-post report

Capture:

```text
1. Visible author
2. Exact disclosure text
3. Complete outerHTML for the post
4. LinkedInPromotedBlocker.inspect() output
5. Whether the feed continued loading afterward
6. Whether the ad was present initially or loaded during scrolling
```

This lets development distinguish:

```text
Detection problem
```

from:

```text
Boundary problem
```

from:

```text
Virtualized-feed problem
```

---

# 🔐 Privacy

Filtering is performed against the LinkedIn page already present in the browser.

The blocker does not need an external service to classify promoted posts.

---

# Status

## 🟠 Experimental / tuning

### What is promising

- clear `Promoted` disclosure text,
- useful semantic `role="listitem"` boundaries,
- strong post-menu accessibility labels,
- backup `View Sponsored Content` signals.

### What still needs work

- partnership disclosure variants,
- reliable injection/site access across browsers,
- and most importantly **infinite-scroll behavior after hiding cards**.

The next major LinkedIn milestone should be:

```text
Block promoted cards
        +
preserve normal infinite scrolling
```

before expanding to additional recommendation types.

---

<div align="center">

**[← Overview](./README.md)** · **[Facebook →](./Facebook-Feed-Filter.md)** · **[X →](./X-Follow-Filter.md)**

</div>
