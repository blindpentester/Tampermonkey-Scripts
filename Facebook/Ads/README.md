# Remove Ads and Sponsored posts on Facebook:

``` javascript
// ==UserScript==
// @name         Facebook Ad Exterminator
// @namespace    jack.fb.adblock
// @version      1.6.0
// @description  Hides Facebook ads and unsolicited feed posts containing a Follow button.
// @match        *://facebook.com/*
// @match        *://*.facebook.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
    'use strict';


    // ============================================================
    // CONFIGURATION
    // ============================================================

    const DEBUG = true;


    // ============================================================
    // FACEBOOK SELECTORS
    // ============================================================

    /*
     * Strong explicit-ad indicator.
     */
    const AD_LINK_SELECTOR =
        'a[href*="/ads/about/"]';


    /*
     * Facebook's profile/author marker.
     */
    const PROFILE_SELECTOR =
        '[data-ad-rendering-role="profile_name"]';


    /*
     * Facebook post menu.
     *
     * Example:
     *
     * aria-label="Actions for this post by Some Page"
     */
    const ACTION_MENU_SELECTOR =
        '[aria-label^="Actions for this post by"]';


    /*
     * Signals that we've reached the BODY of the post.
     *
     * This is important because the author/header alone can
     * contain:
     *
     *     Author | Follow | ...
     *
     * and we do NOT want to hide only that header.
     */
    const BODY_SELECTOR = [
        '[data-ad-rendering-role="story_message"]',
        '[data-ad-rendering-role="meta"]',
        '[data-ad-rendering-role="title"]',
        '[data-ad-rendering-role="description"]',
        '[data-ad-rendering-role="image"]',

        '[data-ad-comet-preview="message"]',
        '[data-ad-preview="message"]'
    ].join(',');


    /*
     * Signals that we've reached the engagement/footer area.
     *
     * Once an ancestor contains header + body + interactions,
     * we're much more likely to have the COMPLETE post.
     */
    const INTERACTION_SELECTOR = [
        '[data-ad-rendering-role="like_button"]',
        '[data-ad-rendering-role="comment_button"]',
        '[data-ad-rendering-role="share_button"]',

        '[aria-label="Like"]',
        '[aria-label="Share"]',
        '[aria-label^="Leave a comment"]'
    ].join(',');


    // ============================================================
    // OUR ATTRIBUTES
    // ============================================================

    const BLOCK_ATTR =
        'data-fbae-blocked';

    const REASON_ATTR =
        'data-fbae-reason';


    // ============================================================
    // STATE
    // ============================================================

    const blockedNodes =
        new Set();

    const pendingFollowButtons =
        new Set();

    const pendingRoots =
        new Set();


    let blockedAds = 0;
    let blockedFollowPosts = 0;
    let restoredPosts = 0;

    let scanQueued = false;


    // ============================================================
    // STARTUP LOG
    // ============================================================

    console.info(
        '%c[FB Ad Exterminator] v1.6 LOADED',
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

        if (!DEBUG) {
            return;
        }

        console.log(
            '%c[FB Ad Exterminator]',
            [
                'background:#8b0000',
                'color:white',
                'font-weight:bold',
                'padding:2px 5px'
            ].join(';'),
            ...args
        );
    }


    // ============================================================
    // TEXT NORMALIZATION
    // ============================================================

    function normalizedText(element) {

        return (
            element?.textContent || ''
        )
            /*
             * Remove zero-width/invisible characters Facebook
             * sometimes inserts.
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


    // ============================================================
    // BLOCKING CSS
    // ============================================================

    function installCSS() {

        const style =
            document.createElement('style');


        /*
         * Do NOT permanently manipulate inline display styles.
         *
         * Facebook recycles feed DOM nodes.
         *
         * If the node later becomes legitimate content we can
         * simply remove this attribute and it becomes visible again.
         */
        style.textContent = `

            [${BLOCK_ATTR}="1"] {
                display: none !important;
            }

        `;


        (
            document.head ||
            document.documentElement
        ).appendChild(style);
    }


    // ============================================================
    // GENERIC SELECTOR UTILITIES
    // ============================================================

    function countMatches(
        element,
        selector
    ) {

        if (!(element instanceof Element)) {
            return 0;
        }


        let count = 0;


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


    function containsSelector(
        element,
        selector
    ) {

        if (!(element instanceof Element)) {
            return false;
        }


        return Boolean(

            element.matches?.(
                selector
            )

            ||

            element.querySelector(
                selector
            )

        );
    }


    // ============================================================
    // FACEBOOK AD ROLES
    // ============================================================

    function getAdRoles(element) {

        const roles =
            new Set();


        if (!(element instanceof Element)) {
            return roles;
        }


        if (
            element.hasAttribute(
                'data-ad-rendering-role'
            )
        ) {

            const role =
                element.getAttribute(
                    'data-ad-rendering-role'
                );


            if (role) {
                roles.add(role);
            }
        }


        element
            .querySelectorAll(
                '[data-ad-rendering-role]'
            )

            .forEach(node => {

                const role =
                    node.getAttribute(
                        'data-ad-rendering-role'
                    );


                if (role) {
                    roles.add(role);
                }

            });


        return roles;
    }


    // ============================================================
    // FOLLOW BUTTON DETECTION
    // ============================================================

    function isFollowButton(element) {

        if (!(element instanceof Element)) {
            return false;
        }


        /*
         * We specifically require an actual Facebook button.
         *
         * This avoids matching random text such as:
         *
         * "Follow me on Instagram"
         */
        if (
            element.getAttribute('role') !==
            'button'
        ) {
            return false;
        }


        return (
            normalizedText(element) ===
            'Follow'
        );
    }


    function getFollowButtons(root) {

        const results = [];


        if (!(root instanceof Element)) {
            return results;
        }


        /*
         * Root itself might be the button.
         */
        if (
            isFollowButton(root)
        ) {
            results.push(root);
        }


        /*
         * Look underneath it.
         */
        root
            .querySelectorAll(
                '[role="button"]'
            )

            .forEach(button => {

                if (
                    isFollowButton(button)
                ) {
                    results.push(button);
                }

            });


        return results;
    }


    // ============================================================
    // POST INFORMATION
    // ============================================================

    function getAuthor(post) {

        const profile =
            post?.querySelector?.(
                PROFILE_SELECTOR
            );


        return (
            normalizedText(profile) ||
            '(unknown)'
        );
    }


    // ============================================================
    // EXPLICIT AD BOUNDARY DETECTION
    // ============================================================

    function findAdPostBoundary(adLink) {

        if (!(adLink instanceof Element)) {
            return null;
        }


        let current =
            adLink;


        for (
            let depth = 0;
            current &&
            current !== document.body &&
            depth < 30;
            depth++
        ) {

            const adLinks =
                countMatches(
                    current,
                    AD_LINK_SELECTOR
                );


            const actionMenus =
                countMatches(
                    current,
                    ACTION_MENU_SELECTOR
                );


            const profiles =
                countMatches(
                    current,
                    PROFILE_SELECTOR
                );


            /*
             * Crossing one of these thresholds strongly suggests
             * we've reached a container containing multiple posts.
             */
            if (
                adLinks > 1 ||
                actionMenus > 1 ||
                profiles > 1
            ) {

                log(
                    '⚠ Ad boundary crossed into multi-post container',
                    {
                        depth,
                        adLinks,
                        actionMenus,
                        profiles
                    }
                );

                return null;
            }


            const hasBody =
                containsSelector(
                    current,
                    BODY_SELECTOR
                );


            const hasInteractions =
                containsSelector(
                    current,
                    INTERACTION_SELECTOR
                );


            /*
             * Complete explicit advertisement.
             */
            if (
                adLinks === 1 &&
                actionMenus === 1 &&
                profiles === 1 &&
                hasBody &&
                hasInteractions
            ) {

                return current;
            }


            /*
             * Semantic fallback.
             */
            if (
                current.matches?.(
                    '[role="article"]'
                ) &&
                adLinks === 1 &&
                profiles === 1
            ) {

                return current;
            }


            current =
                current.parentElement;
        }


        return null;
    }


    // ============================================================
    // FOLLOW POST BOUNDARY DETECTION
    // ============================================================

    function findFollowPostBoundary(
        followButton
    ) {

        if (
            !(followButton instanceof Element)
        ) {
            return null;
        }


        let current =
            followButton;


        for (
            let depth = 0;
            current &&
            current !== document.body &&
            depth < 30;
            depth++
        ) {

            const actionMenus =
                countMatches(
                    current,
                    ACTION_MENU_SELECTOR
                );


            const profiles =
                countMatches(
                    current,
                    PROFILE_SELECTOR
                );


            const followButtons =
                getFollowButtons(
                    current
                ).length;


            /*
             * ====================================================
             * SAFETY BOUNDARY
             * ====================================================
             *
             * More than one profile/action menu/Follow button
             * usually means we've climbed into a feed wrapper
             * containing several different posts.
             *
             * Never hide that.
             */
            if (
                actionMenus > 1 ||
                profiles > 1 ||
                followButtons > 1
            ) {

                log(
                    '⚠ Follow boundary crossed into multi-post container',
                    {
                        depth,
                        actionMenus,
                        profiles,
                        followButtons
                    }
                );

                return null;
            }


            /*
             * Does this ancestor contain actual post content?
             */
            const hasBody =
                containsSelector(
                    current,
                    BODY_SELECTOR
                );


            /*
             * Does this ancestor contain the engagement/footer?
             */
            const hasInteractions =
                containsSelector(
                    current,
                    INTERACTION_SELECTOR
                );


            /*
             * ====================================================
             * COMPLETE FOLLOW POST
             * ====================================================
             *
             * Must contain:
             *
             *   Author
             *   Follow button
             *   Post Actions menu
             *   Story/body/media
             *   Like / Comment / Share
             *
             * This prevents the old bug where only the post header
             * was hidden and the image/text remained behind.
             */
            if (
                actionMenus === 1 &&
                profiles === 1 &&
                followButtons === 1 &&
                hasBody &&
                hasInteractions
            ) {

                log(
                    '✓ Complete Follow-post boundary found',
                    {
                        depth,

                        author:
                            getAuthor(
                                current
                            ),

                        roles:
                            [
                                ...getAdRoles(
                                    current
                                )
                            ]
                    }
                );


                return current;
            }


            current =
                current.parentElement;
        }


        return null;
    }


    // ============================================================
    // BLOCK POST
    // ============================================================

    function blockPost(
        post,
        reason
    ) {

        if (
            !(post instanceof Element) ||
            !post.isConnected
        ) {
            return;
        }


        /*
         * Already blocked.
         */
        if (
            post.getAttribute(
                BLOCK_ATTR
            ) === '1'
        ) {
            return;
        }


        post.setAttribute(
            BLOCK_ATTR,
            '1'
        );


        post.setAttribute(
            REASON_ATTR,
            reason
        );


        blockedNodes.add(
            post
        );


        const snapshot = {

            author:
                getAuthor(post),

            roles:
                [
                    ...getAdRoles(post)
                ],

            reason
        };


        if (
            reason ===
            'advertisement'
        ) {

            blockedAds++;


            log(
                `☠ Blocked advertisement #${blockedAds}`,
                snapshot
            );

        }


        else if (
            reason ===
            'follow-suggestion'
        ) {

            blockedFollowPosts++;


            log(
                `🚫 Blocked Follow post #${blockedFollowPosts}`,
                snapshot
            );

        }
    }


    // ============================================================
    // PROCESS EXPLICIT AD
    // ============================================================

    function processAdLink(
        adLink
    ) {

        if (
            !(adLink instanceof Element) ||
            !adLink.isConnected
        ) {
            return;
        }


        const post =
            findAdPostBoundary(
                adLink
            );


        if (!post) {

            log(
                '⚠ Found /ads/about/ but complete post boundary was ambiguous'
            );

            return;
        }


        blockPost(
            post,
            'advertisement'
        );
    }


    // ============================================================
    // PROCESS FOLLOW BUTTON
    // ============================================================

    function processFollowButton(
        button
    ) {

        if (
            !(button instanceof Element) ||
            !button.isConnected
        ) {

            pendingFollowButtons.delete(
                button
            );

            return;
        }


        /*
         * It may have changed from:
         *
         * Follow
         *
         * to something else since being queued.
         */
        if (
            !isFollowButton(
                button
            )
        ) {

            pendingFollowButtons.delete(
                button
            );

            return;
        }


        const post =
            findFollowPostBoundary(
                button
            );


        /*
         * Facebook frequently renders:
         *
         *     Author | Follow
         *
         * before it renders:
         *
         *     Story
         *     Image
         *     Like/Comment/Share
         *
         * Don't hide the incomplete header.
         *
         * Queue it and retry after more React mutations arrive.
         */
        if (!post) {

            pendingFollowButtons.add(
                button
            );


            log(
                '⏳ Follow button found; waiting for complete post'
            );


            return;
        }


        pendingFollowButtons.delete(
            button
        );


        blockPost(
            post,
            'follow-suggestion'
        );
    }


    // ============================================================
    // RETRY INCOMPLETE FOLLOW POSTS
    // ============================================================

    function retryPendingFollowButtons() {

        for (
            const button
            of [...pendingFollowButtons]
        ) {

            /*
             * React destroyed/replaced it.
             */
            if (!button.isConnected) {

                pendingFollowButtons.delete(
                    button
                );

                continue;
            }


            /*
             * No longer a Follow button.
             */
            if (
                !isFollowButton(
                    button
                )
            ) {

                pendingFollowButtons.delete(
                    button
                );

                continue;
            }


            const post =
                findFollowPostBoundary(
                    button
                );


            /*
             * Still incomplete.
             */
            if (!post) {
                continue;
            }


            pendingFollowButtons.delete(
                button
            );


            blockPost(
                post,
                'follow-suggestion'
            );
        }
    }


    // ============================================================
    // FACEBOOK DOM RECYCLING PROTECTION
    // ============================================================

    function shouldRemainBlocked(
        post
    ) {

        const reason =
            post.getAttribute(
                REASON_ATTR
            );


        /*
         * Explicit advertisement.
         */
        if (
            reason ===
            'advertisement'
        ) {

            return Boolean(
                post.querySelector(
                    AD_LINK_SELECTOR
                )
            );
        }


        /*
         * Follow recommendation.
         *
         * If Facebook recycled this node into something else,
         * the Follow button should disappear/change.
         */
        if (
            reason ===
            'follow-suggestion'
        ) {

            return (
                getFollowButtons(
                    post
                ).length === 1
            );
        }


        return false;
    }


    function reconcileBlockedNodes() {

        for (
            const post
            of [...blockedNodes]
        ) {

            /*
             * Facebook removed the node completely.
             */
            if (!post.isConnected) {

                blockedNodes.delete(
                    post
                );

                continue;
            }


            /*
             * Facebook reused/recycled the DOM node.
             *
             * The reason we originally hid it no longer exists.
             */
            if (
                !shouldRemainBlocked(
                    post
                )
            ) {

                const previousReason =
                    post.getAttribute(
                        REASON_ATTR
                    );


                post.removeAttribute(
                    BLOCK_ATTR
                );


                post.removeAttribute(
                    REASON_ATTR
                );


                blockedNodes.delete(
                    post
                );


                restoredPosts++;


                log(
                    `♻ Restored recycled post #${restoredPosts}`,
                    {
                        previousReason
                    }
                );
            }
        }
    }


    // ============================================================
    // SCANNER
    // ============================================================

    function scan(root) {

        if (!(root instanceof Element)) {
            return;
        }


        /*
         * First make sure an old hidden DOM node hasn't been
         * recycled into legitimate content.
         */
        reconcileBlockedNodes();


        // --------------------------------------------------------
        // RULE 1:
        // Explicit Facebook ads
        // --------------------------------------------------------

        if (
            root.matches?.(
                AD_LINK_SELECTOR
            )
        ) {

            processAdLink(
                root
            );
        }


        root
            .querySelectorAll(
                AD_LINK_SELECTOR
            )

            .forEach(
                processAdLink
            );


        // --------------------------------------------------------
        // RULE 2:
        // Anything in the feed whose author has a Follow button
        // --------------------------------------------------------

        const followButtons =
            getFollowButtons(
                root
            );


        for (
            const button
            of followButtons
        ) {

            processFollowButton(
                button
            );
        }
    }


    // ============================================================
    // BATCH SCANNING
    // ============================================================

    function queueScan(root) {

        if (!(root instanceof Element)) {
            return;
        }


        pendingRoots.add(
            root
        );


        if (scanQueued) {
            return;
        }


        scanQueued = true;


        requestAnimationFrame(
            () => {

                scanQueued = false;


                /*
                 * React may have recycled something we previously
                 * hid.
                 */
                reconcileBlockedNodes();


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
                 * Important:
                 *
                 * Some Follow posts were discovered before React
                 * finished rendering their body/footer.
                 */
                retryPendingFollowButtons();
            }
        );
    }


    // ============================================================
    // INSTALL + INITIAL SCAN
    // ============================================================

    installCSS();


    scan(
        document.documentElement
    );


    /*
     * Delayed retries catch Facebook posts assembled across
     * multiple React render passes.
     */
    setTimeout(
        retryPendingFollowButtons,
        250
    );


    setTimeout(
        retryPendingFollowButtons,
        750
    );


    setTimeout(
        retryPendingFollowButtons,
        1500
    );


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
                    // CHILDREN ADDED / CONTENT REPLACED
                    // ------------------------------------------------

                    if (
                        mutation.type ===
                        'childList'
                    ) {

                        /*
                         * The parent itself may now represent a more
                         * complete post than it did one render earlier.
                         */
                        if (
                            mutation.target instanceof Element
                        ) {

                            queueScan(
                                mutation.target
                            );
                        }


                        /*
                         * Scan newly inserted content.
                         */
                        for (
                            const node
                            of mutation.addedNodes
                        ) {

                            if (
                                node instanceof Element
                            ) {

                                queueScan(
                                    node
                                );
                            }
                        }
                    }


                    // ------------------------------------------------
                    // RELEVANT ATTRIBUTE CHANGES
                    // ------------------------------------------------

                    else if (
                        mutation.type ===
                            'attributes' &&
                        mutation.target
                            instanceof Element
                    ) {

                        queueScan(
                            mutation.target
                        );
                    }
                }
            }
        );


    observer.observe(
        document.documentElement,
        {

            subtree: true,

            childList: true,

            attributes: true,


            /*
             * Do NOT observe our own data-fbae-* attributes or we'd
             * trigger ourselves repeatedly.
             */
            attributeFilter: [

                'href',

                'aria-label',

                'data-ad-rendering-role',

                'data-ad-preview',

                'data-ad-comet-preview'

            ]
        }
    );


    log(
        'Observer active.'
    );

})();
```
