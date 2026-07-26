/* ============================================================
   Cat Age Tracker — app.js
   Core app logic: age math, life-stage rules, milestones,
   profile + photo-upload UI, timeline rendering, weight chart.
   Depends on storage.js being loaded first (uses the global
   `Storage` object it defines).
============================================================ */

(function () {
  'use strict';

  /* ---------------------------------------------------------
     DOM references
  --------------------------------------------------------- */
  // Profile — display
  const profileDisplayEl = document.getElementById('profile-display');
  const editProfileBtn = document.getElementById('edit-profile-btn');
  const avatarImgEl = document.getElementById('avatar-img');
  const avatarPlaceholderEl = document.getElementById('avatar-placeholder');
  const catNameDisplayEl = document.getElementById('cat-name-display');
  const catBreedDisplayEl = document.getElementById('cat-breed-display');
  const lifeStageBadgeEl = document.getElementById('life-stage-badge');
  const ageYearsEl = document.getElementById('age-years');
  const ageMonthsEl = document.getElementById('age-months');
  const ageDaysEl = document.getElementById('age-days');
  const referenceDateNoteEl = document.getElementById('reference-date-note');

  // Profile — form
  const profileFormEl = document.getElementById('profile-form');
  const cancelEditBtn = document.getElementById('cancel-edit-btn');
  const avatarInput = document.getElementById('avatar-input');
  const avatarPreviewEl = document.getElementById('avatar-preview');
  const catNameInput = document.getElementById('cat-name-input');
  const catDateInput = document.getElementById('cat-date-input');
  const catBreedInput = document.getElementById('cat-breed-input');
  const dateTypeToggleEl = document.getElementById('date-type-toggle');

  // Weight
  const weightSectionEl = document.getElementById('weight-section');
  const weightChartEl = document.getElementById('weight-chart');
  const weightLatestEl = document.getElementById('weight-latest');

  // Photo log
  const logCardEl = document.getElementById('log-card');
  const modeToggleEl = document.getElementById('mode-toggle');
  const modeHintEl = document.getElementById('mode-hint');
  const uploadFormEl = document.getElementById('upload-form');
  const dropZoneEl = document.getElementById('drop-zone');
  const dropZoneEmptyEl = document.getElementById('drop-zone-empty');
  const photoInput = document.getElementById('photo-input');
  const photoPreviewEl = document.getElementById('photo-preview');
  const uploadFieldsEl = document.getElementById('upload-fields');
  const entryDateInput = document.getElementById('entry-date-input');
  const entryWeightInput = document.getElementById('entry-weight-input');
  const entryCaptionInput = document.getElementById('entry-caption-input');
  const cancelUploadBtn = document.getElementById('cancel-upload-btn');
  const timelineEmptyEl = document.getElementById('timeline-empty');
  const timelineFeedEl = document.getElementById('timeline-feed');

  const resetDataBtn = document.getElementById('reset-data-btn');
  const toastEl = document.getElementById('toast');

  /* ---------------------------------------------------------
     State
  --------------------------------------------------------- */
  let currentProfile = null;      // the saved profile object, or null
  let selectedDateType = 'birth'; // form's current birth/adoption choice
  let pendingAvatarBase64 = null; // avatar chosen in the form, not yet saved
  let pendingPhotoBase64 = null;  // photo chosen in the upload form
  let toastTimeout = null;

  const LIFE_STAGES = [
    { max: 1,        key: 'kitten',       label: 'Kitten',       icon: '🍼' },
    { max: 3,        key: 'junior',       label: 'Junior',       icon: '🌱' },
    { max: 7,        key: 'prime',        label: 'Prime',        icon: '💪' },
    { max: 11,       key: 'mature',       label: 'Mature',       icon: '🍂' },
    { max: 15,       key: 'senior',       label: 'Senior',       icon: '🌙' },
    { max: Infinity, key: 'super-senior', label: 'Super senior', icon: '✨' }
  ];

  /* ---------------------------------------------------------
     Date & formatting helpers
  --------------------------------------------------------- */

  // Calendar-correct age in years/months/days between two dates
  // (not totalDays / 365, which drifts against real calendar months).
  // toDate defaults to right now; pass a Date to check age on a
  // specific past day instead (used for each photo's timeline age).
  function calculateAge(fromDateStr, toDate) {
    const from = new Date(fromDateStr + 'T00:00:00');
    const toRaw = toDate instanceof Date ? toDate : new Date();
    const to = new Date(toRaw.getFullYear(), toRaw.getMonth(), toRaw.getDate());

    let years = to.getFullYear() - from.getFullYear();
    let months = to.getMonth() - from.getMonth();
    let days = to.getDate() - from.getDate();

    if (days < 0) {
      months -= 1;
      const prevMonthLastDay = new Date(to.getFullYear(), to.getMonth(), 0).getDate();
      days += prevMonthLastDay;
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }

    const totalDays = Math.round((to - from) / 86400000);
    if (totalDays < 0) return { years: 0, months: 0, days: 0, totalDays: 0 }; // guards a future date
    return { years, months, days, totalDays };
  }

  function todayISO() {
    return formatDateISO(new Date());
  }

  function formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatDateDisplay(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getOrdinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function generateId() {
    return 'entry_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  // Escapes user text before it goes into innerHTML (captions, names)
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Tweens a number element's text from `from` to `to` — the app's
  // one deliberate animated moment, since the whole app is about
  // counting time. Falls back to an instant set if nothing changed
  // or the user prefers reduced motion.
  function animateNumber(el, from, to, duration = 700) {
    if (from === to || prefersReducedMotion()) {
      el.textContent = to;
      return;
    }
    const start = performance.now();
    const change = to - from;
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(from + change * eased);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------------------------------------------------------
     Life stage
  --------------------------------------------------------- */
  function getLifeStage(years) {
    return LIFE_STAGES.find(stage => years < stage.max) || LIFE_STAGES[LIFE_STAGES.length - 1];
  }

  function renderLifeStageBadge(years) {
    const stage = getLifeStage(years);
    lifeStageBadgeEl.textContent = `${stage.icon} ${stage.label}`;
    lifeStageBadgeEl.className = `life-stage-badge stage-${stage.key}`;
  }

  /* ---------------------------------------------------------
     Milestones — computed from the profile's date, not stored.
     Mixes yearly anniversaries with flat day-count milestones so
     both a known birthdate and an approximate adoption date give
     something to celebrate.
  --------------------------------------------------------- */
  function getMilestones(profile) {
    if (!profile || !profile.date) return [];

    const refDate = new Date(profile.date + 'T00:00:00');
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isBirth = profile.dateType === 'birth';
    const milestones = [];

    // Yearly anniversaries
    for (let year = 1; year <= 30; year++) {
      const anniversary = new Date(refDate.getFullYear() + year, refDate.getMonth(), refDate.getDate());
      if (anniversary > todayMidnight) break;
      const ordinal = getOrdinal(year);
      milestones.push({
        date: formatDateISO(anniversary),
        icon: isBirth ? '🎂' : '🎉',
        label: isBirth ? `${ordinal} birthday!` : `${ordinal} adoption anniversary!`
      });
    }

    // Flat day-count milestones
    [100, 365, 500, 1000, 1500, 2000, 3000, 5000].forEach(count => {
      const milestoneDate = new Date(refDate);
      milestoneDate.setDate(milestoneDate.getDate() + count);
      if (milestoneDate <= todayMidnight) {
        milestones.push({
          date: formatDateISO(milestoneDate),
          icon: '💛',
          label: `${count} days together!`
        });
      }
    });

    return milestones;
  }

  /* ---------------------------------------------------------
     Image handling — downscales + re-encodes as JPEG before it
     ever touches localStorage, since raw photos would burn
     through the ~5MB quota after just a few entries.
  --------------------------------------------------------- */
  function compressImage(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxWidth) {
            height = Math.round(height * (maxWidth / width));
            width = maxWidth;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('Could not read image'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsDataURL(file);
    });
  }

  /* ---------------------------------------------------------
     Profile rendering
  --------------------------------------------------------- */
  function setAvatarDisplay(base64) {
    if (base64) {
      avatarImgEl.src = base64;
      avatarImgEl.classList.remove('hidden');
      avatarPlaceholderEl.classList.add('hidden');
    } else {
      avatarImgEl.classList.add('hidden');
      avatarPlaceholderEl.classList.remove('hidden');
    }
  }

  function setAvatarFormPreview(base64) {
    if (base64) {
      avatarPreviewEl.src = base64;
      avatarPreviewEl.classList.remove('hidden');
    } else {
      avatarPreviewEl.removeAttribute('src');
      avatarPreviewEl.classList.add('hidden');
    }
  }

  function updateAgeDisplay() {
    if (!currentProfile) return;
    const age = calculateAge(currentProfile.date);
    animateNumber(ageYearsEl, parseInt(ageYearsEl.textContent, 10) || 0, age.years);
    animateNumber(ageMonthsEl, parseInt(ageMonthsEl.textContent, 10) || 0, age.months);
    animateNumber(ageDaysEl, parseInt(ageDaysEl.textContent, 10) || 0, age.days);
    renderLifeStageBadge(age.years);
  }

  function updateReferenceNote() {
    if (!currentProfile) return;
    const formatted = formatDateDisplay(currentProfile.date);
    referenceDateNoteEl.textContent = currentProfile.dateType === 'birth'
      ? `Born ${formatted}`
      : `Adopted ${formatted}`;
  }

  function renderProfileDisplay() {
    if (!currentProfile) return;
    catNameDisplayEl.textContent = currentProfile.name;
    catBreedDisplayEl.textContent = currentProfile.breed || '';
    catBreedDisplayEl.classList.toggle('hidden', !currentProfile.breed);
    setAvatarDisplay(currentProfile.avatar);
    updateAgeDisplay();
    updateReferenceNote();
  }

  function showProfileDisplayMode() {
    profileDisplayEl.classList.remove('hidden');
    profileFormEl.classList.add('hidden');
  }

  function showProfileFormMode() {
    profileDisplayEl.classList.add('hidden');
    profileFormEl.classList.remove('hidden');
  }

  function syncDateTypeToggleUI() {
    dateTypeToggleEl.querySelectorAll('.segment').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === selectedDateType);
    });
  }

  /* ---------------------------------------------------------
     Mode toggle (Daily / Weekly)
  --------------------------------------------------------- */
  function syncModeToggleUI() {
    modeToggleEl.querySelectorAll('.segment').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === currentProfile.logMode);
    });
  }

  function updateModeHint() {
    if (!currentProfile) return;
    modeHintEl.textContent = currentProfile.logMode === 'daily'
      ? 'Snap a quick photo every day to build a detailed growth diary.'
      : 'Add a photo each week to watch them grow over time.';
  }

  // Shared wiring for both segmented controls (mode + date-type)
  function setupSegmentedControl(container, onChange) {
    container.querySelectorAll('.segment').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.segment').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        onChange(btn.dataset.value);
      });
    });
  }

  /* ---------------------------------------------------------
     Photo upload
  --------------------------------------------------------- */
  async function handlePhotoFile(file) {
    if (!file.type.startsWith('image/')) {
      showToast('Please choose an image file');
      return;
    }
    try {
      pendingPhotoBase64 = await compressImage(file, 900, 0.82);
      photoPreviewEl.src = pendingPhotoBase64;
      photoPreviewEl.classList.remove('hidden');
      dropZoneEmptyEl.classList.add('hidden');
      uploadFieldsEl.classList.remove('hidden');
      if (!entryDateInput.value) entryDateInput.value = todayISO();
    } catch (err) {
      showToast('Could not load that photo');
    }
  }

  function resetUploadForm() {
    pendingPhotoBase64 = null;
    photoInput.value = '';
    photoPreviewEl.removeAttribute('src');
    photoPreviewEl.classList.add('hidden');
    dropZoneEmptyEl.classList.remove('hidden');
    uploadFieldsEl.classList.add('hidden');
    entryCaptionInput.value = '';
    entryWeightInput.value = '';
    entryDateInput.value = todayISO();
  }

  /* ---------------------------------------------------------
     Timeline rendering
  --------------------------------------------------------- */
  function createPhotoCard(entry) {
    const age = calculateAge(currentProfile.date, new Date(entry.date + 'T00:00:00'));
    const card = document.createElement('div');
    card.className = 'timeline-card fade-in';
    card.innerHTML = `
      <button class="delete-entry-btn" type="button" data-id="${entry.id}" aria-label="Delete this entry">×</button>
      <img class="timeline-photo" src="${entry.photo}" alt="${escapeHTML(currentProfile.name)} on ${formatDateDisplay(entry.date)}">
      <div class="timeline-card-body">
        <div class="timeline-date-row">
          <span class="timeline-date">${formatDateDisplay(entry.date)}</span>
          <span class="timeline-age">${age.years}y ${age.months}m ${age.days}d</span>
        </div>
        ${entry.weight ? `<span class="timeline-weight">⚖️ ${entry.weight} kg</span>` : ''}
        ${entry.caption ? `<p class="timeline-caption">${escapeHTML(entry.caption)}</p>` : ''}
      </div>
    `;
    return card;
  }

  function createMilestoneCard(item) {
    const card = document.createElement('div');
    card.className = 'timeline-card milestone-card fade-in';
    card.innerHTML = `
      <span class="milestone-icon">${item.icon}</span>
      <div class="milestone-text">
        <strong>${escapeHTML(item.label)}</strong>
        <span class="milestone-date">${formatDateDisplay(item.date)}</span>
      </div>
    `;
    return card;
  }

  function renderTimeline() {
    if (!currentProfile) return;
    const entries = Storage.getEntries().map(e => ({ ...e, type: 'photo' }));
    const milestones = getMilestones(currentProfile).map(m => ({ ...m, type: 'milestone' }));
    const feedItems = [...entries, ...milestones].sort((a, b) => new Date(b.date) - new Date(a.date));

    timelineFeedEl.innerHTML = '';

    if (feedItems.length === 0) {
      timelineEmptyEl.classList.remove('hidden');
      timelineFeedEl.classList.add('hidden');
      return;
    }
    timelineEmptyEl.classList.add('hidden');
    timelineFeedEl.classList.remove('hidden');

    feedItems.forEach(item => {
      const card = item.type === 'milestone' ? createMilestoneCard(item) : createPhotoCard(item);
      timelineFeedEl.appendChild(card);
    });
  }

  /* ---------------------------------------------------------
     Weight chart — plain SVG polyline, no charting library.
     Only shows once there are 2+ weigh-ins to actually form a line.
  --------------------------------------------------------- */
  function renderWeightChart() {
    const withWeight = Storage.getEntries().filter(e => e.weight != null && !isNaN(e.weight));
    if (withWeight.length < 2) {
      weightSectionEl.classList.add('hidden');
      return;
    }
    weightSectionEl.classList.remove('hidden');

    const sorted = [...withWeight].sort((a, b) => new Date(a.date) - new Date(b.date));
    const weights = sorted.map(e => e.weight);
    const minW = Math.min(...weights);
    const maxW = Math.max(...weights);
    const range = maxW - minW || 1;

    const width = 300, height = 100, padding = 10;
    const stepX = (width - padding * 2) / (sorted.length - 1);

    const points = sorted.map((e, i) => {
      const x = padding + i * stepX;
      const y = height - padding - ((e.weight - minW) / range) * (height - padding * 2);
      return { x: x.toFixed(1), y: y.toFixed(1) };
    });

    const pointsAttr = points.map(p => `${p.x},${p.y}`).join(' ');
    const dots = points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" class="weight-dot" />`).join('');
    weightChartEl.innerHTML = `<polyline points="${pointsAttr}" class="weight-line" />${dots}`;

    const latest = sorted[sorted.length - 1];
    weightLatestEl.textContent = `Latest: ${latest.weight} kg on ${formatDateDisplay(latest.date)}`;
  }

  /* ---------------------------------------------------------
     Toast
  --------------------------------------------------------- */
  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('visible');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toastEl.classList.remove('visible'), 2600);
  }

  /* ---------------------------------------------------------
     Section visibility — the log and weight sections need a
     profile to exist before they have anything to calculate against
  --------------------------------------------------------- */
  function revealDependentSections() {
    logCardEl.classList.remove('hidden');
    renderTimeline();
    renderWeightChart();
  }

  /* ---------------------------------------------------------
     Event wiring
  --------------------------------------------------------- */
  editProfileBtn.addEventListener('click', () => {
    if (!currentProfile) return;
    catNameInput.value = currentProfile.name;
    catDateInput.value = currentProfile.date;
    catBreedInput.value = currentProfile.breed || '';
    selectedDateType = currentProfile.dateType;
    syncDateTypeToggleUI();
    pendingAvatarBase64 = currentProfile.avatar || null;
    setAvatarFormPreview(pendingAvatarBase64);
    cancelEditBtn.classList.remove('hidden');
    showProfileFormMode();
  });

  cancelEditBtn.addEventListener('click', () => showProfileDisplayMode());

  setupSegmentedControl(dateTypeToggleEl, (value) => { selectedDateType = value; });

  setupSegmentedControl(modeToggleEl, (value) => {
    if (!currentProfile) return;
    currentProfile.logMode = value;
    Storage.saveProfile(currentProfile);
    updateModeHint();
  });

  avatarInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      pendingAvatarBase64 = await compressImage(file, 500, 0.85);
      setAvatarFormPreview(pendingAvatarBase64);
    } catch (err) {
      showToast('Could not load that photo');
    }
  });

  profileFormEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = catNameInput.value.trim();
    const date = catDateInput.value;

    if (!name || !date) {
      showToast('Add a name and a date to continue');
      return;
    }
    if (new Date(date + 'T00:00:00') > new Date()) {
      showToast("That date can't be in the future");
      return;
    }

    currentProfile = {
      name,
      date,
      dateType: selectedDateType,
      breed: catBreedInput.value.trim(),
      avatar: pendingAvatarBase64,
      logMode: (currentProfile && currentProfile.logMode) || 'weekly'
    };
    Storage.saveProfile(currentProfile);

    renderProfileDisplay();
    syncModeToggleUI();
    updateModeHint();
    showProfileDisplayMode();
    revealDependentSections();
    showToast('Profile saved');
  });

  dropZoneEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZoneEl.classList.add('drag-over');
  });
  dropZoneEl.addEventListener('dragleave', () => dropZoneEl.classList.remove('drag-over'));
  dropZoneEl.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZoneEl.classList.remove('drag-over');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handlePhotoFile(file);
  });
  photoInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handlePhotoFile(file);
  });
  cancelUploadBtn.addEventListener('click', resetUploadForm);

  uploadFormEl.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!pendingPhotoBase64) {
      showToast('Choose a photo first');
      return;
    }
    const date = entryDateInput.value || todayISO();
    if (new Date(date + 'T00:00:00') > new Date()) {
      showToast("That date can't be in the future");
      return;
    }

    const entry = {
      id: generateId(),
      date,
      photo: pendingPhotoBase64,
      caption: entryCaptionInput.value.trim(),
      weight: entryWeightInput.value ? parseFloat(entryWeightInput.value) : null
    };

    if (!Storage.addEntry(entry)) {
      showToast('Storage is full — try deleting an old photo');
      return;
    }

    resetUploadForm();
    renderTimeline();
    renderWeightChart();
    showToast('Added to timeline');
  });

  timelineFeedEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.delete-entry-btn');
    if (!btn) return;
    if (confirm('Remove this photo from the timeline?')) {
      Storage.deleteEntry(btn.dataset.id);
      renderTimeline();
      renderWeightChart();
    }
  });

  resetDataBtn.addEventListener('click', () => {
    if (confirm("This will permanently delete this cat's profile and all photos. Continue?")) {
      Storage.clearAll();
      location.reload();
    }
  });

  /* ---------------------------------------------------------
     Init
  --------------------------------------------------------- */
  function init() {
    currentProfile = Storage.getProfile();
    catDateInput.max = todayISO();
    entryDateInput.max = todayISO();
    entryDateInput.value = todayISO();

    if (currentProfile) {
      selectedDateType = currentProfile.dateType;
      syncDateTypeToggleUI();
      syncModeToggleUI();
      renderProfileDisplay();
      showProfileDisplayMode();
      updateModeHint();
      revealDependentSections();
    } else {
      showProfileFormMode();
    }

    // Keep the age fresh if the tab is left open across midnight
    setInterval(updateAgeDisplay, 60000);
  }

  init();
})();
