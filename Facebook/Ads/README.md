# Remove Ads and Sponsored posts on Facebook:

``` javascript
// ==UserScript==
// @name         Facebook Ad Exterminator
// @namespace    jack.fb.adblock
// @version      1.4.0
// @description  Hides Facebook sponsored posts with reversible DOM-safe blocking.
// @match        *://facebook.com/*
// @match        *://*.facebook.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
    'use strict';

    const DEBUG = true;

    const AD_LINK_SELECTOR =
        'a[href*="/ads/about/"]';

    const ACTION_MENU_SELECTOR =
        '[aria-label^="Actions for this post by"]';

    const BLOCK_ATTR =
        'data-fbae-blocked';

    const blockedNodes = new Set();

    let blockedCount = 0;
    let restoredCount = 0;
    let scanQueued = false;

    const pendingRoots = new Set();


    console.info(
        '%c[FB Ad Exterminator] v1.4 LOADED',
        'background:#111;color:#00ff88;font-weight:bold;padding:4px 7px',
        location.href
    );


    function log(...args) {
        if (!DEBUG) {
            return;
        }

        console.log(
            '%c[FB Ad Exterminator]',
            'background:#8b0000;color:white;font-weight:bold;padding:2px 5px',
            ...args
        );
    }


    /*
     * Hide through CSS rather than permanently modifying inline style.
     *
     * Most importantly: this attribute can be REMOVED if React
     * recycles the DOM node for a legitimate post.
     */
    function installCSS() {
        const style =
            document.createElement('style');

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


    function getAdRoles(element) {
        const roles = new Set();

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


    function countAdLinks(element) {
        if (!(element instanceof Element)) {
            return 0;
        }

        let count = 0;

        if (
            element.matches(
                AD_LINK_SELECTOR
            )
        ) {
            count++;
        }

        count +=
            element.querySelectorAll(
                AD_LINK_SELECTOR
            ).length;

        return count;
    }


    function countActionMenus(element) {
        if (!(element instanceof Element)) {
            return 0;
        }

        let count = 0;

        if (
            element.matches(
                ACTION_MENU_SELECTOR
            )
        ) {
            count++;
        }

        count +=
            element.querySelectorAll(
                ACTION_MENU_SELECTOR
            ).length;

        return count;
    }


    function hasPostContent(roles) {
        return (
            roles.has('story_message') ||
            roles.has('title') ||
            roles.has('description') ||
            roles.has('image') ||
            roles.has('meta')
        );
    }


    function hasPostInteraction(roles) {
        return (
            roles.has('like_button') ||
            roles.has('comment_button') ||
            roles.has('share_button')
        );
    }


    /*
     * Find the LOWEST ancestor representing exactly one sponsored post.
     *
     * Critical safety rule:
     *
     * If an ancestor contains >1 Actions menu or >1 /ads/about/
     * link, we've crossed into a container containing multiple posts.
     * ABORT instead of hiding it.
     */
    function findAdPost(adLink) {
        if (!(adLink instanceof Element)) {
            return null;
        }

        let current = adLink;

        for (
            let depth = 0;
            current &&
            current !== document.body &&
            depth < 30;
            depth++
        ) {
            const adLinks =
                countAdLinks(current);

            const actionMenus =
                countActionMenus(current);


            /*
             * We've climbed above the individual post boundary.
             *
             * Never hide this ancestor.
             */
            if (
                adLinks > 1 ||
                actionMenus > 1
            ) {
                log(
                    '⚠ Aborted boundary search: crossed into multi-post container',
                    {
                        adLinks,
                        actionMenus
                    }
                );

                return null;
            }


            const roles =
                getAdRoles(current);

            const hasProfile =
                roles.has('profile_name');

            const hasContent =
                hasPostContent(roles);

            const hasInteraction =
                hasPostInteraction(roles);


            /*
             * This is the structure we've observed in your
             * captured Facebook ads:
             *
             * - exactly one /ads/about/ marker
             * - exactly one post Actions menu
             * - advertiser/profile metadata
             * - body/media metadata
             * - engagement controls
             */
            if (
                adLinks === 1 &&
                actionMenus === 1 &&
                hasProfile &&
                hasContent &&
                hasInteraction
            ) {
                return current;
            }


            /*
             * Secondary semantic boundary.
             */
            if (
                current.matches?.('[role="article"]') &&
                adLinks === 1 &&
                hasProfile
            ) {
                return current;
            }


            current =
                current.parentElement;
        }

        return null;
    }


    function getAdvertiser(post) {
        const node =
            post.querySelector(
                '[data-ad-rendering-role="profile_name"]'
            );

        return (
            node?.textContent
                ?.replace(/\s+/g, ' ')
                .trim()
            || '(unknown)'
        );
    }


    function blockPost(post) {
        if (
            !(post instanceof Element) ||
            !post.isConnected
        ) {
            return;
        }

        if (
            post.getAttribute(BLOCK_ATTR) === '1'
        ) {
            return;
        }

        post.setAttribute(
            BLOCK_ATTR,
            '1'
        );

        blockedNodes.add(post);

        blockedCount++;

        /*
         * Log SNAPSHOTS, not the DOM element itself.
         *
         * Chrome's console keeps object references alive;
         * expanding one later can show the node AFTER React
         * has changed/recycled it.
         */
        log(
            `☠ Blocked ad #${blockedCount}`,
            {
                advertiser:
                    getAdvertiser(post),

                roles:
                    [...getAdRoles(post)],

                adLinks:
                    countAdLinks(post),

                actionMenus:
                    countActionMenus(post)
            }
        );
    }


    /*
     * This is the important new bit.
     *
     * Facebook can recycle an existing feed node for another post.
     * If the /ads/about/ marker disappears, immediately restore it.
     */
    function reconcileBlockedNodes() {
        for (
            const post
            of [...blockedNodes]
        ) {
            if (!post.isConnected) {
                blockedNodes.delete(post);
                continue;
            }

            if (
                !post.querySelector(
                    AD_LINK_SELECTOR
                )
            ) {
                post.removeAttribute(
                    BLOCK_ATTR
                );

                blockedNodes.delete(post);

                restoredCount++;

                log(
                    `♻ Restored recycled node #${restoredCount}`
                );
            }
        }
    }


    function processAdLink(adLink) {
        if (
            !(adLink instanceof Element) ||
            !adLink.isConnected
        ) {
            return;
        }

        const post =
            findAdPost(adLink);

        if (!post) {
            log(
                '⚠ Found /ads/about/ but refused to hide because post boundary was ambiguous'
            );

            return;
        }

        blockPost(post);
    }


    function scan(root) {
        if (!(root instanceof Element)) {
            return;
        }

        /*
         * First restore anything React recycled.
         */
        reconcileBlockedNodes();


        /*
         * Root itself may be the ad link.
         */
        if (
            root.matches(
                AD_LINK_SELECTOR
            )
        ) {
            processAdLink(root);
        }


        /*
         * Find newly inserted sponsored links.
         */
        root
            .querySelectorAll(
                AD_LINK_SELECTOR
            )
            .forEach(
                processAdLink
            );
    }


    function queueScan(root) {
        if (!(root instanceof Element)) {
            return;
        }

        pendingRoots.add(root);

        if (scanQueued) {
            return;
        }

        scanQueued = true;

        requestAnimationFrame(() => {
            scanQueued = false;

            const roots =
                [...pendingRoots];

            pendingRoots.clear();


            /*
             * Do this once per frame before processing
             * new advertisements.
             */
            reconcileBlockedNodes();


            for (const root of roots) {
                if (root.isConnected) {
                    scan(root);
                }
            }
        });
    }


    installCSS();

    scan(
        document.documentElement
    );


    const observer =
        new MutationObserver(
            mutations => {

                for (
                    const mutation
                    of mutations
                ) {

                    /*
                     * React recycling/changing post contents.
                     */
                    if (
                        mutation.type ===
                        'childList'
                    ) {
                        /*
                         * The parent itself might be one of
                         * our hidden/recycled posts.
                         */
                        if (
                            mutation.target
                            instanceof Element
                        ) {
                            queueScan(
                                mutation.target
                            );
                        }


                        for (
                            const node
                            of mutation.addedNodes
                        ) {
                            if (
                                node instanceof
                                Element
                            ) {
                                queueScan(node);
                            }
                        }
                    }


                    /*
                     * Occasionally Facebook may populate href
                     * after inserting the anchor.
                     */
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
             * Importantly, don't observe our own BLOCK_ATTR.
             */
            attributeFilter: [
                'href'
            ]
        }
    );


    log(
        'Observer active.'
    );
})();
```
