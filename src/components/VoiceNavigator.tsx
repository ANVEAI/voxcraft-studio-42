import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface VoiceNavigatorProps {
  userId: string;
  enabled?: boolean;
}

const VoiceNavigator: React.FC<VoiceNavigatorProps> = ({ 
  userId, 
  enabled = true 
}) => {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const channelRef = useRef<any>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled || !userId) return;

    console.log('[VoiceNavigator] Setting up for user:', userId);
    
    // Subscribe to voice commands for this user
    const channel = supabase.channel(`voice-commands-${userId}`)
      .on('broadcast', { event: 'voice_command' }, (payload) => {
        console.log('[VoiceNavigator] Received command:', payload);
        executeCommand(payload.payload);
      })
      .subscribe((status) => {
        console.log('[VoiceNavigator] Subscription status:', status);
        setIsSubscribed(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [userId, enabled]);

  const executeCommand = (command: any) => {
    console.log('[VoiceNavigator] Executing command:', command);
    
    switch (command.action) {
      case 'scroll':
        scrollPage(command.direction);
        break;
      case 'click':
        clickElement(command.targetText);
        break;
      case 'fill':
        fillField(command.value, command.fieldHint);
        break;
      case 'toggle':
        toggleElement(command.target);
        break;
      default:
        console.warn('[VoiceNavigator] Unknown command action:', command.action);
    }
  };

  const scrollPage = (direction: string) => {
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
    showStatus(`Scrolled ${direction}`);
  };

  const clickElement = (targetText: string) => {
    console.log('[VoiceNavigator] Clicking element:', targetText);

    const selectors = [
      'button', 'a', '[role="button"]', '.btn', '.button',
      'input[type="button"]', 'input[type="submit"]', '.click'
    ];

    const elements: HTMLElement[] = [];
    selectors.forEach(selector => {
      elements.push(...Array.from(document.querySelectorAll(selector) as NodeListOf<HTMLElement>));
    });

    const scored = elements.map(el => ({
      element: el,
      score: calculateTextSimilarity(getElementText(el), targetText)
    })).filter(item => item.score > 0.3);

    if (scored.length === 0) {
      showStatus('No clickable element found');
      return;
    }

    scored.sort((a, b) => b.score - a.score);
    const bestMatch = scored[0].element;

    highlightElement(bestMatch);
    setTimeout(() => {
      bestMatch.click();
      showStatus(`Clicked: ${getElementText(bestMatch)}`);
    }, 500);
  };

  const fillField = (value: string, fieldHint = 'text') => {
    console.log('[VoiceNavigator] Filling field:', { value, fieldHint });

    const fieldSelectors: Record<string, string[]> = {
      email: ['input[type="email"]', 'input[name*="email"]', 'input[placeholder*="email"]'],
      name: ['input[name*="name"]', 'input[placeholder*="name"]', 'input[type="text"]'],
      search: ['input[type="search"]', 'input[name*="search"]', '.search input'],
      message: ['textarea', 'input[name*="message"]', 'input[name*="comment"]'],
      phone: ['input[type="tel"]', 'input[name*="phone"]', 'input[placeholder*="phone"]'],
      text: ['input[type="text"]', 'input:not([type])'],
    };

    const selectors = fieldSelectors[fieldHint] || fieldSelectors.text;
    let targetField: HTMLInputElement | HTMLTextAreaElement | null = null;

    for (const selector of selectors) {
      const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(selector);
      if (fields.length > 0) {
        targetField = Array.from(fields).find(field => 
          isElementVisible(field) && !field.disabled
        ) || null;
        if (targetField) break;
      }
    }

    if (!targetField) {
      showStatus('No suitable field found');
      return;
    }

    highlightElement(targetField);
    setTimeout(() => {
      if (targetField) {
        targetField.focus();
        targetField.value = value;
        targetField.dispatchEvent(new Event('input', { bubbles: true }));
        targetField.dispatchEvent(new Event('change', { bubbles: true }));
        showStatus(`Filled field with: ${value}`);
      }
    }, 500);
  };

  const toggleElement = (target: string) => {
    console.log('[VoiceNavigator] Toggling element:', target);

    const selectors = [
      '[role="switch"]', '.toggle', '.switch',
      'input[type="checkbox"]', 'details', '.dropdown',
      '.menu-toggle', '.nav-toggle', '[aria-expanded]'
    ];

    const elements: HTMLElement[] = [];
    selectors.forEach(selector => {
      elements.push(...Array.from(document.querySelectorAll(selector) as NodeListOf<HTMLElement>));
    });

    const scored = elements.map(el => ({
      element: el,
      score: calculateTextSimilarity(
        getElementText(el) + ' ' + (el.getAttribute('aria-label') || ''),
        target
      )
    })).filter(item => item.score > 0.2);

    if (scored.length === 0) {
      showStatus('No toggleable element found');
      return;
    }

    scored.sort((a, b) => b.score - a.score);
    const bestMatch = scored[0].element;

    highlightElement(bestMatch);
    setTimeout(() => {
      if (bestMatch.tagName === 'DETAILS') {
        (bestMatch as HTMLDetailsElement).open = !(bestMatch as HTMLDetailsElement).open;
      } else if ((bestMatch as HTMLInputElement).type === 'checkbox') {
        (bestMatch as HTMLInputElement).checked = !(bestMatch as HTMLInputElement).checked;
      } else {
        bestMatch.click();
      }
      showStatus(`Toggled: ${getElementText(bestMatch)}`);
    }, 500);
  };

  // Utility Functions
  const getElementText = (element: HTMLElement): string => {
    return (element.textContent || 
            (element as HTMLInputElement).value || 
            (element as HTMLInputElement).placeholder || 
            element.getAttribute('aria-label') || 
            '').trim();
  };

  const calculateTextSimilarity = (text1: string, text2: string): number => {
    const a = text1.toLowerCase();
    const b = text2.toLowerCase();

    if (a.includes(b) || b.includes(a)) return 0.9;

    const words1 = a.split(/\s+/);
    const words2 = b.split(/\s+/);
    const matches = words1.filter(word => 
      words2.some(w => w.includes(word) || word.includes(w))
    ).length;

    return matches / Math.max(words1.length, words2.length);
  };

  const isElementVisible = (element: HTMLElement): boolean => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && 
           style.display !== 'none' && style.visibility !== 'hidden';
  };

  const highlightElement = (element: HTMLElement) => {
    element.style.outline = '3px solid #007bff';
    element.style.backgroundColor = 'rgba(0, 123, 255, 0.1)';
    setTimeout(() => {
      element.style.outline = '';
      element.style.backgroundColor = '';
    }, 1000);
  };

  const showStatus = (message: string) => {
    // Create or update status indicator
    let status = statusRef.current || document.getElementById('voice-nav-status') as HTMLDivElement;
    if (!status) {
      status = document.createElement('div');
      status.id = 'voice-nav-status';
      status.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 10000;
        background: #007bff; color: white; padding: 10px 15px;
        border-radius: 5px; font-family: Arial, sans-serif;
        font-size: 14px; max-width: 300px; box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      `;
      document.body.appendChild(status);
      statusRef.current = status;
    }

    status.textContent = message;
    status.style.opacity = '1';

    setTimeout(() => {
      status.style.opacity = '0';
    }, 3000);
  };

  // This component doesn't render anything visible - it just handles voice commands
  return null;
};

export default VoiceNavigator;