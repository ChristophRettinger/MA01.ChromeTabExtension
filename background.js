const MENU_ID = 'tabmagic-name-tab';
const TAB_NAME_PREFIX = 'tabName:';
const TAB_ICON_PREFIX = 'tabIcon:';

const storage = chrome.storage.session;

const getTabKey = (tabId) => `${TAB_NAME_PREFIX}${tabId}`;
const getTabIconKey = (tabId) => `${TAB_ICON_PREFIX}${tabId}`;

const getStoredTabName = async (tabId) => {
  const key = getTabKey(tabId);
  const result = await storage.get(key);
  return result[key] ?? null;
};

const setStoredTabName = async (tabId, name) => {
  const key = getTabKey(tabId);
  await storage.set({ [key]: name });
};

const setStoredTabIcon = async (tabId, url) => {
  const key = getTabIconKey(tabId);
  await storage.set({ [key]: url });
};

const clearStoredTabName = async (tabId) => {
  const key = getTabKey(tabId);
  await storage.remove(key);
};

const clearStoredTabIcon = async (tabId) => {
  const key = getTabIconKey(tabId);
  await storage.remove(key);
};

const getStoredTabIcon = async (tabId) => {
  const key = getTabIconKey(tabId);
  const result = await storage.get(key);
  return result[key] ?? null;
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

const setTabIcon = async (tabId, url) => {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (iconUrl) => {
      const existing =
        document.querySelector("link[rel~='icon']") ??
        document.querySelector("link[rel='shortcut icon']");

      if (!iconUrl) {
        if (existing) {
          existing.remove();
        }
        return;
      }

      const iconLink = existing ?? document.createElement('link');
      iconLink.rel = 'icon';
      iconLink.href = iconUrl;

      if (!existing) {
        document.head.appendChild(iconLink);
      }
    },
    args: [url],
  });
};

const getAvailableIcons = () =>
  new Promise((resolve) => {
    chrome.runtime.getPackageDirectoryEntry(
      (root) => {
        root.getDirectory(
          'icons',
          {},
          (iconsDirectory) => {
            const reader = iconsDirectory.createReader();
            const entries = [];

            const readEntries = () => {
              reader.readEntries((results) => {
                if (!results.length) {
                  const icons = entries
                    .filter(
                      (entry) =>
                        entry.isFile &&
                        /\.(png|svg|ico)$/i.test(entry.name),
                    )
                    .map((entry) => ({
                      name: entry.name,
                      url: chrome.runtime.getURL(`icons/${entry.name}`),
                    }))
                    .sort((a, b) => a.name.localeCompare(b.name));
                  resolve(icons);
                  return;
                }

                entries.push(...results);
                readEntries();
              });
            };

            readEntries();
          },
          () => resolve([]),
        );
      },
      () => resolve([]),
    );
  });

const promptForTabName = async (tabId, currentName) => {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (defaultName) => prompt('Name this tab:', defaultName),
    args: [currentName],
  });

  return result?.result ?? null;
};

const promptForTabIcon = async (tabId, currentUrl) => {
  const icons = await getAvailableIcons();
  const options = icons.length
    ? icons.map((icon, index) => `${index + 1}. ${icon.name}`).join('\n')
    : 'No icons available.';
  const currentIndex = currentUrl
    ? icons.findIndex((icon) => icon.url === currentUrl) + 1
    : 0;
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (message, defaultValue) => prompt(message, defaultValue),
    args: [
      `Select an icon number or leave blank for none:\n${options}`,
      currentIndex ? String(currentIndex) : '',
    ],
  });

  if (result?.result === null || result?.result === undefined) {
    return null;
  }

  const selection = result.result.trim();
  if (!selection) {
    return '';
  }

  const selectionIndex = Number.parseInt(selection, 10);
  if (
    !Number.isFinite(selectionIndex) ||
    selectionIndex < 1 ||
    selectionIndex > icons.length
  ) {
    return '';
  }

  return icons[selectionIndex - 1].url;
};

const ensureContextMenu = () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Name tab',
      contexts: ['page'],
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
  const storedIcon = await getStoredTabIcon(tab.id);
  const currentName = storedName ?? tab.title ?? '';
  const newName = await promptForTabName(tab.id, currentName);

  if (newName === null) {
    return;
  }

  const newIconUrl = await promptForTabIcon(tab.id, storedIcon ?? '');
  if (newIconUrl === null) {
    return;
  }

  await setStoredTabName(tab.id, newName);
  await setStoredTabIcon(tab.id, newIconUrl || null);
  await setTabTitle(tab.id, newName);
  await setTabIcon(tab.id, newIconUrl);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.title && changeInfo.status !== 'complete') {
    return;
  }

  const [storedName, storedIcon] = await Promise.all([
    getStoredTabName(tabId),
    getStoredTabIcon(tabId),
  ]);

  if (storedName && storedName !== tab.title) {
    await setTabTitle(tabId, storedName);
  }

  if (storedIcon) {
    await setTabIcon(tabId, storedIcon);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await clearStoredTabName(tabId);
  await clearStoredTabIcon(tabId);
});
