// ==UserScript==
// @name         Facebook Feed Filter
// @namespace    jack.fb.feedfilter
// @version      2.2.0
// @description  Hides Facebook ads, Follow/Join suggestions, and Suggested for you posts.
// @match        *://facebook.com/*
// @match        *://*.facebook.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
    'use strict';


    // ============================================================
    // SETTINGS
    //
    // Most future changes should happen here.
    // ============================================================

    const SETTINGS = {

        debug: true,

        /*
         * Maximum number of ancestors we'll climb while looking
         * for the complete Facebook post container.
         */
        maxAncestorDepth: 28,


        /*
         * Enable/disable individual filters.
         */
        rules: {

            advertisement: true,

            followSuggestion: true,

            suggestedForYou: true,

        },


        /*
         * Exact labels used by text/control rules.
         *
         * Easy to expand later:
         *
         * suggestedForYou: [
         *     'Suggested for you',
         *     'Recommended for you'
         * ]
         */
        labels: {

            follow: [
                'Follow',
                'Join'
            ],

            suggestedForYou: [
                'Suggested for you'
            ],

        },

    };


    // ============================================================
    // FACEBOOK SEMANTIC SELECTORS
    //
    // Intentionally avoid Facebook's generated x123abc classes.
    // ============================================================

    const SELECTORS = {


        /*
         * Strong explicit advertisement marker.
         */
        adLink:
            'a[href*="/ads/about/"]',


        /*
         * Facebook author/profile block.
         */
        profile:
            '[data-ad-rendering-role="profile_name"]',


        /*
         * Facebook post menu.
         *
         * Example:
         *
         * aria-label="Actions for this post by Some Page"
         */
        actionMenu:
            '[aria-label^="Actions for this post by"]',


        /*
         * Evidence that we've reached the actual post body.
         */
        body: [

            '[data-ad-rendering-role="story_message"]',

            '[data-ad-rendering-role="meta"]',

            '[data-ad-rendering-role="title"]',

            '[data-ad-rendering-role="description"]',

            '[data-ad-rendering-role="image"]',

            '[data-ad-comet-preview="message"]',

            '[data-ad-preview="message"]',

        ].join(','),


        /*
         * Evidence that we've reached the interaction/footer area.
         */
        interaction: [

            '[data-ad-rendering-role="like_button"]',

            '[data-ad-rendering-role="comment_button"]',

            '[data-ad-rendering-role="share_button"]',

            '[aria-label="Like"]',

            '[aria-label="Share"]',

            '[aria-label^="Leave a comment"]',

        ].join(','),

    };


    // ============================================================
    // OUR DOM ATTRIBUTES
    // ============================================================

    const BLOCK_ATTR =
        'data-fbff-blocked';

    const REASON_ATTR =
        'data-fbff-reasons';


    // ============================================================
    // STATE
    // ============================================================

    /*
     * postElement ->
     *
     * {
     *     reasons: Map(
     *         ruleId -> markerElement
     *     )
     * }
     */
    const blockedPosts =
        new Map();


    /*
     * Markers discovered before Facebook finished rendering the
     * complete post.
     */
    const pendingTriggers =
        new Map();


    /*
     * Mutation roots waiting for the next animation frame.
     */
    const pendingRoots =
        new Set();


    let frameQueued =
        false;


    let blockedTotal =
        0;

    let restoredTotal =
        0;


    // ============================================================
    // STARTUP
    // ============================================================

    console.info(
        '%c[FB Feed Filter] v2.2 LOADED',
        [
            'background:#111',
            'color:#00ff88',
            'font-weight:bold',
            'padding:4px 7px'
        ].join(';'),
        location.href
    );


    // ============================================================
    // LOGGING
    // ============================================================

    function log(...args) {

        if (!SETTINGS.debug) {
            return;
        }


        console.log(
            '%c[FB Feed Filter]',
            [
                'background:#111',
                'color:#00ff88',
                'font-weight:bold',
                'padding:2px 5px'
            ].join(';'),
            ...args
        );
    }


    // ============================================================
    // TEXT HELPERS
    // ============================================================

    function normalizeString(value) {

        return String(
            value || ''
        )

            /*
             * Remove invisible Unicode characters Facebook may use.
             */
            .replace(
                /[\u200B-\u200D\u2060\uFEFF]/g,
                ''
            )

            .replace(
                /\s+/g,
                ' '
            )

            .trim();
    }


    function normalizedText(element) {

        return normalizeString(
            element?.textContent
        );
    }


    function matchesExactLabel(
        element,
        labels
    ) {

        const text =
            normalizedText(
                element
            );


        return labels.some(
            label =>
                text === label
        );
    }


    // ============================================================
    // GENERIC SELECTOR HELPERS
    // ============================================================

    function containsSelector(
        element,
        selector
    ) {

        if (!(element instanceof Element)) {
            return false;
        }


        return (

            element.matches?.(
                selector
            )

            ||

            Boolean(
                element.querySelector(
                    selector
                )
            )

        );
    }


    function countWithin(
        element,
        selector
    ) {

        if (!(element instanceof Element)) {
            return 0;
        }


        let count =
            0;


        if (
            element.matches?.(
                selector
            )
        ) {

            count++;
        }


        count +=
            element.querySelectorAll(
                selector
            ).length;


        return count;
    }


    // ============================================================
    // AUTHOR EXTRACTION
    //
    // v2.1 improvement:
    //
    // Previously the debug output could produce:
    //
    //     "Out in Front · Follow"
    //
    // because we read the entire profile container.
    //
    // Now we prefer the actual profile link.
    // ============================================================

    function getAuthor(post) {

        const profile =
            post?.querySelector?.(
                SELECTORS.profile
            );


        if (!profile) {
            return '(unknown)';
        }


        /*
         * Prefer the actual author profile link.
         */
        const links =
            profile.querySelectorAll(
                'a[href]'
            );


        for (
            const link
            of links
        ) {

            const text =
                normalizedText(
                    link
                );


            if (
                text &&
                text !== 'Follow' &&
                text !== 'Join'
            ) {

                return text;
            }
        }


        /*
         * Fallback:
         *
         * Remove a trailing:
         *
         *     · Follow / Join
         *
         * if Facebook changes the profile-link structure.
         */
        let text =
            normalizedText(
                profile
            );


        text =
            text
                .replace(
                    /\s*[·•]\s*(?:Follow|Join)\s*$/i,
                    ''
                )
                .trim();


        return (
            text ||
            '(unknown)'
        );
    }


    // ============================================================
    // TEXT SCAN SAFETY
    // ============================================================

    function isIgnoredTextContainer(
        element
    ) {

        return Boolean(

            element?.closest?.(
                [
                    'script',
                    'style',
                    'noscript',
                    '[aria-hidden="true"]'
                ].join(',')
            )

        );
    }


    // ============================================================
    // HEADER MARKER VALIDATION
    //
    // Makes sure "Follow", "Join", or "Suggested for you" belongs to the
    // post header rather than ordinary story text.
    // ============================================================

    function looksLikeHeaderMarker(
        marker
    ) {

        if (!(marker instanceof Element)) {
            return false;
        }


        /*
         * Don't allow a rule trigger from inside story content.
         */
        if (
            marker.closest(
                SELECTORS.body
            )
        ) {

            return false;
        }


        /*
         * Don't allow a rule trigger from Like/Comment/Share areas.
         */
        if (
            marker.closest(
                SELECTORS.interaction
            )
        ) {

            return false;
        }


        /*
         * Header labels should reach the profile block relatively
         * quickly while climbing upward.
         */
        let current =
            marker;


        for (
            let depth = 0;
            current &&
            current !== document.body &&
            depth < 12;
            depth++
        ) {

            const profiles =
                countWithin(
                    current,
                    SELECTORS.profile
                );


            /*
             * Multiple profiles means we've crossed into a larger
             * feed container.
             */
            if (
                profiles > 1
            ) {

                return false;
            }


            if (
                profiles === 1
            ) {

                return true;
            }


            current =
                current.parentElement;
        }


        return false;
    }


    // ============================================================
    // RULE REGISTRY
    //
    // Adding future filters should usually mean adding one object
    // here instead of creating another scanning subsystem.
    // ============================================================

    const RULES = [


        // --------------------------------------------------------
        // RULE 1
        // Explicit advertisement
        // --------------------------------------------------------

        {

            id:
                'advertisement',

            label:
                'Advertisement',

            enabled:
                () =>
                    SETTINGS
                        .rules
                        .advertisement,

            kind:
                'selector',

            selector:
                SELECTORS.adLink,

            matchesMarker:
                marker =>

                    marker
                    instanceof Element

                    &&

                    marker.matches(
                        SELECTORS.adLink
                    ),

            headerOnly:
                false,

        },


        // --------------------------------------------------------
        // RULE 2
        // Header contains an exact "Follow" or "Join" button
        // --------------------------------------------------------

        {

            id:
                'follow-suggestion',

            label:
                'Follow / Join suggestion',

            enabled:
                () =>
                    SETTINGS
                        .rules
                        .followSuggestion,

            kind:
                'selector',

            selector:
                '[role="button"]',

            matchesMarker:
                marker =>

                    marker
                    instanceof Element

                    &&

                    marker.getAttribute(
                        'role'
                    ) === 'button'

                    &&

                    matchesExactLabel(
                        marker,
                        SETTINGS
                            .labels
                            .follow
                    ),

            headerOnly:
                true,

        },


        // --------------------------------------------------------
        // RULE 3
        // Exact "Suggested for you" text in the header
        // --------------------------------------------------------

        {

            id:
                'suggested-for-you',

            label:
                'Suggested for you',

            enabled:
                () =>
                    SETTINGS
                        .rules
                        .suggestedForYou,

            kind:
                'text',

            texts:
                SETTINGS
                    .labels
                    .suggestedForYou,

            matchesMarker:
                marker =>

                    marker
                    instanceof Element

                    &&

                    !isIgnoredTextContainer(
                        marker
                    )

                    &&

                    matchesExactLabel(
                        marker,
                        SETTINGS
                            .labels
                            .suggestedForYou
                    ),

            headerOnly:
                true,

        },

    ];


    // ============================================================
    // FAST RULE LOOKUPS
    // ============================================================

    const RULE_BY_ID =
        new Map(
            RULES.map(
                rule => [
                    rule.id,
                    rule
                ]
            )
        );


    /*
     * Exact text ->
     * rule
     */
    const TEXT_RULES =
        new Map();


    for (
        const rule
        of RULES
    ) {

        if (
            rule.kind !==
            'text'
        ) {

            continue;
        }


        for (
            const text
            of rule.texts
        ) {

            TEXT_RULES.set(
                normalizeString(
                    text
                ),
                rule
            );
        }
    }


    // ============================================================
    // COMPLETE POST SHAPE
    // ============================================================

    function hasCompletePostShape(
        element
    ) {

        if (!(element instanceof Element)) {
            return false;
        }


        const profiles =
            countWithin(
                element,
                SELECTORS.profile
            );


        const menus =
            countWithin(
                element,
                SELECTORS.actionMenu
            );


        return (

            profiles === 1

            &&

            menus === 1

            &&

            containsSelector(
                element,
                SELECTORS.body
            )

            &&

            containsSelector(
                element,
                SELECTORS.interaction
            )

        );
    }


    // ============================================================
    // COMPLETE POST BOUNDARY FINDER
    //
    // Used by ALL filter rules.
    // ============================================================

    function findCompletePostBoundary(
        marker
    ) {

        if (!(marker instanceof Element)) {
            return null;
        }


        /*
         * Prefer a semantic article if Facebook gives us one.
         */
        const article =
            marker.closest(
                '[role="article"]'
            );


        if (
            article &&
            hasCompletePostShape(
                article
            )
        ) {

            return article;
        }


        /*
         * Otherwise climb until we find exactly one complete post.
         */
        let current =
            marker;


        for (
            let depth = 0;
            current &&
            current !== document.body &&
            depth <
                SETTINGS.maxAncestorDepth;
            depth++
        ) {

            const profiles =
                countWithin(
                    current,
                    SELECTORS.profile
                );


            const menus =
                countWithin(
                    current,
                    SELECTORS.actionMenu
                );


            /*
             * HARD SAFETY BOUNDARY
             *
             * Multiple authors or Actions menus means we have
             * climbed into a container containing multiple posts.
             */
            if (
                profiles > 1 ||
                menus > 1
            ) {

                return null;
            }


            if (

                profiles === 1

                &&

                menus === 1

                &&

                containsSelector(
                    current,
                    SELECTORS.body
                )

                &&

                containsSelector(
                    current,
                    SELECTORS.interaction
                )

            ) {

                return current;
            }


            current =
                current.parentElement;
        }


        return null;
    }


    // ============================================================
    // CSS
    // ============================================================

    function installCSS() {

        const style =
            document.createElement(
                'style'
            );


        style.textContent = `

            [${BLOCK_ATTR}="1"] {
                display: none !important;
            }

        `;


        (
            document.head ||
            document.documentElement
        )
            .appendChild(
                style
            );
    }


    // ============================================================
    // REASON DISPLAY
    // ============================================================

    function updateReasonAttribute(
        post,
        record
    ) {

        post.setAttribute(

            REASON_ATTR,

            [
                ...record
                    .reasons
                    .keys()
            ].join(',')

        );
    }


    // ============================================================
    // BLOCKING
    // ============================================================

    function addBlockReason(
        post,
        rule,
        marker
    ) {

        if (
            !(post instanceof Element) ||
            !post.isConnected
        ) {

            return;
        }


        let record =
            blockedPosts.get(
                post
            );


        /*
         * First blocking reason for this post.
         */
        if (!record) {

            record = {

                reasons:
                    new Map()

            };


            blockedPosts.set(
                post,
                record
            );


            post.setAttribute(
                BLOCK_ATTR,
                '1'
            );


            blockedTotal++;
        }


        const isNewReason =
            !record
                .reasons
                .has(
                    rule.id
                );


        /*
         * Preserve the actual marker element.
         *
         * This helps detect Facebook recycling the post later.
         */
        record
            .reasons
            .set(
                rule.id,
                marker
            );


        updateReasonAttribute(
            post,
            record
        );


        /*
         * Avoid duplicate log spam.
         */
        if (!isNewReason) {
            return;
        }


        const reasons =
            [
                ...record
                    .reasons
                    .keys()
            ];


        log(

            `🚫 ${rule.label}`,

            {

                author:
                    getAuthor(
                        post
                    ),

                /*
                 * Cleaner than console Array(1).
                 */
                reasons:
                    reasons.join(
                        ', '
                    ),

                blockedTotal,

            }

        );
    }


    // ============================================================
    // RESTORE A POST
    // ============================================================

    function restorePost(
        post,
        record,
        why =
            'marker disappeared or DOM recycled'
    ) {

        post.removeAttribute(
            BLOCK_ATTR
        );


        post.removeAttribute(
            REASON_ATTR
        );


        blockedPosts.delete(
            post
        );


        restoredTotal++;


        log(

            '♻ Restored post',

            {

                author:
                    getAuthor(
                        post
                    ),

                oldReasons:
                    [
                        ...record
                            .reasons
                            .keys()
                    ].join(
                        ', '
                    ),

                why,

                restoredTotal,

            }

        );
    }


    // ============================================================
    // FACEBOOK DOM RECYCLING PROTECTION
    // ============================================================

    function reconcileBlockedPosts() {

        for (
            const [
                post,
                record
            ]
            of blockedPosts
        ) {

            /*
             * Facebook completely removed the post.
             */
            if (
                !post.isConnected
            ) {

                blockedPosts.delete(
                    post
                );

                continue;
            }


            /*
             * Validate each reason independently.
             *
             * A post might simultaneously be:
             *
             *     Follow suggestion
             *     +
             *     Advertisement
             *
             * Losing one reason should not unhide it if the other
             * reason remains valid.
             */
            for (
                const [
                    ruleId,
                    marker
                ]
                of [...record.reasons]
            ) {

                const rule =
                    RULE_BY_ID.get(
                        ruleId
                    );


                const stillValid =

                    Boolean(rule)

                    &&

                    rule.enabled()

                    &&

                    marker
                    instanceof Element

                    &&

                    marker.isConnected

                    &&

                    post.contains(
                        marker
                    )

                    &&

                    rule.matchesMarker(
                        marker
                    );


                if (
                    !stillValid
                ) {

                    record
                        .reasons
                        .delete(
                            ruleId
                        );
                }
            }


            /*
             * Additional safeguard:
             *
             * If Facebook reused this DOM wrapper and it no longer
             * looks like one complete post, clear its reasons.
             */
            if (

                record
                    .reasons
                    .size > 0

                &&

                !hasCompletePostShape(
                    post
                )

            ) {

                record
                    .reasons
                    .clear();
            }


            if (
                record
                    .reasons
                    .size === 0
            ) {

                restorePost(
                    post,
                    record
                );

            } else {

                updateReasonAttribute(
                    post,
                    record
                );
            }
        }
    }


    // ============================================================
    // PROCESS ONE FILTER TRIGGER
    // ============================================================

    function processTrigger(
        rule,
        marker,
        allowPending = true
    ) {

        if (
            !rule.enabled()
        ) {

            return;
        }


        if (
            !(marker instanceof Element) ||
            !marker.isConnected
        ) {

            return;
        }


        if (
            !rule.matchesMarker(
                marker
            )
        ) {

            return;
        }


        /*
         * Follow, Join, and Suggested-for-you must be in a post header.
         */
        if (

            rule.headerOnly

            &&

            !looksLikeHeaderMarker(
                marker
            )

        ) {

            return;
        }


        const post =
            findCompletePostBoundary(
                marker
            );


        /*
         * Facebook may have rendered the header but not yet rendered:
         *
         * body
         * image
         * Like
         * Comment
         * Share
         *
         * Wait instead of hiding a partial wrapper.
         */
        if (!post) {

            if (
                allowPending
            ) {

                pendingTriggers.set(
                    marker,
                    rule.id
                );
            }


            return;
        }


        pendingTriggers.delete(
            marker
        );


        addBlockReason(
            post,
            rule,
            marker
        );
    }


    // ============================================================
    // RETRY PARTIALLY-RENDERED POSTS
    // ============================================================

    function retryPendingTriggers() {

        for (
            const [
                marker,
                ruleId
            ]
            of [...pendingTriggers]
        ) {

            const rule =
                RULE_BY_ID.get(
                    ruleId
                );


            if (

                !rule

                ||

                !rule.enabled()

                ||

                !(marker instanceof Element)

                ||

                !marker.isConnected

                ||

                !rule.matchesMarker(
                    marker
                )

            ) {

                pendingTriggers.delete(
                    marker
                );

                continue;
            }


            processTrigger(
                rule,
                marker,
                false
            );
        }
    }


    // ============================================================
    // SELECTOR-BASED RULE SCANNING
    //
    // Advertisement + Follow / Join
    // ============================================================

    function scanSelectorRule(
        root,
        rule
    ) {

        if (
            !rule.enabled()
        ) {

            return;
        }


        /*
         * Root itself might be a trigger.
         */
        if (
            root.matches?.(
                rule.selector
            )
        ) {

            processTrigger(
                rule,
                root
            );
        }


        /*
         * Descendant triggers.
         */
        for (
            const marker
            of root.querySelectorAll(
                rule.selector
            )
        ) {

            processTrigger(
                rule,
                marker
            );
        }
    }


    // ============================================================
    // TEXT-BASED RULE SCANNING
    //
    // Currently:
    //
    //     Suggested for you
    //
    // Walk text nodes directly rather than evaluating textContent
    // on every div/span in the subtree.
    // ============================================================

    function scanTextRules(
        root
    ) {

        if (
            TEXT_RULES.size === 0
        ) {

            return;
        }


        const walker =
            document.createTreeWalker(

                root,

                NodeFilter.SHOW_TEXT,

                {

                    acceptNode(node) {

                        const value =
                            normalizeString(
                                node.nodeValue
                            );


                        /*
                         * Very cheap exact-string lookup.
                         */
                        if (
                            !TEXT_RULES.has(
                                value
                            )
                        ) {

                            return (
                                NodeFilter
                                    .FILTER_REJECT
                            );
                        }


                        const parent =
                            node.parentElement;


                        if (

                            !parent

                            ||

                            isIgnoredTextContainer(
                                parent
                            )

                        ) {

                            return (
                                NodeFilter
                                    .FILTER_REJECT
                            );
                        }


                        return (
                            NodeFilter
                                .FILTER_ACCEPT
                        );
                    },

                }

            );


        let node;


        while (
            (
                node =
                    walker.nextNode()
            )
        ) {

            const text =
                normalizeString(
                    node.nodeValue
                );


            const rule =
                TEXT_RULES.get(
                    text
                );


            if (
                !rule ||
                !rule.enabled()
            ) {

                continue;
            }


            processTrigger(
                rule,
                node.parentElement
            );
        }
    }


    // ============================================================
    // SCAN ONE SUBTREE
    // ============================================================

    function scan(root) {

        if (
            !(root instanceof Element)
        ) {

            return;
        }


        /*
         * Structural rules.
         */
        for (
            const rule
            of RULES
        ) {

            if (
                rule.kind ===
                'selector'
            ) {

                scanSelectorRule(
                    root,
                    rule
                );
            }
        }


        /*
         * Exact-text rules.
         */
        scanTextRules(
            root
        );
    }


    // ============================================================
    // MUTATION ROOT COMPACTION
    //
    // Prevent:
    //
    //     parent
    //     parent > child
    //     parent > child > grandchild
    //
    // from all being scanned separately in the same frame.
    // ============================================================

    function queueRoot(root) {

        if (
            !(root instanceof Element) ||
            !root.isConnected
        ) {

            return;
        }


        /*
         * If an ancestor is already queued, scanning this smaller
         * root would be redundant.
         */
        for (
            let parent =
                root.parentElement;
            parent;
            parent =
                parent.parentElement
        ) {

            if (
                pendingRoots.has(
                    parent
                )
            ) {

                scheduleFrame();

                return;
            }
        }


        /*
         * If this new root contains already-queued smaller roots,
         * replace them with this larger root.
         */
        for (
            const existing
            of [...pendingRoots]
        ) {

            if (
                root.contains(
                    existing
                )
            ) {

                pendingRoots.delete(
                    existing
                );
            }
        }


        pendingRoots.add(
            root
        );


        scheduleFrame();
    }


    // ============================================================
    // FRAME BATCHING
    // ============================================================

    function scheduleFrame() {

        if (
            frameQueued
        ) {

            return;
        }


        frameQueued =
            true;


        requestAnimationFrame(
            () => {

                frameQueued =
                    false;


                /*
                 * Reconcile ONCE per frame.
                 */
                reconcileBlockedPosts();


                const roots =
                    [...pendingRoots];


                pendingRoots.clear();


                for (
                    const root
                    of roots
                ) {

                    if (
                        root.isConnected
                    ) {

                        scan(
                            root
                        );
                    }
                }


                /*
                 * Retry headers Facebook rendered before their
                 * complete post body/footer.
                 */
                retryPendingTriggers();
            }
        );
    }


    // ============================================================
    // MUTATION OBSERVER
    // ============================================================

    const observer =
        new MutationObserver(
            mutations => {

                for (
                    const mutation
                    of mutations
                ) {


                    // ------------------------------------------------
                    // CHILDREN ADDED / REPLACED
                    // ------------------------------------------------

                    if (
                        mutation.type ===
                        'childList'
                    ) {

                        /*
                         * Parent may now form a complete post.
                         */
                        if (
                            mutation.target
                            instanceof Element
                        ) {

                            queueRoot(
                                mutation.target
                            );
                        }


                        for (
                            const node
                            of mutation.addedNodes
                        ) {

                            if (
                                node
                                instanceof Element
                            ) {

                                queueRoot(
                                    node
                                );

                            }


                            /*
                             * Important for labels rendered directly
                             * as text nodes.
                             */
                            else if (

                                node.nodeType ===
                                    Node.TEXT_NODE

                                &&

                                node.parentElement

                            ) {

                                queueRoot(
                                    node.parentElement
                                );
                            }
                        }
                    }


                    // ------------------------------------------------
                    // EXISTING TEXT CHANGED
                    // ------------------------------------------------

                    else if (
                        mutation.type ===
                        'characterData'
                    ) {

                        if (
                            mutation
                                .target
                                .parentElement
                        ) {

                            queueRoot(
                                mutation
                                    .target
                                    .parentElement
                            );
                        }
                    }


                    // ------------------------------------------------
                    // RELEVANT ATTRIBUTE CHANGED
                    // ------------------------------------------------

                    else if (

                        mutation.type ===
                            'attributes'

                        &&

                        mutation.target
                        instanceof Element

                    ) {

                        queueRoot(
                            mutation.target
                        );
                    }
                }
            }
        );


    // ============================================================
    // DEBUG / CONTROL API
    //
    // Open DevTools and use:
    //
    //     FBFeedFilter.stats()
    //     FBFeedFilter.rules()
    //     FBFeedFilter.rescan()
    //
    // ============================================================

    window.FBFeedFilter = {


        stats() {

            const reasons =
                {};


            for (
                const record
                of blockedPosts.values()
            ) {

                for (
                    const reason
                    of record
                        .reasons
                        .keys()
                ) {

                    reasons[
                        reason
                    ] =
                        (
                            reasons[
                                reason
                            ]

                            ||

                            0
                        )

                        +

                        1;
                }
            }


            const result = {

                currentlyBlocked:
                    blockedPosts.size,

                blockedTotal,

                restoredTotal,

                pendingTriggers:
                    pendingTriggers.size,

                ...reasons,

            };


            console.table(
                result
            );


            return result;
        },


        rules() {

            const result =
                Object.fromEntries(

                    RULES.map(
                        rule => [

                            rule.id,

                            rule.enabled()

                        ]
                    )

                );


            console.table(
                result
            );


            return result;
        },


        rescan() {

            scan(
                document.documentElement
            );


            retryPendingTriggers();


            log(
                'Manual rescan complete.'
            );
        },

    };


    // ============================================================
    // INSTALL
    // ============================================================

    installCSS();


    // ============================================================
    // INITIAL FULL SCAN
    // ============================================================

    scan(
        document.documentElement
    );


    // ============================================================
    // OBSERVER
    // ============================================================

    observer.observe(
        document.documentElement,
        {

            subtree:
                true,

            childList:
                true,

            /*
             * Needed for exact labels such as:
             *
             * Suggested for you
             */
            characterData:
                true,

            attributes:
                true,


            /*
             * Don't observe our own data-fbff-* attributes.
             */
            attributeFilter: [

                'href',

                'role',

                'aria-label',

                'data-ad-rendering-role',

                'data-ad-preview',

                'data-ad-comet-preview',

            ],

        }
    );


    // ============================================================
    // DELAYED RETRIES
    //
    // Only pending trigger elements are rechecked.
    //
    // We do NOT rescan the entire document.
    // ============================================================

    setTimeout(
        retryPendingTriggers,
        300
    );


    setTimeout(
        retryPendingTriggers,
        1000
    );


    setTimeout(
        retryPendingTriggers,
        2000
    );


    log(
        'Observer active.'
    );

})();
