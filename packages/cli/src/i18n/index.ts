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

export function formatDuration(seconds: number): string {
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const days = Math.floor(hours / 24);
  const minutes = totalMinutes % 60;

  if (currentLanguage === 'zh-CN') {
    if (totalMinutes < 1) return '小于1分钟';
    if (hours < 1) return `${totalMinutes}分钟`;
    if (days < 1) return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`;
    return minutes > 0 ? `${days}天${hours % 24}小时` : `${days}天`;
  }

  if (totalMinutes < 1) return '< 1 minute';
  if (hours < 1) return `${totalMinutes}m`;
  if (days < 1) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return hours % 24 > 0 ? `${days}d ${hours % 24}h` : `${days}d`;
}
