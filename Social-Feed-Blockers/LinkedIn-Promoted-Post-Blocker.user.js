// ==UserScript==
// @name         LinkedIn Promoted Post Blocker
// @namespace    jack.linkedin.promotedblocker
// @version      1.3.0
// @description  Removes Promoted and Sponsored posts from LinkedIn feeds.
// @match        https://www.linkedin.com/feed/*
// @match        https://www.linkedin.com/*
// @match        https://linkedin.com/*
// @match        https://*.linkedin.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
    'use strict';


    // ============================================================
    // CONFIG
    // ============================================================

    const CONFIG = {

        debug: true,

        showInjectionBadge: true,

    };


    // ============================================================
    // SEMANTIC SELECTORS
    //
    // Avoid LinkedIn's generated CSS classes.
    // ============================================================

    const SELECTORS = {

        feedItem:
            '[role="listitem"]',

        updateCard:
            '[role="listitem"][componentkey^="update-card-focus"]',

        postMenu:
            'button[aria-label^="Open control menu for post by"]',

        postBody:
            '[data-testid="expandable-text-box"]',

        sponsoredContent:
            [
                '[alt="View Sponsored Content"]',
                '[aria-label="View Sponsored Content"]'
            ].join(','),

    };


    // ============================================================
    // ATTRIBUTES
    // ============================================================

    const BLOCK_ATTR =
        'data-lipb-blocked';

    const REASON_ATTR =
        'data-lipb-reason';


    // ============================================================
    // STATE
    // ============================================================

    const pendingItems =
        new Set();


    let frameQueued =
        false;

    let observer =
        null;

    let blockedTotal =
        0;

    let restoredTotal =
        0;


    // ============================================================
    // INJECTION PROOF
    // ============================================================

    console.info(
        '%c[LinkedIn Promoted Blocker] v1.3 INJECTED',
        [
            'background:#0a66c2',
            'color:white',
            'font-size:14px',
            'font-weight:bold',
            'padding:5px 8px'
        ].join(';'),
        {
            url: location.href,
            host: location.hostname,
            path: location.pathname
        }
    );


    function log(...args) {

        if (!CONFIG.debug) {
            return;
        }


        console.log(
            '%c[LinkedIn Promoted Blocker]',
            [
                'background:#0a66c2',
                'color:white',
                'font-weight:bold',
                'padding:2px 5px'
            ].join(';'),
            ...args
        );
    }


    // ============================================================
    // TEXT
    // ============================================================

    function normalizeText(value) {

        return String(
            value || ''
        )

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
    // PROMOTED DISCLOSURE DETECTION
    //
    // v1.3:
    //
    // Instead of maintaining a list such as:
    //
    //     Promoted
    //     Promoted by
    //     Promoted • Partnership with
    //
    // treat any HEADER disclosure beginning with "Promoted"
    // as an advertising signal.
    //
    // Matches:
    //
    //     Promoted
    //     Promoted by Popl
    //     Promoted • Partnership with LinkedIn
    //     Promoted · Partnership with ...
    //     Promoted - ...
    //
    // Does NOT match:
    //
    //     I was promoted yesterday
    //     Promoted content is annoying
    //
    // because we additionally reject text inside the post body.
    // ============================================================

    function isPromotedDisclosureText(value) {

        const text =
            normalizeText(
                value
            );


        return (
            /^Promoted(?:$|\s|[•·\-–—:])/i
                .test(
                    text
                )
        );
    }


    // ============================================================
    // CSS
    // ============================================================

    function installCSS() {

        if (
            document.getElementById(
                'lipb-style'
            )
        ) {

            return;
        }


        const style =
            document.createElement(
                'style'
            );


        style.id =
            'lipb-style';


        style.textContent = `

            [${BLOCK_ATTR}="1"] {
                display: none !important;
            }

        `;


        (
            document.head ||
            document.documentElement
        ).appendChild(
            style
        );
    }


    // ============================================================
    // ACTIVATION BADGE
    // ============================================================

    function showInjectionBadge() {

        if (
            !CONFIG.showInjectionBadge ||
            !document.body
        ) {

            return;
        }


        if (
            document.getElementById(
                'lipb-injection-badge'
            )
        ) {

            return;
        }


        const badge =
            document.createElement(
                'div'
            );


        badge.id =
            'lipb-injection-badge';


        badge.textContent =
            'LinkedIn Blocker v1.3 active';


        Object.assign(
            badge.style,
            {

                position:
                    'fixed',

                right:
                    '16px',

                bottom:
                    '16px',

                zIndex:
                    '2147483647',

                background:
                    '#0a66c2',

                color:
                    'white',

                fontFamily:
                    'system-ui, sans-serif',

                fontSize:
                    '13px',

                fontWeight:
                    '600',

                padding:
                    '8px 12px',

                borderRadius:
                    '6px',

                boxShadow:
                    '0 2px 10px rgba(0,0,0,.25)',

                pointerEvents:
                    'none'

            }
        );


        document.body.appendChild(
            badge
        );


        setTimeout(
            () => {
                badge.remove();
            },
            5000
        );
    }


    // ============================================================
    // REAL LINKEDIN FEED POST?
    // ============================================================

    function isFeedPost(item) {

        if (
            !(item instanceof Element)
        ) {

            return false;
        }


        return Boolean(
            item.querySelector(
                SELECTORS.postMenu
            )
        );
    }


    // ============================================================
    // AUTHOR
    // ============================================================

    function getAuthor(item) {

        const menu =
            item?.querySelector?.(
                SELECTORS.postMenu
            );


        const label =
            menu?.getAttribute(
                'aria-label'
            );


        if (!label) {

            return '(unknown)';
        }


        const match =
            label.match(
                /^Open control menu for post by (.+)$/i
            );


        return (
            match
                ? normalizeText(match[1])
                : '(unknown)'
        );
    }


    // ============================================================
    // FIND POST FROM DESCENDANT
    // ============================================================

    function getFeedItem(element) {

        if (
            !(element instanceof Element)
        ) {

            return null;
        }


        /*
         * Current LinkedIn feed structure.
         */
        const updateCard =
            element.closest(
                SELECTORS.updateCard
            );


        if (
            updateCard &&
            isFeedPost(
                updateCard
            )
        ) {

            return updateCard;
        }


        /*
         * Generic semantic fallback.
         */
        let item =
            element.closest(
                SELECTORS.feedItem
            );


        while (item) {

            if (
                isFeedPost(
                    item
                )
            ) {

                return item;
            }


            item =
                item.parentElement?.closest?.(
                    SELECTORS.feedItem
                );
        }


        return null;
    }


    // ============================================================
    // FIND PROMOTED DISCLOSURE
    //
    // Rather than looking only at node.nodeValue, climb a few
    // small ancestors too.
    //
    // This catches LinkedIn splitting:
    //
    //     Promoted
    //     • Partnership with
    //     LinkedIn
    //
    // over several nested spans.
    // ============================================================

    function findPromotedDisclosure(item) {

        if (
            !(item instanceof Element)
        ) {

            return null;
        }


        const walker =
            document.createTreeWalker(
                item,
                NodeFilter.SHOW_TEXT
            );


        let node;


        while (
            (
                node =
                    walker.nextNode()
            )
        ) {

            let current =
                node.parentElement;


            /*
             * Check the direct text parent and a few small
             * containing elements.
             */
            for (
                let depth = 0;
                current &&
                current !== item &&
                depth < 5;
                depth++,
                current =
                    current.parentElement
            ) {

                /*
                 * Never classify ordinary post content as the
                 * advertising disclosure.
                 */
                if (
                    current.closest(
                        SELECTORS.postBody
                    )
                ) {

                    break;
                }


                const text =
                    normalizeText(
                        current.textContent
                    );


                /*
                 * Header disclosures are short.
                 *
                 * Prevent testing huge post containers.
                 */
                if (
                    text.length > 220
                ) {

                    break;
                }


                if (
                    isPromotedDisclosureText(
                        text
                    )
                ) {

                    return {

                        element:
                            current,

                        text

                    };
                }
            }
        }


        return null;
    }


    // ============================================================
    // SPONSORED MEDIA BACKUP
    // ============================================================

    function containsSponsoredContent(
        item
    ) {

        return Boolean(
            item?.querySelector?.(
                SELECTORS.sponsoredContent
            )
        );
    }


    // ============================================================
    // DETECT PROMOTION
    // ============================================================

    function detectPromotion(item) {

        const disclosure =
            findPromotedDisclosure(
                item
            );


        if (disclosure) {

            return {

                reason:
                    'promoted-label',

                disclosure:
                    disclosure.text

            };
        }


        if (
            containsSponsoredContent(
                item
            )
        ) {

            return {

                reason:
                    'sponsored-content',

                disclosure:
                    'View Sponsored Content'

            };
        }


        return null;
    }


    // ============================================================
    // BLOCK
    // ============================================================

    function blockItem(
        item,
        detection
    ) {

        if (
            !(item instanceof Element)
        ) {

            return;
        }


        if (
            item.getAttribute(
                BLOCK_ATTR
            ) === '1'
        ) {

            item.setAttribute(
                REASON_ATTR,
                detection.reason
            );

            return;
        }


        item.setAttribute(
            BLOCK_ATTR,
            '1'
        );


        item.setAttribute(
            REASON_ATTR,
            detection.reason
        );


        blockedTotal++;


        log(
            `🚫 Blocked promoted post #${blockedTotal}`,
            {

                author:
                    getAuthor(
                        item
                    ),

                reason:
                    detection.reason,

                disclosure:
                    detection.disclosure

            }
        );
    }


    // ============================================================
    // RESTORE RECYCLED POSTS
    // ============================================================

    function restoreItem(item) {

        if (
            item.getAttribute(
                BLOCK_ATTR
            ) !== '1'
        ) {

            return;
        }


        item.removeAttribute(
            BLOCK_ATTR
        );


        item.removeAttribute(
            REASON_ATTR
        );


        restoredTotal++;


        log(
            `♻ Restored recycled post #${restoredTotal}`,
            {
                author:
                    getAuthor(item)
            }
        );
    }


    // ============================================================
    // PROCESS FEED ITEM
    // ============================================================

    function processFeedItem(item) {

        if (
            !(item instanceof Element) ||
            !item.isConnected ||
            !isFeedPost(item)
        ) {

            return;
        }


        const detection =
            detectPromotion(
                item
            );


        if (detection) {

            blockItem(
                item,
                detection
            );

        } else {

            /*
             * LinkedIn may recycle an existing feed container.
             */
            restoreItem(
                item
            );
        }
    }


    // ============================================================
    // SCAN ROOT
    // ============================================================

    function scanRoot(root) {

        if (
            !(root instanceof Element)
        ) {

            return;
        }


        if (
            root.matches?.(
                SELECTORS.feedItem
            ) &&
            isFeedPost(
                root
            )
        ) {

            processFeedItem(
                root
            );
        }


        for (
            const item
            of root.querySelectorAll(
                SELECTORS.feedItem
            )
        ) {

            if (
                isFeedPost(
                    item
                )
            ) {

                processFeedItem(
                    item
                );
            }
        }
    }


    // ============================================================
    // QUEUE
    // ============================================================

    function queueItem(item) {

        if (
            !(item instanceof Element) ||
            !item.isConnected
        ) {

            return;
        }


        pendingItems.add(
            item
        );


        scheduleFrame();
    }


    function queueFromNode(node) {

        if (!node) {
            return;
        }


        const element =

            node instanceof Element

                ? node

                : node.parentElement;


        if (!element) {
            return;
        }


        /*
         * Mutation inside an existing post.
         */
        const existingItem =
            getFeedItem(
                element
            );


        if (existingItem) {

            queueItem(
                existingItem
            );

            return;
        }


        /*
         * Mutation may contain newly-created posts.
         */
        if (
            element.matches?.(
                SELECTORS.feedItem
            ) &&
            isFeedPost(
                element
            )
        ) {

            queueItem(
                element
            );
        }


        for (
            const item
            of element.querySelectorAll?.(
                SELECTORS.feedItem
            ) || []
        ) {

            if (
                isFeedPost(
                    item
                )
            ) {

                queueItem(
                    item
                );
            }
        }
    }


    // ============================================================
    // BATCH
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


                const items =
                    [...pendingItems];


                pendingItems.clear();


                for (
                    const item
                    of items
                ) {

                    if (
                        item.isConnected
                    ) {

                        processFeedItem(
                            item
                        );
                    }
                }
            }
        );
    }


    // ============================================================
    // OBSERVER
    // ============================================================

    function installObserver() {

        if (observer) {
            return;
        }


        observer =
            new MutationObserver(
                mutations => {

                    for (
                        const mutation
                        of mutations
                    ) {

                        if (
                            mutation.type ===
                            'childList'
                        ) {

                            queueFromNode(
                                mutation.target
                            );


                            for (
                                const node
                                of mutation.addedNodes
                            ) {

                                queueFromNode(
                                    node
                                );
                            }
                        }


                        else if (
                            mutation.type ===
                            'characterData'
                        ) {

                            queueFromNode(
                                mutation.target
                            );
                        }


                        else if (
                            mutation.type ===
                            'attributes'
                        ) {

                            queueFromNode(
                                mutation.target
                            );
                        }
                    }
                }
            );


        observer.observe(
            document.documentElement,
            {

                subtree:
                    true,

                childList:
                    true,

                characterData:
                    true,

                attributes:
                    true,

                attributeFilter: [

                    'aria-label',

                    'alt',

                    'role',

                    'componentkey'

                ]

            }
        );


        log(
            'Observer active.'
        );
    }


    // ============================================================
    // DEBUG API
    // ============================================================

    window.LinkedInPromotedBlocker = {


        stats() {

            const result = {

                currentlyBlocked:
                    document.querySelectorAll(
                        `[${BLOCK_ATTR}="1"]`
                    ).length,

                blockedTotal,

                restoredTotal,

                queued:
                    pendingItems.size,

                observerActive:
                    Boolean(
                        observer
                    )

            };


            console.table(
                result
            );


            return result;
        },


        inspect() {

            const rows =
                [];


            for (
                const item
                of document.querySelectorAll(
                    SELECTORS.feedItem
                )
            ) {

                if (
                    !isFeedPost(
                        item
                    )
                ) {

                    continue;
                }


                const detection =
                    detectPromotion(
                        item
                    );


                rows.push({

                    author:
                        getAuthor(
                            item
                        ),

                    promoted:
                        Boolean(
                            detection
                        ),

                    disclosure:
                        detection
                            ?.disclosure || '',

                    reason:
                        detection
                            ?.reason || '',

                    blocked:
                        item.getAttribute(
                            BLOCK_ATTR
                        ) === '1',

                    updateCard:
                        item.matches(
                            SELECTORS.updateCard
                        )

                });
            }


            console.table(
                rows
            );


            return rows;
        },


        rescan() {

            scanRoot(
                document.documentElement
            );


            log(
                'Manual rescan complete.'
            );
        },


        test() {

            console.log(
                '%cLinkedIn Promoted Blocker v1.3 is RUNNING',
                [
                    'background:#00a400',
                    'color:white',
                    'font-size:16px',
                    'font-weight:bold',
                    'padding:6px 10px'
                ].join(';'),
                location.href
            );


            return true;
        }

    };


    // ============================================================
    // START
    // ============================================================

    function start() {

        if (
            !document.documentElement
        ) {

            requestAnimationFrame(
                start
            );

            return;
        }


        installCSS();


        /*
         * Start observer immediately.
         */
        installObserver();


        /*
         * Existing content.
         */
        scanRoot(
            document.documentElement
        );


        if (
            document.body
        ) {

            showInjectionBadge();

        } else {

            document.addEventListener(
                'DOMContentLoaded',
                showInjectionBadge,
                {
                    once: true
                }
            );
        }


        log(
            'Started successfully.',
            {
                path:
                    location.pathname
            }
        );
    }


    start();

})();
