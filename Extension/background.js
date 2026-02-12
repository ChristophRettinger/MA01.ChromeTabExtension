const MENU_PAGE_ID = 'tabmagic-name-tab';
const MENU_ACTION_ID = 'tabmagic-name-tab-toolbar';
const MENU_GENERAL_SETTINGS_ID = 'tabmagic-general-settings';
const TAB_NAME_PREFIX = 'tabName:';
const TAB_ICON_PREFIX = 'tabIcon:';
const RULES_SETTINGS_KEY = 'tabmagic:rules';
const CHECK_INTERVAL_KEY = 'tabmagic:interval-minutes';
const RULE_CHECK_ALARM = 'tabmagic-rule-check';
const DEFAULT_CHECK_INTERVAL_MINUTES = 5;

const storage = chrome.storage.local;
const tabUrlById = new Map();

const getTabKey = (url) => `${TAB_NAME_PREFIX}${encodeURIComponent(url)}`;
const getTabIconKey = (url) => `${TAB_ICON_PREFIX}${encodeURIComponent(url)}`;

const getTabUrl = (tab, changeInfo = {}) =>
  changeInfo.url ?? tab?.url ?? tab?.pendingUrl ?? '';

const isRestrictedTabUrl = (url = '') =>
  url.startsWith('chrome://') ||
  url.startsWith('chrome-extension://') ||
  url.startsWith('devtools://') ||
  url.startsWith('edge://') ||
  url.startsWith('about:');

const getStoredTabName = async (url) => {
  const key = getTabKey(url);
  const result = await storage.get(key);
  return result[key] ?? null;
};

const getStoredRules = async () => {
  const result = await storage.get(RULES_SETTINGS_KEY);
  return result[RULES_SETTINGS_KEY] ?? '';
};

const setStoredTabName = async (url, name) => {
  const key = getTabKey(url);
  await storage.set({ [key]: name });
};

const getStoredCheckInterval = async () => {
  const result = await storage.get(CHECK_INTERVAL_KEY);
  const value = Number(result[CHECK_INTERVAL_KEY]);
  return Number.isFinite(value) ? value : DEFAULT_CHECK_INTERVAL_MINUTES;
};

const setStoredTabIcon = async (url, iconUrl) => {
  const key = getTabIconKey(url);
  await storage.set({ [key]: iconUrl });
};

const clearStoredTabName = async (url) => {
  const key = getTabKey(url);
  await storage.remove(key);
};

const clearStoredTabIcon = async (url) => {
  const key = getTabIconKey(url);
  await storage.remove(key);
};

const getStoredTabIcon = async (url) => {
  const key = getTabIconKey(url);
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
      const existingIcons = Array.from(
        document.querySelectorAll(
          "link[rel~='icon'], link[rel='shortcut icon']",
        ),
      );

      existingIcons.forEach((icon) => icon.remove());

      if (!iconUrl) {
        return;
      }

      const iconLink = document.createElement('link');
      iconLink.rel = 'icon';
      iconLink.href = iconUrl;
      document.head.appendChild(iconLink);
    },
    args: [url],
  });
};

const AVAILABLE_ICONS = [
  'Coral_1.png',
  'Coral_2.png',
  'Coral_3.png',
  'Coral_4.png',
  'Coral_A.png',
  'Coral_B.png',
  'Coral_C.png',
  'Coral_D.png',
  'DarkTeal_1.png',
  'DarkTeal_2.png',
  'DarkTeal_3.png',
  'DarkTeal_4.png',
  'DarkTeal_A.png',
  'DarkTeal_B.png',
  'DarkTeal_C.png',
  'DarkTeal_D.png',
  'Elastic.png',
  'ElasticDim.png',
  'ElasticGray.png',
  'ElasticSepia.png',
  'ErrorEmails.png',
  'Peach_1.png',
  'Peach_2.png',
  'Peach_3.png',
  'Peach_4.png',
  'Peach_A.png',
  'Peach_B.png',
  'Peach_C.png',
  'Peach_D.png',
  'Sage_1.png',
  'Sage_2.png',
  'Sage_3.png',
  'Sage_4.png',
  'Sage_A.png',
  'Sage_B.png',
  'Sage_C.png',
  'Sage_D.png',
  'Sand_1.png',
  'Sand_2.png',
  'Sand_3.png',
  'Sand_4.png',
  'Sand_A.png',
  'Sand_B.png',
  'Sand_C.png',
  'Sand_D.png',
  'SlateTeal_1.png',
  'SlateTeal_2.png',
  'SlateTeal_3.png',
  'SlateTeal_4.png',
  'SlateTeal_A.png',
  'SlateTeal_B.png',
  'SlateTeal_C.png',
  'SlateTeal_D.png',
  'SoftTurquise_1.png',
  'SoftTurquise_2.png',
  'SoftTurquise_3.png',
  'SoftTurquise_4.png',
  'SoftTurquise_A.png',
  'SoftTurquise_B.png',
  'SoftTurquise_C.png',
  'SoftTurquise_D.png',
];

const getAvailableIcons = () =>
  AVAILABLE_ICONS.map((name) => ({
    name,
    url: chrome.runtime.getURL(`icons/${name}`),
  }));

const ICON_FILE_BY_NAME = AVAILABLE_ICONS.reduce((lookup, filename) => {
  const baseName = filename.replace(/\.[^/.]+$/, '');
  lookup.set(filename, filename);
  lookup.set(baseName, filename);
  return lookup;
}, new Map());

const getIconUrlByName = (iconName) => {
  const trimmed = iconName?.trim();
  if (!trimmed) {
    return '';
  }

  const filename = ICON_FILE_BY_NAME.get(trimmed);
  if (!filename) {
    return '';
  }

  return chrome.runtime.getURL(`icons/${filename}`);
};

const parseRules = (rulesText) =>
  rulesText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const [rawPattern, rawName, rawIcon] = line.split(';');
      const pattern = rawPattern?.trim();
      const nameTemplate = rawName?.trim() ?? '';
      const iconTemplate = rawIcon?.trim() ?? '';
      const hasName = Boolean(nameTemplate);
      const hasIcon = Boolean(iconTemplate);

      if (!pattern || (!hasName && !hasIcon)) {
        return null;
      }

      try {
        return {
          regex: new RegExp(pattern),
          nameTemplate,
          iconTemplate,
          hasIcon,
        };
      } catch (error) {
        console.warn('TabMagic: invalid regex rule', pattern, error);
        return null;
      }
    })
    .filter(Boolean);

const getRegexMatch = (regex, url) => {
  const flags = regex.flags.replace('g', '');
  const matcher = new RegExp(regex.source, flags);
  return matcher.exec(url);
};

const decodeUrl = (url) => {
  if (!url) {
    return url;
  }
  try {
    return decodeURIComponent(url);
  } catch (error) {
    return url;
  }
};

const applyTemplate = (template, match) =>
  template.replace(/\$(\d+)/g, (_, index) => {
    const value = match?.[Number(index)] ?? '';
    return value;
  });

const getRuleMatch = (url, rulesText) => {
  const decodedUrl = decodeUrl(url);
  const rules = parseRules(rulesText);
  const candidates =
    decodedUrl && decodedUrl !== url ? [decodedUrl, url] : [url];
  for (const rule of rules) {
    for (const candidate of candidates) {
      const match = getRegexMatch(rule.regex, candidate);
      if (match) {
        return { ...rule, match };
      }
    }
  }
  return null;
};

const updateRuleCheckSchedule = async (intervalMinutes) => {
  if (!intervalMinutes || intervalMinutes <= 0) {
    await chrome.alarms.clear(RULE_CHECK_ALARM);
    return;
  }

  chrome.alarms.create(RULE_CHECK_ALARM, {
    periodInMinutes: intervalMinutes,
  });
};

const refreshTabAppearance = async (tabId, tab, tabUrl) => {
  const url = tabUrl ?? getTabUrl(tab);
  if (!url) {
    return;
  }
  if (isRestrictedTabUrl(url)) {
    return;
  }

  const [storedName, storedIcon, storedRules] = await Promise.all([
    getStoredTabName(url),
    getStoredTabIcon(url),
    getStoredRules(),
  ]);

  const needsRuleName = !storedName;
  const needsRuleIcon = storedIcon === null || storedIcon === undefined;
  const ruleMatch =
    needsRuleName || needsRuleIcon ? getRuleMatch(url, storedRules) : null;

  if (storedName && storedName !== tab?.title) {
    await setTabTitle(tabId, storedName);
  } else if (needsRuleName && ruleMatch?.nameTemplate) {
    const nextTitle = applyTemplate(ruleMatch.nameTemplate, ruleMatch.match);
    if (nextTitle && nextTitle !== tab?.title) {
      await setTabTitle(tabId, nextTitle);
    }
  }

  if (storedIcon !== null && storedIcon !== undefined) {
    await setTabIcon(tabId, storedIcon);
  } else if (needsRuleIcon && ruleMatch?.hasIcon) {
    const iconName = applyTemplate(
      ruleMatch.iconTemplate ?? '',
      ruleMatch.match,
    );
    await setTabIcon(tabId, getIconUrlByName(iconName));
  }
};

const refreshAllTabs = async () => {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map((tab) => refreshTabAppearance(tab.id, tab, tab.url)),
  );
};

const scheduleRuleChecksFromStorage = async () => {
  const intervalMinutes = await getStoredCheckInterval();
  await updateRuleCheckSchedule(intervalMinutes);
};

const openTabConfigDialog = async (tabId, currentName, currentIconUrl) => {
  const icons = await getAvailableIcons();
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (dialogData) => {
      const existingDialog = document.getElementById('tabmagic-config-dialog');
      if (existingDialog) {
        existingDialog.remove();
      }

      return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.id = 'tabmagic-config-dialog';
        overlay.tabIndex = -1;
        overlay.style.cssText = [
          'position: fixed',
          'inset: 0',
          'background: rgba(0, 0, 0, 0.45)',
          'display: flex',
          'align-items: center',
          'justify-content: center',
          'z-index: 2147483647',
        ].join(';');

        const inertState = Array.from(document.body.children)
          .filter((element) => element !== overlay)
          .map((element) => ({
            element,
            hadInert: element.hasAttribute('inert'),
          }));

        inertState.forEach(({ element }) => {
          element.setAttribute('inert', '');
        });

        const dialog = document.createElement('div');
        dialog.style.cssText = [
          'background: #ffffff',
          'color: #111111',
          'border-radius: 12px',
          'padding: 20px',
          'width: min(480px, 90vw)',
          'box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2)',
          'font-family: Arial, sans-serif',
        ].join(';');

        const title = document.createElement('h2');
        title.textContent = 'TabMagic settings';
        title.style.cssText = 'margin: 0 0 12px 0; font-size: 18px;';

        const label = document.createElement('label');
        label.textContent = 'Tab text';
        label.style.cssText = 'display: block; font-size: 13px; margin-bottom: 6px;';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = dialogData.currentName ?? '';
        input.style.cssText = [
          'width: 100%',
          'box-sizing: border-box',
          'padding: 8px 10px',
          'border-radius: 8px',
          'border: 1px solid #d0d7de',
          'margin-bottom: 16px',
          'font-size: 14px',
        ].join(';');

        const iconLabel = document.createElement('div');
        iconLabel.textContent = 'Tab icon';
        iconLabel.style.cssText = 'font-size: 13px; margin-bottom: 8px;';

        const iconGrid = document.createElement('div');
        iconGrid.style.cssText = [
          'display: flex',
          'flex-wrap: wrap',
          'gap: 8px',
          'margin-bottom: 16px',
        ].join(';');

        let selectedIconUrl = dialogData.currentIconUrl ?? '';
        const iconButtons = [];

        const updateSelection = (iconUrl) => {
          selectedIconUrl = iconUrl;
          iconButtons.forEach((button) => {
            button.style.borderColor =
              button.dataset.iconUrl === selectedIconUrl ? '#2563eb' : '#d0d7de';
          });
        };

        const makeIconButton = (icon, labelText) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.iconUrl = icon.url;
          button.title = icon.name ?? labelText ?? '';
          button.style.cssText = [
            'width: 48px',
            'height: 48px',
            'border-radius: 10px',
            'border: 2px solid #d0d7de',
            'background: #f9fafb',
            'display: flex',
            'align-items: center',
            'justify-content: center',
            'cursor: pointer',
            'padding: 0',
          ].join(';');

          if (icon.url) {
            const img = document.createElement('img');
            img.src = icon.url;
            img.alt = icon.name;
            img.style.cssText = 'width: 24px; height: 24px;';
            button.appendChild(img);
          } else {
            const span = document.createElement('span');
            span.textContent = labelText;
            span.style.cssText = 'font-size: 11px; color: #4b5563;';
            button.appendChild(span);
          }

          button.addEventListener('click', () => updateSelection(icon.url));
          iconButtons.push(button);
          return button;
        };

        iconGrid.appendChild(
          makeIconButton({ name: 'None', url: '' }, 'None'),
        );

        dialogData.icons.forEach((icon) => {
          iconGrid.appendChild(makeIconButton(icon));
        });

        const actions = document.createElement('div');
        actions.style.cssText = [
          'display: flex',
          'justify-content: space-between',
          'align-items: center',
          'gap: 8px',
        ].join(';');

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.textContent = 'Cancel';
        cancelButton.style.cssText = [
          'border-radius: 8px',
          'border: 1px solid #d0d7de',
          'background: #ffffff',
          'padding: 8px 14px',
          'cursor: pointer',
        ].join(';');

        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.textContent = 'Save';
        saveButton.style.cssText = [
          'border-radius: 8px',
          'border: none',
          'background: #2563eb',
          'color: #ffffff',
          'padding: 8px 14px',
          'cursor: pointer',
        ].join(';');

        const resetButton = document.createElement('button');
        resetButton.type = 'button';
        resetButton.textContent = 'Reset';
        resetButton.style.cssText = [
          'border-radius: 8px',
          'border: 1px solid #d0d7de',
          'background: #f9fafb',
          'padding: 8px 14px',
          'cursor: pointer',
        ].join(';');

        const cleanup = () => {
          overlay.remove();
          document.removeEventListener('keydown', onKeyDown);
          document.removeEventListener('focusin', onFocusIn, true);
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('mousedown', onPointerDown, true);
          document.removeEventListener('click', onPointerDown, true);
          window.clearInterval(focusWatchdogId);
          inertState.forEach(({ element, hadInert }) => {
            if (!hadInert) {
              element.removeAttribute('inert');
            }
          });
        };

        const handleCancel = () => {
          cleanup();
          resolve(null);
        };

        const handleReset = () => {
          cleanup();
          resolve({ reset: true });
        };

        const handleSave = () => {
          cleanup();
          resolve({
            name: input.value,
            iconUrl: selectedIconUrl ?? '',
          });
        };

        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            handleCancel();
          }
        };

        const onFocusIn = (event) => {
          if (overlay.contains(event.target)) {
            return;
          }

          console.log('TabMagic: blocked outside focus while Configure tab is open');
          event.stopPropagation();
          event.preventDefault();
          input.focus({ preventScroll: true });
        };

        const onPointerDown = (event) => {
          if (overlay.contains(event.target)) {
            return;
          }

          console.log('TabMagic: blocked outside pointer event while Configure tab is open');
          event.stopPropagation();
          event.preventDefault();
          input.focus({ preventScroll: true });
        };

        const focusWatchdogId = window.setInterval(() => {
          if (!document.body.contains(overlay)) {
            return;
          }

          const activeElement = document.activeElement;
          if (activeElement && overlay.contains(activeElement)) {
            return;
          }

          console.log('TabMagic: restoring Configure tab dialog focus', activeElement);
          input.focus({ preventScroll: true });
        }, 200);

        cancelButton.addEventListener('click', handleCancel);
        resetButton.addEventListener('click', handleReset);
        saveButton.addEventListener('click', handleSave);
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('focusin', onFocusIn, true);
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('mousedown', onPointerDown, true);
        document.addEventListener('click', onPointerDown, true);

        const actionGroup = document.createElement('div');
        actionGroup.style.cssText = 'display: flex; gap: 8px;';
        actionGroup.appendChild(cancelButton);
        actionGroup.appendChild(saveButton);

        actions.appendChild(resetButton);
        actions.appendChild(actionGroup);

        dialog.appendChild(title);
        dialog.appendChild(label);
        dialog.appendChild(input);
        dialog.appendChild(iconLabel);
        dialog.appendChild(iconGrid);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        updateSelection(selectedIconUrl);
        overlay.focus({ preventScroll: true });
        input.focus({ preventScroll: true });
        input.select();
      });
    },
    args: [
      {
        currentName,
        currentIconUrl,
        icons,
      },
    ],
  });

  return result?.result ?? null;
};

const GENERAL_SETTINGS_PAGE = 'general-settings.html';

const openGeneralSettingsPage = async () => {
  const settingsUrl = chrome.runtime.getURL(GENERAL_SETTINGS_PAGE);
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) =>
    (tab.url ?? '').startsWith(settingsUrl),
  );

  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true });
    if (typeof existing.windowId === 'number') {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
    return;
  }

  await chrome.tabs.create({ url: settingsUrl });
};

const ensureContextMenu = () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_PAGE_ID,
      title: 'Configure tab',
      contexts: ['page'],
    });
    chrome.contextMenus.create({
      id: MENU_ACTION_ID,
      title: 'Configure tab',
      contexts: ['action'],
    });
    chrome.contextMenus.create({
      id: MENU_GENERAL_SETTINGS_ID,
      title: 'General settings',
      contexts: ['action'],
    });
  });
};

chrome.runtime.onInstalled.addListener(ensureContextMenu);
chrome.runtime.onStartup.addListener(ensureContextMenu);
chrome.runtime.onInstalled.addListener(scheduleRuleChecksFromStorage);
chrome.runtime.onStartup.addListener(scheduleRuleChecksFromStorage);

const handleConfigureTab = async (tab) => {
  if (!tab?.id) {
    return;
  }

  const tabUrl = getTabUrl(tab);
  if (!tabUrl) {
    return;
  }
  if (isRestrictedTabUrl(tabUrl)) {
    return;
  }

  tabUrlById.set(tab.id, tabUrl);
  const storedName = await getStoredTabName(tabUrl);
  const storedIcon = await getStoredTabIcon(tabUrl);
  const currentName = storedName ?? tab.title ?? '';
  const result = await openTabConfigDialog(
    tab.id,
    currentName,
    storedIcon ?? '',
  );

  if (!result) {
    return;
  }

  if (result.reset) {
    await clearStoredTabName(tabUrl);
    await clearStoredTabIcon(tabUrl);
    await chrome.tabs.reload(tab.id);
    return;
  }

  const normalizedIconUrl = result.iconUrl ?? '';
  await setStoredTabName(tabUrl, result.name);
  await setStoredTabIcon(tabUrl, normalizedIconUrl);
  await setTabTitle(tab.id, result.name);
  await setTabIcon(tab.id, normalizedIconUrl);
};

const handleGeneralSettings = async (tab) => {
  await openGeneralSettingsPage();
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'tabmagic:refresh-tabs') {
    (async () => {
      await refreshAllTabs();
      sendResponse({ ok: true });
    })();
    return true;
  }

  return false;
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (
    info.menuItemId !== MENU_PAGE_ID &&
    info.menuItemId !== MENU_ACTION_ID &&
    info.menuItemId !== MENU_GENERAL_SETTINGS_ID
  ) {
    return;
  }

  if (info.menuItemId === MENU_GENERAL_SETTINGS_ID) {
    await handleGeneralSettings(tab);
    return;
  }

  await handleConfigureTab(tab);
});

chrome.action.onClicked.addListener(async (tab) => {
  await handleConfigureTab(tab);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const tabUrl = getTabUrl(tab, changeInfo);
  if (!tabUrl) {
    return;
  }

  if (tabUrl) {
    tabUrlById.set(tabId, tabUrl);
  }

  if (!changeInfo.title && changeInfo.status !== 'complete') {
    return;
  }

  await refreshTabAppearance(tabId, tab, tabUrl);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const tabUrl = tabUrlById.get(tabId);
  if (!tabUrl) {
    return;
  }

  tabUrlById.delete(tabId);
  await clearStoredTabName(tabUrl);
  await clearStoredTabIcon(tabUrl);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== RULE_CHECK_ALARM) {
    return;
  }

  await refreshAllTabs();
});
