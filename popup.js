let lastContentScriptInjectionError = '';

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0] || null);
    });
  });
}

function isSupportedPage(url) {
  return Boolean(url && (
    url.includes('facebook.com/marketplace') ||
    url.includes('messenger.com/marketplace')
  ));
}

function getContentScriptFiles(url) {
  if (url && url.includes('messenger.com/marketplace')) {
    return ['messenger-marketplace.js'];
  }

  if (url && url.includes('facebook.com/marketplace')) {
    return ['price-tracker.js', 'content.js'];
  }

  return [];
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response);
    });
  });
}

async function ensureContentScript(tab) {
  if (!tab || !tab.id || !isSupportedPage(tab.url)) {
    return false;
  }

  if (!chrome.scripting || !chrome.scripting.executeScript) {
    console.warn('Popup: chrome.scripting is unavailable. Reload the extension so the updated manifest permissions take effect.');
    lastContentScriptInjectionError = 'Reload extension to enable new permissions';
    return false;
  }

  const files = getContentScriptFiles(tab.url);
  if (files.length === 0) {
    return false;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files
    });
    await wait(150);
    return true;
  } catch (error) {
    console.warn('Popup: Could not inject content script:', error);
    lastContentScriptInjectionError = 'Could not inject script - reload extension';
    return false;
  }
}

// Helper function to send messages to content script
async function sendToContent(message, options = {}) {
  const tab = await getActiveTab();
  if (!tab || !tab.id) {
    return null;
  }

  let response = await sendMessageToTab(tab.id, message);
  if (response || options.skipInject) {
    return response;
  }

  const didInject = await ensureContentScript(tab);
  if (!didInject) {
    return null;
  }

  return sendMessageToTab(tab.id, message);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Display price check results
function displayPriceResults(data) {
  const priceResults = document.getElementById('priceResults');
  if (!priceResults) return;

  const { totalChecked, drops, increases, newItems } = data;

  let html = '';

  if (drops.length > 0) {
    html += '<div style="font-weight: 600; margin-bottom: 6px; color: #42b72a;">Price Drops:</div>';
    drops.forEach(item => {
      const dropPercent = ((item.dropAmount / item.previousPrice) * 100).toFixed(0);
      // Format the previous price - show as "?" if it was a placeholder
      const prevPriceDisplay = item.previousPrice > 100000 ? '?' : `$${item.previousPrice.toFixed(2)}`;
      html += `
        <div class="price-drop" data-item-id="${item.itemId}" style="cursor: pointer;">
          <div class="price-item-title">${escapeHtml(item.title)}</div>
          <div class="price-change">
            ${prevPriceDisplay} → $${item.currentPrice.toFixed(2)}
            (-$${item.dropAmount.toFixed(2)}, ${dropPercent}% off)
          </div>
        </div>
      `;
    });
  }

  if (increases.length > 0) {
    html += '<div style="font-weight: 600; margin: 12px 0 6px 0; color: #f7b928;">Price Increases:</div>';
    increases.forEach(item => {
      const increasePercent = ((item.increaseAmount / item.previousPrice) * 100).toFixed(0);
      // Format the previous price - show as "?" if it was a placeholder
      const prevPriceDisplay = item.previousPrice > 100000 ? '?' : `$${item.previousPrice.toFixed(2)}`;
      html += `
        <div class="price-increase" data-item-id="${item.itemId}" style="cursor: pointer;">
          <div class="price-item-title">${escapeHtml(item.title)}</div>
          <div class="price-change">
            ${prevPriceDisplay} → $${item.currentPrice.toFixed(2)}
            (+$${item.increaseAmount.toFixed(2)}, +${increasePercent}%)
          </div>
        </div>
      `;
    });
  }

  if (drops.length === 0 && increases.length === 0) {
    html += '<div style="color: #65676b; font-size: 12px; text-align: center; padding: 8px;">No price changes detected</div>';
  }

  html += `
    <div class="price-stats">
      Checked ${totalChecked} item${totalChecked !== 1 ? 's' : ''} •
      ${drops.length} drop${drops.length !== 1 ? 's' : ''} •
      ${increases.length} increase${increases.length !== 1 ? 's' : ''} •
      ${newItems.length} new
    </div>
  `;

  priceResults.innerHTML = html;
  priceResults.style.display = 'block';

  // Add click handlers to scroll to items
  priceResults.querySelectorAll('[data-item-id]').forEach(el => {
    el.addEventListener('click', async () => {
      const itemId = el.getAttribute('data-item-id');
      await sendToContent({ action: 'scrollToItem', itemId: itemId });
    });
  });
}

// Restore price check results from storage when popup opens
async function restorePriceCheckResults() {
  const response = await sendToContent({ action: 'getPriceCheckResults' });

  if (response && response.results) {
    // Check if results are recent (within last hour)
    const ONE_HOUR = 60 * 60 * 1000;
    const age = Date.now() - response.timestamp;

    if (age < ONE_HOUR) {
      console.log('Popup: Restoring price check results from storage');
      displayPriceResults(response.results);
    } else {
      console.log('Popup: Stored price results are too old, ignoring');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const hideSoldCheckbox = document.getElementById('hideSold');
  const hidePendingCheckbox = document.getElementById('hidePending');
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const searchStatus = document.getElementById('searchStatus');
  const searchNav = document.getElementById('searchNav');
  const prevMatchBtn = document.getElementById('prevMatch');
  const nextMatchBtn = document.getElementById('nextMatch');
  const clearSearchBtn = document.getElementById('clearSearch');
  const matchPosition = document.getElementById('matchPosition');
  const loadAllBtn = document.getElementById('loadAllBtn');
  const filterSection = document.getElementById('filterSection');
  const searchTitle = document.getElementById('searchTitle');
  const helpText = document.getElementById('helpText');
  const navLink = document.getElementById('navLink');
  const checkPricesBtn = document.getElementById('checkPricesBtn');
  const priceResults = document.getElementById('priceResults');
  const priceSection = document.getElementById('priceSection');

  let isLoading = false;
  let isMessengerPage = false;
  let isCheckingPrices = false;

  function getItemLabel(count) {
    const singular = isMessengerPage ? 'conversation' : 'item';
    const plural = isMessengerPage ? 'conversations' : 'items';
    return count === 1 ? singular : plural;
  }

  function getDefaultLoadAllText() {
    return isMessengerPage ?
      'Load all conversations (scroll to bottom)' :
      'Load all items (scroll to bottom)';
  }

  async function getStatsWithRetry() {
    let latestStats = null;
    lastContentScriptInjectionError = '';

    for (let attempt = 0; attempt < 10; attempt++) {
      latestStats = await sendToContent({ action: 'getStats' });

      if (!latestStats) {
        await wait(300);
        continue;
      }

      if (latestStats.ready || latestStats.status === 'empty') {
        return latestStats;
      }

      await wait(400);
    }

    return latestStats;
  }

  chrome.storage.sync.get(['hideSold', 'hidePending'], (result) => {
    hideSoldCheckbox.checked = result.hideSold !== false;
    hidePendingCheckbox.checked = result.hidePending === true;
  });

  hideSoldCheckbox.addEventListener('change', (e) => {
    chrome.storage.sync.set({ hideSold: e.target.checked });
  });

  hidePendingCheckbox.addEventListener('change', (e) => {
    chrome.storage.sync.set({ hidePending: e.target.checked });
  });

  async function performSearch() {
    const query = searchInput.value.trim();
    if (!query) {
      searchStatus.textContent = '';
      searchStatus.classList.remove('has-results');
      searchNav.style.display = 'none';
      return;
    }

    searchBtn.disabled = true;
    searchStatus.textContent = 'Searching...';

    const response = await sendToContent({ action: 'search', query: query });

    searchBtn.disabled = false;

    if (response) {
      if (response.matches > 0) {
        searchStatus.textContent = `Found ${response.matches} match${response.matches !== 1 ? 'es' : ''} (${response.total} ${getItemLabel(response.total)} loaded)`;
        searchStatus.classList.add('has-results');
        searchNav.style.display = 'flex';
        updateMatchPosition(response.currentIndex + 1, response.matches);
      } else {
        searchStatus.textContent = `No matches found (${response.total} ${getItemLabel(response.total)} loaded)`;
        searchStatus.classList.remove('has-results');
        searchNav.style.display = 'none';
      }
    } else {
      searchStatus.textContent = isMessengerPage ?
        'Error: Make sure you\'re on Messenger Marketplace' :
        'Error: Make sure you\'re on the Saved page';
      searchStatus.classList.remove('has-results');
      searchNav.style.display = 'none';
    }
  }

  function updateMatchPosition(current, total) {
    matchPosition.textContent = `${current}/${total}`;
  }

  searchBtn.addEventListener('click', performSearch);

  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  });

  prevMatchBtn.addEventListener('click', async () => {
    const response = await sendToContent({ action: 'prevMatch' });
    if (response) {
      updateMatchPosition(response.currentIndex + 1, response.total);
    }
  });

  nextMatchBtn.addEventListener('click', async () => {
    const response = await sendToContent({ action: 'nextMatch' });
    if (response) {
      updateMatchPosition(response.currentIndex + 1, response.total);
    }
  });

  clearSearchBtn.addEventListener('click', async () => {
    searchInput.value = '';
    searchStatus.textContent = '';
    searchStatus.classList.remove('has-results');
    searchNav.style.display = 'none';
    await sendToContent({ action: 'clearSearch' });
  });

  loadAllBtn.addEventListener('click', async () => {
    if (isLoading) {
      await sendToContent({ action: 'stopLoadAll' });
      loadAllBtn.textContent = getDefaultLoadAllText();
      loadAllBtn.classList.remove('loading');
      isLoading = false;
      return;
    }

    // First check if content script is loaded and page has items
    const statsResponse = await getStatsWithRetry();
    if (!statsResponse) {
      loadAllBtn.textContent = lastContentScriptInjectionError || 'Extension loading... try again in a moment';
      setTimeout(() => {
        loadAllBtn.textContent = getDefaultLoadAllText();
      }, 2000);
      return;
    }

    isLoading = true;
    loadAllBtn.textContent = 'Loading... (click to stop)';
    loadAllBtn.classList.add('loading');

    const response = await sendToContent({ action: 'loadAll' });

    isLoading = false;
    loadAllBtn.classList.remove('loading');

    if (response) {
      loadAllBtn.textContent = `Loaded ${response.total} ${getItemLabel(response.total)}`;
      setTimeout(() => {
        loadAllBtn.textContent = getDefaultLoadAllText();
      }, 3000);
    } else {
      loadAllBtn.textContent = 'Error loading - please try again';
      setTimeout(() => {
        loadAllBtn.textContent = getDefaultLoadAllText();
      }, 2000);
    }
  });

  checkPricesBtn.addEventListener('click', async () => {
    if (isCheckingPrices) return;

    isCheckingPrices = true;
    checkPricesBtn.disabled = true;
    checkPricesBtn.textContent = 'Checking prices...';
    priceResults.style.display = 'none';

    // Retry logic with backoff
    let response = null;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts && !response) {
      try {
        response = await sendToContent({ action: 'checkPrices' });

        // If no response or error, retry
        if (!response || response.error) {
          attempts++;
          if (attempts < maxAttempts) {
            checkPricesBtn.textContent = `Retrying... (${attempts}/${maxAttempts})`;
            await new Promise(r => setTimeout(r, 1000 * attempts)); // Exponential backoff
            response = null; // Reset for retry
          }
        } else {
          break; // Success
        }
      } catch (error) {
        attempts++;
        if (attempts < maxAttempts) {
          checkPricesBtn.textContent = `Retrying... (${attempts}/${maxAttempts})`;
          await new Promise(r => setTimeout(r, 1000 * attempts));
        }
      }
    }

    isCheckingPrices = false;
    checkPricesBtn.disabled = false;
    checkPricesBtn.textContent = 'Check for price changes';

    if (response && !response.error) {
      displayPriceResults(response);
    } else {
      priceResults.innerHTML = '<div style="color: #f02849; font-size: 11px;">Error checking prices. Click this button again when the page is fully loaded.</div>';
      priceResults.style.display = 'block';
    }
  });


  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'loadProgress' && isLoading) {
      loadAllBtn.textContent = `Loading... ${request.count} ${getItemLabel(request.count)} (click to stop)`;
    }
  });

  // Detect which page we're on
  async function detectPage() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url) {
          const url = tabs[0].url;
          if (url && url.includes('messenger.com/marketplace')) {
            isMessengerPage = true;
            // Hide filter options and price tracking on Messenger (they don't apply)
            if (filterSection) {
              filterSection.style.display = 'none';
            }
            if (priceSection) {
              priceSection.style.display = 'none';
            }
            // Update search title
            if (searchTitle) {
              searchTitle.textContent = 'Search Conversations';
            }
            // Update placeholder
            searchInput.placeholder = 'Search conversations...';
            // Update load button text
            loadAllBtn.textContent = getDefaultLoadAllText();
            // Update help text
            if (helpText) {
              helpText.innerHTML = '<strong>Tip:</strong> Click "Load all conversations" first to search through everything that\'s loaded!';
            }
            // Show link to Facebook Marketplace
            if (navLink) {
              navLink.textContent = '→ Search in Facebook Marketplace';
              navLink.href = 'https://www.facebook.com/marketplace/you/saved';
              navLink.style.display = 'inline-block';
              navLink.target = '_blank';
            }
          } else if (url && url.includes('facebook.com/marketplace')) {
            // On Facebook Marketplace - show link to Messenger
            if (navLink) {
              navLink.textContent = '→ Search Marketplace Conversations';
              navLink.href = 'https://www.messenger.com/marketplace';
              navLink.style.display = 'inline-block';
              navLink.target = '_blank';
            }
          }
        }
        resolve();
      });
    });
  }

  async function restoreSearchState() {
    const stats = await getStatsWithRetry();

    if (stats) {
      if (stats.currentQuery) {
        searchInput.value = stats.currentQuery;
        if (stats.totalMatches > 0) {
          searchStatus.textContent = `Found ${stats.totalMatches} match${stats.totalMatches !== 1 ? 'es' : ''} (${stats.totalLoaded} ${getItemLabel(stats.totalLoaded)} loaded)`;
          searchStatus.classList.add('has-results');
          searchNav.style.display = 'flex';
          updateMatchPosition(stats.currentIndex + 1, stats.totalMatches);
        } else {
          searchStatus.textContent = `No matches found (${stats.totalLoaded} ${getItemLabel(stats.totalLoaded)} loaded)`;
          searchStatus.classList.remove('has-results');
          searchNav.style.display = 'none';
        }
      } else if (stats.totalLoaded > 0) {
        searchStatus.textContent = `${stats.totalLoaded} ${getItemLabel(stats.totalLoaded)} loaded`;
      } else if (stats.status === 'loading') {
        searchStatus.textContent = 'Waiting for page content...';
      }
    } else {
      const storageKeys = isMessengerPage ?
        ['_messengerSearchQuery', '_messengerSearchIndex'] :
        ['_searchQuery', '_searchIndex'];

      chrome.storage.sync.get(storageKeys, async (result) => {
        const query = isMessengerPage ? result._messengerSearchQuery : result._searchQuery;
        const index = isMessengerPage ? result._messengerSearchIndex : result._searchIndex;

        if (query) {
          searchInput.value = query;
          const response = await sendToContent({
            action: 'restoreSearch',
            query: query,
            savedIndex: index || 0
          });
          if (response && response.matches > 0) {
            searchStatus.textContent = `Found ${response.matches} match${response.matches !== 1 ? 'es' : ''} (${response.total} ${getItemLabel(response.total)} loaded)`;
            searchStatus.classList.add('has-results');
            searchNav.style.display = 'flex';
            updateMatchPosition(response.currentIndex + 1, response.matches);
          }
        }
      });
    }
  }

  (async () => {
    await detectPage();
    await restoreSearchState();
    await restorePriceCheckResults();
  })();
});
