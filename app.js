'use strict';

const STORAGE_KEY = 'fridgekeeper.products.v1';
const DAY_MS = 24 * 60 * 60 * 1000;

const form = document.querySelector('#product-form');
const nameInput = document.querySelector('#product-name');
const categoryInput = document.querySelector('#product-category');
const quantityInput = document.querySelector('#product-quantity');
const expiryInput = document.querySelector('#product-expiry');
const submitButton = document.querySelector('#submit-button');
const cancelEditButton = document.querySelector('#cancel-edit');
const productList = document.querySelector('#product-list');
const emptyState = document.querySelector('#empty-state');
const searchInput = document.querySelector('#search-products');
const sortSelect = document.querySelector('#sort-products');
const filterButtons = [...document.querySelectorAll('[data-filter]')];
const toast = document.querySelector('#toast');

let editingId = null;
let activeFilter = 'all';
let products = loadProducts();
let toastTimeout;

function dateOffset(days) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + days);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function makeDemoProducts() {
    return [
        { id: createId(), name: 'Томатный соус', category: 'Соусы и специи', quantity: 2, expiry: dateOffset(2) },
        { id: createId(), name: 'Натуральный йогурт', category: 'Молочные продукты', quantity: 3, expiry: dateOffset(0) },
        { id: createId(), name: 'Шпинат', category: 'Овощи и фрукты', quantity: 1, expiry: dateOffset(-1) },
        { id: createId(), name: 'Паста', category: 'Бакалея', quantity: 2, expiry: dateOffset(40) }
    ];
}

function createId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }
    return `product-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadProducts() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === null) return makeDemoProducts();
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) return makeDemoProducts();
        return parsed.filter(item =>
            item && typeof item.id === 'string' &&
            typeof item.name === 'string' &&
            typeof item.category === 'string' &&
            Number.isFinite(Number(item.quantity)) &&
            typeof item.expiry === 'string'
        );
    } catch (error) {
        console.warn('Не удалось прочитать сохранённые продукты:', error);
        return makeDemoProducts();
    }
}

function persistProducts() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
        return true;
    } catch (error) {
        console.error('Не удалось сохранить продукты:', error);
        showToast('Не удалось сохранить данные в браузере. Проверь настройки хранилища.');
        return false;
    }
}

function daysUntil(dateString) {
    const parts = dateString.split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    const [year, month, day] = parts;
    const expiryUtc = Date.UTC(year, month - 1, day);
    const now = new Date();
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((expiryUtc - todayUtc) / DAY_MS);
}

function getExpiryStatus(product) {
    const days = daysUntil(product.expiry);
    if (days === null) return { key: 'fresh', label: 'Дата не указана', days: null };
    if (days < 0) return { key: 'expired', label: `Просрочен на ${Math.abs(days)} ${pluralDays(Math.abs(days))}`, days };
    if (days === 0) return { key: 'today', label: 'Годен до сегодня', days };
    if (days <= 3) return { key: 'soon', label: `Осталось ${days} ${pluralDays(days)}`, days };
    return { key: 'fresh', label: `Осталось ${days} ${pluralDays(days)}`, days };
}

function pluralDays(number) {
    const lastTwo = number % 100;
    if (lastTwo >= 11 && lastTwo <= 14) return 'дней';
    const last = number % 10;
    if (last === 1) return 'день';
    if (last >= 2 && last <= 4) return 'дня';
    return 'дней';
}

function formatDate(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    if (!year || !month || !day) return 'Дата не указана';
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
        .format(new Date(year, month - 1, day));
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

function getFilteredProducts() {
    const query = searchInput.value.trim().toLocaleLowerCase('ru');
    const filtered = products.filter(product => {
        const status = getExpiryStatus(product);
        const matchesFilter = activeFilter === 'all' ||
            (activeFilter === 'soon' && (status.key === 'soon' || status.key === 'today')) ||
            (activeFilter === 'expired' && status.key === 'expired');
        const matchesSearch = `${product.name} ${product.category}`.toLocaleLowerCase('ru').includes(query);
        return matchesFilter && matchesSearch;
    });

    filtered.sort((a, b) => {
        if (sortSelect.value === 'name') return a.name.localeCompare(b.name, 'ru');
        return (daysUntil(a.expiry) ?? Infinity) - (daysUntil(b.expiry) ?? Infinity);
    });
    return filtered;
}

function renderStats() {
    document.querySelector('#stat-total').textContent = String(products.length);
    document.querySelector('#stat-soon').textContent = String(products.filter(product => {
        const days = daysUntil(product.expiry);
        return days !== null && days >= 0 && days <= 3;
    }).length);
    document.querySelector('#stat-expired').textContent = String(products.filter(product => {
        const days = daysUntil(product.expiry);
        return days !== null && days < 0;
    }).length);
}

function renderProducts() {
    const filtered = getFilteredProducts();
    document.querySelector('#visible-count').textContent = String(filtered.length);
    productList.innerHTML = filtered.map(product => {
        const status = getExpiryStatus(product);
        return `
            <article class="product-card">
            <div class="product-main">
                <div class="product-title-row">
                    <h3 class="product-title">${escapeHtml(product.name)}</h3>
                    <span class="category-tag">${escapeHtml(product.category)}</span>
                </div>
                <div class="product-meta">
                    <span>▦ ${Number(product.quantity)} шт.</span>
                    <span class="expiry-meta">◷ ${escapeHtml(formatDate(product.expiry))}</span>
                </div>
                <span class="status status--${status.key}">${escapeHtml(status.label)}</span>
            </div>
            <div class="product-actions">
                <button class="icon-btn" type="button" data-action="edit" data-id="${escapeHtml(product.id)}" aria-label="Редактировать ${escapeHtml(product.name)}" title="Редактировать">✎</button>
                <button class="icon-btn icon-btn--delete" type="button" data-action="delete" data-id="${escapeHtml(product.id)}" aria-label="Удалить ${escapeHtml(product.name)}" title="Удалить">×</button>
            </div>
            </article>`;
    }).join('');

  emptyState.classList.toggle('is-hidden', filtered.length > 0);
  productList.classList.toggle('is-hidden', filtered.length === 0);
  renderStats();
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('is-visible'), 2800);
}

function clearErrors() {
    document.querySelector('#name-error').textContent = '';
    document.querySelector('#expiry-error').textContent = '';
    nameInput.removeAttribute('aria-invalid');
    expiryInput.removeAttribute('aria-invalid');
}

function validateForm() {
    clearErrors();
    let valid = true;
    if (!nameInput.value.trim()) {
        document.querySelector('#name-error').textContent = 'Укажи название продукта.';
        nameInput.setAttribute('aria-invalid', 'true');
        valid = false;
    }
    const quantity = Number(quantityInput.value);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
        quantityInput.setCustomValidity('Количество должно быть целым числом от 1 до 999.');
        quantityInput.reportValidity();
        quantityInput.setCustomValidity('');
        valid = false;
    }
    if (!expiryInput.value) {
        document.querySelector('#expiry-error').textContent = 'Укажи срок годности.';
        expiryInput.setAttribute('aria-invalid', 'true');
        valid = false;
    }
    return valid;
}

function resetForm() {
    form.reset();
    quantityInput.value = '1';
    editingId = null;
    document.querySelector('#form-title').textContent = 'Добавить продукт';
    submitButton.innerHTML = 'Добавить продукт';
    cancelEditButton.classList.add('is-hidden');
    clearErrors();
}

form.addEventListener('submit', event => {
    event.preventDefault();
    if (!validateForm()) return;

    const nextProduct = {
        id: editingId || createId(),
        name: nameInput.value.trim(),
        category: categoryInput.value,
        quantity: Number(quantityInput.value),
        expiry: expiryInput.value
    };

    if (editingId) {
        products = products.map(product => product.id === editingId ? nextProduct : product);
        showToast('Изменения сохранены.');
    } else {
        products.push(nextProduct);
        showToast('Продукт добавлен в список.');
    }

    persistProducts();
    resetForm();
    renderProducts();
});

cancelEditButton.addEventListener('click', () => {
    resetForm();
    showToast('Редактирование отменено.');
});

productList.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const product = products.find(item => item.id === button.dataset.id);
    if (!product) return;

    if (button.dataset.action === 'edit') {
        editingId = product.id;
        nameInput.value = product.name;
        categoryInput.value = product.category;
        quantityInput.value = String(product.quantity);
        expiryInput.value = product.expiry;
        document.querySelector('#form-title').textContent = 'Редактировать продукт';
        submitButton.innerHTML = 'Сохранить изменения';
        cancelEditButton.classList.remove('is-hidden');
        clearErrors();
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        nameInput.focus({ preventScroll: true });
        return;
    }

    if (button.dataset.action === 'delete') {
        products = products.filter(item => item.id !== product.id);
        if (editingId === product.id) resetForm();
        persistProducts();
        renderProducts();
        showToast('Продукт удалён.');
    }
});

searchInput.addEventListener('input', renderProducts);
sortSelect.addEventListener('change', renderProducts);
filterButtons.forEach(button => {
    button.addEventListener('click', () => {
        activeFilter = button.dataset.filter;
        filterButtons.forEach(item => {
            const active = item === button;
            item.classList.toggle('is-active', active);
            item.setAttribute('aria-pressed', String(active));
        });
        renderProducts();
    });
});

document.addEventListener('keydown', event => {
    const target = event.target;
    const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    if (event.key === '/' && !isTyping && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        searchInput.focus();
    }
    if (event.key === 'Escape' && editingId) resetForm();
});

renderProducts();
