/* ============================================================
   Cat Age Tracker — storage.js
   All localStorage reads/writes live here behind one small
   `Storage` object, so app.js never touches localStorage
   directly. Exposed as a plain top-level `const`, so as long as
   this file loads before app.js it's available as a shared
   global (no bundler or ES module setup needed).
============================================================ */

const STORAGE_KEYS = {
  PROFILE: 'catTracker_profile',
  ENTRIES: 'catTracker_entries'
};

const Storage = {

  /* ---------------- Profile ---------------- */

  getProfile() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PROFILE);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.error('Storage: failed to read profile', err);
      return null;
    }
  },

  saveProfile(profile) {
    try {
      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
      return true;
    } catch (err) {
      console.error('Storage: failed to save profile', err);
      return false;
    }
  },

  /* ---------------- Photo / weight entries ---------------- */

  getEntries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ENTRIES);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error('Storage: failed to read entries', err);
      return [];
    }
  },

  saveEntries(entries) {
    try {
      localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(entries));
      return true;
    } catch (err) {
      // Most commonly a quota-exceeded error from too many photos
      console.error('Storage: failed to save entries', err);
      return false;
    }
  },

  addEntry(entry) {
    const entries = this.getEntries();
    entries.push(entry);
    return this.saveEntries(entries);
  },

  deleteEntry(id) {
    const entries = this.getEntries().filter(e => e.id !== id);
    return this.saveEntries(entries);
  },

  /* ---------------- Utility ---------------- */

  clearAll() {
    try {
      localStorage.removeItem(STORAGE_KEYS.PROFILE);
      localStorage.removeItem(STORAGE_KEYS.ENTRIES);
      return true;
    } catch (err) {
      console.error('Storage: failed to clear data', err);
      return false;
    }
  }
};
