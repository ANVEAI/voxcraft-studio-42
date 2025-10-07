import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[EMBED JS] Request received:", req.method, req.url);

  // Extract parameters from URL
  const url = new URL(req.url);
  const embedId = url.searchParams.get("embedId");
  const position = url.searchParams.get("position") || "bottom-right";
  const theme = url.searchParams.get("theme") || "light";

  // For backward compatibility, support old format
  let assistant = url.searchParams.get("assistant");
  let apiKey = url.searchParams.get("apiKey");

  // If embedId is provided, fetch mapping from database
  if (embedId) {
    try {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.57.4");
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const { data: mapping, error } = await supabase
        .from("embed_mappings")
        .select("vapi_assistant_id, api_key, is_active, domain_whitelist")
        .eq("embed_id", embedId)
        .single();

      if (error || !mapping) {
        console.error("[EMBED JS] Failed to fetch embed mapping:", error);
        return new Response(`console.error('Invalid embed ID: ${embedId}');`, {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/javascript",
          },
        });
      }

      if (!mapping.is_active) {
        console.log("[EMBED JS] Embed is inactive:", embedId);
        return new Response(`console.warn('This embed has been disabled');`, {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/javascript",
          },
        });
      }

      // Domain whitelist check (optional)
      const referer = req.headers.get("Referer");
      if (mapping.domain_whitelist && mapping.domain_whitelist.length > 0 && referer) {
        const refererDomain = new URL(referer).hostname;
        const isAllowed = mapping.domain_whitelist.some(
          (domain) => refererDomain === domain || refererDomain.endsWith(`.${domain}`),
        );

        if (!isAllowed) {
          console.warn("[EMBED JS] Domain not whitelisted:", refererDomain);
          return new Response(`console.error('Domain not authorized for this embed');`, {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/javascript",
            },
          });
        }
      }

      assistant = mapping.vapi_assistant_id;
      apiKey = mapping.api_key;
      console.log("[EMBED JS] Embed mapping loaded:", { embedId, assistant });
    } catch (err) {
      console.error("[EMBED JS] Database lookup failed:", err);
      return new Response(`console.error('Failed to load embed configuration');`, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/javascript",
        },
      });
    }
  } else if (!assistant || !apiKey) {
    // If no embedId and no assistant/apiKey, return error
    return new Response(`console.error('Missing embed parameters');`, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/javascript",
      },
    });
  }

  console.log("[EMBED JS] Parameters:", { embedId, assistant, position, theme });

  const jsContent = `// VAPI-Centric Voice Automation Embed Script with Enhanced Dropdown Support
// Load Supabase JS first (add this once to your page)
if (!window.supabase) {
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/supabase-js/2.53.0/supabase.min.js';
  script.async = true;
  document.head.appendChild(script);
}

(function() {
  'use strict';
  
  // Configuration - Dynamically injected from URL parameters
  const BOT_CONFIG = {
    assistantId: "${assistant}",
    apiKey: "${apiKey}",
    position: "${position}",
    theme: "${theme}"
  };

  // Supabase configuration
  const SUPABASE_URL = 'https://mdkcdjltvfpthqudhhmx.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ka2Nkamx0dmZwdGhxdWRoaG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NDU3NTAsImV4cCI6MjA2OTUyMTc1MH0.YJAf_8-6tKTXp00h7liGNLvYC_-vJ4ttonAxP3ySvOg';

  class VAPICommandExecutor {
    constructor() {
      this.vapiWidget = null;
      this.supabaseClient = null;
      this.realtimeChannel = null;
      this.discoveryChannel = null;
      this.isInitialized = false;
      this.currentPageElements = [];
      this.statusEl = null;
      this.assistantId = null;
      this.currentCallId = null;
      this.isCallActive = false;
      this.widgetBtn = null;
      this.visualizer = null;
      this.widgetStatusEl = null;
      this.isCallInitiator = false;
      this.isSessionChannelReady = false;
      this.queuedCommands = [];
      this.discoveryCleanupTimeout = null;
      this.pendingFirstCommand = null;
      this.sessionId = this.generateSessionId();
      this.openDropdowns = new Set(); // Track currently open dropdowns
      this.dropdownCache = new Map(); // Cache dropdown structures
      this.contextCache = null; // Cache for page context
      this.contextCacheTimestamp = 0; // Timestamp of last context extraction
      this.contextCacheTTL = 30000; // Cache TTL: 30 seconds
      this.dropdownOpening = false; // Flag when dropdown is opening
      this.commandQueue = []; // Queue commands during dropdown opening
      
      this.init();
    }

    generateSessionId() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }

    init() {
      console.log('🎤 Initializing VAPI Command Executor...');
      this.createStatusIndicator();
      this.updateStatus("Loading voice automation...");
      this.analyzePageContent();
      this.setupSupabaseRealtime();
      this.loadVapiSDK();
      this.setupDropdownMonitoring(); // NEW: Monitor dropdown state changes
      this.setupContextCacheInvalidation(); // NEW: Invalidate context cache on navigation
    }

    // NEW: Monitor dropdown state changes in React apps
    setupDropdownMonitoring() {
      // Use MutationObserver to detect when dropdowns are rendered
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.addedNodes.length > 0) {
            // Check if any added nodes are dropdown menus
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === 1) { // Element node
                this.detectAndCacheDropdown(node);
              }
            });
          }
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      this.dropdownObserver = observer;
    }

    // NEW: Setup context cache invalidation on navigation
    setupContextCacheInvalidation() {
      // Invalidate cache on URL change (SPA navigation)
      window.addEventListener('popstate', () => {
        this.contextCache = null;
        this.contextCacheTimestamp = 0;
        console.log('[CONTEXT] 🔄 Cache invalidated due to navigation');
      });

      // Invalidate cache on pushState/replaceState (React Router, Next.js)
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;

      history.pushState = (...args) => {
        originalPushState.apply(history, args);
        this.contextCache = null;
        this.contextCacheTimestamp = 0;
        console.log('[CONTEXT] 🔄 Cache invalidated due to pushState');
      };

      history.replaceState = (...args) => {
        originalReplaceState.apply(history, args);
        this.contextCache = null;
        this.contextCacheTimestamp = 0;
        console.log('[CONTEXT] 🔄 Cache invalidated due to replaceState');
      };
    }

    // NEW: Detect and cache dropdown structures
    detectAndCacheDropdown(element) {
      // Look for common dropdown patterns
      const dropdownSelectors = [
        '[role="menu"]',
        '[role="navigation"] ul',
        '.dropdown-menu',
        '.dropdown-content',
        '.menu-dropdown',
        '[class*="dropdown"]',
        '[class*="submenu"]',
        '[data-dropdown]'
      ];

      dropdownSelectors.forEach(selector => {
        try {
          const dropdowns = element.matches?.(selector) ? [element] : element.querySelectorAll?.(selector) || [];
          dropdowns.forEach(dropdown => {
            if (this.isVisible(dropdown)) {
              const items = this.extractDropdownItems(dropdown);
              if (items.length > 0) {
                const parentTrigger = this.findDropdownTrigger(dropdown);
                if (parentTrigger) {
                  const triggerText = this.getElementText(parentTrigger);
                  this.dropdownCache.set(triggerText.toLowerCase(), {
                    trigger: parentTrigger,
                    menu: dropdown,
                    items: items,
                    timestamp: Date.now()
                  });
                  console.log('[DROPDOWN] Cached dropdown:', triggerText, 'with', items.length, 'items');
                }
              }
            }
          });
        } catch (e) {
          // Selector might not be valid
        }
      });
    }

    // NEW: Extract items from dropdown menu
    extractDropdownItems(dropdown) {
      const items = [];
      const itemSelectors = ['a', 'button', '[role="menuitem"]', 'li > *'];
      
      itemSelectors.forEach(selector => {
        try {
          dropdown.querySelectorAll(selector).forEach(item => {
            const text = this.getElementText(item);
            if (text && text.length > 0) {
              items.push({
                element: item,
                text: text,
                href: item.href || ''
              });
            }
          });
        } catch (e) {
          // Continue
        }
      });

      return items;
    }

    // ✅ ENHANCED: Smart element finder that handles conditionally rendered dropdowns
    async findElementSmart(targetText, elementType = null, retryCount = 0) {
      const maxRetries = 3;
      
      console.log(\`[SMART FIND] 🔍 Searching for: "\${targetText}" (attempt \${retryCount + 1}/\${maxRetries + 1})\`);
      
      // First, try to find the element directly
      let element = this.findElementByText(targetText);
      
      if (!element) {
        element = this.findElementByFuzzyMatch(targetText, elementType);
      }
      
      if (!element) {
        element = this.findElementByPartialMatch(targetText, 0);
      }

      // ✅ ENHANCED: Check if element is actually visible (not just exists in DOM)
      if (element && this.isVisible(element)) {
        // ✅ CRITICAL FIX: Check if this element is a dropdown trigger, not the actual target
        const isDropdownTrigger = this.looksLikeDropdownTrigger(element);
        const hasDropdownMenu = element.getAttribute('aria-haspopup') === 'true' || 
                                element.getAttribute('aria-expanded') !== null;
        
        if (isDropdownTrigger || hasDropdownMenu) {
          console.log('[SMART FIND] ⚠️ Found element is a dropdown trigger, not the target item');
          console.log('[SMART FIND] 🔽 Will search inside dropdown instead...');
          // Don't return yet, continue to dropdown search
        } else {
          console.log('[SMART FIND] ✅ Element found and visible (not a dropdown trigger)');
          return element;
        }
      }

      // If not found or not visible, check if it might be in a dropdown
      console.log('[SMART FIND] 🔽 Element not found in DOM, checking dropdowns...');
      
      const dropdownInfo = await this.findAndOpenDropdownContaining(targetText);
      
      if (dropdownInfo) {
        // ✅ ENHANCED: Wait longer for React to render (300-500ms for complex dropdowns)
        console.log('[SMART FIND] ⏳ Waiting for React to render dropdown items...');
        await this.waitForReactRender(400);
        
        // Try finding the element again with all strategies
        element = this.findElementByText(targetText);
        
        if (!element) {
          element = this.findElementByFuzzyMatch(targetText, elementType);
        }
        
        if (!element) {
          element = this.findElementByPartialMatch(targetText, 0);
        }

        if (element && this.isVisible(element)) {
          console.log('[SMART FIND] ✅ Element found after opening dropdown');
          return element;
        } else {
          console.log('[SMART FIND] ⚠️ Dropdown opened but element still not found');
        }
      }

      // If still not found and we have retries left, try again
      if (retryCount < maxRetries) {
        console.log(\`[SMART FIND] 🔄 Retrying... (\${retryCount + 1}/\${maxRetries})\`);
        await this.waitForReactRender(250);
        return this.findElementSmart(targetText, elementType, retryCount + 1);
      }

      console.log('[SMART FIND] ❌ Element not found after all attempts');
      return null;
    }

    // ✅ ENHANCED: Find and open dropdown that might contain the target
    async findAndOpenDropdownContaining(targetText) {
      const searchText = targetText.toLowerCase();
      
      console.log('[DROPDOWN] 🔍 Searching for dropdown containing:', targetText);
      
      // Strategy 1: Check cached dropdowns
      for (const [triggerText, dropdownInfo] of this.dropdownCache.entries()) {
        const hasMatch = dropdownInfo.items.some(item => 
          item.text.toLowerCase().includes(searchText)
        );
        
        if (hasMatch) {
          console.log('[DROPDOWN] 💾 Found in cache:', triggerText);
          const opened = await this.openDropdown(dropdownInfo.trigger);
          if (opened) {
            return dropdownInfo;
          }
        }
      }

      // ✅ NEW: Strategy 1.5: Force ALL dropdowns visible with CSS injection
      console.log('[DROPDOWN] 💉 Using CSS injection to force dropdowns visible');
      
      // Inject CSS to force all dropdowns visible
      const styleId = 'voxcraft-dropdown-force-' + Date.now();
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = 'nav [class*="dropdown"] [class*="menu"], nav [class*="dropdown"] ul, nav [class*="dropdown"] [role="menu"], nav [class*="dropdown"] > div, header [class*="dropdown"] [class*="menu"], header [class*="dropdown"] ul, header [class*="dropdown"] [role="menu"], header [class*="dropdown"] > div, .dropdown-menu, [data-dropdown-menu], [role="navigation"] [class*="menu"] { display: block !important; opacity: 1 !important; visibility: visible !important; pointer-events: auto !important; }';
      document.head.appendChild(style);
      
      // CRITICAL: Trigger hover on all dropdown triggers to force React rendering
      const allTriggers = this.findAllDropdownTriggers();
      allTriggers.forEach(trigger => {
        this.triggerHoverEvents(trigger);
      });
      
      // Wait longer for CSS to apply and React to render dropdown content
      await this.waitForReactRender(800);
      
      // Now search for target element
      console.log('[DROPDOWN] 🔍 Searching for target with all dropdowns visible:', targetText);
      const targetElement = this.findElementByText(targetText) || 
                            this.findElementByFuzzyMatch(targetText) ||
                            this.findElementByPartialMatch(targetText, 0);
      
      // Cleanup: Remove injected CSS
      const injectedStyle = document.getElementById(styleId);
      if (injectedStyle) {
        injectedStyle.remove();
        console.log('[DROPDOWN] 🧹 Cleaned up injected CSS');
      }
      
      if (targetElement && this.isVisible(targetElement)) {
        console.log('[DROPDOWN] ✅ Found target with CSS injection method');
        return { trigger: null, menu: null, items: [targetElement] };
      }
      
      console.log('[DROPDOWN] ❌ Target not found even with CSS injection');

      // Strategy 2: Analyze page structure to find potential parent dropdowns
      console.log('[DROPDOWN] 🔎 Analyzing page structure for potential parents...');
      const potentialParents = this.findPotentialDropdownParents(targetText);
      console.log('[DROPDOWN] 📋 Found', potentialParents.length, 'potential parent dropdowns');
      
      for (const parent of potentialParents) {
        const parentText = this.getElementText(parent);
        console.log('[DROPDOWN] 🎯 Trying potential parent:', parentText);
        
        const opened = await this.openDropdown(parent);
        
        if (opened) {
          // ✅ ENHANCED: Wait longer for React to render dropdown items
          console.log('[DROPDOWN] ⏳ Waiting for dropdown items to render...');
          await this.waitForReactRender(400);
          
          // Try multiple finding strategies
          let testElement = this.findElementByText(targetText);
          if (!testElement) {
            testElement = this.findElementByFuzzyMatch(targetText);
          }
          if (!testElement) {
            testElement = this.findElementByPartialMatch(targetText, 0);
          }
          
          if (testElement && this.isVisible(testElement)) {
            console.log('[DROPDOWN] ✅ Successfully opened correct dropdown');
            
            // Cache this dropdown for future use
            const menu = this.findDropdownMenu(parent);
            if (menu) {
              const items = this.extractDropdownItems(menu);
              this.dropdownCache.set(parentText.toLowerCase(), {
                trigger: parent,
                menu: menu,
                items: items,
                timestamp: Date.now()
              });
              console.log('[DROPDOWN] 💾 Cached dropdown with', items.length, 'items');
            }
            
            return { trigger: parent, menu: menu };
          } else {
            console.log('[DROPDOWN] ⚠️ Dropdown opened but target not found inside');
          }
        }
      }

      console.log('[DROPDOWN] ❌ No suitable dropdown found');
      return null;
    }

    // ✅ NEW: Find all dropdown triggers on the page
    findAllDropdownTriggers() {
      const triggers = [];
      const selectors = [
        '[aria-haspopup="true"]',
        '[aria-expanded]',
        '.dropdown-toggle',
        '[role="button"][aria-haspopup]',
        'button[aria-haspopup]',
        'a[aria-haspopup]',
        '[class*="dropdown"][role="button"]',
        'nav [role="button"]',
        'nav button',
        'nav a[aria-expanded]'
      ];
      
      selectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(el => {
            if (this.isVisible(el) && !triggers.includes(el)) {
              triggers.push(el);
            }
          });
        } catch (e) {
          // Continue
        }
      });
      
      return triggers;
    }

    // NEW: Find potential dropdown parent elements
    findPotentialDropdownParents(targetText) {
      const parents = [];
      const searchTerms = targetText.toLowerCase().split(/\s+/);
      
      // SEMANTIC FILTER: Exclude unrelated UI controls
      const excludePatterns = /toggle|theme|dark|light|mode|settings|profile|account|search|login|sign/i;
      
      // Look for navigation items, buttons, or links that might trigger dropdowns
      const parentSelectors = [
        'nav a',
        'nav button',
        '[role="navigation"] a',
        '[role="navigation"] button',
        '.nav-item',
        '.menu-item',
        '[aria-haspopup="true"]',
        '[aria-expanded]',
        '.dropdown-toggle',
        '[data-dropdown-trigger]',
        'header a',
        'header button'
      ];

      parentSelectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(element => {
            if (!this.isVisible(element)) return;
            
            const elementText = this.getElementText(element).toLowerCase();
            
            // CRITICAL FIX: Filter out semantically unrelated dropdowns
            if (excludePatterns.test(elementText) && !excludePatterns.test(targetText)) {
              console.log('[DROPDOWN] 🚫 Skipping unrelated dropdown:', elementText);
              return;
            }
            
            // Check if this parent's text relates to the target
            // (e.g., searching for "About Team" might be under "About" dropdown)
            const hasRelatedTerm = searchTerms.some(term => 
              elementText.includes(term) || 
              term.includes(elementText.split(/\s+/)[0])
            );
            
            // Also check if it has dropdown indicators
            const hasDropdownIndicator = 
              element.getAttribute('aria-haspopup') === 'true' ||
              element.getAttribute('aria-expanded') !== null ||
              element.classList.contains('dropdown-toggle') ||
              element.querySelector('svg, .icon, .arrow, .caret') !== null ||
              /dropdown|menu|submenu/i.test(element.className);

            if (hasRelatedTerm && hasDropdownIndicator) {
              parents.push(element);
            } else if (hasDropdownIndicator && searchTerms.length > 1) {
              // If target has multiple words, the parent might be a category
              // But still apply semantic filter
              if (!excludePatterns.test(elementText)) {
                parents.push(element);
              }
            }
          });
        } catch (e) {
          // Continue
        }
      });

      // Sort by relevance (text similarity to target)
      parents.sort((a, b) => {
        const aText = this.getElementText(a).toLowerCase();
        const bText = this.getElementText(b).toLowerCase();
        const aSimilarity = this.calculateSimilarity(targetText.toLowerCase(), aText);
        const bSimilarity = this.calculateSimilarity(targetText.toLowerCase(), bText);
        return bSimilarity - aSimilarity;
      });

      return parents;
    }

    // ✅ NEW: Close a dropdown
    closeDropdown(trigger) {
      if (!trigger) return;
      
      try {
        const ariaExpanded = trigger.getAttribute('aria-expanded');
        if (ariaExpanded === 'true') {
          // Try clicking to close
          trigger.click();
          // Or trigger mouse leave
          this.triggerEvent(trigger, 'mouseleave');
          this.triggerEvent(trigger, 'pointerleave');
          this.triggerEvent(trigger, 'blur');
        }
      } catch (e) {
        // Ignore errors
      }
    }

    // ✅ ENHANCED: Open a dropdown (handles both hover and click with improved timing)
    async openDropdown(trigger) {
      if (!trigger) return false;
      
      const triggerText = this.getElementText(trigger).trim();
      console.log('[DROPDOWN] 🔽 Attempting to open:', triggerText);
      
      try {
        // Check if already open
        const ariaExpanded = trigger.getAttribute('aria-expanded');
        if (ariaExpanded === 'true') {
          console.log('[DROPDOWN] ✅ Already open');
          return true;
        }

        // Scroll into view first
        trigger.scrollIntoView({ behavior: 'instant', block: 'center' });
        await this.waitForReactRender(100);

        // ✅ CRITICAL: Try click first (most common for React dropdowns)
        console.log('[DROPDOWN] 📍 Strategy 1: Click...');
        trigger.focus();
        await this.waitForReactRender(50);
        trigger.click();
        await this.waitForReactRender(300);
        
        let isOpen = this.checkIfDropdownOpen(trigger);
        console.log('[DROPDOWN] 📊 After click - isOpen:', isOpen);
        
        if (!isOpen) {
          // Strategy 2: Hover events (for hover-based dropdowns)
          console.log('[DROPDOWN] 📍 Strategy 2: Hover events...');
          this.triggerHoverEvents(trigger);
          await this.waitForReactRender(300);
          
          isOpen = this.checkIfDropdownOpen(trigger);
          console.log('[DROPDOWN] 📊 After hover - isOpen:', isOpen);
        }

        if (!isOpen) {
          // Strategy 3: React synthetic events
          console.log('[DROPDOWN] 📍 Strategy 3: React synthetic events...');
          this.triggerReactEvents(trigger);
          await this.waitForReactRender(300);
          
          isOpen = this.checkIfDropdownOpen(trigger);
          console.log('[DROPDOWN] 📊 After React events - isOpen:', isOpen);
        }

        // ✅ ENHANCED: Final check with extended wait
        if (!isOpen) {
          console.log('[DROPDOWN] ⏳ Final wait for React...');
          await this.waitForReactRender(400);
          isOpen = this.checkIfDropdownOpen(trigger);
          console.log('[DROPDOWN] 📊 Final check - isOpen:', isOpen);
        }

        if (isOpen) {
          this.openDropdowns.add(trigger);
          console.log('[DROPDOWN] ✅ Successfully opened');
        } else {
          console.log('[DROPDOWN] ⚠️ Failed to open after all strategies');
        }

        return isOpen;
      } catch (error) {
        console.error('[DROPDOWN] ❌ Error opening:', error);
        return false;
      }
    }

    // ✅ ENHANCED: Check if dropdown is actually open (with computed styles)
    checkIfDropdownOpen(trigger) {
      // Method 1: Check aria-expanded
      if (trigger.getAttribute('aria-expanded') === 'true') {
        console.log('[DROPDOWN] ✅ Detected via aria-expanded');
        return true;
      }
      
      // Method 2: Check for visible dropdown menu via computed styles
      const navParent = trigger.closest('nav, header, [role="navigation"], .navigation, .navbar');
      if (navParent) {
        const dropdownSelectors = [
          '[class*="dropdown"][class*="menu"]',
          '[class*="dropdown"] ul',
          '[class*="dropdown"] [role="menu"]',
          '.dropdown-menu',
          '[data-dropdown-menu]',
          '[role="menu"]'
        ];
        
        for (const selector of dropdownSelectors) {
          try {
            const menus = navParent.querySelectorAll(selector);
            for (const menu of menus) {
              const computed = window.getComputedStyle(menu);
              if (computed.display !== 'none' && 
                  computed.visibility !== 'hidden' && 
                  parseFloat(computed.opacity) > 0.1) {
                console.log('[DROPDOWN] ✅ Detected via computed styles:', selector);
                return true;
              }
            }
          } catch (e) {
            // Continue
          }
        }
      }
      
      // Method 3: Check for visible dropdown items
      const menu = this.findDropdownMenu(trigger);
      if (menu && this.isVisible(menu)) {
        console.log('[DROPDOWN] ✅ Detected via visible menu');
        return true;
      }
      
      return false;
    }

    // NEW: Trigger hover events for hover-based dropdowns
    triggerHoverEvents(element) {
      const events = [
        'mouseenter',
        'mouseover',
        'mousemove',
        'pointerenter',
        'pointerover',
        'focus'
      ];

      const rect = element.getBoundingClientRect();
      const clientX = rect.left + rect.width / 2;
      const clientY = rect.top + rect.height / 2;

      events.forEach(eventType => {
        const event = new MouseEvent(eventType, {
          view: window,
          bubbles: true,
          cancelable: true,
          clientX: clientX,
          clientY: clientY,
          relatedTarget: document.body
        });
        element.dispatchEvent(event);
      });

      // Also trigger on parent elements (some React apps listen on parents)
      let parent = element.parentElement;
      let depth = 0;
      while (parent && depth < 3) {
        events.forEach(eventType => {
          const event = new MouseEvent(eventType, {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: clientX,
            clientY: clientY,
            relatedTarget: element
          });
          parent.dispatchEvent(event);
        });
        parent = parent.parentElement;
        depth++;
      }
    }

    // NEW: Trigger React synthetic events
    triggerReactEvents(element) {
      // Find React fiber
      const reactPropsKey = Object.keys(element).find(key => 
        key.startsWith('__reactProps') || key.startsWith('__reactEventHandlers')
      );

      if (reactPropsKey) {
        const props = element[reactPropsKey];
        
        // Trigger common React event handlers
        if (props.onMouseEnter) props.onMouseEnter({ target: element });
        if (props.onMouseOver) props.onMouseOver({ target: element });
        if (props.onClick) props.onClick({ target: element });
        if (props.onFocus) props.onFocus({ target: element });
      }

      // Also try to trigger state updates by simulating user interaction
      const clickEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true,
        composed: true
      });
      element.dispatchEvent(clickEvent);
    }

    // NEW: Find dropdown menu associated with trigger
    findDropdownMenu(trigger) {
      // Strategy 1: Check aria-controls
      const controlsId = trigger.getAttribute('aria-controls');
      if (controlsId) {
        const menu = document.getElementById(controlsId);
        if (menu && this.isVisible(menu)) return menu;
      }

      // Strategy 2: Check next sibling
      let sibling = trigger.nextElementSibling;
      let attempts = 0;
      while (sibling && attempts < 3) {
        if (this.looksLikeDropdownMenu(sibling) && this.isVisible(sibling)) {
          return sibling;
        }
        sibling = sibling.nextElementSibling;
        attempts++;
      }

      // Strategy 3: Check parent's children
      const parent = trigger.parentElement;
      if (parent) {
        const menus = parent.querySelectorAll('[role="menu"], .dropdown-menu, .menu-dropdown, [class*="dropdown"]');
        for (const menu of menus) {
          if (menu !== trigger && this.isVisible(menu)) {
            return menu;
          }
        }
      }

      // Strategy 4: Check document for recently added menus
      const recentMenus = document.querySelectorAll('[role="menu"], .dropdown-menu, .menu-dropdown');
      for (const menu of recentMenus) {
        if (this.isVisible(menu)) {
          return menu;
        }
      }

      return null;
    }

    // NEW: Check if element looks like a dropdown menu
    looksLikeDropdownMenu(element) {
      const role = element.getAttribute('role');
      const className = element.className?.toString().toLowerCase() || '';
      
      return (
        role === 'menu' ||
        role === 'navigation' ||
        className.includes('dropdown') ||
        className.includes('menu') ||
        className.includes('submenu') ||
        element.tagName === 'UL' ||
        element.tagName === 'NAV'
      );
    }

    // ✅ ENHANCED: Wait for React to render (with exponential backoff and frame sync)
    async waitForReactRender(baseMs = 300) {
      return new Promise(resolve => {
        // Use double requestAnimationFrame to ensure DOM updates are complete
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Additional timeout for React state updates and re-renders
            setTimeout(resolve, baseMs);
          });
        });
      });
    }

    createStatusIndicator() {
      const statusEl = document.createElement('div');
      statusEl.id = 'voice-nav-status';
      statusEl.style.cssText = \`
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        z-index: 10000;
        max-width: 300px;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        transition: all 0.3s ease;
        cursor: pointer;
      \`;
      
      statusEl.innerHTML = \`
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span id="voice-status-text">Initializing...</span>
          <span style="margin-left: 10px; cursor: pointer; opacity: 0.7;" onclick="this.parentElement.parentElement.style.display='none'">✕</span>
        </div>
      \`;
      
      document.body.appendChild(statusEl);
      this.statusEl = document.getElementById('voice-status-text');
    }

    async setupSupabaseRealtime() {
      try {
        let attempts = 0;
        while (!window.supabase && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        if (!window.supabase) {
          throw new Error('Supabase JS failed to load');
        }

        this.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        this.assistantId = BOT_CONFIG.assistantId;
        
        console.log('[LIFECYCLE] ✅ Supabase client initialized');
        this.updateStatus('🟡 Ready for voice session...');
        
      } catch (error) {
        console.error('❌ Supabase Realtime setup failed:', error);
        this.updateStatus("❌ Command listener failed");
      }
    }

    setupDiscoveryChannel() {
      if (this.discoveryChannel) {
        console.log('[LIFECYCLE] 🧹 Cleaning up old discovery channel');
        this.discoveryChannel.unsubscribe();
        this.discoveryChannel = null;
      }

      if (this.discoveryCleanupTimeout) {
        clearTimeout(this.discoveryCleanupTimeout);
        this.discoveryCleanupTimeout = null;
      }
      
      const discoveryChannelName = \`vapi:discovery:\${this.assistantId}:\${this.sessionId}\`;
      console.log('[LIFECYCLE] 🔍 Creating fresh discovery channel:', discoveryChannelName);
      
      this.discoveryChannel = this.supabaseClient
        .channel(discoveryChannelName)
        .on('broadcast', { event: 'call_discovery' }, (payload) => {
          console.log('[LIFECYCLE] 📡 Received call discovery:', payload);
          const { vapiCallId, firstCommand, sessionId } = payload.payload;
          
          if (vapiCallId && !this.currentCallId && this.isCallInitiator && sessionId === this.sessionId) {
            console.log('[LIFECYCLE] 🎯 Call ID discovered via backend for our session:', vapiCallId, 'sessionId:', sessionId);
            this.currentCallId = vapiCallId;
            
            if (firstCommand) {
              console.log('[LIFECYCLE] 📦 Storing first command for replay:', firstCommand.functionName);
              this.pendingFirstCommand = firstCommand;
            }
            
            this.subscribeToCallChannel(vapiCallId);
            this.updateStatus('🔗 Session isolated - ready for commands!');
            
            this.discoveryCleanupTimeout = setTimeout(() => {
              if (this.discoveryChannel) {
                console.log('[LIFECYCLE] 🧹 Cleaning up discovery channel after successful setup');
                this.discoveryChannel.unsubscribe();
                this.discoveryChannel = null;
              }
            }, 2000);
          } else if (vapiCallId && sessionId !== this.sessionId) {
            console.log('[LIFECYCLE] ⏭️ Ignoring call discovery - different session (ours:', this.sessionId, 'theirs:', sessionId, ')');
          } else if (vapiCallId && !this.isCallInitiator) {
            console.log('[LIFECYCLE] ⏭️ Ignoring call discovery - not the initiator of this call');
          }
        })
        .subscribe((status) => {
          console.log('[LIFECYCLE] 🔍 Discovery channel status:', status);
        });
    }

    subscribeToCallChannel(callId) {
      if (this.realtimeChannel) {
        console.log('[LIFECYCLE] 🧹 Unsubscribing from old session channel');
        this.realtimeChannel.unsubscribe();
      }

      this.isSessionChannelReady = false;
      this.queuedCommands = [];

      const channelName = 'vapi:call:' + callId;
      console.log('[LIFECYCLE] 📡 Subscribing to session-specific channel:', channelName);
      
      this.realtimeChannel = this.supabaseClient
        .channel(channelName)
        .on('broadcast', { event: 'function_call' }, (payload) => {
          console.log('[LIFECYCLE] 📡 Received session-specific function call:', payload);
          
          if (this.isSessionChannelReady) {
            this.executeFunctionCall(payload.payload);
          } else {
            console.log('[LIFECYCLE] ⏳ Channel not ready, queueing command:', payload.payload.functionName);
            this.queuedCommands.push(payload.payload);
          }
        })
        .subscribe((status) => {
          console.log('[LIFECYCLE] Realtime status for', channelName, ':', status);
          
          if (status === 'SUBSCRIBED') {
            this.isSessionChannelReady = true;
            this.updateStatus('🟢 Connected to voice control');
            
            if (this.pendingFirstCommand) {
              console.log('[LIFECYCLE] 🔄 Replaying first command:', this.pendingFirstCommand.functionName);
              this.executeFunctionCall(this.pendingFirstCommand);
              this.pendingFirstCommand = null;
            }
            
            console.log('[LIFECYCLE] ✅ Session channel ready, processing queued commands:', this.queuedCommands.length);
            
            while (this.queuedCommands.length > 0) {
              const command = this.queuedCommands.shift();
              console.log('[LIFECYCLE] 🔄 Processing queued command:', command.functionName);
              this.executeFunctionCall(command);
            }
          }
        });

      console.log('[LIFECYCLE] ✅ Supabase Realtime setup initiated for channel:', channelName);
    }

    loadVapiSDK() {
      if (window.vapiSDK) {
        this.initializeVapi();
        return;
      }

      const script = document.createElement('script');
      script.src = "https://cdn.jsdelivr.net/gh/VapiAI/html-script-tag@latest/dist/assets/index.js";
      script.async = true;
      script.defer = true;

      script.onload = () => {
        setTimeout(() => {
          if (window.vapiSDK) {
            this.initializeVapi();
          } else {
            this.updateStatus("❌ Voice SDK failed to load");
          }
        }, 100);
      };

      script.onerror = () => {
        this.updateStatus("❌ Voice SDK failed to load");
      };

      document.head.appendChild(script);
    }

    initializeVapi() {
      try {
        const config = {
          position: BOT_CONFIG.position,
          theme: BOT_CONFIG.theme,
          metadata: {
            sessionId: this.sessionId
          }
        };

        this.vapiWidget = window.vapiSDK.run({
          apiKey: BOT_CONFIG.apiKey,
          assistant: BOT_CONFIG.assistantId,
          config,
          assistantOverrides: {
            variableValues: {
              sessionId: this.sessionId
            }
          }
        });

        const hideStyle = document.createElement('style');
        hideStyle.textContent = '.vapi-btn{display:none!important}';
        document.head.appendChild(hideStyle);

        this.createCustomWidget();
        this.setupVapiEventListeners();
        this.isInitialized = true;
        this.updateStatus("🎤 Click to start voice control!");
      } catch (error) {
        console.error('Vapi initialization error:', error);
        this.updateStatus("❌ Voice setup failed");
      }
    }

    createCustomWidget() {
      const widget = document.createElement('div');
      widget.id = 'voxcraft-voice-widget';
      widget.style.cssText = \`
        position: fixed;
        \${BOT_CONFIG.position === 'bottom-left' ? 'left: 24px;' : 'right: 24px;'}
        bottom: 24px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      \`;

      const isDark = BOT_CONFIG.theme === 'dark';
      
      const widgetHTML = \`
        <style>
          .voxcraft-widget-btn {
            width: 64px;
            height: 64px;
            border-radius: 50%;
            background: \${isDark 
              ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.9), rgba(139, 92, 246, 0.9))'
              : 'linear-gradient(135deg, rgb(59, 130, 246), rgb(139, 92, 246))'};
            backdrop-filter: blur(20px);
            border: 2px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
          }
          .voxcraft-widget-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3), 0 0 0 8px rgba(59, 130, 246, 0.2);
          }
          .voxcraft-widget-btn.active {
            animation: pulse-ring 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          }
          .voxcraft-widget-btn.listening {
            background: linear-gradient(135deg, rgba(34, 197, 94, 0.9), rgba(16, 185, 129, 0.9));
            animation: pulse-ring 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          }
          .voxcraft-widget-btn.speaking {
            background: linear-gradient(135deg, rgba(249, 115, 22, 0.9), rgba(234, 88, 12, 0.9));
          }
          @keyframes pulse-ring {
            0% { box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2), 0 0 0 0 rgba(59, 130, 246, 0.7); }
            50% { box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2), 0 0 0 12px rgba(59, 130, 246, 0); }
            100% { box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2), 0 0 0 0 rgba(59, 130, 246, 0); }
          }
          .voxcraft-icon {
            width: 28px;
            height: 28px;
            color: white;
            position: relative;
            z-index: 2;
            transition: transform 0.3s ease;
          }
          .voxcraft-widget-btn:hover .voxcraft-icon {
            transform: scale(1.1);
          }
          .voxcraft-visualizer {
            position: absolute;
            bottom: 100%;
            \${BOT_CONFIG.position === 'bottom-left' ? 'left: 0;' : 'right: 0;'}
            margin-bottom: 12px;
            background: \${isDark
              ? 'rgba(30, 30, 46, 0.95)'
              : 'rgba(255, 255, 255, 0.95)'};
            backdrop-filter: blur(20px);
            border: 1px solid \${isDark
              ? 'rgba(255, 255, 255, 0.1)'
              : 'rgba(0, 0, 0, 0.1)'};
            border-radius: 16px;
            padding: 16px 20px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            display: none;
            flex-direction: column;
            gap: 12px;
            min-width: 240px;
            opacity: 0;
            transform: translateY(8px);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .voxcraft-visualizer.show {
            display: flex;
            opacity: 1;
            transform: translateY(0);
          }
          .voxcraft-status {
            font-size: 13px;
            font-weight: 500;
            color: \${isDark ? '#e5e7eb' : '#1f2937'};
            text-align: center;
          }
          .voxcraft-bars {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            height: 32px;
          }
          .voxcraft-bar {
            width: 4px;
            height: 8px;
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            border-radius: 2px;
            animation: wave 1s ease-in-out infinite;
          }
          .voxcraft-bar:nth-child(2) { animation-delay: 0.1s; }
          .voxcraft-bar:nth-child(3) { animation-delay: 0.2s; }
          .voxcraft-bar:nth-child(4) { animation-delay: 0.3s; }
          .voxcraft-bar:nth-child(5) { animation-delay: 0.4s; }
          @keyframes wave {
            0%, 100% { height: 8px; }
            50% { height: 24px; }
          }
        </style>
        
        <button class="voxcraft-widget-btn" id="voxcraft-btn" aria-label="Voice Assistant">
          <svg class="voxcraft-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </button>
        
        <div class="voxcraft-visualizer" id="voxcraft-visualizer">
          <div class="voxcraft-status" id="voxcraft-status">Ready to assist</div>
          <div class="voxcraft-bars">
            <div class="voxcraft-bar"></div>
            <div class="voxcraft-bar"></div>
            <div class="voxcraft-bar"></div>
            <div class="voxcraft-bar"></div>
            <div class="voxcraft-bar"></div>
          </div>
        </div>
      \`;

      widget.innerHTML = widgetHTML;
      document.body.appendChild(widget);

      this.widgetBtn = document.getElementById('voxcraft-btn');
      this.visualizer = document.getElementById('voxcraft-visualizer');
      this.widgetStatusEl = document.getElementById('voxcraft-status');

      this.widgetBtn.addEventListener('click', () => this.toggleCall());
    }

    async toggleCall() {
      if (this.isCallActive || this.vapiWidget.started) {
        this.endCall();
      } else {
        await this.startCall();
      }
    }

    async startCall() {
      try {
        console.log('[LIFECYCLE] 🚀 Starting new call...');
        this.updateWidgetState('active', 'Connecting...');
        this.visualizer.classList.add('show');
        
        this.isCallInitiator = true;
        console.log('[LIFECYCLE] ✅ Marked as call initiator');
        
        this.setupDiscoveryChannel();
        console.log('[LIFECYCLE] ✅ Discovery channel created');
        
        const hiddenBtn = document.querySelector('.vapi-btn');
        if (hiddenBtn) {
          hiddenBtn.click();
        }
        
        this.isCallActive = true;
        this.updateWidgetState('listening', 'Listening...');
      } catch (error) {
        console.error('[LIFECYCLE] ❌ Start call failed:', error);
        this.isCallInitiator = false;
        this.updateWidgetState('idle', 'Failed to start');
        setTimeout(() => {
          this.visualizer.classList.remove('show');
        }, 2000);
      }
    }

    endCall() {
      try {
        const hiddenBtn = document.querySelector('.vapi-btn');
        if (hiddenBtn) {
          hiddenBtn.click();
        }
        
        this.isCallInitiator = false;
        this.isCallActive = false;
        this.openDropdowns.clear(); // Clear open dropdowns
        this.updateWidgetState('idle', 'Call ended');
        setTimeout(() => {
          this.visualizer.classList.remove('show');
        }, 2000);
      } catch (error) {
        console.error('End call failed:', error);
      }
    }

    updateWidgetState(state, statusText) {
      if (this.widgetBtn) {
        this.widgetBtn.className = \`voxcraft-widget-btn \${state}\`;
      }
      if (this.widgetStatusEl) {
        this.widgetStatusEl.textContent = statusText;
      }
    }

    setupVapiEventListeners() {
      this.vapiWidget.on("call-start", (event) => {
        console.log('📞 VAPI call started, waiting for backend call ID discovery...');
        this.updateStatus("🎤 Voice active - discovering session...");
        this.updateWidgetState('listening', 'Listening...');
      });

      this.vapiWidget.on("call-end", () => {
        console.log('[LIFECYCLE] 📞 VAPI call ended - cleaning up...');
        this.currentCallId = null;
        this.isCallActive = false;
        this.isSessionChannelReady = false;
        this.queuedCommands = [];
        this.pendingFirstCommand = null;
        this.openDropdowns.clear();
        
        if (this.realtimeChannel) {
          console.log('[LIFECYCLE] 🧹 Unsubscribing session channel');
          this.realtimeChannel.unsubscribe();
          this.realtimeChannel = null;
        }
        
        if (this.discoveryChannel) {
          console.log('[LIFECYCLE] 🧹 Unsubscribing discovery channel');
          this.discoveryChannel.unsubscribe();
          this.discoveryChannel = null;
        }

        if (this.discoveryCleanupTimeout) {
          clearTimeout(this.discoveryCleanupTimeout);
          this.discoveryCleanupTimeout = null;
        }
        
        console.log('[LIFECYCLE] ✅ Call cleanup complete - ready for next call');
        
        this.updateStatus("🔄 Voice ended");
        this.updateWidgetState('idle', 'Call ended');
        setTimeout(() => {
          if (this.visualizer) {
            this.visualizer.classList.remove('show');
          }
        }, 2000);
      });

      this.vapiWidget.on("speech-start", () => {
        console.log('🎤 User speaking');
        this.updateStatus("🎤 Listening...");
        this.updateWidgetState('listening', 'Listening...');
      });

      this.vapiWidget.on("speech-end", () => {
        console.log('🎤 User stopped speaking');
        this.updateStatus("🤖 Processing...");
        this.updateWidgetState('active', 'Processing...');
      });

      this.vapiWidget.on("message", (message) => {
        if (message?.type === 'transcript' && message?.transcriptType === 'partial') {
          console.log('🤖 Assistant speaking');
          this.updateStatus("🤖 Assistant responding...");
          this.updateWidgetState('speaking', 'Speaking...');
        }
      });

      this.vapiWidget.on("error", (error) => {
        console.error('❌ VAPI error:', error);
        this.updateStatus("❌ Voice error");
        this.updateWidgetState('idle', 'Error occurred');
        setTimeout(() => {
          if (this.visualizer) {
            this.visualizer.classList.remove('show');
          }
        }, 3000);
      });
    }

    executeFunctionCall(functionCall) {
      const { functionName, params } = functionCall;
      console.log('⚡ Executing function call:', functionName, params);
      
      // CRITICAL FIX: Queue commands if dropdown is opening
      if (this.dropdownOpening && functionName !== 'get_page_context') {
        console.log('[QUEUE] 📦 Dropdown opening, queueing command:', functionName);
        this.commandQueue.push(functionCall);
        return;
      }
      
      try {
        switch (functionName) {
          case 'get_page_context':
            this.get_page_context(params);
            break;
          case 'scroll_page':
            this.scroll_page(params);
            break;
          case 'click_element':
            this.click_element(params);
            break;
          case 'fill_field':
            this.fill_field(params);
            break;
          case 'toggle_element':
            this.toggle_element(params);
            break;
          default:
            console.warn('Unknown function call:', functionName);
            this.updateStatus(\`❓ Unknown command: \${functionName}\`);
        }
        this.updateStatus(\`✅ Executed \${functionName}\`);
      } catch (error) {
        console.error('❌ Function execution error:', error);
        this.updateStatus(\`❌ Error executing \${functionName}\`);
      }
    }

    // NEW: Process queued commands after dropdown opens
    async processCommandQueue() {
      console.log('[QUEUE] 🔄 Processing', this.commandQueue.length, 'queued commands');
      
      while (this.commandQueue.length > 0) {
        const command = this.commandQueue.shift();
        console.log('[QUEUE] ▶️ Executing queued command:', command.functionName);
        await this.executeFunctionCall(command);
        
        // Small delay between queued commands
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      console.log('[QUEUE] ✅ All queued commands processed');
    }

    // ========================================
    // CONTEXT ENGINE METHODS
    // ========================================

    get_page_context(params) {
      console.log('[CONTEXT] 📊 Extracting page context...', params);
      this.updateStatus('📊 Analyzing page structure...');
      
      try {
        // Handle defaults
        const refresh = params.refresh || false;
        const detailLevel = params.detail_level || 'standard';
        const currentUrl = window.location.href;
        
        // CRITICAL FIX: Invalidate cache if URL changed
        if (this.contextCache && this.contextCache.url !== currentUrl) {
          console.log('[CONTEXT] 🔄 URL mismatch detected - invalidating cache');
          console.log('[CONTEXT] 📍 Cached URL:', this.contextCache.url);
          console.log('[CONTEXT] 📍 Current URL:', currentUrl);
          this.contextCache = null;
          this.contextCacheTimestamp = 0;
        }
        
        // Check cache unless refresh is requested
        if (!refresh && this.contextCache) {
          const now = Date.now();
          if ((now - this.contextCacheTimestamp) < this.contextCacheTTL) {
            console.log('[CONTEXT] ✅ Using cached context');
            this.updateStatus('✅ Context retrieved (cached)');
            return {
              success: true,
              context: this.contextCache,
              cached: true,
              message: 'Page context retrieved from cache'
            };
          }
        }
        
        // Extract fresh context
        const context = {
          url: window.location.href,
          title: document.title,
          pageType: this.detectPageType(),
          timestamp: Date.now()
        };
        
        // Add navigation based on detail level
        if (detailLevel === 'minimal') {
          context.navigation = this.extractNavigationMinimal();
        } else {
          context.navigation = this.extractNavigation();
        }
        
        // Add interactive elements (standard and detailed)
        if (detailLevel === 'standard' || detailLevel === 'detailed') {
          context.interactiveElements = this.extractInteractiveElements();
        }
        
        // Add forms (detailed only)
        if (detailLevel === 'detailed') {
          context.forms = this.extractForms();
          context.contentSections = this.extractContentSections();
        }
        
        // Update cache
        this.contextCache = context;
        this.contextCacheTimestamp = Date.now();
        
        console.log('[CONTEXT] ✅ Context extracted:', context);
        this.updateStatus('✅ Page context analyzed');
        
        return {
          success: true,
          context: context,
          cached: false,
          message: 'Page context extracted with ' + detailLevel + ' detail level'
        };
        
      } catch (error) {
        console.error('[CONTEXT] ❌ Error extracting context:', error);
        this.updateStatus('❌ Failed to analyze page');
        return {
          success: false,
          error: error.message,
          message: 'Failed to extract page context'
        };
      }
    }

    detectPageType() {
      const path = window.location.pathname;
      
      if (path === '/' || path === '/home') return 'landing_page';
      if (path.includes('/product')) return 'product_page';
      if (path.includes('/checkout') || path.includes('/cart')) return 'checkout_page';
      if (path.includes('/blog') || path.includes('/article')) return 'blog_page';
      if (document.querySelector('form[action*="login"]')) return 'login_page';
      
      return 'general_page';
    }

    extractNavigationMinimal() {
      const navigation = { topLevel: [] };
      
      const navContainer = document.querySelector('nav') || 
                           document.querySelector('header nav') || 
                           document.querySelector('[role="navigation"]');
      
      if (!navContainer) return navigation;
      
      // FIXED: Use less specific selectors to match nested structures
      const selectors = [
        'nav a',      // Any anchor in nav
        'nav button'  // Any button in nav
      ];
      
      const processed = new Set();
      
      selectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(element => {
            if (processed.has(element)) return;
            if (!this.isVisible(element)) return;  // Skip hidden elements
            processed.add(element);
            
            const text = this.getElementText(element).trim();
            if (!text || text.length > 50) return;
            
            // Skip mobile menu toggle and theme toggle
            if (text.toLowerCase().includes('menu') || text.toLowerCase().includes('toggle')) {
              return;
            }
            
            const isDropdown = this.looksLikeDropdownTrigger(element);
            const navItem = {
              text: text,
              type: isDropdown ? 'dropdown' : 'link',
              visible: true
            };
            
            // If dropdown, try to extract children
            if (isDropdown) {
              navItem.hasDropdown = true;
              navItem.children = this.extractDropdownChildren(element);
            }
            
            navigation.topLevel.push(navItem);
          });
        } catch (e) {
          console.warn('[NAV EXTRACT] Error:', e);
        }
      });
      
      console.log('[NAV EXTRACT] ✅ Extracted', navigation.topLevel.length, 'nav items');
      return navigation;
    }

    extractNavigation() {
      const navigation = { topLevel: [] };
      
      const navContainers = [
        document.querySelector('nav'),
        document.querySelector('header nav'),
        document.querySelector('[role="navigation"]'),
        document.querySelector('.navbar'),
        document.querySelector('.navigation')
      ].filter(Boolean);
      
      if (navContainers.length === 0) {
        console.log('[CONTEXT] ⚠️ No navigation container found');
        return navigation;
      }
      
      const navContainer = navContainers[0];
      
      const topLevelSelectors = [
        'nav > ul > li > a',
        'nav > ul > li > button',
        'nav > div > a',
        'nav > div > button',
        '[role="navigation"] > ul > li > a',
        '[role="navigation"] > ul > li > button'
      ];
      
      const processedElements = new Set();
      
      topLevelSelectors.forEach(selector => {
        try {
          navContainer.querySelectorAll(selector).forEach(element => {
            if (processedElements.has(element)) return;
            processedElements.add(element);
            
            const text = this.getElementText(element).trim();
            if (!text || text.length > 50) return;
            
            const navItem = {
              text: text,
              type: element.tagName.toLowerCase() === 'a' ? 'link' : 'button',
              visible: this.isVisible(element)
            };
            
            if (element.tagName.toLowerCase() === 'a') {
              navItem.href = element.getAttribute('href');
            }
            
            const hasDropdown = this.looksLikeDropdownTrigger(element);
            
            if (hasDropdown) {
              navItem.type = 'dropdown';
              navItem.hasDropdown = true;
              navItem.children = this.extractDropdownChildren(element);
            }
            
            navigation.topLevel.push(navItem);
          });
        } catch (e) {
          console.warn('[CONTEXT] Error processing selector:', selector, e);
        }
      });
      
      return navigation;
    }

    extractDropdownChildren(trigger) {
      const children = [];
      
      const menu = this.findDropdownMenu(trigger);
      if (!menu) return children;
      
      const itemSelectors = ['a', 'button', '[role="menuitem"]', '.dropdown-item'];
      
      itemSelectors.forEach(selector => {
        try {
          menu.querySelectorAll(selector).forEach(item => {
            const text = this.getElementText(item).trim();
            if (!text || text.length > 100) return;
            
            const child = {
              text: text,
              type: item.tagName.toLowerCase() === 'a' ? 'link' : 'button',
              parent: this.getElementText(trigger).trim()
            };
            
            if (item.tagName.toLowerCase() === 'a') {
              child.href = item.getAttribute('href');
            }
            
            children.push(child);
          });
        } catch (e) {
          // Continue
        }
      });
      
      return children;
    }

    extractInteractiveElements() {
      const elements = [];
      
      const selectors = [
        'button:not(nav button):not(header button)',
        'a.btn',
        'a.button',
        '[role="button"]',
        'input[type="submit"]'
      ];
      
      selectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(element => {
            if (!this.isVisible(element)) return;
            
            const text = this.getElementText(element).trim();
            if (!text || text.length > 50) return;
            
            elements.push({
              text: text,
              type: element.tagName.toLowerCase(),
              visible: true,
              action: 'click'
            });
          });
        } catch (e) {
          // Continue
        }
      });
      
      return elements.slice(0, 20);
    }

    extractForms() {
      const forms = [];
      
      document.querySelectorAll('form').forEach(form => {
        const fields = [];
        
        form.querySelectorAll('input, textarea, select').forEach(field => {
          const label = this.findFieldLabel(field);
          const fieldInfo = {
            type: field.type || field.tagName.toLowerCase(),
            name: field.name || field.id,
            label: label,
            required: field.required,
            placeholder: field.placeholder
          };
          
          fields.push(fieldInfo);
        });
        
        if (fields.length > 0) {
          forms.push({
            action: form.action,
            method: form.method,
            fields: fields
          });
        }
      });
      
      return forms;
    }

    findFieldLabel(field) {
      if (field.id) {
        const label = document.querySelector('label[for="' + field.id + '"]');
        if (label) return label.textContent.trim();
      }
      
      const parentLabel = field.closest('label');
      if (parentLabel) return parentLabel.textContent.trim();
      
      if (field.getAttribute('aria-label')) {
        return field.getAttribute('aria-label');
      }
      
      if (field.placeholder) return field.placeholder;
      
      return field.name || 'Unknown field';
    }

    extractContentSections() {
      const sections = [];
      
      document.querySelectorAll('section, article, main > div').forEach((section, index) => {
        const heading = section.querySelector('h1, h2, h3');
        const text = section.textContent.trim().substring(0, 200);
        
        if (heading || text.length > 50) {
          sections.push({
            index: index,
            heading: heading ? heading.textContent.trim() : null,
            preview: text,
            hasImages: section.querySelectorAll('img').length > 0,
            hasButtons: section.querySelectorAll('button, .btn').length > 0
          });
        }
      });
      
      return sections.slice(0, 10);
    }

    // ========================================
    // END CONTEXT ENGINE METHODS
    // ========================================

    scroll_page(params) {
      const { direction, target_section } = params;
      console.log('📜 Scrolling page:', direction, target_section);
      
      if (target_section) {
        const sectionFound = this.scrollToSection(target_section);
        if (sectionFound) {
          this.updateStatus(\`📜 Scrolled to \${target_section}\`);
          return;
        }
      }
      
      const scrollAmount = window.innerHeight * 0.85;
      const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      
      switch(direction?.toLowerCase()) {
        case 'down':
        case 'next':
          const downAmount = Math.min(scrollAmount, maxScroll - currentScroll);
          window.scrollBy({ 
            top: downAmount, 
            behavior: 'smooth' 
          });
          break;
          
        case 'up':
        case 'previous':
        case 'back':
          const upAmount = Math.min(scrollAmount, currentScroll);
          window.scrollBy({ 
            top: -upAmount, 
            behavior: 'smooth' 
          });
          break;
          
        case 'top':
        case 'start':
        case 'beginning':
          window.scrollTo({ 
            top: 0, 
            behavior: 'smooth' 
          });
          break;
          
        case 'bottom':
        case 'end':
          window.scrollTo({ 
            top: document.documentElement.scrollHeight, 
            behavior: 'smooth' 
          });
          break;
          
        case 'middle':
        case 'center':
          window.scrollTo({ 
            top: document.documentElement.scrollHeight / 2, 
            behavior: 'smooth' 
          });
          break;
          
        default:
          if (direction) {
            const element = this.findScrollTarget(direction);
            if (element) {
              element.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start',
                inline: 'nearest'
              });
              this.updateStatus(\`📜 Scrolled to \${direction}\`);
              return;
            }
          }
          window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
      }
      
      this.updateStatus(\`📜 Scrolled \${direction || 'down'}\`);
    }
    
    scrollToSection(sectionName) {
      const searchTerms = sectionName.toLowerCase().split(/\s+/);
      
      const sectionSelectors = [
        'section', 'article', 'header', 'footer', 'nav', 'main', 'aside',
        '[role="region"]', '[role="navigation"]', '[role="main"]',
        '.section', '.container', '#content', '.content',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        '[id*="section"]', '[class*="section"]'
      ];
      
      let bestMatch = null;
      let bestScore = 0;
      
      sectionSelectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(element => {
            if (!this.isVisible(element)) return;
            
            const elementText = (
              element.id + ' ' +
              element.className + ' ' +
              element.textContent + ' ' +
              element.getAttribute('aria-label') + ' ' +
              element.getAttribute('data-section') + ' ' +
              element.getAttribute('title')
            ).toLowerCase();
            
            let score = 0;
            searchTerms.forEach(term => {
              if (elementText.includes(term)) {
                score += term.length * (elementText.indexOf(term) === 0 ? 2 : 1);
              }
            });
            
            if (element.id && element.id.toLowerCase() === sectionName.toLowerCase()) {
              score += 100;
            }
            
            if (score > bestScore) {
              bestScore = score;
              bestMatch = element;
            }
          });
        } catch (e) {
          console.warn('Section search error:', e);
        }
      });
      
      if (bestMatch) {
        bestMatch.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start',
          inline: 'nearest'
        });
        const offset = 80;
        window.scrollBy(0, -offset);
        return true;
      }
      
      return false;
    }
    
    findScrollTarget(targetText) {
      const searchText = targetText.toLowerCase();
      
      const targetSelectors = [
        \`[id="\${CSS.escape(targetText)}"]\`,
        \`[id*="\${CSS.escape(searchText)}"]\`,
        \`a[name="\${CSS.escape(targetText)}"]\`,
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        '[data-section]', '[role="region"]', 'section'
      ];
      
      for (const selector of targetSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            const elementText = this.getElementText(element).toLowerCase();
            const elementId = (element.id || '').toLowerCase();
            
            if (elementText.includes(searchText) || 
                elementId.includes(searchText) ||
                (element.getAttribute('data-section') || '').toLowerCase().includes(searchText)) {
              return element;
            }
          }
        } catch (e) {
          console.warn('Scroll target search error:', e);
        }
      }
      
      return null;
    }

    // UPDATED: Use smart finder for click_element
    async click_element(params) {
      const { target_text, element_type, nth_match } = params;
      console.log('🖱️ Finding element to click:', target_text, element_type, nth_match);
      
      try {
        this.updateStatus(\`🔍 Searching for: \${target_text}\`);
        
        // Use smart finder that handles dropdowns
        const element = await this.findElementSmart(target_text, element_type);
        
        if (element) {
          // ENHANCED: Check if this is a dropdown using multiple strategies
          const isDropdown = this.isDropdownFromContext(target_text) || this.looksLikeDropdownTrigger(element);
          
          if (isDropdown) {
            console.log('[DROPDOWN] 🎯 Detected dropdown trigger:', target_text);
            console.log('[QUEUE] 🔒 Setting dropdown opening flag');
            this.dropdownOpening = true;
          }
          
          await this.performClick(element);
          
          // CRITICAL FIX: If dropdown, wait 3 seconds for React to render items
          if (isDropdown) {
            console.log('[DROPDOWN] 🕐 Waiting 3 seconds for dropdown items to render...');
            await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
            console.log('[DROPDOWN] ✅ Dropdown should be fully open now');
            
            // Release the queue
            console.log('[QUEUE] 🔓 Releasing dropdown opening flag');
            this.dropdownOpening = false;
            
            // Process any queued commands
            if (this.commandQueue.length > 0) {
              await this.processCommandQueue();
            }
          }
          
          this.updateStatus(\`✅ Clicked: \${target_text}\`);
        } else {
          const suggestions = this.getSimilarElements(target_text);
          if (suggestions.length > 0) {
            console.log('🔍 Similar elements found:', suggestions.map(s => s.text));
            this.updateStatus(\`❌ Not found. Try: \${suggestions[0].text}\`);
          } else {
            this.updateStatus(\`❌ Element not found: \${target_text}\`);
          }
        }
      } catch (error) {
        console.error('❌ Error in click_element:', error);
        this.updateStatus(\`❌ Error: \${error.message}\`);
        
        // Release queue on error
        this.dropdownOpening = false;
        if (this.commandQueue.length > 0) {
          await this.processCommandQueue();
        }
      }
    }

    async performClick(element) {
      try {
        element.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
          inline: 'center'
        });
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        element.focus();
        
        if (element.tagName === 'A' && element.href) {
          try {
            const linkUrl = new URL(element.href, window.location.origin);
            const isSameOrigin = linkUrl.origin === window.location.origin;
            
            if (isSameOrigin) {
              const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true,
                ctrlKey: false,
                metaKey: false,
                button: 0
              });
              
              const defaultPrevented = !element.dispatchEvent(clickEvent);
              
              if (!defaultPrevented) {
                const pathname = linkUrl.pathname + linkUrl.search + linkUrl.hash;
                
                if (window.next?.router) {
                  window.next.router.push(pathname);
                  await new Promise(resolve => setTimeout(resolve, 500));
                  this.analyzePageContent();
                  return;
                }
                
                if (window.__REACT_ROUTER__) {
                  window.__REACT_ROUTER__.push(pathname);
                  await new Promise(resolve => setTimeout(resolve, 500));
                  this.analyzePageContent();
                  return;
                }
                
                if (window.history && window.history.pushState) {
                  window.history.pushState({}, '', pathname);
                  window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
                  window.dispatchEvent(new CustomEvent('navigate', { detail: { url: pathname } }));
                  await new Promise(resolve => setTimeout(resolve, 500));
                  this.analyzePageContent();
                  return;
                }
              } else {
                await new Promise(resolve => setTimeout(resolve, 500));
                this.analyzePageContent();
                return;
              }
            }
          } catch (urlError) {
            console.warn('URL parsing error:', urlError);
          }
        }
        
        const mouseEvents = ['mousedown', 'mouseup', 'click'];
        mouseEvents.forEach(eventType => {
          const event = new MouseEvent(eventType, {
            view: window,
            bubbles: true,
            cancelable: true,
            buttons: 1,
            button: 0
          });
          element.dispatchEvent(event);
        });
        
        element.click();
        
        await new Promise(resolve => setTimeout(resolve, 500));
        this.analyzePageContent();
        
      } catch (error) {
        console.error('❌ Click failed:', error);
        this.updateStatus('❌ Click failed');
        throw error;
      }
    }

    findElementByFuzzyMatch(targetText, elementType) {
      const searchTerms = targetText.toLowerCase().split(/\s+/);
      let bestMatch = null;
      let bestScore = 0;
      
      const typeFilters = {
        'button': ['button', '[role="button"]', 'input[type="button"]', 'input[type="submit"]', '.btn', '.button'],
        'link': ['a[href]'],
        'input': ['input', 'textarea'],
        'checkbox': ['input[type="checkbox"]'],
        'radio': ['input[type="radio"]'],
        'dropdown': ['select'],
        'menu': ['[role="menu"]', '[role="menuitem"]', '.menu', '.dropdown']
      };
      
      const selectors = elementType && typeFilters[elementType] ? 
        typeFilters[elementType] : 
        Object.values(typeFilters).flat();
      
      selectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(element => {
            if (!this.isVisible(element)) return;
            
            const elementText = this.getCompleteElementText(element).toLowerCase();
            
            let score = 0;
            searchTerms.forEach(term => {
              if (elementText.includes(term)) {
                score += term.length;
                if (new RegExp(\`\\\\b\${term}\\\\b\`).test(elementText)) {
                  score += term.length * 0.5;
                }
              }
            });
            
            if (elementText.length > 0) {
              score = score / Math.sqrt(elementText.length);
            }
            
            if (score > bestScore) {
              bestScore = score;
              bestMatch = element;
            }
          });
        } catch (e) {
          console.warn('Fuzzy match error:', e);
        }
      });
      
      return bestMatch;
    }

    findElementByPartialMatch(targetText, nthMatch = 0) {
      const searchText = targetText.toLowerCase();
      const matches = [];
      
      const clickableElements = document.querySelectorAll(
        'a, button, [role="button"], [role="menuitem"], input[type="submit"], input[type="button"], [onclick], [ng-click], [data-click]'
      );
      
      clickableElements.forEach(element => {
        if (!this.isVisible(element)) return;
        
        const elementText = this.getCompleteElementText(element).toLowerCase();
        
        if (elementText.includes(searchText)) {
          matches.push(element);
        }
      });
      
      return matches[nthMatch] || null;
    }

    getSimilarElements(targetText) {
      const searchText = targetText.toLowerCase();
      const similar = [];
      const maxSuggestions = 3;
      
      this.currentPageElements.forEach(item => {
        const itemText = item.text.toLowerCase();
        const similarity = this.calculateSimilarity(searchText, itemText);
        
        if (similarity > 0.3) {
          similar.push({
            element: item.element,
            text: item.text,
            similarity: similarity
          });
        }
      });
      
      return similar
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, maxSuggestions);
    }

    calculateSimilarity(str1, str2) {
      const longer = str1.length > str2.length ? str1 : str2;
      const shorter = str1.length > str2.length ? str2 : str1;
      
      if (longer.length === 0) return 1.0;
      
      const editDistance = this.levenshteinDistance(longer, shorter);
      return (longer.length - editDistance) / longer.length;
    }

    levenshteinDistance(str1, str2) {
      const matrix = [];
      
      for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
      }
      
      for (let j = 0 ; j <= str1.length; j++) {
        matrix[0][j] = j;
      }
      
      for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
          if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
            matrix[i][j] = matrix[i - 1][j - 1];
          } else {
            matrix[i][j] = Math.min(
              matrix[i - 1][j - 1] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j] + 1
            );
          }
        }
      }
      
      return matrix[str2.length][str1.length];
    }

    findElementByText(targetText) {
      const searchText = targetText.toLowerCase().trim();
      
      const clickableSelectors = [
        'a', 'button', '[role="button"]', '[role="menuitem"]', 
        'input[type="submit"]', 'input[type="button"]',
        '[onclick]', '[ng-click]', '[data-click]', '.clickable',
        '[role="link"]', '[tabindex]'
      ];
      
      for (const selector of clickableSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            if (!this.isVisible(element)) continue;
            
            const elementText = this.getCompleteElementText(element).toLowerCase().trim();
            
            if (elementText === searchText) {
              return element;
            }
          }
        } catch (e) {
          console.warn('Element search error:', e);
        }
      }
      
      return null;
    }

    findDropdownTrigger(menu) {
      // Strategy 1: Check aria-labelledby
      const labelledBy = menu.getAttribute('aria-labelledby');
      if (labelledBy) {
        const trigger = document.getElementById(labelledBy);
        if (trigger) return trigger;
      }

      // Strategy 2: Check previous sibling
      let sibling = menu.previousElementSibling;
      let attempts = 0;
      while (sibling && attempts < 3) {
        if (this.looksLikeDropdownTrigger(sibling)) {
          return sibling;
        }
        sibling = sibling.previousElementSibling;
        attempts++;
      }

      // Strategy 3: Check parent
      const parent = menu.parentElement;
      if (parent) {
        const triggers = parent.querySelectorAll('[aria-haspopup="true"], [aria-expanded], .dropdown-toggle');
        if (triggers.length > 0) {
          return triggers[0];
        }
      }

      return null;
    }

    // NEW: Check if element is a dropdown using context engine data
    isDropdownFromContext(targetText) {
      if (!this.contextCache || !this.contextCache.navigation) {
        return false;
      }
      
      const normalizedTarget = targetText.toLowerCase().trim();
      
      // Check topLevel navigation
      if (this.contextCache.navigation.topLevel) {
        const found = this.contextCache.navigation.topLevel.find(item => {
          const itemText = (item.text || '').toLowerCase().trim();
          return itemText === normalizedTarget && 
                 (item.type === 'dropdown' || item.hasDropdown === true);
        });
        
        if (found) {
          console.log('[DROPDOWN] ✅ Context engine confirms this is a dropdown:', targetText);
          return true;
        }
      }
      
      return false;
    }

    looksLikeDropdownTrigger(element) {
      // Enhanced detection with more patterns
      const hasAriaDropdown = element.getAttribute('aria-haspopup') === 'true' ||
                              element.getAttribute('aria-expanded') !== null;
      
      const hasDropdownClass = element.classList.contains('dropdown-toggle') ||
                               /dropdown|menu|nav-item/i.test(element.className);
      
      // Check if element has dropdown-related children
      const hasDropdownChildren = element.querySelector('[role="menu"], [class*="dropdown"], [class*="menu"]') !== null;
      
      // CRITICAL FIX: Check for SVG icon (chevron/arrow indicator)
      const hasSVGIcon = element.querySelector('svg') !== null;
      
      // Check common navigation patterns
      const isNavButtonWithIcon = element.tagName === 'BUTTON' && 
                                  element.closest('nav') !== null &&
                                  hasSVGIcon;
      
      // Check if nav button with "Resources" or "Courses" text (common dropdown triggers)
      const isCommonDropdownTrigger = element.tagName === 'BUTTON' &&
                                      element.closest('nav') !== null &&
                                      /resources|courses|products|services|solutions/i.test(this.getElementText(element));
      
      return hasAriaDropdown || hasDropdownClass || hasDropdownChildren || 
             isNavButtonWithIcon || isCommonDropdownTrigger;
    }

    async fill_field(params) {
      // ✅ FIX: Support both field_name and field_hint parameters (VAPI sends field_hint)
      const field_name = params.field_name || params.field_hint || params.fieldName || params.fieldHint;
      const value = params.value;
      
      console.log('[FIELD FILL] 🔍 Attempting to fill field:', field_name, 'with:', value);
      console.log('[FIELD FILL] 📦 Raw params received:', params);
      
      // ✅ FIX: Add parameter validation
      if (!field_name || !value) {
        console.error('[FIELD FILL] ❌ Missing required parameters:', { field_name, value });
        this.updateStatus('❌ Invalid field fill parameters');
        return;
      }
      
      // ✅ FIX: Use smart finder with retry logic for conditionally rendered fields
      let field = this.findInputField(field_name);
      
      // If not found, wait and retry (field might be rendering)
      if (!field) {
        console.log('[FIELD FILL] ⏳ Field not found, waiting for render...');
        await this.waitForReactRender(300);
        field = this.findInputField(field_name);
      }
      
      if (field) {
        console.log('[FIELD FILL] ✅ Field found, filling...');
        
        field.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
        
        await this.waitForReactRender(300);
        
        field.focus();
        
        // Clear existing value first
        field.value = '';
        
        // Set new value
        field.value = value;
        
        // Trigger all necessary events for React compatibility
        const events = ['input', 'change', 'blur'];
        events.forEach(eventType => {
          const event = new Event(eventType, { bubbles: true, cancelable: true });
          field.dispatchEvent(event);
        });
        
        // Trigger React synthetic events if available
        const reactPropsKey = Object.keys(field).find(key => 
          key.startsWith('__reactProps') || key.startsWith('__reactEventHandlers')
        );
        
        if (reactPropsKey) {
          const props = field[reactPropsKey];
          if (props.onChange) {
            props.onChange({ target: field, currentTarget: field });
          }
          if (props.onInput) {
            props.onInput({ target: field, currentTarget: field });
          }
        }
        
        console.log('[FIELD FILL] ✅ Successfully filled field:', field_name);
        this.updateStatus(\`✅ Filled: \${field_name}\`);
      } else {
        console.error('[FIELD FILL] ❌ Field not found after retry:', field_name);
        this.updateStatus(\`❌ Field not found: \${field_name}\`);
      }
    }

    findInputField(fieldName) {
      // ✅ FIX: Add defensive null/undefined check
      if (!fieldName || typeof fieldName !== 'string') {
        console.error('[FIELD FILL] Invalid field name:', fieldName);
        return null;
      }
      
      const searchText = fieldName.toLowerCase().trim();
      
      if (searchText.length === 0) {
        console.error('[FIELD FILL] Empty field name after trim');
        return null;
      }
      
      const inputs = document.querySelectorAll('input, textarea, select');
      
      for (const input of inputs) {
        if (!this.isVisible(input)) continue;
        
        const label = this.findLabelForInput(input) || '';
        const placeholder = input.placeholder || '';
        const name = input.name || '';
        const id = input.id || '';
        const ariaLabel = input.getAttribute('aria-label') || '';
        const type = input.type || '';
        
        // Build combined text with all possible identifiers
        const combinedText = (label + ' ' + placeholder + ' ' + name + ' ' + id + ' ' + ariaLabel + ' ' + type).toLowerCase();
        
        if (combinedText.includes(searchText)) {
          console.log('[FIELD FILL] ✅ Found field:', { fieldName, element: input });
          return input;
        }
      }
      
      console.log('[FIELD FILL] ❌ Field not found:', fieldName);
      return null;
    }

    findLabelForInput(input) {
      if (input.id) {
        const label = document.querySelector(\`label[for="\${input.id}"]\`);
        if (label) return label.textContent || '';
      }
      
      let parent = input.parentElement;
      let depth = 0;
      while (parent && depth < 3) {
        if (parent.tagName === 'LABEL') {
          return parent.textContent || '';
        }
        const label = parent.querySelector('label');
        if (label) {
          return label.textContent || '';
        }
        parent = parent.parentElement;
        depth++;
      }
      
      return '';
    }

    toggle_element(params) {
      const { target_text } = params;
      console.log('🔄 Toggling element:', target_text);
      
      const element = this.findToggleElement(target_text);
      
      if (element) {
        element.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
        
        setTimeout(() => {
          element.click();
          this.updateStatus(\`✅ Toggled: \${target_text}\`);
        }, 300);
      } else {
        this.updateStatus(\`❌ Toggle not found: \${target_text}\`);
      }
    }

    findToggleElement(targetText) {
      const searchText = targetText.toLowerCase();
      
      const toggleSelectors = [
        'input[type="checkbox"]',
        'input[type="radio"]',
        '[role="switch"]',
        '[role="checkbox"]',
        '.toggle',
        '.switch'
      ];
      
      for (const selector of toggleSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            if (!this.isVisible(element)) continue;
            
            const label = this.findLabelForInput(element);
            const ariaLabel = element.getAttribute('aria-label') || '';
            const combinedText = (label + ' ' + ariaLabel).toLowerCase();
            
            if (combinedText.includes(searchText)) {
              return element;
            }
          }
        } catch (e) {
          console.warn('Toggle search error:', e);
        }
      }
      
      return null;
    }

    analyzePageContent() {
      console.log('🔍 Analyzing page content...');
      this.currentPageElements = [];
      
      const clickableSelectors = [
        'a[href]',
        'button',
        '[role="button"]',
        '[role="menuitem"]',
        '[role="link"]',
        'input[type="submit"]',
        'input[type="button"]',
        '[onclick]',
        '.btn',
        '.button'
      ];
      
      clickableSelectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(element => {
            if (!this.isVisible(element)) return;
            
            const text = this.getElementText(element);
            if (text && text.length > 0 && text.length < 200) {
              this.currentPageElements.push({
                element: element,
                text: text,
                type: element.tagName.toLowerCase(),
                selector: selector
              });
            }
          });
        } catch (e) {
          console.warn('Analysis error:', e);
        }
      });
      
      console.log(\`📊 Found \${this.currentPageElements.length} interactive elements\`);
    }

    getElementText(element) {
      // Priority 1: aria-label
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel?.trim()) return ariaLabel.trim();
      
      // Priority 2: title
      const title = element.getAttribute('title');
      if (title?.trim()) return title.trim();
      
      // Priority 3: Input/textarea special handling
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        return element.placeholder || element.value || '';
      }
      
      // Priority 4: Direct text nodes only (excludes nested elements)
      let text = '';
      for (const node of element.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          const nodeText = node.textContent || '';
          if (nodeText.trim()) {
            text += nodeText;
          }
        }
      }
      
      // Priority 5: Full text content (fallback)
      if (!text.trim()) {
        text = element.textContent || element.innerText || '';
      }
      
      // FIXED: Clean whitespace properly without truncating characters
      return text.replace(/\s+/g, ' ').trim();
    }

    getCompleteElementText(element) {
      const parts = [
        element.textContent || '',
        element.getAttribute('aria-label') || '',
        element.getAttribute('title') || '',
        element.getAttribute('placeholder') || '',
        element.getAttribute('alt') || '',
        element.value || ''
      ];
      
      return parts.join(' ').trim().replace(/\s+/g, ' ');
    }

    isVisible(element) {
      if (!element || !element.offsetParent) {
        const style = element ? window.getComputedStyle(element) : null;
        if (!style) return false;
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden') return false;
        if (style.opacity === '0') return false;
        
        if (!element.offsetParent && element.tagName !== 'BODY') {
          return false;
        }
      }
      
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return false;
      }
      
      return true;
    }

    updateStatus(message) {
      if (this.statusEl) {
        this.statusEl.textContent = message;
      }
      console.log('📊 Status:', message);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new VAPICommandExecutor();
    });
  } else {
    new VAPICommandExecutor();
  }
})();
`;

  return new Response(jsContent, {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=300",
    },
  });
});
