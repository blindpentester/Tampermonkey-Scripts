<div align="center">

# 🧹 Social Feed Blockers

### Tampermonkey userscripts for a quieter, more intentional social feed.

[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-Userscripts-111111?style=for-the-badge&logo=tampermonkey)](https://www.tampermonkey.net/)
[![Facebook](https://img.shields.io/badge/Facebook-Feed_Filter-0866FF?style=for-the-badge&logo=facebook&logoColor=white)](./Facebook-Feed-Filter.md)
[![X](https://img.shields.io/badge/X-Follow_Filter-000000?style=for-the-badge&logo=x&logoColor=white)](./X-Follow-Filter.md)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Promoted_Blocker-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](./LinkedIn-Promoted-Post-Blocker.md)

**Project home:** [https://github.com/blindpentester/Tampermonkey-Scripts](https://github.com/blindpentester/Tampermonkey-Scripts)

</div>

---

## ✨ What this collection is

These scripts are browser-side feed filters built for **Tampermonkey**. Their purpose is to reduce ads, recommendations, promoted content, and other feed items you may not want to see.

The project is designed around a few simple principles:

- 🧠 **Use semantic DOM signals instead of random generated CSS classes**
- ⚡ **Watch dynamic feeds without rescanning the entire page constantly**
- ♻️ **Handle recycled feed elements safely**
- 🔒 **Keep filtering local in the browser**
- 🧩 **Make each rule easy to understand, debug, and extend**
- 🛟 **Fail open when the script is not confident**

> [!IMPORTANT]
> These are independent browser customizations. They are not affiliated with or endorsed by Meta/Facebook, X, LinkedIn, or Tampermonkey.

---

# 📦 Scripts

| Platform | Script | What it targets | Maturity |
|---|---|---|---|
| **Facebook** | [Facebook Feed Filter](./Facebook-Feed-Filter.md) | Ads, `Follow` suggestions, `Suggested for you` posts | 🟢 **Working baseline** |
| **X** | [X Follow Filter](./X-Follow-Filter.md) | Posts from accounts you do not follow | 🟡 **Experimental** |
| **LinkedIn** | [LinkedIn Promoted Post Blocker](./LinkedIn-Promoted-Post-Blocker.md) | `Promoted`, `Promoted by…`, partnership/sponsored posts | 🟠 **Experimental / tuning** |

---

# 🧭 How the blockers work

Modern social feeds are not static web pages. They continuously create, replace, and recycle DOM elements while you scroll.

A simplistic blocker often does this:

```text
Find random CSS class
        ↓
Hide matching element
        ↓
Site changes class name
        ↓
Script breaks
```

These scripts instead aim for:

```text
Feed changes
    ↓
MutationObserver
    ↓
Find affected post/card
    ↓
Read semantic signals
    ↓
Classify the post
    ↓
Hide or restore it
```

---

## 🧠 Semantic signals over generated classes

Generated class names can look like:

```text
x1lliihq
_1470c439
bde1bb6e
```

Those may change without warning.

More useful signals include:

```text
role="listitem"
data-testid="tweet"
aria-label="Open control menu for post by ..."
data-ad-rendering-role="profile_name"
href containing "/ads/about/"
visible disclosure text such as "Promoted"
```

The exact signals differ by platform, but the design philosophy stays the same.

---

# ♻️ Why reversible hiding matters

Facebook, X, and LinkedIn all use highly dynamic interfaces.

A feed element may be:

```text
Ad
```

and later be recycled into:

```text
Normal post
```

Instead of permanently deleting a node, the blockers prefer reversible state:

```html
<div data-something-blocked="1">
    ...
</div>
```

with CSS such as:

```css
[data-something-blocked="1"] {
    display: none !important;
}
```

If the site reuses that element for normal content, the script can remove the attribute and restore it.

---

# ⚡ Performance strategy

The scripts avoid doing a full-document scan for every tiny DOM mutation.

The preferred flow is:

```text
MutationObserver
      ↓
Queue changed roots/posts
      ↓
Collapse duplicate work
      ↓
requestAnimationFrame
      ↓
Process one batch
```

This is especially important on feeds containing:

- autoplay video,
- reactions,
- live counters,
- comments,
- document previews,
- lazy-loaded images,
- and infinite-scroll content.

---

# 🔐 Privacy model

The blockers are intended to operate locally.

They do not need to upload your feed to an outside service to decide what to hide.

Typical operations include:

- reading visible page text,
- reading DOM attributes,
- observing page mutations,
- checking post menus or accessibility labels,
- storing temporary local relationship/cache state,
- and applying local CSS.

> [!NOTE]
> Always review userscript code before installing it. A userscript runs with access to the pages covered by its metadata rules.

---

# 🚀 Installation

## 1. Install Tampermonkey

Install the Tampermonkey extension for your browser.

## 2. Allow scripts to run on the target site

Depending on your browser and extension settings, you may need to enable:

- **Allow User Scripts**
- **Developer Mode**
- **Site Access** for the relevant domains

## 3. Add a script

Open:

```text
Tampermonkey → Dashboard → Create a new script
```

Paste the `.user.js` source, save it, and reload the social network.

## 4. Verify activation

The Tampermonkey toolbar icon should indicate that a script is running on the current page.

Most of these blockers also print a recognizable console prefix.

---

# 🛠 Debugging workflow

When a feed item slips through, the most useful report is:

1. **Platform and page URL**
2. **What the post visibly says**
3. **The complete outer HTML for the post**
4. **Console output from the blocker**
5. **Whether Tampermonkey shows the script as active**
6. **Whether the post appeared immediately or after scrolling**

Do **not** share:

- cookies,
- authentication headers,
- access tokens,
- private messages,
- passwords,
- or other account secrets.

---

# 🗂 Recommended repository layout

```text
Tampermonkey-Scripts/
│
├─ README.md
│
└─ Social-Feed-Blockers/
   ├─ README.md
   ├─ Facebook-Feed-Filter.md
   ├─ X-Follow-Filter.md
   ├─ LinkedIn-Promoted-Post-Blocker.md
   │
   ├─ Facebook-Feed-Filter.user.js
   ├─ X-Follow-Filter.user.js
   └─ LinkedIn-Promoted-Post-Blocker.user.js
```

This keeps documentation and installable scripts together while allowing the root repository to contain your other Tampermonkey tools.

---

# 📚 Platform guides

<table>
<tr>
<td width="33%" valign="top">

## 🔵 Facebook

Filters:

- advertisements
- Follow suggestions
- Suggested for you

**[Read the Facebook guide →](./Facebook-Feed-Filter.md)**

</td>
<td width="33%" valign="top">

## ⚫ X

Filters based on whether the author appears to be an account you follow.

**[Read the X guide →](./X-Follow-Filter.md)**

</td>
<td width="33%" valign="top">

## 🔷 LinkedIn

Targets promoted and sponsored feed cards.

**[Read the LinkedIn guide →](./LinkedIn-Promoted-Post-Blocker.md)**

</td>
</tr>
</table>

---

# 🧪 Project status philosophy

These scripts are intentionally documented with honest maturity levels.

### 🟢 Working baseline
Core detection has performed well across multiple real samples.

### 🟡 Experimental
The concept works, but the platform behavior or detection method is more fragile.

### 🟠 Experimental / tuning
The blocker detects known examples but may still affect feed behavior or miss new variants.

No social-network userscript should be treated as “finished forever.” The sites change too often.

---

# 🤝 Sharing and contributions

If you improve a rule or capture a new post structure, keep the change semantic whenever possible.

Prefer:

```text
"This element is the post menu"
"This text is the advertising disclosure"
"This href is Facebook's ad-information link"
```

over:

```text
"This random class happened to work today"
```

That mindset is what makes these scripts maintainable.

---

<div align="center">

## Cleaner feeds. Local filtering. Understandable code.

**[← Tampermonkey-Scripts repository](https://github.com/blindpentester/Tampermonkey-Scripts)**

</div>
