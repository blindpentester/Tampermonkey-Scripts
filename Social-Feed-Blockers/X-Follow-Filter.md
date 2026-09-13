<div align="center">

# ⚫ X Follow Filter

### Reduce feed posts from accounts you do not follow.

[![Status](https://img.shields.io/badge/Status-Experimental-E3B341?style=flat-square)](#status)
[![Platform](https://img.shields.io/badge/Platform-X-000000?style=flat-square&logo=x&logoColor=white)](https://x.com/)

[← Social Feed Blockers](./README.md) · [Project Home](https://github.com/blindpentester/Tampermonkey-Scripts) · [Facebook](./Facebook-Feed-Filter.md) · [LinkedIn](./LinkedIn-Promoted-Post-Blocker.md)

</div>

---

# 🎯 Purpose

The **X Follow Filter** takes a different approach from a conventional ad blocker.

Its goal is to reduce tweets/posts from accounts that you **do not follow**, giving the feed a more follower-focused feel.

That is substantially harder than looking for a simple `Promoted` label because the captured tweet DOM does not reliably expose follow relationship state directly.

---

# 🧱 Stable tweet boundary

The strongest post container discovered is:

```css
article[data-testid="tweet"]
```

That gives the script a clear semantic boundary for one tweet.

---

# 👤 Author identification

The author area is exposed through:

```css
[data-testid="User-Name"]
```

From there, the script can find a profile URL resembling:

```text
/SomeHandle
```

and normalize that into:

```text
somehandle
```

This handle becomes the relationship-cache key.

---

# ❓ The hard part: follow relationship

The tweet captures investigated so far did **not** reliably contain:

```text
Follow
Unfollow
You follow
Follows you
socialContext
recommended
```

inside the tweet itself.

That means the script cannot simply inspect the tweet DOM and know whether the account is followed.

---

# 🧠 Current strategy

The experimental strategy uses X's post menu.

Each tweet normally contains:

```css
button[data-testid="caret"]
```

The script can sequentially inspect the menu and classify the relationship from menu actions such as:

```text
Follow @handle
```

or:

```text
Unfollow @handle
```

Interpretation:

```text
Unfollow @handle
      ↓
already following

Follow @handle
      ↓
not following
```

---

# 🧮 Relationship states

The script treats relationship state conceptually as:

```text
FOLLOWING
NOT_FOLLOWING
UNKNOWN
BUSY
```

### FOLLOWING

Keep the post visible.

### NOT_FOLLOWING

Hide the post.

### UNKNOWN

Fail open and leave it visible.

### BUSY

The account is currently being checked.

---

# 💾 Cache

Opening a menu for every tweet repeatedly would be slow and visually disruptive.

The blocker therefore caches relationship results.

Conceptually:

```text
handle → FOLLOWING
handle → NOT_FOLLOWING
handle → UNKNOWN
```

Known results can live much longer than failed/unknown lookups.

---

# 🛟 Why it fails open

If X changes its menu or the script cannot classify a relationship confidently, the safer behavior is:

```text
show the tweet
```

rather than:

```text
hide it anyway
```

That prevents an X UI change from accidentally wiping most of the feed.

---

# ⚠️ Why this blocker is more experimental

The menu-based method has unavoidable challenges:

- opening menus can cause flicker,
- synthetic clicks may stop working,
- menu labels may be localized,
- X may change menu roles,
- the menu may omit an expected action,
- user-opened menus must not be interrupted,
- and checking many accounts sequentially can be slow.

Because of that, this is a more fragile approach than Facebook's `/ads/about/` signal.

---

# 🔭 Better future strategies

Potential future approaches include:

## Following-page whitelist

Build a local set from the user's X following list:

```text
following page
      ↓
collect handles
      ↓
local whitelist
      ↓
filter feed
```

This could avoid interacting with every post menu.

## Relationship data already present in X's client data

If X exposes reliable relationship information in the page's own loaded data, that could be used instead.

This should only be implemented after confirming the actual payload structure rather than guessing undocumented fields.

---

# ♻️ Feed recycling

X uses a dynamic virtualized feed.

A tweet element can be replaced or reused as you scroll, so hidden state should be validated rather than assumed permanent.

The preferred post boundary remains:

```css
article[data-testid="tweet"]
```

---

# 🛠 Debugging

The experimental blocker exposes a helper object:

```javascript
XFollowFilter
```

Useful commands can include:

```javascript
XFollowFilter.stats()
```

```javascript
XFollowFilter.getCache()
```

```javascript
XFollowFilter.clearCache()
```

```javascript
XFollowFilter.recheck()
```

Exact helper names may evolve with script versions.

---

# 🧪 Useful bug report

For a tweet that was wrongly hidden or left visible, capture:

```text
1. Account handle
2. Whether you actually follow the account
3. Tweet outerHTML
4. Post-menu text
5. XFollowFilter cache entry for that handle
6. Console output
```

Do not include account cookies or authentication tokens.

---

# 🔐 Privacy

Relationship checks and filtering are intended to remain browser-local.

The blocker does not require a remote service to decide which tweets to hide.

---

# Status

## 🟡 Experimental

The semantic tweet boundary and handle extraction are strong.

The weak point is reliably learning follow relationship state without a stable relationship marker directly inside every tweet.

That is the main area for future improvement.

---

<div align="center">

**[← Overview](./README.md)** · **[Facebook →](./Facebook-Feed-Filter.md)** · **[LinkedIn →](./LinkedIn-Promoted-Post-Blocker.md)**

</div>
