import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const createFetchWithTimeout = defaultTimeoutMs => async (url, options = {}, timeoutMs = defaultTimeoutMs) => {
  const signal = options.signal || AbortSignal.timeout(timeoutMs);
  try {
    return await fetch(url, { ...options, signal });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    }
    throw error;
  }
};

export const now = () => new Date().toISOString();

export const uid = prefix => `${prefix}_${crypto.randomBytes(10).toString('hex')}`;

export const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
};

export const verifyPassword = (password, stored) => {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const candidate = hashPassword(password, salt).split(':')[1];
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
};

export const directorySize = async dir => {
  let total = 0;
  try {
    const stat = await fs.stat(dir).catch(() => null);
    if (stat?.isFile()) return stat.size;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) total += await directorySize(fullPath);
      if (entry.isFile()) total += (await fs.stat(fullPath)).size;
    }
  } catch {
    return total;
  }
  return total;
};

export const countFiles = async dir => {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter(entry => entry.isFile()).length;
  } catch {
    return 0;
  }
};

export const latestFile = async (dir, matcher = () => true) => {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries
      .filter(entry => entry.isFile() && matcher(entry.name))
      .map(async entry => {
        const fullPath = path.join(dir, entry.name);
        const stat = await fs.stat(fullPath);
        return {
          name: entry.name,
          path: fullPath,
          sizeKb: Math.round(stat.size / 1024),
          modifiedAt: stat.mtime.toISOString()
        };
      }));
    return files.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt))[0] || null;
  } catch {
    return null;
  }
};

export const mb = bytes => Math.round((bytes / 1024 / 1024) * 10) / 10;

export const pct = (value, limit) => limit ? Math.min(100, Math.round((Number(value || 0) / limit) * 100)) : 0;

export const daysAgoIso = days => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

export const numberFromMoney = value => {
  const match = String(value || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
};

export const csvEscape = value => {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
