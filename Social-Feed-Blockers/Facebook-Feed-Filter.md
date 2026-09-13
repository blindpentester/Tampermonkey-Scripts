<div align="center">

# 🔵 Facebook Feed Filter

### Hide Facebook advertisements, Follow suggestions, and recommendation-style feed posts.

[![Status](https://img.shields.io/badge/Status-Working_Baseline-2EA44F?style=flat-square)](#status)
[![Platform](https://img.shields.io/badge/Platform-Facebook-0866FF?style=flat-square&logo=facebook&logoColor=white)](https://www.facebook.com/)

[← Social Feed Blockers](./README.md) · [Project Home](https://github.com/blindpentester/Tampermonkey-Scripts) · [X](./X-Follow-Filter.md) · [LinkedIn](./LinkedIn-Promoted-Post-Blocker.md)

</div>

---

# 🎯 Purpose

The **Facebook Feed Filter** removes several kinds of unwanted feed content while trying to avoid brittle selectors and accidental hiding of normal posts.

Current rule families:

- 🚫 **Advertisements**
- ➕ **Follow suggestions**
- ✨ **Suggested for you**

The Facebook implementation is currently the most mature of the three social-feed blockers.

---

# 🔍 What it detects

## 1. Advertisements

One of the strongest semantic advertising signals discovered in Facebook's DOM is the ad-information URL:

```css
a[href*="/ads/about/"]
```

This is much more useful than relying on a visually obfuscated `Sponsored` label or a generated class name.

### Why this is useful

The link has meaning:

```text
/ads/about/
```

Its purpose is related to advertising even if Facebook changes the surrounding styling.

---

## 2. Follow suggestions

Some recommendation-style posts expose an exact semantic button:

```text
Follow
```

The script identifies the button, validates that it belongs to one complete feed post, and hides that post.

The rule is intentionally more conservative than simply searching the whole page for the word `Follow`.

---

## 3. Suggested for you

Facebook can explicitly label recommendation posts:

```text
Suggested for you
```

This is handled as its own rule so it can be modified independently if Facebook changes how the disclosure is rendered.

---

# 🧱 Finding the complete post

Detecting an ad marker is only half the problem.

The script must hide:

```text
the whole post
```

not:

```text
just the "Sponsored" text
```

Useful Facebook semantic signals include:

```css
[data-ad-rendering-role="profile_name"]
```

and:

```css
[aria-label^="Actions for this post by"]
```

along with body and interaction evidence.

---

# 🧠 Semantic selectors used

Depending on the post, useful roles can include:

```text
data-ad-rendering-role="profile_name"
data-ad-rendering-role="story_message"
data-ad-rendering-role="title"
data-ad-rendering-role="description"
data-ad-rendering-role="image"

data-ad-rendering-role="like_button"
data-ad-rendering-role="comment_button"
data-ad-rendering-role="share_button"
```

Accessibility fallbacks can include:

```text
aria-label="Like"
aria-label="Share"
aria-label^="Leave a comment"
```

> [!TIP]
> These signals are preferable to generated `x...` class names because they describe purpose rather than presentation.

---

# ♻️ React / DOM recycling protection

Facebook can recycle feed containers.

That means a DOM element previously representing:

```text
Follow suggestion
```

can later represent:

```text
ordinary post
```

The blocker therefore uses reversible custom attributes rather than permanently destroying or styling an element.

Conceptually:

```html
<div
  data-fbff-blocked="1"
  data-fbff-reasons="follow-suggestion">
</div>
```

The CSS hides only while the marker is present:

```css
[data-fbff-blocked="1"] {
    display: none !important;
}
```

When the semantic reason disappears, the post can be restored.

---

# 🧩 Rule-engine design

The Facebook version is structured around independent rules.

Conceptually:

```javascript
const RULES = [
    advertisement,
    followSuggestion,
    suggestedForYou
];
```

Each rule owns its own:

- enabled state,
- marker selector or text,
- marker validation,
- label,
- and post-boundary behavior.

This makes future expansion much easier.

Potential future rules could include:

```text
Suggested groups
Suggested pages
People you may know
Reels recommendations
Marketplace recommendations
```

without rewriting the core observer.

---

# ⚡ Performance

Facebook creates huge numbers of DOM changes.

The blocker avoids immediately rescanning the entire document for each mutation.

```text
MutationObserver
      ↓
Queue changed roots
      ↓
Collapse nested roots
      ↓
requestAnimationFrame
      ↓
Reconcile hidden posts
      ↓
Scan affected content
```

This reduces duplicate work during React render bursts.

---

# 🛠 Debugging

Look for console messages beginning with:

```text
[FB Feed Filter]
```

Examples:

```text
[FB Feed Filter] 🚫 Follow suggestion
[FB Feed Filter] 🚫 Suggested for you
[FB Feed Filter] 🚫 Advertisement
[FB Feed Filter] ♻ Restored post
```

Useful console helpers in the modular version include:

```javascript
FBFeedFilter.stats()
```

```javascript
FBFeedFilter.rules()
```

```javascript
FBFeedFilter.rescan()
```

---

# 🧪 How to report a missed Facebook post

The best capture includes:

```text
1. Visible label
2. Complete outerHTML for the post
3. Console messages beginning with [FB Feed Filter]
4. Whether the post appeared on initial load or after scrolling
```

If possible, include the semantic header and interaction area.

---

# 🔐 Privacy

The blocker operates against the page already loaded in your browser.

Its filtering logic does not require sending the contents of your Facebook feed to an outside classification service.

---

# ⚠️ Limitations

Facebook can change:

- DOM nesting,
- semantic data attributes,
- disclosure text,
- accessibility labels,
- post rendering,
- and virtualization behavior.

The rule engine is designed to make those changes easier to adapt to, but no DOM userscript is immune to site updates.

---

# Status

## 🟢 Working baseline

The current Facebook architecture has performed reliably across multiple real post captures.

The strongest areas are:

- explicit `/ads/about/` advertising detection,
- semantic post-boundary validation,
- reversible blocking,
- and batched mutation handling.

---

<div align="center">

**[← Overview](./README.md)** · **[X →](./X-Follow-Filter.md)** · **[LinkedIn →](./LinkedIn-Promoted-Post-Blocker.md)**

</div>
