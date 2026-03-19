export type AppLanguage = 'zh-CN' | 'en';
export type TranslationParams = Record<string, string | number>;

import { zhCN } from './locales/zh-CN.js';
import { en } from './locales/en.js';

const dictionaries = {
  en,
  'zh-CN': zhCN,
} as const;

let currentLanguage: AppLanguage = 'zh-CN';

export function setLanguage(language: AppLanguage): void {
  currentLanguage = language;
}

export function getLanguage(): AppLanguage {
  return currentLanguage;
}

export function t(key: string, params: TranslationParams = {}): string {
  const dictionary = dictionaries[currentLanguage];
  const template = dictionary[key] ?? dictionaries.en[key] ?? key;

  return Object.entries(params).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
    template
  );
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat(currentLanguage === 'zh-CN' ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatDuration(hours: number): string {
  if (currentLanguage === 'zh-CN') {
    if (hours < 1) return '小于1小时';
    if (hours < 24) return `${Math.floor(hours)}小时`;
    return `${Math.floor(hours / 24)}天`;
  }
  if (hours < 1) return '< 1 hour';
  if (hours < 24) return `${Math.floor(hours)} hours`;
  return `${Math.floor(hours / 24)} days`;
}
