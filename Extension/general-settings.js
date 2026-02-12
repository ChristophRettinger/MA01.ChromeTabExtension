const RULES_SETTINGS_KEY = 'tabmagic:rules';
const CHECK_INTERVAL_KEY = 'tabmagic:interval-minutes';
const RULE_CHECK_ALARM = 'tabmagic-rule-check';
const DEFAULT_CHECK_INTERVAL_MINUTES = 5;

const storage = chrome.storage.local;

const rulesInput = document.getElementById('rules');
const intervalSelect = document.getElementById('interval');
const status = document.getElementById('status');
const previewToggle = document.getElementById('show-preview');
const previewSection = document.getElementById('preview');
const previewList = document.getElementById('preview-list');

const intervalOptions = [
  { label: 'Off', value: 0 },
  { label: 'Every minute', value: 1 },
  { label: 'Every 5 minutes', value: 5 },
  { label: 'Every 15 minutes', value: 15 },
  { label: 'Every 30 minutes', value: 30 },
  { label: 'Every hour', value: 60 },
];

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
      if (!pattern || (!nameTemplate && !iconTemplate)) {
        return null;
      }

      try {
        return { regex: new RegExp(pattern), nameTemplate, iconTemplate };
      } catch {
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
  } catch {
    return url;
  }
};

const applyTemplate = (template, match) =>
  template.replace(/\$(\d+)/g, (_, index) => match?.[Number(index)] ?? '');

const getRuleMatch = (rules, url) => {
  const decodedUrl = decodeUrl(url);
  const candidates = decodedUrl && decodedUrl !== url ? [decodedUrl, url] : [url];
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

const refreshAllTabs = async () => {
  await chrome.runtime.sendMessage({ type: 'tabmagic:refresh-tabs' });
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

const renderPreview = async () => {
  if (!previewToggle.checked) {
    previewSection.style.display = 'none';
    return;
  }

  previewSection.style.display = 'block';
  previewList.innerHTML = '';

  const tabs = await chrome.tabs.query({});
  const rules = parseRules(rulesInput.value ?? '');

  tabs.forEach((tab) => {
    const listItem = document.createElement('li');
    const urlLine = document.createElement('div');
    const changeLine = document.createElement('div');

    urlLine.className = 'url';
    changeLine.className = 'change';
    urlLine.textContent = tab.url ?? '(no URL)';

    const ruleMatch = getRuleMatch(rules, tab.url ?? '');
    const changes = [];

    if (ruleMatch?.nameTemplate) {
      const title = applyTemplate(ruleMatch.nameTemplate, ruleMatch.match);
      if (title) {
        changes.push(`Title: ${title}`);
      }
    }
    if (ruleMatch?.iconTemplate) {
      const iconName = applyTemplate(ruleMatch.iconTemplate, ruleMatch.match);
      if (iconName) {
        changes.push(`Icon: ${iconName}`);
      }
    }

    changeLine.textContent = changes.length > 0 ? changes.join(' • ') : 'No changes';
    listItem.appendChild(urlLine);
    listItem.appendChild(changeLine);
    previewList.appendChild(listItem);
  });
};

const loadSettings = async () => {
  intervalOptions.forEach((option) => {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    intervalSelect.appendChild(element);
  });

  const values = await storage.get([RULES_SETTINGS_KEY, CHECK_INTERVAL_KEY]);
  rulesInput.value = values[RULES_SETTINGS_KEY] ?? '';
  const interval = Number(values[CHECK_INTERVAL_KEY]);
  intervalSelect.value = Number.isFinite(interval)
    ? String(interval)
    : String(DEFAULT_CHECK_INTERVAL_MINUTES);
};

const saveSettings = async () => {
  const intervalMinutes = Number(intervalSelect.value) || 0;
  await storage.set({
    [RULES_SETTINGS_KEY]: rulesInput.value,
    [CHECK_INTERVAL_KEY]: intervalMinutes,
  });

  await updateRuleCheckSchedule(intervalMinutes);
  await refreshAllTabs();
  status.textContent = 'Saved.';
};

document.getElementById('save').addEventListener('click', saveSettings);
document.getElementById('close').addEventListener('click', () => window.close());
rulesInput.addEventListener('input', renderPreview);
previewToggle.addEventListener('change', renderPreview);

loadSettings();
