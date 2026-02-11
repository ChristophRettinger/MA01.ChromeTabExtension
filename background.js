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
  'Coral_B.png',
  'DarkTeal_1.png',
  'DarkTeal_2.png',
  'DarkTeal_3.png',
  'DarkTeal_4.png',
  'Elastic.png',
  'ElasticDim.png',
  'ElasticGray.png',
  'ElasticSepia.png',
  'ErrorEmails.png',
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

const openGeneralSettingsDialog = async (
  tabId,
  currentRules,
  currentIntervalMinutes,
) => {
  const tabs = await chrome.tabs.query({});
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (dialogData) => {
      const existingDialog = document.getElementById(
        'tabmagic-general-settings-dialog',
      );
      if (existingDialog) {
        existingDialog.remove();
      }

      const overlay = document.createElement('div');
      overlay.id = 'tabmagic-general-settings-dialog';
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
        'width: min(1040px, 92vw)',
        'height: min(720px, 90vh)',
        'max-height: 90vh',
        'display: flex',
        'flex-direction: column',
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
        'One rule per line: regex; tab name; optional icon name.';
      helper.style.cssText = [
        'margin: 0 0 10px 0',
        'font-size: 12px',
        'color: #6b7280',
      ].join(';');

      const textarea = document.createElement('textarea');
      textarea.value = dialogData.currentRules ?? '';
      textarea.rows = 12;
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
        'min-height: 240px',
      ].join(';');

      const previewLabel = document.createElement('label');
      previewLabel.style.cssText =
        'display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 10px;';

      const previewCheckbox = document.createElement('input');
      previewCheckbox.type = 'checkbox';

      const previewText = document.createElement('span');
      previewText.textContent = 'Show preview';

      previewLabel.appendChild(previewCheckbox);
      previewLabel.appendChild(previewText);

      const previewSection = document.createElement('div');
      previewSection.style.cssText = [
        'border: 1px solid #e5e7eb',
        'border-radius: 10px',
        'padding: 12px',
        'margin-bottom: 16px',
        'display: none',
        'max-height: 240px',
        'overflow: auto',
        'background: #f9fafb',
      ].join(';');

      const previewList = document.createElement('ul');
      previewList.style.cssText = [
        'list-style: none',
        'padding: 0',
        'margin: 0',
        'display: grid',
        'gap: 10px',
      ].join(';');

      previewSection.appendChild(previewList);

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
      actions.style.cssText = [
        'display: flex',
        'justify-content: flex-end',
        'gap: 8px',
        'margin-top: auto',
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
      };

      const sendSave = () => {
        saveButton.disabled = true;
        const payload = {
          type: 'tabmagic:save-general-settings',
          rules: textarea.value,
          intervalMinutes: Number(intervalSelect.value),
        };
        chrome.runtime.sendMessage(payload, () => {
          saveButton.disabled = false;
          cleanup();
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

        console.log('TabMagic: blocked outside focus while General settings is open');
        event.stopPropagation();
        event.preventDefault();
        textarea.focus({ preventScroll: true });
      };

      const onPointerDown = (event) => {
        if (overlay.contains(event.target)) {
          return;
        }

        console.log('TabMagic: blocked outside pointer event while General settings is open');
        event.stopPropagation();
        event.preventDefault();
        textarea.focus({ preventScroll: true });
      };

      const focusWatchdogId = window.setInterval(() => {
        if (!document.body.contains(overlay)) {
          return;
        }

        const activeElement = document.activeElement;
        if (activeElement && overlay.contains(activeElement)) {
          return;
        }

        console.log('TabMagic: restoring General settings dialog focus', activeElement);
        textarea.focus({ preventScroll: true });
      }, 200);

      cancelButton.addEventListener('click', handleCancel);
      saveButton.addEventListener('click', sendSave);
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('focusin', onFocusIn, true);
      document.addEventListener('pointerdown', onPointerDown, true);
      document.addEventListener('mousedown', onPointerDown, true);
      document.addEventListener('click', onPointerDown, true);

      actions.appendChild(cancelButton);
      actions.appendChild(saveButton);

      const content = document.createElement('div');
      content.style.cssText = [
        'display: flex',
        'flex-direction: column',
        'overflow: auto',
        'padding-right: 4px',
      ].join(';');

      content.appendChild(label);
      content.appendChild(helper);
      content.appendChild(textarea);
      content.appendChild(previewLabel);
      content.appendChild(previewSection);
      content.appendChild(intervalLabel);
      content.appendChild(intervalSelect);

      dialog.appendChild(title);
      dialog.appendChild(content);
      dialog.appendChild(actions);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

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
              };
            } catch (error) {
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

      const getRuleMatch = (rules, url) => {
        const decodedUrl = decodeUrl(url);
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

      const renderPreview = () => {
        previewList.innerHTML = '';
        if (!previewCheckbox.checked) {
          previewSection.style.display = 'none';
          return;
        }

        previewSection.style.display = 'block';
        const rules = parseRules(textarea.value ?? '');
        dialogData.tabs.forEach((tab) => {
          const listItem = document.createElement('li');
          listItem.style.cssText = [
            'background: #ffffff',
            'border-radius: 8px',
            'padding: 10px',
            'border: 1px solid #e5e7eb',
            'display: grid',
            'gap: 6px',
          ].join(';');

          const urlLine = document.createElement('div');
          urlLine.textContent = tab.url || '(no url)';
          urlLine.style.cssText = 'font-size: 12px; color: #374151;';

          const ruleMatch = tab.url ? getRuleMatch(rules, tab.url) : null;
          const changes = [];
          if (ruleMatch?.nameTemplate) {
            const title = applyTemplate(
              ruleMatch.nameTemplate,
              ruleMatch.match,
            );
            if (title) {
              changes.push(`Title: ${title}`);
            }
          }
          if (ruleMatch?.iconTemplate) {
            const iconName = applyTemplate(
              ruleMatch.iconTemplate,
              ruleMatch.match,
            );
            if (iconName) {
              changes.push(`Icon: ${iconName}`);
            }
          }

          const changesLine = document.createElement('div');
          changesLine.textContent =
            changes.length > 0 ? changes.join(' • ') : 'No changes';
          changesLine.style.cssText = 'font-size: 12px; color: #6b7280;';

          listItem.appendChild(urlLine);
          listItem.appendChild(changesLine);
          previewList.appendChild(listItem);
        });
      };

      previewCheckbox.addEventListener('change', renderPreview);
      textarea.addEventListener('input', renderPreview);

      overlay.focus({ preventScroll: true });
      textarea.focus({ preventScroll: true });
    },
    args: [
      {
        currentRules,
        currentIntervalMinutes,
        tabs: tabs.map((tab) => ({ url: tab.url ?? '' })),
      },
    ],
  });

  return null;
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
  if (!tab?.id) {
    return;
  }
  const tabUrl = getTabUrl(tab);
  if (isRestrictedTabUrl(tabUrl)) {
    return;
  }

  const [currentRules, currentIntervalMinutes] = await Promise.all([
    getStoredRules(),
    getStoredCheckInterval(),
  ]);
  await openGeneralSettingsDialog(tab.id, currentRules, currentIntervalMinutes);
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'tabmagic:save-general-settings') {
    return false;
  }

  const rules = message?.rules ?? '';
  const intervalMinutes = message?.intervalMinutes ?? 0;
  (async () => {
    await setStoredRules(rules);
    await setStoredCheckInterval(intervalMinutes);
    await updateRuleCheckSchedule(intervalMinutes);
    await refreshAllTabs();
    sendResponse({ ok: true });
  })();

  return true;
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
