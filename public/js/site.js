(() => {
    const request = async (url, options = {}) => {
        const response = await fetch(url, {
            headers: { Accept: "application/json", ...options.headers },
            ...options
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || "Не удалось загрузить данные. Попробуйте позже.");
        }
        return data;
    };

    const categoryLabels = {
        bridal: "Свадебное платье",
        modest: "Закрытый крой",
        evening: "Вечерний образ",
        accessories: "Аксессуар"
    };

    const formatDate = (value) => {
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? ""
            : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date);
    };

    const formatPrice = (value) => {
        if (value === null || value === undefined || value === "") {
            return "Цена по запросу";
        }
        return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value)} сом`;
    };

    const message = (parent, title, description) => {
        const state = document.createElement("div");
        state.className = "empty-state";
        const heading = document.createElement("h3");
        heading.textContent = title;
        const text = document.createElement("p");
        text.textContent = description;
        state.append(heading, text);
        parent.replaceChildren(state);
    };

    const productCard = (product) => {
        const article = document.createElement("article");
        article.className = "product-card";
        const link = document.createElement("a");
        link.className = "product-card-link";
        link.href = `/dress.html?id=${encodeURIComponent(product.id)}`;
        const photo = document.createElement("div");
        photo.className = "product-card-photo";
        const image = document.createElement("img");
        image.src = product.image;
        image.alt = product.name;
        image.loading = "lazy";
        image.decoding = "async";
        const badge = document.createElement("span");
        if (product.is_new) {
            badge.className = "product-label";
            badge.textContent = "Новинка";
            photo.append(badge);
        }
        photo.append(image);
        const info = document.createElement("div");
        info.className = "product-card-info";
        const name = document.createElement("h3");
        name.textContent = product.name;
        const price = document.createElement("span");
        price.className = "product-price";
        price.textContent = formatPrice(product.price);
        info.append(name, price);
        const category = document.createElement("p");
        category.className = "product-category";
        category.textContent = categoryLabels[product.category] || "";
        link.append(photo, info, category);
        article.append(link);
        return article;
    };

    const newsCard = (article) => {
        const card = document.createElement("article");
        card.className = "news-card";
        const link = document.createElement("a");
        link.className = "news-card-link";
        link.href = `/news-item.html?id=${encodeURIComponent(article.id)}`;
        if (article.image) {
            const imageWrap = document.createElement("div");
            imageWrap.className = "news-card-image";
            const image = document.createElement("img");
            image.src = article.image;
            image.alt = "";
            image.loading = "lazy";
            image.decoding = "async";
            imageWrap.append(image);
            link.append(imageWrap);
        }
        const copy = document.createElement("div");
        copy.className = "news-card-copy";
        const date = document.createElement("time");
        date.className = "news-date";
        date.dateTime = article.created_at;
        date.textContent = formatDate(article.created_at);
        const title = document.createElement("h3");
        title.textContent = article.title;
        const excerpt = document.createElement("p");
        excerpt.textContent = article.excerpt;
        const arrow = document.createElement("span");
        arrow.className = "news-card-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "→";
        copy.append(date, title, excerpt, arrow);
        link.append(copy);
        card.append(link);
        return card;
    };

    const setError = (element, text) => {
        element.replaceChildren();
        const error = document.createElement("p");
        error.className = "empty-state";
        error.textContent = text;
        element.append(error);
    };

    const safePhoneLink = (value) => value.replace(/[^\d+]/g, "");

    const addFooterLink = (parent, text, href, external = false) => {
        if (!href) {
            return;
        }
        const link = document.createElement("a");
        link.textContent = text;
        link.href = href;
        if (external) {
            link.target = "_blank";
            link.rel = "noreferrer";
        }
        parent.append(link);
    };

    const renderFooter = (settings) => {
        const footer = document.querySelector(".site-footer");
        if (!footer) {
            return;
        }
        const main = document.createElement("div");
        main.className = "container footer-main";
        const brand = document.createElement("a");
        brand.className = "brand footer-brand";
        brand.href = "/";
        brand.setAttribute("aria-label", "AINAZIK — главная");
        const logo = document.createElement("img");
        logo.src = "/assets/logo-ainazik.png";
        logo.alt = "AINAZIK";
        brand.append(logo);
        main.append(brand);

        const address = document.createElement("div");
        address.className = "footer-column";
        const addressLabel = document.createElement("span");
        addressLabel.textContent = "Салон";
        address.append(addressLabel);
        if (settings.city) {
            const city = document.createElement("span");
            city.textContent = settings.city;
            address.append(city);
        }
        if (settings.address) {
            const addressText = document.createElement("span");
            addressText.textContent = settings.address;
            address.append(addressText);
        }
        if (settings.hours) {
            const hours = document.createElement("span");
            hours.textContent = settings.hours;
            address.append(hours);
        }
        main.append(address);

        const contact = document.createElement("div");
        contact.className = "footer-column";
        const contactLabel = document.createElement("span");
        contactLabel.textContent = "Связаться";
        contact.append(contactLabel);
        if (settings.phone) {
            addFooterLink(contact, settings.phone, `tel:${safePhoneLink(settings.phone)}`);
        }
        if (settings.whatsapp) {
            const digits = safePhoneLink(settings.whatsapp).replace(/\D/g, "");
            if (digits) {
                addFooterLink(contact, "WhatsApp", `https://wa.me/${digits}`, true);
            }
        }
        if (settings.instagram) {
            addFooterLink(contact, "Instagram", settings.instagram, true);
        }
        main.append(contact);

        const nav = document.createElement("div");
        nav.className = "footer-column";
        const navLabel = document.createElement("span");
        navLabel.textContent = "AINAZIK";
        nav.append(navLabel);
        [["Коллекция", "/catalog.html"], ["О салоне", "/about.html"], ["Новости", "/news.html"], ["Контакты", "/contacts.html"]]
            .forEach(([label, href]) => addFooterLink(nav, label, href));
        main.append(nav);

        const bottom = document.createElement("div");
        bottom.className = "footer-bottom container";
        const copyright = document.createElement("p");
        copyright.textContent = `© ${new Date().getFullYear()} AINAZIK`;
        const appointment = document.createElement("a");
        appointment.href = "/contacts.html#appointment";
        appointment.textContent = "Запись на примерку";
        bottom.append(copyright, appointment);
        footer.replaceChildren(main, bottom);
    };

    const menuToggle = document.querySelector(".menu-toggle");
    const siteNav = document.querySelector(".site-nav");
    if (menuToggle && siteNav) {
        const closeMenu = () => {
            menuToggle.setAttribute("aria-expanded", "false");
            menuToggle.setAttribute("aria-label", "Открыть меню");
            siteNav.classList.remove("is-open");
            document.body.classList.remove("menu-open");
        };
        menuToggle.addEventListener("click", () => {
            const open = menuToggle.getAttribute("aria-expanded") !== "true";
            menuToggle.setAttribute("aria-expanded", String(open));
            menuToggle.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
            siteNav.classList.toggle("is-open", open);
            document.body.classList.toggle("menu-open", open);
        });
        siteNav.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                closeMenu();
            }
        });
    }

    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver((entries, currentObserver) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                    currentObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });
        document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
    } else {
        document.querySelectorAll(".reveal").forEach((element) => element.classList.add("is-visible"));
    }

    request("/api/settings")
        .then(renderFooter)
        .catch((error) => console.error("Не удалось загрузить настройки сайта:", error));

    window.Ainazik = {
        categoryLabels,
        formatDate,
        formatPrice,
        message,
        newsCard,
        productCard,
        request,
        setError
    };
})();
