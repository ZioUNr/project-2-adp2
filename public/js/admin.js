const adminMessage = document.querySelector("#admin-message");
const productForm = document.querySelector("#product-form");
const newsForm = document.querySelector("#news-form");
const pageSectionForm = document.querySelector("#page-section-form");
const settingsForm = document.querySelector("#settings-form");
const productList = document.querySelector("#product-list");
const newsList = document.querySelector("#news-list");
const pageSectionList = document.querySelector("#page-section-list");
const pageLabels = {
    home: "Главная",
    catalog: "Коллекция",
    about: "О салоне",
    news: "Новости",
    contacts: "Контакты"
};
let csrfToken = "";

const showAdminMessage = (message, isError = false) => {
    adminMessage.textContent = message;
    adminMessage.classList.toggle("is-error", isError);
    adminMessage.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
};

const api = async (url, options = {}) => {
    const headers = { Accept: "application/json", ...options.headers };
    if (csrfToken && options.method && options.method !== "GET") {
        headers["X-CSRF-Token"] = csrfToken;
    }
    if (options.body && !(options.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
    }
    const response = await fetch(url, { credentials: "same-origin", ...options, headers });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) {
        location.replace("/admin/login.html");
        throw new Error("Сессия завершена. Войдите в панель ещё раз.");
    }
    if (!response.ok) {
        throw new Error(result.error || "Не удалось выполнить запрос.");
    }
    return result;
};

const setFormValue = (form, name, value) => {
    const field = form.elements.namedItem(name);
    if (field.type === "checkbox") {
        field.checked = Boolean(value);
    } else {
        field.value = value ?? "";
    }
};

const showPreview = (input, preview, source = input.value) => {
    preview.hidden = !source;
    if (source) {
        preview.src = source;
    } else {
        preview.removeAttribute("src");
    }
};

const uploadImage = async (file) => {
    const body = new FormData();
    body.append("image", file);
    return api("/api/admin/upload", { method: "POST", body });
};

const resetProductForm = () => {
    productForm.reset();
    productForm.elements.namedItem("id").value = "";
    productForm.elements.namedItem("published").checked = true;
    document.querySelector("#product-form-eyebrow").textContent = "Новая модель";
    document.querySelector("#product-form-title").textContent = "Добавить в коллекцию";
    showPreview(document.querySelector("#product-image"), document.querySelector("#product-image-preview"), "");
    document.querySelector("#product-image-file").value = "";
};

const resetNewsForm = () => {
    newsForm.reset();
    newsForm.elements.namedItem("id").value = "";
    newsForm.elements.namedItem("published").checked = true;
    document.querySelector("#news-form-eyebrow").textContent = "Новая публикация";
    document.querySelector("#news-form-title").textContent = "Добавить новость";
    showPreview(document.querySelector("#news-image"), document.querySelector("#news-image-preview"), "");
    document.querySelector("#news-image-file").value = "";
};

const resetPageSectionForm = () => {
    pageSectionForm.reset();
    pageSectionForm.elements.namedItem("id").value = "";
    pageSectionForm.elements.namedItem("pageKey").value = document.querySelector("#page-section-filter").value;
    pageSectionForm.elements.namedItem("sortOrder").value = "0";
    pageSectionForm.elements.namedItem("published").checked = true;
    document.querySelector("#page-section-form-eyebrow").textContent = "Новый текстовый блок";
    document.querySelector("#page-section-form-title").textContent = "Добавить на страницу";
};

const recordButton = (label, className, handler) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
};

const renderProducts = (products) => {
    if (!products.length) {
        const note = document.createElement("p");
        note.className = "loading-note";
        note.textContent = "Коллекция пока пуста. Добавьте первую модель через форму.";
        productList.replaceChildren(note);
        return;
    }
    const records = products.map((product) => {
        const card = document.createElement("article");
        card.className = "record-card";
        const image = document.createElement("img");
        image.className = "record-thumb";
        image.src = product.image;
        image.alt = "";
        image.loading = "lazy";
        const copy = document.createElement("div");
        copy.className = "record-copy";
        const title = document.createElement("h3");
        title.textContent = product.name;
        const details = document.createElement("p");
        const price = window.Ainazik.formatPrice(product.price);
        const category = window.Ainazik.categoryLabels[product.category];
        details.textContent = [category, price, product.is_new ? "Новинка" : "", product.published ? "" : "Скрыто"]
            .filter(Boolean).join(" · ");
        copy.append(title, details);
        const actions = document.createElement("div");
        actions.className = "record-actions";
        actions.append(
            recordButton("Изменить", "admin-button admin-button-quiet", () => editProduct(product)),
            recordButton("Удалить", "admin-button admin-button-danger", () => deleteProduct(product))
        );
        card.append(image, copy, actions);
        return card;
    });
    productList.replaceChildren(...records);
};

const editProduct = (product) => {
    for (const [key, value] of Object.entries({
        id: product.id,
        name: product.name,
        category: product.category,
        price: product.price,
        image: product.image,
        description: product.description,
        sizes: product.sizes,
        fabric: product.fabric,
        isNew: product.is_new,
        published: product.published
    })) {
        setFormValue(productForm, key, value);
    }
    document.querySelector("#product-form-eyebrow").textContent = "Редактирование";
    document.querySelector("#product-form-title").textContent = product.name;
    showPreview(document.querySelector("#product-image"), document.querySelector("#product-image-preview"));
    document.querySelector("#product-image-file").value = "";
    productForm.scrollIntoView({ behavior: "smooth", block: "start" });
};

const deleteProduct = async (product) => {
    if (!window.confirm(`Удалить «${product.name}» из коллекции?`)) {
        return;
    }
    try {
        await api(`/api/admin/products/${encodeURIComponent(product.id)}`, { method: "DELETE" });
        await loadProducts();
        showAdminMessage("Платье удалено.");
    } catch (error) {
        showAdminMessage(error.message, true);
    }
};

const renderNews = (articles) => {
    if (!articles.length) {
        const note = document.createElement("p");
        note.className = "loading-note";
        note.textContent = "Публикаций пока нет. Создайте первую новость через форму.";
        newsList.replaceChildren(note);
        return;
    }
    const records = articles.map((article) => {
        const card = document.createElement("article");
        card.className = "record-card";
        if (article.image) {
            const image = document.createElement("img");
            image.className = "record-thumb";
            image.src = article.image;
            image.alt = "";
            image.loading = "lazy";
            card.append(image);
        }
        const copy = document.createElement("div");
        copy.className = "record-copy";
        const title = document.createElement("h3");
        title.textContent = article.title;
        const details = document.createElement("p");
        details.textContent = `${window.Ainazik.formatDate(article.created_at)}${article.published ? "" : " · Скрыта"}`;
        copy.append(title, details);
        const actions = document.createElement("div");
        actions.className = "record-actions";
        actions.append(
            recordButton("Изменить", "admin-button admin-button-quiet", () => editNews(article)),
            recordButton("Удалить", "admin-button admin-button-danger", () => deleteNews(article))
        );
        card.append(copy, actions);
        return card;
    });
    newsList.replaceChildren(...records);
};

const renderPageSections = (sections) => {
    if (!sections.length) {
        const note = document.createElement("p");
        note.className = "loading-note";
        note.textContent = "На этой странице пока нет дополнительных текстовых блоков.";
        pageSectionList.replaceChildren(note);
        return;
    }
    const records = sections.map((section) => {
        const card = document.createElement("article");
        card.className = "record-card page-section-record";
        const copy = document.createElement("div");
        copy.className = "record-copy";
        const title = document.createElement("h3");
        title.textContent = section.title || "Блок без заголовка";
        const excerpt = document.createElement("p");
        excerpt.textContent = `${pageLabels[section.page_key]} · порядок ${section.sort_order}${section.published ? "" : " · Скрыт"} · ${section.body}`;
        copy.append(title, excerpt);
        const actions = document.createElement("div");
        actions.className = "record-actions";
        actions.append(
            recordButton("Изменить", "admin-button admin-button-quiet", () => editPageSection(section)),
            recordButton("Удалить", "admin-button admin-button-danger", () => deletePageSection(section))
        );
        card.append(copy, actions);
        return card;
    });
    pageSectionList.replaceChildren(...records);
};

const editPageSection = (section) => {
    for (const [key, value] of Object.entries({
        id: section.id,
        pageKey: section.page_key,
        title: section.title,
        body: section.body,
        sortOrder: section.sort_order,
        published: section.published
    })) {
        setFormValue(pageSectionForm, key, value);
    }
    document.querySelector("#page-section-form-eyebrow").textContent = `Редактирование · ${pageLabels[section.page_key]}`;
    document.querySelector("#page-section-form-title").textContent = section.title || "Текстовый блок";
    pageSectionForm.scrollIntoView({ behavior: "smooth", block: "start" });
};

const deletePageSection = async (section) => {
    const label = section.title || "этот текстовый блок";
    if (!window.confirm(`Удалить «${label}» со страницы «${pageLabels[section.page_key]}»?`)) {
        return;
    }
    try {
        await api(`/api/admin/page-content/${encodeURIComponent(section.id)}`, { method: "DELETE" });
        await loadPageSections();
        showAdminMessage("Текстовый блок удалён.");
    } catch (error) {
        showAdminMessage(error.message, true);
    }
};

const editNews = (article) => {
    for (const [key, value] of Object.entries({
        id: article.id,
        title: article.title,
        excerpt: article.excerpt,
        body: article.body,
        image: article.image,
        published: article.published
    })) {
        setFormValue(newsForm, key, value);
    }
    document.querySelector("#news-form-eyebrow").textContent = "Редактирование";
    document.querySelector("#news-form-title").textContent = article.title;
    showPreview(document.querySelector("#news-image"), document.querySelector("#news-image-preview"));
    document.querySelector("#news-image-file").value = "";
    newsForm.scrollIntoView({ behavior: "smooth", block: "start" });
};

const deleteNews = async (article) => {
    if (!window.confirm(`Удалить публикацию «${article.title}»?`)) {
        return;
    }
    try {
        await api(`/api/admin/news/${encodeURIComponent(article.id)}`, { method: "DELETE" });
        await loadNews();
        showAdminMessage("Публикация удалена.");
    } catch (error) {
        showAdminMessage(error.message, true);
    }
};

async function loadProducts() {
    renderProducts(await api("/api/admin/products"));
}

async function loadNews() {
    renderNews(await api("/api/admin/news"));
}

async function loadPageSections() {
    const page = document.querySelector("#page-section-filter").value;
    renderPageSections(await api(`/api/admin/page-content?page=${encodeURIComponent(page)}`));
}

const loadSettings = async () => {
    const settings = await api("/api/settings");
    for (const key of ["city", "address", "phone", "whatsapp", "instagram", "hours"]) {
        setFormValue(settingsForm, key, settings[key]);
    }
};

const initTabs = () => {
    const tabs = [...document.querySelectorAll(".admin-tab")];
    tabs.forEach((tab) => tab.addEventListener("click", () => {
        tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
        document.querySelectorAll(".admin-section").forEach((section) => {
            const active = section.id === `tab-${tab.dataset.tab}`;
            section.hidden = !active;
            section.classList.toggle("is-active", active);
        });
        adminMessage.hidden = true;
    }));
};

const uploadIfSelected = async (fileInput, imageInput) => {
    const file = fileInput.files?.[0];
    if (!file) {
        return imageInput.value.trim();
    }
    const result = await uploadImage(file);
    return result.url;
};

const bindImagePreview = (fileId, urlId, previewId) => {
    const fileInput = document.querySelector(`#${fileId}`);
    const urlInput = document.querySelector(`#${urlId}`);
    const preview = document.querySelector(`#${previewId}`);
    urlInput.addEventListener("input", () => showPreview(urlInput, preview));
    fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        showPreview(urlInput, preview, file ? URL.createObjectURL(file) : urlInput.value);
    });
};

document.querySelectorAll(".admin-tab").length && initTabs();
document.querySelector("#add-product-button").addEventListener("click", () => {
    resetProductForm();
    productForm.scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelector("#add-news-button").addEventListener("click", () => {
    resetNewsForm();
    newsForm.scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelector("#cancel-product-edit").addEventListener("click", resetProductForm);
document.querySelector("#cancel-news-edit").addEventListener("click", resetNewsForm);
document.querySelector("#add-page-section-button").addEventListener("click", () => {
    resetPageSectionForm();
    pageSectionForm.scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelector("#cancel-page-section-edit").addEventListener("click", resetPageSectionForm);
document.querySelector("#page-section-filter").addEventListener("change", () => {
    resetPageSectionForm();
    loadPageSections().catch((error) => showAdminMessage(error.message, true));
});
bindImagePreview("product-image-file", "product-image", "product-image-preview");
bindImagePreview("news-image-file", "news-image", "news-image-preview");

productForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = productForm.querySelector('[type="submit"]');
    submit.disabled = true;
    adminMessage.hidden = true;
    try {
        const formData = new FormData(productForm);
        const imageUrl = await uploadIfSelected(document.querySelector("#product-image-file"), productForm.elements.namedItem("image"));
        const product = {
            name: formData.get("name"),
            category: formData.get("category"),
            price: formData.get("price") || null,
            image: imageUrl,
            description: formData.get("description"),
            sizes: formData.get("sizes"),
            fabric: formData.get("fabric"),
            isNew: productForm.elements.namedItem("isNew").checked,
            published: productForm.elements.namedItem("published").checked
        };
        const id = formData.get("id");
        await api(id ? `/api/admin/products/${encodeURIComponent(id)}` : "/api/admin/products", {
            method: id ? "PUT" : "POST",
            body: JSON.stringify(product)
        });
        await loadProducts();
        resetProductForm();
        showAdminMessage("Платье сохранено.");
    } catch (error) {
        showAdminMessage(error.message, true);
    } finally {
        submit.disabled = false;
    }
});

newsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = newsForm.querySelector('[type="submit"]');
    submit.disabled = true;
    adminMessage.hidden = true;
    try {
        const formData = new FormData(newsForm);
        const image = await uploadIfSelected(document.querySelector("#news-image-file"), newsForm.elements.namedItem("image"));
        const article = {
            title: formData.get("title"),
            excerpt: formData.get("excerpt"),
            body: formData.get("body"),
            image,
            published: newsForm.elements.namedItem("published").checked
        };
        const id = formData.get("id");
        await api(id ? `/api/admin/news/${encodeURIComponent(id)}` : "/api/admin/news", {
            method: id ? "PUT" : "POST",
            body: JSON.stringify(article)
        });
        await loadNews();
        resetNewsForm();
        showAdminMessage("Публикация сохранена.");
    } catch (error) {
        showAdminMessage(error.message, true);
    } finally {
        submit.disabled = false;
    }
});

pageSectionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = pageSectionForm.querySelector('[type="submit"]');
    submit.disabled = true;
    adminMessage.hidden = true;
    try {
        const formData = new FormData(pageSectionForm);
        const section = {
            pageKey: formData.get("pageKey"),
            title: formData.get("title"),
            body: formData.get("body"),
            sortOrder: formData.get("sortOrder"),
            published: pageSectionForm.elements.namedItem("published").checked
        };
        const id = formData.get("id");
        await api(id ? `/api/admin/page-content/${encodeURIComponent(id)}` : "/api/admin/page-content", {
            method: id ? "PUT" : "POST",
            body: JSON.stringify(section)
        });
        document.querySelector("#page-section-filter").value = section.pageKey;
        await loadPageSections();
        resetPageSectionForm();
        showAdminMessage("Текстовый блок сохранён.");
    } catch (error) {
        showAdminMessage(error.message, true);
    } finally {
        submit.disabled = false;
    }
});

settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = settingsForm.querySelector('[type="submit"]');
    submit.disabled = true;
    adminMessage.hidden = true;
    try {
        const formData = new FormData(settingsForm);
        const settings = Object.fromEntries(formData.entries());
        await api("/api/admin/settings", { method: "PUT", body: JSON.stringify(settings) });
        showAdminMessage("Контактная информация сохранена.");
    } catch (error) {
        showAdminMessage(error.message, true);
    } finally {
        submit.disabled = false;
    }
});

document.querySelector("#logout-button").addEventListener("click", async () => {
    try {
        await api("/api/admin/logout", { method: "POST" });
        location.replace("/admin/login.html");
    } catch (error) {
        showAdminMessage(error.message, true);
    }
});

const startDashboard = async () => {
    const session = await api("/api/admin/session");
    if (!session.authenticated) {
        location.replace("/admin/login.html");
        return;
    }
    csrfToken = session.csrfToken;
    document.querySelector("#admin-email").textContent = session.email;
    const results = await Promise.allSettled([loadProducts(), loadNews(), loadPageSections(), loadSettings()]);
    const failure = results.find((result) => result.status === "rejected");
    if (failure) {
        showAdminMessage(failure.reason.message, true);
    }
};

startDashboard().catch((error) => showAdminMessage(error.message, true));
