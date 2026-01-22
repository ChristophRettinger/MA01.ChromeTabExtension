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

const setStoredRules = async (rules) => {
  await storage.set({ [RULES_SETTINGS_KEY]: rules });
};

const getStoredCheckInterval = async () => {
  const result = await storage.get(CHECK_INTERVAL_KEY);
  const value = Number(result[CHECK_INTERVAL_KEY]);
  return Number.isFinite(value) ? value : DEFAULT_CHECK_INTERVAL_MINUTES;
};

const setStoredCheckInterval = async (minutes) => {
  await storage.set({ [CHECK_INTERVAL_KEY]: minutes });
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
  'DarkTeal_1.png',
  'DarkTeal_2.png',
  'DarkTeal_3.png',
  'DarkTeal_4.png',
  'Peach_1.png',
  'Peach_2.png',
  'Peach_3.png',
  'Peach_4.png',
  'Sage_1.png',
  'Sage_2.png',
  'Sage_3.png',
  'Sage_4.png',
  'Sand_1.png',
  'Sand_2.png',
  'Sand_3.png',
  'Sand_4.png',
  'SlateTeal_1.png',
  'SlateTeal_2.png',
  'SlateTeal_3.png',
  'SlateTeal_4.png',
  'SoftTurquise_1.png',
  'SoftTurquise_2.png',
  'SoftTurquise_3.png',
  'SoftTurquise_4.png',
  'TabMagic.ico',
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
    .filter((line) => line.length > 0)
    .map((line) => {
      const [pattern, nameTemplate, iconTemplate] = line
        .split(',')
        .map((part) => part.trim());

      if (!pattern || !nameTemplate) {
        return null;
      }

      try {
        return {
          regex: new RegExp(pattern),
          nameTemplate,
          iconTemplate,
          hasIcon: line.split(',').length >= 3,
        };
      } catch (error) {
        console.warn('TabMagic: invalid regex rule', pattern, error);
        return null;
      }
    })
    .filter(Boolean);

const getRuleMatch = (url, rulesText) => {
  const rules = parseRules(rulesText);
  for (const rule of rules) {
    if (rule.regex.test(url)) {
      return rule;
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
    const nextTitle = url.replace(ruleMatch.regex, ruleMatch.nameTemplate);
    if (nextTitle && nextTitle !== tab?.title) {
      await setTabTitle(tabId, nextTitle);
    }
  }

  if (storedIcon !== null && storedIcon !== undefined) {
    await setTabIcon(tabId, storedIcon);
  } else if (needsRuleIcon && ruleMatch?.hasIcon) {
    const iconName = url.replace(ruleMatch.regex, ruleMatch.iconTemplate ?? '');
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
        overlay.style.cssText = [
          'position: fixed',
          'inset: 0',
          'background: rgba(0, 0, 0, 0.45)',
          'display: flex',
          'align-items: center',
          'justify-content: center',
          'z-index: 2147483647',
        ].join(';');

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
        actions.style.cssText = 'display: flex; justify-content: flex-end; gap: 8px;';

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

        const cleanup = () => {
          overlay.remove();
          document.removeEventListener('keydown', onKeyDown);
        };

        const handleCancel = () => {
          cleanup();
          resolve(null);
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

        cancelButton.addEventListener('click', handleCancel);
        saveButton.addEventListener('click', handleSave);
        document.addEventListener('keydown', onKeyDown);

        actions.appendChild(cancelButton);
        actions.appendChild(saveButton);

        dialog.appendChild(title);
        dialog.appendChild(label);
        dialog.appendChild(input);
        dialog.appendChild(iconLabel);
        dialog.appendChild(iconGrid);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        updateSelection(selectedIconUrl);
        input.focus();
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

const openGeneralSettingsDialog = async (
  tabId,
  currentRules,
  currentIntervalMinutes,
) => {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (dialogData) => {
      const existingDialog = document.getElementById(
        'tabmagic-general-settings-dialog',
      );
      if (existingDialog) {
        existingDialog.remove();
      }

      return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.id = 'tabmagic-general-settings-dialog';
        overlay.style.cssText = [
          'position: fixed',
          'inset: 0',
          'background: rgba(0, 0, 0, 0.45)',
          'display: flex',
          'align-items: center',
          'justify-content: center',
          'z-index: 2147483647',
        ].join(';');

        const dialog = document.createElement('div');
        dialog.style.cssText = [
          'background: #ffffff',
          'color: #111111',
          'border-radius: 12px',
          'padding: 20px',
          'width: min(520px, 92vw)',
          'box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2)',
          'font-family: Arial, sans-serif',
        ].join(';');

        const title = document.createElement('h2');
        title.textContent = 'General settings';
        title.style.cssText = 'margin: 0 0 12px 0; font-size: 18px;';

        const label = document.createElement('label');
        label.textContent = 'Rules';
        label.style.cssText = 'display: block; font-size: 13px; margin-bottom: 6px;';

        const helper = document.createElement('p');
        helper.textContent =
          'One rule per line: regex, tab name, optional icon name.';
        helper.style.cssText = [
          'margin: 0 0 10px 0',
          'font-size: 12px',
          'color: #6b7280',
        ].join(';');

        const textarea = document.createElement('textarea');
        textarea.value = dialogData.currentRules ?? '';
        textarea.rows = 6;
        textarea.style.cssText = [
          'width: 100%',
          'box-sizing: border-box',
          'padding: 8px 10px',
          'border-radius: 8px',
          'border: 1px solid #d0d7de',
          'margin-bottom: 16px',
          'font-size: 14px',
          'font-family: inherit',
          'resize: vertical',
        ].join(';');

        const intervalLabel = document.createElement('label');
        intervalLabel.textContent = 'Refresh interval';
        intervalLabel.style.cssText =
          'display: block; font-size: 13px; margin: 0 0 6px 0;';

        const intervalSelect = document.createElement('select');
        intervalSelect.style.cssText = [
          'width: 100%',
          'box-sizing: border-box',
          'padding: 8px 10px',
          'border-radius: 8px',
          'border: 1px solid #d0d7de',
          'margin-bottom: 16px',
          'font-size: 14px',
          'font-family: inherit',
        ].join(';');

        const intervalOptions = [
          { label: 'Never', value: 0 },
          { label: 'Every 1 minute', value: 1 },
          { label: 'Every 5 minutes', value: 5 },
          { label: 'Every 10 minutes', value: 10 },
          { label: 'Every 15 minutes', value: 15 },
          { label: 'Every 30 minutes', value: 30 },
        ];

        intervalOptions.forEach((option) => {
          const optionElement = document.createElement('option');
          optionElement.value = String(option.value);
          optionElement.textContent = option.label;
          intervalSelect.appendChild(optionElement);
        });

        intervalSelect.value = String(dialogData.currentIntervalMinutes ?? 5);

        const actions = document.createElement('div');
        actions.style.cssText = 'display: flex; justify-content: flex-end; gap: 8px;';

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

        const cleanup = () => {
          overlay.remove();
          document.removeEventListener('keydown', onKeyDown);
        };

        const handleCancel = () => {
          cleanup();
          resolve(null);
        };

        const handleSave = () => {
          cleanup();
          resolve({
            rules: textarea.value,
            intervalMinutes: Number(intervalSelect.value),
          });
        };

        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            handleCancel();
          }
        };

        cancelButton.addEventListener('click', handleCancel);
        saveButton.addEventListener('click', handleSave);
        document.addEventListener('keydown', onKeyDown);

        actions.appendChild(cancelButton);
        actions.appendChild(saveButton);

        dialog.appendChild(title);
        dialog.appendChild(label);
        dialog.appendChild(helper);
        dialog.appendChild(textarea);
        dialog.appendChild(intervalLabel);
        dialog.appendChild(intervalSelect);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        textarea.focus();
      });
    },
    args: [
      {
        currentRules,
        currentIntervalMinutes,
      },
    ],
  });

  return result?.result ?? null;
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

  const normalizedIconUrl = result.iconUrl ?? '';
  await setStoredTabName(tabUrl, result.name);
  await setStoredTabIcon(tabUrl, normalizedIconUrl);
  await setTabTitle(tab.id, result.name);
  await setTabIcon(tab.id, normalizedIconUrl);
};

const handleGeneralSettings = async (tab) => {
  if (!tab?.id) {
    return;
  }

  const [currentRules, currentIntervalMinutes] = await Promise.all([
    getStoredRules(),
    getStoredCheckInterval(),
  ]);
  const result = await openGeneralSettingsDialog(
    tab.id,
    currentRules,
    currentIntervalMinutes,
  );

  if (!result) {
    return;
  }

  await setStoredRules(result.rules ?? '');
  await setStoredCheckInterval(result.intervalMinutes ?? 0);
  await updateRuleCheckSchedule(result.intervalMinutes ?? 0);
  await refreshAllTabs();
};

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
