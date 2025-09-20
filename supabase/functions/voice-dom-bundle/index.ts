import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const bundleCode = `
// Voice DOM Manipulation Bundle
(function() {
  'use strict';

  class VoiceNavigator {
    constructor(config) {
      this.config = config;
      this.userId = config.userId || config.uuid || config.assistant || 'anonymous';
      this.supabase = null;
      this.channel = null;
      this.currentPageElements = [];
      this.statusEl = null;
      
      console.log('[VoiceNavigator] Initializing with config:', config);
      console.log('[VoiceNavigator] Using userId:', this.userId);
      this.init();
    }

    init() {
      console.log('[VoiceNavigator] Initializing navigator...');
      this.createStatusIndicator();
      this.initSupabase();
      this.analyzePageContent();
      
      // Re-analyze page content when DOM changes
      const observer = new MutationObserver(() => {
        setTimeout(() => this.analyzePageContent(), 1000);
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    createStatusIndicator() {
      // Only create if doesn't exist
      if (document.getElementById('voice-nav-status')) return;
      
      const statusEl = document.createElement('div');
      statusEl.id = 'voice-nav-status';
      statusEl.style.cssText = \`
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0, 123, 255, 0.9);
        color: white;
        padding: 10px 15px;
        border-radius: 5px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        max-width: 300px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.3s ease;
      \`;
      
      document.body.appendChild(statusEl);
      this.statusEl = statusEl;
    }

    initSupabase() {
      // Use config provided supabase credentials if available
      const supabaseUrl = this.config.supabaseUrl || 'https://mdkcdjltvfpthqudhhmx.supabase.co';
      const supabaseKey = this.config.supabaseKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ka2Nkamx0dmZwdGhxdWRoaG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NDU3NTAsImV4cCI6MjA2OTUyMTc1MH0.YJAf_8-6tKTXp00h7liGNLvYC_-vJ4ttonAxP3ySvOg';
      
      if (typeof window.supabase === 'undefined') {
        // Load Supabase if not available
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/index.min.js';
        script.onload = () => {
          this.supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
          this.setupRealtimeSubscription();
        };
        document.head.appendChild(script);
      } else {
        this.supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
        this.setupRealtimeSubscription();
      }
    }

    setupRealtimeSubscription() {
      if (!this.supabase || !this.userId) {
        console.warn('[VoiceNavigator] Cannot setup realtime: missing supabase or userId');
        return;
      }

      console.log('[VoiceNavigator] Setting up realtime subscription for user:', this.userId);
      
      this.channel = this.supabase.channel(\`voice-commands-\${this.userId}\`)
        .on('broadcast', { event: 'voice_command' }, (payload) => {
          console.log('[VoiceNavigator] Received voice command:', payload);
          this.executeCommand(payload.payload);
        })
        .subscribe((status) => {
          console.log('[VoiceNavigator] Realtime subscription status:', status);
          if (status === 'SUBSCRIBED') {
            this.showStatus('Voice navigation ready');
          }
        });
    }

    executeCommand(command) {
      console.log('[VoiceNavigator] Executing command:', command);
      
      switch (command.action) {
        case 'scroll':
          this.scrollPage(command.direction);
          break;
        case 'click':
          this.clickElement(command.targetText);
          break;
        case 'fill':
          this.fillField(command.value, command.fieldHint);
          break;
        case 'toggle':
          this.toggleElement(command.target);
          break;
        default:
          console.warn('[VoiceNavigator] Unknown command action:', command.action);
      }
    }

    scrollPage(direction) {
      console.log('[VoiceNavigator] Scrolling:', direction);

      switch(direction.toLowerCase()) {
        case 'up':
          window.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' });
          break;
        case 'down':
          window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
          break;
        case 'top':
          window.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'bottom':
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
          break;
      }
      this.showStatus(\`Scrolled \${direction}\`);
    }

    clickElement(targetText) {
      console.log('[VoiceNavigator] Clicking element:', targetText);

      const selectors = [
        'button', 'a', '[role="button"]', '.btn', '.button',
        'input[type="button"]', 'input[type="submit"]', '.click'
      ];

      const elements = [];
      selectors.forEach(selector => {
        elements.push(...document.querySelectorAll(selector));
      });

      const scored = elements.map(el => ({
        element: el,
        score: this.calculateTextSimilarity(this.getElementText(el), targetText)
      })).filter(item => item.score > 0.3);

      if (scored.length === 0) {
        this.showStatus('No clickable element found');
        return;
      }

      scored.sort((a, b) => b.score - a.score);
      const bestMatch = scored[0].element;

      this.highlightElement(bestMatch);
      setTimeout(() => {
        bestMatch.click();
        this.showStatus(\`Clicked: \${this.getElementText(bestMatch)}\`);
      }, 500);
    }

    fillField(value, fieldHint = 'text') {
      console.log('[VoiceNavigator] Filling field:', { value, fieldHint });

      const fieldSelectors = {
        email: ['input[type="email"]', 'input[name*="email"]', 'input[placeholder*="email"]'],
        name: ['input[name*="name"]', 'input[placeholder*="name"]', 'input[type="text"]'],
        search: ['input[type="search"]', 'input[name*="search"]', '.search input'],
        message: ['textarea', 'input[name*="message"]', 'input[name*="comment"]'],
        phone: ['input[type="tel"]', 'input[name*="phone"]', 'input[placeholder*="phone"]'],
        text: ['input[type="text"]', 'input:not([type])'],
      };

      const selectors = fieldSelectors[fieldHint] || fieldSelectors.text;
      let targetField = null;

      for (const selector of selectors) {
        const fields = document.querySelectorAll(selector);
        if (fields.length > 0) {
          targetField = Array.from(fields).find(field => 
            this.isElementVisible(field) && !field.disabled
          );
          if (targetField) break;
        }
      }

      if (!targetField) {
        this.showStatus('No suitable field found');
        return;
      }

      this.highlightElement(targetField);
      setTimeout(() => {
        targetField.focus();
        targetField.value = value;
        targetField.dispatchEvent(new Event('input', { bubbles: true }));
        targetField.dispatchEvent(new Event('change', { bubbles: true }));
        this.showStatus(\`Filled field with: \${value}\`);
      }, 500);
    }

    toggleElement(target) {
      console.log('[VoiceNavigator] Toggling element:', target);

      const selectors = [
        '[role="switch"]', '.toggle', '.switch',
        'input[type="checkbox"]', 'details', '.dropdown',
        '.menu-toggle', '.nav-toggle', '[aria-expanded]'
      ];

      const elements = [];
      selectors.forEach(selector => {
        elements.push(...document.querySelectorAll(selector));
      });

      const scored = elements.map(el => ({
        element: el,
        score: this.calculateTextSimilarity(
          this.getElementText(el) + ' ' + (el.getAttribute('aria-label') || ''),
          target
        )
      })).filter(item => item.score > 0.2);

      if (scored.length === 0) {
        this.showStatus('No toggleable element found');
        return;
      }

      scored.sort((a, b) => b.score - a.score);
      const bestMatch = scored[0].element;

      this.highlightElement(bestMatch);
      setTimeout(() => {
        if (bestMatch.tagName === 'DETAILS') {
          bestMatch.open = !bestMatch.open;
        } else if (bestMatch.type === 'checkbox') {
          bestMatch.checked = !bestMatch.checked;
        } else {
          bestMatch.click();
        }
        this.showStatus(\`Toggled: \${this.getElementText(bestMatch)}\`);
      }, 500);
    }

    analyzePageContent() {
      console.log('[VoiceNavigator] Analyzing page content...');
      this.currentPageElements = [];
      
      const selectors = [
        'a[href]:not([href^="#"]):not([href^="javascript:"]):not([href^="mailto:"]):not([href^="tel:"])',
        'button:not([disabled])',
        '[role="button"]:not([disabled])',
        'input[type="submit"]:not([disabled])',
        'input[type="button"]:not([disabled])',
        '.btn:not([disabled])',
        '.button:not([disabled])'
      ];
      
      selectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(el => {
            if (this.isElementVisible(el)) {
              const text = this.getElementText(el);
              if (text && text.length > 0) {
                this.currentPageElements.push({
                  element: el,
                  text: text,
                  href: el.href || ''
                });
              }
            }
          });
        } catch (e) {
          console.warn('[VoiceNavigator] Selector error:', selector, e);
        }
      });
      
      console.log(\`[VoiceNavigator] Found \${this.currentPageElements.length} interactive elements\`);
    }

    // Utility Functions
    getElementText(element) {
      return (element.textContent || element.value || element.placeholder || 
              element.getAttribute('aria-label') || '').trim();
    }

    calculateTextSimilarity(text1, text2) {
      const a = text1.toLowerCase();
      const b = text2.toLowerCase();

      if (a.includes(b) || b.includes(a)) return 0.9;

      const words1 = a.split(/\\s+/);
      const words2 = b.split(/\\s+/);
      const matches = words1.filter(word => 
        words2.some(w => w.includes(word) || word.includes(w))
      ).length;

      return matches / Math.max(words1.length, words2.length);
    }

    isElementVisible(element) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && 
             style.display !== 'none' && style.visibility !== 'hidden';
    }

    highlightElement(element) {
      element.style.outline = '3px solid #007bff';
      element.style.backgroundColor = 'rgba(0, 123, 255, 0.1)';
      setTimeout(() => {
        element.style.outline = '';
        element.style.backgroundColor = '';
      }, 1000);
    }

    showStatus(message) {
      if (!this.statusEl) return;
      
      this.statusEl.textContent = message;
      this.statusEl.style.opacity = '1';

      setTimeout(() => {
        this.statusEl.style.opacity = '0';
      }, 3000);
    }
  }

  // Global initialization function
  window.initVoiceNavigator = function(config) {
    console.log('[VoiceNavigator] Initializing Voice Navigator with config:', config);
    new VoiceNavigator(config);
  };

})();
`;

  return new Response(bundleCode, {
    headers: { ...corsHeaders, 'Content-Type': 'application/javascript' }
  });
});