const MENU_ID = 'tabmagic-name-tab';
const TAB_NAME_PREFIX = 'tabName:';

const storage = chrome.storage.session;

const getTabKey = (tabId) => `${TAB_NAME_PREFIX}${tabId}`;

const getStoredTabName = async (tabId) => {
  const key = getTabKey(tabId);
  const result = await storage.get(key);
  return result[key] ?? null;
};

const setStoredTabName = async (tabId, name) => {
  const key = getTabKey(tabId);
  await storage.set({ [key]: name });
};

const clearStoredTabName = async (tabId) => {
  const key = getTabKey(tabId);
  await storage.remove(key);
};

const setTabTitle = async (tabId, name) => {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (title) => {
      document.title = title;
    },
    args: [name],
  });
};

const promptForTabName = async (tabId, currentName) => {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (defaultName) => prompt('Name this tab:', defaultName),
    args: [currentName],
  });

  return result?.result ?? null;
};

const ensureContextMenu = () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Name tab',
      contexts: ['tab'],
    });
  });
};

chrome.runtime.onInstalled.addListener(ensureContextMenu);
chrome.runtime.onStartup.addListener(ensureContextMenu);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) {
    return;
  }

  const storedName = await getStoredTabName(tab.id);
  const currentName = storedName ?? tab.title ?? '';
  const newName = await promptForTabName(tab.id, currentName);

  if (newName === null) {
    return;
  }

  await setStoredTabName(tab.id, newName);
  await setTabTitle(tab.id, newName);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.title) {
    return;
  }

  const storedName = await getStoredTabName(tabId);
  if (!storedName || storedName === tab.title) {
    return;
  }

  await setTabTitle(tabId, storedName);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await clearStoredTabName(tabId);
});
