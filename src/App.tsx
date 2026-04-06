/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, 
  History, 
  Send, 
  Sparkles, 
  Trash2, 
  Settings, 
  Save, 
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Copy,
  LayoutDashboard,
  Clock,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

declare const chrome: any;

interface ListingData {
  id: string;
  timestamp: number;
  title: string;
  description: string;
  tags: string[];
  price: string;
  category: string;
  quantity: string;
  rawInput?: string;
}

interface OpenAIResponse {
  title: string;
  description: string;
  tags: string[];
  price: string;
  category: string;
}

// --- Constants ---

const STORAGE_KEY_HISTORY = 'etsy_listing_history_v2';
const STORAGE_KEY_API_KEY = 'etsy_openai_api_key_v2';
const STORAGE_KEY_EXTENSION = 'listingData';

export default function App() {
  // --- State ---
  const [history, setHistory] = useState<ListingData[]>([]);
  const [currentListing, setCurrentListing] = useState<ListingData | null>(null);
  const [rawInput, setRawInput] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isTestingKey, setIsTestingKey] = useState(false);

  // --- Initialization ---
  useEffect(() => {
    const savedHistory = localStorage.getItem(STORAGE_KEY_HISTORY);
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Failed to parse history', e);
      }
    }

    const savedApiKey = localStorage.getItem(STORAGE_KEY_API_KEY);
    if (savedApiKey) {
      setApiKey(savedApiKey);
    }
  }, []);

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
  }, [history]);

  const saveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem(STORAGE_KEY_API_KEY, key);
    setShowSettings(false);
    showStatus('success', 'API Key saved successfully');
  };

  // --- Helpers ---
  const showStatus = (type: 'success' | 'error', message: string) => {
    setStatus({ type, message });
    setTimeout(() => setStatus(null), 5000);
  };

  const createNewListing = () => {
    setCurrentListing(null);
    setRawInput('');
  };

  const deleteListing = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
    if (currentListing?.id === id) {
      setCurrentListing(null);
    }
    showStatus('success', 'Listing deleted');
  };

  // --- Text Cleaning Logic ---
  const cleanText = (text: string) => {
    return text
      .replace(/\s+/g, ' ')
      .replace(/收藏|客服|立即购买|加入购物车/g, '')
      .slice(0, 3000);
  };

  // --- AI Logic ---
  const generateListing = async () => {
    if (!apiKey) {
      setShowSettings(true);
      showStatus('error', 'Please enter your OpenAI API Key first');
      return;
    }

    if (!rawInput.trim()) {
      showStatus('error', 'Please paste some product content first');
      return;
    }

    setIsLoading(true);
    try {
      const cleanedContent = cleanText(rawInput);
      
      const prompt = `
        You are an Etsy SEO expert and translator.

        Convert the following product content into a high-converting Etsy listing.

        CONTENT:
        ${cleanedContent}

        Requirements:
        * Translate Chinese to natural, fluent English.
        * Rewrite (not literal translation) to sound like a native Etsy seller.
        * Optimize for Etsy SEO (keywords, engaging hooks).
        * Use emotional and aesthetic language (kawaii, cozy, soft, dreamy style when appropriate).
        * The final output price must be in USD (suggest a reasonable Etsy-style price).

        Return JSON:
        {
          "title": "",
          "description": "",
          "tags": [],
          "price": "9.99",
          "category": ""
        }
      `;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data?.error?.message || response.statusText || `Status ${response.status}`;
        throw new Error(`OpenAI API Error: ${errorMessage}`);
      }

      const content: OpenAIResponse = JSON.parse(data.choices[0].message.content);

      const newListing: ListingData = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        ...content,
        quantity: "999",
        rawInput
      };

      setCurrentListing(newListing);
      setHistory(prev => [newListing, ...prev]);
      showStatus('success', 'Listing generated successfully!');
    } catch (error) {
      console.error(error);
      showStatus('error', error instanceof Error ? error.message : 'Failed to generate listing');
    } finally {
      setIsLoading(false);
    }
  };

  // --- Extension Push ---
  const pushToEtsy = (data: ListingData) => {
    const payload = {
      title: data.title,
      description: data.description,
      tags: data.tags,
      price: data.price,
      category: data.category,
      quantity: data.quantity
    };

    // Send message to Chrome Extension via window.postMessage
    // This is the standard way for a web page to talk to a content script
    window.postMessage({
      type: "SET_ETSY_DATA",
      payload: payload
    }, "*");

    // Also save to localStorage as a backup/fallback
    localStorage.setItem('listingData', JSON.stringify(payload));
    
    showStatus('success', '✅ Sent to extension!');
  };

  const handleUpdateField = (field: keyof ListingData, value: any) => {
    if (!currentListing) return;
    const updated = { ...currentListing, [field]: value };
    setCurrentListing(updated);
    
    // Update in history too
    setHistory(prev => prev.map(item => item.id === updated.id ? updated : item));
  };

  const testApiKey = async (key: string) => {
    if (!key) {
      showStatus('error', 'Please enter a key to test');
      return;
    }
    setIsTestingKey(true);
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Say "ok"' }],
          max_tokens: 5
        })
      });

      const data = await response.json();
      if (response.ok) {
        showStatus('success', 'API Key is valid and working!');
      } else {
        throw new Error(data?.error?.message || 'Invalid API Key');
      }
    } catch (error) {
      showStatus('error', error instanceof Error ? error.message : 'Connection test failed');
    } finally {
      setIsTestingKey(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#FBFBFA] text-[#37352F] font-sans overflow-hidden">
      {/* --- Sidebar --- */}
      <aside className="w-64 border-r border-[#E9E9E7] bg-[#F7F7F5] flex flex-col shrink-0">
        <div className="p-4 flex items-center justify-between border-b border-[#E9E9E7]">
          <h1 className="font-semibold text-sm tracking-tight flex items-center gap-2">
            <LayoutDashboard className="w-4 h-4 text-orange-500" />
            Etsy Generator
          </h1>
          <button 
            onClick={createNewListing}
            className="p-1 hover:bg-[#E9E9E7] rounded transition-colors"
            title="New Listing"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <div className="px-3 mb-2 text-[11px] font-bold text-[#9B9A97] uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            History
          </div>
          {history.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-[#9B9A97]">
              No history found
            </div>
          ) : (
            history.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentListing(item);
                  setRawInput(item.rawInput || '');
                }}
                className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 group transition-colors ${
                  currentListing?.id === item.id ? 'bg-[#E9E9E7]' : 'hover:bg-[#E9E9E7]'
                }`}
              >
                <div className="truncate flex-1">{item.title || 'Untitled Listing'}</div>
                <Trash2 
                  className="w-3.5 h-3.5 text-[#9B9A97] opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity" 
                  onClick={(e) => deleteListing(item.id, e)}
                />
              </button>
            ))
          )}
        </div>

        <div className="p-4 border-t border-[#E9E9E7]">
          <button 
            onClick={() => setShowSettings(true)}
            className="w-full flex items-center gap-2 text-sm text-[#9B9A97] hover:text-[#37352F] transition-colors"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </aside>

      {/* --- Main Content --- */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Status Messages */}
        <AnimatePresence>
          {status && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium ${
                status.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {status.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {status.message}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto w-full">
          {/* Input Section */}
          <section className="mb-12">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold tracking-tight">Paste Product Page Content</h2>
              <button
                onClick={generateListing}
                disabled={isLoading}
                className="bg-[#37352F] text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 hover:bg-[#47453F] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Generate Listing
              </button>
            </div>
            <div className="relative">
              <textarea
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder="Paste messy text from 1688/Taobao product page..."
                className="w-full h-48 p-4 bg-white border border-[#E9E9E7] rounded-xl focus:ring-2 focus:ring-[#37352F]/10 focus:border-[#37352F] outline-none transition-all resize-none text-sm font-mono"
              />
              {!rawInput && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-[#9B9A97] text-sm italic">
                  Content will be cleaned and limited to 3000 chars
                </div>
              )}
            </div>
          </section>

          {/* Editor Section */}
          <AnimatePresence mode="wait">
            {currentListing ? (
              <motion.section 
                key={currentListing.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8 pb-20"
              >
                <div className="border-t border-[#E9E9E7] pt-8">
                  <div className="flex items-center gap-2 text-[#9B9A97] text-xs font-medium uppercase tracking-widest mb-6">
                    <ChevronRight className="w-3 h-3" />
                    Editor
                  </div>

                  <div className="grid gap-6">
                    {/* Title */}
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-semibold text-[#37352F]/70">Title ({currentListing.title.length}/140)</label>
                      <input
                        type="text"
                        value={currentListing.title}
                        onChange={(e) => handleUpdateField('title', e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#E9E9E7] rounded-md focus:border-[#37352F] outline-none text-sm"
                      />
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-semibold text-[#37352F]/70">Description</label>
                      <textarea
                        value={currentListing.description}
                        onChange={(e) => handleUpdateField('description', e.target.value)}
                        className="w-full h-64 px-3 py-2 bg-white border border-[#E9E9E7] rounded-md focus:border-[#37352F] outline-none text-sm resize-y"
                      />
                    </div>

                    {/* Tags */}
                    <div className="space-y-1.5">
                      <label className="text-[13px] font-semibold text-[#37352F]/70">Tags (Comma separated, max 13)</label>
                      <input
                        type="text"
                        value={currentListing.tags.join(', ')}
                        onChange={(e) => handleUpdateField('tags', e.target.value.split(',').map(t => t.trim()))}
                        className="w-full px-3 py-2 bg-white border border-[#E9E9E7] rounded-md focus:border-[#37352F] outline-none text-sm"
                      />
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {currentListing.tags.map((tag, i) => (
                          <span key={i} className="px-2 py-0.5 bg-[#F7F7F5] border border-[#E9E9E7] rounded text-[11px] text-[#37352F]/60">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Grid for small fields */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-[13px] font-semibold text-[#37352F]/70">Category</label>
                        <input
                          type="text"
                          value={currentListing.category}
                          onChange={(e) => handleUpdateField('category', e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-[#E9E9E7] rounded-md focus:border-[#37352F] outline-none text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[13px] font-semibold text-[#37352F]/70">Price (USD)</label>
                        <input
                          type="text"
                          value={currentListing.price}
                          onChange={(e) => handleUpdateField('price', e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-[#E9E9E7] rounded-md focus:border-[#37352F] outline-none text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[13px] font-semibold text-[#37352F]/70">Quantity</label>
                        <input
                          type="text"
                          value={currentListing.quantity}
                          onChange={(e) => handleUpdateField('quantity', e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-[#E9E9E7] rounded-md focus:border-[#37352F] outline-none text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-12 flex justify-end gap-3">
                    <button 
                      onClick={() => pushToEtsy(currentListing)}
                      className="px-6 py-2.5 bg-[#37352F] text-white rounded-md text-sm font-medium hover:bg-[#47453F] transition-colors flex items-center gap-2 shadow-sm"
                    >
                      <Send className="w-4 h-4" />
                      Push to Etsy
                    </button>
                  </div>
                </div>
              </motion.section>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-[#9B9A97]">
                <Sparkles className="w-12 h-12 mb-4 opacity-10" />
                <p className="text-sm">Paste product content above to generate your listing</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* --- Settings Modal --- */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white w-full max-w-md rounded-xl shadow-2xl border border-[#E9E9E7] p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold">Settings</h3>
                <button onClick={() => setShowSettings(false)} className="text-[#9B9A97] hover:text-[#37352F]">
                  <Plus className="w-5 h-5 rotate-45" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#9B9A97] uppercase tracking-wider">OpenAI API Key</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 bg-[#F7F7F5] border border-[#E9E9E7] rounded-md focus:border-[#37352F] outline-none text-sm"
                  />
                  <div className="flex gap-2 mt-2">
                    <button 
                      onClick={() => testApiKey(apiKey)}
                      disabled={isTestingKey}
                      className="flex-1 px-3 py-1.5 border border-[#E9E9E7] rounded text-xs font-medium hover:bg-[#F7F7F5] transition-colors disabled:opacity-50"
                    >
                      {isTestingKey ? 'Testing...' : 'Test Connection'}
                    </button>
                    <button 
                      onClick={() => saveApiKey(apiKey)}
                      className="flex-1 px-3 py-1.5 bg-[#37352F] text-white rounded text-xs font-medium hover:bg-[#47453F] transition-colors"
                    >
                      Save Key
                    </button>
                  </div>
                  <p className="text-[11px] text-[#9B9A97] mt-2">
                    Your key is stored locally in your browser.
                  </p>
                </div>

                <div className="pt-4 border-t border-[#E9E9E7]">
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="w-full py-2 text-sm text-[#9B9A97] hover:text-[#37352F] transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
